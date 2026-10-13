import hashlib
import hmac
import time
from typing import Tuple, Optional
from urllib.parse import urlencode, parse_qs, urlsplit
from app.core.config import settings


def generate_signature(resource_id: str, expires_at: int, secret_key: Optional[str] = None) -> str:
    """Generate HMAC-SHA256 signature for resource and expiration timestamp."""
    secret = (secret_key or settings.SECRET_KEY).encode("utf-8")
    payload = f"{resource_id}:{expires_at}".encode("utf-8")
    return hmac.new(secret, payload, hashlib.sha256).hexdigest()


def create_signed_url(
    base_url: str,
    resource_id: str,
    expires_in_seconds: Optional[int] = None,
    secret_key: Optional[str] = None,
) -> str:
    """Create a signed URL with timestamp and HMAC-SHA256 signature."""
    ttl = expires_in_seconds or settings.SIGNED_URL_DEFAULT_EXPIRY_SECONDS
    expires_at = int(time.time()) + ttl
    sig = generate_signature(resource_id, expires_at, secret_key)

    sep = "&" if "?" in base_url else "?"
    query = urlencode({"expires": expires_at, "sig": sig})
    return f"{base_url}{sep}{query}"


def verify_signed_url(
    resource_id: str,
    expires_at: int,
    signature: str,
    secret_key: Optional[str] = None,
) -> Tuple[bool, str]:
    """Verify signed URL expiration and cryptographic HMAC integrity.
    Returns (is_valid, failure_reason).
    """
    now = int(time.time())

    # 1. Check expiration timestamp
    if now > expires_at:
        return False, "Signed URL has expired"

    # 2. Check HMAC signature using constant-time comparison
    expected_sig = generate_signature(resource_id, expires_at, secret_key)
    if not hmac.compare_digest(expected_sig, signature):
        return False, "Invalid cryptographic signature"

    return True, "Valid signature"
