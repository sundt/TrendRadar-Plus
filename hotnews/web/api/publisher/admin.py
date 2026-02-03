"""
User Articles Admin API

Admin endpoints for managing user-published articles.
"""

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

from hotnews.web.db_online import get_online_db_conn


router = APIRouter(prefix="/api/admin/user-articles", tags=["admin-user-articles"])
page_router = APIRouter(tags=["admin-user-articles-page"])


def _require_admin_auth(request: Request) -> bool:
    """
    Require admin authentication via session cookie or token.
    """
    from hotnews.kernel.admin.admin_auth import (
        is_password_auth_enabled,
        verify_admin_session,
        get_session_cookie_name,
        get_admin_token,
    )
    
    # 1. Password auth mode (secure)
    if is_password_auth_enabled():
        session_token = request.cookies.get(get_session_cookie_name(), "")
        if session_token:
            is_valid, error = verify_admin_session(session_token)
            if is_valid:
                return True
        raise HTTPException(status_code=403, detail="需要管理员权限")
    
    # 2. Token auth mode (legacy)
    token = get_admin_token()
    if not token:
        raise HTTPException(status_code=403, detail="Admin not configured")

    got = (request.headers.get("X-Admin-Token") or "").strip()
    if not got:
        got = (request.query_params.get("token") or "").strip()
    if got != token:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return True


class ArticleListResponse(BaseModel):
    ok: bool
    data: Dict[str, Any]


class ArticleActionResponse(BaseModel):
    ok: bool
    message: str


@router.get("", response_model=ArticleListResponse)
async def list_user_articles(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None, description="Filter by status: draft/published"),
    user_id: Optional[int] = Query(None, description="Filter by user ID"),
    search: Optional[str] = Query(None, description="Search in title"),
):
    """
    List all user articles with pagination and filters.
    Admin only.
    """
    _require_admin_auth(request)
    
    conn = get_online_db_conn()
    
    # Build query
    conditions = []
    params = []
    
    if status:
        conditions.append("ua.status = ?")
        params.append(status)
    
    if user_id:
        conditions.append("ua.user_id = ?")
        params.append(user_id)
    
    if search:
        conditions.append("ua.title LIKE ?")
        params.append(f"%{search}%")
    
    where_clause = " AND ".join(conditions) if conditions else "1=1"
    
    # Get total count
    count_sql = f"""
        SELECT COUNT(*) FROM user_articles ua
        WHERE {where_clause}
    """
    total = conn.execute(count_sql, params).fetchone()[0]
    
    # Get paginated results
    offset = (page - 1) * page_size
    query_sql = f"""
        SELECT 
            ua.id,
            ua.user_id,
            ua.title,
            ua.digest,
            ua.cover_url,
            ua.status,
            ua.view_count,
            ua.published_at,
            ua.created_at,
            ua.updated_at
        FROM user_articles ua
        WHERE {where_clause}
        ORDER BY ua.updated_at DESC
        LIMIT ? OFFSET ?
    """
    params.extend([page_size, offset])
    
    rows = conn.execute(query_sql, params).fetchall()
    
    # Get user info for each article
    items = []
    for row in rows:
        article = {
            "id": row[0],
            "user_id": row[1],
            "title": row[2],
            "digest": row[3],
            "cover_url": row[4],
            "status": row[5],
            "view_count": row[6],
            "published_at": row[7],
            "created_at": row[8],
            "updated_at": row[9],
            "author_name": None,
        }
        
        # Try to get author name from users table
        try:
            user_row = conn.execute(
                "SELECT nickname FROM users WHERE id = ?",
                (row[1],)
            ).fetchone()
            if user_row:
                article["author_name"] = user_row[0]
        except Exception:
            pass
        
        items.append(article)
    
    return {
        "ok": True,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "total_pages": (total + page_size - 1) // page_size,
        }
    }


@router.get("/{article_id}")
async def get_user_article(request: Request, article_id: str):
    """
    Get a single user article by ID.
    Admin only.
    """
    _require_admin_auth(request)
    
    conn = get_online_db_conn()
    
    row = conn.execute("""
        SELECT 
            id, user_id, source_id, title, digest, cover_url,
            html_content, markdown_content, import_type, import_source_id,
            import_source_url, status, version, view_count, published_at,
            created_at, updated_at
        FROM user_articles
        WHERE id = ?
    """, (article_id,)).fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="文章不存在")
    
    article = {
        "id": row[0],
        "user_id": row[1],
        "source_id": row[2],
        "title": row[3],
        "digest": row[4],
        "cover_url": row[5],
        "html_content": row[6],
        "markdown_content": row[7],
        "import_type": row[8],
        "import_source_id": row[9],
        "import_source_url": row[10],
        "status": row[11],
        "version": row[12],
        "view_count": row[13],
        "published_at": row[14],
        "created_at": row[15],
        "updated_at": row[16],
        "author_name": None,
    }
    
    # Get author name
    try:
        user_row = conn.execute(
            "SELECT nickname FROM users WHERE id = ?",
            (row[1],)
        ).fetchone()
        if user_row:
            article["author_name"] = user_row[0]
    except Exception:
        pass
    
    return {"ok": True, "data": article}


@router.post("/{article_id}/unpublish", response_model=ArticleActionResponse)
async def unpublish_user_article(request: Request, article_id: str):
    """
    Unpublish a user article (admin action).
    This will:
    1. Set article status to 'draft'
    2. Remove from rss_entries
    """
    _require_admin_auth(request)
    
    conn = get_online_db_conn()
    
    # Check article exists
    row = conn.execute(
        "SELECT user_id, status, source_id FROM user_articles WHERE id = ?",
        (article_id,)
    ).fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="文章不存在")
    
    user_id, status, source_id = row
    
    if status != "published":
        return {"ok": True, "message": "文章未发布，无需下架"}
    
    now = int(time.time())
    
    # Update article status
    conn.execute("""
        UPDATE user_articles
        SET status = 'draft', published_at = NULL, updated_at = ?
        WHERE id = ?
    """, (now, article_id))
    
    # Remove from rss_entries
    conn.execute("""
        DELETE FROM rss_entries
        WHERE source_id = ? AND dedup_key = ?
    """, (source_id, article_id))
    
    conn.commit()
    
    return {"ok": True, "message": "文章已下架"}


@router.delete("/{article_id}", response_model=ArticleActionResponse)
async def delete_user_article(request: Request, article_id: str):
    """
    Delete a user article (admin action).
    This will:
    1. Remove from rss_entries if published
    2. Delete the article record
    """
    _require_admin_auth(request)
    
    conn = get_online_db_conn()
    
    # Check article exists
    row = conn.execute(
        "SELECT user_id, status, source_id FROM user_articles WHERE id = ?",
        (article_id,)
    ).fetchone()
    
    if not row:
        raise HTTPException(status_code=404, detail="文章不存在")
    
    user_id, status, source_id = row
    
    # Remove from rss_entries if published
    if status == "published":
        conn.execute("""
            DELETE FROM rss_entries
            WHERE source_id = ? AND dedup_key = ?
        """, (source_id, article_id))
    
    # Delete article
    conn.execute("DELETE FROM user_articles WHERE id = ?", (article_id,))
    
    conn.commit()
    
    return {"ok": True, "message": "文章已删除"}


@router.get("/stats/summary")
async def get_articles_stats(request: Request):
    """
    Get summary statistics for user articles.
    Admin only.
    """
    _require_admin_auth(request)
    
    conn = get_online_db_conn()
    
    # Total articles
    total = conn.execute("SELECT COUNT(*) FROM user_articles").fetchone()[0]
    
    # Published articles
    published = conn.execute(
        "SELECT COUNT(*) FROM user_articles WHERE status = 'published'"
    ).fetchone()[0]
    
    # Draft articles
    drafts = conn.execute(
        "SELECT COUNT(*) FROM user_articles WHERE status = 'draft'"
    ).fetchone()[0]
    
    # Total views
    total_views = conn.execute(
        "SELECT COALESCE(SUM(view_count), 0) FROM user_articles"
    ).fetchone()[0]
    
    # Unique authors
    unique_authors = conn.execute(
        "SELECT COUNT(DISTINCT user_id) FROM user_articles"
    ).fetchone()[0]
    
    # Recent articles (last 7 days)
    week_ago = int(time.time()) - 7 * 24 * 3600
    recent = conn.execute(
        "SELECT COUNT(*) FROM user_articles WHERE created_at > ?",
        (week_ago,)
    ).fetchone()[0]
    
    return {
        "ok": True,
        "data": {
            "total": total,
            "published": published,
            "drafts": drafts,
            "total_views": total_views,
            "unique_authors": unique_authors,
            "recent_7d": recent,
        }
    }



# ========== Admin Page Route ==========

@page_router.get("/admin/user-articles", response_class=HTMLResponse)
async def admin_user_articles_page(request: Request):
    """Admin page for managing user articles."""
    from hotnews.kernel.admin.admin_auth import (
        is_password_auth_enabled,
        verify_admin_session,
        get_session_cookie_name,
        get_admin_token,
    )
    
    # Check authentication
    token = ""
    
    if is_password_auth_enabled():
        session_token = request.cookies.get(get_session_cookie_name(), "")
        if session_token:
            is_valid, error = verify_admin_session(session_token)
            if not is_valid:
                from fastapi.responses import RedirectResponse
                return RedirectResponse(url="/admin/login", status_code=302)
        else:
            from fastapi.responses import RedirectResponse
            return RedirectResponse(url="/admin/login", status_code=302)
    else:
        # Token auth mode
        token = get_admin_token() or ""
        got = (request.headers.get("X-Admin-Token") or "").strip()
        if not got:
            got = (request.query_params.get("token") or "").strip()
        if got != token:
            raise HTTPException(status_code=403, detail="需要管理员权限")
    
    # Render template
    import os
    from jinja2 import Environment, FileSystemLoader
    
    template_dir = os.path.join(os.path.dirname(__file__), "../../../kernel/templates")
    env = Environment(loader=FileSystemLoader(template_dir))
    template = env.get_template("admin_user_articles.html")
    
    return HTMLResponse(content=template.render(token=token))
