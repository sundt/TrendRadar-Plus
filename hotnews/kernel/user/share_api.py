# coding=utf-8
"""
Share API - 分享总结内容

提供分享链接和分享页面功能
"""

import hashlib
import logging
import time
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Body
from fastapi.responses import HTMLResponse

router = APIRouter(prefix="/api/share", tags=["share"])


def _now_ts() -> int:
    return int(time.time())


def _generate_share_id(user_id: int, news_id: str) -> str:
    """Generate a unique share_id."""
    data = f"{user_id}-{news_id}-{_now_ts()}"
    return hashlib.md5(data.encode()).hexdigest()[:16]


def _get_online_db_conn(request: Request):
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _get_current_user(request: Request):
    """Get current authenticated user or raise 401."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    from hotnews.web.user_db import get_user_db_conn
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="请先登录")
    
    conn = get_user_db_conn(request.app.state.project_root)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="登录已过期")
    
    return user_info


def _ensure_share_table(conn):
    """Ensure the share table exists."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summary_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            share_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            summary TEXT NOT NULL,
            article_type TEXT,
            created_at INTEGER NOT NULL,
            view_count INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 1
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_share_id ON summary_shares(share_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_share_user ON summary_shares(user_id)")
    conn.commit()


@router.post("/create")
async def create_share(
    request: Request,
    title: str = Body(...),
    url: str = Body(...),
    summary: str = Body(...),
    article_type: Optional[str] = Body(None),
):
    """
    Create a shareable link for a summary.
    Returns a share_id that can be used to view the shared content.
    """
    user = _get_current_user(request)
    conn = _get_online_db_conn(request)
    
    _ensure_share_table(conn)
    
    # Generate unique share_id
    share_id = _generate_share_id(user["id"], url)
    now = _now_ts()
    
    try:
        conn.execute(
            """
            INSERT INTO summary_shares (share_id, user_id, title, url, summary, article_type, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(share_id) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                article_type = excluded.article_type
            """,
            (share_id, user["id"], title[:500], url[:2000], summary, article_type, now)
        )
        conn.commit()
    except Exception as e:
        logging.warning(f"Failed to create share: {e}")
        raise HTTPException(status_code=500, detail="创建分享失败")
    
    # Return share URL
    base_url = str(request.base_url).rstrip('/')
    share_url = f"{base_url}/share/{share_id}"
    
    return {
        "ok": True,
        "share_id": share_id,
        "share_url": share_url
    }


@router.get("/{share_id}")
async def get_share_data(request: Request, share_id: str):
    """Get share data by share_id (JSON API)."""
    conn = _get_online_db_conn(request)
    _ensure_share_table(conn)
    
    cur = conn.execute(
        "SELECT title, url, summary, article_type, created_at, view_count FROM summary_shares WHERE share_id = ? AND is_public = 1",
        (share_id,)
    )
    row = cur.fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="分享不存在或已删除")
    
    # Increment view count
    conn.execute("UPDATE summary_shares SET view_count = view_count + 1 WHERE share_id = ?", (share_id,))
    conn.commit()
    
    return {
        "ok": True,
        "title": row[0],
        "url": row[1],
        "summary": row[2],
        "article_type": row[3],
        "created_at": row[4],
        "view_count": row[5] + 1
    }
