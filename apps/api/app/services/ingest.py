"""End-to-end ingestion pipeline service for multimodal semantic RAG."""

import uuid
from typing import Any, Optional
import httpx
from sqlalchemy import delete, insert, select

from app.core.db import get_db, scope_by_owner
from app.core.logger import get_logger
from app.ingest.chunker import DocumentChunkData, semantic_chunker
from app.ingest.parser import multimodal_parser
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
                    # Upload image crop to Supabase Storage
                    client = storage_service._get_client()
                    img_path = f"{owner_id}/images/{document_id}_p{elem.page_number}_{idx}.{elem.image_ext or 'png'}"
                    mime = f"image/{elem.image_ext or 'png'}"
                    client.storage.from_(storage_service.bucket_name).upload(
                        path=img_path,
                        file=elem.image_bytes,
                        file_options={"content-type": mime, "upsert": "true"},
                    )
                    image_url = client.storage.from_(
                        storage_service.bucket_name
                    ).get_public_url(img_path)
                    elem.image_ext = image_url  # temporarily attach URL

                    # Vision captioning
                    caption = await embedding_service.caption_image(elem.image_bytes, mime_type=mime)
                    elem.content = f"[Figure on Page {elem.page_number}]: {caption}"
                except Exception as img_err:
                    logger.warning(f"Failed to upload or caption image {idx}: {img_err}")

        # 5. Semantic Chunking
        chunks = semantic_chunker.chunk_elements(elements)
        logger.info(f"Generated {len(chunks)} semantic chunks for document {document_id}")

        # If instruction is provided, prepend it to the document summary or first chunk context
        if instruction and chunks:
            chunks[0].content = f"[User Reading Instruction: {instruction.strip()}]\n\n" + chunks[0].content

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
                        "image_url": c.image_bytes if isinstance(c.image_bytes, str) else None,
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
            return [dict(row._mapping) for row in res.fetchall()]

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
