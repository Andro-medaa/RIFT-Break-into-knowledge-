"""Conversation and Chat Message models for persistent multi-thread RAG."""

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
from sqlalchemy.dialects.postgresql import JSONB

from app.model.base import metadata

# ── Conversations Table (Threads) ─────────────────────────────────────────────
# Tracks independent discussion threads scoped to a PDF document and user.
conversations = Table(
    "conversations",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("document_id", String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("owner_id", String(64), nullable=False, index=True),
    Column("title", String(255), default="New Discussion", nullable=False),
    Column("system_prompt", Text, nullable=True),  # Thread directive / persona
    Column("summary", Text, nullable=True),        # Rolling abstractive memory of older turns
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column("updated_at", DateTime(timezone=True), onupdate=func.now(), nullable=True),
)

# ── Chat Messages Table ───────────────────────────────────────────────────────
# Stores individual user questions and assistant answers with grounded citations.
chat_messages = Table(
    "chat_messages",
    metadata,
    Column("id", String(36), primary_key=True),
    Column("conversation_id", String(36), ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("document_id", String(36), ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True),
    Column("owner_id", String(64), nullable=False, index=True),
    Column("role", String(20), nullable=False),  # 'user' | 'assistant'
    Column("content", Text, nullable=False),
    Column("citations", JSON().with_variant(JSONB, "postgresql"), default=list, nullable=True),
    Column("sequence_number", Integer, default=0, nullable=False),
    Column("created_at", DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column("updated_at", DateTime(timezone=True), onupdate=func.now(), nullable=True),
)
