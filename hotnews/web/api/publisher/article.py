# coding=utf-8
"""
Article API Routes

Provides public API endpoints for viewing published articles.
"""

from fastapi import APIRouter, Request, HTTPException

from .auth import _get_online_db_conn
from .db import get_published_article, increment_view_count

router = APIRouter(prefix="/api/publisher/article", tags=["publisher"])


@router.get("/{article_id}")
async def api_get_article(request: Request, article_id: str):
    """
    Get a published article (public access).
    
    This endpoint is for API access. For page rendering, use /article/{id} route.
    """
    conn = _get_online_db_conn(request)
    
    article = get_published_article(conn, article_id)
    if not article:
        raise HTTPException(404, "文章不存在或未发布")
    
    # Increment view count
    increment_view_count(conn, article_id)
    
    # Get author info from user database
    from .auth import _get_user_db_conn
    user_conn = _get_user_db_conn(request)
    cur = user_conn.execute(
        "SELECT nickname, avatar FROM users WHERE id = ?",
        (article["user_id"],)
    )
    row = cur.fetchone()
    
    author = {
        "id": article["user_id"],
        "nickname": row[0] if row else article.get("author_name", "未知用户"),
        "avatar": row[1] if row else "",
    }
    
    return {
        "ok": True,
        "data": {
            "id": article["id"],
            "title": article["title"],
            "digest": article["digest"],
            "cover_url": article["cover_url"],
            "html_content": article["html_content"],
            "author": author,
            "published_at": article["published_at"],
            "view_count": article["view_count"] + 1,  # Include current view
        }
    }
