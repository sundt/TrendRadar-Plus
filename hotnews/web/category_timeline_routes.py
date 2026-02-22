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
    """财经投资时间线 - 过滤非财经内容，类似每日AI早报的过滤逻辑。

    过滤策略：
    - 有 AI 标注的文章：排除被 AI 标为 exclude 且无财经标签的
    - 未被 AI 标注的文章：保留（来源本身是财经源）
    - 有财经相关标签的文章：优先保留
    """
    conn = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)

    # 财经相关标签白名单
    finance_tags = {
        "finance", "stock", "macro", "crypto", "real_estate",
        "ecommerce", "startup", "business", "commodity",
        "ipo", "gold_price", "insurance", "banking",
    }
    # AI category 白名单（大小写不敏感）
    finance_categories = {"finance", "business"}

    fetch_limit = (off + lim) * 3 + 500  # fetch more to compensate for filtering

    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.dedup_key, e.title, e.url,
                   e.created_at, e.published_at,
                   COALESCE(s.name, e.source_id) as source_name,
                   l.action, l.score, l.confidence, LOWER(COALESCE(l.category, '')) as ai_cat,
                   GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids
            FROM rss_entries e
            JOIN rss_sources s ON s.id = e.source_id
            LEFT JOIN rss_entry_ai_labels l
              ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
            LEFT JOIN rss_entry_tags t
              ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
            WHERE s.category = 'finance'
              AND s.enabled = 1
              AND e.published_at > 0
              AND e.title IS NOT NULL AND e.title != ''
            GROUP BY e.source_id, e.dedup_key
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
        title = str(r[2] or "").strip()
        url = str(r[3] or "").strip()
        created_at = int(r[4] or 0)
        published_at = int(r[5] or 0)
        sname = str(r[6] or "").strip()
        ai_action = str(r[7] or "").strip().lower()
        ai_score = int(r[8] or 0)
        ai_confidence = float(r[9] or 0.0)
        ai_cat = str(r[10] or "").strip().lower()
        tag_ids_str = str(r[11] or "").strip()

        if not url or url in seen_urls:
            continue
        title_key = title.lower()
        if title_key and title_key in seen_titles:
            continue

        # Parse tags
        tag_ids = set(
            t.strip().lower() for t in tag_ids_str.split(",") if t.strip()
        ) if tag_ids_str else set()

        has_finance_tag = bool(tag_ids.intersection(finance_tags))
        has_ai_label = bool(ai_action)

        # Filtering logic:
        if has_ai_label:
            if ai_action == "exclude":
                # Excluded by AI - only keep if it has a finance tag
                if not has_finance_tag:
                    continue
            elif ai_action == "include":
                # Included by AI - keep if it has finance tag OR finance category
                if not has_finance_tag and ai_cat not in finance_categories:
                    continue
        # No AI label → keep (source is finance, benefit of the doubt)

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
