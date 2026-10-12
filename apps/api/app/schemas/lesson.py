from typing import List, Literal, Optional
from pydantic import BaseModel, Field

MoveType = Literal["intro", "explain", "example", "analogy", "recap", "check"]

class Sentence(BaseModel):
    text: str = Field(..., description="Individual spoken sentence text")
    duration_estimate_ms: int = Field(..., description="Estimated spoken duration in milliseconds")

class LessonSegment(BaseModel):
    id: str = Field(..., description="Unique segment identifier")
    doc_id: str = Field(..., description="Parent document UUID")
    ord: int = Field(..., description="Sequential segment order (0-indexed)")
    chunk_ids: List[str] = Field(default_factory=list, description="IDs of chunks covered by this segment")
    move: MoveType = Field(..., description="Pedagogical move type")
    script: str = Field(..., description="Conversational, spoken-friendly teaching script")
    sentences: List[Sentence] = Field(default_factory=list, description="Script split into discrete timed sentences")

class ReadingSession(BaseModel):
    id: str = Field(..., description="Unique session identifier")
    doc_id: str = Field(..., description="Associated document UUID")
    seg_ord: int = Field(default=0, description="Current segment order cursor")
    sent_idx: int = Field(default=0, description="Current sentence index cursor within segment")
    created_at: str = Field(..., description="ISO 8601 creation timestamp")
    updated_at: str = Field(..., description="ISO 8601 last update timestamp")

class LessonPlanRequest(BaseModel):
    doc_id: str = Field(..., description="Document ID to generate lesson for")
    focus_chunk_ids: Optional[List[str]] = Field(default=None, description="Optional subset of chunk IDs to focus on")

class LessonPlanResponse(BaseModel):
    session_id: str = Field(..., description="Active session ID")
    doc_id: str = Field(..., description="Document ID")
    segments: List[LessonSegment] = Field(default_factory=list, description="List of structured lesson segments")

class UpdateCursorRequest(BaseModel):
    seg_ord: int = Field(..., ge=0, description="Segment order index")
    sent_idx: int = Field(..., ge=0, description="Sentence index within segment")
