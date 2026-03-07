"""
Category Timeline Routes

通用分类时间线 API 端点。
支持精选公众号和财经投资等栏目的时间线模式展示。
"""

import time
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Query, Request

from hotnews.web.deps import (
    UnicodeJSONResponse,
    get_online_db,
    get_user_db,
    resolve_anon_user_id,
    rss_row_to_item,
)

router = APIRouter()


SESSION_COOKIE_NAME = "hotnews_session"


def _resolve_user_id(request: Request) -> Optional[int]:
    """Resolve user ID from session cookie (logged-in) or rss_uid cookie (anon).

    Topic and my-tags timelines require a user identity.  Logged-in users
    authenticate via ``hotnews_session`` cookie; anonymous users via
    ``rss_uid``.  Try session first, then fall back to anon cookie.
    """
    # 1) Session-based (logged-in user)
    session_token = (request.cookies.get(SESSION_COOKIE_NAME) or "").strip()
    if session_token:
        try:
            from hotnews.kernel.auth.auth_service import validate_session
            conn = get_user_db()
            is_valid, user_info = validate_session(conn, session_token)
            if is_valid and user_info:
                return user_info.get("id")
        except Exception:
            pass

    # 2) Anon cookie fallback
    return resolve_anon_user_id(request)


# ---------------------------------------------------------------------------
# 精选公众号 Timeline
# ---------------------------------------------------------------------------

@router.get("/api/rss/featured-mps/timeline")
async def api_featured_mps_timeline(
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    """精选公众号时间线 - 仅 admin 添加的精选公众号文章，按发布时间倒序。

    文章存储在 rss_entries 表中，source_id 格式为 mp-{fakeid}。
    只包含 featured_wechat_mps 中 source IS NULL OR source = 'admin' 的公众号。
    """
    conn = get_online_db()
    lim = min(int(limit or 50), 5000)
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

def _get_finance_source_ids(conn) -> tuple:
    """获取所有财经分类的源 ID 及名称映射（rss_sources + custom_sources）。"""
    source_ids: list = []
    name_map: dict = {}  # source_id → name

    # RSS sources
    try:
        cur = conn.execute(
            "SELECT id, name FROM rss_sources WHERE category = 'finance' AND enabled = 1"
        )
        for r in cur.fetchall():
            sid = str(r[0] or "").strip()
            if sid:
                source_ids.append(sid)
                name_map[sid] = str(r[1] or "").strip()
    except Exception:
        pass

    # Custom sources
    try:
        cur = conn.execute(
            "SELECT id, name FROM custom_sources WHERE category = 'finance' AND enabled = 1"
        )
        for r in cur.fetchall():
            sid = str(r[0] or "").strip()
            if sid:
                source_ids.append(sid)
                name_map[sid] = str(r[1] or "").strip()
    except Exception:
        pass

    return source_ids, name_map


@router.get("/api/rss/finance/timeline")
async def api_finance_timeline(
    limit: int = Query(50, ge=1, le=5000),
    offset: int = Query(0, ge=0),
    nofilter: int = Query(0, ge=0, le=1),
):
    """财经投资时间线 - 包含 rss_sources 和 custom_sources 中 category='finance' 的所有源。

    过滤策略（nofilter=0，默认）：
    - 有 AI 标注的文章：排除被 AI 标为 exclude 且无财经标签的
    - 未被 AI 标注的文章：保留（来源本身是财经源）
    - 有财经相关标签的文章：优先保留

    nofilter=1 时跳过 AI 过滤，返回所有财经源文章（用于卡片模式）。
    """
    conn = get_online_db()
    lim = min(int(limit or 50), 5000)
    off = int(offset or 0)
    skip_filter = bool(nofilter)

    source_ids, name_map = _get_finance_source_ids(conn)
    if not source_ids:
        return UnicodeJSONResponse(
            content={"offset": off, "limit": lim, "items": [], "total_returned": 0}
        )

    ph = ",".join(["?"] * len(source_ids))

    if skip_filter:
        # Card mode: no AI filtering, just return all finance source articles
        fetch_limit = off + lim + 200
        try:
            cur = conn.execute(
                f"""
                SELECT e.source_id, e.title, e.url, e.created_at, e.published_at
                FROM rss_entries e
                WHERE e.source_id IN ({ph})
                  AND e.published_at > 0
                  AND e.title IS NOT NULL AND e.title != ''
                  AND e.url IS NOT NULL AND e.url != ''
                ORDER BY e.published_at DESC
                LIMIT ?
                """,
                (*source_ids, fetch_limit),
            )
            rows = cur.fetchall() or []
        except Exception:
            rows = []

        seen_urls: set = set()
        seen_titles: set = set()
        items_nf: List[Dict[str, Any]] = []

        for r in rows:
            sid = str(r[0] or "").strip()
            title = str(r[1] or "").strip()
            url = str(r[2] or "").strip()
            created_at = int(r[3] or 0)
            published_at = int(r[4] or 0)
            sname = name_map.get(sid, sid)

            if not url or url in seen_urls:
                continue
            tk = title.lower()
            if tk and tk in seen_titles:
                continue
            seen_urls.add(url)
            if tk:
                seen_titles.add(tk)

            it = rss_row_to_item(
                platform_id=f"rss-{sid}" if not sid.startswith("custom_") else sid,
                source_id=sid,
                source_name=sname,
                title=title,
                url=url,
                created_at=created_at,
            )
            it["published_at"] = published_at
            items_nf.append(it)

        sliced_nf = items_nf[off:off + lim]
        return UnicodeJSONResponse(
            content={"offset": off, "limit": lim, "items": sliced_nf, "total_returned": len(sliced_nf)}
        )

    # 使用统一 AI 过滤模块
    from .ai_filter import apply_ai_filter

    fetch_limit = (off + lim) * 3 + 500  # fetch more to compensate for filtering

    try:
        cur = conn.execute(
            f"""
            SELECT e.source_id, e.dedup_key, e.title, e.url,
                   e.created_at, e.published_at
            FROM rss_entries e
            WHERE e.source_id IN ({ph})
              AND e.published_at > 0
              AND e.title IS NOT NULL AND e.title != ''
            ORDER BY e.published_at DESC, e.id DESC
            LIMIT ?
            """,
            (*source_ids, fetch_limit),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    seen_urls: set = set()
    seen_titles: set = set()
    items_all: List[Dict[str, Any]] = []

    for r in rows:
        sid = str(r[0] or "").strip()
        dk = str(r[1] or "").strip()
        title = str(r[2] or "").strip()
        url = str(r[3] or "").strip()
        created_at = int(r[4] or 0)
        published_at = int(r[5] or 0)
        sname = name_map.get(sid, sid)

        if not url or url in seen_urls:
            continue
        title_key = title.lower()
        if title_key and title_key in seen_titles:
            continue
        seen_urls.add(url)
        if title_key:
            seen_titles.add(title_key)

        it = rss_row_to_item(
            platform_id=f"rss-{sid}" if not sid.startswith("custom_") else sid,
            source_id=sid,
            source_name=sname,
            title=title,
            url=url,
            created_at=created_at,
        )
        it["published_at"] = published_at
        it["source_id"] = sid
        it["dedup_key"] = dk
        items_all.append(it)

    # 调用统一 AI 过滤
    filtered_items, _stats = apply_ai_filter(items_all, "finance", conn)

    sliced = filtered_items[off:off + lim]
    return UnicodeJSONResponse(
        content={
            "offset": off,
            "limit": lim,
            "items": sliced,
            "total_returned": len(sliced),
        }
    )


# ---------------------------------------------------------------------------
# OpenClaw Timeline
# ---------------------------------------------------------------------------

@router.get("/api/rss/openclaw/timeline")
async def api_openclaw_timeline(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    """OpenClaw 时间线 - 标题包含 openclaw 关键词的所有文章按发布时间倒序。"""
    conn = get_online_db()
    lim = min(int(limit or 50), 500)
    off = int(offset or 0)

    fetch_limit = off + lim + 200

    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                   COALESCE(s.name, cs.name, e.source_id) as source_name
            FROM rss_entries e
            LEFT JOIN rss_sources s ON s.id = e.source_id
            LEFT JOIN custom_sources cs ON cs.id = e.source_id
            WHERE (LOWER(e.title) LIKE '%openclaw%')
              AND e.published_at > 0
              AND e.title IS NOT NULL AND e.title != ''
              AND e.url IS NOT NULL AND e.url != ''
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
            platform_id=f"rss-{sid}" if not sid.startswith("custom_") else sid,
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
    user_id = _resolve_user_id(request)
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
    user_id = _resolve_user_id(request)
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
