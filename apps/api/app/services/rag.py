"""RAG query and citation service using Supabase pgvector hybrid search and Gemini."""

import re
from typing import Any, Optional
from google import genai
import httpx
from sqlalchemy import select

try:
    import pymupdf as fitz
except ImportError:
    import fitz

from app.core.config import setting
from app.core.db import get_db
from app.core.logger import get_logger
from app.model.document_chunks import document_chunks
from app.services.embedding import embedding_service
from app.services.storage import storage_service

logger = get_logger("app.services.rag")


class RAGService:
    """Performs hybrid vector/full-text search and answers user questions with exact citations."""

    async def query(
        self,
        document_id: str,
        owner_id: str,
        question: str,
        instruction: Optional[str] = None,
        top_k: int = 4,
        client_paragraphs: Optional[list[dict[str, Any]]] = None,
        file_url: Optional[str] = None,
    ) -> dict[str, Any]:
        """Execute hybrid search on document chunks or client paragraphs fallback and synthesize grounded answer with citations."""
        logger.info(f"RAG query doc={document_id}, owner={owner_id}, q={question!r}")

        # 1. Try DB Hybrid Search first (pgvector cosine + ranking)
        chunks = []
        try:
            query_vector = await embedding_service.embed_query(question)
            chunks = await self._hybrid_search(
                document_id=document_id,
                owner_id=owner_id,
                query_vector=query_vector,
                limit=top_k,
            )
        except Exception as db_err:
            logger.warning(f"Hybrid DB search failed: {db_err}")

        # 2. If no DB chunks found (e.g. Supabase host unreachable), use client-provided paragraphs
        if not chunks and client_paragraphs:
            logger.info(f"Using {len(client_paragraphs)} client paragraphs as RAG search space")
            q_words = set(w.lower() for w in re.findall(r"\w+", question) if len(w) > 2)
            scored = []
            for p in client_paragraphs:
                p_text = p.get("text", "")
                p_words = set(w.lower() for w in re.findall(r"\w+", p_text) if len(w) > 2)
                score = len(q_words.intersection(p_words))
                scored.append((score, p))
            scored.sort(key=lambda x: x[0], reverse=True)
            top_paras = [p for _, p in scored[:top_k]]
            if not any(score > 0 for score, _ in scored) and client_paragraphs:
                top_paras = client_paragraphs[:top_k]

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
                    "chunk_type": "text",
                    "content": p.get("text", ""),
                    "bbox": bbox_data,
                    "section_path": [f"Page {page_num}"],
                })

        # 3. If STILL no chunks, autonomously extract blocks and bounding boxes directly from the PDF via PyMuPDF
        if not chunks:
            logger.info(f"Extracting autonomous PDF fallback chunks for doc={document_id}")
            chunks = await self._extract_pdf_fallback(
                document_id=document_id,
                owner_id=owner_id,
                question=question,
                file_url=file_url,
                top_k=top_k,
            )

        if not chunks:
            return {
                "answer": "I couldn't find any relevant sections in the document to answer your question.",
                "citations": [],
            }

        # 4. Build Citations for the frontend (PDF Chunks)
        citations = []
        for idx, chk in enumerate(chunks):
            page = chk.get("page_number", 1)
            chunk_type = chk.get("chunk_type", "text")
            label = f"Page {page} · {chunk_type.capitalize()}"
            if chk.get("section_path") and len(chk["section_path"]) > 0:
                label = f"Page {page} · {chk['section_path'][0][:24]}"

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

        # 4b. Optional Web Search grounding via Tavily
        web_results = []
        if setting.tavily_api_key and (setting.tavily_api_key.startswith("tvly-") or len(setting.tavily_api_key) > 10):
            try:
                async with httpx.AsyncClient(timeout=6.0) as client:
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={
                            "api_key": setting.tavily_api_key,
                            "query": question,
                            "max_results": 2,
                            "include_answer": False,
                        },
                    )
                    if resp.status_code == 200:
                        web_results = resp.json().get("results", [])
                        for w_idx, w_item in enumerate(web_results):
                            citations.append(
                                {
                                    "id": f"web-{w_idx}",
                                    "label": f"🌐 {w_item.get('title', 'Web source')[:24]}",
                                    "source": "web",
                                    "url": w_item.get("url"),
                                    "snippet": w_item.get("content", "")[:200],
                                }
                            )
            except Exception as e:
                logger.warning(f"Tavily search warning: {e}")

        # 5. Synthesize answer with Gemini
        answer = await self._generate_answer(
            question=question,
            chunks=chunks,
            web_results=web_results,
            instruction=instruction,
        )

        return {
            "answer": answer,
            "citations": citations,
        }

    async def _extract_pdf_fallback(
        self,
        document_id: str,
        owner_id: str,
        question: str,
        file_url: Optional[str] = None,
        top_k: int = 4,
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
                pw = page.rect.width or 1.0
                ph = page.rect.height or 1.0

                for b_idx, b in enumerate(page.get_text("blocks")):
                    if len(b) >= 5 and b[4] and b[4].strip():
                        content = b[4].strip()
                        # Ignore single symbols or bare headers
                        if len(content) < 8 and not any(ch.isalpha() for ch in content):
                            continue
                        x0, y0, x1, y1 = float(b[0]), float(b[1]), float(b[2]), float(b[3])
                        all_blocks.append({
                            "id": f"pdf-{page_num}-{b_idx}",
                            "page_number": page_num,
                            "chunk_type": "text",
                            "content": content,
                            "bbox": {
                                "x": round(max(0.0, x0 / pw), 4),
                                "y": round(max(0.0, y0 / ph), 4),
                                "w": round(min(1.0, (x1 - x0) / pw), 4),
                                "h": round(min(1.0, (y1 - y0) / ph), 4),
                            },
                            "section_path": [f"Page {page_num}"],
                        })

            if not all_blocks:
                return []

            # 5. Keyword scoring against question
            q_words = set(re.findall(r"\w+", question.lower()))
            stop_words = {
                "the", "a", "an", "and", "or", "in", "on", "at", "to", "for",
                "of", "with", "is", "are", "was", "were", "what", "how", "why",
                "who", "which", "this", "that", "it", "from", "by", "as"
            }
            meaningful_words = {w for w in q_words if w not in stop_words and len(w) > 2}

            scored = []
            for blk in all_blocks:
                blk_words = set(re.findall(r"\w+", blk["content"].lower()))
                overlap = len(meaningful_words.intersection(blk_words))
                scored.append((overlap, blk))

            scored.sort(key=lambda x: x[0], reverse=True)

            if any(s > 0 for s, _ in scored):
                return [blk for s, blk in scored if s > 0][:top_k]
            else:
                # If broad summary query with no keyword match, select first block from each page
                seen_pages = set()
                selected = []
                for blk in all_blocks:
                    p = blk["page_number"]
                    if p not in seen_pages:
                        seen_pages.add(p)
                        selected.append(blk)
                        if len(selected) >= top_k:
                            break
                if not selected:
                    selected = all_blocks[:top_k]
                return selected

        except Exception as exc:
            logger.error(f"PyMuPDF fallback extraction failed: {exc}")
            return []

    async def _hybrid_search(
        self,
        document_id: str,
        owner_id: str,
        query_vector: list[float],
        limit: int = 4,
    ) -> list[dict[str, Any]]:
        """Perform pgvector cosine distance search using SQLAlchemy Core."""
        engine = get_db()
        dist_col = document_chunks.c.embedding.cosine_distance(query_vector).label("distance")

        stmt = (
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
            )
            .order_by(dist_col.asc())
            .limit(limit)
        )

        async with engine.connect() as conn:
            try:
                res = await conn.execute(stmt)
                return [dict(row._mapping) for row in res.fetchall()]
            except Exception as e:
                logger.warning(f"Vector search failed, falling back to sequential scan: {e}")
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
                    .limit(limit)
                )
                res = await conn.execute(fallback_stmt)
                return [dict(row._mapping) for row in res.fetchall()]

    async def _generate_answer(
        self,
        question: str,
        chunks: list[dict[str, Any]],
        web_results: Optional[list[dict[str, Any]]] = None,
        instruction: Optional[str] = None,
    ) -> str:
        """Call Gemini to synthesize a coherent response based on retrieved chunks and web context."""
        context_blocks = []
        for i, c in enumerate(chunks):
            src = f"[PDF Source {i+1} - Page {c.get('page_number')} ({c.get('chunk_type')}]:"
            text_body = c.get("parent_content") or c.get("content", "")
            context_blocks.append(f"{src}\n{text_body}")

        if web_results:
            for j, w in enumerate(web_results):
                src = f"[Web Source {j+1} - {w.get('title', 'Web')}]({w.get('url', '')}):"
                context_blocks.append(f"{src}\n{w.get('content', '')}")

        context_str = "\n\n".join(context_blocks)

        system_instruction = (
            "You are RIFT, an intelligent pedagogical reading and research assistant. "
            "Explain the answer clearly, intuitively, and thoroughly in your own words, rather than simply quoting or repeating exact text from the source. "
            "Provide an explanatory breakdown that is engaging, easy to understand, and pleasant to listen to when read aloud. "
            "Stay factually grounded in the document context. Mention relevant page numbers naturally. "
            "Do not output markdown headers (#) or complex nested bullet trees that sound awkward when spoken aloud; use natural conversational transitions."
        )
        if instruction:
            system_instruction += f"\nFollow this user guidance: {instruction}"

        prompt = (
            f"{system_instruction}\n\n"
            f"--- CONTEXT FROM DOCUMENT ---\n{context_str}\n\n"
            f"--- QUESTION ---\n{question}\n\n"
            "--- ANSWER ---"
        )

        if setting.gemini_api_key:
            client = genai.Client(api_key=setting.gemini_api_key)
            for model_name in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3.8-flash"]:
                try:
                    resp = await client.aio.models.generate_content(
                        model=model_name,
                        contents=prompt,
                    )
                    if resp.text:
                        return resp.text.strip()
                except Exception as e:
                    logger.warning(f"Gemini {model_name} synthesis error: {e}")

        # Grounded fallback if Gemini key is not configured or error occurs
        lead_content = chunks[0].get("content", "")[:350].strip()
        page_ref = chunks[0].get("page_number", 1)
        return (
            f"Here is an explanation based on the document: On page {page_ref}, the text explains that {lead_content}… "
            f"You can jump to and highlight the exact section by clicking the citation chips below."
        )


rag_service = RAGService()
