from datetime import datetime, timezone
from typing import Dict, List, Optional
import fitz
from fastapi import APIRouter, File, UploadFile, HTTPException, Query, Depends, status
from pydantic import BaseModel, Field

from app.schemas.response import ApiResponse
from app.schemas.document import DocumentChunk, DocumentMeta
from app.ingest.parse import parse_pdf_bytes, DocumentParsed
from app.search.hybrid import GLOBAL_SEARCH_ENGINE, SearchResponse, SearchMode
from app.core.auth import get_current_user, User

router = APIRouter(prefix="/documents", tags=["documents"])

def verify_document_access(doc: DocumentParsed, user: User) -> None:
    """Enforce multi-tenant document isolation (Step 12)."""
    if doc.owner_id is not None and doc.owner_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access forbidden: you do not have permission to access this document.",
        )

class SearchRequestPayload(BaseModel):
    query: str = Field(..., min_length=1, description="Search query string")
    limit: int = Field(5, ge=1, le=50, description="Max number of hits")
    mode: SearchMode = Field("hybrid", description="Search mode: hybrid, vector, or bm25")

# In-memory document storage for prototype
DOCUMENTS_STORE: Dict[str, DocumentParsed] = {}

@router.post("/sample", response_model=ApiResponse[DocumentMeta], status_code=status.HTTP_201_CREATED)
def create_and_ingest_sample() -> ApiResponse[DocumentMeta]:
    """Generate and ingest a real multi-page AI textbook PDF in memory."""
    doc = fitz.open()

    p1 = doc.new_page(width=680, height=920)
    p1.insert_text(fitz.Point(54, 80), "Chapter 1: The Geometry of Deep Learning", fontsize=20)
    p1.insert_text(fitz.Point(54, 115), "1.1 Introduction to Normalized Feature Spaces", fontsize=13)
    p1.insert_text(fitz.Point(54, 160), "In modern machine learning architectures, high-dimensional representations are routinely projected onto compact manifolds. When analyzing neural networks, spatial normalization ensures invariance under scale transformations.", fontsize=11)
    p1.insert_text(fitz.Point(54, 230), "The fundamental theorem of representation geometry states that continuous activations can be bounded within normalized coordinate simplices. By anchoring coordinates within fractional bounds (0.0 to 1.0), visual grounding systems decouple document rendering from physical device pixels.", fontsize=11)
    p1.insert_text(fitz.Point(54, 310), "Consider a bounding box defined by [x0, y0, x1, y1]. As long as these coordinates remain dimensionless fractions of the total canvas dimension, zoom factors from 50% to 200% preserve zero pixel drift across any viewport aspect ratio.", fontsize=11)

    p2 = doc.new_page(width=680, height=920)
    p2.insert_text(fitz.Point(54, 80), "Chapter 1.2: Attention Weights & Alignment", fontsize=20)
    p2.insert_text(fitz.Point(54, 115), "Mathematical Formulation of Cross-Attention", fontsize=13)
    p2.insert_text(fitz.Point(54, 160), "Cross-attention matrices dynamically align auditory speech tokens with physical document tokens. When a student pauses to ask a question, the attention map highlights the precise semantic region under discussion.", fontsize=11)
    p2.insert_text(fitz.Point(54, 230), "Dual-source grounding requires verifying both local textbook anchors and real-time search context. If a theorem cited in sentence 3 references external evidence, the system renders multi-chromatic highlights: cyan for local book context and amber for external search chips.", fontsize=11)
    p2.insert_text(fitz.Point(54, 310), "Empirical evaluations demonstrate that visual bounding indicators reduce student cognitive load by 42% compared to unanchored auditory narration alone.", fontsize=11)

    p3 = doc.new_page(width=680, height=920)
    p3.insert_text(fitz.Point(54, 80), "Chapter 1.3: Real-Time Barge-In & State Resumption", fontsize=20)
    p3.insert_text(fitz.Point(54, 115), "Sub-300ms Interruption and Pedagogical Bridge", fontsize=13)
    p3.insert_text(fitz.Point(54, 160), "Human-to-human tutoring relies heavily on natural conversational interruptions. Traditional speech pipelines incur high latency due to sequential round-trip server calls for voice activity detection.", fontsize=11)
    p3.insert_text(fitz.Point(54, 230), "By placing voice activity detection on the client edge using Silero ONNX models, the audio playback graph is muted in under 50 milliseconds upon speech detection. The backend concurrently computes pedagogical resumption vectors.", fontsize=11)
    p3.insert_text(fitz.Point(54, 310), "Once the student query is resolved, the narrator delivers a natural conversational bridge line before resuming playback at the exact sentence cursor without losing context.", fontsize=11)

    pdf_bytes = doc.write()
    doc.close()

    parsed = parse_pdf_bytes(pdf_bytes, filename="Geometry_of_Deep_Learning.pdf")
    DOCUMENTS_STORE[parsed.doc_id] = parsed
    GLOBAL_SEARCH_ENGINE.index_document(parsed.doc_id, parsed.chunks)

    meta = DocumentMeta(
        id=parsed.doc_id,
        title=parsed.title,
        page_count=parsed.page_count,
        chunks_count=len(parsed.chunks),
        status="parsed",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    return ApiResponse(
        success=True,
        data=meta,
        message=f"Generated and parsed sample textbook PDF '{parsed.title}' into {len(parsed.chunks)} pedagogical chunks.",
    )


@router.post("", response_model=ApiResponse[DocumentMeta], status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
) -> ApiResponse[DocumentMeta]:
    """Upload a PDF document, synchronously parse text blocks and normalized bounding boxes,
    and return document metadata.
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF documents (.pdf) are supported.",
        )

    content = await file.read()
    if not content or len(content) < 10:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    try:
        parsed: DocumentParsed = parse_pdf_bytes(content, filename=file.filename)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Failed to parse PDF document: {str(exc)}",
        )

    parsed.owner_id = current_user.id if not current_user.is_guest else None
    DOCUMENTS_STORE[parsed.doc_id] = parsed
    GLOBAL_SEARCH_ENGINE.index_document(parsed.doc_id, parsed.chunks)

    meta = DocumentMeta(
        id=parsed.doc_id,
        owner_id=parsed.owner_id,
        title=parsed.title,
        page_count=parsed.page_count,
        chunks_count=len(parsed.chunks),
        status="parsed",
        created_at=datetime.now(timezone.utc).isoformat(),
    )

    return ApiResponse(
        success=True,
        data=meta,
        message=f"Document '{parsed.title}' parsed into {len(parsed.chunks)} pedagogical chunks.",
    )

@router.get("/{doc_id}", response_model=ApiResponse[DocumentMeta])
def get_document(doc_id: str, current_user: User = Depends(get_current_user)) -> ApiResponse[DocumentMeta]:
    """Retrieve document metadata by document ID with multi-tenant access control."""
    parsed = DOCUMENTS_STORE.get(doc_id)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{doc_id}' not found.",
        )

    verify_document_access(parsed, current_user)

    meta = DocumentMeta(
        id=parsed.doc_id,
        owner_id=parsed.owner_id,
        title=parsed.title,
        page_count=parsed.page_count,
        chunks_count=len(parsed.chunks),
        status="parsed",
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    return ApiResponse(success=True, data=meta)

@router.get("/{doc_id}/chunks", response_model=ApiResponse[List[DocumentChunk]])
def get_document_chunks(
    doc_id: str,
    page_no: Optional[int] = Query(None, description="Filter chunks by 1-indexed page number", ge=1),
    current_user: User = Depends(get_current_user),
) -> ApiResponse[List[DocumentChunk]]:
    """Retrieve parsed pedagogical chunks with normalized bounding boxes."""
    parsed = DOCUMENTS_STORE.get(doc_id)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{doc_id}' not found.",
        )

    verify_document_access(parsed, current_user)

    chunks = parsed.chunks
    if page_no is not None:
        chunks = [c for c in chunks if c.page_no == page_no]

    return ApiResponse(
        success=True,
        data=chunks,
        message=f"Retrieved {len(chunks)} chunks.",
    )

@router.post("/{doc_id}/search", response_model=ApiResponse[SearchResponse])
def search_document(
    doc_id: str,
    payload: SearchRequestPayload,
    current_user: User = Depends(get_current_user),
) -> ApiResponse[SearchResponse]:
    """Step 11: Execute hybrid search combining BM25 keyword and 768-dim vector embeddings with RRF."""
    parsed = DOCUMENTS_STORE.get(doc_id)
    if not parsed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{doc_id}' not found.",
        )

    verify_document_access(parsed, current_user)

    # Ensure document is indexed
    if doc_id not in GLOBAL_SEARCH_ENGINE.doc_chunks:
        GLOBAL_SEARCH_ENGINE.index_document(doc_id, parsed.chunks)

    results = GLOBAL_SEARCH_ENGINE.search(
        doc_id=doc_id,
        query=payload.query,
        limit=payload.limit,
        mode=payload.mode,
    )

    return ApiResponse(
        success=True,
        data=results,
        message=f"Found {len(results.hits)} matches using {payload.mode} search.",
    )
