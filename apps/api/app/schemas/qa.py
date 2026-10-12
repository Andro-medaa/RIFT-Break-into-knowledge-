from typing import List, Optional
from pydantic import BaseModel, Field


class BookCitation(BaseModel):
    alias: str = Field(..., description="Citation marker used in the text e.g. [c1]")
    chunk_id: str = Field(..., description="Referenced DocumentChunk UUID")
    page_no: int = Field(..., description="Page number of the chunk in PDF")
    snippet: str = Field(..., description="Relevant textual quote from the textbook")


class WebCitation(BaseModel):
    title: str = Field(..., description="Title of the web source or domain")
    url: str = Field(..., description="URL of the verified external resource")
    snippet: str = Field(..., description="External industry context or verified search snippet")


class AskRequest(BaseModel):
    question: str = Field(..., min_length=1, description="Student's question or interruption query")
    active_chunk_id: Optional[str] = Field(default=None, description="Currently highlighted chunk ID at interruption time")
    history: Optional[List[dict]] = Field(default_factory=list, description="Recent conversation turns for context")


class AskResponse(BaseModel):
    session_id: str = Field(..., description="Active session UUID")
    question: str = Field(..., description="Original user question")
    answer: str = Field(..., description="Dual-grounded teacher answer with [c1] citations")
    book_citations: List[BookCitation] = Field(default_factory=list, description="Grounding citations mapped to textbook chunks")
    web_citations: List[WebCitation] = Field(default_factory=list, description="External web citations")
