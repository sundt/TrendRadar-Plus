# coding=utf-8
"""
Publisher User API

Provides user info endpoint for the publisher feature.
"""

from fastapi import APIRouter, Request

from .auth import get_current_user

router = APIRouter(prefix="/api/publisher", tags=["publisher"])


@router.get("/user/me")
async def api_get_current_user(request: Request):
    """Get current user info including membership status.
    
    Returns:
        - ok: True if authenticated
        - user: User info dict with id, nickname, avatar_url, is_member
        - authenticated: False if not logged in
    """
    user = await get_current_user(request)
    
    if not user:
        return {
            "ok": True,
            "authenticated": False,
            "user": None,
        }
    
    return {
        "ok": True,
        "authenticated": True,
        "user": {
            "id": user.get("id"),
            "nickname": user.get("nickname", ""),
            "avatar_url": user.get("avatar_url", ""),
            "is_member": user.get("is_member", False),
        },
    }
