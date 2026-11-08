"""Authentication middleware and FastAPI dependencies for tenant extraction."""

from typing import Optional
from fastapi import Header, HTTPException, Request, status
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from app.core.auth import AuthError, extract_bearer_token, verify_token
from app.core.logger import get_logger

logger = get_logger("app.auth")


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """Inspects Authorization header on every request and populates request.state.user
    and request.state.owner_id if a valid Supabase JWT is present.
    """

    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        auth_header = request.headers.get("Authorization")
        request.state.user = None
        request.state.owner_id = None

        if auth_header:
            try:
                token = extract_bearer_token(auth_header)
                user = verify_token(token)
                request.state.user = user
                request.state.owner_id = user.id
            except AuthError as exc:
                # Log invalid token attempts but allow public paths to proceed;
                # protected route dependencies will enforce authorization where needed
                logger.debug(f"Auth token verification failed: {exc}")

        # Fallback for local development / testing if explicitly passed via X-Owner-Id
        if not request.state.owner_id and "X-Owner-Id" in request.headers:
            request.state.owner_id = request.headers["X-Owner-Id"]

        return await call_next(request)


async def get_required_owner_id(
    request: Request,
    authorization: Optional[str] = Header(None, alias="Authorization"),
    x_owner_id: Optional[str] = Header(None, alias="X-Owner-Id"),
) -> str:
    """FastAPI dependency: Resolves the owner_id of the caller.

    1. Checks for a verified Supabase JWT via Authorization: Bearer <token>.
    2. Falls back to X-Owner-Id (useful for testing or server-to-server calls).
    3. Raises 401 Unauthorized if neither is present or token is invalid.
    """
    # 1. From Authorization Bearer
    if authorization:
        try:
            token = extract_bearer_token(authorization)
            user = verify_token(token)
            return user.id
        except AuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

    # 2. From middleware state
    if getattr(request.state, "owner_id", None):
        return request.state.owner_id

    # 3. From X-Owner-Id header fallback
    if x_owner_id:
        return x_owner_id

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Authentication required. Provide 'Authorization: Bearer <token>' or 'X-Owner-Id'.",
        headers={"WWW-Authenticate": "Bearer"},
    )

