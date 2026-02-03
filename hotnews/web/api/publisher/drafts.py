# coding=utf-8
"""
Draft/Article API Routes

Provides REST API endpoints for user article CRUD and publishing.
"""

from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Query
from pydantic import BaseModel

from .auth import require_member, _get_online_db_conn
from .db import (
    ensure_user_source, create_article, get_article, list_articles, 
    update_article, delete_article, publish_article, unpublish_article,
    TITLE_MAX_LENGTH, DIGEST_MAX_LENGTH, CONTENT_MAX_LENGTH,
)
from .sanitize import sanitize_html

router = APIRouter(prefix="/api/publisher/drafts", tags=["publisher"])


# ==================== Request/Response Models ====================

class DraftCreate(BaseModel):
    title: str = ""
    digest: str = ""
    cover_url: str = ""
    html_content: str = ""
    markdown_content: str = ""
    import_type: str = "manual"
    import_source_id: str = ""
    import_source_url: str = ""


class DraftUpdate(BaseModel):
    title: Optional[str] = None
    digest: Optional[str] = None
    cover_url: Optional[str] = None
    html_content: Optional[str] = None
    markdown_content: Optional[str] = None
    status: Optional[str] = None
    expected_version: Optional[int] = None


# ==================== Validation ====================

def validate_draft_data(
    title: str = "",
    digest: str = "",
    html_content: str = "",
) -> None:
    """Validate draft data."""
    if title and len(title) > TITLE_MAX_LENGTH:
        raise HTTPException(400, f"标题不能超过 {TITLE_MAX_LENGTH} 字")
    
    if digest and len(digest) > DIGEST_MAX_LENGTH:
        raise HTTPException(400, f"摘要不能超过 {DIGEST_MAX_LENGTH} 字")
    
    if html_content and len(html_content) > CONTENT_MAX_LENGTH:
        raise HTTPException(400, "内容过长")


# ==================== API Endpoints ====================

@router.post("")
async def api_create_draft(request: Request, data: DraftCreate):
    """Create a new draft."""
    user = await require_member(request)
    
    # Validate
    validate_draft_data(data.title, data.digest, data.html_content)
    
    # Sanitize HTML
    html_content = sanitize_html(data.html_content)
    
    conn = _get_online_db_conn(request)
    
    # Ensure user source exists
    source_id = ensure_user_source(conn, user["id"], user.get("nickname", f"用户{user['id']}"))
    
    article = create_article(
        conn,
        user_id=user["id"],
        source_id=source_id,
        title=data.title,
        digest=data.digest,
        cover_url=data.cover_url,
        html_content=html_content,
        markdown_content=data.markdown_content,
        import_type=data.import_type,
        import_source_id=data.import_source_id,
        import_source_url=data.import_source_url,
    )
    
    return {"ok": True, "data": article}


@router.get("")
async def api_list_drafts(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(""),
):
    """List drafts for current user."""
    user = await require_member(request)
    conn = _get_online_db_conn(request)
    
    items, total = list_articles(
        conn,
        user_id=user["id"],
        status=status,
        page=page,
        page_size=page_size,
    )
    
    return {
        "ok": True,
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
        }
    }


@router.get("/{draft_id}")
async def api_get_draft(request: Request, draft_id: str):
    """Get a single draft."""
    user = await require_member(request)
    conn = _get_online_db_conn(request)
    
    article = get_article(conn, draft_id)
    if not article:
        raise HTTPException(404, "草稿不存在")
    
    if article["user_id"] != user["id"]:
        raise HTTPException(403, "无权访问此草稿")
    
    return {"ok": True, "data": article}


@router.put("/{draft_id}")
async def api_update_draft(request: Request, draft_id: str, data: DraftUpdate):
    """Update a draft."""
    user = await require_member(request)
    
    # Validate
    validate_draft_data(
        data.title or "",
        data.digest or "",
        data.html_content or "",
    )
    
    # Sanitize HTML if provided
    html_content = sanitize_html(data.html_content) if data.html_content else None
    
    conn = _get_online_db_conn(request)
    
    try:
        article = update_article(
            conn,
            article_id=draft_id,
            user_id=user["id"],
            expected_version=data.expected_version,
            title=data.title,
            digest=data.digest,
            cover_url=data.cover_url,
            html_content=html_content,
            markdown_content=data.markdown_content,
            status=data.status,
        )
        return {"ok": True, "data": article}
    except ValueError as e:
        raise HTTPException(400, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@router.delete("/{draft_id}")
async def api_delete_draft(request: Request, draft_id: str):
    """Delete a draft."""
    user = await require_member(request)
    conn = _get_online_db_conn(request)
    
    try:
        delete_article(conn, draft_id, user["id"])
        return {"ok": True, "message": "草稿已删除"}
    except ValueError as e:
        raise HTTPException(404, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@router.post("/{draft_id}/publish")
async def api_publish_draft(request: Request, draft_id: str):
    """Publish a draft to explore (精选博客)."""
    user = await require_member(request)
    conn = _get_online_db_conn(request)
    
    try:
        result = publish_article(conn, draft_id, user["id"])
        return {
            "ok": True,
            "data": {
                "draft": result,
                "article_url": result.get("article_url"),
            }
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))


@router.post("/{draft_id}/unpublish")
async def api_unpublish_draft(request: Request, draft_id: str):
    """Unpublish a draft (remove from explore)."""
    user = await require_member(request)
    conn = _get_online_db_conn(request)
    
    try:
        result = unpublish_article(conn, draft_id, user["id"])
        return {
            "ok": True,
            "data": result,
            "message": "文章已下架"
        }
    except ValueError as e:
        raise HTTPException(400, str(e))
    except PermissionError as e:
        raise HTTPException(403, str(e))
