"""Main FastAPI application entry point for RIFT API.

Includes:
- Best-practice middleware stack: CORS, Request Logging & Timing, Auth, Error Handling.
- Document upload, multimodal ingestion, and storage routes for RAG frontend PDF access.
- Health checks and application lifecycle management verifying database tables and storage.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.core.config import setting
from app.core.db import close_db, get_db
from app.core.logger import get_logger
from app.middleware import (
    AuthenticationMiddleware,
    ErrorHandlingMiddleware,
    RequestLoggingMiddleware,
)
from app.model.base import create_all_tables
# Import models to ensure tables are registered with metadata
import app.model.documents  # noqa: F401
import app.model.document_chunks  # noqa: F401
import app.model.conversations  # noqa: F401
from app.routes.documents import router as documents_router
from app.routes.sessions import router as sessions_router
from app.routes.tts import router as tts_router
from app.routes.stt import router as stt_router
from app.routes.conversations import router as conversations_router
from app.services.conversation import conversation_service
from app.services.storage import storage_service

logger = get_logger("app.main")


# ── Application Lifespan ──────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize application resources on startup and clean up on shutdown."""
    logger.info("Starting RIFT API server...")

    # 1. Initialize DB tables & pgvector extension if a database URL is configured
    if setting.async_database_url:
        try:
            engine = get_db()
            async with engine.begin() as conn:
                await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector;"))
            await create_all_tables(engine)
            
            # Verify table existence
            async with engine.connect() as conn:
                res = await conn.execute(
                    text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
                )
                existing = {row[0] for row in res.fetchall()}
                logger.info(
                    f"Database schema verified. Active tables: documents={'documents' in existing}, "
                    f"document_chunks={'document_chunks' in existing}"
                )
        except Exception as exc:
            logger.warning(f"Database schema auto-creation skipped: {exc}")

    # 2. Ensure Supabase storage bucket exists
    try:
        storage_service._ensure_bucket()
    except Exception as exc:
        logger.warning(f"Storage bucket verification deferred: {exc}")

    yield

    # Teardown
    logger.info("Shutting down RIFT API server...")
    await conversation_service.close()
    await close_db()


# ── FastAPI App Instance ──────────────────────────────────────────────────────

app = FastAPI(
    title="RIFT API",
    version="0.1.0",
    description="Backend API for RIFT RAG Project - Document storage & retrieval via Supabase",
    lifespan=lifespan,
)

# ── Middleware Stack (Registered in execution order) ───────────────────────────

# 1. Error Handling Middleware (outermost: catches any unhandled exceptions)
app.add_middleware(ErrorHandlingMiddleware)

# 2. Request Logging & Timing Middleware (logs every request and injects X-Request-ID)
app.add_middleware(RequestLoggingMiddleware)

# 3. Authentication Middleware (populates request.state.user / request.state.owner_id)
app.add_middleware(AuthenticationMiddleware)

# 4. CORS Middleware (allows RAG web frontend to make cross-origin requests)
app.add_middleware(
    CORSMiddleware,
    allow_origins=setting.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID", "X-Process-Time-Ms"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(documents_router)
app.include_router(sessions_router)
app.include_router(tts_router)
app.include_router(tts_router, prefix="/api")
app.include_router(stt_router)
app.include_router(conversations_router, prefix="/api")


# ── Health Endpoint ───────────────────────────────────────────────────────────


@app.get("/api/ping", tags=["System"])
async def ping():
    """Lightweight ping endpoint returning standard ApiResponse envelope."""
    return {
        "success": True,
        "data": {
            "status": "ok",
            "service": "rift-api",
            "version": "0.1.0",
        },
        "message": "RIFT backend operational",
    }


@app.get("/health", tags=["System"])
async def health_check():
    """Service health check verifying storage bucket, database connectivity, and required tables."""
    tables_status = {
        "documents": False,
        "document_chunks": False,
        "conversations": False,
        "chat_messages": False,
    }
    pgvector_installed = False
    db_connected = False

    if setting.async_database_url:
        try:
            engine = get_db()
            async with engine.connect() as conn:
                db_connected = True
                res = await conn.execute(
                    text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';")
                )
                found = {row[0] for row in res.fetchall()}
                tables_status["documents"] = "documents" in found
                tables_status["document_chunks"] = "document_chunks" in found
                tables_status["conversations"] = "conversations" in found
                tables_status["chat_messages"] = "chat_messages" in found

                ext_res = await conn.execute(
                    text("SELECT extname FROM pg_extension WHERE extname = 'vector';")
                )
                pgvector_installed = len(ext_res.fetchall()) > 0
        except Exception as exc:
            logger.warning(f"Health check database probe error: {exc}")

    return {
        "status": "healthy" if db_connected else "degraded",
        "service": "rift-api",
        "storage_bucket": setting.supabase_storage_bucket,
        "database": {
            "connected": db_connected,
            "tables": tables_status,
            "pgvector": pgvector_installed,
        },
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)
