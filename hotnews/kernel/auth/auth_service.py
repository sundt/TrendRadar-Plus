# coding=utf-8
"""
User Authentication Service

Provides authentication functionality including:
- Email/password registration and login
- Session management
- OAuth integration (GitHub, Google)
- Password reset via email
"""

import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Dict, Optional, Tuple

import bcrypt


def _now_ts() -> int:
    return int(time.time())


def _sha256_hex(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    """Verify a password against its hash."""
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def generate_session_token() -> str:
    """Generate a secure session token."""
    return secrets.token_urlsafe(32)


def generate_verification_code() -> str:
    """Generate a 6-digit verification code."""
    return str(secrets.randbelow(900000) + 100000)


# ==================== User Registration ====================

def register_user_with_email(
    conn,
    email: str,
    password: str,
    nickname: str = "",
) -> Tuple[bool, str, Optional[int]]:
    """
    Register a new user with email and password.
    
    Returns:
        (success, message, user_id)
    """
    email = email.strip().lower()
    if not email or "@" not in email:
        return False, "Invalid email format", None
    
    if len(password) < 6:
        return False, "Password must be at least 6 characters", None
    
    # Check if email already exists
    cur = conn.execute(
        "SELECT id FROM users WHERE email = ?",
        (email,)
    )
    if cur.fetchone():
        return False, "Email already registered", None
    
    now = _now_ts()
    pwd_hash = hash_password(password)
    nickname = nickname.strip() or email.split("@")[0]
    
    # Create user
    conn.execute(
        """
        INSERT INTO users (email, password_hash, nickname, email_verified, status, created_at, last_seen_at)
        VALUES (?, ?, ?, 0, 'active', ?, ?)
        """,
        (email, pwd_hash, nickname, now, now)
    )
    user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    
    # Add to user_auth_methods
    conn.execute(
        """
        INSERT INTO user_auth_methods (user_id, auth_type, auth_id, auth_data, created_at, last_used_at)
        VALUES (?, 'email', ?, '{}', ?, ?)
        """,
        (user_id, email, now, now)
    )
    
    conn.commit()
    return True, "Registration successful", user_id


# ==================== User Login ====================

def login_with_email(
    conn,
    email: str,
    password: str,
    device_info: str = "",
    ip_address: str = "",
    session_duration_days: int = 30,
) -> Tuple[bool, str, Optional[str], Optional[Dict]]:
    """
    Login with email and password.
    
    Returns:
        (success, message, session_token, user_info)
    """
    email = email.strip().lower()
    
    cur = conn.execute(
        "SELECT id, password_hash, nickname, avatar_url, email_verified, status FROM users WHERE email = ?",
        (email,)
    )
    row = cur.fetchone()
    
    if not row:
        return False, "Invalid email or password", None, None
    
    user_id, pwd_hash, nickname, avatar_url, email_verified, status = row
    
    if status != "active":
        return False, f"Account is {status}", None, None
    
    if not pwd_hash or not verify_password(password, pwd_hash):
        return False, "Invalid email or password", None, None
    
    # Create session
    now = _now_ts()
    session_token = generate_session_token()
    expires_at = now + (session_duration_days * 24 * 3600)
    
    conn.execute(
        """
        INSERT INTO user_sessions (id, user_id, device_info, ip_address, created_at, expires_at, last_active_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (session_token, user_id, device_info[:500], ip_address[:50], now, expires_at, now)
    )
    
    # Update last seen
    conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now, user_id))
    
    # Update auth method last used
    conn.execute(
        "UPDATE user_auth_methods SET last_used_at = ? WHERE user_id = ? AND auth_type = 'email'",
        (now, user_id)
    )
    
    conn.commit()
    
    user_info = {
        "id": user_id,
        "email": email,
        "nickname": nickname or email.split("@")[0],
        "avatar_url": avatar_url or "",
        "email_verified": bool(email_verified),
    }
    
    return True, "Login successful", session_token, user_info


# ==================== Passwordless Login ====================

def passwordless_login_or_register(
    conn,
    email: str,
    device_info: str = "",
    ip_address: str = "",
    session_duration_days: int = 30,
) -> Tuple[bool, str, Optional[str], Optional[Dict]]:
    """
    Login or register a user via email verification code (passwordless).
    
    If the email exists, login. If not, auto-register.
    
    Returns:
        (success, message, session_token, user_info)
    """
    email = email.strip().lower()
    if not email or "@" not in email:
        return False, "Invalid email format", None, None
    
    now = _now_ts()
    
    # Check if user exists
    cur = conn.execute(
        "SELECT id, nickname, avatar_url, email_verified, status FROM users WHERE email = ?",
        (email,)
    )
    row = cur.fetchone()
    
    if row:
        # Existing user - login
        user_id, nickname, avatar_url, email_verified, status = row
        
        if status != "active":
            return False, f"Account is {status}", None, None
        
        # Mark email as verified (since they received the code)
        if not email_verified:
            conn.execute("UPDATE users SET email_verified = 1 WHERE id = ?", (user_id,))
            email_verified = 1
    else:
        # New user - auto register
        nickname = email.split("@")[0]
        avatar_url = ""
        email_verified = 1  # Verified since they received the code
        
        conn.execute(
            """
            INSERT INTO users (email, password_hash, nickname, email_verified, status, created_at, last_seen_at)
            VALUES (?, '', ?, 1, 'active', ?, ?)
            """,
            (email, nickname, now, now)
        )
        user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        # Add to user_auth_methods
        conn.execute(
            """
            INSERT INTO user_auth_methods (user_id, auth_type, auth_id, auth_data, created_at, last_used_at)
            VALUES (?, 'email_code', ?, '{}', ?, ?)
            """,
            (user_id, email, now, now)
        )
    
    # Create session
    session_token = generate_session_token()
    expires_at = now + (session_duration_days * 24 * 3600)
    
    conn.execute(
        """
        INSERT INTO user_sessions (id, user_id, device_info, ip_address, created_at, expires_at, last_active_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (session_token, user_id, device_info[:500], ip_address[:50], now, expires_at, now)
    )
    
    # Update last seen
    conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now, user_id))
    
    conn.commit()
    
    user_info = {
        "id": user_id,
        "email": email,
        "nickname": nickname or email.split("@")[0],
        "avatar_url": avatar_url or "",
        "email_verified": True,
    }
    
    return True, "登录成功", session_token, user_info


# ==================== Session Management ====================

def validate_session(conn, session_token: str) -> Tuple[bool, Optional[Dict]]:
    """
    Validate a session token and return user info.
    
    Returns:
        (is_valid, user_info)
    """
    if not session_token:
        return False, None
    
    now = _now_ts()
    
    cur = conn.execute(
        """
        SELECT s.user_id, s.expires_at, u.email, u.nickname, u.avatar_url, u.email_verified, u.status
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
        """,
        (session_token,)
    )
    row = cur.fetchone()
    
    if not row:
        return False, None
    
    user_id, expires_at, email, nickname, avatar_url, email_verified, status = row
    
    if expires_at < now:
        # Session expired, clean up
        conn.execute("DELETE FROM user_sessions WHERE id = ?", (session_token,))
        conn.commit()
        return False, None
    
    if status != "active":
        return False, None
    
    # Update last active
    conn.execute(
        "UPDATE user_sessions SET last_active_at = ? WHERE id = ?",
        (now, session_token)
    )
    conn.commit()
    
    return True, {
        "id": user_id,
        "email": email,
        "nickname": nickname or email.split("@")[0],
        "avatar_url": avatar_url or "",
        "email_verified": bool(email_verified),
    }


def logout_session(conn, session_token: str) -> bool:
    """Invalidate a session."""
    conn.execute("DELETE FROM user_sessions WHERE id = ?", (session_token,))
    conn.commit()
    return True


def logout_all_sessions(conn, user_id: int) -> int:
    """Invalidate all sessions for a user."""
    cur = conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
    conn.commit()
    return cur.rowcount


def cleanup_expired_sessions(conn) -> int:
    """Remove all expired sessions."""
    now = _now_ts()
    cur = conn.execute("DELETE FROM user_sessions WHERE expires_at < ?", (now,))
    conn.commit()
    return cur.rowcount


# ==================== Password Reset ====================

# Store reset tokens in memory (for simplicity, consider using Redis in production)
_password_reset_tokens: Dict[str, Tuple[int, str, int]] = {}  # token -> (user_id, email, expires_at)


def create_password_reset_token(conn, email: str) -> Tuple[bool, str, Optional[str]]:
    """
    Create a password reset token for an email.
    
    Returns:
        (success, message, reset_token)
    """
    email = email.strip().lower()
    
    cur = conn.execute("SELECT id FROM users WHERE email = ? AND status = 'active'", (email,))
    row = cur.fetchone()
    
    if not row:
        # Don't reveal if email exists
        return True, "If the email exists, a reset link will be sent", None
    
    user_id = row[0]
    token = secrets.token_urlsafe(32)
    expires_at = _now_ts() + 3600  # 1 hour
    
    _password_reset_tokens[token] = (user_id, email, expires_at)
    
    return True, "Reset token created", token


def reset_password_with_token(conn, token: str, new_password: str) -> Tuple[bool, str]:
    """
    Reset password using a reset token.
    
    Returns:
        (success, message)
    """
    if token not in _password_reset_tokens:
        return False, "Invalid or expired reset token"
    
    user_id, email, expires_at = _password_reset_tokens[token]
    
    if expires_at < _now_ts():
        del _password_reset_tokens[token]
        return False, "Reset token has expired"
    
    if len(new_password) < 6:
        return False, "Password must be at least 6 characters"
    
    pwd_hash = hash_password(new_password)
    now = _now_ts()
    
    conn.execute(
        "UPDATE users SET password_hash = ?, last_seen_at = ? WHERE id = ?",
        (pwd_hash, now, user_id)
    )
    
    # Invalidate all existing sessions
    conn.execute("DELETE FROM user_sessions WHERE user_id = ?", (user_id,))
    
    conn.commit()
    
    # Remove used token
    del _password_reset_tokens[token]
    
    return True, "Password reset successful"


# ==================== OAuth Integration ====================

def oauth_login_or_register(
    conn,
    auth_type: str,  # 'github', 'google', 'wechat'
    auth_id: str,    # OAuth provider's unique user ID
    auth_data: Dict[str, Any],  # Access token, user info, etc.
    email: Optional[str] = None,
    nickname: Optional[str] = None,
    avatar_url: Optional[str] = None,
    device_info: str = "",
    ip_address: str = "",
) -> Tuple[bool, str, Optional[str], Optional[Dict]]:
    """
    Login or register via OAuth provider.
    
    Returns:
        (success, message, session_token, user_info)
    """
    now = _now_ts()
    
    # Check if OAuth identity exists
    cur = conn.execute(
        "SELECT user_id FROM user_auth_methods WHERE auth_type = ? AND auth_id = ?",
        (auth_type, auth_id)
    )
    row = cur.fetchone()
    
    if row:
        # Existing user - login
        user_id = row[0]
        
        # Update auth data
        conn.execute(
            "UPDATE user_auth_methods SET auth_data = ?, last_used_at = ? WHERE auth_type = ? AND auth_id = ?",
            (json.dumps(auth_data), now, auth_type, auth_id)
        )
    else:
        # New user - register
        # Check if email exists (link accounts)
        if email:
            email = email.strip().lower()
            cur = conn.execute("SELECT id FROM users WHERE email = ?", (email,))
            existing = cur.fetchone()
            if existing:
                user_id = existing[0]
            else:
                user_id = None
        else:
            user_id = None
        
        if user_id is None:
            # Create new user
            conn.execute(
                """
                INSERT INTO users (email, nickname, avatar_url, email_verified, status, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, 'active', ?, ?)
                """,
                (email or "", nickname or "", avatar_url or "", 1 if email else 0, now, now)
            )
            user_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        
        # Add OAuth method
        conn.execute(
            """
            INSERT INTO user_auth_methods (user_id, auth_type, auth_id, auth_data, created_at, last_used_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (user_id, auth_type, auth_id, json.dumps(auth_data), now, now)
        )
    
    # Get user info
    cur = conn.execute(
        "SELECT email, nickname, avatar_url, email_verified FROM users WHERE id = ?",
        (user_id,)
    )
    user_row = cur.fetchone()
    
    # Update user info from OAuth if missing
    if user_row:
        u_email, u_nickname, u_avatar, u_verified = user_row
        updates = []
        params = []
        
        if not u_nickname and nickname:
            updates.append("nickname = ?")
            params.append(nickname)
        if not u_avatar and avatar_url:
            updates.append("avatar_url = ?")
            params.append(avatar_url)
        if not u_email and email:
            updates.append("email = ?")
            params.append(email)
        
        if updates:
            params.append(user_id)
            conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
    
    # Create session
    session_token = generate_session_token()
    expires_at = now + (30 * 24 * 3600)  # 30 days
    
    conn.execute(
        """
        INSERT INTO user_sessions (id, user_id, device_info, ip_address, created_at, expires_at, last_active_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (session_token, user_id, device_info[:500], ip_address[:50], now, expires_at, now)
    )
    
    conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (now, user_id))
    conn.commit()
    
    # Get final user info
    cur = conn.execute(
        "SELECT email, nickname, avatar_url, email_verified FROM users WHERE id = ?",
        (user_id,)
    )
    final = cur.fetchone()
    
    user_info = {
        "id": user_id,
        "email": final[0] or "",
        "nickname": final[1] or nickname or "",
        "avatar_url": final[2] or avatar_url or "",
        "email_verified": bool(final[3]),
        "auth_type": auth_type,
    }
    
    return True, "Login successful", session_token, user_info


# ==================== User Profile ====================

def update_user_profile(
    conn,
    user_id: int,
    nickname: Optional[str] = None,
    avatar_url: Optional[str] = None,
) -> Tuple[bool, str]:
    """Update user profile."""
    updates = []
    params = []
    
    if nickname is not None:
        updates.append("nickname = ?")
        params.append(nickname.strip()[:50])
    if avatar_url is not None:
        updates.append("avatar_url = ?")
        params.append(avatar_url.strip()[:500])
    
    if not updates:
        return True, "No changes"
    
    params.append(user_id)
    conn.execute(f"UPDATE users SET {', '.join(updates)} WHERE id = ?", tuple(params))
    conn.commit()
    
    return True, "Profile updated"


def change_password(
    conn,
    user_id: int,
    old_password: str,
    new_password: str,
) -> Tuple[bool, str]:
    """Change user password."""
    cur = conn.execute("SELECT password_hash FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    
    if not row or not row[0]:
        return False, "No password set for this account"
    
    if not verify_password(old_password, row[0]):
        return False, "Current password is incorrect"
    
    if len(new_password) < 6:
        return False, "New password must be at least 6 characters"
    
    pwd_hash = hash_password(new_password)
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (pwd_hash, user_id))
    conn.commit()
    
    return True, "Password changed successfully"
