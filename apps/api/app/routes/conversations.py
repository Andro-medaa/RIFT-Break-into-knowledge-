"""FastAPI routes for Multi-Thread RAG Conversations and Message Management."""

from typing import Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status

from app.middleware.auth import get_required_owner_id
from app.schemas.conversation import (
    ChatMessageItem,
    ConversationDetailResponse,
    ConversationItem,
    CreateConversationRequest,
    EditMessageRequest,
    QueryConversationRequest,
    RetryMessageRequest,
    UpdateConversationRequest,
)
from app.services.conversation import conversation_service

router = APIRouter(tags=["conversations"])


# ── Document Conversation Threads ─────────────────────────────────────────────


@router.get(
    "/documents/{document_id}/conversations",
    response_model=list[ConversationItem],
    summary="List all conversation threads for a document",
)
async def list_conversations_endpoint(
    document_id: str,
    owner_id: str = Depends(get_required_owner_id),
) -> list[dict[str, Any]]:
    """Retrieve all discussion threads associated with a PDF document."""
    return await conversation_service.list_conversations(document_id=document_id, owner_id=owner_id)


@router.post(
    "/documents/{document_id}/conversations",
    response_model=ConversationItem,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new conversation thread for a document",
)
async def create_conversation_endpoint(
    document_id: str,
    payload: CreateConversationRequest,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Create a new independent chat thread for this PDF."""
    res = await conversation_service.create_conversation(
        document_id=document_id,
        owner_id=owner_id,
        title=payload.title or "New Discussion",
        system_prompt=payload.system_prompt,
    )
    return {**res, "message_count": 0}


# ── Individual Conversation Thread Management ─────────────────────────────────


@router.get(
    "/conversations/{conversation_id}",
    response_model=ConversationDetailResponse,
    summary="Get conversation details and full message history",
)
async def get_conversation_endpoint(
    conversation_id: str,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Load conversation metadata and sequential chat messages with citations."""
    conv = await conversation_service.get_conversation(conversation_id=conversation_id, owner_id=owner_id)
    if not conv:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conversation {conversation_id} not found.",
        )
    return conv


@router.patch(
    "/conversations/{conversation_id}",
    response_model=ConversationItem,
    summary="Update conversation title or directive",
)
async def update_conversation_endpoint(
    conversation_id: str,
    payload: UpdateConversationRequest,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Rename conversation or change thread persona directive."""
    updated = await conversation_service.update_conversation(
        conversation_id=conversation_id,
        owner_id=owner_id,
        title=payload.title,
        system_prompt=payload.system_prompt,
    )
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return updated


@router.delete(
    "/conversations/{conversation_id}",
    status_code=status.HTTP_200_OK,
    summary="Delete an entire conversation thread",
)
async def delete_conversation_endpoint(
    conversation_id: str,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Permanently delete a conversation thread and all its messages."""
    success = await conversation_service.delete_conversation(conversation_id=conversation_id, owner_id=owner_id)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found.")
    return {"deleted": True, "conversation_id": conversation_id}


# ── Turn Execution & Message Operations ───────────────────────────────────────


@router.post(
    "/conversations/{conversation_id}/query",
    summary="Send a question in a conversation thread",
)
async def query_conversation_endpoint(
    conversation_id: str,
    payload: QueryConversationRequest,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Execute a RAG turn with query reformulation, ground truth retrieval, and persistence."""
    try:
        return await conversation_service.query_thread(
            conversation_id=conversation_id,
            owner_id=owner_id,
            question=payload.question,
            instruction=payload.instruction,
            client_paragraphs=payload.paragraphs,
            file_url=payload.file_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.put(
    "/conversations/{conversation_id}/messages/{message_id}",
    summary="Edit a user question, prune subsequent turns, and re-synthesize",
)
async def edit_message_endpoint(
    conversation_id: str,
    message_id: str,
    payload: EditMessageRequest,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Edit user query in-place, prune future turns, and synthesize a fresh grounded answer."""
    try:
        return await conversation_service.edit_message(
            conversation_id=conversation_id,
            message_id=message_id,
            owner_id=owner_id,
            new_content=payload.new_content,
            instruction=payload.instruction,
            client_paragraphs=payload.paragraphs,
            file_url=payload.file_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post(
    "/conversations/{conversation_id}/messages/{message_id}/retry",
    response_model=ChatMessageItem,
    summary="Regenerate an assistant answer with fresh retrieval",
)
async def retry_message_endpoint(
    conversation_id: str,
    message_id: str,
    payload: Optional[RetryMessageRequest] = None,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Regenerate an AI answer using the preceding user question."""
    req = payload or RetryMessageRequest()
    try:
        return await conversation_service.retry_message(
            conversation_id=conversation_id,
            message_id=message_id,
            owner_id=owner_id,
            instruction=req.instruction,
            client_paragraphs=req.paragraphs,
            file_url=req.file_url,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete(
    "/conversations/{conversation_id}/messages/{message_id}",
    summary="Delete a chat message (cascading below when deleting a user query)",
)
async def delete_message_endpoint(
    conversation_id: str,
    message_id: str,
    owner_id: str = Depends(get_required_owner_id),
) -> dict[str, Any]:
    """Delete a message; if it is a user query, delete its response and all subsequent turns."""
    deleted_count = await conversation_service.delete_message(
        conversation_id=conversation_id,
        message_id=message_id,
        owner_id=owner_id,
    )
    if deleted_count <= 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found.")
    return {"deleted": True, "message_id": message_id, "deleted_count": deleted_count}
