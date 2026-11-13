"""Service for managing PDF documents and Supabase Storage uploads.

Handles:
1. Loading PDF from local address, remote URL, or raw bytes.
2. Validating PDF integrity (magic bytes, size limits).
3. Uploading to Supabase Storage with tenant-isolated paths.
4. Generating accessible links for RAG frontend consumption.
5. Persisting metadata in PostgreSQL with mandatory owner_id scoping.
"""

from __future__ import annotations

import re
import uuid
from pathlib import Path
from typing import Any, Optional

import httpx
from sqlalchemy import delete, select

from app.core.config import setting
from app.core.db import (
    db_admin,
    get_db,
    get_db_connection,
    get_db_transaction,
    scope_by_owner,
)
from app.core.logger import get_logger
from app.model.documents import documents

logger = get_logger(__name__)

# Constants
MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024  # 50 MB
PDF_MAGIC_BYTES = b"%PDF-"


class StorageError(Exception):
    """Base exception for storage and file loading errors."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class StorageService:
    """Manages document uploads to Supabase Storage and database persistence."""

    def __init__(self, bucket_name: Optional[str] = None) -> None:
        self.bucket_name = bucket_name or setting.supabase_storage_bucket
        self._bucket_checked = False

    def _get_client(self):
        """Return the administrative Supabase client for storage operations."""
        if db_admin is None:
            raise StorageError(
                "Supabase admin client is not initialized. Check SUPABASE_URL and SUPABASE_SECRET_KEY.",
                status_code=500,
            )
        return db_admin

    def _ensure_bucket(self) -> None:
        """Ensure the target storage bucket exists; creates it if missing."""
        if self._bucket_checked:
            return

        client = self._get_client()
        try:
            existing = [b.name if hasattr(b, "name") else b.get("name") for b in client.storage.list_buckets()]
            if self.bucket_name not in existing:
                logger.info(f"Storage bucket '{self.bucket_name}' not found. Creating public bucket...")
                client.storage.create_bucket(self.bucket_name, options={"public": True})
            self._bucket_checked = True
        except Exception as exc:
            logger.warning(f"Could not verify/create bucket '{self.bucket_name}': {exc}")

    @staticmethod
    def sanitize_filename(filename: str) -> str:
        """Strip directory components and replace unsafe characters."""
        name = Path(filename).name
        # Keep alphanumeric, dots, underscores, dashes
        clean_name = re.sub(r"[^\w\-.]", "_", name)
        return clean_name or "document.pdf"

    @staticmethod
    def validate_pdf_content(content: bytes, filename: str) -> None:
        """Ensure content is a valid PDF and within acceptable size limits."""
        if not content:
            raise StorageError("File is empty (0 bytes).")

        if len(content) > MAX_PDF_SIZE_BYTES:
            raise StorageError(
                f"File size exceeds maximum limit of {MAX_PDF_SIZE_BYTES // (1024 * 1024)} MB."
            )

        # PDF files must start with %PDF- header within the first 1024 bytes
        if PDF_MAGIC_BYTES not in content[:1024]:
            raise StorageError(
                f"File '{filename}' does not appear to be a valid PDF (missing %PDF- header)."
            )

    async def load_bytes_from_address(self, file_address: str) -> tuple[bytes, str]:
        """Load file bytes from either a remote HTTP/HTTPS URL or a local file path.

        Returns:
            Tuple of (file_bytes, filename)
        """
        address = file_address.strip()
        if not address:
            raise StorageError("File address cannot be empty.")

        # Case 1: Remote URL (http:// or https://)
        if address.startswith(("http://", "https://")):
            logger.info(f"Downloading PDF from remote address: {address}")
            try:
                async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                    resp = await client.get(address)
                    if resp.status_code != 200:
                        raise StorageError(
                            f"Failed to fetch file from URL (HTTP {resp.status_code})",
                            status_code=400,
                        )
                    content = resp.content
                    url_path = Path(resp.url.path)
                    filename = url_path.name if url_path.name.lower().endswith(".pdf") else "downloaded.pdf"
                    return content, filename
            except httpx.RequestError as exc:
                raise StorageError(f"Network error while fetching file: {exc}") from exc

        # Case 2: Local file path
        local_path = Path(address).resolve()
        if not local_path.is_file():
            raise StorageError(f"Local file not found at: {address}", status_code=404)

        if not local_path.name.lower().endswith(".pdf"):
            raise StorageError(f"File '{local_path.name}' must have a .pdf extension.")

        try:
            content = local_path.read_bytes()
            return content, local_path.name
        except Exception as exc:
            raise StorageError(f"Failed to read local file: {exc}") from exc

    async def upload_and_register(
        self,
        file_bytes: bytes,
        filename: str,
        owner_id: str,
    ) -> dict[str, Any]:
        """Upload a validated PDF to Supabase Storage and register metadata in the database.

        Args:
            file_bytes: Raw bytes of the PDF.
            filename: Original filename.
            owner_id: ID of the authenticated user.

        Returns:
            Dictionary with document metadata including accessible file_url.
        """
        clean_name = self.sanitize_filename(filename)
        self.validate_pdf_content(file_bytes, clean_name)
        self._ensure_bucket()

        # Build tenant-isolated storage path: {owner_id}/{doc_id}_{filename}
        doc_id = str(uuid.uuid4())
        storage_path = f"{owner_id}/{doc_id}_{clean_name}"

        # Upload to Supabase Storage
        client = self._get_client()
        bucket = client.storage.from_(self.bucket_name)

        logger.info(f"Uploading to Supabase Storage: bucket={self.bucket_name}, path={storage_path}")
        try:
            bucket.upload(
                storage_path,
                file_bytes,
                file_options={"content-type": "application/pdf", "upsert": "true"},
            )
        except Exception as exc:
            logger.error(f"Supabase Storage upload failed: {exc}")
            raise StorageError(f"Storage upload failed: {exc}", status_code=502) from exc

        # Generate public URL (for public bucket)
        file_url = bucket.get_public_url(storage_path)

        doc_record = {
            "id": doc_id,
            "owner_id": owner_id,
            "filename": clean_name,
            "file_url": file_url,
            "storage_path": storage_path,
            "file_size": len(file_bytes),
            "mime_type": "application/pdf",
        }

        # Persist to database if database connection is available
        if setting.async_database_url:
            try:
                engine = get_db()
                async with get_db_transaction(engine) as conn:
                    await conn.execute(documents.insert().values(**doc_record))
                logger.info(f"Registered document {doc_id} in DB for owner {owner_id}")
            except Exception as exc:
                logger.warning(f"Database registration skipped: {exc}")

        return doc_record

    async def upload_from_address(self, file_address: str, owner_id: str) -> dict[str, Any]:
        """Loads PDF from user-provided file address, uploads to Supabase, and returns link."""
        file_bytes, filename = await self.load_bytes_from_address(file_address)
        return await self.upload_and_register(file_bytes, filename, owner_id)

    async def list_documents(self, owner_id: str) -> list[dict[str, Any]]:
        """List all documents belonging to owner_id.

        Queries database table when available; falls back to Supabase Storage bucket listing.
        """
        # 1. Try database query
        if setting.async_database_url:
            try:
                engine = get_db()
                async with get_db_connection(engine) as conn:
                    stmt = scope_by_owner(select(documents), documents, owner_id=owner_id)
                    rows = (await conn.execute(stmt)).mappings().fetchall()
                    return [dict(row) for row in rows]
            except Exception as exc:
                logger.warning(f"Database query failed, checking storage directly: {exc}")

        # 2. Fallback: Query Supabase Storage directly
        client = self._get_client()
        bucket = client.storage.from_(self.bucket_name)
        try:
            files = bucket.list(owner_id)
            results = []
            for f in files:
                fname = f.get("name", "")
                if not fname:
                    continue
                path = f"{owner_id}/{fname}"
                url = bucket.get_public_url(path)
                meta = f.get("metadata", {}) or {}
                doc_id = fname.split("_")[0] if "_" in fname else fname
                orig_name = "_".join(fname.split("_")[1:]) if "_" in fname else fname
                results.append(
                    {
                        "id": doc_id,
                        "owner_id": owner_id,
                        "filename": orig_name,
                        "file_url": url,
                        "storage_path": path,
                        "file_size": meta.get("size") or 0,
                        "mime_type": meta.get("mimetype") or "application/pdf",
                        "created_at": f.get("created_at"),
                    }
                )
            return results
        except Exception as exc:
            logger.error(f"Failed to list documents from Supabase storage: {exc}")
            return []

    async def get_document(self, document_id: str, owner_id: str) -> Optional[dict[str, Any]]:
        """Retrieve a single document, enforcing owner_id scoping."""
        if setting.async_database_url:
            try:
                engine = get_db()
                async with get_db_connection(engine) as conn:
                    stmt = scope_by_owner(
                        select(documents).where(documents.c.id == document_id),
                        documents,
                        owner_id=owner_id,
                    )
                    row = (await conn.execute(stmt)).mappings().fetchone()
                    if row:
                        return dict(row)
            except Exception as exc:
                logger.warning(f"Database query failed: {exc}")

        # Fallback: search in Supabase Storage directly if not found in DB
        try:
            client = self._get_client()
            bucket = client.storage.from_(self.bucket_name)
            files = bucket.list(owner_id)
            for f in files:
                fname = f.get("name", "")
                if document_id in fname:
                    path = f"{owner_id}/{fname}"
                    url = bucket.get_public_url(path)
                    meta = f.get("metadata", {}) or {}
                    orig_name = "_".join(fname.split("_")[1:]) if "_" in fname else fname
                    doc_rec = {
                        "id": document_id,
                        "owner_id": owner_id,
                        "filename": orig_name,
                        "file_url": url,
                        "storage_path": path,
                        "file_size": meta.get("size") or 0,
                        "mime_type": meta.get("mimetype") or "application/pdf",
                    }
                    if setting.async_database_url:
                        try:
                            engine = get_db()
                            async with get_db_transaction(engine) as conn:
                                await conn.execute(documents.insert().values(**doc_rec))
                        except Exception:
                            pass
                    return doc_rec
        except Exception as exc:
            logger.warning(f"Storage direct lookup fallback failed: {exc}")

        return None

    async def delete_document(self, document_id: str, owner_id: str) -> bool:
        """Delete a document from both Supabase Storage and database."""
        doc = await self.get_document(document_id, owner_id)
        if not doc:
            return False

        # Delete from storage
        try:
            client = self._get_client()
            client.storage.from_(self.bucket_name).remove([doc["storage_path"]])
        except Exception as exc:
            logger.warning(f"Could not delete storage file {doc['storage_path']}: {exc}")

        # Delete from DB
        if setting.async_database_url:
            try:
                engine = get_db()
                async with get_db_transaction(engine) as conn:
                    stmt = scope_by_owner(
                        delete(documents).where(documents.c.id == document_id),
                        documents,
                        owner_id=owner_id,
                    )
                    await conn.execute(stmt)
            except Exception as exc:
                logger.warning(f"Database deletion failed: {exc}")

        # Clean up persisted user instructions and cached scripts for this document
        try:
            from app.services.script import script_service

            script_service.clear_document_artifacts(document_id)
        except Exception as exc:
            logger.warning(f"Cleanup of script artifacts failed for {document_id}: {exc}")

        return True


storage_service = StorageService()
