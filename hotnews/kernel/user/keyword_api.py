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


from hotnews.kernel.auth.deps import get_optional_user_id as _get_current_user_id


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

    # 新增/重复添加的关键词自动塞到 __tag_order__ 第一位，命中 my-tags 排序里的 pinned 桶。
    # 否则刚加完的关键词会按 followed_at 落到所有已 pin 项之后，用户还得手动找到再右键置顶。
    try:
        import time as _time_mod
        composite_id = f"keyword_{keyword_id}".lower()
        order_row = user_conn.execute(
            "SELECT preference FROM user_tag_settings WHERE user_id = ? AND tag_id = '__tag_order__'",
            (user_id,)
        ).fetchone()
        existing = [x for x in (order_row[0].split(",") if order_row and order_row[0] else []) if x and x != composite_id]
        new_order = ",".join([composite_id] + existing)
        now_ts = int(_time_mod.time())
        user_conn.execute(
            """
            INSERT INTO user_tag_settings (user_id, tag_id, preference, created_at)
            VALUES (?, '__tag_order__', ?, ?)
            ON CONFLICT(user_id, tag_id) DO UPDATE SET preference = ?, created_at = ?
            """,
            (user_id, new_order, now_ts, new_order, now_ts)
        )
        user_conn.commit()
        from hotnews.web.timeline_cache import my_tags_cache
        my_tags_cache.invalidate()
    except Exception:
        pass

    # 咖啡弹窗：非会员且关键词超过 3 个时返回提示信号，前端弹"请我喝杯咖啡 ¥9.9"
    show_coffee_prompt = False
    try:
        row = user_conn.execute(
            "SELECT is_member FROM users WHERE id = ?", (user_id,)
        ).fetchone()
        is_member = bool(row and row[0])
        if not is_member:
            kw_count_row = user_conn.execute(
                "SELECT COUNT(*) FROM user_keywords WHERE user_id = ? AND enabled = 1",
                (user_id,),
            ).fetchone()
            kw_count = int(kw_count_row[0]) if kw_count_row else 0
            if kw_count > 3:
                show_coffee_prompt = True
    except Exception:
        pass

    # 触发 FTS keyword 预热（fire-and-forget）：把新 keyword 的相关 FTS 页面
    # 拉进 OS page cache，避免该用户/其他用户首次访问时遭遇 4-5s 冷 LIKE 扫表。
    # OS page cache 跨 worker 共享，一个 worker 跑一次两个 worker 都受益。
    try:
        import threading
        project_root = request.app.state.project_root
        fts_db_path = project_root / "output" / "search_indexes" / "fts_index.db"
        new_kw = (data.keyword or "").strip()
        if fts_db_path.exists() and new_kw:
            def _warm():
                try:
                    import sqlite3 as _sq
                    _c = _sq.connect(str(fts_db_path))
                    try:
                        _c.execute("SELECT title FROM news_fts WHERE title MATCH ? LIMIT 5", (new_kw,)).fetchall()
                    except Exception:
                        pass
                    try:
                        _c.execute("SELECT title FROM news_fts WHERE title LIKE ? LIMIT 5", (f"%{new_kw}%",)).fetchall()
                    except Exception:
                        pass
                    _c.close()
                except Exception:
                    pass
            threading.Thread(target=_warm, daemon=True).start()
    except Exception:
        pass

    return {"ok": True, "keyword_id": keyword_id, "show_coffee_prompt": show_coffee_prompt}


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
