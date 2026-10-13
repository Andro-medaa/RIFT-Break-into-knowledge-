import time
import uuid
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from app.telemetry.tracer import latency_tracer


class RequestTimingMiddleware(BaseHTTPMiddleware):
    """Measures precise HTTP request durations and feeds latency traces
    into the SLO monitoring engine.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.perf_counter()
        trace_id = f"tr_{uuid.uuid4().hex[:10]}"

        response: Response = await call_next(request)

        duration_ms = (time.perf_counter() - start_time) * 1000.0

        # Inject timing and trace headers into client response
        response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
        response.headers["X-Trace-Id"] = trace_id

        # Skip recording static health or ping probes to keep SLO metrics clean
        path = request.url.path
        if path not in ("/api/ping", "/favicon.ico"):
            latency_tracer.record_trace(
                trace_id=trace_id,
                route=path,
                method=request.method,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )

        return response
