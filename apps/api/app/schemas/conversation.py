"""Pydantic schemas for Conversation Threads and Chat Messages."""

from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, Field


class CitationModel(BaseModel):
    id: str
    number: Optional[int] = None
    label: str
    page: Optional[int] = None
    paragraphId: Optional[str] = None
    bbox: Optional[dict[str, Any]] = None
    chunkType: Optional[str] = "text"
    imageUrl: Optional[str] = None
    source: Optional[str] = "pdf"
    url: Optional[str] = None
    snippet: Optional[str] = None


class ChatMessageItem(BaseModel):
    id: str
    conversation_id: str
    document_id: str
    owner_id: str
    role: str  # 'user' | 'assistant'
    content: str
    citations: list[CitationModel] = Field(default_factory=list)
    sequence_number: int = 0
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class ConversationItem(BaseModel):
    id: str
    document_id: str
    owner_id: str
    title: str
    system_prompt: Optional[str] = None
    summary: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    message_count: int = 0


class ConversationDetailResponse(BaseModel):
    conversation: ConversationItem
    messages: list[ChatMessageItem]


class CreateConversationRequest(BaseModel):
    title: Optional[str] = "New Discussion"
    system_prompt: Optional[str] = None


class UpdateConversationRequest(BaseModel):
    title: Optional[str] = None
    system_prompt: Optional[str] = None


class QueryConversationRequest(BaseModel):
    question: str
    instruction: Optional[str] = None
    paragraphs: Optional[list[dict[str, Any]]] = None
    file_url: Optional[str] = None


class EditMessageRequest(BaseModel):
    new_content: str
    instruction: Optional[str] = None
    paragraphs: Optional[list[dict[str, Any]]] = None
    file_url: Optional[str] = None


class RetryMessageRequest(BaseModel):
    instruction: Optional[str] = None
    paragraphs: Optional[list[dict[str, Any]]] = None
    file_url: Optional[str] = None
