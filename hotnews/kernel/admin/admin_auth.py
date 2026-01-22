"""
Admin Authentication Module

Provides password-based authentication with session management for the admin panel.
"""

import hashlib
import hmac
import logging
import os
import secrets
import time
from typing import Optional, Tuple

_logger = logging.getLogger(__name__)

# Session configuration
_SESSION_COOKIE_NAME = "admin_session"
_SESSION_HOURS = int(os.environ.get("HOTNEWS_ADMIN_SESSION_HOURS", "24"))
_SESSION_SECRET = os.environ.get("HOTNEWS_SESSION_SECRET", "")


def _get_session_secret() -> str:
    """Get or generate a session signing secret."""
    global _SESSION_SECRET
    if not _SESSION_SECRET:
        # Generate a random secret if not set (will change on restart)
        _SESSION_SECRET = secrets.token_hex(32)
        _logger.warning(
            "HOTNEWS_SESSION_SECRET not configured! Using auto-generated secret. "
            "Sessions will be invalidated on server restart. "
            "Set HOTNEWS_SESSION_SECRET environment variable for persistent sessions."
        )
    return _SESSION_SECRET


def _hash_password(password: str) -> str:
    """Create a SHA256 hash of the password."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def get_admin_password() -> str:
    """Get the configured admin password from environment."""
    return (os.environ.get("HOTNEWS_ADMIN_PASSWORD") or "").strip()


def get_admin_token() -> str:
    """Get the configured admin token (legacy) from environment."""
    return (os.environ.get("HOTNEWS_ADMIN_TOKEN") or "").strip()


def verify_admin_password(password: str) -> bool:
    """
    Verify the provided password against the configured admin password.
    
    Uses constant-time comparison to prevent timing attacks.
    Returns True if password matches, False otherwise.
    """
    admin_password = get_admin_password()
    if not admin_password:
        return False
    # Use hmac.compare_digest to prevent timing attacks
    return hmac.compare_digest(password.encode("utf-8"), admin_password.encode("utf-8"))


def create_admin_session() -> str:
    """
    Create a new admin session token.
    
    Returns a signed session token that includes:
    - Random session ID
    - Expiration timestamp
    - HMAC signature
    """
    session_id = secrets.token_hex(16)
    expires_at = int(time.time()) + (_SESSION_HOURS * 3600)
    
    # Format: session_id.expires_at.signature
    payload = f"{session_id}.{expires_at}"
    signature = hmac.new(
        _get_session_secret().encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()[:16]
    
    return f"{payload}.{signature}"


def verify_admin_session(token: str) -> Tuple[bool, str]:
    """
    Verify an admin session token.
    
    Returns:
        Tuple of (is_valid, error_message)
    """
    if not token:
        return False, "No session token"
    
    parts = token.split(".")
    if len(parts) != 3:
        return False, "Invalid token format"
    
    session_id, expires_str, signature = parts
    
    # Verify signature
    payload = f"{session_id}.{expires_str}"
    expected_sig = hmac.new(
        _get_session_secret().encode("utf-8"),
        payload.encode("utf-8"),
        hashlib.sha256
    ).hexdigest()[:16]
    
    if not hmac.compare_digest(signature, expected_sig):
        return False, "Invalid signature"
    
    # Check expiration
    try:
        expires_at = int(expires_str)
    except ValueError:
        return False, "Invalid expiration"
    
    if time.time() > expires_at:
        return False, "Session expired"
    
    return True, ""


def get_session_cookie_name() -> str:
    """Get the session cookie name."""
    return _SESSION_COOKIE_NAME


def is_password_auth_enabled() -> bool:
    """Check if password-based authentication is enabled."""
    return bool(get_admin_password())
