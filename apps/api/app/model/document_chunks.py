"""Document chunks model definition for multimodal semantic RAG ingestion."""

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Integer,
    JSON,
    String,
    Table,
    Text,
    func,
)

from app.model.base import metadata

# Document chunks table: stores segmented multimodal content (text, table, image)
# with bounding boxes, structural metadata, and dense vector embeddings (768-dim Gemini).
document_chunks = Table(
    "document_chunks",
    metadata,
    Column("id", String(36), primary_key=True),
    Column(
        "document_id",
        String(36),
        ForeignKey("documents.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    ),
    Column("owner_id", String(64), nullable=False, index=True),
    Column("chunk_index", Integer, nullable=False),
    Column("chunk_type", String(32), default="text", nullable=False),  # 'text', 'table', 'image', 'heading'
    Column("content", Text, nullable=False),
    Column("parent_content", Text, nullable=True),
    Column("page_number", Integer, nullable=False),
    Column("bbox", JSON, nullable=False),  # {"x": float, "y": float, "w": float, "h": float} (normalized 0-1)
    Column("section_path", JSON, default=list, nullable=False),  # ["Heading 1", "Subheading 2"]
    Column("image_url", Text, nullable=True),
    Column("table_markdown", Text, nullable=True),
    Column("token_count", Integer, default=0, nullable=False),
    Column("embedding", Vector(768), nullable=True),  # Gemini text-embedding-004 (768 dimensions)
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
)

