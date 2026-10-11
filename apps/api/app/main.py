from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.schemas.response import ApiResponse

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="FastAPI Backend for RIFT — AI Teacher PDF Narrator",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", response_model=ApiResponse[dict])
def health_check() -> ApiResponse[dict]:
    """Health check endpoint returning system status."""
    return ApiResponse(
        success=True,
        data={
            "status": "ok",
            "service": settings.PROJECT_NAME,
            "version": settings.VERSION,
        },
        message="System healthy",
    )

@app.get("/api/ping", response_model=ApiResponse[dict])
def ping() -> ApiResponse[dict]:
    """Verification ping endpoint for frontend-backend CORS handshake."""
    return ApiResponse(
        success=True,
        data={
            "status": "pong",
            "service": settings.PROJECT_NAME,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
        message="Pong from RIFT backend",
    )
