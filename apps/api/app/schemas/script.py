"""Schemas for AI-generated dictation scripts linked to PDF bboxes."""

from typing import Any, Optional
from pydantic import BaseModel


class ScriptSegment(BaseModel):
    """A single short spoken script segment (1-2 sentences) linked to a document chunk & bbox."""
    id: str
    chunk_id: str
    segment_index: int
    text: str
    page_number: int
    bbox: Optional[dict[str, Any]] = None


class ScriptRequest(BaseModel):
    """Request parameters for script generation."""
    voice_style: Optional[str] = "natural"
    language: Optional[str] = "en"
    force_regenerate: Optional[bool] = False
    paragraphs: Optional[list[dict[str, Any]]] = None


class ScriptResponse(BaseModel):
    """List of script segments linked to PDF bounding boxes."""
    document_id: str
    segments: list[ScriptSegment]

