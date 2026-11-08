"""API routes for uploading, retrieving, ingesting, and querying PDF documents in Supabase."""

from typing import Any, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel, Field

from app.middleware.auth import get_required_owner_id
from app.schemas.script import ScriptRequest, ScriptResponse
from app.services.ingest import ingestion_service
from app.services.rag import rag_service
from app.services.script import script_service
from app.services.storage import StorageError, storage_service

router = APIRouter(prefix="/api/documents", tags=["Documents"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class UploadByAddressRequest(BaseModel):
    """Payload to upload a PDF by providing a local file path or remote URL."""

    file_address: str = Field(
        ...,
        description="Local file system path or remote HTTP/HTTPS URL of the PDF.",
        examples=[
            "C:/Users/sahoo/Desktop/sample.pdf",
            "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
        ],
    )
    instruction: Optional[str] = Field(
        None,
        description="Optional user instruction / focus directive for document ingestion & RAG.",
    )


class DocumentResponse(BaseModel):
    """Response containing document metadata and the Supabase Storage access link."""

    id: str
    owner_id: str
    filename: str
    file_url: str = Field(..., description="Public/accessible URL to view or download the PDF.")
    storage_path: str
    file_size: int
    mime_type: str = "application/pdf"
    created_at: Optional[Any] = None


class DeleteResponse(BaseModel):
    success: bool
    message: str


class IngestionResponse(BaseModel):
    document_id: str
    filename: Optional[str] = None
    chunks_count: int
    text_chunks: int
    table_chunks: int
    image_chunks: int
    instruction_applied: bool


class QueryRequest(BaseModel):
    question: str = Field(..., description="User's question about the PDF.")
    instruction: Optional[str] = Field(None, description="Optional focus / system instruction.")
    paragraphs: Optional[list[dict[str, Any]]] = Field(None, description="Client-extracted paragraphs with bboxes fallback.")


class CitationResponse(BaseModel):
    id: str
    label: str
    page: Optional[int] = 1
    paragraphId: Optional[str] = None
    bbox: Optional[dict[str, float]] = None
    chunkType: Optional[str] = None
    imageUrl: Optional[str] = None
    source: Optional[str] = "pdf"
    url: Optional[str] = None
    snippet: Optional[str] = None


class QueryResponse(BaseModel):
    answer: str
    citations: list[CitationResponse] = []


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post(
    "/upload-by-address",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload PDF from file address or URL",
    description="Accepts a local file path or remote HTTP/HTTPS URL, loads the PDF, "
                "uploads it to Supabase Storage, and initiates background ingestion.",
)
async def upload_document_by_address(
    payload: UploadByAddressRequest,
    background_tasks: BackgroundTasks,
    owner_id: str = Depends(get_required_owner_id),
) -> DocumentResponse:
    """Takes a file address, loads it to Supabase, and triggers background ingestion."""
    try:
        doc = await storage_service.upload_from_address(
            file_address=payload.file_address,
            owner_id=owner_id,
        )
        # Background task for multimodal chunking and Gemini vector embedding
        background_tasks.add_task(
            ingestion_service.ingest_document,
            document_id=doc["id"],
            owner_id=owner_id,
            instruction=payload.instruction,
        )
        return DocumentResponse(**doc)
    except StorageError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post(
    "/upload",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload PDF via multipart form data",
    description="Uploads a PDF file directly from a client form, stores it in Supabase, "
                "and initiates background multimodal ingestion with optional user instruction.",
)
async def upload_document_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(..., description="PDF file to upload"),
    instruction: Optional[str] = Form(None, description="Optional user instruction / focus directive"),
    owner_id: str = Depends(get_required_owner_id),
) -> DocumentResponse:
    """Direct multipart file upload to Supabase Storage with optional instruction."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .pdf files are accepted.",
        )

    content = await file.read()
    try:
        doc = await storage_service.upload_and_register(
            file_bytes=content,
            filename=file.filename,
            owner_id=owner_id,
        )
        # Background task for multimodal chunking and Gemini vector embedding
        background_tasks.add_task(
            ingestion_service.ingest_document,
            document_id=doc["id"],
            owner_id=owner_id,
            instruction=instruction,
        )
        return DocumentResponse(**doc)
    except StorageError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post(
    "/{document_id}/ingest",
    response_model=IngestionResponse,
    summary="Trigger document ingestion",
    description="Explicitly runs the multimodal ingestion pipeline (tables, images, text, and vector embeddings).",
)
async def ingest_document_endpoint(
    document_id: str,
    instruction: Optional[str] = None,
    owner_id: str = Depends(get_required_owner_id),
) -> IngestionResponse:
    """Explicitly trigger ingestion for a document."""
    try:
        result = await ingestion_service.ingest_document(
            document_id=document_id,
            owner_id=owner_id,
            instruction=instruction,
        )
        return IngestionResponse(**result)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc


@router.get(
    "/{document_id}/chunks",
    summary="Get document chunks with bboxes",
    description="Returns all extracted chunks, bounding boxes, and hierarchy for the PDF viewer and transcript.",
)
async def get_document_chunks_endpoint(
    document_id: str,
    owner_id: str = Depends(get_required_owner_id),
) -> list[dict[str, Any]]:
    """Get all extracted chunks for UI display."""
    try:
        return await ingestion_service.get_document_chunks(document_id=document_id, owner_id=owner_id)
    except Exception as exc:
        return []


@router.post(
    "/{document_id}/query",
    response_model=QueryResponse,
    summary="Query document with RAG",
    description="Performs hybrid search (dense vector + full-text) and generates an answer with citations.",
)
async def query_document_endpoint(
    document_id: str,
    payload: QueryRequest,
    owner_id: str = Depends(get_required_owner_id),
) -> QueryResponse:
    """Query a document using hybrid search and Gemini."""
    result = await rag_service.query(
        document_id=document_id,
        owner_id=owner_id,
        question=payload.question,
        instruction=payload.instruction,
        client_paragraphs=payload.paragraphs,
    )
    return QueryResponse(**result)


@router.post(
    "/{document_id}/script",
    response_model=ScriptResponse,
    summary="Generate spoken script linked to bboxes",
    description="Uses Gemini Flash to convert document chunks into 1-2 line spoken segments linked to bboxes.",
)
async def generate_script_endpoint(
    document_id: str,
    payload: Optional[ScriptRequest] = None,
    owner_id: str = Depends(get_required_owner_id),
) -> ScriptResponse:
    """Generate spoken script segments for the document."""
    req = payload or ScriptRequest()
    return await script_service.generate_script(
        document_id=document_id,
        owner_id=owner_id,
        voice_style=req.voice_style or "natural",
        language=req.language or "en",
        force_regenerate=req.force_regenerate or False,
        fallback_chunks=req.paragraphs,
    )


@router.get(
    "/{document_id}/script",
    response_model=ScriptResponse,
    summary="Get spoken script segments",
    description="Fetches cached or generates spoken script segments linked to bboxes.",
)
async def get_script_endpoint(
    document_id: str,
    voice_style: str = "natural",
    language: str = "en",
    owner_id: str = Depends(get_required_owner_id),
) -> ScriptResponse:
    """Get spoken script segments for the document."""
    return await script_service.generate_script(
        document_id=document_id,
        owner_id=owner_id,
        voice_style=voice_style,
        language=language,
    )


@router.get(
    "",
    response_model=list[DocumentResponse],
    summary="List all uploaded PDFs for authenticated user",
    description="Returns all PDF documents owned by the caller with their accessible file links.",
)
async def list_documents(
    owner_id: str = Depends(get_required_owner_id),
) -> list[DocumentResponse]:
    """List documents scoped to the caller's owner_id."""
    docs = await storage_service.list_documents(owner_id=owner_id)
    return [DocumentResponse(**d) for d in docs]


@router.get(
    "/{document_id}",
    response_model=DocumentResponse,
    summary="Get single document link & metadata",
    description="Fetches document metadata and access link by ID (strictly scoped to owner).",
)
async def get_document(
    document_id: str,
    owner_id: str = Depends(get_required_owner_id),
) -> DocumentResponse:
    """Get single document metadata and link."""
    doc = await storage_service.get_document(document_id=document_id, owner_id=owner_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found.",
        )
    return DocumentResponse(**doc)


@router.delete(
    "/{document_id}",
    response_model=DeleteResponse,
    summary="Delete document",
    description="Removes the PDF from Supabase Storage and deletes its database record.",
)
async def delete_document(
    document_id: str,
    owner_id: str = Depends(get_required_owner_id),
) -> DeleteResponse:
    """Delete a document from storage and database."""
    deleted = await storage_service.delete_document(document_id=document_id, owner_id=owner_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Document '{document_id}' not found or not owned by caller.",
        )
    return DeleteResponse(success=True, message=f"Document '{document_id}' deleted successfully.")
