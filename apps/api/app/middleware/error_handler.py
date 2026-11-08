"""Global error handling middleware for uniform JSON responses."""

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.auth import AuthError
from app.core.logger import get_logger
from app.services.storage import StorageError

logger = get_logger("app.error")


class ErrorHandlingMiddleware(BaseHTTPMiddleware):
    """Catches domain exceptions and formats them as standard JSON error responses."""

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        try:
            return await call_next(request)
        except StorageError as exc:
            request_id = getattr(request.state, "request_id", None)
            logger.warning(f"StorageError on {request.url.path}: {exc.message}")
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error": "StorageError",
                    "detail": exc.message,
                    "request_id": request_id,
                },
            )
        except AuthError as exc:
            request_id = getattr(request.state, "request_id", None)
            logger.warning(f"AuthError on {request.url.path}: {exc}")
            return JSONResponse(
                status_code=exc.status_code,
                content={
                    "error": "Unauthorized",
                    "detail": str(exc),
                    "request_id": request_id,
                },
            )
        except Exception as exc:
            request_id = getattr(request.state, "request_id", None)
            logger.exception(f"Unhandled server error on {request.url.path}: {exc}")
            return JSONResponse(
                status_code=500,
                content={
                    "error": "InternalServerError",
                    "detail": str(exc),
                    "request_id": request_id,
                },
            )

