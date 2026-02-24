"""
Timeline Routes

/api/timeline — 按 tag_id 查询文章时间线（tag-driven 栏目通用接口）

两步查询：
  Step 1: rss_entry_tags 按 tag_id IN (...) 聚合 dedup_key + latest 时间
  Step 2: rss_entries 批量取详情
"""

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query

from hotnews.web.deps import UnicodeJSONResponse, get_online_db

router = APIRouter()


def _fetch_source_names(conn, source_ids: List[str]) -> Dict[str, str]:
    if not source_ids:
        return {}
    placeholders = ",".join("?" * len(source_ids))
    try:
        rows = conn.execute(
            f"SELECT id, name FROM rss_sources WHERE id IN ({placeholders})",
            source_ids,
        ).fetchall()
        return {str(r[0]): str(r[1] or "") for r in rows}
    except Exception:
        return {}


@router.get("/api/timeline")
async def api_timeline(
    tags: str = Query(..., description="逗号分隔的 tag_id 列表"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """按 tag_id 列表查询文章时间线，返回去重后按时间倒序的文章列表。"""
    conn = get_online_db()

    tag_list = [t.strip() for t in tags.split(",") if t.strip()]
    if not tag_list:
        return UnicodeJSONResponse(content={"items": [], "total": 0, "has_more": False})

    lim = min(int(limit), 500)
    off = int(offset)

    placeholders = ",".join("?" * len(tag_list))

    # Step 1: 按 tag 聚合 dedup_key，取最新时间，分页
    try:
        step1_rows = conn.execute(
            f"""
            SELECT et.source_id, et.dedup_key, MAX(et.created_at) AS latest
            FROM rss_entry_tags et
            WHERE et.tag_id IN ({placeholders})
            GROUP BY et.source_id, et.dedup_key
            ORDER BY latest DESC
            LIMIT ? OFFSET ?
            """,
            (*tag_list, lim + 1, off),  # fetch lim+1 to detect has_more
        ).fetchall()
    except Exception:
        step1_rows = []

    has_more = len(step1_rows) > lim
    step1_rows = step1_rows[:lim]

    if not step1_rows:
        return UnicodeJSONResponse(content={"items": [], "total": 0, "has_more": False})

    # Step 2: 批量取 rss_entries 详情
    keys = [(str(r[0]), str(r[1])) for r in step1_rows]
    latest_map = {(str(r[0]), str(r[1])): int(r[2] or 0) for r in step1_rows}

    # Build WHERE clause for (source_id, dedup_key) pairs
    pair_placeholders = ",".join(["(?,?)"] * len(keys))
    flat_params = [v for pair in keys for v in pair]

    try:
        entry_rows = conn.execute(
            f"""
            SELECT e.source_id, e.dedup_key, e.title, e.url,
                   e.published_at, e.created_at, e.description
            FROM rss_entries e
            WHERE (e.source_id, e.dedup_key) IN ({pair_placeholders})
            """,
            flat_params,
        ).fetchall()
    except Exception:
        entry_rows = []

    # Fetch source names
    source_ids = list(set(str(r[0]) for r in entry_rows if r[0]))
    source_names = _fetch_source_names(conn, source_ids)

    # Build a lookup by (source_id, dedup_key)
    entry_map: Dict[tuple, Any] = {}
    for r in entry_rows:
        k = (str(r[0]), str(r[1]))
        entry_map[k] = r

    # Assemble items in Step 1 order (already sorted by latest DESC)
    items: List[Dict[str, Any]] = []
    for source_id, dedup_key in keys:
        k = (source_id, dedup_key)
        r = entry_map.get(k)
        if not r:
            continue
        title = str(r[2] or "").strip()
        url = str(r[3] or "").strip()
        if not url:
            continue
        published_at = int(r[4] or 0)
        created_at = int(r[5] or 0)
        description = str(r[6] or "").strip()
        sname = source_names.get(source_id, "")

        items.append({
            "source_id": source_id,
            "source_name": sname,
            "title": title or url,
            "url": url,
            "published_at": published_at,
            "created_at": created_at,
            "description": description,
            "tag_latest": latest_map.get(k, 0),
        })

    return UnicodeJSONResponse(
        content={"items": items, "total": len(items), "has_more": has_more},
        headers={"Cache-Control": "public, max-age=30"},
    )
