"""
Category Timeline Routes

通用分类时间线 API 端点。
支持精选公众号和财经投资等栏目的时间线模式展示。
"""

import time
from typing import Any, Dict, List

from fastapi import APIRouter, Query, Request

from hotnews.web.deps import (
    UnicodeJSONResponse,
    get_online_db,
    get_user_db,
    resolve_anon_user_id,
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
    """精选公众号时间线 - 仅 admin 添加的精选公众号文章，按发布时间倒序。

    文章存储在 rss_entries 表中，source_id 格式为 mp-{fakeid}。
    只包含 featured_wechat_mps 中 source IS NULL OR source = 'admin' 的公众号。
    """
    conn = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)

    fetch_limit = off + lim + 200

    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                   COALESCE(m.nickname, e.source_id) as source_name
            FROM rss_entries e
            JOIN featured_wechat_mps m
              ON e.source_id = 'mp-' || m.fakeid
              AND m.enabled = 1
              AND (m.source IS NULL OR m.source = 'admin')
            WHERE e.title IS NOT NULL AND e.title != ''
              AND e.url IS NOT NULL AND e.url != ''
              AND e.published_at > 0
            ORDER BY e.published_at DESC
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
        nickname = str(r[5] or "").strip()

        if not url or url in seen_urls:
            continue
        title_key = title.lower()
        if title_key and title_key in seen_titles:
            continue

        seen_urls.add(url)
        if title_key:
            seen_titles.add(title_key)

        it = rss_row_to_item(
            platform_id=sid,
            source_id=sid,
            source_name=nickname,
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


# ---------------------------------------------------------------------------
# 通用分类 Timeline（普通分类如 tech_news, ainews, social 等）
# ---------------------------------------------------------------------------

@router.get("/api/rss/category/{category_id}/timeline")
async def api_category_timeline(
    category_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """通用分类时间线 - 指定分类下所有文章按发布时间倒序。"""
    conn = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)
    cat = (category_id or "").strip()
    if not cat:
        return UnicodeJSONResponse(content={"offset": 0, "limit": lim, "items": [], "total_returned": 0})

    fetch_limit = off + lim + 200

    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                   COALESCE(s.name, e.source_id) as source_name
            FROM rss_entries e
            JOIN rss_sources s ON s.id = e.source_id
            WHERE s.category = ?
              AND s.enabled = 1
              AND e.published_at > 0
              AND e.title IS NOT NULL AND e.title != ''
              AND e.url IS NOT NULL AND e.url != ''
            ORDER BY e.published_at DESC
            LIMIT ?
            """,
            (cat, fetch_limit),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    seen_urls: set = set()
    seen_titles: set = set()
    items: List[Dict[str, Any]] = []

    for r in rows:
        sid = str(r[0] or "").strip()
        title = str(r[1] or "").strip()
        url = str(r[2] or "").strip()
        created_at = int(r[3] or 0)
        published_at = int(r[4] or 0)
        sname = str(r[5] or "").strip()

        if not url or url in seen_urls:
            continue
        tk = title.lower()
        if tk and tk in seen_titles:
            continue
        seen_urls.add(url)
        if tk:
            seen_titles.add(tk)

        it = rss_row_to_item(
            platform_id=f"rss-{sid}",
            source_id=sid,
            source_name=sname,
            title=title,
            url=url,
            created_at=created_at,
        )
        it["published_at"] = published_at
        items.append(it)

    sliced = items[off:off + lim]
    return UnicodeJSONResponse(
        content={"offset": off, "limit": lim, "items": sliced, "total_returned": len(sliced)}
    )


# ---------------------------------------------------------------------------
# 我的关注 Timeline
# ---------------------------------------------------------------------------

@router.get("/api/rss/my-tags/timeline")
async def api_my_tags_timeline(
    request: Request,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """我的关注时间线 - 用户关注的标签/源/关键词/公众号的所有文章按时间倒序。"""
    user_id = resolve_anon_user_id(request)
    if not user_id:
        return UnicodeJSONResponse(content={"offset": 0, "limit": 0, "items": [], "total_returned": 0, "needsAuth": True})

    conn = get_user_db()
    online = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)

    # Gather all source_ids the user follows
    source_ids: set = set()

    # 1) Followed tags → find matching source_ids via rss_entry_tags
    tag_cur = conn.execute(
        "SELECT tag_id FROM user_tag_settings WHERE user_id = ? AND preference = 'follow'",
        (user_id,),
    )
    tag_ids = [r[0] for r in (tag_cur.fetchall() or [])]

    # 2) Subscribed sources
    sub_cur = conn.execute(
        "SELECT source_id FROM user_rss_subscriptions WHERE user_id = ?",
        (user_id,),
    )
    for r in sub_cur.fetchall() or []:
        source_ids.add(r[0])

    # 3) WeChat MP subscriptions
    try:
        mp_cur = conn.execute(
            "SELECT fakeid FROM wechat_mp_subscriptions WHERE user_id = ?",
            (user_id,),
        )
        for r in mp_cur.fetchall() or []:
            source_ids.add(f"mp-{r[0]}")
    except Exception:
        pass

    # 4) User keywords
    kw_cur = conn.execute(
        "SELECT keyword FROM user_keywords WHERE user_id = ? AND enabled = 1",
        (user_id,),
    )
    keywords = [r[0] for r in (kw_cur.fetchall() or [])]

    if not tag_ids and not source_ids and not keywords:
        return UnicodeJSONResponse(content={"offset": 0, "limit": lim, "items": [], "total_returned": 0})

    fetch_limit = off + lim + 300
    all_rows = []

    # Fetch from tags
    if tag_ids:
        ph = ",".join(["?"] * len(tag_ids))
        try:
            cur = online.execute(
                f"""
                SELECT DISTINCT e.source_id, e.title, e.url, e.created_at, e.published_at,
                       COALESCE(s.name, e.source_id) as source_name
                FROM rss_entries e
                JOIN rss_entry_tags t ON e.source_id = t.source_id AND e.dedup_key = t.dedup_key
                LEFT JOIN rss_sources s ON s.id = e.source_id
                WHERE t.tag_id IN ({ph})
                  AND e.published_at > 0
                  AND e.title IS NOT NULL AND e.title != ''
                ORDER BY e.published_at DESC
                LIMIT ?
                """,
                (*tag_ids, fetch_limit),
            )
            all_rows.extend(cur.fetchall() or [])
        except Exception:
            pass

    # Fetch from subscribed sources + wechat MPs
    if source_ids:
        ph = ",".join(["?"] * len(source_ids))
        try:
            cur = online.execute(
                f"""
                SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                       COALESCE(s.name, e.source_id) as source_name
                FROM rss_entries e
                LEFT JOIN rss_sources s ON s.id = e.source_id
                WHERE e.source_id IN ({ph})
                  AND e.published_at > 0
                  AND e.title IS NOT NULL AND e.title != ''
                ORDER BY e.published_at DESC
                LIMIT ?
                """,
                (*source_ids, fetch_limit),
            )
            all_rows.extend(cur.fetchall() or [])
        except Exception:
            pass

    # Fetch from keywords
    for kw in keywords[:10]:  # limit to 10 keywords
        try:
            cur = online.execute(
                """
                SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                       COALESCE(s.name, e.source_id) as source_name
                FROM rss_entries e
                LEFT JOIN rss_sources s ON s.id = e.source_id
                WHERE e.title LIKE ?
                  AND e.published_at > 0
                ORDER BY e.published_at DESC
                LIMIT ?
                """,
                (f"%{kw}%", fetch_limit),
            )
            all_rows.extend(cur.fetchall() or [])
        except Exception:
            pass

    # Deduplicate and sort by published_at DESC
    seen_urls: set = set()
    seen_titles: set = set()
    items: List[Dict[str, Any]] = []

    # Sort all rows by published_at DESC
    all_rows.sort(key=lambda r: int(r[4] or 0), reverse=True)

    for r in all_rows:
        sid = str(r[0] or "").strip()
        title = str(r[1] or "").strip()
        url = str(r[2] or "").strip()
        created_at = int(r[3] or 0)
        published_at = int(r[4] or 0)
        sname = str(r[5] or "").strip()

        if not url or url in seen_urls:
            continue
        tk = title.lower()
        if tk and tk in seen_titles:
            continue
        seen_urls.add(url)
        if tk:
            seen_titles.add(tk)

        it = rss_row_to_item(
            platform_id=f"rss-{sid}",
            source_id=sid,
            source_name=sname,
            title=title,
            url=url,
            created_at=created_at,
        )
        it["published_at"] = published_at
        items.append(it)

        if len(items) >= off + lim:
            break

    sliced = items[off:off + lim]
    return UnicodeJSONResponse(
        content={"offset": off, "limit": lim, "items": sliced, "total_returned": len(sliced)}
    )


# ---------------------------------------------------------------------------
# 主题 Timeline
# ---------------------------------------------------------------------------

@router.get("/api/rss/topic/{topic_id}/timeline")
async def api_topic_timeline(
    request: Request,
    topic_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """主题时间线 - 主题关联的关键词和数据源的所有文章按时间倒序。"""
    user_id = resolve_anon_user_id(request)
    if not user_id:
        return UnicodeJSONResponse(content={"offset": 0, "limit": 0, "items": [], "total_returned": 0, "needsAuth": True})

    conn = get_user_db()
    online = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)
    tid = (topic_id or "").strip()

    # Get topic config from topic_configs table
    try:
        cur = conn.execute(
            "SELECT keywords FROM topic_configs WHERE user_id = ? AND id = ?",
            (str(user_id), tid),
        )
        row = cur.fetchone()
    except Exception:
        row = None

    if not row:
        return UnicodeJSONResponse(content={"offset": 0, "limit": lim, "items": [], "total_returned": 0})

    import json as _json

    # Parse keywords (stored as JSON string array)
    try:
        keywords = _json.loads(row[0]) if row[0] else []
    except Exception:
        keywords = []

    # Get RSS source IDs from topic_rss_sources table
    rss_source_ids = []
    try:
        src_cur = conn.execute(
            "SELECT rss_source_id FROM topic_rss_sources WHERE topic_id = ?",
            (tid,),
        )
        rss_source_ids = [r[0] for r in (src_cur.fetchall() or [])]
    except Exception:
        pass

    if not keywords and not rss_source_ids:
        return UnicodeJSONResponse(content={"offset": 0, "limit": lim, "items": [], "total_returned": 0})

    fetch_limit = off + lim + 300
    all_rows = []

    # Fetch from keywords
    for kw in keywords[:20]:
        kw_text = kw if isinstance(kw, str) else ""
        if not kw_text:
            continue
        try:
            cur = online.execute(
                """
                SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                       COALESCE(s.name, e.source_id) as source_name
                FROM rss_entries e
                LEFT JOIN rss_sources s ON s.id = e.source_id
                WHERE e.title LIKE ?
                  AND e.published_at > 0
                  AND e.title IS NOT NULL AND e.title != ''
                ORDER BY e.published_at DESC
                LIMIT ?
                """,
                (f"%{kw_text}%", fetch_limit),
            )
            all_rows.extend(cur.fetchall() or [])
        except Exception:
            pass

    # Fetch from rss sources
    if rss_source_ids:
        ph = ",".join(["?"] * len(rss_source_ids))
        try:
            cur = online.execute(
                f"""
                SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                       COALESCE(s.name, e.source_id) as source_name
                FROM rss_entries e
                LEFT JOIN rss_sources s ON s.id = e.source_id
                WHERE e.source_id IN ({ph})
                  AND e.published_at > 0
                  AND e.title IS NOT NULL AND e.title != ''
                ORDER BY e.published_at DESC
                LIMIT ?
                """,
                (*rss_source_ids, fetch_limit),
            )
            all_rows.extend(cur.fetchall() or [])
        except Exception:
            pass

    # Deduplicate and sort
    seen_urls: set = set()
    seen_titles: set = set()
    items: List[Dict[str, Any]] = []

    all_rows.sort(key=lambda r: int(r[4] or 0), reverse=True)

    for r in all_rows:
        sid = str(r[0] or "").strip()
        title = str(r[1] or "").strip()
        url = str(r[2] or "").strip()
        created_at = int(r[3] or 0)
        published_at = int(r[4] or 0)
        sname = str(r[5] or "").strip()

        if not url or url in seen_urls:
            continue
        tk = title.lower()
        if tk and tk in seen_titles:
            continue
        seen_urls.add(url)
        if tk:
            seen_titles.add(tk)

        it = rss_row_to_item(
            platform_id=f"rss-{sid}",
            source_id=sid,
            source_name=sname,
            title=title,
            url=url,
            created_at=created_at,
        )
        it["published_at"] = published_at
        items.append(it)

        if len(items) >= off + lim:
            break

    sliced = items[off:off + lim]
    return UnicodeJSONResponse(
        content={"offset": off, "limit": lim, "items": sliced, "total_returned": len(sliced)}
    )
