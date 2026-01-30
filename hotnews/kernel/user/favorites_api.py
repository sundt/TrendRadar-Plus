# coding=utf-8
"""
User Favorites API

Provides endpoints for managing user's favorite news items.
"""

import time
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Body, Query

router = APIRouter(prefix="/api/user/favorites", tags=["favorites"])


def _now_ts() -> int:
    return int(time.time())


def _get_user_db_conn(request: Request):
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_current_user(request: Request):
    """Get current authenticated user or raise 401."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="Session expired")
    
    return user_info


def _ensure_favorites_table(conn):
    """Ensure the favorites table exists with all columns."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            news_id TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            source_id TEXT,
            source_name TEXT,
            published_at INTEGER,
            created_at INTEGER NOT NULL,
            note TEXT,
            summary TEXT,
            summary_at INTEGER,
            summary_model TEXT,
            UNIQUE(user_id, news_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_favorites_created ON user_favorites(user_id, created_at DESC)")
    
    # Migration: add summary columns if they don't exist
    try:
        conn.execute("SELECT summary FROM user_favorites LIMIT 1")
    except Exception:
        conn.execute("ALTER TABLE user_favorites ADD COLUMN summary TEXT")
        conn.execute("ALTER TABLE user_favorites ADD COLUMN summary_at INTEGER")
        conn.execute("ALTER TABLE user_favorites ADD COLUMN summary_model TEXT")
    
    conn.commit()


@router.get("")
async def get_favorites(
    request: Request,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0)
):
    """Get user's favorites list."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    cur = conn.execute(
        """
        SELECT id, news_id, title, url, source_id, source_name, published_at, created_at, note, summary, summary_at, summary_model
        FROM user_favorites
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (user["id"], limit, offset)
    )
    
    favorites = []
    for row in cur.fetchall() or []:
        favorites.append({
            "id": row[0],
            "news_id": row[1],
            "title": row[2],
            "url": row[3],
            "source_id": row[4],
            "source_name": row[5],
            "published_at": row[6],
            "created_at": row[7],
            "note": row[8],
            "summary": row[9],
            "summary_at": row[10],
            "summary_model": row[11],
        })
    
    # Get total count
    count_cur = conn.execute(
        "SELECT COUNT(*) FROM user_favorites WHERE user_id = ?",
        (user["id"],)
    )
    total = count_cur.fetchone()[0]
    
    return {"ok": True, "favorites": favorites, "total": total}


@router.post("")
async def add_favorite(
    request: Request,
    news_id: str = Body(...),
    title: str = Body(...),
    url: str = Body(...),
    source_id: Optional[str] = Body(None),
    source_name: Optional[str] = Body(None),
    published_at: Optional[int] = Body(None),
    note: Optional[str] = Body(None),
):
    """Add a news item to favorites."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    news_id = news_id.strip()
    title = title.strip()[:500]  # Limit title length
    url = url.strip()[:2000]  # Limit URL length
    
    if not news_id or not title:
        raise HTTPException(status_code=400, detail="news_id and title are required")
    
    now = _now_ts()
    
    try:
        conn.execute(
            """
            INSERT INTO user_favorites (user_id, news_id, title, url, source_id, source_name, published_at, created_at, note)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, news_id) DO UPDATE SET
                title = excluded.title,
                url = excluded.url,
                source_id = excluded.source_id,
                source_name = excluded.source_name,
                note = excluded.note
            """,
            (user["id"], news_id, title, url, source_id, source_name, published_at, now, note)
        )
        conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add favorite: {str(e)}")
    
    return {
        "ok": True,
        "favorite": {
            "news_id": news_id,
            "title": title,
            "url": url,
            "source_id": source_id,
            "source_name": source_name,
            "published_at": published_at,
            "created_at": now,
            "note": note,
        }
    }


@router.delete("/{news_id}")
async def remove_favorite(request: Request, news_id: str):
    """Remove a news item from favorites."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    conn.execute(
        "DELETE FROM user_favorites WHERE user_id = ? AND news_id = ?",
        (user["id"], news_id)
    )
    conn.commit()
    
    return {"ok": True, "news_id": news_id}


@router.post("/check")
async def check_favorites(
    request: Request,
    news_ids: list = Body(...),
):
    """Check which news items are favorited."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    if not news_ids:
        return {"ok": True, "favorited": []}
    
    placeholders = ",".join(["?"] * len(news_ids))
    cur = conn.execute(
        f"SELECT news_id FROM user_favorites WHERE user_id = ? AND news_id IN ({placeholders})",
        (user["id"], *news_ids)
    )
    
    favorited = [row[0] for row in cur.fetchall() or []]
    
    return {"ok": True, "favorited": favorited}


@router.post("/sync")
async def sync_favorites(
    request: Request,
    client_favorites: list = Body(default=[]),
    last_sync_at: Optional[int] = Body(None),
):
    """Sync favorites between client and server (for extension integration)."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    now = _now_ts()
    
    # Get server favorites
    cur = conn.execute(
        """
        SELECT news_id, title, url, source_id, source_name, published_at, created_at
        FROM user_favorites
        WHERE user_id = ?
        ORDER BY created_at DESC
        """,
        (user["id"],)
    )
    server_favorites = {row[0]: {
        "news_id": row[0],
        "title": row[1],
        "url": row[2],
        "source_id": row[3],
        "source_name": row[4],
        "published_at": row[5],
        "created_at": row[6],
    } for row in cur.fetchall() or []}
    
    # Merge client favorites (add new ones from client)
    added = []
    for cf in client_favorites:
        news_id = cf.get("news_id")
        if not news_id:
            continue
        
        if news_id not in server_favorites:
            # Add to server
            try:
                conn.execute(
                    """
                    INSERT INTO user_favorites (user_id, news_id, title, url, source_id, source_name, published_at, created_at, note)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user["id"],
                        news_id,
                        cf.get("title", "")[:500],
                        cf.get("url", "")[:2000],
                        cf.get("source_id"),
                        cf.get("source_name"),
                        cf.get("published_at"),
                        cf.get("created_at") or now,
                        cf.get("note"),
                    )
                )
                added.append(news_id)
            except Exception:
                pass  # Ignore duplicates
    
    if added:
        conn.commit()
    
    # Return merged list
    cur = conn.execute(
        """
        SELECT news_id, title, url, source_id, source_name, published_at, created_at
        FROM user_favorites
        WHERE user_id = ?
        ORDER BY created_at DESC
        """,
        (user["id"],)
    )
    merged = [{
        "news_id": row[0],
        "title": row[1],
        "url": row[2],
        "source_id": row[3],
        "source_name": row[4],
        "published_at": row[5],
        "created_at": row[6],
    } for row in cur.fetchall() or []]
    
    return {
        "ok": True,
        "merged": merged,
        "added_count": len(added),
        "sync_at": now,
    }


@router.post("/{news_id}/summary")
async def generate_favorite_summary(request: Request, news_id: str):
    """Generate AI summary for a favorited article."""
    import os
    from hotnews.kernel.services.article_summary import (
        check_rate_limit, record_request, fetch_article_content, generate_smart_summary
    )
    
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    # Check rate limit
    is_allowed, remaining = check_rate_limit(user["id"])
    if not is_allowed:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    
    # Get the favorite record
    cur = conn.execute(
        "SELECT id, url, summary, summary_at FROM user_favorites WHERE user_id = ? AND news_id = ?",
        (user["id"], news_id)
    )
    row = cur.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="收藏记录不存在")
    
    fav_id, url, existing_summary, summary_at = row
    
    # Return cached summary if exists
    if existing_summary:
        return {
            "ok": True,
            "summary": existing_summary,
            "cached": True,
            "summary_at": summary_at
        }
    
    if not url:
        raise HTTPException(status_code=400, detail="文章链接不存在")
    
    # Get API key from environment
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI 服务未配置")
    
    model = os.environ.get("DASHSCOPE_MODEL", "qwen-plus")
    
    # Fetch article content
    content, error, _method = await fetch_article_content(url)
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    # Generate smart summary (with classification)
    summary, error, article_type = await generate_smart_summary(content, api_key, model)
    
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    # Record the request for rate limiting
    record_request(user["id"])
    
    # Save to database
    now = _now_ts()
    conn.execute(
        "UPDATE user_favorites SET summary = ?, summary_at = ?, summary_model = ? WHERE id = ?",
        (summary, now, model, fav_id)
    )
    conn.commit()
    
    return {
        "ok": True,
        "summary": summary,
        "cached": False,
        "summary_at": now,
        "model": model,
        "article_type": article_type,
        "remaining": remaining - 1
    }


@router.delete("/{news_id}/summary")
async def delete_favorite_summary(request: Request, news_id: str):
    """Delete cached summary for a favorited article (allows regeneration)."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    conn.execute(
        "UPDATE user_favorites SET summary = NULL, summary_at = NULL, summary_model = NULL WHERE user_id = ? AND news_id = ?",
        (user["id"], news_id)
    )
    conn.commit()
    
    return {"ok": True, "news_id": news_id}
