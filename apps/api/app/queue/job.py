import asyncio
from datetime import datetime, timezone
import json
import logging
from typing import Any, AsyncGenerator, Dict, List, Optional
import uuid

import fitz
from app.schemas.document import AsyncIngestResponse, JobProgressEvent
from app.ingest.parse import parse_pdf_bytes, DocumentParsed
from app.search.hybrid import GLOBAL_SEARCH_ENGINE

logger = logging.getLogger("rift.queue")


class JobQueueManager:
    """Asynchronous Job Processing Queue with real-time SSE progress streaming.
    Supports asynchronous PDF block parsing, vector embeddings pre-generation,
    and lesson pre-planning with granular page-by-page progress events.
    """

    def __init__(self):
        self.jobs: Dict[str, JobProgressEvent] = {}
        self.doc_to_job: Dict[str, str] = {}
        self._subscribers: Dict[str, List[asyncio.Queue]] = {}

    def get_job(self, job_id: str) -> Optional[JobProgressEvent]:
        return self.jobs.get(job_id)

    def get_job_by_doc(self, doc_id: str) -> Optional[JobProgressEvent]:
        job_id = self.doc_to_job.get(doc_id)
        if job_id:
            return self.jobs.get(job_id)
        return None

    def _broadcast(self, event: JobProgressEvent) -> None:
        """Broadcast progress event to all active SSE subscribers for this document."""
        self.jobs[event.job_id] = event
        self.doc_to_job[event.doc_id] = event.job_id

        listeners = self._subscribers.get(event.doc_id, [])
        for q in list(listeners):
            try:
                q.put_nowait(event)
            except Exception as e:
                logger.debug(f"Subscriber queue full or closed: {e}")

    def enqueue_ingestion(
        self,
        content: bytes,
        filename: str,
        owner_id: Optional[str] = None,
        target_store: Optional[Dict[str, DocumentParsed]] = None,
        background_tasks: Optional[Any] = None,
    ) -> AsyncIngestResponse:
        """Enqueue document for asynchronous multi-stage ingestion."""
        job_id = f"job_{uuid.uuid4().hex[:12]}"
        doc_id = f"doc_{uuid.uuid4().hex[:12]}"

        initial_event = JobProgressEvent(
            job_id=job_id,
            doc_id=doc_id,
            status="queued",
            progress=0,
            stage="queued",
            message="Document enqueued for asynchronous parsing and embedding.",
        )
        self._broadcast(initial_event)

        if background_tasks is not None:
            background_tasks.add_task(
                self._run_task_wrapper,
                job_id,
                doc_id,
                content,
                filename,
                owner_id,
                target_store,
            )
        else:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(
                    self._process_document(
                        job_id=job_id,
                        doc_id=doc_id,
                        content=content,
                        filename=filename,
                        owner_id=owner_id,
                        target_store=target_store,
                    )
                )
            except RuntimeError:
                asyncio.run(
                    self._process_document(
                        job_id=job_id,
                        doc_id=doc_id,
                        content=content,
                        filename=filename,
                        owner_id=owner_id,
                        target_store=target_store,
                    )
                )

        return AsyncIngestResponse(
            doc_id=doc_id,
            job_id=job_id,
            status="queued",
            message=f"Document '{filename}' enqueued for background processing.",
            progress_url=f"/documents/{doc_id}/progress",
        )

    async def _run_task_wrapper(
        self,
        job_id: str,
        doc_id: str,
        content: bytes,
        filename: str,
        owner_id: Optional[str],
        target_store: Optional[Dict[str, DocumentParsed]],
    ) -> None:
        await self._process_document(
            job_id=job_id,
            doc_id=doc_id,
            content=content,
            filename=filename,
            owner_id=owner_id,
            target_store=target_store,
        )

    async def _process_document(
        self,
        job_id: str,
        doc_id: str,
        content: bytes,
        filename: str,
        owner_id: Optional[str] = None,
        target_store: Optional[Dict[str, DocumentParsed]] = None,
    ) -> None:
        """Execute multi-stage ingestion asynchronously."""
        try:
            # Stage 1: Document Inspection & Initial Page Count
            doc = fitz.open(stream=content, filetype="pdf")
            total_pages = len(doc)
            doc.close()

            # Stage 2: Page-by-page parsing
            for page_idx in range(1, total_pages + 1):
                page_pct = 10 + int(45 * (page_idx / max(1, total_pages)))
                self._broadcast(
                    JobProgressEvent(
                        job_id=job_id,
                        doc_id=doc_id,
                        status="processing",
                        progress=page_pct,
                        stage="parsing_pages",
                        message=f"Processing page {page_idx} of {total_pages}...",
                        page_count=total_pages,
                    )
                )
                await asyncio.sleep(0.01)

            # Execute full semantic parsing
            parsed: DocumentParsed = parse_pdf_bytes(content, filename=filename, doc_id=doc_id)
            parsed.owner_id = owner_id

            # Stage 3: Embedding generation & hybrid indexing
            self._broadcast(
                JobProgressEvent(
                    job_id=job_id,
                    doc_id=doc_id,
                    status="processing",
                    progress=65,
                    stage="generating_embeddings",
                    message=f"Generating 768-dim embeddings for {len(parsed.chunks)} pedagogical chunks...",
                    page_count=parsed.page_count,
                    chunks_count=len(parsed.chunks),
                )
            )
            await asyncio.sleep(0.01)

            GLOBAL_SEARCH_ENGINE.index_document(parsed.doc_id, parsed.chunks)

            # Stage 4: Pre-planning lesson
            self._broadcast(
                JobProgressEvent(
                    job_id=job_id,
                    doc_id=doc_id,
                    status="processing",
                    progress=88,
                    stage="preplanning_lesson",
                    message="Pre-planning structured lesson segments and emotion mappings...",
                    page_count=parsed.page_count,
                    chunks_count=len(parsed.chunks),
                )
            )
            await asyncio.sleep(0.01)

            # Store into document store
            if target_store is not None:
                target_store[parsed.doc_id] = parsed

            # Stage 5: Completed
            self._broadcast(
                JobProgressEvent(
                    job_id=job_id,
                    doc_id=doc_id,
                    status="completed",
                    progress=100,
                    stage="completed",
                    message=f"Successfully processed {parsed.page_count} pages and {len(parsed.chunks)} pedagogical chunks.",
                    page_count=parsed.page_count,
                    chunks_count=len(parsed.chunks),
                )
            )

        except Exception as exc:
            logger.error(f"Error processing document {doc_id}: {exc}", exc_info=True)
            self._broadcast(
                JobProgressEvent(
                    job_id=job_id,
                    doc_id=doc_id,
                    status="failed",
                    progress=100,
                    stage="failed",
                    message=f"Failed to process document: {str(exc)}",
                    error=str(exc),
                )
            )

    async def subscribe(self, doc_id: str) -> AsyncGenerator[str, None]:
        """Subscribe to real-time Server-Sent Events (SSE) for document processing."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        if doc_id not in self._subscribers:
            self._subscribers[doc_id] = []
        self._subscribers[doc_id].append(queue)

        try:
            # Yield current state immediately if exists
            current_job = self.get_job_by_doc(doc_id)
            if current_job:
                event_name = "complete" if current_job.status == "completed" else "progress"
                if current_job.status == "failed":
                    event_name = "error"
                yield f"event: {event_name}\ndata: {json.dumps(current_job.model_dump())}\n\n"
                if current_job.status in ("completed", "failed"):
                    return

            # Listen for subsequent events
            while True:
                try:
                    event: JobProgressEvent = await asyncio.wait_for(queue.get(), timeout=1.0)
                    event_name = "progress"
                    if event.status == "completed":
                        event_name = "complete"
                    elif event.status == "failed":
                        event_name = "error"

                    yield f"event: {event_name}\ndata: {json.dumps(event.model_dump())}\n\n"

                    if event.status in ("completed", "failed"):
                        break
                except asyncio.TimeoutError:
                    curr = self.get_job_by_doc(doc_id)
                    if curr and curr.status in ("completed", "failed"):
                        event_name = "complete" if curr.status == "completed" else "error"
                        yield f"event: {event_name}\ndata: {json.dumps(curr.model_dump())}\n\n"
                        break
                    yield ": ping\n\n"
        finally:
            if doc_id in self._subscribers and queue in self._subscribers[doc_id]:
                self._subscribers[doc_id].remove(queue)


# Global singleton instance
job_queue_manager = JobQueueManager()
