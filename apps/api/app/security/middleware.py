from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enforce strict production security response headers across all API endpoints."""

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # Protect against MIME-sniffing exploits
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Frame restrictions (clickjacking defense)
        response.headers["X-Frame-Options"] = "SAMEORIGIN"

        # Legacy browser XSS filter
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer privacy policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Feature policy allowing microphone and speaker for speech tutoring
        response.headers["Permissions-Policy"] = "microphone=*, speaker=*"

        return response
