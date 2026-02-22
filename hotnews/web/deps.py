"""
Hotnews Web - 共享依赖模块

提供路由模块共用的工具函数、数据库连接和认证逻辑。
"""

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from fastapi import Request, HTTPException, Response

from hotnews.web.db_online import get_online_db_conn
from hotnews.web.user_db import get_user_db_conn, resolve_user_id_by_cookie_token
from hotnews.web.news_viewer import generate_news_id

# 项目根目录
project_root = Path(__file__).parent.parent.parent


class UnicodeJSONResponse(Response):
    """自定义 JSONResponse，确保中文正确显示"""
    media_type = "application/json"

    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")


# ---------------------------------------------------------------------------
# Database connections
# ---------------------------------------------------------------------------

_user_db_conn: Optional[sqlite3.Connection] = None


def get_online_db() -> sqlite3.Connection:
    return get_online_db_conn(project_root)


def get_user_db() -> sqlite3.Connection:
    global _user_db_conn
    if _user_db_conn is not None:
        return _user_db_conn
    _user_db_conn = get_user_db_conn(project_root)
    return _user_db_conn


# ---------------------------------------------------------------------------
# Auth / identity helpers
# ---------------------------------------------------------------------------

def resolve_anon_user_id(request: Request) -> Optional[int]:
    """Resolve user ID from rss_uid cookie. No longer auto-creates users."""
    tok = (request.cookies.get("rss_uid") or "").strip()
    if not tok:
        return None
    try:
        user_id = resolve_user_id_by_cookie_token(conn=get_user_db(), token=tok)
        return user_id
    except Exception:
        return None


def require_admin(request: Request) -> str:
    """
    Verify admin authentication via session cookie or token.
    """
    from hotnews.kernel.admin.admin_auth import (
        is_password_auth_enabled,
        verify_admin_session,
        get_session_cookie_name,
        get_admin_token,
    )

    if is_password_auth_enabled():
        session_token = request.cookies.get(get_session_cookie_name(), "")
        if session_token:
            is_valid, error = verify_admin_session(session_token)
            if is_valid:
                return "session"
        raise HTTPException(status_code=403, detail="Forbidden")

    token = get_admin_token()
    if not token:
        raise HTTPException(status_code=403, detail="Admin not configured")

    got = (request.headers.get("X-Admin-Token") or "").strip()
    if not got:
        got = (request.query_params.get("token") or "").strip()
    if got != token:
        raise HTTPException(status_code=403, detail="Forbidden")
    return token


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def now_ts() -> int:
    return int(time.time())


def rss_created_at_cutoff(*, hours: int) -> int:
    h = int(hours)
    if h <= 0:
        h = 24
    if h > 24 * 7:
        h = 24 * 7
    now = int(time.time())
    return now - h * 3600


def rss_row_to_item(*, platform_id: str, source_id: str, source_name: str,
                     title: str, url: str, created_at: int) -> Dict[str, Any]:
    t = (title or "").strip()
    u = (url or "").strip()
    if not t:
        t = u
    return {
        "source_id": (source_id or "").strip(),
        "source_name": (source_name or "").strip() or (source_id or "").strip(),
        "title": t,
        "display_title": t,
        "url": u,
        "created_at": int(created_at or 0),
        "stable_id": generate_news_id(platform_id, t),
    }


# ---------------------------------------------------------------------------
# Tag/category whitelist filtering (shared by morning_brief_routes & cache_warmup)
# ---------------------------------------------------------------------------

# Legacy AI-model fine-grained categories (always included as fallback)
AI_LEGACY_CATEGORIES = {"AI_MODEL", "DEV_INFRA", "HARDWARE_PRO"}


def passes_tag_whitelist(
    tag_ids: set,
    source_category: str,
    *,
    tag_whitelist: set,
    tag_whitelist_enabled: bool,
    category_whitelist: set,
    category_whitelist_enabled: bool,
) -> bool:
    """Check if an article passes the tag/category whitelist filter.

    This is the single source of truth for brief timeline filtering,
    used by both morning_brief_routes.py and cache_warmup.py.

    Returns True if the article should be included.
    """
    sc = (source_category or "").strip()
    if tag_whitelist_enabled and tag_whitelist:
        return bool(tag_ids.intersection(tag_whitelist)) or sc in AI_LEGACY_CATEGORIES
    if category_whitelist_enabled and category_whitelist:
        return sc in category_whitelist or sc in AI_LEGACY_CATEGORIES
    return True
