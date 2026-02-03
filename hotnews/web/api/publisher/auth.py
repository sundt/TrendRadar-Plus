# coding=utf-8
"""
Publisher Authentication Helpers

Provides authentication and authorization utilities for the publisher API.
"""

from functools import wraps
from typing import Optional, Dict, Any, Tuple

from fastapi import Request, HTTPException


SESSION_COOKIE_NAME = "hotnews_session"
ANONYMOUS_USER_ID = 0  # 匿名用户 ID


def _get_session_token(request: Request) -> Optional[str]:
    """Get session token from cookie."""
    return request.cookies.get(SESSION_COOKIE_NAME)


def _get_user_db_conn(request: Request):
    """Get user database connection."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_online_db_conn(request: Request):
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def get_anonymous_user() -> Dict[str, Any]:
    """Get anonymous user info."""
    return {
        "id": ANONYMOUS_USER_ID,
        "username": "anonymous",
        "is_member": True,  # 允许匿名用户使用所有功能
    }


async def get_current_user(request: Request) -> Optional[Dict[str, Any]]:
    """
    Get current authenticated user from session.
    
    Returns:
        User info dict or None if not authenticated
    """
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        return None
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        return None
    
    # Check membership status
    cur = conn.execute("SELECT is_member FROM users WHERE id = ?", (user_info["id"],))
    row = cur.fetchone()
    user_info["is_member"] = bool(row[0]) if row else False
    
    return user_info


async def require_auth(request: Request) -> Dict[str, Any]:
    """
    Require authentication (or return anonymous user).
    
    Returns:
        User info dict (authenticated user or anonymous)
    """
    user = await get_current_user(request)
    if not user:
        # 返回匿名用户，允许未登录使用
        return get_anonymous_user()
    return user


async def require_member(request: Request) -> Dict[str, Any]:
    """
    Require membership (or return anonymous user).
    
    Returns:
        User info dict (authenticated member or anonymous)
    """
    user = await get_current_user(request)
    if not user:
        # 返回匿名用户，允许未登录使用
        return get_anonymous_user()
    return user


def check_draft_permission(draft: Dict[str, Any], user_id: int) -> None:
    """
    Check if user has permission to access a draft.
    
    Raises:
        HTTPException: 403 if user doesn't own the draft
    """
    # 匿名用户可以访问匿名草稿
    if user_id == ANONYMOUS_USER_ID and draft["user_id"] == ANONYMOUS_USER_ID:
        return
    # 登录用户只能访问自己的草稿
    if draft["user_id"] != user_id:
        raise HTTPException(status_code=403, detail="无权访问此草稿")
