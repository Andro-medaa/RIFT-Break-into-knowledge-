"""RAG query and citation service using Supabase pgvector hybrid search and Gemini."""

import base64
import re
from typing import Any, Optional
from google import genai
from google.genai import types
import httpx
from sqlalchemy import select, or_

try:
    import pymupdf as fitz
except ImportError:
    import fitz

from app.core.config import setting
from app.core.db import get_db
from app.core.logger import get_logger
from app.ingest.parser import extract_page_text_blocks_with_bboxes
from app.model.document_chunks import document_chunks
from app.services.embedding import embedding_service
from app.services.storage import storage_service

logger = get_logger("app.services.rag")


def extract_target_page(question: str) -> Optional[int]:
    """Extract requested target page number from queries like 'page 4', '4th page', 'fourth page'."""
    word_to_num = {
        "first": 1, "second": 2, "third": 3, "fourth": 4, "fifth": 5,
        "sixth": 6, "seventh": 7, "eighth": 8, "ninth": 9, "tenth": 10,
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    }
    m = re.search(r'\b(\d+)(?:st|nd|rd|th)?\s+page\b', question, re.IGNORECASE)
    if m:
        return int(m.group(1))
    m = re.search(r'\b(?:page|pg|p\.?)\s*(\d+)\b', question, re.IGNORECASE)
    if m:
        return int(m.group(1))
    for word, val in word_to_num.items():
        if re.search(rf'\b{word}\s+page\b|\bpage\s+{word}\b', question, re.IGNORECASE):
            return val
    return None


def parse_length_and_directive(instruction: Optional[str]) -> tuple[Optional[str], str]:
    """Extract optional '[Length: ...]' preset header and remaining freeform user directive."""
    if not instruction:
        return None, ""
    raw = instruction.strip()
    if not raw:
        return None, ""

    match = re.match(
        r"^\[Length:\s*(Concise|Balanced|Detailed)\]\s*(?:\r?\n)?(.*)$",
        raw,
        re.IGNORECASE | re.DOTALL,
    )
    if match:
        return match.group(1).lower(), match.group(2).strip()
    return None, raw


def build_rag_prompts(
    question: str,
    context_str: str,
    history_str: str = "",
    instruction: Optional[str] = None,
    web_search_enabled: bool = False,
) -> tuple[str, str]:
    """Build (system_instruction, user_prompt) with strict user-directive precedence, adaptive length, and voice-safe Markdown."""
    length_mode, custom_directive = parse_length_and_directive(instruction)

    if length_mode == "concise":
        length_rule = (
            "RESPONSE LENGTH (CONCISE PRESET): Keep the answer extra tight and high-signal—"
            "prefer 2–4 crisp sentences (~35–90 words) or at most 3–4 short bullet points, "
            "unless the current question explicitly asks for exhaustive detail."
        )
    elif length_mode == "detailed":
        length_rule = (
            "RESPONSE LENGTH (DETAILED PRESET): Provide a comprehensive, deeply explained, "
            "and well-organized breakdown (~240–480 words) using clear sections, mechanisms, "
            "concrete examples from the source, and page/source citations, while remaining scannable."
        )
    else:
        length_rule = (
            "ADAPTIVE RESPONSE LENGTH (CONCISE-TO-BALANCED DEFAULT):\n"
            "- Simple factual, definition, or single-value questions: answer directly in 2–4 crisp sentences (~40–90 words) with no unnecessary filler.\n"
            "- Conceptual 'how/why' explanations or short summaries: lead with a 1–2 sentence takeaway followed by 3–6 concise bullet points (~110–210 words).\n"
            "- Broad multi-part breakdowns or comparisons: organize into 2–4 short titled sections (`###`), crisp bullets, or a compact Markdown table (~220–380 words), expanding further only if explicitly requested."
        )

    directive_block = ""
    if custom_directive:
        directive_block = f"\nActive Thread User Directive:\n{custom_directive}\n"

    web_tool_section = ""
    if web_search_enabled:
        web_tool_section = (
            "\n\n5. INTERNET ACCESS (`search_internet_tavily` TOOL):\n"
            "- You have live internet search access via `search_internet_tavily`.\n"
            "- First examine the provided PDF document sources and conversation history. If they answer the question completely and accurately, reply directly WITHOUT calling `search_internet_tavily`.\n"
            "- Call `search_internet_tavily` ONLY when the document sources do not contain enough information, when external background, verification, benchmarks, or current/live web facts are needed, or when the user asks to look up outside information (unless the user instructs you to use ONLY the PDF).\n"
            "- Web results returned by `search_internet_tavily` are assigned numbered sources `[N]`. Cite them inline with `[N]` just like PDF bbox sources."
        )

    system_instruction = (
        "You are RIFT, an intelligent document research and reading assistant.\n\n"
        "1. GROUNDING, CITATIONS & ACCURACY:\n"
        "- Synthesize answers directly from the provided PDF and web sources in clear, natural words rather than copying awkward raw OCR blocks.\n"
        "- Cite factual claims inline using square-bracketed numbers matching the exact `[Source N]` numbers ONLY when that specific claim is actually supported by `[Source N]` (e.g., `...reduces latency by 40% [1].` or `...verified across studies [1][3].`). Always use separate single-number brackets like `[1][2]` instead of `[1, 2]`, and never emit internal labels like `[PDF Source 1]`.\n"
        "- NEVER force or fabricate a citation: if the answer comes from general knowledge rather than the retrieved PDF or web sources, emit NO `[N]` citation brackets at all.\n"
        "- Keep spoken phrasing natural without citations: because voice dictation ignores `[N]` brackets, NEVER use `[N]` as a grammatical noun (write `as reported on page 4 [1]` or `according to the documentation [2]`, NOT `see [1]` or `according to [2]`).\n"
        "- If a detail is missing from the provided document and cannot be verified, state clearly what is and isn't supported.\n\n"
        "2. HIGHEST PRIORITY — USER INSTRUCTIONS:\n"
        "- Strictly follow every explicit formatting, structure, length, word/sentence/bullet-count limit, tone, language, or comparison instruction in BOTH the Active Thread User Directive below AND the user's current question (e.g. 'in 3 bullets', 'under 50 words', 'as a table', 'simple analogy', 'no headings').\n"
        "- Explicit user instructions ALWAYS override the default length rules and default Markdown formatting guidelines below.\n"
        f"{directive_block}\n"
        f"3. {length_rule}\n\n"
        "4. VOICE-SAFE MARKDOWN FORMATTING:\n"
        "- Format responses in clean Markdown so they read clearly on screen AND sound fluent when spoken aloud by AI Voice and Browser Speech:\n"
        "  * Use short `##` or `###` headings only for multi-section answers (skip headings on brief 2–4 sentence replies).\n"
        "  * Use `**bold**` sparingly on key terms, flat `-` bullets or `1.` numbered steps (max 2 levels), inline `` `code` `` for symbols/formulas/identifiers, and `>` blockquotes only when quoting notable statements.\n"
        "  * Use compact Markdown tables only for true multi-item comparisons; never emit deeply nested trees, raw HTML tags, ASCII art, emoji clusters, or pasted raw URLs (rely on inline `[N]` citations for web sources).\n"
        "  * Write complete, natural phrasing in headings and list items so spoken narration flows cleanly between points.\n"
        "- Consider recent conversation history for follow-ups and pronoun continuity.\n\n"
        "5. MATHEMATICAL & SCIENTIFIC NOTATION:\n"
        "- When the source contains mathematical expressions, output them using standard LaTeX notation: "
        "inline math with `$...$` and display/block math with `$$...$$`.\n"
        "- Chemical formulas should use LaTeX subscript notation: write H₂O as `$H_2O$`, CO₂ as `$CO_2$`, etc.\n"
        "- Greek letters in scientific contexts should use LaTeX: `$\\alpha$`, `$\\beta$`, `$\\pi$`, etc.\n"
        "- For complex equations (fractions, integrals, matrices), use proper LaTeX commands: "
        "`\\frac{}{}`, `\\int`, `\\sum`, `\\sqrt{}`, etc.\n"
        "- Keep surrounding text natural and readable — the LaTeX is for visual rendering, "
        "while the surrounding words should make the meaning clear when read aloud.\n\n"
        "6. FIGURES, DIAGRAMS & VISUAL CONTENT:\n"
        "- Sources labeled as `Figure` or `Figure / Diagram` contain multimodal descriptions, OCR text labels, and visual captions of diagrams, graphs, flowcharts, architectures, and images in the PDF.\n"
        "- When answering questions about visual elements, figures, diagrams, flowcharts, system architectures, or plots, explain them clearly using the extracted visual labels and captions.\n"
        "- Cite the corresponding figure source directly inline using its `[N]` citation bracket (e.g. `as shown in the architecture diagram on Page 2 [1]`)."
        f"{web_tool_section}"
    )

    user_prompt = (
        f"--- SOURCES ---\n{context_str}"
        f"{history_str}\n\n"
        f"--- CURRENT USER QUESTION (follow any explicit formatting/length requests verbatim) ---\n{question}\n\n"
        "--- ANSWER ---"
    )
    return system_instruction, user_prompt


def build_pdf_citations(chunks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Build structured PDF citation metadata (including bbox coordinates) for retrieved chunks."""
    citations: list[dict[str, Any]] = []
    for idx, chk in enumerate(chunks):
        page = chk.get("page_number", 1)
        chunk_type = chk.get("chunk_type", "text")
        is_figure = chunk_type in ("image", "figure", "diagram") or bool(chk.get("image_url"))
        if is_figure:
            label = f"Page {page} · Figure"
        else:
            label = f"Page {page} · {str(chunk_type).capitalize()}"
        if chk.get("section_path") and len(chk["section_path"]) > 0:
            sec_0 = str(chk["section_path"][0])
            if is_figure and sec_0 in ("Figures", f"Page {page}"):
                label = f"Page {page} · Figure"
            else:
                label = f"Page {page} · {sec_0[:24]}"

        raw_bbox = chk.get("bbox")
        clean_bbox = None
        if isinstance(raw_bbox, dict):
            clean_bbox = {
                "x": float(raw_bbox.get("x", 0)),
                "y": float(raw_bbox.get("y", 0)),
                "w": float(raw_bbox.get("w", 0)),
                "h": float(raw_bbox.get("h", 0)),
            }

        citations.append(
            {
                "id": f"cit-{idx}",
                "number": idx + 1,
                "label": f"§ {label}",
                "page": page,
                "paragraphId": chk.get("id"),
                "bbox": clean_bbox,
                "chunkType": chunk_type,
                "imageUrl": chk.get("image_url"),
                "source": "pdf",
                "snippet": (chk.get("content") or "")[:200],
            }
        )
    return citations


def _build_tavily_tool() -> types.Tool:
    """Create the Gemini FunctionDeclaration tool for conditional Tavily web search."""
    return types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="search_internet_tavily",
                description=(
                    "Search the internet using Tavily for external, complementary, or up-to-date facts "
                    "when the uploaded PDF document sources alone do not completely answer the user's question."
                ),
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "query": types.Schema(
                            type=types.Type.STRING,
                            description="Concise standalone web search query for missing or external information.",
                        ),
                        "max_results": types.Schema(
                            type=types.Type.INTEGER,
                            description="Number of web search results to retrieve (1 to 4, default 3).",
                        ),
                    },
                    required=["query"],
                ),
            )
        ]
    )


_PROTECTED_MD_SEGMENT_RE = re.compile(
    r"(```[\s\S]*?```|`[^`\n]+`|!?\[[^\]]*\]\([^)]+\))"
)
_NUMERIC_BRACKET_RE = re.compile(r"\[(\s*\d+(?:\s*,\s*\d+)*\s*)\]")


def finalize_citations_and_answer(
    answer_text: str,
    candidate_sources: list[dict[str, Any]],
) -> tuple[str, list[dict[str, Any]]]:
    """Renumber inline [N] citations sequentially in order of appearance and align returned citations."""
    if not candidate_sources:
        return answer_text.strip(), []

    max_source = len(candidate_sources)
    orig_to_new: dict[int, int] = {}
    ordered_citations: list[dict[str, Any]] = []

    def _replace_segment(seg: str) -> str:
        def _sub_bracket(match: re.Match[str]) -> str:
            raw_nums = [int(part.strip()) for part in match.group(1).split(",") if part.strip().isdigit()]
            if not raw_nums or not all(1 <= n <= max_source for n in raw_nums):
                return match.group(0)
            parts: list[str] = []
            seen_in_group: set[int] = set()
            for orig_n in raw_nums:
                if orig_n in seen_in_group:
                    continue
                seen_in_group.add(orig_n)
                if orig_n not in orig_to_new:
                    new_n = len(ordered_citations) + 1
                    orig_to_new[orig_n] = new_n
                    src_copy = dict(candidate_sources[orig_n - 1])
                    src_copy["number"] = new_n
                    ordered_citations.append(src_copy)
                parts.append(f"[{orig_to_new[orig_n]}]")
            return "".join(parts)

        return _NUMERIC_BRACKET_RE.sub(_sub_bracket, seg)

    segments = _PROTECTED_MD_SEGMENT_RE.split(answer_text)
    rebuilt = []
    for idx, seg in enumerate(segments):
        if idx % 2 == 1:
            rebuilt.append(seg)
        else:
            rebuilt.append(_replace_segment(seg))

    cleaned_answer = "".join(rebuilt).strip()

    if ordered_citations:
        return cleaned_answer, ordered_citations

    # Do NOT force random PDF bbox sources onto answers that cited neither PDF nor web sources.
    # Only surface unreferenced web results if Tavily was explicitly invoked during synthesis.
    web_fallbacks = [dict(s) for s in candidate_sources if s.get("source") == "web"][:4]
    for new_n, src in enumerate(web_fallbacks, start=1):
        src["number"] = new_n
    return cleaned_answer, web_fallbacks


class RAGService:
    """Performs hybrid vector/full-text search and answers user questions with exact citations."""

    async def query(
        self,
        document_id: str,
        owner_id: str,
        question: str,
        instruction: Optional[str] = None,
        top_k: int = 8,
        client_paragraphs: Optional[list[dict[str, Any]]] = None,
        file_url: Optional[str] = None,
        chat_history: Optional[list[dict[str, str]]] = None,
        search_query: Optional[str] = None,
    ) -> dict[str, Any]:
        """Execute hybrid search using search_query (if provided) and synthesize grounded answer for original question."""
        retrieval_query = (search_query or question).strip() or question
        logger.info(
            f"RAG query doc={document_id}, owner={owner_id}, q={question!r}, retrieval={retrieval_query!r}"
        )
        target_page = extract_target_page(retrieval_query)
        if target_page:
            logger.info(f"Target page directive detected: Page {target_page}")

        # 1. Try DB Hybrid Search first (pgvector cosine + ranking + target page priority)
        chunks = []
        try:
            query_vector = await embedding_service.embed_query(retrieval_query)
            chunks = await self._hybrid_search(
                document_id=document_id,
                owner_id=owner_id,
                query_vector=query_vector,
                question=retrieval_query,
                target_page=target_page,
                limit=top_k,
            )
        except Exception as db_err:
            logger.warning(f"Hybrid DB search failed: {db_err}")

        # 2. If no DB chunks found (e.g. Supabase host unreachable), use client-provided paragraphs
        if not chunks and client_paragraphs:
            logger.info(f"Using {len(client_paragraphs)} client paragraphs as RAG search space")
            stop_words = {"what", "is", "the", "a", "an", "on", "in", "at", "for", "of", "to", "how", "we", "are", "page", "tell", "me", "about"}
            q_words = [w.lower() for w in re.findall(r"\w+", retrieval_query) if len(w) > 2 and w.lower() not in stop_words]
            scored = []
            
            for p in client_paragraphs:
                p_text = (p.get("text") or "").lower()
                bbox_data = p.get("bbox") or {}
                p_num = int(bbox_data.get("page") or p.get("page") or 1)
                
                score = 0.0
                if target_page and p_num == target_page:
                    score += 5.0
                    
                match_count = sum(1 for w in q_words if w in p_text)
                score += match_count * 1.0
                scored.append((score, p))
                
            scored.sort(key=lambda x: x[0], reverse=True)
            
            if any(score > 0 for score, _ in scored):
                top_paras = [p for score, p in scored if score > 0][:top_k]
            else:
                # Distribute evenly across document pages so page 4, 3, 2, 1 all have representatives
                page_buckets: dict[int, list[dict[str, Any]]] = {}
                for p in client_paragraphs:
                    bbox_data = p.get("bbox") or {}
                    p_num = int(bbox_data.get("page") or p.get("page") or 1)
                    page_buckets.setdefault(p_num, []).append(p)
                    
                top_paras = []
                pages_sorted = sorted(page_buckets.keys())
                while len(top_paras) < top_k and any(page_buckets.values()):
                    for pg in pages_sorted:
                        if page_buckets[pg]:
                            top_paras.append(page_buckets[pg].pop(0))
                            if len(top_paras) >= top_k:
                                break

            for p in top_paras:
                bbox_data = p.get("bbox")
                page_num = 1
                if isinstance(bbox_data, dict) and "page" in bbox_data:
                    page_num = int(bbox_data.get("page", 1))
                elif p.get("page"):
                    page_num = int(p.get("page", 1))

                chunks.append({
                    "id": p.get("id"),
                    "page_number": page_num,
                    "chunk_type": p.get("chunkType") or p.get("chunk_type") or "text",
                    "content": p.get("text", "") or p.get("content", ""),
                    "bbox": bbox_data,
                    "section_path": p.get("section_path") or [f"Page {page_num}"],
                    "image_url": p.get("imageUrl") or p.get("image_url"),
                })

        # 3. If STILL no chunks, autonomously extract blocks and bounding boxes directly from the PDF via PyMuPDF
        if not chunks:
            logger.info(f"Extracting autonomous PDF fallback chunks for doc={document_id}")
            chunks = await self._extract_pdf_fallback(
                document_id=document_id,
                owner_id=owner_id,
                question=retrieval_query,
                target_page=target_page,
                file_url=file_url,
                top_k=top_k,
            )

        has_tavily = self._is_tavily_configured()

        if not chunks and not has_tavily:
            return {
                "answer": "I couldn't find any relevant sections in the document to answer your question.",
                "citations": [],
            }

        # 4. Build candidate Citations (PDF chunks; model decides via tool call whether to invoke Tavily web search)
        candidate_citations = build_pdf_citations(chunks)

        # 5. Synthesize answer with Gemini (with conditional search_internet_tavily tool calling)
        answer, final_citations = await self._generate_answer(
            question=question,
            chunks=chunks,
            candidate_citations=candidate_citations,
            instruction=instruction,
            chat_history=chat_history,
            web_search_enabled=has_tavily,
        )

        return {
            "answer": answer,
            "citations": final_citations,
        }

    async def _extract_pdf_fallback(
        self,
        document_id: str,
        owner_id: str,
        question: str,
        target_page: Optional[int] = None,
        file_url: Optional[str] = None,
        top_k: int = 8,
    ) -> list[dict[str, Any]]:
        """Autonomously retrieve PDF from Supabase Storage and extract text blocks with bboxes using PyMuPDF."""
        try:
            pdf_bytes = None
            storage_path = None

            # 1. Look up document metadata if not provided
            if not file_url:
                try:
                    doc = await storage_service.get_document(document_id=document_id, owner_id=owner_id)
                    if doc:
                        file_url = doc.get("file_url")
                        storage_path = doc.get("storage_path")
                except Exception as meta_err:
                    logger.warning(f"Metadata lookup warning: {meta_err}")

            # 2. Attempt download from Supabase Storage bucket first
            if storage_path:
                try:
                    client = storage_service._get_client()
                    pdf_bytes = client.storage.from_(storage_service.bucket_name).download(storage_path)
                except Exception as dl_err:
                    logger.warning(f"Storage bucket download failed: {dl_err}")

            # 3. Fallback: Download via HTTPS using public file_url
            if not pdf_bytes and file_url:
                try:
                    async with httpx.AsyncClient(timeout=15.0) as http_client:
                        resp = await http_client.get(file_url)
                        if resp.status_code == 200:
                            pdf_bytes = resp.content
                except Exception as http_err:
                    logger.warning(f"HTTP download failed: {http_err}")

            if not pdf_bytes:
                logger.warning(f"Could not retrieve PDF bytes for doc {document_id}")
                return []

            # 4. Parse with PyMuPDF
            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            all_blocks = []

            for page_idx in range(len(pdf_doc)):
                page = pdf_doc[page_idx]
                page_num = page_idx + 1
                for b_idx, content, bbox in extract_page_text_blocks_with_bboxes(page):
                    all_blocks.append({
                        "id": f"pdf-{page_num}-{b_idx}",
                        "page_number": page_num,
                        "chunk_type": "text",
                        "content": content,
                        "bbox": bbox,
                        "section_path": [f"Page {page_num}"],
                    })

                # Extract images on this page
                try:
                    pw = page.rect.width or 1.0
                    ph = page.rect.height or 1.0
                    for img_info in page.get_images(full=True):
                        xref = img_info[0]
                        rects = page.get_image_rects(xref)
                        for rect in rects:
                            norm_bbox = {
                                "x": round(rect.x0 / pw, 4),
                                "y": round(rect.y0 / ph, 4),
                                "w": round(rect.width / pw, 4),
                                "h": round(rect.height / ph, 4),
                            }
                            data_url = None
                            try:
                                base_img = pdf_doc.extract_image(xref)
                                img_bytes = base_img.get("image")
                                img_ext = base_img.get("ext", "png")
                                if img_bytes:
                                    data_url = f"data:image/{img_ext};base64,{base64.b64encode(img_bytes).decode('ascii')}"
                            except Exception:
                                pass
                            all_blocks.append({
                                "id": f"pdf-{page_num}-img-{xref}",
                                "page_number": page_num,
                                "chunk_type": "image",
                                "content": f"[Figure / Diagram on Page {page_num}]",
                                "bbox": norm_bbox,
                                "section_path": [f"Page {page_num}", "Figures"],
                                "image_url": data_url,
                            })
                except Exception as img_err:
                    logger.warning(f"RAG fallback image extraction warning: {img_err}")

            if not all_blocks:
                return []

            # 5. Target Page Priority & Keyword scoring
            q_words = set(re.findall(r"\w+", question.lower()))
            stop_words = {
                "the", "a", "an", "and", "or", "in", "on", "at", "to", "for",
                "of", "with", "is", "are", "was", "were", "what", "how", "why",
                "who", "which", "this", "that", "it", "from", "by", "as", "page"
            }
            meaningful_words = {w for w in q_words if w not in stop_words and len(w) > 2}

            scored = []
            for blk in all_blocks:
                score = 0.0
                if target_page and blk["page_number"] == target_page:
                    score += 5.0
                blk_words = set(re.findall(r"\w+", blk["content"].lower()))
                overlap = len(meaningful_words.intersection(blk_words))
                score += overlap
                scored.append((score, blk))

            scored.sort(key=lambda x: x[0], reverse=True)

            if any(s > 0 for s, _ in scored):
                return [blk for s, blk in scored if s > 0][:top_k]
            else:
                # Distribute evenly across all pages
                page_buckets: dict[int, list[dict[str, Any]]] = {}
                for blk in all_blocks:
                    page_buckets.setdefault(blk["page_number"], []).append(blk)
                selected = []
                pg_keys = sorted(page_buckets.keys())
                while len(selected) < top_k and any(page_buckets.values()):
                    for pk in pg_keys:
                        if page_buckets[pk]:
                            selected.append(page_buckets[pk].pop(0))
                            if len(selected) >= top_k:
                                break
                return selected or all_blocks[:top_k]

        except Exception as exc:
            logger.error(f"PyMuPDF fallback extraction failed: {exc}")
            return []

    async def _hybrid_search(
        self,
        document_id: str,
        owner_id: str,
        query_vector: list[float],
        question: str,
        target_page: Optional[int] = None,
        limit: int = 8,
    ) -> list[dict[str, Any]]:
        """Perform robust hybrid search combining pgvector cosine distance, keyword matching, and target page priority."""
        engine = get_db()
        dist_col = document_chunks.c.embedding.cosine_distance(query_vector).label("distance")

        # 1. Vector query candidates across entire document
        vec_stmt = (
            select(
                document_chunks.c.id,
                document_chunks.c.chunk_index,
                document_chunks.c.chunk_type,
                document_chunks.c.content,
                document_chunks.c.parent_content,
                document_chunks.c.page_number,
                document_chunks.c.bbox,
                document_chunks.c.section_path,
                document_chunks.c.image_url,
                document_chunks.c.table_markdown,
                dist_col,
            )
            .where(
                document_chunks.c.document_id == document_id,
                document_chunks.c.owner_id == owner_id,
                document_chunks.c.embedding.isnot(None),
            )
            .order_by(dist_col.asc())
            .limit(max(limit * 2, 16))
        )

        stop_words = {"what", "is", "the", "a", "an", "on", "in", "at", "for", "of", "to", "how", "we", "are", "page", "tell", "me", "about"}
        q_words = [w.lower() for w in re.findall(r"\w+", question) if len(w) > 2 and w.lower() not in stop_words]

        async with engine.connect() as conn:
            vec_rows = []
            try:
                res = await conn.execute(vec_stmt)
                vec_rows = [dict(row._mapping) for row in res.fetchall()]
            except Exception as e:
                logger.warning(f"Vector search failed: {e}")

            kw_rows = []
            if q_words:
                try:
                    kw_stmt = (
                        select(
                            document_chunks.c.id,
                            document_chunks.c.chunk_index,
                            document_chunks.c.chunk_type,
                            document_chunks.c.content,
                            document_chunks.c.parent_content,
                            document_chunks.c.page_number,
                            document_chunks.c.bbox,
                            document_chunks.c.section_path,
                            document_chunks.c.image_url,
                            document_chunks.c.table_markdown,
                        )
                        .where(
                            document_chunks.c.document_id == document_id,
                            document_chunks.c.owner_id == owner_id,
                            or_(*(document_chunks.c.content.ilike(f"%{w}%") for w in q_words))
                        )
                        .limit(max(limit * 2, 16))
                    )
                    res_kw = await conn.execute(kw_stmt)
                    kw_rows = [dict(row._mapping) for row in res_kw.fetchall()]
                except Exception as kw_e:
                    logger.warning(f"Keyword search failed: {kw_e}")

            page_rows = []
            if target_page:
                try:
                    page_stmt = (
                        select(
                            document_chunks.c.id,
                            document_chunks.c.chunk_index,
                            document_chunks.c.chunk_type,
                            document_chunks.c.content,
                            document_chunks.c.parent_content,
                            document_chunks.c.page_number,
                            document_chunks.c.bbox,
                            document_chunks.c.section_path,
                            document_chunks.c.image_url,
                            document_chunks.c.table_markdown,
                        )
                        .where(
                            document_chunks.c.document_id == document_id,
                            document_chunks.c.owner_id == owner_id,
                            document_chunks.c.page_number == target_page,
                        )
                        .order_by(document_chunks.c.chunk_index.asc())
                    )
                    res_page = await conn.execute(page_stmt)
                    page_rows = [dict(row._mapping) for row in res_page.fetchall()]
                except Exception as p_e:
                    logger.warning(f"Target page query failed: {p_e}")

        # Reciprocal Rank Fusion & Target Page Boost
        scores: dict[str, float] = {}
        row_map: dict[str, dict[str, Any]] = {}

        # 1. Target page bonus
        for r in page_rows:
            cid = str(r["id"])
            row_map[cid] = r
            scores[cid] = scores.get(cid, 0.0) + 1.0

        # 2. Vector distance RRF
        for rank, r in enumerate(vec_rows):
            cid = str(r["id"])
            row_map[cid] = r
            scores[cid] = scores.get(cid, 0.0) + (1.0 / (60.0 + rank))

        # 3. Keyword matches bonus
        for rank, r in enumerate(kw_rows):
            cid = str(r["id"])
            row_map[cid] = r
            c_text = (r.get("content") or "").lower()
            match_count = sum(1 for w in q_words if w in c_text)
            scores[cid] = scores.get(cid, 0.0) + (1.0 / (60.0 + rank)) + (match_count * 0.05)

        if not row_map:
            # Fallback across all pages
            logger.info("Executing multi-page distributed fallback query")
            async with engine.connect() as conn:
                fallback_stmt = (
                    select(
                        document_chunks.c.id,
                        document_chunks.c.chunk_index,
                        document_chunks.c.chunk_type,
                        document_chunks.c.content,
                        document_chunks.c.parent_content,
                        document_chunks.c.page_number,
                        document_chunks.c.bbox,
                        document_chunks.c.section_path,
                        document_chunks.c.image_url,
                        document_chunks.c.table_markdown,
                    )
                    .where(
                        document_chunks.c.document_id == document_id,
                        document_chunks.c.owner_id == owner_id,
                    )
                    .order_by(document_chunks.c.chunk_index.asc())
                    .limit(50)
                )
                res = await conn.execute(fallback_stmt)
                all_raw = [dict(row._mapping) for row in res.fetchall()]
                if not all_raw:
                    return []
                pages_dict: dict[int, list[dict[str, Any]]] = {}
                for item in all_raw:
                    pages_dict.setdefault(item.get("page_number", 1), []).append(item)
                sampled = []
                pg_keys = sorted(pages_dict.keys())
                while len(sampled) < limit and any(pages_dict.values()):
                    for pk in pg_keys:
                        if pages_dict[pk]:
                            sampled.append(pages_dict[pk].pop(0))
                            if len(sampled) >= limit:
                                break
                return sampled

        sorted_cids = sorted(scores.keys(), key=lambda k: scores[k], reverse=True)
        return [row_map[cid] for cid in sorted_cids[:limit]]

    @staticmethod
    def _is_tavily_configured() -> bool:
        key = (setting.tavily_api_key or "").strip()
        return bool(key and (key.startswith("tvly-") or len(key) > 10))

    async def _search_tavily(
        self,
        query: str,
        max_results: int = 3,
    ) -> list[dict[str, Any]]:
        """Execute a conditional Tavily web search when invoked by the model."""
        if not self._is_tavily_configured():
            return []
        clean_query = (query or "").strip()
        if not clean_query:
            return []
        capped_results = max(1, min(int(max_results or 3), 4))
        try:
            async with httpx.AsyncClient(timeout=8.0) as http_client:
                resp = await http_client.post(
                    "https://api.tavily.com/search",
                    json={
                        "api_key": setting.tavily_api_key.strip(),
                        "query": clean_query,
                        "search_depth": "basic",
                        "max_results": capped_results,
                        "include_answer": False,
                    },
                )
                if resp.status_code == 200:
                    results = resp.json().get("results", [])
                    logger.info(
                        f"Tavily search executed query={clean_query!r} results={len(results)}"
                    )
                    return [
                        {
                            "title": (r.get("title") or "Web source").strip(),
                            "url": (r.get("url") or "").strip(),
                            "content": (r.get("content") or "").strip(),
                        }
                        for r in results
                        if isinstance(r, dict)
                    ]
                logger.warning(
                    f"Tavily HTTP {resp.status_code}: {resp.text[:200]}"
                )
        except Exception as e:
            logger.warning(f"Tavily search warning: {e}")
        return []

    async def _generate_answer(
        self,
        question: str,
        chunks: list[dict[str, Any]],
        candidate_citations: Optional[list[dict[str, Any]]] = None,
        instruction: Optional[str] = None,
        chat_history: Optional[list[dict[str, str]]] = None,
        web_search_enabled: bool = False,
    ) -> tuple[str, list[dict[str, Any]]]:
        """Synthesize a grounded response, letting Gemini decide whether to call Tavily for web sources."""
        base_sources = (
            [dict(c) for c in candidate_citations]
            if candidate_citations is not None
            else build_pdf_citations(chunks)
        )

        context_blocks = []
        for i, c in enumerate(chunks):
            c_type = c.get("chunk_type", "text")
            type_label = "Figure / Diagram" if (c_type in ("image", "figure", "diagram") or c.get("image_url")) else c_type
            src = f"[Source {i+1}] (PDF Page {c.get('page_number', 1)} · {type_label}):"
            text_body = c.get("parent_content") or c.get("content", "")
            context_blocks.append(f"{src}\n{text_body}")

        if context_blocks:
            context_str = "\n\n".join(context_blocks)
        elif web_search_enabled:
            context_str = (
                "(No matching passages were retrieved from the uploaded PDF. "
                "If this question can be answered using external knowledge, call search_internet_tavily unless the user restricted you to the PDF.)"
            )
        else:
            context_str = "(No matching PDF passages.)"

        history_blocks = []
        if chat_history:
            for item in chat_history[-6:]:
                role = "User" if item.get("role") == "user" else "RIFT AI"
                content = item.get("content", "").strip()
                if content:
                    history_blocks.append(f"{role}: {content}")
        history_str = (
            "\n\n--- PREVIOUS CONVERSATION IN THIS THREAD ---\n" + "\n".join(history_blocks)
            if history_blocks
            else ""
        )

        system_instruction, user_prompt = build_rag_prompts(
            question=question,
            context_str=context_str,
            history_str=history_str,
            instruction=instruction,
            web_search_enabled=web_search_enabled,
        )

        if setting.gemini_api_key:
            client = genai.Client(api_key=setting.gemini_api_key)
            tavily_tool = _build_tavily_tool() if web_search_enabled else None
            tavily_cache: dict[tuple[str, int], list[dict[str, Any]]] = {}

            for model_name in [
                "gemini-3.5-flash-lite",
                "gemini-3.5-flash",
                "gemini-3.8-flash",
            ]:
                attempt_sources = [dict(s) for s in base_sources]
                seen_urls: set[str] = {
                    s["url"] for s in attempt_sources if s.get("url")
                }
                contents: list[types.Content] = [
                    types.Content(
                        role="user",
                        parts=[types.Part.from_text(text=user_prompt)],
                    )
                ]
                try:
                    for round_idx in range(3):
                        allow_tools = bool(tavily_tool and round_idx < 2)
                        config = types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            tools=[tavily_tool] if allow_tools and tavily_tool else None,
                        )
                        resp = await client.aio.models.generate_content(
                            model=model_name,
                            contents=contents,
                            config=config,
                        )

                        func_calls = getattr(resp, "function_calls", None) or []
                        if func_calls and round_idx < 2:
                            if resp.candidates and resp.candidates[0].content:
                                contents.append(resp.candidates[0].content)

                            tool_parts: list[types.Part] = []
                            for fc in func_calls:
                                fc_args = fc.args or {}
                                search_q = str(fc_args.get("query") or question)
                                max_res = int(fc_args.get("max_results") or 3)
                                cache_key = (search_q.strip().lower(), max_res)
                                if cache_key not in tavily_cache:
                                    tavily_cache[cache_key] = await self._search_tavily(
                                        query=search_q,
                                        max_results=max_res,
                                    )
                                web_hits = tavily_cache[cache_key]
                                formatted_hits: list[dict[str, Any]] = []
                                for hit in web_hits:
                                    url = hit.get("url", "")
                                    if url and url in seen_urls:
                                        existing_num = next(
                                            (
                                                s.get("number")
                                                for s in attempt_sources
                                                if s.get("url") == url
                                            ),
                                            None,
                                        )
                                        if existing_num:
                                            formatted_hits.append(
                                                {
                                                    "source_number": existing_num,
                                                    "title": hit.get("title", "Web source"),
                                                    "url": url,
                                                    "content": hit.get("content", ""),
                                                }
                                            )
                                        continue

                                    if url:
                                        seen_urls.add(url)
                                    source_num = len(attempt_sources) + 1
                                    title = hit.get("title") or "Web source"
                                    snippet = hit.get("content") or ""
                                    attempt_sources.append(
                                        {
                                            "id": f"web-{source_num}",
                                            "number": source_num,
                                            "label": f"🌐 {title[:24]}",
                                            "source": "web",
                                            "url": url or None,
                                            "snippet": snippet[:200],
                                        }
                                    )
                                    formatted_hits.append(
                                        {
                                            "source_number": source_num,
                                            "source_tag": f"[Source {source_num}]",
                                            "title": title,
                                            "url": url,
                                            "content": snippet,
                                        }
                                    )

                                tool_parts.append(
                                    types.Part.from_function_response(
                                        name=fc.name or "search_internet_tavily",
                                        response={
                                            "query": search_q,
                                            "results": formatted_hits,
                                            "note": "Cite these web results inline as [source_number].",
                                        },
                                    )
                                )

                            if tool_parts:
                                contents.append(
                                    types.Content(role="user", parts=tool_parts)
                                )
                                continue

                        if resp.text:
                            return finalize_citations_and_answer(
                                resp.text.strip(),
                                attempt_sources,
                            )
                        break
                except Exception as e:
                    logger.warning(f"Gemini {model_name} synthesis error: {e}")

        # Grounded fallback if Gemini key is not configured or error occurs
        if chunks:
            lead_content = chunks[0].get("content", "")[:350].strip()
            page_ref = chunks[0].get("page_number", 1)
            fallback_ans = (
                f"Here is an explanation based on the document: On page {page_ref}, the text explains that {lead_content}… [1]"
            )
            return finalize_citations_and_answer(fallback_ans, base_sources)

        return (
            "I couldn't find any relevant information in the document or web search to answer your question.",
            [],
        )


rag_service = RAGService()
