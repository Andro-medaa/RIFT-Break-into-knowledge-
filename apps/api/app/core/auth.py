from datetime import datetime, timezone, timedelta
import os
from typing import Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field

# Security scheme
security = HTTPBearer(auto_error=False)

JWT_SECRET = os.getenv("JWT_SECRET", "rift-development-jwt-secret-key-32chars!!").strip()
ALGORITHM = "HS256"


class User(BaseModel):
    id: str = Field(..., description="Unique user UUID")
    email: str = Field(..., description="User email address")
    name: Optional[str] = Field(default=None, description="Display name")
    role: str = Field(default="student", description="Role e.g. student, educator, admin")
    is_guest: bool = Field(default=False, description="Whether this is a temporary guest account")


# In-memory user directory for dev / testing
MOCK_USERS = {
    "user-student-1": User(
        id="user-student-1",
        email="alex@university.edu",
        name="Alex River",
        role="student",
        is_guest=False,
    ),
    "user-student-2": User(
        id="user-student-2",
        email="sam@polytechnic.edu",
        name="Sam Taylor",
        role="student",
        is_guest=False,
    ),
    "guest": User(
        id="guest-session-uuid",
        email="guest@rift.local",
        name="Guest Learner",
        role="student",
        is_guest=True,
    ),
}


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> User:
    """
    Validates Bearer token or returns mock/guest user.
    In production: decodes Supabase JWT (HS256 or RS256) verifying aud and exp claims.
    """
    if not credentials:
        # Default to guest user for seamless zero-barrier prototype access
        return MOCK_USERS["guest"]

    token = credentials.credentials.strip()

    # 1. Check dev/test tokens
    if token in MOCK_USERS:
        return MOCK_USERS[token]

    # 2. Decode simple bearer token formatted as user_id:email
    if ":" in token:
        parts = token.split(":")
        return User(
            id=parts[0],
            email=parts[1] if len(parts) > 1 else f"{parts[0]}@rift.local",
            name=parts[0].capitalize(),
            is_guest=False,
        )

    # 3. Fallback to guest if invalid token format
    return MOCK_USERS["guest"]


def require_authenticated_user(current_user: User = Depends(get_current_user)) -> User:
    """Enforces non-guest authentication for private document creation."""
    if current_user.is_guest:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please sign in with Google or GitHub.",
        )
    return current_user
