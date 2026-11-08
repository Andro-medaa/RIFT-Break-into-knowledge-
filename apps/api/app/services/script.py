"""Script generation service using Gemini 2.5 Flash to generate spoken-word scripts linked to bboxes."""

import json
import re
from pathlib import Path
from typing import Any, Optional
from google import genai

from app.core.config import setting
from app.core.logger import get_logger
from app.schemas.script import ScriptResponse, ScriptSegment
from app.services.ingest import ingestion_service

logger = get_logger("app.services.script")


class ScriptService:
    """Generates concise 1-2 line natural spoken script segments linked to PDF chunks and bounding boxes."""

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

    async def generate_script(
        self,
        document_id: str,
        owner_id: str,
        voice_style: str = "natural",
        language: str = "en",
        force_regenerate: bool = False,
        fallback_chunks: Optional[list[dict[str, Any]]] = None,
    ) -> ScriptResponse:
        """Generate dictation script segments linked to document chunks with disk caching."""
        cache_dir = Path("data/script_cache")
        cache_dir.mkdir(parents=True, exist_ok=True)
        cache_file = cache_dir / f"{document_id}_{language}_{voice_style}.json"

        if force_regenerate and cache_file.exists():
            try:
                cache_file.unlink()
                logger.info(f"Force-deleted script cache for doc={document_id}")
            except Exception as e:
                logger.warning(f"Error deleting script cache: {e}")

        if not force_regenerate and cache_file.exists():
            try:
                cached_data = json.loads(cache_file.read_text(encoding="utf-8"))
                logger.info(f"Loaded script from cache for doc={document_id}, lang={language}")
                return ScriptResponse(**cached_data)
            except Exception as e:
                logger.warning(f"Error reading script cache: {e}")

        chunks: list[dict[str, Any]] = []
        try:
            chunks = await ingestion_service.get_document_chunks(document_id=document_id, owner_id=owner_id)
        except Exception as e:
            logger.warning(f"Database get_document_chunks failed ({e}), checking fallback chunks...")

        # If DB query returned no chunks or failed, use fallback paragraphs provided by client
        if not chunks and fallback_chunks:
            logger.info(f"Using {len(fallback_chunks)} fallback paragraphs from client for script generation")
            chunks = [
                {
                    "id": p.get("id", f"p_{i}"),
                    "chunk_index": i,
                    "content": p.get("text") or p.get("content", ""),
                    "page_number": (p.get("bbox", {}).get("page") if isinstance(p.get("bbox"), dict) else p.get("page", 1)) or 1,
                    "bbox": p.get("bbox") if isinstance(p.get("bbox"), dict) else None,
                }
                for i, p in enumerate(fallback_chunks)
            ]

        if not chunks:
            return ScriptResponse(document_id=document_id, segments=[])

        # Map chunks by ID for quick bbox/page lookup
        chunk_map: dict[str, dict[str, Any]] = {c["id"]: c for c in chunks}

        # Filter chunks with actual content
        text_chunks = [c for c in chunks if c.get("content") and len(c["content"].strip()) > 3]

        generated_segments: list[ScriptSegment] = []

        if setting.gemini_api_key and text_chunks:
            try:
                # Process in batches of 30 to keep Gemini prompt manageable
                batch_size = 30
                client = genai.Client(api_key=setting.gemini_api_key)

                for batch_start in range(0, len(text_chunks), batch_size):
                    batch = text_chunks[batch_start:batch_start + batch_size]

                    # Prepare compact context payload for Gemini
                    input_payload = [
                        {
                            "chunk_id": c["id"],
                            "page": c.get("page_number", 1),
                            "text": c["content"][:300],  # keep prompt concise
                        }
                        for c in batch
                    ]

                    prompt = (
                        f"You are a professional educational narrator creating a spoken-word script in {language}.\n"
                        f"Voice style: {voice_style}.\n"
                        "Convert each document chunk into 1-2 natural, spoken sentences (maximum 20-30 words per segment).\n"
                        "Keep the exact chunk_id for each segment so it links to the PDF bounding box.\n"
                        "Return ONLY a valid JSON array of objects with keys: chunk_id, segment_index, text.\n"
                        "Do not include markdown fences or any other commentary.\n\n"
                        f"Chunks:\n{json.dumps(input_payload)}"
                    )

                    resp = None
                    for m_name in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]:
                        try:
                            resp = await client.aio.models.generate_content(
                                model=m_name,
                                contents=prompt,
                            )
                            if resp.text:
                                break
                        except Exception as err:
                            logger.warning(f"Script generation model {m_name} error: {err}")

                    if resp and resp.text:
                        cleaned_text = resp.text.strip()
                        # Strip markdown code blocks if Gemini added them
                        if cleaned_text.startswith("```"):
                            cleaned_text = re.sub(r"^```[a-zA-Z]*\s*", "", cleaned_text)
                            cleaned_text = re.sub(r"\s*```$", "", cleaned_text)

                        parsed_json = json.loads(cleaned_text)
                        if isinstance(parsed_json, list):
                            for item in parsed_json:
                                cid = item.get("chunk_id")
                                seg_text = item.get("text", "").strip()
                                seg_idx = item.get("segment_index", 0)
                                if cid in chunk_map and seg_text:
                                    c = chunk_map[cid]
                                    generated_segments.append(
                                        ScriptSegment(
                                            id=f"seg_{cid}_{seg_idx}",
                                            chunk_id=cid,
                                            segment_index=seg_idx,
                                            text=seg_text,
                                            page_number=c.get("page_number", 1),
                                            bbox=c.get("bbox"),
                                        )
                                    )
            except Exception as e:
                logger.warning(f"Gemini script generation exception: {e}, falling back to chunk sentence splitting")

        # Fallback if Gemini produced no segments or failed
        if not generated_segments:
            for c in chunks:
                raw_text = c.get("content", "").strip()
                if not raw_text:
                    continue
                splits = self._split_fallback_text(raw_text, max_words=25)
                for s_idx, s_text in enumerate(splits):
                    generated_segments.append(
                        ScriptSegment(
                            id=f"seg_{c['id']}_{s_idx}",
                            chunk_id=c["id"],
                            segment_index=s_idx,
                            text=s_text,
                            page_number=c.get("page_number", 1),
                            bbox=c.get("bbox"),
                        )
                    )

        resp = ScriptResponse(document_id=document_id, segments=generated_segments)
        if generated_segments:
            try:
                cache_file.write_text(resp.model_dump_json(), encoding="utf-8")
                logger.info(f"Cached script for doc={document_id}, segments={len(generated_segments)}")
            except Exception as e:
                logger.warning(f"Error writing script cache: {e}")
        return resp


script_service = ScriptService()

