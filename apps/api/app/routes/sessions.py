from datetime import datetime, timezone
import uuid
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Query, status
from fastapi.responses import StreamingResponse

from app.schemas.response import ApiResponse
from app.schemas.lesson import (
    ReadingSession,
    LessonSegment,
    LessonPlanRequest,
    LessonPlanResponse,
    UpdateCursorRequest,
)
from app.schemas.qa import AskRequest, AskResponse
from app.schemas.document import DocumentChunk, NormalizedRect
from app.ingest.parse import DocumentParsed
from app.teach.planner import plan_lesson
from app.teach.qa import answer_grounded_question, stream_grounded_answer
from app.security.defense import scan_for_prompt_injection, sanitize_user_input

router = APIRouter(prefix="/sessions", tags=["sessions"])

# In-memory stores for prototype sessions and generated lesson plans
DOCUMENTS_STORE: Dict[str, DocumentParsed] = {}
SESSIONS_STORE: Dict[str, ReadingSession] = {}
PLANS_STORE: Dict[str, List[LessonSegment]] = {}


def get_or_create_document(doc_id: str) -> DocumentParsed:
    """Retrieve document from in-memory store or create a dynamic parsed structure."""
    if doc_id in DOCUMENTS_STORE:
        return DOCUMENTS_STORE[doc_id]

    doc = DocumentParsed(
        doc_id=doc_id,
        title=f"Document {doc_id[:8]}",
        page_count=3,
        chunks=[
            DocumentChunk(
                id=f"{doc_id}-c1",
                doc_id=doc_id,
                ord=0,
                page_no=1,
                rects=[NormalizedRect(x0=0.08, y0=0.1, x1=0.92, y1=0.25)],
                kind="paragraph",
                text="The fundamental theorem of representation geometry states that continuous activations can be bounded within normalized coordinate simplices. By anchoring coordinates within fractional bounds (0.0 to 1.0), visual grounding systems decouple document rendering from physical device pixels.",
                word_count=36,
            ),
            DocumentChunk(
                id=f"{doc_id}-c2",
                doc_id=doc_id,
                ord=1,
                page_no=1,
                rects=[NormalizedRect(x0=0.08, y0=0.28, x1=0.92, y1=0.45)],
                kind="paragraph",
                text="Consider a bounding box defined by [x0, y0, x1, y1]. As long as these coordinates remain dimensionless fractions of the total canvas dimension, zoom factors from 50% to 200% preserve zero pixel drift across any viewport aspect ratio.",
                word_count=38,
            ),
        ],
    )
    DOCUMENTS_STORE[doc_id] = doc
    return doc


@router.post("", response_model=ApiResponse[ReadingSession], status_code=status.HTTP_201_CREATED)
def create_session(payload: LessonPlanRequest) -> ApiResponse[ReadingSession]:
    """Initialize or resume a reading session for a parsed document."""
    doc = get_or_create_document(payload.doc_id)

    now = datetime.now(timezone.utc).isoformat()
    session_id = str(uuid.uuid4())
    session = ReadingSession(
        id=session_id,
        doc_id=payload.doc_id,
        seg_ord=0,
        sent_idx=0,
        created_at=now,
        updated_at=now,
    )
    SESSIONS_STORE[session_id] = session

    return ApiResponse(
        success=True,
        data=session,
        message="Reading session initialized successfully.",
    )


@router.get("/{session_id}", response_model=ApiResponse[ReadingSession])
def get_session(session_id: str) -> ApiResponse[ReadingSession]:
    """Retrieve session state and current reading cursor."""
    session = SESSIONS_STORE.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )
    return ApiResponse(success=True, data=session)


@router.post("/{session_id}/plan", response_model=ApiResponse[LessonPlanResponse])
def generate_plan(session_id: str, payload: Optional[LessonPlanRequest] = None) -> ApiResponse[LessonPlanResponse]:
    """Generate or regenerate structured lesson plan for this session using Gemini / teacher engine."""
    session = SESSIONS_STORE.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )

    doc_id = payload.doc_id if payload else session.doc_id
    doc = get_or_create_document(doc_id)

    chunks = doc.chunks
    if payload and payload.focus_chunk_ids:
        chunks = [c for c in chunks if c.id in payload.focus_chunk_ids]

    segments = plan_lesson(doc_id=doc_id, chunks=chunks, doc_title=doc.title)
    PLANS_STORE[session_id] = segments

    return ApiResponse(
        success=True,
        data=LessonPlanResponse(
            session_id=session_id,
            doc_id=doc_id,
            segments=segments,
        ),
        message=f"Generated {len(segments)} pedagogical segments for '{doc.title}'.",
    )


@router.get("/{session_id}/segments", response_model=ApiResponse[List[LessonSegment]])
def get_segments(
    session_id: str,
    from_ord: int = Query(0, ge=0, description="Starting segment ord (0-indexed)"),
    count: int = Query(20, ge=1, le=100, description="Maximum number of segments to return"),
) -> ApiResponse[List[LessonSegment]]:
    """Fetch structured lesson plan segments, automatically generating them if not yet planned."""
    session = SESSIONS_STORE.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )

    # Check if plan already exists in cache
    segments = PLANS_STORE.get(session_id)
    if segments is None:
        doc = get_or_create_document(session.doc_id)
        segments = plan_lesson(doc_id=session.doc_id, chunks=doc.chunks, doc_title=doc.title)
        PLANS_STORE[session_id] = segments

    sliced = segments[from_ord : from_ord + count]
    return ApiResponse(
        success=True,
        data=sliced,
        message=f"Retrieved {len(sliced)} segments (total: {len(segments)}).",
    )


@router.patch("/{session_id}/cursor", response_model=ApiResponse[ReadingSession])
def update_cursor(session_id: str, payload: UpdateCursorRequest) -> ApiResponse[ReadingSession]:
    """Update current lesson cursor (seg_ord, sent_idx) for state persistence."""
    session = SESSIONS_STORE.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )

    session.seg_ord = payload.seg_ord
    session.sent_idx = payload.sent_idx
    session.updated_at = datetime.now(timezone.utc).isoformat()

    return ApiResponse(
        success=True,
        data=session,
        message=f"Cursor updated to segment {session.seg_ord}, sentence {session.sent_idx}.",
    )


@router.post("/{session_id}/ask")
async def ask_question(
    session_id: str,
    payload: AskRequest,
    stream: bool = Query(False, description="Whether to stream the answer via Server-Sent Events (SSE)"),
):
    """
    Step 9: Dual-Grounded Q&A with book citations ([c1], [c2]) and external web citations.
    Supports both instant JSON responses and Server-Sent Events (SSE) streaming.
    """
    session = SESSIONS_STORE.get(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Session '{session_id}' not found.",
        )

    doc = get_or_create_document(session.doc_id)

    # Step 15: Prompt Injection Guard & Input Sanitization
    is_suspicious, reason = scan_for_prompt_injection(payload.question)
    if is_suspicious:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security alert: prompt injection pattern detected ({reason}). Please phrase your question directly about the lesson.",
        )
    clean_question = sanitize_user_input(payload.question)

    if stream:
        return StreamingResponse(
            stream_grounded_answer(
                session_id=session_id,
                question=clean_question,
                chunks=doc.chunks,
                active_chunk_id=payload.active_chunk_id,
                doc_title=doc.title,
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )

    response_data = answer_grounded_question(
        session_id=session_id,
        question=clean_question,
        chunks=doc.chunks,
        active_chunk_id=payload.active_chunk_id,
        doc_title=doc.title,
    )

    return ApiResponse(
        success=True,
        data=response_data,
        message="Generated dual-grounded answer with citations.",
    )
