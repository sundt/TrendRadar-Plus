"""
Explore Timeline Routes

探索时间线 API 端点。
从 server.py 提取，降低主文件复杂度。
"""

import time
from typing import Any, Dict, List

from fastapi import APIRouter, Query

from hotnews.web.deps import (
    UnicodeJSONResponse,
    get_online_db,
    rss_row_to_item,
)
from hotnews.web.timeline_cache import explore_timeline_cache

router = APIRouter()


@router.get("/api/rss/explore/timeline")
async def api_rss_explore_timeline(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """API: Explore timeline - all RSS entries sorted by published_at DESC."""
    conn = get_online_db()

    lim = min(int(limit or 50), 500)
    off = int(offset or 0)

    # Try to get from cache first (no config check needed for explore)
    cached_items = explore_timeline_cache.get()
    if cached_items is not None and off + lim <= len(cached_items):
        sliced = cached_items[off:off + lim]
        return UnicodeJSONResponse(
            content={
                "offset": off,
                "limit": lim,
                "items": sliced,
                "total_returned": len(sliced),
                "cached": True,
            }
        )

    # Cache miss - fetch from database
    min_timestamp = 946684800  # 2000-01-01
    max_timestamp = int(time.time()) + (365 * 24 * 3600)  # Current + 1 year

    try:
        fetch_limit = 2000
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                   e.description, e.content
            FROM rss_entries e
            JOIN rss_sources s ON e.source_id = s.id
            WHERE e.published_at > 0
              AND s.enabled = 1
              AND s.category = 'explore'
              AND e.published_at >= ?
              AND e.published_at <= ?
            ORDER BY e.published_at DESC, e.id DESC
            LIMIT ?
            """,
            (min_timestamp, max_timestamp, fetch_limit),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    # Fetch source names in batch
    source_ids = list(set(str(r[0] or "").strip() for r in rows if r[0]))
    source_names: Dict[str, str] = {}
    if source_ids:
        try:
            placeholders = ",".join("?" * len(source_ids))
            cur = conn.execute(
                f"SELECT id, name FROM rss_sources WHERE id IN ({placeholders})",
                source_ids,
            )
            source_names = {str(r[0]): str(r[1] or "") for r in cur.fetchall()}
        except Exception:
            pass

    items_all: List[Dict[str, Any]] = []
    seen_titles: set = set()
    max_cache_items = 1000

    for r in rows:
        if len(items_all) >= max_cache_items:
            break

        sid = str(r[0] or "").strip()
        title = str(r[1] or "").strip()
        url = str(r[2] or "")
        created_at = int(r[3] or 0)
        published_at = int(r[4] or 0)
        description = str(r[5] or "").strip() if len(r) > 5 else ""
        content = str(r[6] or "").strip() if len(r) > 6 else ""
        sname = source_names.get(sid, "")

        if not url.strip():
            continue

        title_key = title.lower()
        if title_key in seen_titles:
            continue
        seen_titles.add(title_key)

        pid = f"rss-{sid}" if sid else "rss-unknown"
        it = rss_row_to_item(
            platform_id=pid, source_id=sid, source_name=sname,
            title=title, url=url, created_at=created_at,
        )
        it["published_at"] = published_at
        body = content or description
        if body:
            it["content"] = body
        items_all.append(it)

    explore_timeline_cache.set(items_all)

    sliced = items_all[off:off + lim]
    return UnicodeJSONResponse(
        content={
            "offset": off,
            "limit": lim,
            "items": sliced,
            "total_returned": len(sliced),
        }
    )
