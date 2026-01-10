# coding=utf-8
"""
Platform Admin API

Unified management for all platform types (NewsNow, RSS, API, HTML) and categories.
"""
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

from fastapi import APIRouter, Depends, HTTPException, Request, Body
from pydantic import BaseModel

from trendradar.web.db_online import get_online_db_conn
from trendradar.web.news_viewer import PLATFORM_CATEGORIES

router = APIRouter(prefix="/api/platform", tags=["platform_admin"])


class PlatformCategory(BaseModel):
    id: str
    name: str
    icon: Optional[str] = "📰"
    sort_order: Optional[int] = 0
    enabled: bool = True


class BatchUpdateCategoryRequest(BaseModel):
    platform_ids: List[str]
    category_id: str


class BatchUpdateStatusRequest(BaseModel):
    platform_ids: List[str]
    enabled: bool


def _get_project_root(request: Request) -> Path:
    return request.app.state.project_root


def _get_conn(request: Request) -> sqlite3.Connection:
    return get_online_db_conn(_get_project_root(request))


def _require_admin(request: Request):
    if hasattr(request.app.state, "require_admin"):
        request.app.state.require_admin(request)


# === Category Management ===

@router.get("/categories", response_model=List[Dict[str, Any]])
async def list_categories(request: Request): # Public read access for viewer
    """List all platform categories."""
    conn = _get_conn(request)
    try:
        cur = conn.execute(
            """SELECT id, name, icon, sort_order, enabled, created_at, updated_at 
               FROM platform_categories 
               ORDER BY sort_order ASC, created_at ASC"""
        )
        rows = cur.fetchall()
        
        # If empty, try to initialize from defaults (lazy init)
        if not rows:
            _init_default_categories(conn)
            # Re-fetch
            cur = conn.execute(
                """SELECT id, name, icon, sort_order, enabled, created_at, updated_at 
                   FROM platform_categories 
                   ORDER BY sort_order ASC, created_at ASC"""
            )
            rows = cur.fetchall()

        results = []
        for r in rows:
            results.append({
                "id": r[0],
                "name": r[1],
                "icon": r[2] or "📰",
                "sort_order": r[3] or 0,
                "enabled": bool(r[4]),
                "created_at": r[5],
                "updated_at": r[6]
            })
        return results
    except Exception as e:
        # Fallback to hardcoded defaults if DB fails
        return [
            {"id": k, "name": v["name"], "icon": v.get("icon", "📰"), "sort_order": i, "enabled": True}
            for i, (k, v) in enumerate(PLATFORM_CATEGORIES.items())
        ]


def _init_default_categories(conn: sqlite3.Connection):
    """Initialize default categories from news_viewer.py defaults."""
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    # Define order based on CATEGORY_ORDER in news_viewer.py if available, or just dict order
    # For now, we manually assign logical order
    
    # Defaults from design
    defaults = [
        ("explore", "深入探索", "🔎", 0),
        ("knowledge", "每日AI早报", "📚", 10),
        ("ai", "AI资讯", "🤖", 20),
        ("finance", "财经投资", "💰", 30),
        ("tech_news", "科技资讯", "📱", 40),
        ("developer", "开发者", "💻", 50),
        ("social", "社交娱乐", "🔥", 60),
        ("general", "综合新闻", "📰", 70),
        ("sports", "体育", "🏀", 80),
    ]
    
    for item in defaults:
        cid, name, icon, order = item
        try:
            conn.execute(
                "INSERT OR IGNORE INTO platform_categories (id, name, icon, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
                (cid, name, icon, order, now, now)
            )
        except Exception:
            pass
    conn.commit()


@router.post("/categories")
async def create_category(category: PlatformCategory, request: Request, _=Depends(_require_admin)):
    """Create a new category."""
    conn = _get_conn(request)
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """INSERT INTO platform_categories (id, name, icon, sort_order, enabled, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (category.id, category.name, category.icon, category.sort_order, category.enabled, now, now)
        )
        conn.commit()
        return {"success": True}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Category ID already exists")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/categories/{category_id}")
async def update_category(category_id: str, category: PlatformCategory, request: Request, _=Depends(_require_admin)):
    """Update an existing category."""
    conn = _get_conn(request)
    try:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """UPDATE platform_categories 
               SET name = ?, icon = ?, sort_order = ?, enabled = ?, updated_at = ?
               WHERE id = ?""",
            (category.name, category.icon, category.sort_order, category.enabled, now, category_id)
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, request: Request, _=Depends(_require_admin)):
    """Delete a category."""
    conn = _get_conn(request)
    try:
        conn.execute("DELETE FROM platform_categories WHERE id = ?", (category_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# === Unified Platform Management ===

@router.get("/all")
async def list_all_platforms(request: Request, _=Depends(_require_admin)):
    """
    Get a unified view of all platforms (NewsNow, RSS, API, HTML).
    """
    conn = _get_conn(request)
    platforms = []

    # 1. NewsNow Platforms
    try:
        cur = conn.execute(
            "SELECT id, name, category, enabled, last_fetch_at, last_status FROM newsnow_platforms"
        )
        for r in cur.fetchall():
            platforms.append({
                "id": r[0],
                "name": r[1],
                "type": "newsnow",
                "category": r[2] or "",
                "enabled": bool(r[3]),
                "last_fetch_at": r[4],
                "last_status": r[5]
            })
    except Exception:
        pass

    # 2. Custom Sources (API & HTML)
    try:
        cur = conn.execute(
            "SELECT id, name, category, provider_type, enabled, last_run_at, last_status FROM custom_sources"
        )
        for r in cur.fetchall():
            # Normalize type: 'html_scraper' -> 'html', distinct from 'api'
            raw_type = r[3] or "custom"
            normalized_type = "html" if raw_type in ("html_scraper", "html", "playwright") else "api"
            
            platforms.append({
                "id": r[0],
                "name": r[1],
                "type": normalized_type, # Standardized
                "raw_type": raw_type,    # Keep original just in case
                "category": r[2] or "",
                "enabled": bool(r[4]),
                "last_fetch_at": r[5],
                "last_status": r[6]
            })
    except Exception:
        pass

    # 3. RSS Sources
    try:
        cur = conn.execute(
            "SELECT id, name, category, enabled, updated_at FROM rss_sources"
        )
        for r in cur.fetchall():
            platforms.append({
                "id": f"rss-{r[0]}", # Unified ID prefix
                "rss_source_id": r[0],
                "name": r[1],
                "type": "rss",
                "category": r[2] or "",
                "enabled": bool(r[3]),
                "last_fetch_at": datetime.fromtimestamp(r[4]).strftime("%Y-%m-%d %H:%M:%S") if r[4] > 0 else "",
                "last_status": "ok" # RSS doesn't strictly track comprehensive status in simple view
            })
    except Exception:
        pass

    return platforms


@router.post("/batch-category")
async def batch_update_category(
    payload: BatchUpdateCategoryRequest, 
    request: Request, 
    _=Depends(_require_admin)
):
    """Batch update category for platforms."""
    conn = _get_conn(request)
    platform_ids = payload.platform_ids
    category = payload.category_id
    
    updated_counts = {"newsnow": 0, "custom": 0, "rss": 0}
    
    # We need to split IDs by type to update correct tables
    newsnow_ids = []
    custom_ids = []
    rss_ids = []
    
    for pid in platform_ids:
        if pid.startswith("rss-"):
            rss_ids.append(pid[4:]) # Remove 'rss-' prefix
        elif pid in _get_all_newsnow_ids(conn):
             newsnow_ids.append(pid)
        else:
             # Assume custom source if not RSS and not explicitly NewsNow (or check DB)
             # Better approach: check DB existence for each
             custom_ids.append(pid)

    with conn:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Update NewsNow
        if newsnow_ids:
             placeholders = ",".join("?" * len(newsnow_ids))
             conn.execute(
                 f"UPDATE newsnow_platforms SET category = ?, updated_at = ? WHERE id IN ({placeholders})",
                 (category, now, *newsnow_ids)
             )
             updated_counts["newsnow"] = len(newsnow_ids)

        # Update RSS
        if rss_ids:
             placeholders = ",".join("?" * len(rss_ids))
             conn.execute(
                 f"UPDATE rss_sources SET category = ?, updated_at = ? WHERE id IN ({placeholders})",
                 (category, int(datetime.now().timestamp()), *rss_ids)
             )
             updated_counts["rss"] = len(rss_ids)

        # Update Custom Sources
        if custom_ids:
             # Since we guessed custom_ids, let's just try updating. 
             # If ID doesn't exist, no harm done in SQL default behavior (0 rows affected).
             # But to be safe vs NewsNow overlap, we might want to check.
             # Ideally the UI passes types, but here we infer.
             placeholders = ",".join("?" * len(custom_ids))
             conn.execute(
                 f"UPDATE custom_sources SET category = ?, updated_at = ? WHERE id IN ({placeholders})",
                 (category, now, *custom_ids)
             )
             updated_counts["custom"] = len(custom_ids)

    return {"success": True, "updated": updated_counts}


@router.post("/batch-status")
async def batch_update_status(
    payload: BatchUpdateStatusRequest, 
    request: Request, 
    _=Depends(_require_admin)
):
    """Batch update enabled status."""
    conn = _get_conn(request)
    platform_ids = payload.platform_ids
    enabled = payload.enabled
    
    newsnow_ids = []
    rss_ids = []
    custom_ids = []
    
    # Helper to check ID existence would be better, but for speed we do optimistic updates
    all_newsnow = _get_all_newsnow_ids(conn)
    
    for pid in platform_ids:
        if pid.startswith("rss-"):
            rss_ids.append(pid[4:])
        elif pid in all_newsnow:
            newsnow_ids.append(pid)
        else:
            custom_ids.append(pid)
            
    with conn:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        if newsnow_ids:
             placeholders = ",".join("?" * len(newsnow_ids))
             conn.execute(
                 f"UPDATE newsnow_platforms SET enabled = ?, updated_at = ? WHERE id IN ({placeholders})",
                 (1 if enabled else 0, now, *newsnow_ids)
             )

        if rss_ids:
             placeholders = ",".join("?" * len(rss_ids))
             conn.execute(
                 f"UPDATE rss_sources SET enabled = ?, updated_at = ? WHERE id IN ({placeholders})",
                 (1 if enabled else 0, int(datetime.now().timestamp()), *rss_ids)
             )
             
        if custom_ids:
             placeholders = ",".join("?" * len(custom_ids))
             conn.execute(
                 f"UPDATE custom_sources SET enabled = ?, updated_at = ? WHERE id IN ({placeholders})",
                 (1 if enabled else 0, now, *custom_ids)
             )

    return {"success": True}


def _get_all_newsnow_ids(conn) -> set:
    try:
        cur = conn.execute("SELECT id FROM newsnow_platforms")
        return {r[0] for r in cur.fetchall()}
    except Exception:
        return set()
