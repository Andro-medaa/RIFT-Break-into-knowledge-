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
    chapter_heading: Optional[str] = None
    chunk_type: Optional[str] = "text"
    image_url: Optional[str] = None


class ScriptRequest(BaseModel):
    """Request parameters for script generation."""
    voice_style: Optional[str] = "natural"
    language: Optional[str] = "en"
    force_regenerate: Optional[bool] = False
    paragraphs: Optional[list[dict[str, Any]]] = None
    instruction: Optional[str] = None
    content_filter: Optional[str] = None  # "all" | "images_only" | "tables_only"


class ScriptResponse(BaseModel):
    """List of script segments linked to PDF bounding boxes."""
    document_id: str
    segments: list[ScriptSegment]
    instruction: Optional[str] = None

