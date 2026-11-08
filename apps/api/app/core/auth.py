"""auth.py – Route-level authentication helpers.

How it works
------------
Supabase issues a signed JWT access token when a user logs in.
The client sends it as:   Authorization: Bearer <access_token>

``get_current_user``  is a dependency (usable with FastAPI / plain functions)
that:
    1. Reads the Bearer token from the ``Authorization`` header.
    2. Asks Supabase Auth to validate the token and return the User object.
    3. Raises an error if the token is missing, expired, or invalid.

``FlaskSessionStorage`` wires Supabase Auth's token lifecycle into Flask's
signed-cookie session so that ``supabase.auth`` can store / refresh tokens
automatically during a request context.

Usage in FastAPI
----------------
    from fastapi import Depends
    from app.core.auth import get_current_user
    from supabase_auth import User

    @router.get("/me")
    def me(user: User = Depends(get_current_user)):
        return {"id": user.id, "email": user.email}

Usage in Flask
--------------
    from flask import request
    from app.core.auth import extract_bearer_token, verify_token

    @app.route("/me")
    def me():
        token = extract_bearer_token(request.headers.get("Authorization", ""))
        user  = verify_token(token)   # raises AuthError on failure
        return jsonify({"id": user.id, "email": user.email})
"""

from __future__ import annotations

from typing import Optional

from supabase_auth import SyncSupportedStorage, User

from app.core.db import db


# ── Flask session storage ─────────────────────────────────────────────────────


class FlaskSessionStorage(SyncSupportedStorage):
    """Stores Supabase Auth tokens inside Flask's signed-cookie session.

    Pass an instance of this class to ``ClientOptions`` when creating a
    per-request Supabase client in a Flask application so that GoTrue can
    persist / refresh tokens transparently.

    Example::

        from flask import session
        from supabase import create_client
        from supabase.lib.client_options import ClientOptions

        client = create_client(
            url, key,
            options=ClientOptions(
                storage=FlaskSessionStorage(),
                persist_session=True,
                auto_refresh_token=True,
            ),
        )
    """

    def __init__(self) -> None:
        # Lazy import so the module can be loaded outside a Flask context.
        from flask import session as _session  # noqa: F401  (validates availability)

        self._session_factory = lambda: __import__("flask").session  # type: ignore[attr-defined]

    def get_item(self, key: str) -> Optional[str]:
        return self._session_factory().get(key)

    def set_item(self, key: str, value: str) -> None:
        self._session_factory()[key] = value

    def remove_item(self, key: str) -> None:
        self._session_factory().pop(key, None)


# ── Shared helpers ────────────────────────────────────────────────────────────


class AuthError(Exception):
    """Raised when a token is missing or invalid."""

    def __init__(self, message: str = "Unauthorized", status_code: int = 401) -> None:
        super().__init__(message)
        self.status_code = status_code


def extract_bearer_token(authorization_header: str) -> str:
    """Parse ``Bearer <token>`` and return just the token string.

    Raises :class:`AuthError` if the header is absent or malformed.
    """
    if not authorization_header:
        raise AuthError("Authorization header is missing.")
    parts = authorization_header.split()
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise AuthError("Authorization header must be 'Bearer <token>'.")
    return parts[1]


def verify_token(access_token: str) -> User:
    """Ask Supabase Auth to validate *access_token* and return the ``User``.

    Uses the shared ``db`` client (anon key) which is sufficient for token
    introspection via the ``/auth/v1/user`` endpoint.

    Raises :class:`AuthError` on failure.
    """
    try:
        response = db.auth.get_user(access_token)
    except Exception as exc:
        raise AuthError(f"Token validation failed: {exc}") from exc

    if response is None or response.user is None:
        raise AuthError("Invalid or expired token.")

    return response.user


# ── FastAPI dependency ────────────────────────────────────────────────────────

try:
    from fastapi import Header, HTTPException, status

    async def get_current_user(
        authorization: str = Header(
            ...,
            description="Bearer token issued by Supabase Auth",
            alias="Authorization",
        ),
    ) -> User:
        """FastAPI dependency – resolves the current authenticated user.

        Inject with ``Depends(get_current_user)`` in any route that requires
        authentication.

        Raises ``HTTP 401`` if the token is missing or invalid.
        """
        try:
            token = extract_bearer_token(authorization)
            return verify_token(token)
        except AuthError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=str(exc),
                headers={"WWW-Authenticate": "Bearer"},
            ) from exc

except ImportError:
    # FastAPI is not installed – that's fine, Flask-only setups still work.
    pass

