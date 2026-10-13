from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.schemas.response import ApiResponse
from app.routes.documents import router as documents_router
from app.routes.sessions import router as sessions_router
from app.routes.tts import router as tts_router
from app.routes.metrics import router as metrics_router
from app.providers.tts import prewarm_tts
from app.security.middleware import SecurityHeadersMiddleware
from app.telemetry.middleware import RequestTimingMiddleware

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="FastAPI Backend for RIFT — AI Teacher PDF Narrator",
)

# Prewarm TTS on application load
prewarm_tts()

app.include_router(documents_router)
app.include_router(sessions_router)
app.include_router(tts_router)
app.include_router(metrics_router)

# Timing, Security, and CORS Middleware
app.add_middleware(RequestTimingMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
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
            "chatterbox_ready": True,
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
