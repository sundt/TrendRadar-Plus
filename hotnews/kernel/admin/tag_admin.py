# coding=utf-8
"""
Tag Admin API

Provides admin endpoints for managing the multi-label tag system.
"""

import json
import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Request, HTTPException, Body

router = APIRouter(prefix="/api/admin/tags", tags=["admin-tags"])


def _now_ts() -> int:
    return int(time.time())


def _get_online_db_conn(request: Request):
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _require_admin(request: Request):
    return request.app.state.require_admin(request)


# ==================== Tag CRUD ====================

@router.get("")
async def list_tags(
    request: Request,
    type: Optional[str] = None,
    enabled_only: bool = True,
):
    """List all tags, optionally filtered by type."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    sql = "SELECT id, name, name_en, type, parent_id, icon, color, description, sort_order, enabled, created_at, updated_at FROM tags"
    params = []
    
    conditions = []
    if type:
        conditions.append("type = ?")
        params.append(type)
    if enabled_only:
        conditions.append("enabled = 1")
    
    if conditions:
        sql += " WHERE " + " AND ".join(conditions)
    sql += " ORDER BY type, sort_order, id"
    
    cur = conn.execute(sql, tuple(params))
    rows = cur.fetchall() or []
    
    tags = []
    for r in rows:
        tags.append({
            "id": r[0],
            "name": r[1],
            "name_en": r[2],
            "type": r[3],
            "parent_id": r[4],
            "icon": r[5],
            "color": r[6],
            "description": r[7],
            "sort_order": r[8],
            "enabled": bool(r[9]),
            "created_at": r[10],
            "updated_at": r[11],
        })
    
    return {"ok": True, "tags": tags, "total": len(tags)}


@router.get("/types")
async def get_tag_types(request: Request):
    """Get distinct tag types with counts."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    cur = conn.execute(
        "SELECT type, COUNT(*) as cnt FROM tags WHERE enabled = 1 GROUP BY type ORDER BY type"
    )
    rows = cur.fetchall() or []
    
    return {
        "ok": True,
        "types": [{"type": r[0], "count": r[1]} for r in rows]
    }


@router.get("/{tag_id}")
async def get_tag(request: Request, tag_id: str):
    """Get a single tag by ID."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    cur = conn.execute(
        "SELECT id, name, name_en, type, parent_id, icon, color, description, sort_order, enabled, created_at, updated_at FROM tags WHERE id = ?",
        (tag_id,)
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Tag not found")
    
    return {
        "ok": True,
        "tag": {
            "id": row[0],
            "name": row[1],
            "name_en": row[2],
            "type": row[3],
            "parent_id": row[4],
            "icon": row[5],
            "color": row[6],
            "description": row[7],
            "sort_order": row[8],
            "enabled": bool(row[9]),
            "created_at": row[10],
            "updated_at": row[11],
        }
    }


@router.post("")
async def create_tag(
    request: Request,
    id: str = Body(...),
    name: str = Body(...),
    type: str = Body(...),
    name_en: str = Body(""),
    parent_id: str = Body(""),
    icon: str = Body(""),
    color: str = Body(""),
    description: str = Body(""),
    sort_order: int = Body(0),
):
    """Create a new tag."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    tag_id = id.strip().lower()
    if not tag_id or not name.strip() or type not in ("category", "topic", "attribute"):
        raise HTTPException(status_code=400, detail="Invalid tag data")
    
    # Check if exists
    cur = conn.execute("SELECT id FROM tags WHERE id = ?", (tag_id,))
    if cur.fetchone():
        raise HTTPException(status_code=409, detail="Tag ID already exists")
    
    now = _now_ts()
    conn.execute(
        """
        INSERT INTO tags (id, name, name_en, type, parent_id, icon, color, description, sort_order, enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
        """,
        (tag_id, name.strip(), name_en.strip(), type, parent_id.strip(), icon.strip(), color.strip(), description.strip(), sort_order, now, now)
    )
    conn.commit()
    
    return {"ok": True, "id": tag_id, "message": "Tag created"}


@router.put("/{tag_id}")
async def update_tag(
    request: Request,
    tag_id: str,
    name: Optional[str] = Body(None),
    name_en: Optional[str] = Body(None),
    type: Optional[str] = Body(None),
    parent_id: Optional[str] = Body(None),
    icon: Optional[str] = Body(None),
    color: Optional[str] = Body(None),
    description: Optional[str] = Body(None),
    sort_order: Optional[int] = Body(None),
    enabled: Optional[bool] = Body(None),
):
    """Update an existing tag."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    # Check if exists
    cur = conn.execute("SELECT id FROM tags WHERE id = ?", (tag_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Tag not found")
    
    updates = []
    params = []
    
    if name is not None:
        updates.append("name = ?")
        params.append(name.strip())
    if name_en is not None:
        updates.append("name_en = ?")
        params.append(name_en.strip())
    if type is not None and type in ("category", "topic", "attribute"):
        updates.append("type = ?")
        params.append(type)
    if parent_id is not None:
        updates.append("parent_id = ?")
        params.append(parent_id.strip())
    if icon is not None:
        updates.append("icon = ?")
        params.append(icon.strip())
    if color is not None:
        updates.append("color = ?")
        params.append(color.strip())
    if description is not None:
        updates.append("description = ?")
        params.append(description.strip())
    if sort_order is not None:
        updates.append("sort_order = ?")
        params.append(sort_order)
    if enabled is not None:
        updates.append("enabled = ?")
        params.append(1 if enabled else 0)
    
    if not updates:
        return {"ok": True, "message": "No changes"}
    
    updates.append("updated_at = ?")
    params.append(_now_ts())
    params.append(tag_id)
    
    conn.execute(f"UPDATE tags SET {', '.join(updates)} WHERE id = ?", tuple(params))
    conn.commit()
    
    return {"ok": True, "id": tag_id, "message": "Tag updated"}


@router.delete("/{tag_id}")
async def delete_tag(request: Request, tag_id: str):
    """Delete a tag (soft delete by disabling)."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    # Check usage
    cur = conn.execute("SELECT COUNT(*) FROM rss_entry_tags WHERE tag_id = ?", (tag_id,))
    usage_count = cur.fetchone()[0] or 0
    
    if usage_count > 0:
        # Soft delete if in use
        conn.execute("UPDATE tags SET enabled = 0, updated_at = ? WHERE id = ?", (_now_ts(), tag_id))
        conn.commit()
        return {"ok": True, "message": f"Tag disabled (in use by {usage_count} entries)", "soft_delete": True}
    else:
        # Hard delete if not in use
        conn.execute("DELETE FROM tags WHERE id = ?", (tag_id,))
        conn.commit()
        return {"ok": True, "message": "Tag deleted", "soft_delete": False}


@router.post("/init")
async def init_preset_tags(request: Request):
    """Initialize preset tags from tag_init.py."""
    _require_admin(request)
    
    from hotnews.kernel.admin.tag_init import init_tags
    count = init_tags(request.app.state.project_root)
    
    return {"ok": True, "tags_initialized": count}


# ==================== Tag Stats ====================

@router.get("/stats/usage")
async def get_tag_usage_stats(request: Request):
    """Get tag usage statistics."""
    _require_admin(request)
    conn = _get_online_db_conn(request)
    
    cur = conn.execute(
        """
        SELECT t.id, t.name, t.type, COUNT(et.id) as usage_count
        FROM tags t
        LEFT JOIN rss_entry_tags et ON et.tag_id = t.id
        WHERE t.enabled = 1
        GROUP BY t.id
        ORDER BY usage_count DESC
        LIMIT 50
        """
    )
    rows = cur.fetchall() or []
    
    return {
        "ok": True,
        "stats": [
            {"id": r[0], "name": r[1], "type": r[2], "usage_count": r[3]}
            for r in rows
        ]
    }


# ==================== Public API (for frontend) ====================

@router.get("/public/all")
async def public_list_tags(request: Request):
    """Public endpoint to list all enabled tags (no auth required)."""
    conn = _get_online_db_conn(request)
    
    cur = conn.execute(
        """
        SELECT id, name, name_en, type, parent_id, icon, color
        FROM tags
        WHERE enabled = 1
        ORDER BY type, sort_order
        """
    )
    rows = cur.fetchall() or []
    
    # Group by type
    categories = []
    topics = []
    attributes = []
    
    for r in rows:
        tag = {
            "id": r[0],
            "name": r[1],
            "name_en": r[2],
            "type": r[3],
            "parent_id": r[4],
            "icon": r[5],
            "color": r[6],
        }
        if r[3] == "category":
            categories.append(tag)
        elif r[3] == "topic":
            topics.append(tag)
        elif r[3] == "attribute":
            attributes.append(tag)
    
    return {
        "ok": True,
        "categories": categories,
        "topics": topics,
        "attributes": attributes,
        "total": len(rows),
    }
