"""
Featured WeChat MPs (精选公众号) Admin API

Provides REST API endpoints for:
- Admin management of featured official accounts
- Batch import via CSV
- Public API for frontend display
"""

import asyncio
import csv
import io
import json
import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import StreamingResponse, HTMLResponse
from pydantic import BaseModel

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api", tags=["featured-mps"])

# ========== Cache ==========
# In-memory cache for featured MPs data
_featured_mps_cache = {
    "data": None,
    "timestamp": 0,
    "ttl": 300  # 5 minutes
}

# Preview cache for batch import (10 minutes TTL)
_import_preview_cache: Dict[str, Dict] = {}


# ========== Request/Response Models ==========

class FeaturedMPAddRequest(BaseModel):
    """Request to add a featured MP."""
    fakeid: str
    nickname: str
    round_head_img: Optional[str] = ""
    signature: Optional[str] = ""
    category: Optional[str] = "general"
    sort_order: Optional[int] = 0


class FeaturedMPUpdateRequest(BaseModel):
    """Request to update a featured MP."""
    category: Optional[str] = None
    sort_order: Optional[int] = None
    enabled: Optional[int] = None
    article_count: Optional[int] = None


class ReorderRequest(BaseModel):
    """Request to reorder featured MPs."""
    orders: List[Dict[str, Any]]  # [{"fakeid": "xxx", "sort_order": 0}, ...]


class ImportPreviewRequest(BaseModel):
    """Request for batch import preview."""
    csv_text: Optional[str] = None


class ImportConfirmRequest(BaseModel):
    """Request to confirm batch import."""
    preview_id: str
    selected_lines: Optional[List[int]] = None
    skip_exists: Optional[bool] = True


# ========== Helper Functions ==========

def _now_ts() -> int:
    return int(time.time())


def _get_online_db_conn(request: Request):
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _get_user_db_conn(request: Request):
    """Get user database connection."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


from hotnews.kernel.auth.deps import get_optional_user as _get_current_user


def _require_admin_auth(request: Request) -> bool:
    """
    Require admin authentication via session cookie or token.
    Same logic as rss_admin.py for consistency.
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
        # Password auth is enabled but session is invalid
        raise HTTPException(status_code=403, detail="需要管理员权限")
    
    # 2. Token auth mode (legacy, only when password is not set)
    token = get_admin_token()
    if not token:
        raise HTTPException(status_code=403, detail="Admin not configured")

    got = (request.headers.get("X-Admin-Token") or "").strip()
    if not got:
        got = (request.query_params.get("token") or "").strip()
    if got != token:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return True


def _require_admin(request: Request) -> Dict[str, Any]:
    """Require admin user, raise 401/403 if not authorized."""
    # Use admin auth (password or token) instead of user auth
    _require_admin_auth(request)
    return {"is_admin": True}


def _invalidate_cache():
    """Invalidate the featured MPs cache."""
    global _featured_mps_cache
    _featured_mps_cache["data"] = None
    _featured_mps_cache["timestamp"] = 0
    logger.info("[FeaturedMPs] Cache invalidated")


def _cleanup_expired_previews():
    """Clean up expired import previews."""
    now = _now_ts()
    expired = [k for k, v in _import_preview_cache.items() if v.get("expires_at", 0) < now]
    for k in expired:
        del _import_preview_cache[k]


# ========== Admin API Endpoints ==========

@router.get("/admin/featured-mps")
async def list_featured_mps(
    request: Request,
    category: Optional[str] = Query(None, description="Filter by category"),
    enabled: Optional[str] = Query(None, description="Filter by status: all/enabled/disabled"),
) -> Dict[str, Any]:
    """Get list of featured MPs (admin)."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    # Build query
    query = "SELECT * FROM featured_wechat_mps WHERE 1=1"
    params = []
    
    if category:
        query += " AND category = ?"
        params.append(category)
    
    if enabled == "enabled":
        query += " AND enabled = 1"
    elif enabled == "disabled":
        query += " AND enabled = 0"
    
    query += " ORDER BY sort_order ASC, created_at DESC"
    
    cur = conn.execute(query, params)
    rows = cur.fetchall() or []
    
    # Get column names
    columns = [desc[0] for desc in cur.description]
    
    mps = []
    for row in rows:
        mp = dict(zip(columns, row))
        mps.append(mp)
    
    return {
        "ok": True,
        "list": mps,
        "total": len(mps)
    }


@router.post("/admin/featured-mps")
async def add_featured_mp(request: Request, body: FeaturedMPAddRequest) -> Dict[str, Any]:
    """Add a featured MP."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    fakeid = (body.fakeid or "").strip()
    nickname = (body.nickname or "").strip()
    
    if not fakeid or not nickname:
        raise HTTPException(status_code=400, detail="fakeid 和 nickname 不能为空")
    
    # Check if already exists
    cur = conn.execute("SELECT id FROM featured_wechat_mps WHERE fakeid = ?", (fakeid,))
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="该公众号已在精选列表中")
    
    now = _now_ts()
    
    try:
        conn.execute(
            """
            INSERT INTO featured_wechat_mps 
            (fakeid, nickname, round_head_img, signature, category, sort_order, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (fakeid, nickname, body.round_head_img or "", body.signature or "",
             body.category or "general", body.sort_order or 0, now, now)
        )
        
        # Create scheduler record for the new MP (so it gets fetched immediately)
        from hotnews.kernel.services.wechat_smart_scheduler import update_mp_stats
        update_mp_stats(conn, fakeid, nickname=nickname, has_new_articles=False, error_message="")
        
        conn.commit()
        _invalidate_cache()
        
        return {"ok": True, "message": "添加成功"}
    except Exception as e:
        logger.error(f"Failed to add featured MP: {e}")
        raise HTTPException(status_code=500, detail="添加失败")


@router.put("/admin/featured-mps/{fakeid}")
async def update_featured_mp(request: Request, fakeid: str, body: FeaturedMPUpdateRequest) -> Dict[str, Any]:
    """Update a featured MP."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    # Check if exists
    cur = conn.execute("SELECT id FROM featured_wechat_mps WHERE fakeid = ?", (fakeid,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="公众号不存在")
    
    # Build update query
    updates = []
    params = []
    
    if body.category is not None:
        updates.append("category = ?")
        params.append(body.category)
    
    if body.sort_order is not None:
        updates.append("sort_order = ?")
        params.append(body.sort_order)
    
    if body.enabled is not None:
        updates.append("enabled = ?")
        params.append(body.enabled)
    
    if body.article_count is not None:
        updates.append("article_count = ?")
        params.append(body.article_count)
    
    if not updates:
        return {"ok": True, "message": "无更新"}
    
    updates.append("updated_at = ?")
    params.append(_now_ts())
    params.append(fakeid)
    
    try:
        conn.execute(
            f"UPDATE featured_wechat_mps SET {', '.join(updates)} WHERE fakeid = ?",
            params
        )
        conn.commit()
        _invalidate_cache()
        
        return {"ok": True, "message": "更新成功"}
    except Exception as e:
        logger.error(f"Failed to update featured MP: {e}")
        raise HTTPException(status_code=500, detail="更新失败")


@router.delete("/admin/featured-mps/{fakeid}")
async def delete_featured_mp(request: Request, fakeid: str) -> Dict[str, Any]:
    """Delete a featured MP."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    try:
        cur = conn.execute("DELETE FROM featured_wechat_mps WHERE fakeid = ?", (fakeid,))
        conn.commit()
        
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="公众号不存在")
        
        _invalidate_cache()
        return {"ok": True, "message": "删除成功"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete featured MP: {e}")
        raise HTTPException(status_code=500, detail="删除失败")


class BatchDeleteRequest(BaseModel):
    fakeids: List[str]


@router.post("/admin/featured-mps/batch-delete")
async def batch_delete_featured_mps(request: Request, body: BatchDeleteRequest) -> Dict[str, Any]:
    """Batch delete featured MPs."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    if not body.fakeids:
        raise HTTPException(status_code=400, detail="请选择要删除的公众号")
    
    try:
        deleted = 0
        for fakeid in body.fakeids:
            cur = conn.execute("DELETE FROM featured_wechat_mps WHERE fakeid = ?", (fakeid,))
            deleted += cur.rowcount
        conn.commit()
        
        if deleted > 0:
            _invalidate_cache()
        
        return {"ok": True, "deleted": deleted, "message": f"成功删除 {deleted} 个公众号"}
    except Exception as e:
        logger.error(f"Failed to batch delete featured MPs: {e}")
        raise HTTPException(status_code=500, detail="批量删除失败")


@router.post("/admin/featured-mps/reorder")
async def reorder_featured_mps(request: Request, body: ReorderRequest) -> Dict[str, Any]:
    """Batch update sort order."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    if not body.orders:
        return {"ok": True, "message": "无更新"}
    
    now = _now_ts()
    
    try:
        for item in body.orders:
            fakeid = item.get("fakeid")
            sort_order = item.get("sort_order")
            if fakeid is not None and sort_order is not None:
                conn.execute(
                    "UPDATE featured_wechat_mps SET sort_order = ?, updated_at = ? WHERE fakeid = ?",
                    (sort_order, now, fakeid)
                )
        conn.commit()
        _invalidate_cache()
        
        return {"ok": True, "message": "排序更新成功"}
    except Exception as e:
        logger.error(f"Failed to reorder featured MPs: {e}")
        raise HTTPException(status_code=500, detail="排序更新失败")


@router.get("/admin/featured-mps/search")
async def search_mp_for_admin(
    request: Request,
    keyword: str = Query(..., min_length=1, description="搜索关键词"),
    limit: int = Query(10, ge=1, le=20, description="返回数量"),
) -> Dict[str, Any]:
    """Search for official accounts (admin)."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    # Get shared credentials
    from hotnews.kernel.services.wechat_shared_credentials import get_available_credential
    
    cred = get_available_credential()
    if not cred:
        raise HTTPException(status_code=503, detail="无可用的微信凭证，请先配置共享凭证")
    
    # Search using shared credentials
    from hotnews.kernel.providers.wechat_provider import WeChatMPProvider
    
    provider = WeChatMPProvider(cred.cookie, cred.token)
    result = provider.search_mp(keyword, limit=limit)
    
    if not result.ok:
        return {
            "ok": False,
            "error": result.error_message,
            "list": []
        }
    
    # Get existing featured MPs to mark them
    cur = conn.execute("SELECT fakeid FROM featured_wechat_mps")
    featured_fakeids = {str(r[0]) for r in cur.fetchall()}
    
    accounts = []
    for acc in result.accounts:
        accounts.append({
            "fakeid": acc.fakeid,
            "nickname": acc.nickname,
            "round_head_img": acc.round_head_img,
            "signature": acc.signature,
            "is_featured": acc.fakeid in featured_fakeids,
        })
    
    return {
        "ok": True,
        "list": accounts,
        "total": result.total
    }



# ========== Batch Import API ==========

def _parse_csv_content(content: str) -> List[Dict[str, str]]:
    """Parse CSV content and return list of {name, category}."""
    lines = []
    reader = csv.reader(io.StringIO(content))
    
    has_header = False
    name_col = 0
    category_col = 1
    
    for i, row in enumerate(reader):
        if not row or not row[0].strip():
            continue
        
        # Check if first row is header
        if i == 0:
            first_cell = row[0].strip().lower()
            if first_cell in ["公众号名称", "名称", "name", "公众号"]:
                has_header = True
                # Find column indices
                for j, cell in enumerate(row):
                    cell_lower = cell.strip().lower()
                    if cell_lower in ["公众号名称", "名称", "name", "公众号"]:
                        name_col = j
                    elif cell_lower in ["分类", "category", "类别"]:
                        category_col = j
                continue
        
        name = row[name_col].strip() if len(row) > name_col else ""
        category = row[category_col].strip() if len(row) > category_col else "general"
        
        if name:
            lines.append({"name": name, "category": category or "general"})
    
    return lines


@router.post("/admin/featured-mps/import/preview")
async def import_preview(
    request: Request,
) -> StreamingResponse:
    """Preview batch import (search and match MPs) with streaming progress."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    _cleanup_expired_previews()
    
    # Get CSV content from JSON body
    csv_content = ""
    try:
        body = await request.json()
        csv_content = body.get("csv_text", "").strip()
    except Exception:
        csv_content = ""
    
    if not csv_content:
        raise HTTPException(status_code=400, detail="请提供 CSV 文件或文本内容")
    
    # Parse CSV
    lines = _parse_csv_content(csv_content)
    if not lines:
        raise HTTPException(status_code=400, detail="CSV 内容为空或格式错误")
    
    async def generate():
        # Get existing featured MPs
        cur = conn.execute("SELECT fakeid, nickname FROM featured_wechat_mps")
        existing = {str(r[1]): str(r[0]) for r in cur.fetchall()}
        existing_fakeids = set(existing.values())
        
        # Get existing source names from all tables (RSS, custom, newsnow)
        existing_source_names = set()
        try:
            # RSS sources
            cur = conn.execute("SELECT name FROM rss_sources WHERE enabled = 1")
            for row in cur.fetchall():
                existing_source_names.add(row[0].strip().lower())
            
            # Custom sources
            cur = conn.execute("SELECT name FROM custom_sources WHERE enabled = 1")
            for row in cur.fetchall():
                existing_source_names.add(row[0].strip().lower())
        except Exception as e:
            logger.warning(f"Failed to load existing source names: {e}")
        
        # Get shared credentials
        from hotnews.kernel.services.wechat_shared_credentials import get_available_credential
        from hotnews.kernel.providers.wechat_provider import WeChatMPProvider
        
        cred = get_available_credential()
        if not cred:
            yield f"data: {json.dumps({'type': 'error', 'message': '无可用的微信凭证'})}\n\n"
            return
        
        provider = WeChatMPProvider(cred.cookie, cred.token)
        
        total = len(lines)
        items = []
        seen_names = {}
        
        # Send total count first
        yield f"data: {json.dumps({'type': 'start', 'total': total})}\n\n"
        
        for i, line in enumerate(lines):
            line_num = i + 1
            name = line["name"]
            category = line["category"]
            
            # Send progress
            yield f"data: {json.dumps({'type': 'progress', 'current': line_num, 'total': total, 'name': name})}\n\n"
            
            item = {
                "line": line_num,
                "input_name": name,
                "input_category": category,
                "status": "pending",
                "matched": None,
                "error": None
            }
            
            # Check for duplicates
            if name in seen_names:
                item["status"] = "duplicate"
                item["error"] = f"与第{seen_names[name]}行重复"
                items.append(item)
                continue
            seen_names[name] = line_num
            
            # Check if already exists in featured MPs
            if name in existing:
                item["status"] = "exists"
                item["error"] = "已在精选列表中"
                items.append(item)
                continue
            
            # Check if name conflicts with existing sources (RSS/custom/newsnow)
            if name.strip().lower() in existing_source_names:
                item["status"] = "conflict"
                item["error"] = "与现有RSS/自定义/热榜源同名"
                items.append(item)
                continue
            
            # Search for this MP
            try:
                if i > 0:
                    await asyncio.sleep(3)
                
                result = provider.search_mp(name, limit=5)
                
                if not result.ok:
                    item["status"] = "error"
                    item["error"] = result.error_message or "搜索失败"
                    items.append(item)
                    continue
                
                # Find match
                matched = None
                for acc in result.accounts:
                    if acc.nickname == name:
                        matched = acc
                        break
                
                if not matched and result.accounts:
                    first = result.accounts[0]
                    if name in first.nickname or first.nickname in name:
                        matched = first
                
                if matched:
                    if matched.fakeid in existing_fakeids:
                        item["status"] = "exists"
                        item["error"] = "已在精选列表中（不同名称）"
                    else:
                        item["status"] = "found"
                        item["matched"] = {
                            "fakeid": matched.fakeid,
                            "nickname": matched.nickname,
                            "round_head_img": matched.round_head_img,
                            "signature": matched.signature
                        }
                else:
                    item["status"] = "not_found"
                    item["error"] = "未找到匹配的公众号"
            
            except Exception as e:
                logger.error(f"Search failed for '{name}': {e}")
                item["status"] = "error"
                item["error"] = str(e)
            
            items.append(item)
        
        # Generate preview ID and cache
        preview_id = f"prev_{uuid.uuid4().hex[:12]}"
        _import_preview_cache[preview_id] = {
            "items": items,
            "created_at": _now_ts(),
            "expires_at": _now_ts() + 600
        }
        
        valid = sum(1 for it in items if it["status"] == "found")
        invalid = len(items) - valid
        
        # Send final result
        yield f"data: {json.dumps({'type': 'done', 'ok': True, 'preview_id': preview_id, 'total': len(items), 'valid': valid, 'invalid': invalid, 'items': items})}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.post("/admin/featured-mps/import/confirm")
async def import_confirm(request: Request, body: ImportConfirmRequest) -> Dict[str, Any]:
    """Confirm and execute batch import."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    preview_id = body.preview_id
    if preview_id not in _import_preview_cache:
        raise HTTPException(status_code=400, detail="预览已过期，请重新上传")
    
    preview = _import_preview_cache[preview_id]
    if preview.get("expires_at", 0) < _now_ts():
        del _import_preview_cache[preview_id]
        raise HTTPException(status_code=400, detail="预览已过期，请重新上传")
    
    items = preview.get("items", [])
    selected_lines = set(body.selected_lines) if body.selected_lines else None
    skip_exists = body.skip_exists if body.skip_exists is not None else True
    
    now = _now_ts()
    imported = 0
    skipped = 0
    failed = 0
    details = []
    
    for item in items:
        line = item["line"]
        
        # Skip if not selected
        if selected_lines is not None and line not in selected_lines:
            continue
        
        # Skip non-found items
        if item["status"] != "found":
            if item["status"] == "exists" and skip_exists:
                skipped += 1
                details.append({
                    "line": line,
                    "nickname": item["input_name"],
                    "status": "skipped",
                    "reason": "已存在"
                })
            continue
        
        matched = item.get("matched")
        if not matched:
            continue
        
        try:
            conn.execute(
                """
                INSERT INTO featured_wechat_mps 
                (fakeid, nickname, round_head_img, signature, category, sort_order, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    matched["fakeid"],
                    matched["nickname"],
                    matched.get("round_head_img", ""),
                    matched.get("signature", ""),
                    item["input_category"],
                    0,
                    now,
                    now
                )
            )
            imported += 1
            details.append({
                "line": line,
                "nickname": matched["nickname"],
                "status": "imported"
            })
        except Exception as e:
            logger.error(f"Failed to import '{matched['nickname']}': {e}")
            failed += 1
            details.append({
                "line": line,
                "nickname": matched["nickname"],
                "status": "failed",
                "reason": str(e)
            })
    
    conn.commit()
    
    # Clean up preview cache
    del _import_preview_cache[preview_id]
    
    if imported > 0:
        _invalidate_cache()
    
    return {
        "ok": True,
        "imported": imported,
        "skipped": skipped,
        "failed": failed,
        "details": details
    }


@router.get("/admin/featured-mps/import/template")
async def download_import_template(request: Request):
    """Download CSV import template."""
    _require_admin(request)
    
    template = """公众号名称,分类,备注
36氪,tech,示例：科技媒体
虎嗅,tech,示例：商业科技
第一财经,finance,示例：财经新闻
"""
    
    return StreamingResponse(
        io.BytesIO(template.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=featured_mps_template.csv"}
    )


@router.get("/admin/featured-mps/export")
async def export_featured_mps(
    request: Request,
    category: Optional[str] = Query(None),
    enabled: Optional[str] = Query(None),
):
    """Export featured MPs to CSV."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    # Build query
    query = "SELECT nickname, fakeid, category, enabled, sort_order, created_at FROM featured_wechat_mps WHERE 1=1"
    params = []
    
    if category:
        query += " AND category = ?"
        params.append(category)
    
    if enabled == "enabled":
        query += " AND enabled = 1"
    elif enabled == "disabled":
        query += " AND enabled = 0"
    
    query += " ORDER BY sort_order ASC"
    
    cur = conn.execute(query, params)
    rows = cur.fetchall() or []
    
    # Generate CSV
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["公众号名称", "fakeid", "分类", "状态", "排序", "添加时间"])
    
    for row in rows:
        nickname, fakeid, cat, en, sort_order, created_at = row
        status = "启用" if en else "禁用"
        created_str = time.strftime("%Y-%m-%d", time.localtime(created_at)) if created_at else ""
        writer.writerow([nickname, fakeid, cat, status, sort_order, created_str])
    
    csv_content = output.getvalue()
    
    return StreamingResponse(
        io.BytesIO(csv_content.encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=featured_mps_export.csv"}
    )


# ========== Public API (Frontend Display) ==========

@router.get("/featured-mps")
async def get_featured_mps_public(
    request: Request,
    category: Optional[str] = Query(None),
    article_limit: int = Query(50, ge=1, le=100),
    limit: int = Query(0, ge=0, le=200),
    offset: int = Query(0, ge=0),
) -> Dict[str, Any]:
    """
    Get featured MPs with their latest articles (public API).
    
    This endpoint is used by the frontend to display the "精选公众号" category.
    Implements caching for performance.
    
    When limit > 0, returns a paginated slice of MPs (for infinite scroll).
    When limit = 0 (default), returns all MPs (backward compatible).
    """
    global _featured_mps_cache
    
    conn = _get_online_db_conn(request)
    now = _now_ts()
    
    # Check cache (only for default params)
    is_default = not category and article_limit == 50 and limit == 0 and offset == 0
    if is_default:
        if (_featured_mps_cache["data"] is not None and 
            now - _featured_mps_cache["timestamp"] < _featured_mps_cache["ttl"]):
            return {
                "ok": True,
                "mps": _featured_mps_cache["data"],
                "total": len(_featured_mps_cache["data"]),
                "cached": True,
                "cache_age": now - _featured_mps_cache["timestamp"]
            }
    
    # Query featured MPs (only admin-added ones)
    query = """
        SELECT fakeid, nickname, round_head_img, signature, category
        FROM featured_wechat_mps
        WHERE enabled = 1 AND (source IS NULL OR source = 'admin')
    """
    params = []
    
    if category:
        query += " AND category = ?"
        params.append(category)
    
    query += " ORDER BY sort_order ASC"
    
    cur = conn.execute(query, params)
    mp_rows = cur.fetchall() or []
    total_mps = len(mp_rows)
    
    # Apply pagination if limit > 0
    if limit > 0:
        mp_rows = mp_rows[offset:offset + limit]
    
    # 使用统一读取模块
    from hotnews.kernel.services.mp_article_reader import get_mp_articles
    
    mps = []
    for row in mp_rows:
        fakeid, nickname, avatar, signature, cat = row
        
        # Get latest articles for this MP using unified reader
        articles = get_mp_articles(conn, fakeid, limit=article_limit)
        
        mps.append({
            "fakeid": fakeid,
            "nickname": nickname,
            "round_head_img": avatar or "",
            "signature": signature or "",
            "category": cat,
            "articles": articles
        })
    
    # Update cache (only for default params — full list)
    if is_default:
        _featured_mps_cache["data"] = mps
        _featured_mps_cache["timestamp"] = now
    
    return {
        "ok": True,
        "mps": mps,
        "total": total_mps,
        "offset": offset,
        "cached": False
    }


# ========== Manual Fetch API ==========

@router.get("/admin/mp-scheduler/status")
async def get_mp_scheduler_status(request: Request) -> Dict[str, Any]:
    """
    Get unified MP scheduler status.
    
    Returns:
        - Total MP count (featured + subscription, deduplicated)
        - Credential pool status
        - Scheduler statistics
    """
    _require_admin(request)
    online_conn = _get_online_db_conn(request)
    user_conn = _get_user_db_conn(request)
    
    from hotnews.kernel.services.mp_unified_list import get_unified_mp_count
    from hotnews.kernel.services.mp_credential_pool import get_credential_pool
    from hotnews.kernel.services.wechat_smart_scheduler import get_scheduler_stats
    from hotnews.kernel.scheduler.wechat_scheduler import (
        _is_scheduler_enabled,
        _is_unified_scheduler_enabled,
        _wechat_scheduler_running,
    )
    
    # Get MP count statistics
    mp_counts = get_unified_mp_count(online_conn, user_conn)
    
    # Get credential pool status
    credential_pool = get_credential_pool()
    credential_pool.load_credentials(online_conn, user_conn)
    pool_stats = credential_pool.get_stats()
    
    # Get scheduler statistics
    scheduler_stats = get_scheduler_stats(online_conn, user_conn)
    
    return {
        "ok": True,
        "scheduler": {
            "running": _wechat_scheduler_running,
            "enabled": _is_scheduler_enabled(),
            "unified_enabled": _is_unified_scheduler_enabled(),
        },
        "mps": mp_counts,
        "credentials": pool_stats,
        "stats": scheduler_stats,
    }


@router.post("/admin/featured-mps/fetch")
async def manual_fetch_articles(
    request: Request,
    fakeid: Optional[str] = None,
    count: int = Query(50, ge=1, le=100),
) -> Dict[str, Any]:
    """
    Manually trigger article fetch for featured MPs.
    
    Uses unified credential pool and updates scheduler stats.
    """
    _require_admin(request)
    online_conn = _get_online_db_conn(request)
    user_conn = _get_user_db_conn(request)
    
    # Use credential pool
    from hotnews.kernel.services.mp_credential_pool import get_credential_pool
    from hotnews.kernel.services.mp_article_writer import save_mp_articles
    from hotnews.kernel.services.wechat_smart_scheduler import update_mp_stats
    from hotnews.kernel.providers.wechat_provider import WeChatMPProvider, WeChatErrorCode
    
    # Initialize credential pool
    credential_pool = get_credential_pool()
    credential_pool.load_credentials(online_conn, user_conn)
    
    pool_stats = credential_pool.get_stats()
    if pool_stats["available"] == 0:
        raise HTTPException(status_code=503, detail="无可用的微信凭证")
    
    # Get MPs to fetch
    if fakeid:
        cur = online_conn.execute(
            "SELECT fakeid, nickname FROM featured_wechat_mps WHERE fakeid = ? AND enabled = 1",
            (fakeid,)
        )
    else:
        cur = online_conn.execute(
            "SELECT fakeid, nickname FROM featured_wechat_mps WHERE enabled = 1 ORDER BY sort_order ASC"
        )
    
    mps = cur.fetchall() or []
    
    if not mps:
        return {"ok": True, "message": "没有需要抓取的公众号", "fetched": 0}
    
    total_fetched = 0
    errors = []
    now = _now_ts()
    
    for mp_fakeid, mp_nickname in mps:
        # Get credential from pool
        cred = credential_pool.get_credential()
        if not cred:
            errors.append("无可用凭证")
            break
        
        try:
            # Add delay between requests
            if total_fetched > 0:
                time.sleep(2)
            
            provider = WeChatMPProvider(cred.cookie, cred.token)
            result = provider.get_articles(mp_fakeid, count)
            
            if not result.ok:
                # Handle specific errors
                if result.error_code == WeChatErrorCode.SESSION_EXPIRED:
                    credential_pool.mark_expired(cred.id, user_conn)
                elif result.error_code == WeChatErrorCode.RATE_LIMITED:
                    credential_pool.mark_rate_limited(cred.id)
                errors.append(f"{mp_nickname}: {result.error_message}")
                
                # Update stats with error
                update_mp_stats(
                    online_conn,
                    mp_fakeid,
                    nickname=mp_nickname,
                    has_new_articles=False,
                    error_message=result.error_message or "fetch_failed",
                )
                continue
            
            # Convert and save articles
            articles_to_save = []
            for art in result.articles:
                if not art.url:
                    continue
                articles_to_save.append({
                    "title": art.title,
                    "url": art.url,
                    "digest": art.digest or "",
                    "cover_url": art.cover_url or "",
                    "publish_time": art.publish_time,
                })
            
            new_count = 0
            if articles_to_save:
                save_result = save_mp_articles(online_conn, mp_fakeid, mp_nickname, articles_to_save)
                new_count = save_result["inserted"]
                total_fetched += new_count
                if save_result["errors"]:
                    errors.extend(save_result["errors"][:5])
            
            # Update scheduler stats (resets next_due_at)
            update_mp_stats(
                online_conn,
                mp_fakeid,
                nickname=mp_nickname,
                has_new_articles=(new_count > 0),
                error_message="",
            )
            
            # Update last_fetch_at
            online_conn.execute(
                "UPDATE featured_wechat_mps SET last_fetch_at = ?, updated_at = ? WHERE fakeid = ?",
                (now, now, mp_fakeid)
            )
        
        except Exception as e:
            logger.error(f"Failed to fetch articles for {mp_nickname}: {e}")
            errors.append(f"{mp_nickname}: {str(e)}")
            
            # Update stats with error
            try:
                update_mp_stats(
                    online_conn,
                    mp_fakeid,
                    nickname=mp_nickname,
                    has_new_articles=False,
                    error_message=str(e),
                )
            except Exception:
                pass
    
    online_conn.commit()
    
    if total_fetched > 0:
        _invalidate_cache()
    
    return {
        "ok": True,
        "message": f"抓取完成，共获取 {total_fetched} 篇文章",
        "fetched": total_fetched,
        "errors": errors if errors else None
    }
# ========== Admin Page Route ==========

# Separate router for page routes (no /api prefix)
page_router = APIRouter(tags=["featured-mps-page"])

def _templates(request: Request):
    """Get templates from app state."""
    t = getattr(request.app.state, "templates", None)
    if t is None:
        from jinja2 import Environment, FileSystemLoader
        import os
        template_dir = os.path.join(os.path.dirname(__file__), "..", "templates")
        t = Environment(loader=FileSystemLoader(template_dir))
        request.app.state.templates = t
    return t


@page_router.get("/admin/featured-mps", response_class=HTMLResponse)
async def admin_featured_mps_page(request: Request):
    """Admin page for managing featured MPs."""
    from hotnews.kernel.admin.admin_auth import (
        is_password_auth_enabled,
        verify_admin_session,
        get_session_cookie_name,
        get_admin_token,
    )
    
    # Check authentication (same logic as rss_admin.py)
    authenticated = False
    
    # 1. Password auth mode (secure)
    if is_password_auth_enabled():
        session_token = request.cookies.get(get_session_cookie_name(), "")
        if session_token:
            is_valid, error = verify_admin_session(session_token)
            if is_valid:
                authenticated = True
    else:
        # 2. Token auth mode (legacy, only when password is not set)
        token = get_admin_token()
        if token:
            got = (request.headers.get("X-Admin-Token") or "").strip()
            if not got:
                got = (request.query_params.get("token") or "").strip()
            if got == token:
                authenticated = True
    
    if not authenticated:
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url="/admin/login", status_code=302)
    
    token = request.query_params.get("token", "")
    
    templates = _templates(request)
    try:
        template = templates.get_template("admin_featured_mps.html")
        return HTMLResponse(content=template.render(request=request, token=token))
    except Exception as e:
        logger.error(f"Failed to render admin_featured_mps.html: {e}")
        raise HTTPException(status_code=500, detail="页面加载失败")
