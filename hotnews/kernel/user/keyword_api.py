"""
User Keyword API - Endpoints for managing user custom keywords.
"""

import json
from typing import Optional
from fastapi import APIRouter, Request, HTTPException, Query, Body
from pydantic import BaseModel

from hotnews.kernel.services.user_keyword_service import UserKeywordService


router = APIRouter(prefix="/api/user/keywords", tags=["user-keywords"])


class AddKeywordRequest(BaseModel):
    keyword: str
    keyword_type: str = "exact"
    priority: int = 0
    case_sensitive: bool = False
    match_whole_word: bool = False
    is_exclude: bool = False
    auto_expand: bool = True


class UpdateKeywordRequest(BaseModel):
    keyword: Optional[str] = None
    keyword_type: Optional[str] = None
    priority: Optional[int] = None
    case_sensitive: Optional[bool] = None
    match_whole_word: Optional[bool] = None
    is_exclude: Optional[bool] = None
    auto_expand: Optional[bool] = None
    enabled: Optional[bool] = None


def _get_user_db_conn(request: Request):
    """Get user database connection."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_online_db_conn(request: Request):
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _get_current_user_id(request: Request) -> Optional[int]:
    """Get current authenticated user ID."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        return None
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    if not is_valid or not user_info:
        return None
    
    return user_info.get("id")


@router.get("")
async def list_keywords(request: Request, enabled_only: bool = Query(True)):
    """
    Get all keywords for the current user.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    service = UserKeywordService(user_conn, online_conn)
    keywords = service.get_user_keywords(user_id, enabled_only=enabled_only)
    
    return {"ok": True, "keywords": keywords}


@router.post("")
async def add_keyword(request: Request, data: AddKeywordRequest):
    """
    Add a new keyword for the current user.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    service = UserKeywordService(user_conn, online_conn)
    
    keyword_id = service.add_keyword(
        user_id=user_id,
        keyword=data.keyword,
        keyword_type=data.keyword_type,
        priority=data.priority,
        case_sensitive=data.case_sensitive,
        match_whole_word=data.match_whole_word,
        is_exclude=data.is_exclude,
        auto_expand=data.auto_expand,
    )
    
    if keyword_id is None:
        raise HTTPException(status_code=400, detail="Invalid keyword")
    
    return {"ok": True, "keyword_id": keyword_id}


@router.put("/{keyword_id}")
async def update_keyword(request: Request, keyword_id: int, data: UpdateKeywordRequest):
    """
    Update a keyword's settings.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_conn = _get_user_db_conn(request)
    service = UserKeywordService(user_conn)
    
    updates = {k: v for k, v in data.dict().items() if v is not None}
    
    success = service.update_keyword(keyword_id, user_id, **updates)
    
    if not success:
        raise HTTPException(status_code=400, detail="Update failed")
    
    return {"ok": True}


@router.delete("/{keyword_id}")
async def delete_keyword(request: Request, keyword_id: int):
    """
    Delete a keyword.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_conn = _get_user_db_conn(request)
    service = UserKeywordService(user_conn)
    
    success = service.delete_keyword(keyword_id, user_id)
    
    if not success:
        raise HTTPException(status_code=400, detail="Delete failed")
    
    # Invalidate my-tags cache
    try:
        from hotnews.web.timeline_cache import my_tags_cache
        my_tags_cache.invalidate()
    except Exception:
        pass
    
    return {"ok": True}


@router.get("/stats")
async def get_keyword_stats(request: Request):
    """
    Get keyword statistics for the current user.
    """
    user_id = _get_current_user_id(request)
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    
    user_conn = _get_user_db_conn(request)
    service = UserKeywordService(user_conn)
    
    stats = service.get_keyword_stats(user_id)
    
    return {"ok": True, **stats}
