"""Conversation service managing multi-thread RAG chat, message history, query reformulation, and rolling summarization."""

import asyncio
import re
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional, TypeVar

from google import genai
from sqlalchemy import delete, func, insert, select, update
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncEngine, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.config import API_DIR, setting
from app.core.db import get_db
from app.core.logger import get_logger
from app.model.conversations import chat_messages, conversations
from app.services.rag import rag_service

logger = get_logger("app.services.conversation")

T = TypeVar("T")


def _is_db_connectivity_or_schema_error(exc: BaseException) -> bool:
    """Return True if an exception indicates Postgres is unreachable, unconfigured, or missing schema/FK state."""
    seen: set[int] = set()
    cur: Optional[BaseException] = exc
    while cur is not None and id(cur) not in seen:
        seen.add(id(cur))
        if isinstance(cur, (OSError, TimeoutError, asyncio.TimeoutError, SQLAlchemyError, RuntimeError)):
            return True
        msg = f"{type(cur).__name__} {cur}".lower()
        if any(tok in msg for tok in ("getaddrinfo", "connection", "timeout", "does not exist", "undefinedtable")):
            return True
        cur = cur.__cause__ or cur.__context__
    return False


class ConversationService:
    """Orchestrates persistent multi-thread conversations and anti-confusion RAG retrieval."""

    def __init__(self, local_db_path: Optional[Path] = None):
        self._client: Optional[genai.Client] = None
        self._local_db_path: Path = local_db_path or (API_DIR / "data" / "conversations.db")
        self._local_engine: Optional[AsyncEngine] = None
        self._local_engine_loop: Optional[asyncio.AbstractEventLoop] = None
        self._local_lock = asyncio.Lock()
        self._pg_retry_after: float = 0.0

        if setting.gemini_api_key:
            try:
                self._client = genai.Client(api_key=setting.gemini_api_key)
            except Exception as e:
                logger.warning(f"Failed to initialize Gemini client in ConversationService: {e}")

    async def _get_local_engine(self) -> AsyncEngine:
        """Lazily initialize the local SQLite fallback database with conversations/chat_messages tables."""
        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        async with self._local_lock:
            if (
                self._local_engine is not None
                and current_loop is not None
                and self._local_engine_loop is not None
                and self._local_engine_loop != current_loop
            ):
                await self._local_engine.dispose()
                self._local_engine = None

            if self._local_engine is None:
                self._local_db_path.parent.mkdir(parents=True, exist_ok=True)
                sqlite_url = f"sqlite+aiosqlite:///{self._local_db_path.as_posix()}"
                engine = create_async_engine(
                    sqlite_url,
                    echo=False,
                    poolclass=StaticPool,
                    connect_args={"check_same_thread": False},
                )
                async with engine.begin() as conn:
                    await conn.run_sync(
                        lambda sync_conn: (
                            conversations.create(sync_conn, checkfirst=True),
                            chat_messages.create(sync_conn, checkfirst=True),
                        )
                    )
                self._local_engine = engine
                self._local_engine_loop = current_loop

            return self._local_engine

    async def close(self) -> None:
        """Dispose the local SQLite fallback engine if initialized."""
        async with self._local_lock:
            if self._local_engine is not None:
                await self._local_engine.dispose()
                self._local_engine = None
                self._local_engine_loop = None

    async def _with_db(self, operation: Callable[[AsyncEngine], Awaitable[T]]) -> T:
        """Run an operation on Postgres when reachable, falling back to local SQLite persistence otherwise."""
        if setting.async_database_url and time.monotonic() >= self._pg_retry_after:
            try:
                return await operation(get_db())
            except ValueError:
                raise
            except Exception as exc:
                if not _is_db_connectivity_or_schema_error(exc):
                    raise
                logger.warning(
                    f"Postgres unavailable for ConversationService ({exc}); "
                    f"using local SQLite store at {self._local_db_path}"
                )
                self._pg_retry_after = time.monotonic() + 30.0

        local_engine = await self._get_local_engine()
        return await operation(local_engine)

    # ── Thread Management ─────────────────────────────────────────────────────────

    async def list_conversations(self, document_id: str, owner_id: str) -> list[dict[str, Any]]:
        """List all conversation threads for a document. Creates a default thread if none exist."""
        async def _op(engine: AsyncEngine) -> list[dict[str, Any]]:
            async with engine.connect() as conn:
                stmt = (
                    select(
                        conversations.c.id,
                        conversations.c.document_id,
                        conversations.c.owner_id,
                        conversations.c.title,
                        conversations.c.system_prompt,
                        conversations.c.summary,
                        conversations.c.created_at,
                        conversations.c.updated_at,
                        func.count(chat_messages.c.id).label("message_count"),
                    )
                    .outerjoin(chat_messages, chat_messages.c.conversation_id == conversations.c.id)
                    .where(
                        conversations.c.document_id == document_id,
                        conversations.c.owner_id == owner_id,
                    )
                    .group_by(conversations.c.id)
                    .order_by(conversations.c.created_at.desc())
                )
                res = await conn.execute(stmt)
                return [dict(r._mapping) for r in res.fetchall()]

        rows = await self._with_db(_op)
        if rows:
            return rows

        # If no threads exist yet for this document, create the initial default thread
        initial = await self.create_conversation(
            document_id=document_id,
            owner_id=owner_id,
            title="General Discussion",
        )
        initial["message_count"] = 0
        return [initial]

    async def create_conversation(
        self,
        document_id: str,
        owner_id: str,
        title: str = "New Discussion",
        system_prompt: Optional[str] = None,
    ) -> dict[str, Any]:
        """Create a new conversation thread for a document."""
        conv_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        record = {
            "id": conv_id,
            "document_id": document_id,
            "owner_id": owner_id,
            "title": title.strip() or "New Discussion",
            "system_prompt": system_prompt.strip() if system_prompt else None,
            "summary": None,
            "created_at": now,
            "updated_at": now,
        }

        async def _op(engine: AsyncEngine) -> None:
            async with engine.begin() as conn:
                await conn.execute(insert(conversations).values(**record))

        await self._with_db(_op)
        logger.info(f"Created conversation {conv_id} for doc={document_id}, owner={owner_id}")
        return record

    async def get_conversation(self, conversation_id: str, owner_id: str) -> Optional[dict[str, Any]]:
        """Retrieve conversation metadata and all messages in chronological sequence."""
        async def _op(engine: AsyncEngine) -> Optional[dict[str, Any]]:
            async with engine.connect() as conn:
                stmt = select(conversations).where(
                    conversations.c.id == conversation_id,
                    conversations.c.owner_id == owner_id,
                )
                res = await conn.execute(stmt)
                row = res.fetchone()
                if not row:
                    return None
                conv = dict(row._mapping)

                # Fetch messages
                m_stmt = (
                    select(chat_messages)
                    .where(
                        chat_messages.c.conversation_id == conversation_id,
                        chat_messages.c.owner_id == owner_id,
                    )
                    .order_by(chat_messages.c.sequence_number.asc())
                )
                m_res = await conn.execute(m_stmt)
                msgs = [dict(m._mapping) for m in m_res.fetchall()]

                return {
                    "conversation": {**conv, "message_count": len(msgs)},
                    "messages": msgs,
                }

        return await self._with_db(_op)

    async def update_conversation(
        self,
        conversation_id: str,
        owner_id: str,
        title: Optional[str] = None,
        system_prompt: Optional[str] = None,
    ) -> Optional[dict[str, Any]]:
        """Update conversation title or persona directive."""
        updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        if title is not None:
            updates["title"] = title.strip() or "Discussion"
        if system_prompt is not None:
            updates["system_prompt"] = system_prompt.strip() or None

        async def _op(engine: AsyncEngine) -> Optional[dict[str, Any]]:
            async with engine.begin() as conn:
                stmt = (
                    update(conversations)
                    .where(
                        conversations.c.id == conversation_id,
                        conversations.c.owner_id == owner_id,
                    )
                    .values(**updates)
                    .returning(conversations)
                )
                res = await conn.execute(stmt)
                row = res.fetchone()
                return dict(row._mapping) if row else None

        return await self._with_db(_op)

    async def delete_conversation(self, conversation_id: str, owner_id: str) -> bool:
        """Delete an entire conversation thread and its messages."""
        async def _op(engine: AsyncEngine) -> bool:
            async with engine.begin() as conn:
                # Delete child messages explicitly too so SQLite (foreign_keys=OFF) never leaves orphans
                await conn.execute(
                    delete(chat_messages).where(
                        chat_messages.c.conversation_id == conversation_id,
                        chat_messages.c.owner_id == owner_id,
                    )
                )
                stmt = delete(conversations).where(
                    conversations.c.id == conversation_id,
                    conversations.c.owner_id == owner_id,
                )
                res = await conn.execute(stmt)
                return res.rowcount > 0

        return await self._with_db(_op)

    # ── Long-Context Anti-Confusion: Query Reformulation & Summarization ──────────

    async def _reformulate_query(
        self,
        question: str,
        recent_turns: list[dict[str, Any]],
    ) -> str:
        """De-reference pronouns and follow-up context into a self-contained retrieval query.
        
        Prevents pgvector & BM25 retrieval confusion when user asks 'Why did they do that in step 2?'.
        """
        if not recent_turns or not self._client:
            return question

        # Extract last 2-3 turns for context
        history_lines = []
        for turn in recent_turns[-4:]:
            role = "User" if turn.get("role") == "user" else "Assistant"
            content = (turn.get("content") or "").strip()
            if content:
                history_lines.append(f"{role}: {content[:300]}")

        if not history_lines:
            return question

        prompt = (
            "You are a search query reformulation expert for a document research system. "
            "Given the recent conversation turns and a follow-up user question, rewrite the question into "
            "a single, self-contained standalone search query that contains all necessary entities and keywords. "
            "Resolve pronouns like 'it', 'they', 'that step', 'the second one' using conversation context.\n"
            "If the question is already self-contained or unambiguous, output it unchanged.\n"
            "Do NOT answer the question. Output ONLY the rewritten search query.\n\n"
            f"Conversation History:\n" + "\n".join(history_lines) + "\n\n"
            f"Follow-up Question: {question}\n"
            "Standalone Search Query:"
        )

        for model_name in ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-3-flash-preview"]:
            try:
                resp = await self._client.aio.models.generate_content(
                    model=model_name,
                    contents=prompt,
                )
                if resp.text:
                    rewritten = resp.text.strip().strip('"').strip("'")
                    if rewritten and len(rewritten) > 3:
                        logger.info(f"Query reformulated: {question!r} -> {rewritten!r}")
                        return rewritten
            except Exception as e:
                logger.debug(f"Query reformulation error ({model_name}): {e}")

        return question

    async def _update_rolling_summary(
        self,
        conversation_id: str,
        owner_id: str,
        existing_summary: Optional[str],
        turns_to_compress: list[dict[str, Any]],
    ) -> None:
        """Compress older conversation turns into a compact 2-sentence running memory."""
        if not turns_to_compress or not self._client:
            return

        turns_text = "\n".join(
            f"{'User' if t.get('role') == 'user' else 'Assistant'}: {t.get('content', '')[:200]}"
            for t in turns_to_compress
        )

        prompt = (
            "Provide a concise 2-sentence rolling summary of the key facts, questions, and page topics "
            "discussed in this conversation so far. Include any specific page numbers or topics referenced.\n\n"
            f"Prior Summary: {existing_summary or 'None'}\n\n"
            f"New Conversation Turns:\n{turns_text}\n\n"
            "Updated 2-sentence summary:"
        )

        try:
            resp = await self._client.aio.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=prompt,
            )
            if resp.text:
                new_summary = resp.text.strip()

                async def _op(engine: AsyncEngine) -> None:
                    async with engine.begin() as conn:
                        await conn.execute(
                            update(conversations)
                            .where(
                                conversations.c.id == conversation_id,
                                conversations.c.owner_id == owner_id,
                            )
                            .values(summary=new_summary, updated_at=datetime.now(timezone.utc))
                        )

                await self._with_db(_op)
                logger.info(f"Updated rolling summary for conversation {conversation_id}")
        except Exception as e:
            logger.warning(f"Rolling summary generation failed: {e}")

    async def _auto_title_thread(
        self,
        conversation_id: str,
        owner_id: str,
        first_question: str,
        first_answer: str,
    ) -> None:
        """Generate a concise 3-4 word topic title for the conversation after the first turn."""
        if not self._client:
            return

        prompt = (
            "Generate a concise 3 to 5 word topic title for this document conversation based on the question and answer.\n"
            "Rules:\n"
            "- Strictly 3 to 5 words\n"
            "- No quotes, no markdown, no punctuation\n"
            "- Capitalize Each Major Word\n\n"
            f"Question: {first_question}\n"
            f"Answer: {first_answer[:250]}\n\n"
            "Topic Title:"
        )

        try:
            resp = await self._client.aio.models.generate_content(
                model="gemini-3.5-flash-lite",
                contents=prompt,
            )
            if resp.text:
                title = resp.text.strip().strip('"').strip("'").strip()
                if 2 <= len(title.split()) <= 7:
                    async def _op(engine: AsyncEngine) -> None:
                        async with engine.begin() as conn:
                            await conn.execute(
                                update(conversations)
                                .where(
                                    conversations.c.id == conversation_id,
                                    conversations.c.owner_id == owner_id,
                                )
                                .values(title=title, updated_at=datetime.now(timezone.utc))
                            )

                    await self._with_db(_op)
                    logger.info(f"Auto-titled conversation {conversation_id} -> {title!r}")
        except Exception as e:
            logger.debug(f"Auto-title generation failed: {e}")

    async def _append_message(
        self,
        record: dict[str, Any],
        *,
        touch_conversation_id: Optional[str] = None,
        touch_timestamp: Optional[datetime] = None,
    ) -> None:
        """Persist a chat message row and optionally bump the parent conversation's updated_at timestamp."""
        async def _op(engine: AsyncEngine) -> None:
            async with engine.begin() as conn:
                await conn.execute(insert(chat_messages).values(**record))
                if touch_conversation_id and touch_timestamp is not None:
                    await conn.execute(
                        update(conversations)
                        .where(conversations.c.id == touch_conversation_id)
                        .values(updated_at=touch_timestamp)
                    )

        await self._with_db(_op)

    # ── Turn Execution & Message Operations ───────────────────────────────────────

    async def query_thread(
        self,
        conversation_id: str,
        owner_id: str,
        question: str,
        instruction: Optional[str] = None,
        client_paragraphs: Optional[list[dict[str, Any]]] = None,
        file_url: Optional[str] = None,
    ) -> dict[str, Any]:
        """Execute a conversation turn: store user query, reformulate for retrieval, run RAG, store assistant reply."""
        # 1. Verify thread & load existing messages
        conv_detail = await self.get_conversation(conversation_id, owner_id)
        if not conv_detail:
            raise ValueError(f"Conversation {conversation_id} not found")

        conv = conv_detail["conversation"]
        document_id = conv["document_id"]
        messages = conv_detail["messages"]
        next_seq = len(messages)

        # 2. Persist User Message
        user_msg_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        user_msg_record = {
            "id": user_msg_id,
            "conversation_id": conversation_id,
            "document_id": document_id,
            "owner_id": owner_id,
            "role": "user",
            "content": question.strip(),
            "citations": [],
            "sequence_number": next_seq,
            "created_at": now,
            "updated_at": now,
        }

        await self._append_message(user_msg_record)

        # 3. Query Reformulation (De-reference follow-up pronouns)
        standalone_search_query = await self._reformulate_query(
            question=question,
            recent_turns=messages,
        )

        # 4. Prepare Context turns with Sliding Window
        # Format last 6 turns (3 Q&A pairs) + thread summary if available
        chat_history = []
        if conv.get("summary"):
            chat_history.append({"role": "assistant", "content": f"[Thread Memory]: {conv['summary']}"})

        for m in messages[-6:]:
            chat_history.append({"role": m["role"], "content": m["content"]})

        effective_instruction = instruction or conv.get("system_prompt")

        # 5. Execute Grounded RAG Query: use reformulated query for retrieval while keeping user's exact question for instructions/formatting
        rag_res = await rag_service.query(
            document_id=document_id,
            owner_id=owner_id,
            question=question.strip(),
            search_query=standalone_search_query,
            instruction=effective_instruction,
            client_paragraphs=client_paragraphs,
            file_url=file_url,
            chat_history=chat_history,
        )

        # 6. Persist Assistant Reply with Citations
        ai_msg_id = str(uuid.uuid4())
        ai_now = datetime.now(timezone.utc)
        ai_msg_record = {
            "id": ai_msg_id,
            "conversation_id": conversation_id,
            "document_id": document_id,
            "owner_id": owner_id,
            "role": "assistant",
            "content": rag_res["answer"],
            "citations": rag_res.get("citations", []),
            "sequence_number": next_seq + 1,
            "created_at": ai_now,
            "updated_at": ai_now,
        }

        await self._append_message(
            ai_msg_record,
            touch_conversation_id=conversation_id,
            touch_timestamp=ai_now,
        )

        # 7. Asynchronous Post-Turn Maintenance:
        # A) Auto-title thread if this was the first turn and title is default
        if next_seq == 0 and conv.get("title") in ("New Discussion", "General Discussion"):
            asyncio.create_task(
                self._auto_title_thread(
                    conversation_id=conversation_id,
                    owner_id=owner_id,
                    first_question=question,
                    first_answer=rag_res["answer"],
                )
            )

        # B) Rolling summarization if thread exceeds 6 turns
        if len(messages) >= 6:
            older_turns = messages[:-6]
            asyncio.create_task(
                self._update_rolling_summary(
                    conversation_id=conversation_id,
                    owner_id=owner_id,
                    existing_summary=conv.get("summary"),
                    turns_to_compress=older_turns,
                )
            )

        return {
            "user_message": user_msg_record,
            "assistant_message": ai_msg_record,
            "reformulated_query": standalone_search_query if standalone_search_query != question else None,
        }

    async def edit_message(
        self,
        conversation_id: str,
        message_id: str,
        owner_id: str,
        new_content: str,
        instruction: Optional[str] = None,
        client_paragraphs: Optional[list[dict[str, Any]]] = None,
        file_url: Optional[str] = None,
    ) -> dict[str, Any]:
        """Edit an existing user question, prune subsequent turns, and synthesize a fresh answer."""
        # 1. Fetch message and thread
        conv_detail = await self.get_conversation(conversation_id, owner_id)
        if not conv_detail:
            raise ValueError("Conversation not found")

        messages = conv_detail["messages"]
        target_idx = next((i for i, m in enumerate(messages) if m["id"] == message_id), None)
        if target_idx is None:
            raise ValueError(f"Message {message_id} not found in conversation")

        target_msg = messages[target_idx]
        if target_msg["role"] != "user":
            raise ValueError("Only user messages can be edited")

        document_id = target_msg["document_id"]
        seq_num = target_msg["sequence_number"]

        # 2. Update user message content and delete all subsequent messages
        now = datetime.now(timezone.utc)

        async def _prune_op(engine: AsyncEngine) -> None:
            async with engine.begin() as conn:
                await conn.execute(
                    update(chat_messages)
                    .where(
                        chat_messages.c.id == message_id,
                        chat_messages.c.owner_id == owner_id,
                    )
                    .values(content=new_content.strip(), updated_at=now)
                )
                await conn.execute(
                    delete(chat_messages).where(
                        chat_messages.c.conversation_id == conversation_id,
                        chat_messages.c.owner_id == owner_id,
                        chat_messages.c.sequence_number > seq_num,
                    )
                )

        await self._with_db(_prune_op)

        # 3. Context before the edited message
        prior_messages = messages[:target_idx]

        # 4. De-reference query
        standalone_query = await self._reformulate_query(new_content, prior_messages)

        chat_history = [
            {"role": m["role"], "content": m["content"]}
            for m in prior_messages[-6:]
        ]

        # 5. Synthesize fresh answer (preserve edited user content for formatting/length instructions)
        effective_instruction = instruction or conv_detail["conversation"].get("system_prompt")
        rag_res = await rag_service.query(
            document_id=document_id,
            owner_id=owner_id,
            question=new_content.strip(),
            search_query=standalone_query,
            instruction=effective_instruction,
            client_paragraphs=client_paragraphs,
            file_url=file_url,
            chat_history=chat_history,
        )

        # 6. Save new assistant answer
        ai_msg_id = str(uuid.uuid4())
        ai_now = datetime.now(timezone.utc)
        ai_record = {
            "id": ai_msg_id,
            "conversation_id": conversation_id,
            "document_id": document_id,
            "owner_id": owner_id,
            "role": "assistant",
            "content": rag_res["answer"],
            "citations": rag_res.get("citations", []),
            "sequence_number": seq_num + 1,
            "created_at": ai_now,
            "updated_at": ai_now,
        }

        await self._append_message(
            ai_record,
            touch_conversation_id=conversation_id,
            touch_timestamp=ai_now,
        )

        updated_user_msg = {**target_msg, "content": new_content.strip(), "updated_at": now}
        return {
            "user_message": updated_user_msg,
            "assistant_message": ai_record,
        }

    async def retry_message(
        self,
        conversation_id: str,
        message_id: str,
        owner_id: str,
        instruction: Optional[str] = None,
        client_paragraphs: Optional[list[dict[str, Any]]] = None,
        file_url: Optional[str] = None,
    ) -> dict[str, Any]:
        """Regenerate an assistant answer with fresh retrieval and citations."""
        conv_detail = await self.get_conversation(conversation_id, owner_id)
        if not conv_detail:
            raise ValueError("Conversation not found")

        messages = conv_detail["messages"]
        target_idx = next((i for i, m in enumerate(messages) if m["id"] == message_id), None)
        if target_idx is None:
            raise ValueError(f"Message {message_id} not found in conversation")

        target_msg = messages[target_idx]
        if target_msg["role"] != "assistant":
            raise ValueError("Only assistant messages can be retried")

        # Preceding user question
        if target_idx == 0 or messages[target_idx - 1]["role"] != "user":
            raise ValueError("No user question found preceding this assistant message")

        user_msg = messages[target_idx - 1]
        prior_messages = messages[: target_idx - 1]

        # De-reference query
        standalone_query = await self._reformulate_query(user_msg["content"], prior_messages)

        chat_history = [
            {"role": m["role"], "content": m["content"]}
            for m in prior_messages[-6:]
        ]

        # Fresh RAG synthesis (preserve original user query for instructions/formatting)
        effective_instruction = instruction or conv_detail["conversation"].get("system_prompt")
        rag_res = await rag_service.query(
            document_id=target_msg["document_id"],
            owner_id=owner_id,
            question=user_msg["content"],
            search_query=standalone_query,
            instruction=effective_instruction,
            client_paragraphs=client_paragraphs,
            file_url=file_url,
            chat_history=chat_history,
        )

        now = datetime.now(timezone.utc)
        updated_record = {
            "content": rag_res["answer"],
            "citations": rag_res.get("citations", []),
            "updated_at": now,
        }

        async def _op(engine: AsyncEngine) -> None:
            async with engine.begin() as conn:
                await conn.execute(
                    update(chat_messages)
                    .where(
                        chat_messages.c.id == message_id,
                        chat_messages.c.owner_id == owner_id,
                    )
                    .values(**updated_record)
                )
                await conn.execute(
                    update(conversations)
                    .where(conversations.c.id == conversation_id)
                    .values(updated_at=now)
                )

        await self._with_db(_op)
        return {**target_msg, **updated_record}

    async def delete_message(
        self,
        conversation_id: str,
        message_id: str,
        owner_id: str,
    ) -> int:
        """Delete a chat message; deleting a user query cascade-deletes its response and all subsequent turns."""
        async def _op(engine: AsyncEngine) -> int:
            async with engine.begin() as conn:
                target_res = await conn.execute(
                    select(
                        chat_messages.c.id,
                        chat_messages.c.role,
                        chat_messages.c.sequence_number,
                    ).where(
                        chat_messages.c.id == message_id,
                        chat_messages.c.conversation_id == conversation_id,
                        chat_messages.c.owner_id == owner_id,
                    )
                )
                target = target_res.fetchone()
                if not target:
                    return 0

                target_role = target._mapping["role"]
                seq_num = target._mapping["sequence_number"]

                if target_role == "user":
                    stmt = delete(chat_messages).where(
                        chat_messages.c.conversation_id == conversation_id,
                        chat_messages.c.owner_id == owner_id,
                        chat_messages.c.sequence_number >= seq_num,
                    )
                else:
                    stmt = delete(chat_messages).where(
                        chat_messages.c.id == message_id,
                        chat_messages.c.conversation_id == conversation_id,
                        chat_messages.c.owner_id == owner_id,
                    )

                res = await conn.execute(stmt)
                deleted_count = int(res.rowcount or 0)

                if deleted_count > 0:
                    conv_updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
                    if target_role == "user":
                        rem_res = await conn.execute(
                            select(func.count())
                            .select_from(chat_messages)
                            .where(
                                chat_messages.c.conversation_id == conversation_id,
                                chat_messages.c.owner_id == owner_id,
                            )
                        )
                        if int(rem_res.scalar() or 0) == 0:
                            conv_updates["summary"] = None
                    await conn.execute(
                        update(conversations)
                        .where(
                            conversations.c.id == conversation_id,
                            conversations.c.owner_id == owner_id,
                        )
                        .values(**conv_updates)
                    )

                return deleted_count

        return await self._with_db(_op)


conversation_service = ConversationService()
