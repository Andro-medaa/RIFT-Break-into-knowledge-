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
from app.routes.documents import DOCUMENTS_STORE
from app.teach.planner import plan_lesson
from app.teach.qa import answer_grounded_question, stream_grounded_answer

router = APIRouter(prefix="/sessions", tags=["sessions"])

# In-memory stores for prototype sessions and generated lesson plans
SESSIONS_STORE: Dict[str, ReadingSession] = {}
PLANS_STORE: Dict[str, List[LessonSegment]] = {}


@router.post("", response_model=ApiResponse[ReadingSession], status_code=status.HTTP_201_CREATED)
def create_session(payload: LessonPlanRequest) -> ApiResponse[ReadingSession]:
    """Initialize or resume a reading session for a parsed document."""
    doc = DOCUMENTS_STORE.get(payload.doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{payload.doc_id}' not found. Please upload or ingest a document first.",
        )

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
    doc = DOCUMENTS_STORE.get(doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{doc_id}' not found.",
        )

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
        doc = DOCUMENTS_STORE.get(session.doc_id)
        if not doc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Document '{session.doc_id}' not found.",
            )
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

    doc = DOCUMENTS_STORE.get(session.doc_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{session.doc_id}' not found.",
        )

    if stream:
        return StreamingResponse(
            stream_grounded_answer(
                session_id=session_id,
                question=payload.question,
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
        question=payload.question,
        chunks=doc.chunks,
        active_chunk_id=payload.active_chunk_id,
        doc_title=doc.title,
    )

    return ApiResponse(
        success=True,
        data=response_data,
        message="Generated dual-grounded answer with citations.",
    )
