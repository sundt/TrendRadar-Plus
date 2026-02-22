"""
Category Timeline Routes

通用分类时间线 API 端点。
支持精选公众号和财经投资等栏目的时间线模式展示。
"""

import time
from typing import Any, Dict, List

from fastapi import APIRouter, Query

from hotnews.web.deps import (
    UnicodeJSONResponse,
    get_online_db,
    rss_row_to_item,
)

router = APIRouter()


# ---------------------------------------------------------------------------
# 精选公众号 Timeline
# ---------------------------------------------------------------------------

@router.get("/api/rss/featured-mps/timeline")
async def api_featured_mps_timeline(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """精选公众号时间线 - 所有精选公众号文章按发布时间倒序排列。"""
    conn = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)

    fetch_limit = off + lim + 200  # fetch extra for dedup

    try:
        cur = conn.execute(
            """
            SELECT a.fakeid, a.title, a.url, a.publish_time,
                   COALESCE(m.nickname, a.fakeid) as nickname
            FROM wechat_mp_articles a
            JOIN featured_wechat_mps m
              ON m.fakeid = a.fakeid AND m.enabled = 1
              AND (m.source IS NULL OR m.source = 'admin')
            WHERE a.title IS NOT NULL AND a.title != ''
              AND a.url IS NOT NULL AND a.url != ''
            ORDER BY a.publish_time DESC
            LIMIT ?
            """,
            (fetch_limit,),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    seen_urls: set = set()
    seen_titles: set = set()
    items_all: List[Dict[str, Any]] = []

    for r in rows:
        fakeid = str(r[0] or "").strip()
        title = str(r[1] or "").strip()
        url = str(r[2] or "").strip()
        publish_time = int(r[3] or 0)
        nickname = str(r[4] or "").strip()

        if not url or url in seen_urls:
            continue
        title_key = title.lower()
        if title_key and title_key in seen_titles:
            continue

        seen_urls.add(url)
        if title_key:
            seen_titles.add(title_key)

        it = rss_row_to_item(
            platform_id=f"mp-{fakeid}",
            source_id=f"mp-{fakeid}",
            source_name=nickname,
            title=title,
            url=url,
            created_at=publish_time,
        )
        it["published_at"] = publish_time
        items_all.append(it)

    sliced = items_all[off:off + lim]
    return UnicodeJSONResponse(
        content={
            "offset": off,
            "limit": lim,
            "items": sliced,
            "total_returned": len(sliced),
        }
    )


# ---------------------------------------------------------------------------
# 财经投资 Timeline
# ---------------------------------------------------------------------------

@router.get("/api/rss/finance/timeline")
async def api_finance_timeline(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """财经投资时间线 - finance 分类下所有数据源按发布时间倒序排列。"""
    conn = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)

    fetch_limit = off + lim + 200

    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                   COALESCE(s.name, e.source_id) as source_name
            FROM rss_entries e
            JOIN rss_sources s ON s.id = e.source_id
            WHERE s.category = 'finance'
              AND s.enabled = 1
              AND e.published_at > 0
              AND e.title IS NOT NULL AND e.title != ''
            ORDER BY e.published_at DESC, e.id DESC
            LIMIT ?
            """,
            (fetch_limit,),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    seen_urls: set = set()
    seen_titles: set = set()
    items_all: List[Dict[str, Any]] = []

    for r in rows:
        sid = str(r[0] or "").strip()
        title = str(r[1] or "").strip()
        url = str(r[2] or "").strip()
        created_at = int(r[3] or 0)
        published_at = int(r[4] or 0)
        sname = str(r[5] or "").strip()

        if not url or url in seen_urls:
            continue
        title_key = title.lower()
        if title_key and title_key in seen_titles:
            continue

        seen_urls.add(url)
        if title_key:
            seen_titles.add(title_key)

        it = rss_row_to_item(
            platform_id=f"rss-{sid}",
            source_id=sid,
            source_name=sname,
            title=title,
            url=url,
            created_at=created_at,
        )
        it["published_at"] = published_at
        items_all.append(it)

    sliced = items_all[off:off + lim]
    return UnicodeJSONResponse(
        content={
            "offset": off,
            "limit": lim,
            "items": sliced,
            "total_returned": len(sliced),
        }
    )
