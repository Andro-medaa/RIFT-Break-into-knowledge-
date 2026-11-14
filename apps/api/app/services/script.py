"""Script generation service using Gemini to generate instruction-aware spoken scripts linked to bboxes."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Optional

from google import genai

from app.core.config import API_DIR, setting
from app.core.logger import get_logger
from app.schemas.script import ScriptResponse, ScriptSegment
from app.services.ingest import ingestion_service

logger = get_logger("app.services.script")

SCRIPT_MODELS = [
    "gemini-3.5-flash",
    "gemini-3.8-flash",
    "gemini-3-flash-preview",
    "gemini-3.5-flash-lite",
]

_STOPWORDS = frozenset({
    "the", "and", "for", "with", "that", "this", "from", "only", "just", "about",
    "into", "your", "have", "will", "should", "must", "need", "page", "pages",
    "section", "sections", "chapter", "chapters", "part", "parts", "portion",
    "portions", "cover", "covering", "focus", "focused", "explain", "explaining",
    "summary", "summarize", "tone", "style", "sequence", "order", "make", "keep",
    "skip", "exclude", "avoid", "without", "first", "then", "also", "other",
    "related", "linked", "link", "links", "connection", "pdf", "document", "script",
    "read", "reading", "spoken", "voice", "narrate", "narration", "please", "want",
    "like", "more", "less", "brief", "short", "long", "detailed", "detail",
})


@dataclass
class PlannedChunkItem:
    """Single item in a sequenced, potentially cross-linked script plan."""

    chunk_id: str
    role: str = "primary"  # "primary" | "linked_context"
    bridge_note: Optional[str] = None
    chapter_heading: Optional[str] = None


def _normalize_instruction(instruction: Optional[str]) -> Optional[str]:
    if instruction is None:
        return None
    cleaned = instruction.strip()
    return cleaned or None


def _strip_instruction_prefix(text: str) -> str:
    """Remove legacy prepended instruction headers from stored chunk text."""
    return re.sub(r"^\[User Reading Instruction:.*?\]\s*", "", text, flags=re.DOTALL).strip()


def _clean_json_text(raw_text: str) -> str:
    cleaned = raw_text.strip()
    match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if match:
        cleaned = match.group(1).strip()
    elif cleaned.startswith("```"):
        cleaned = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    result: list[str] = []
    i = 0
    n = len(cleaned)
    in_string = False

    while i < n:
        char = cleaned[i]

        if not in_string:
            if char == '"':
                in_string = True
            result.append(char)
            i += 1
            continue

        # Inside JSON string literal
        if char == '"':
            in_string = False
            result.append(char)
            i += 1
            continue

        # Normalize unescaped raw newlines / tabs inside JSON string
        if char == '\n':
            result.append(r'\n')
            i += 1
            continue
        if char == '\r':
            result.append(r'\r')
            i += 1
            continue
        if char == '\t':
            result.append(r'\t')
            i += 1
            continue

        if char == '\\':
            if i + 1 >= n:
                result.append('\\\\')
                i += 1
                continue

            next_char = cleaned[i + 1]

            if next_char == '\\':
                # Already an escaped backslash `\\`
                result.append('\\\\')
                i += 2
                continue

            if next_char == '"':
                # Escaped quote `\"`
                result.append('\\"')
                i += 2
                continue

            if next_char == '/':
                result.append('\\/')
                i += 2
                continue

            if next_char == 'u':
                hex_part = cleaned[i + 2 : i + 6]
                if len(hex_part) == 4 and all(c in "0123456789abcdefABCDEF" for c in hex_part):
                    result.append('\\u' + hex_part)
                    i += 6
                    continue
                else:
                    # Non-unicode escape (e.g. \underbrace, \uparrow, \underline)
                    result.append('\\\\u')
                    i += 2
                    continue

            if next_char in 'bfnrt':
                if i + 2 < n and cleaned[i + 2].isalpha():
                    # LaTeX command starting with [bfnrt] followed by alpha (e.g. \frac, \beta, \theta, \times, \rho, \nabla, \tau, \nu)
                    result.append('\\\\' + next_char)
                    i += 2
                    continue
                else:
                    # Valid JSON control escape (\n, \t, etc.)
                    result.append('\\' + next_char)
                    i += 2
                    continue

            # Any other character (e.g. \alpha, \mathcal, \ , \{, \}, \_, \1, \+)
            result.append('\\\\' + next_char)
            i += 2
            continue

        result.append(char)
        i += 1

    cleaned = "".join(result)
    # Strip trailing commas before closing braces/brackets
    cleaned = re.sub(r",\s*([\]}])", r"\1", cleaned)
    return cleaned.strip()


def _extract_json_objects(text: str) -> list[dict[str, Any]]:
    """Fallback extractor that extracts valid JSON objects when outer brackets are missing or truncated."""
    objs: list[dict[str, Any]] = []
    depth = 0
    start = -1
    in_str = False
    escape = False

    for i, ch in enumerate(text):
        if escape:
            escape = False
            continue
        if ch == '\\':
            escape = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if not in_str:
            if ch == '{':
                if depth == 0:
                    start = i
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0 and start != -1:
                    candidate = text[start : i + 1]
                    try:
                        parsed = json.loads(candidate)
                        if isinstance(parsed, dict):
                            objs.append(parsed)
                    except Exception:
                        pass
                    start = -1
    return objs


def _parse_json_safely(raw_text: str) -> Any:
    """Parse LLM JSON text safely, sanitizing LaTeX backslashes and extracting array/object bounds."""
    cleaned = _clean_json_text(raw_text)
    try:
        return json.loads(cleaned)
    except Exception:
        pass

    arr_match = re.search(r"(\[[\s\S]*\])", cleaned)
    if arr_match:
        try:
            return json.loads(arr_match.group(1))
        except Exception:
            pass

    extracted = _extract_json_objects(cleaned)
    if extracted:
        return extracted

    obj_match = re.search(r"(\{[\s\S]*\})", cleaned)
    if obj_match:
        try:
            return json.loads(obj_match.group(1))
        except Exception:
            pass

    raise ValueError(f"Could not parse valid JSON from LLM output: {cleaned[:180]}...")


def _extract_page_filters(instruction: str) -> set[int]:
    """Parse explicit page numbers and page ranges (e.g. 'page 3', 'pages 2-4', 'p. 5')."""
    pages: set[int] = set()
    for match in re.finditer(
        r"\b(?:pages?|pg\.?|p\.?)\s*(\d+)\s*(?:[-–to]+\s*(\d+))?",
        instruction,
        flags=re.IGNORECASE,
    ):
        start = int(match.group(1))
        end = int(match.group(2)) if match.group(2) else start
        lo, hi = min(start, end), min(max(start, end), min(start, end) + 200)
        for p in range(lo, hi + 1):
            if p >= 1:
                pages.add(p)
    return pages


def _extract_keywords(text: str) -> set[str]:
    tokens = re.findall(r"[a-zA-Z0-9][a-zA-Z0-9_-]{2,}", text.lower())
    return {t for t in tokens if len(t) >= 4 and t not in _STOPWORDS}


class ScriptService:
    """Generates instruction-aware natural spoken script segments linked to PDF bounding boxes."""

    def __init__(self, data_dir: Optional[Path] = None) -> None:
        self._data_dir = data_dir

    @property
    def cache_dir(self) -> Path:
        base = self._data_dir or (API_DIR / "data")
        path = base / "script_cache"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @property
    def instruction_dir(self) -> Path:
        base = self._data_dir or (API_DIR / "data")
        path = base / "doc_instructions"
        path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    def _safe_doc_id(document_id: str) -> str:
        return re.sub(r"[^a-zA-Z0-9_-]", "_", document_id)

    def _instruction_file(self, document_id: str) -> Path:
        return self.instruction_dir / f"{self._safe_doc_id(document_id)}.json"

    def save_document_instruction(
        self,
        document_id: str,
        owner_id: str,
        instruction: Optional[str],
    ) -> Optional[str]:
        """Persist or clear the home-page / user instruction for a document."""
        cleaned = _normalize_instruction(instruction)
        path = self._instruction_file(document_id)
        if not cleaned:
            path.unlink(missing_ok=True)
            return None
        payload = {
            "document_id": document_id,
            "owner_id": owner_id,
            "instruction": cleaned,
        }
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        return cleaned

    def get_document_instruction(
        self,
        document_id: str,
        owner_id: str,
    ) -> Optional[str]:
        """Retrieve the persisted instruction for an owner-scoped document."""
        path = self._instruction_file(document_id)
        if not path.exists():
            return None
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            if data.get("owner_id") and data.get("owner_id") != owner_id:
                return None
            return _normalize_instruction(data.get("instruction"))
        except Exception as exc:
            logger.warning(f"Failed to read instruction for doc={document_id}: {exc}")
            return None

    def clear_document_artifacts(self, document_id: str) -> None:
        """Remove persisted instruction and cached scripts when deleting a document."""
        safe_id = self._safe_doc_id(document_id)
        self._instruction_file(document_id).unlink(missing_ok=True)
        for cache_path in self.cache_dir.glob(f"{safe_id}_*.json"):
            cache_path.unlink(missing_ok=True)

    def _get_cache_file(
        self,
        document_id: str,
        language: str,
        voice_style: str,
        instruction: Optional[str],
    ) -> Path:
        safe_id = self._safe_doc_id(document_id)
        if instruction:
            digest = hashlib.sha256(instruction.encode("utf-8")).hexdigest()[:12]
            return self.cache_dir / f"{safe_id}_{language}_{voice_style}_{digest}.json"
        return self.cache_dir / f"{safe_id}_{language}_{voice_style}.json"

    def _split_fallback_text(self, text: str, max_words: int = 25) -> list[str]:
        """Split raw text into natural 1-2 sentence chunks for fallback."""
        raw_sentences = re.split(r"(?<=[.!?])\s+", text.strip())
        segments: list[str] = []
        current: list[str] = []
        current_len = 0

        for s in raw_sentences:
            s_clean = s.strip()
            if not s_clean:
                continue
            word_count = len(s_clean.split())
            if current_len + word_count <= max_words or not current:
                current.append(s_clean)
                current_len += word_count
            else:
                segments.append(" ".join(current))
                current = [s_clean]
                current_len = word_count

        if current:
            segments.append(" ".join(current))
        return segments if segments else [text.strip()]

    def _extract_heading(self, chunk: dict[str, Any]) -> Optional[str]:
        """Extract chapter, section, or topic heading if present in chunk metadata or text."""
        sec_path = chunk.get("section_path")
        if sec_path and isinstance(sec_path, list) and len(sec_path) > 0:
            heading = sec_path[-1]
            if heading and isinstance(heading, str) and len(heading.strip()) > 1:
                return heading.strip()

        raw_text = _strip_instruction_prefix(chunk.get("content") or "")
        first_line = raw_text.split("\n")[0].strip() if raw_text else ""

        if chunk.get("chunk_type") == "heading" and first_line:
            return first_line[:80].strip()

        if first_line and 3 < len(first_line) < 65:
            if not first_line.endswith((".", ";", ":", ",")):
                return first_line
            if first_line.endswith(":") and len(first_line) < 50:
                return first_line[:-1].strip()

        if first_line and len(first_line) < 80:
            lower = first_line.lower()
            if any(
                lower.startswith(prefix)
                for prefix in (
                    "chapter ", "section ", "part ", "module ", "unit ",
                    "v0", "v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10",
                )
            ):
                return first_line.split("—")[0].split("-")[0].strip()

        return None

    async def _call_gemini_text(self, client: genai.Client, prompt: str) -> Optional[str]:
        for m_name in SCRIPT_MODELS:
            try:
                resp = await client.aio.models.generate_content(
                    model=m_name,
                    contents=prompt,
                )
                if resp and resp.text:
                    return resp.text
            except Exception as err:
                logger.warning(f"Script generation model {m_name} error: {err}")
        return None

    def _heuristic_plan_for_instruction(
        self,
        text_chunks: list[dict[str, Any]],
        instruction: str,
    ) -> tuple[list[PlannedChunkItem], str]:
        """Deterministic instruction planner fallback when LLM planning is unavailable."""
        lower = instruction.lower()
        explicit_pages = _extract_page_filters(instruction)

        # Detect negative/excluded keywords from clauses like "skip X", "exclude X", "without X"
        excluded_terms: set[str] = set()
        for m in re.finditer(
            r"\b(?:skip|exclude|without|omit|ignore|avoid)\s+([^.,;\n]+)",
            lower,
        ):
            excluded_terms.update(_extract_keywords(m.group(1)))

        positive_text = re.sub(
            r"\b(?:skip|exclude|without|omit|ignore|avoid)\s+[^.,;\n]+",
            " ",
            lower,
        )
        focus_keywords = _extract_keywords(positive_text) - excluded_terms

        has_scope_cue = bool(explicit_pages) or bool(excluded_terms) or (
            bool(focus_keywords)
            and any(
                cue in lower
                for cue in (
                    "only", "just", "focus", "about", "cover", "section",
                    "chapter", "topic", "part", "portion", "from ",
                )
            )
        )

        selected_ids: list[str] = []
        roles: dict[str, str] = {}
        bridges: dict[str, str] = {}

        if has_scope_cue:
            primary_chunks: list[dict[str, Any]] = []
            for c in text_chunks:
                content_lower = (c.get("content") or "").lower()
                heading_lower = (self._extract_heading(c) or "").lower()
                combined = f"{heading_lower} {content_lower}"

                if excluded_terms and any(term in combined for term in excluded_terms):
                    if c.get("page_number") not in explicit_pages:
                        continue

                page_match = bool(explicit_pages) and c.get("page_number") in explicit_pages
                kw_match = bool(focus_keywords) and any(kw in combined for kw in focus_keywords)

                if (explicit_pages and page_match) or (not explicit_pages and kw_match) or (explicit_pages and focus_keywords and page_match and kw_match):
                    primary_chunks.append(c)

            if not primary_chunks and focus_keywords:
                for c in text_chunks:
                    combined = f"{(self._extract_heading(c) or '').lower()} {(c.get('content') or '').lower()}"
                    if excluded_terms and any(t in combined for t in excluded_terms):
                        continue
                    if any(kw in combined for kw in focus_keywords):
                        primary_chunks.append(c)

            if not primary_chunks:
                primary_chunks = list(text_chunks)

            primary_ids = {c["id"] for c in primary_chunks}

            # Smart non-rigid cross-portion linking: find terms shared with primary chunks
            primary_terms: dict[str, int] = {}
            for c in primary_chunks:
                for tok in _extract_keywords(c.get("content") or ""):
                    primary_terms[tok] = primary_terms.get(tok, 0) + 1
            distinctive_terms = {t for t, cnt in primary_terms.items() if cnt >= 1 and len(t) >= 5}

            linked_ids: set[str] = set()
            if len(primary_chunks) < len(text_chunks) and distinctive_terms:
                for c in text_chunks:
                    cid = c["id"]
                    if cid in primary_ids:
                        continue
                    combined = f"{(self._extract_heading(c) or '').lower()} {(c.get('content') or '').lower()}"
                    if excluded_terms and any(t in combined for t in excluded_terms):
                        continue
                    c_terms = _extract_keywords(combined)
                    overlap = sorted(distinctive_terms & c_terms)
                    if len(overlap) >= 2:
                        linked_ids.add(cid)
                        bridges[cid] = f"Connected context sharing concepts: {', '.join(overlap[:3])}"

            for c in text_chunks:
                cid = c["id"]
                if cid in primary_ids:
                    selected_ids.append(cid)
                    roles[cid] = "primary"
                elif cid in linked_ids:
                    selected_ids.append(cid)
                    roles[cid] = "linked_context"
        else:
            for c in text_chunks:
                content_lower = f"{(self._extract_heading(c) or '').lower()} {(c.get('content') or '').lower()}"
                if excluded_terms and any(term in content_lower for term in excluded_terms):
                    continue
                selected_ids.append(c["id"])
                roles[c["id"]] = "primary"

        if "reverse" in lower or "backwards" in lower:
            selected_ids.reverse()

        chunk_lookup = {c["id"]: c for c in text_chunks}
        items = [
            PlannedChunkItem(
                chunk_id=cid,
                role=roles.get(cid, "primary"),
                bridge_note=bridges.get(cid),
                chapter_heading=self._extract_heading(chunk_lookup[cid]),
            )
            for cid in selected_ids
            if cid in chunk_lookup
        ]
        return items, instruction

    async def _plan_script_with_instruction(
        self,
        client: Optional[genai.Client],
        text_chunks: list[dict[str, Any]],
        instruction: str,
        language: str,
        voice_style: str,
    ) -> tuple[list[PlannedChunkItem], str]:
        """Stage 1 global planner: select, smartly cross-link, and sequence chunks per instruction."""
        chunk_map = {c["id"]: c for c in text_chunks}
        if client is None:
            return self._heuristic_plan_for_instruction(text_chunks, instruction)

        total_chars = sum(len(c.get("content") or "") for c in text_chunks)
        max_preview = 2000 if total_chars <= 80_000 else 600

        outline_payload = [
            {
                "chunk_id": c["id"],
                "doc_index": idx,
                "page": c.get("page_number", 1),
                "type": c.get("chunk_type", "text"),
                "section": self._extract_heading(c),
                "text": (c.get("content") or "")[:max_preview],
            }
            for idx, c in enumerate(text_chunks)
        ]

        planner_prompt = (
            f"You are an expert editorial script planner preparing a spoken-word script plan in {language} "
            f"(default voice preset: {voice_style}).\n\n"
            f"USER INSTRUCTIONS (AUTHORITATIVE):\n{instruction}\n\n"
            "PLANNING RULES:\n"
            "1. Coverage & Scope:\n"
            "   - Do NOT include the entire PDF unless the user's instructions ask for full coverage OR only specify tone/style/language without limiting scope.\n"
            "   - Strictly obey topic, section, page-range, depth, and exclusion instructions.\n"
            "2. Smart Cross-Portion Linking (CRITICAL when the user targets a specific portion, topic, or pages):\n"
            "   - Do NOT be blindly rigid to only the named section/pages.\n"
            "   - Inspect ALL chunks across ALL pages of the document. If a chunk outside the requested portion contains an essential link "
            "(such as prerequisite definitions, notation, core background, referenced figures/tables, or directly connected results/conclusions needed to understand or complete the requested portion), "
            "include it with role='linked_context' and explain the connection concisely in 'bridge_note'.\n"
            "   - Strictly AVOID unrelated chunks from other sections/pages that have no genuine dependency or link to what the user requested.\n"
            "3. Sequence:\n"
            "   - Order 'selected_items' in the exact narrative sequence requested by the user (or logical prerequisite-to-target pedagogical order if unspecified).\n"
            "4. Output Format:\n"
            "   - Return ONLY a valid JSON object (no markdown fences) with:\n"
            "     {\n"
            '       "tone_style_notes": "concise summary of user tone, style, length/depth, and pacing rules",\n'
            '       "selected_items": [\n'
            "         {\n"
            '           "chunk_id": "exact chunk_id from input",\n'
            '           "role": "primary" or "linked_context",\n'
            '           "bridge_note": "brief explanation of why linked_context is needed here, or null",\n'
            '           "chapter_heading": "short clean section title or null"\n'
            "         }\n"
            "       ]\n"
            "     }\n\n"
            f"DOCUMENT CHUNKS ({len(outline_payload)} total):\n{json.dumps(outline_payload, ensure_ascii=False)}"
        )

        try:
            raw = await self._call_gemini_text(client, planner_prompt)
            if not raw:
                return self._heuristic_plan_for_instruction(text_chunks, instruction)

            parsed = _parse_json_safely(raw)
            tone_notes = instruction
            raw_items: list[Any] = []
            if isinstance(parsed, dict):
                tone_notes = (parsed.get("tone_style_notes") or instruction).strip()
                raw_items = parsed.get("selected_items") or []
            elif isinstance(parsed, list):
                raw_items = parsed

            seen_ids: set[str] = set()
            planned: list[PlannedChunkItem] = []
            for entry in raw_items:
                if not isinstance(entry, dict):
                    continue
                cid = entry.get("chunk_id")
                if not cid or cid not in chunk_map or cid in seen_ids:
                    continue
                seen_ids.add(cid)
                role = entry.get("role") if entry.get("role") in ("primary", "linked_context") else "primary"
                bridge_note = (entry.get("bridge_note") or "").strip() or None
                heading = (entry.get("chapter_heading") or "").strip() or self._extract_heading(chunk_map[cid])
                planned.append(
                    PlannedChunkItem(
                        chunk_id=cid,
                        role=role,
                        bridge_note=bridge_note,
                        chapter_heading=heading,
                    )
                )

            if planned:
                logger.info(
                    f"Instruction planner selected {len(planned)}/{len(text_chunks)} chunks "
                    f"(linked={sum(1 for p in planned if p.role == 'linked_context')})"
                )
                return planned, tone_notes
        except Exception as exc:
            logger.warning(f"Instruction script planner exception: {exc}, using heuristic planner")

        return self._heuristic_plan_for_instruction(text_chunks, instruction)

    def _fallback_segments_for_items(
        self,
        items: list[PlannedChunkItem],
        chunk_map: dict[str, dict[str, Any]],
    ) -> list[ScriptSegment]:
        segments: list[ScriptSegment] = []
        for item in items:
            c = chunk_map.get(item.chunk_id)
            if not c:
                continue
            raw_text = (c.get("content") or "").strip()
            if not raw_text:
                continue
            # Strip raw Unicode math brace decorators (⏞, ⏟) that look like weird faces
            raw_text = re.sub(r'[\u23de\u23df\u23dc\u23dd\u23b4\u23b5]', '', raw_text)
            # Expand squashed variable subscripts (e.g. Hstatic -> H static, Hdynamic -> H dynamic, zstatic -> z static)
            raw_text = re.sub(r'\b([A-Za-z])(?:_)?(static|dynamic|total|ortho|jepa|mae|sim|loss|pred|target|init|corr|cov|var)\b', r'\1 \2', raw_text)
            raw_text = re.sub(r'\s{2,}', ' ', raw_text).strip()
            heading = item.chapter_heading or self._extract_heading(c)
            splits = self._split_fallback_text(raw_text, max_words=25)
            for s_idx, s_text in enumerate(splits):
                segments.append(
                    ScriptSegment(
                        id=f"seg_{c['id']}_{s_idx}",
                        chunk_id=c["id"],
                        segment_index=s_idx,
                        text=s_text,
                        page_number=c.get("page_number", 1),
                        bbox=c.get("bbox"),
                        chapter_heading=heading if s_idx == 0 else None,
                        chunk_type=c.get("chunk_type", "text"),
                        image_url=c.get("image_url"),
                    )
                )
        return segments

    @staticmethod
    def _build_tone_prompt_rules(instruction: Optional[str]) -> str:
        """Build additional prompt rules based on tone keywords in the instruction."""
        if not instruction:
            return ""
        lower = instruction.lower()
        extra = ""
        if "storytelling" in lower:
            extra += (
                "STORYTELLING MODE RULES:\n"
                "- Open with a compelling hook or question that draws listeners in.\n"
                "- Use vivid analogies and metaphors to explain complex concepts.\n"
                "- Vary pacing: slow down for key revelations, speed up for momentum.\n"
                "- Build a narrative arc with setup, tension, and satisfying resolution.\n"
                "- Use dramatic reveals when presenting surprising data or conclusions.\n\n"
            )
        if "emotional" in lower or "expressive" in lower:
            extra += (
                "EXPRESSIVE VOICE CUES RULES:\n"
                "- Naturally weave voice expression cues at conversational moments: "
                "[laughs], [sighs], [excited], [whispers].\n"
                "- Use [excited] before enthusiastic revelations or positive results.\n"
                "- Use [whispers] for dramatic effect when sharing secrets or surprising facts.\n"
                "- Use [sighs] for reflective or somber moments.\n"
                "- Use [laughs] for light-hearted asides or relatable observations.\n"
                "- Keep cues sparse and natural — at most 1-2 per segment.\n\n"
            )
        return extra

    async def _generate_segments_from_plan(
        self,
        client: genai.Client,
        planned_items: list[PlannedChunkItem],
        chunk_map: dict[str, dict[str, Any]],
        instruction: str,
        tone_style_notes: str,
        voice_style: str,
        language: str,
    ) -> list[ScriptSegment]:
        """Stage 2 narrator: convert only the planned, ordered chunks into custom-styled spoken segments."""
        batch_size = 12
        generated_segments: list[ScriptSegment] = []
        previous_tail = ""

        for batch_start in range(0, len(planned_items), batch_size):
            batch_items = planned_items[batch_start:batch_start + batch_size]
            input_payload = []
            for item in batch_items:
                c = chunk_map[item.chunk_id]
                input_payload.append(
                    {
                        "chunk_id": item.chunk_id,
                        "page": c.get("page_number", 1),
                        "type": c.get("chunk_type", "text"),
                        "section": item.chapter_heading or self._extract_heading(c),
                        "role": item.role,
                        "bridge_note": item.bridge_note,
                        "text": (c.get("content") or "").strip(),
                    }
                )

            continuity_block = (
                f"Previous spoken line (continue seamlessly from here):\n\"{previous_tail}\"\n\n"
                if previous_tail
                else ""
            )

            prompt = (
                f"You are an adaptive professional narrator crafting a spoken-word script in {language}.\n"
                f"Base voice preset: {voice_style}.\n\n"
                f"USER INSTRUCTIONS (FOLLOW FAITHFULLY):\n{instruction}\n\n"
                f"EDITORIAL STYLE & TONE PLAN:\n{tone_style_notes}\n\n"
                f"{continuity_block}"
                "SCRIPT GENERATION RULES:\n"
                "1. Strictly adopt the user's requested tone, style, pacing, depth/length, and persona. "
                "(If no length preference was specified, keep each chunk to 1-3 natural spoken sentences.)\n"
                "2. Follow the EXACT item sequence given in the input list so the user's requested flow is preserved.\n"
                "3. For items with role='linked_context', smoothly explain how this related portion/page connects to the user's main focus using its bridge_note, rather than dropping it in abruptly.\n"
                "4. Retain the exact chunk_id for each generated segment so it stays linked to its PDF bounding box.\n"
                "5. SPOKEN ENGLISH/LANGUAGE PLAIN TEXT ONLY: strictly NO markdown (**bold**, # headers, * bullets), NO numbered lists, NO citation brackets like [1], NO code fences.\n"
                "6. Provide a concise 'chapter_heading' when starting a section or linked transition, otherwise ongoing heading or null.\n"
                "7. CRITICAL FOR MATHEMATICAL NOTATION & VARIABLES:\n"
                "   - PDF text extractors frequently squash variable subscripts together (e.g. 'Hstatic', 'Hdynamic', 'zstatic', 'Lortho', 'Ltotal', 'x1', 'x2', 'pϕ').\n"
                "   - You MUST identify all mathematical expressions, variables, and formulas and output them in standard LaTeX with natural spoken pronunciations immediately after in parentheses: e.g. '$H_{static}$ (H static)', '$H(k, t)$ (H of k and t)', '$z_{dynamic}$ (z dynamic)', '$L_{ortho}$ (L ortho)'.\n"
                "   - NEVER output raw unformatted variable names like 'Hstatic' or 'Hdynamic'.\n"
                "   - Cleanly omit visual PDF diagram artifacts such as overbrace and underbrace characters (⏞, ⏟) and instead explain the equation naturally.\n"
                "8. FOR FIGURES, DIAGRAMS & IMAGES (type='image' or content begins with [Figure ...]):\n"
                "   - Direct the listener's eyes smoothly to the visual diagram on screen (e.g. 'Looking at the diagram on page 2, this illustrates...' or 'As shown in Figure 1...').\n"
                "   - Synthesize and explain the diagram's structure clearly using its caption and OCR labels so the listener understands the key visual elements while looking at the highlighted bounding box.\n"
                "   - Keep chunk_id linked so the image bounding box highlights on the document canvas during dictation.\n"
                "9. For chemical formulas like H2O, CO2, write as `$H_2O$ (H 2 O)`, `$CO_2$ (C O 2)` in the script.\n"
                + self._build_tone_prompt_rules(instruction)
                + "10. Return ONLY a valid JSON array of objects with keys: chunk_id, segment_index, text, chapter_heading.\n\n"
                f"Planned Chunks:\n{json.dumps(input_payload, ensure_ascii=False)}"
            )

            batch_segments: list[ScriptSegment] = []
            try:
                raw = await self._call_gemini_text(client, prompt)
                if raw:
                    parsed_json = _parse_json_safely(raw)
                    if isinstance(parsed_json, list):
                        for seg_order, seg_obj in enumerate(parsed_json):
                            if not isinstance(seg_obj, dict):
                                continue
                            cid = seg_obj.get("chunk_id")
                            seg_text = (seg_obj.get("text") or "").strip()
                            seg_idx = seg_obj.get("segment_index", seg_order)
                            ch_heading = seg_obj.get("chapter_heading")
                            if cid in chunk_map and seg_text:
                                c = chunk_map[cid]
                                heading_to_use = ch_heading or self._extract_heading(c)
                                batch_segments.append(
                                    ScriptSegment(
                                        id=f"seg_{cid}_{seg_idx}",
                                        chunk_id=cid,
                                        segment_index=seg_idx,
                                        text=seg_text,
                                        page_number=c.get("page_number", 1),
                                        bbox=c.get("bbox"),
                                        chapter_heading=heading_to_use,
                                        chunk_type=c.get("chunk_type", "text"),
                                        image_url=c.get("image_url"),
                                    )
                                )
            except Exception as exc:
                logger.warning(f"Stage 2 instruction script batch error: {exc}, using batch fallback")

            if not batch_segments:
                batch_segments = self._fallback_segments_for_items(batch_items, chunk_map)

            if batch_segments:
                previous_tail = batch_segments[-1].text[-240:]
                generated_segments.extend(batch_segments)

        return generated_segments

    async def _generate_default_full_segments(
        self,
        client: genai.Client,
        text_chunks: list[dict[str, Any]],
        chunk_map: dict[str, dict[str, Any]],
        voice_style: str,
        language: str,
    ) -> list[ScriptSegment]:
        """Default full-PDF sequential script generation when no user instruction is set."""
        batch_size = 15
        generated_segments: list[ScriptSegment] = []

        for batch_start in range(0, len(text_chunks), batch_size):
            batch = text_chunks[batch_start:batch_start + batch_size]
            input_payload = [
                {
                    "chunk_id": c["id"],
                    "page": c.get("page_number", 1),
                    "type": c.get("chunk_type", "text"),
                    "section": self._extract_heading(c),
                    "text": (c.get("content") or "").strip(),
                }
                for c in batch
            ]

            prompt = (
                f"You are a professional educational narrator creating a spoken-word script in {language}.\n"
                f"Voice style: {voice_style}.\n"
                "Instructions:\n"
                "1. Convert each document chunk into 1-2 natural, highly engaging spoken-word sentences.\n"
                "2. Ensure the spoken narration is accurate to the chunk's content, fluid to listen to, and educational.\n"
                "3. Retain the exact chunk_id for each segment so it links to the PDF bounding box.\n"
                "4. Identify chapter or section titles: if a chunk introduces or represents a chapter/section heading, "
                "provide a short descriptive title in 'chapter_heading' (e.g. 'Chapter 1: The Core Physics Problem' or 'Dataset Overview'). "
                "If it continues an existing section without a new title, provide the ongoing chapter title or null.\n"
                "5. CRITICAL FOR MATHEMATICAL NOTATION & VARIABLES:\n"
                "   - PDF text extractors frequently squash variable subscripts together (e.g. 'Hstatic', 'Hdynamic', 'zstatic', 'Lortho', 'Ltotal', 'x1', 'x2', 'pϕ').\n"
                "   - You MUST identify all mathematical expressions, variables, and formulas and output them in standard LaTeX with natural spoken pronunciations immediately after in parentheses: e.g. '$H_{static}$ (H static)', '$H(k, t)$ (H of k and t)', '$z_{dynamic}$ (z dynamic)', '$L_{ortho}$ (L ortho)'.\n"
                "   - NEVER output raw unformatted variable names like 'Hstatic' or 'Hdynamic'.\n"
                "   - Cleanly omit visual PDF diagram artifacts such as overbrace and underbrace characters (⏞, ⏟) and instead explain the equation naturally.\n"
                "6. For chemical formulas like H2O, CO2, write as `$H_2O$ (H 2 O)`, `$CO_2$ (C O 2)` in the script.\n"
                "7. FOR FIGURES, DIAGRAMS & IMAGES (type='image' or content begins with [Figure ...]):\n"
                "   - Direct the listener's eyes smoothly to the visual diagram on screen (e.g. 'Looking at the diagram on page 2, this illustrates...' or 'As shown in Figure 1...').\n"
                "   - Synthesize and explain the diagram's structure clearly using its caption and OCR labels so the listener understands the key visual elements while looking at the highlighted bounding box.\n"
                "   - Keep chunk_id linked so the image bounding box highlights on the document canvas during dictation.\n"
                "8. Return ONLY a valid JSON array of objects with keys: chunk_id, segment_index, text, chapter_heading.\n"
                "9. Strictly no markdown commentary, no code fences.\n\n"
                f"Chunks:\n{json.dumps(input_payload, ensure_ascii=False)}"
            )

            try:
                raw = await self._call_gemini_text(client, prompt)
                if not raw:
                    raise ValueError("No response received from LLM")

                parsed_json = _parse_json_safely(raw)
                if isinstance(parsed_json, list):
                    for item in parsed_json:
                        cid = item.get("chunk_id")
                        seg_text = item.get("text", "").strip()
                        seg_idx = item.get("segment_index", 0)
                        ch_heading = item.get("chapter_heading")
                        if cid in chunk_map and seg_text:
                            c = chunk_map[cid]
                            heading_to_use = ch_heading or self._extract_heading(c)
                            generated_segments.append(
                                ScriptSegment(
                                    id=f"seg_{cid}_{seg_idx}",
                                    chunk_id=cid,
                                    segment_index=seg_idx,
                                    text=seg_text,
                                    page_number=c.get("page_number", 1),
                                    bbox=c.get("bbox"),
                                    chapter_heading=heading_to_use,
                                    chunk_type=c.get("chunk_type", "text"),
                                    image_url=c.get("image_url"),
                                )
                            )
            except Exception as batch_err:
                logger.warning(f"Batch at index {batch_start} LLM error ({batch_err}), applying fallback for this batch only")
                batch_plan = [
                    PlannedChunkItem(chunk_id=c["id"], chapter_heading=self._extract_heading(c))
                    for c in batch
                ]
                generated_segments.extend(self._fallback_segments_for_items(batch_plan, chunk_map))

        return generated_segments

    @staticmethod
    def _apply_content_filter(
        chunks: list[dict[str, Any]],
        content_filter: Optional[str],
    ) -> list[dict[str, Any]]:
        """Filter chunks by content_filter: 'images_only', 'tables_only', or 'all' (default)."""
        if not content_filter or content_filter == "all":
            return chunks
        if content_filter == "images_only":
            return [
                c for c in chunks
                if c.get("chunk_type") in ("image", "figure", "diagram") or c.get("image_url")
            ]
        if content_filter == "tables_only":
            return [
                c for c in chunks
                if c.get("chunk_type") == "table" or c.get("table_markdown")
            ]
        return chunks

    async def generate_script(
        self,
        document_id: str,
        owner_id: str,
        voice_style: str = "natural",
        language: str = "en",
        force_regenerate: bool = False,
        fallback_chunks: Optional[list[dict[str, Any]]] = None,
        instruction: Optional[str] = None,
        content_filter: Optional[str] = None,
    ) -> ScriptResponse:
        """Generate dictation script segments linked to document chunks with instruction & disk caching."""
        if instruction is not None:
            cleaned_input = _normalize_instruction(instruction)
            if force_regenerate or cleaned_input is not None:
                effective_instruction = self.save_document_instruction(
                    document_id=document_id,
                    owner_id=owner_id,
                    instruction=cleaned_input,
                )
            else:
                effective_instruction = self.get_document_instruction(document_id, owner_id)
        else:
            effective_instruction = self.get_document_instruction(document_id, owner_id)

        cache_file = self._get_cache_file(document_id, language, voice_style, effective_instruction)

        if force_regenerate and cache_file.exists():
            try:
                cache_file.unlink()
                logger.info(f"Force-deleted script cache for doc={document_id}")
            except Exception as e:
                logger.warning(f"Error deleting script cache: {e}")

        if not force_regenerate and cache_file.exists():
            try:
                cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
                cached_data.setdefault("instruction", effective_instruction)
                logger.info(
                    f"Loaded script from cache for doc={document_id}, lang={language}, "
                    f"instruction_active={bool(effective_instruction)}"
                )
                return ScriptResponse(**cached_data)
            except Exception as e:
                logger.warning(f"Error reading script cache: {e}")

        chunks: list[dict[str, Any]] = []
        try:
            chunks = await ingestion_service.get_document_chunks(document_id=document_id, owner_id=owner_id)
        except Exception as e:
            logger.warning(f"Database get_document_chunks failed ({e}), checking fallback chunks...")

        if not chunks and fallback_chunks:
            logger.info(f"Using {len(fallback_chunks)} fallback paragraphs from client for script generation")
            chunks = [
                {
                    "id": p.get("id", f"p_{i}"),
                    "chunk_index": i,
                    "chunk_type": p.get("chunkType") or p.get("chunk_type") or "text",
                    "content": p.get("text") or p.get("content", ""),
                    "page_number": (p.get("bbox", {}).get("page") if isinstance(p.get("bbox"), dict) else p.get("page", 1)) or 1,
                    "bbox": p.get("bbox") if isinstance(p.get("bbox"), dict) else None,
                    "image_url": p.get("imageUrl") or p.get("image_url"),
                }
                for i, p in enumerate(fallback_chunks)
            ]

        if not chunks:
            return ScriptResponse(document_id=document_id, segments=[], instruction=effective_instruction)

        # Clean any legacy instruction prefix from chunks in-memory
        cleaned_chunks = []
        for c in chunks:
            c_copy = dict(c)
            c_copy["content"] = _strip_instruction_prefix(c.get("content") or "")
            cleaned_chunks.append(c_copy)

        chunk_map: dict[str, dict[str, Any]] = {c["id"]: c for c in cleaned_chunks}
        text_chunks = [c for c in cleaned_chunks if c.get("content") and len(c["content"].strip()) > 3]

        # Apply content_filter before script generation
        text_chunks = self._apply_content_filter(text_chunks, content_filter)

        generated_segments: list[ScriptSegment] = []
        planned_items: Optional[list[PlannedChunkItem]] = None

        if effective_instruction and text_chunks:
            client = genai.Client(api_key=setting.gemini_api_key) if setting.gemini_api_key else None
            planned_items, tone_style_notes = await self._plan_script_with_instruction(
                client=client,
                text_chunks=text_chunks,
                instruction=effective_instruction,
                language=language,
                voice_style=voice_style,
            )
            if client and planned_items:
                generated_segments = await self._generate_segments_from_plan(
                    client=client,
                    planned_items=planned_items,
                    chunk_map=chunk_map,
                    instruction=effective_instruction,
                    tone_style_notes=tone_style_notes,
                    voice_style=voice_style,
                    language=language,
                )
        elif setting.gemini_api_key and text_chunks:
            try:
                client = genai.Client(api_key=setting.gemini_api_key)
                generated_segments = await self._generate_default_full_segments(
                    client=client,
                    text_chunks=text_chunks,
                    chunk_map=chunk_map,
                    voice_style=voice_style,
                    language=language,
                )
            except Exception as e:
                logger.warning(f"Gemini script generation exception: {e}, falling back to chunk sentence splitting")

        # Fallback: preserve selective planned scope if instruction planning ran, otherwise full PDF
        if not generated_segments:
            fallback_plan = planned_items or [
                PlannedChunkItem(chunk_id=c["id"], chapter_heading=self._extract_heading(c))
                for c in text_chunks
            ]
            generated_segments = self._fallback_segments_for_items(fallback_plan, chunk_map)

        resp = ScriptResponse(
            document_id=document_id,
            segments=generated_segments,
            instruction=effective_instruction,
        )
        if generated_segments:
            try:
                cache_file.write_text(resp.model_dump_json(), encoding="utf-8")
                logger.info(
                    f"Cached script for doc={document_id}, segments={len(generated_segments)}, "
                    f"instruction_active={bool(effective_instruction)}"
                )
            except Exception as e:
                logger.warning(f"Error writing script cache: {e}")
        return resp


script_service = ScriptService()
