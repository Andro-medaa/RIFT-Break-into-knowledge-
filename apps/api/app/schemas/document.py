from typing import List, Optional
from pydantic import BaseModel, Field

class NormalizedRect(BaseModel):
    """Normalized bounding rectangle in fractions (0.0 to 1.0) of page bounds.
    Top-left origin: (x0, y0) top-left, (x1, y1) bottom-right.
    """
    x0: float = Field(..., ge=0.0, le=1.0)
    y0: float = Field(..., ge=0.0, le=1.0)
    x1: float = Field(..., ge=0.0, le=1.0)
    y1: float = Field(..., ge=0.0, le=1.0)

class DocumentChunk(BaseModel):
    id: str
    doc_id: str
    ord: int
    page_no: int
    rects: List[NormalizedRect]
    kind: str = "paragraph"  # heading | paragraph | figure_caption | table
    text: str
    word_count: int

class DocumentMeta(BaseModel):
    id: str
    title: str
    page_count: int
    chunks_count: int
    status: str = "parsed"
    created_at: str
