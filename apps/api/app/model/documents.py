"""Document model definition for PDF files uploaded to Supabase Storage."""

from sqlalchemy import (
    Column,
    DateTime,
    Integer,
    String,
    Table,
    Text,
    func,
)

from app.model.base import metadata

# Documents table: tracks PDF documents uploaded to Supabase Storage
# Every query in services/ MUST be scoped by owner_id
documents = Table(
    "documents",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("owner_id", String(64), nullable=False, index=True),
    Column("filename", String(255), nullable=False),
    Column("file_url", Text, nullable=False),
    Column("storage_path", String(500), nullable=False),
    Column("file_size", Integer, nullable=False),
    Column("mime_type", String(100), default="application/pdf", nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column("updated_at", DateTime(timezone=True), onupdate=func.now(), nullable=True),
)

