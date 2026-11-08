"""Structured HTTP request logging and timing middleware."""

import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.requests import Request
from starlette.responses import Response

from app.core.logger import get_logger

logger = get_logger("app.http")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that assigns a unique request ID, logs request/response metadata,
    and attaches execution timing to headers.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        # Generate or preserve X-Request-ID
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        client_host = request.client.host if request.client else "unknown"
        start_time = time.perf_counter()

        logger.info(
            f"Incoming {request.method} {request.url.path}",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "client_ip": client_host,
            },
        )

        try:
            response = await call_next(request)
            process_time_ms = round((time.perf_counter() - start_time) * 1000, 2)

            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time-Ms"] = str(process_time_ms)

            logger.info(
                f"Completed {request.method} {request.url.path} -> {response.status_code} ({process_time_ms}ms)",
                extra={
                    "request_id": request_id,
                    "status_code": response.status_code,
                    "process_time_ms": process_time_ms,
                },
            )
            return response

        except Exception as exc:
            process_time_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"Unhandled error on {request.method} {request.url.path}: {exc}",
                extra={
                    "request_id": request_id,
                    "process_time_ms": process_time_ms,
                    "error": str(exc),
                },
            )
            raise exc

