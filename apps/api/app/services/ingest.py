"""End-to-end ingestion pipeline service for multimodal semantic RAG."""

import base64
import uuid
from typing import Any, Optional
import httpx
from sqlalchemy import delete, insert, select

from app.core.db import get_db, scope_by_owner
from app.core.logger import get_logger
from app.ingest.chunker import DocumentChunkData, semantic_chunker
from app.ingest.parser import extract_page_text_blocks_with_bboxes, multimodal_parser
from app.model.document_chunks import document_chunks
from app.model.documents import documents
from app.services.embedding import embedding_service
from app.services.storage import storage_service

logger = get_logger("app.services.ingest")


class IngestionService:
    """Orchestrates parsing, multimodal enrichment, chunking, embedding, and vector persistence."""

    async def ingest_document(
        self,
        document_id: str,
        owner_id: str,
        instruction: Optional[str] = None,
    ) -> dict[str, Any]:
        """Ingest a stored PDF document into multimodal vector chunks."""
        logger.info(f"Starting ingestion for doc={document_id}, owner={owner_id}, instruction={instruction!r}")

        # 1. Fetch document record
        doc = await storage_service.get_document(document_id=document_id, owner_id=owner_id)
        if not doc:
            raise ValueError(f"Document {document_id} not found for owner {owner_id}")

        # 2. Retrieve PDF bytes
        pdf_bytes = await self._fetch_pdf_bytes(doc)
        if not pdf_bytes:
            raise ValueError(f"Failed to retrieve PDF data for document {document_id}")

        # 3. Parse multimodal elements (text, tables, images)
        elements = multimodal_parser.parse_bytes(pdf_bytes, filename=doc.get("filename", ""))
        logger.info(f"Extracted {len(elements)} raw multimodal elements from {doc.get('filename')}")

        # 4. Multimodal image enrichment (save crops to Supabase & generate captions)
        for idx, elem in enumerate(elements):
            if elem.element_type == "image" and elem.image_bytes:
                try:
                    mime = f"image/{elem.image_ext or 'png'}"
                    image_url = None

                    # Upload image crop to Supabase Storage if possible
                    try:
                        client = storage_service._get_client()
                        img_path = f"{owner_id}/images/{document_id}_p{elem.page_number}_{idx}.{elem.image_ext or 'png'}"
                        client.storage.from_(storage_service.bucket_name).upload(
                            path=img_path,
                            file=elem.image_bytes,
                            file_options={"content-type": mime, "upsert": "true"},
                        )
                        image_url = client.storage.from_(
                            storage_service.bucket_name
                        ).get_public_url(img_path)
                    except Exception as upload_err:
                        logger.warning(f"Storage upload failed for image {idx}, using base64: {upload_err}")

                    # Fallback to base64 data URI if storage URL is not available
                    if not image_url:
                        b64_data = base64.b64encode(elem.image_bytes).decode("ascii")
                        image_url = f"data:{mime};base64,{b64_data}"

                    elem.image_url = image_url

                    # Vision multimodal analysis (OCR text + deep captioning + figure label)
                    surrounding = ""
                    if idx > 0 and elements[idx - 1].content:
                        surrounding += elements[idx - 1].content[:200]
                    if idx + 1 < len(elements) and elements[idx + 1].content:
                        surrounding += " " + elements[idx + 1].content[:200]

                    analysis = await embedding_service.analyze_image(
                        elem.image_bytes,
                        mime_type=mime,
                        page_number=elem.page_number,
                        surrounding_text=surrounding,
                    )
                    elem.caption = analysis.get("caption", "")
                    elem.ocr_text = analysis.get("ocr_text", "")
                    elem.figure_label = analysis.get("figure_label", f"Figure on Page {elem.page_number}")

                    # Format content for vector embedding and retrieval
                    label_str = elem.figure_label or f"Figure on Page {elem.page_number}"
                    elem.content = f"[{label_str}]: {elem.caption}"
                    if elem.ocr_text:
                        elem.content += f"\nVisual Labels & Text: {elem.ocr_text}"
                except Exception as img_err:
                    logger.warning(f"Failed to process or caption image {idx}: {img_err}")

        # 5. Semantic Chunking
        chunks = semantic_chunker.chunk_elements(elements)
        logger.info(f"Generated {len(chunks)} semantic chunks for document {document_id}")

        # 6. Generate Vector Embeddings (Gemini text-embedding-004)
        texts_to_embed = [c.content for c in chunks]
        embeddings = await embedding_service.embed_texts(texts_to_embed, task_type="RETRIEVAL_DOCUMENT")

        # 7. Persist to Supabase document_chunks table with transaction
        engine = get_db()
        async with engine.begin() as conn:
            # Idempotency: delete any existing chunks for this document
            del_stmt = delete(document_chunks).where(
                document_chunks.c.document_id == document_id,
                document_chunks.c.owner_id == owner_id,
            )
            await conn.execute(del_stmt)

            # Insert chunks in batch
            rows = []
            for i, c in enumerate(chunks):
                emb = embeddings[i] if i < len(embeddings) else None
                rows.append(
                    {
                        "id": str(uuid.uuid4()),
                        "document_id": document_id,
                        "owner_id": owner_id,
                        "chunk_index": c.chunk_index,
                        "chunk_type": c.chunk_type,
                        "content": c.content,
                        "parent_content": c.parent_content,
                        "page_number": c.page_number,
                        "bbox": c.bbox,
                        "section_path": c.section_path,
                        "image_url": c.image_url,
                        "table_markdown": c.table_markdown,
                        "token_count": c.token_count,
                        "embedding": emb,
                    }
                )

            if rows:
                await conn.execute(insert(document_chunks), rows)

        logger.info(f"Successfully persisted {len(rows)} vector chunks for document {document_id}")

        return {
            "document_id": document_id,
            "filename": doc.get("filename"),
            "chunks_count": len(chunks),
            "text_chunks": sum(1 for c in chunks if c.chunk_type == "text"),
            "table_chunks": sum(1 for c in chunks if c.chunk_type == "table"),
            "image_chunks": sum(1 for c in chunks if c.chunk_type == "image"),
            "instruction_applied": bool(instruction),
        }

    async def get_document_chunks(
        self,
        document_id: str,
        owner_id: str,
    ) -> list[dict[str, Any]]:
        """Retrieve all extracted chunks with bboxes and hierarchy for UI rendering."""
        try:
            engine = get_db()
            stmt = (
                select(
                    document_chunks.c.id,
                    document_chunks.c.chunk_index,
                    document_chunks.c.chunk_type,
                    document_chunks.c.content,
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
            )
            async with engine.connect() as conn:
                res = await conn.execute(stmt)
                rows = [dict(row._mapping) for row in res.fetchall()]
                if rows:
                    return rows
        except Exception as exc:
            logger.warning(f"Database chunk retrieval failed: {exc}, using PyMuPDF fallback")

        # Fallback: extract chunks with bounding boxes directly from PDF using PyMuPDF
        try:
            doc = await storage_service.get_document(document_id=document_id, owner_id=owner_id)
            if not doc:
                return []
            pdf_bytes = await self._fetch_pdf_bytes(doc)
            if not pdf_bytes:
                return []
            try:
                import pymupdf as fitz
            except ImportError:
                import fitz

            pdf_doc = fitz.open(stream=pdf_bytes, filetype="pdf")
            fallback_chunks = []
            chunk_idx = 0
            for page_idx in range(len(pdf_doc)):
                page = pdf_doc[page_idx]
                page_num = page_idx + 1
                for _, txt, bbox in extract_page_text_blocks_with_bboxes(page):
                    fallback_chunks.append({
                        "id": f"chunk-{page_num}-{chunk_idx}",
                        "chunk_index": chunk_idx,
                        "chunk_type": "text",
                        "content": txt,
                        "page_number": page_num,
                        "bbox": bbox,
                        "section_path": [f"Page {page_num}"],
                        "image_url": None,
                        "table_markdown": None,
                    })
                    chunk_idx += 1

                # Extract page figures/images
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
                            fallback_chunks.append({
                                "id": f"chunk-{page_num}-{chunk_idx}",
                                "chunk_index": chunk_idx,
                                "chunk_type": "image",
                                "content": f"[Figure on Page {page_num}]",
                                "page_number": page_num,
                                "bbox": norm_bbox,
                                "section_path": [f"Page {page_num}", "Figures"],
                                "image_url": data_url,
                                "table_markdown": None,
                            })
                            chunk_idx += 1
                except Exception as img_ext_err:
                    logger.warning(f"Fallback image extraction warning on page {page_num}: {img_ext_err}")
            logger.info(f"Generated {len(fallback_chunks)} fallback chunks from PDF for doc={document_id}")
            return fallback_chunks
        except Exception as fb_err:
            logger.error(f"PyMuPDF fallback failed: {fb_err}")
            return []

    async def _fetch_pdf_bytes(self, doc: dict[str, Any]) -> Optional[bytes]:
        """Download or read PDF bytes from Supabase Storage or storage path."""
        storage_path = doc.get("storage_path")
        if storage_path:
            try:
                client = storage_service._get_client()
                data = client.storage.from_(storage_service.bucket_name).download(storage_path)
                if data:
                    return data
            except Exception as e:
                logger.warning(f"Supabase storage download failed: {e}")

        # Fallback: HTTP download via file_url
        file_url = doc.get("file_url")
        if file_url and file_url.startswith("http"):
            try:
                async with httpx.AsyncClient(timeout=30.0) as client:
                    resp = await client.get(file_url)
                    if resp.status_code == 200:
                        return resp.content
            except Exception as e:
                logger.warning(f"HTTP download fallback failed: {e}")

        return None


ingestion_service = IngestionService()
