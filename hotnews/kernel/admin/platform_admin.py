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

from hotnews.web.db_online import get_online_db_conn
from hotnews.web.news_viewer import PLATFORM_CATEGORIES

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


class BatchUpdateScraperAPIRequest(BaseModel):
    platform_ids: List[str]
    use_scraperapi: bool


def _get_project_root(request: Request) -> Path:
    return request.app.state.project_root


def _get_conn(request: Request) -> sqlite3.Connection:
    return get_online_db_conn(_get_project_root(request))


def _require_admin(request: Request):
    if hasattr(request.app.state, "require_admin"):
        request.app.state.require_admin(request)


def _trigger_viewer_reload(request: Request):
    """Trigger reload of platform config in NewsViewerService."""
    try:
        if hasattr(request.app.state, "get_services"):
            viewer_service, _ = request.app.state.get_services()
            if viewer_service and hasattr(viewer_service, "_reload_platform_config"):
                viewer_service._reload_platform_config()
                # Also clear the result cache to force immediate refresh
                from hotnews.web.news_viewer import clear_categorized_news_cache
                clear_categorized_news_cache()
    except Exception as e:
        print(f"Failed to reload viewer config: {e}")


# === Category Management ===

@router.get("/categories", response_model=List[Dict[str, Any]])
async def list_categories(request: Request): # Public read access for viewer
    """List all platform categories."""
    conn = _get_conn(request)
    try:
        # 1. Fetch all existing categories (including disabled/deleted ones)
        cur = conn.execute(
            """SELECT id, name, icon, sort_order, enabled, created_at, updated_at 
               FROM platform_categories"""
        )
        existing_rows = cur.fetchall()
        existing_ids = {r[0] for r in existing_rows}
        
        # 2. Build set of deleted category IDs (soft-deleted categories have id like "deleted_sports_xxx")
        # Extract original category id from deleted entries
        deleted_original_ids = set()
        for row_id in existing_ids:
            if row_id.startswith("deleted_"):
                # Format: deleted_{original_id}_{timestamp}
                parts = row_id.split("_", 2)  # Split into at most 3 parts
                if len(parts) >= 2:
                    # The original id is between "deleted_" and the last "_timestamp"
                    # e.g., "deleted_sports_1234567890" -> "sports"
                    original_id = "_".join(parts[1:-1]) if len(parts) > 2 else parts[1]
                    # Handle case where original_id might contain underscores
                    # Try to match against known PLATFORM_CATEGORIES
                    for known_id in PLATFORM_CATEGORIES.keys():
                        if row_id.startswith(f"deleted_{known_id}_"):
                            deleted_original_ids.add(known_id)
                            break
        
        # 3. Check for missing defaults and insert (but skip deleted ones)
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        added_new = False
        
        default_order_map = {
            "explore": 0,
            "knowledge": 10,
            "finance": 20,
            "tech_news": 30,
            "developer": 40,
            "social": 50,
            "general": 60,
            "sports": 70
        }

        for cat_id, cat_def in PLATFORM_CATEGORIES.items():
            # Skip if already exists OR if it was deleted
            if cat_id in existing_ids or cat_id in deleted_original_ids:
                continue
                
            # Insert missing (not deleted) category
            name = cat_def["name"]
            icon = cat_def.get("icon", "📰")
            order = default_order_map.get(cat_id, 99)
            
            try:
                conn.execute(
                    "INSERT INTO platform_categories (id, name, icon, sort_order, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)",
                    (cat_id, name, icon, order, now, now)
                )
                added_new = True
            except Exception:
                pass

        if added_new:
            conn.commit()

        # 4. Re-fetch sorted - only return enabled categories (not deleted ones)
        cur = conn.execute(
            """SELECT id, name, icon, sort_order, enabled, created_at, updated_at 
               FROM platform_categories 
               WHERE enabled = 1
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
        ("finance", "财经投资", "💰", 20),
        ("tech_news", "科技资讯", "📱", 30),
        ("developer", "开发者", "💻", 40),
        ("social", "社交娱乐", "🔥", 50),
        ("general", "综合新闻", "📰", 60),
        ("sports", "体育", "🏀", 70),
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
        _trigger_viewer_reload(request)
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
        _trigger_viewer_reload(request)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/categories/{category_id}")
async def delete_category(category_id: str, request: Request, _=Depends(_require_admin)):
    """Delete a category (soft delete by setting enabled=0 and adding deleted_ prefix)."""
    conn = _get_conn(request)
    try:
        # Check if category exists
        cur = conn.execute("SELECT id FROM platform_categories WHERE id = ?", (category_id,))
        if not cur.fetchone():
            raise HTTPException(status_code=404, detail=f"Category '{category_id}' not found")
        
        # Soft delete: mark as disabled and rename to prevent auto-sync from re-enabling
        # The auto-sync in list_categories checks by id, so we rename to avoid collision
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        deleted_id = f"deleted_{category_id}_{int(datetime.now().timestamp())}"
        
        conn.execute(
            "UPDATE platform_categories SET id = ?, enabled = 0, updated_at = ? WHERE id = ?",
            (deleted_id, now, category_id)
        )
        conn.commit()
        _trigger_viewer_reload(request)
        return {"success": True, "message": f"Category '{category_id}' deleted"}
    except HTTPException:
        raise
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
            "SELECT id, name, category, provider_type, enabled, last_run_at, last_status, country, language FROM custom_sources"
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
                "last_status": r[6],
                "country": r[7] or "",
                "language": r[8] or ""
            })
    except Exception:
        pass

    # 3. RSS Sources
    try:
        cur = conn.execute(
            "SELECT id, name, category, enabled, updated_at, url, host, source, country, language FROM rss_sources"
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
                "last_status": "ok", # RSS doesn't strictly track comprehensive status in simple view
                "url": r[5] or "",
                "host": r[6] or "",
                "source": r[7] or "",
                "country": r[8] or "",
                "language": r[9] or ""
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

    _trigger_viewer_reload(request)
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


@router.post("/batch-scraperapi")
async def batch_update_scraperapi(
    payload: BatchUpdateScraperAPIRequest,
    request: Request,
    _=Depends(_require_admin)
):
    """Batch update ScraperAPI usage for platforms."""
    conn = _get_conn(request)
    platform_ids = payload.platform_ids
    use_scraperapi = payload.use_scraperapi
    
    updated_counts = {"rss": 0, "custom": 0}
    
    # Split IDs by type
    rss_ids = []
    custom_ids = []
    
    for pid in platform_ids:
        if pid.startswith("rss-"):
            rss_ids.append(pid[4:])  # Remove 'rss-' prefix
        else:
            # Assume custom source (NewsNow doesn't have use_scraperapi field)
            custom_ids.append(pid)
    
    with conn:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Update RSS sources
        if rss_ids:
            placeholders = ",".join("?" * len(rss_ids))
            conn.execute(
                f"UPDATE rss_sources SET use_scraperapi = ?, updated_at = ? WHERE id IN ({placeholders})",
                (1 if use_scraperapi else 0, int(datetime.now().timestamp()), *rss_ids)
            )
            updated_counts["rss"] = len(rss_ids)
        
        # Update Custom sources
        if custom_ids:
            placeholders = ",".join("?" * len(custom_ids))
            conn.execute(
                f"UPDATE custom_sources SET use_scraperapi = ?, updated_at = ? WHERE id IN ({placeholders})",
                (1 if use_scraperapi else 0, now, *custom_ids)
            )
            updated_counts["custom"] = len(custom_ids)
    
    return {"success": True, "updated": updated_counts}


def _get_all_newsnow_ids(conn) -> set:
    try:
        cur = conn.execute("SELECT id FROM newsnow_platforms")
        return {r[0] for r in cur.fetchall()}
    except Exception:
        return set()


class BatchUpdateSocksProxyRequest(BaseModel):
    platform_ids: List[str]
    use_socks_proxy: bool


@router.post("/batch-socks-proxy")
async def batch_update_socks_proxy(
    payload: BatchUpdateSocksProxyRequest,
    request: Request,
    _=Depends(_require_admin)
):
    """Batch update Socks5 proxy usage for platforms."""
    conn = _get_conn(request)
    platform_ids = payload.platform_ids
    use_socks_proxy = payload.use_socks_proxy
    
    updated_counts = {"rss": 0, "custom": 0}
    
    # Split IDs by type
    rss_ids = []
    custom_ids = []
    
    for pid in platform_ids:
        if pid.startswith("rss-"):
            rss_ids.append(pid[4:])  # Remove 'rss-' prefix
        else:
            # Assume custom source (NewsNow doesn't have use_socks_proxy field)
            custom_ids.append(pid)
    
    with conn:
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        
        # Update RSS sources
        if rss_ids:
            placeholders = ",".join("?" * len(rss_ids))
            conn.execute(
                f"UPDATE rss_sources SET use_socks_proxy = ?, updated_at = ? WHERE id IN ({placeholders})",
                (1 if use_socks_proxy else 0, int(datetime.now().timestamp()), *rss_ids)
            )
            updated_counts["rss"] = len(rss_ids)
        
        # Update Custom sources
        if custom_ids:
            placeholders = ",".join("?" * len(custom_ids))
            conn.execute(
                f"UPDATE custom_sources SET use_socks_proxy = ?, updated_at = ? WHERE id IN ({placeholders})",
                (1 if use_socks_proxy else 0, now, *custom_ids)
            )
            updated_counts["custom"] = len(custom_ids)
    
    return {"success": True, "updated": updated_counts}

