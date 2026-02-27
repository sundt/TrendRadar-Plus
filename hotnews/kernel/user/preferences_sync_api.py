# coding=utf-8
"""
User Preferences Sync API

Provides endpoints for syncing user preferences (category config, theme, sidebar widths)
across devices and browsers.

Endpoints:
- GET /api/user/preferences/sync - Get user preferences
- PUT /api/user/preferences/sync - Full update of user preferences
- PATCH /api/user/preferences/sync - Partial update of user preferences
"""

import json
import time
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api/user/preferences/sync", tags=["preferences-sync"])


def _now_ts() -> int:
    """Get current Unix timestamp."""
    return int(time.time())


def _get_user_db_conn(request: Request):
    """Get user database connection from request app state."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


from hotnews.kernel.auth.deps import get_current_user as _get_current_user_base


def _get_current_user(request: Request, user_id: Optional[int] = None) -> dict:
    """
    Get current user from session token or user_id parameter.
    Raises 401 if not authenticated.
    """
    user_info = _get_current_user_base(request)

    # If user_id is provided, verify it matches the authenticated user
    if user_id is not None:
        if user_id != user_info.get("id"):
            raise HTTPException(status_code=400, detail="Invalid user_id")

    return user_info


def _ensure_preferences_table(conn):
    """Ensure the user_preferences table exists."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER PRIMARY KEY,
            category_config TEXT DEFAULT '{}',
            theme TEXT DEFAULT 'light',
            sidebar_widths TEXT DEFAULT '{}',
            view_mode TEXT DEFAULT '{}',
            updated_at INTEGER NOT NULL
        )
    """)
    # Add view_mode column if missing (migration for existing tables)
    try:
        conn.execute("SELECT view_mode FROM user_preferences LIMIT 0")
    except Exception:
        try:
            conn.execute("ALTER TABLE user_preferences ADD COLUMN view_mode TEXT DEFAULT '{}'")
        except Exception:
            pass
    conn.commit()


def _get_user_preferences(conn, user_id: int) -> Optional[Dict[str, Any]]:
    """Get user preferences from database."""
    cur = conn.execute(
        """
        SELECT user_id, category_config, theme, sidebar_widths, updated_at, view_mode
        FROM user_preferences
        WHERE user_id = ?
        """,
        (user_id,)
    )
    row = cur.fetchone()
    
    if not row:
        return None
    
    # Parse JSON fields
    try:
        category_config = json.loads(row[1] or '{}')
    except (json.JSONDecodeError, TypeError):
        category_config = {}
    
    try:
        sidebar_widths = json.loads(row[3] or '{}')
    except (json.JSONDecodeError, TypeError):
        sidebar_widths = {}

    try:
        view_mode = json.loads(row[5] or '{}') if len(row) > 5 else {}
    except (json.JSONDecodeError, TypeError):
        view_mode = {}
    
    return {
        "user_id": row[0],
        "category_config": category_config,
        "theme": row[2] or "light",
        "sidebar_widths": sidebar_widths,
        "view_mode": view_mode,
        "updated_at": row[4]
    }


def _validate_theme(theme: str) -> str:
    """Validate theme value, return valid theme or default."""
    valid_themes = ("light", "dark", "auto")
    if theme in valid_themes:
        return theme
    return "light"


def _format_response(preferences: Dict[str, Any]) -> Dict[str, Any]:
    """Format preferences for API response."""
    return {
        "ok": True,
        "category_config": preferences.get("category_config", {}),
        "theme": preferences.get("theme", "light"),
        "sidebar_widths": preferences.get("sidebar_widths", {}),
        "view_mode": preferences.get("view_mode", {}),
        "updated_at": preferences.get("updated_at", 0)
    }


@router.get("")
async def get_preferences(
    request: Request,
    user_id: Optional[int] = Query(None, description="User ID for identification")
):
    """
    Get user preferences.
    
    Returns the user's saved preferences including:
    - category_config: Category order, hidden categories, custom categories, etc.
    - theme: 'light', 'dark', or 'auto'
    - sidebar_widths: Favorites and todo sidebar widths
    
    Requirements: 2.1, 2.4, 2.6
    """
    user = _get_current_user(request, user_id)
    conn = _get_user_db_conn(request)
    
    _ensure_preferences_table(conn)
    
    preferences = _get_user_preferences(conn, user["id"])
    
    if not preferences:
        # Return default preferences if none exist
        return {
            "ok": True,
            "category_config": {},
            "theme": "light",
            "sidebar_widths": {},
            "view_mode": {},
            "updated_at": None
        }
    
    return _format_response(preferences)


@router.put("")
async def put_preferences(
    request: Request,
    user_id: Optional[int] = Query(None, description="User ID for identification")
):
    """
    Full update of user preferences.
    
    Replaces all preference fields with the provided values.
    Body should contain: category_config, theme, sidebar_widths
    
    Requirements: 2.2, 2.4, 2.7
    """
    user = _get_current_user(request, user_id)
    conn = _get_user_db_conn(request)
    
    _ensure_preferences_table(conn)
    
    # Parse request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON data")
    
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON data")
    
    # Extract and validate fields
    category_config = body.get("category_config", {})
    if not isinstance(category_config, dict):
        category_config = {}
    
    theme = _validate_theme(str(body.get("theme", "light")))
    
    sidebar_widths = body.get("sidebar_widths", {})
    if not isinstance(sidebar_widths, dict):
        sidebar_widths = {}

    view_mode = body.get("view_mode", {})
    if not isinstance(view_mode, dict):
        view_mode = {}
    
    now = _now_ts()
    
    try:
        # Upsert preferences
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, category_config, theme, sidebar_widths, view_mode, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                category_config = excluded.category_config,
                theme = excluded.theme,
                sidebar_widths = excluded.sidebar_widths,
                view_mode = excluded.view_mode,
                updated_at = excluded.updated_at
            """,
            (
                user["id"],
                json.dumps(category_config, ensure_ascii=False),
                theme,
                json.dumps(sidebar_widths, ensure_ascii=False),
                json.dumps(view_mode, ensure_ascii=False),
                now
            )
        )
        conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
    
    return {
        "ok": True,
        "category_config": category_config,
        "theme": theme,
        "sidebar_widths": sidebar_widths,
        "view_mode": view_mode,
        "updated_at": now
    }


@router.patch("")
async def patch_preferences(
    request: Request,
    user_id: Optional[int] = Query(None, description="User ID for identification")
):
    """
    Partial update of user preferences.
    
    Only updates the fields provided in the request body.
    Other fields remain unchanged.
    
    Requirements: 2.3, 2.4, 2.7
    """
    user = _get_current_user(request, user_id)
    conn = _get_user_db_conn(request)
    
    _ensure_preferences_table(conn)
    
    # Parse request body
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON data")
    
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Invalid JSON data")
    
    # Get existing preferences or create defaults
    existing = _get_user_preferences(conn, user["id"])
    if not existing:
        existing = {
            "category_config": {},
            "theme": "light",
            "sidebar_widths": {},
            "view_mode": {}
        }
    
    # Update only provided fields
    if "category_config" in body:
        category_config = body["category_config"]
        if isinstance(category_config, dict):
            existing["category_config"] = category_config
    
    if "theme" in body:
        existing["theme"] = _validate_theme(str(body["theme"]))
    
    if "sidebar_widths" in body:
        sidebar_widths = body["sidebar_widths"]
        if isinstance(sidebar_widths, dict):
            existing["sidebar_widths"] = sidebar_widths

    if "view_mode" in body:
        vm = body["view_mode"]
        if isinstance(vm, dict):
            existing["view_mode"] = vm
    
    now = _now_ts()
    
    try:
        # Upsert preferences
        conn.execute(
            """
            INSERT INTO user_preferences (user_id, category_config, theme, sidebar_widths, view_mode, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                category_config = excluded.category_config,
                theme = excluded.theme,
                sidebar_widths = excluded.sidebar_widths,
                view_mode = excluded.view_mode,
                updated_at = excluded.updated_at
            """,
            (
                user["id"],
                json.dumps(existing["category_config"], ensure_ascii=False),
                existing["theme"],
                json.dumps(existing["sidebar_widths"], ensure_ascii=False),
                json.dumps(existing.get("view_mode", {}), ensure_ascii=False),
                now
            )
        )
        conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail="Internal server error")
    
    return {
        "ok": True,
        "category_config": existing["category_config"],
        "theme": existing["theme"],
        "sidebar_widths": existing["sidebar_widths"],
        "view_mode": existing.get("view_mode", {}),
        "updated_at": now
    }
