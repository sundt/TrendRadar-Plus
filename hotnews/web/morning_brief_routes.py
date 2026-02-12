"""
Morning Brief Routes

RSS 精选、时间线、数据源等 API 端点。
从 server.py 提取，降低主文件复杂度。
"""

import json
import re
import time
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse

from fastapi import APIRouter, Query, Request, HTTPException

from hotnews.web.deps import (
    UnicodeJSONResponse,
    get_online_db,
    rss_created_at_cutoff,
    rss_row_to_item,
)
from hotnews.web.timeline_cache import brief_timeline_cache

router = APIRouter()


# ---------------------------------------------------------------------------
# Morning Brief rule helpers
# ---------------------------------------------------------------------------


def _mb_default_rules() -> Dict[str, Any]:
    return {
        "enabled": True,
        "drop_published_at_zero": True,
        "category_whitelist_enabled": True,
        "category_whitelist": ["explore", "tech_news", "ainews", "developer", "ai"],
        "topic_keywords": [
            "ai", "llm", "gpt", "agent", "rag", "diffusion", "transformer",
            "multimodal", "openai", "anthropic", "deepmind",
            "人工智能", "大模型", "机器学习", "深度学习", "多模态", "微调",
            "推理", "训练", "开源", "模型", "芯片", "gpu", "cuda",
            "数据库", "安全", "云原生", "kubernetes", "容器", "编程", "系统设计",
        ],
        "depth_keywords": [
            "architecture", "benchmark", "inference", "training", "evaluation",
            "paper", "open-source", "quantization", "fine-tune", "optimization",
            "性能", "评测", "论文", "架构", "工程", "优化",
        ],
        "negative_hard": ["casino", "gambling", "betting"],
        "negative_soft": ["roundup", "weekly", "top 10", "listicle", "beginner"],
        "negative_exempt_domains": [],
        "source_scores": {},
        "source_decay": {"second": 0.6, "third_plus": 0.3},
        "overrides": {"force_top": [], "force_blacklist": []},
        "tag_whitelist_enabled": True,
        "tag_whitelist": ["ai_ml"],
    }


def _mb_ensure_admin_kv(conn) -> None:
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS admin_kv (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )
            """
        )
        conn.commit()
    except Exception:
        return


def _mb_load_rules(conn) -> Dict[str, Any]:
    rules = _mb_default_rules()
    try:
        _mb_ensure_admin_kv(conn)
        cur = conn.execute("SELECT value FROM admin_kv WHERE key = ? LIMIT 1", ("morning_brief_rules_v1",))
        row = cur.fetchone()
        raw = str(row[0] or "") if row else ""
        if raw.strip():
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                rules = {**rules, **parsed}
    except Exception:
        pass

    try:
        rules["enabled"] = bool(rules.get("enabled", True))
    except Exception:
        rules["enabled"] = True
    try:
        rules["drop_published_at_zero"] = bool(rules.get("drop_published_at_zero", True))
    except Exception:
        rules["drop_published_at_zero"] = True
    try:
        rules["category_whitelist_enabled"] = bool(rules.get("category_whitelist_enabled", True))
    except Exception:
        rules["category_whitelist_enabled"] = True
    cw = rules.get("category_whitelist")
    if not isinstance(cw, list):
        rules["category_whitelist"] = ["explore", "tech_news", "ainews", "developer", "ai"]
    else:
        rules["category_whitelist"] = [str(x or "").strip().lower() for x in cw if str(x or "").strip()]
    try:
        rules["tag_whitelist_enabled"] = bool(rules.get("tag_whitelist_enabled", True))
    except Exception:
        rules["tag_whitelist_enabled"] = True
    tw = rules.get("tag_whitelist")
    if not isinstance(tw, list):
        rules["tag_whitelist"] = ["ai_ml"]
    else:
        rules["tag_whitelist"] = [str(x or "").strip().lower() for x in tw if str(x or "").strip()]
    for k in ("topic_keywords", "depth_keywords", "negative_hard", "negative_soft", "negative_exempt_domains"):
        v = rules.get(k)
        if not isinstance(v, list):
            rules[k] = []
        else:
            rules[k] = [str(x or "").strip() for x in v if str(x or "").strip()]
    if not isinstance(rules.get("source_scores"), dict):
        rules["source_scores"] = {}
    if not isinstance(rules.get("overrides"), dict):
        rules["overrides"] = {"force_top": [], "force_blacklist": []}
    else:
        ov = rules.get("overrides") or {}
        ft = ov.get("force_top")
        fb = ov.get("force_blacklist")
        rules["overrides"] = {
            "force_top": [str(x or "").strip() for x in (ft if isinstance(ft, list) else []) if str(x or "").strip()],
            "force_blacklist": [str(x or "").strip() for x in (fb if isinstance(fb, list) else []) if str(x or "").strip()],
        }
    if not isinstance(rules.get("source_decay"), dict):
        rules["source_decay"] = {"second": 0.6, "third_plus": 0.3}
    else:
        sd = rules.get("source_decay") or {}
        try:
            rules["source_decay"] = {
                "second": float(sd.get("second", 0.6)),
                "third_plus": float(sd.get("third_plus", 0.3)),
            }
        except Exception:
            rules["source_decay"] = {"second": 0.6, "third_plus": 0.3}
    return rules


def _mb_ai_enabled() -> bool:
    return True


def _mb_extract_domain(url: str) -> str:
    try:
        return (urlparse(str(url or "")).hostname or "").strip().lower()
    except Exception:
        return ""


def _mb_norm_text(s: str) -> str:
    try:
        return re.sub(r"\s+", " ", str(s or "").lower()).strip()
    except Exception:
        return str(s or "").strip().lower()


def _mb_is_ascii_word(kw: str) -> bool:
    s = str(kw or "").strip()
    if not s:
        return False
    return all(("a" <= ch <= "z") or ("0" <= ch <= "9") or (ch in {"-", "_"}) for ch in s.lower())


def _mb_kw_hit(text_norm: str, kw_raw: str) -> bool:
    kw = _mb_norm_text(kw_raw)
    if not kw:
        return False
    if _mb_is_ascii_word(kw):
        try:
            return re.search(rf"\\b{re.escape(kw)}\\b", text_norm) is not None
        except Exception:
            return kw in text_norm
    return kw in text_norm


def _mb_eval(
    *,
    rules: Dict[str, Any],
    source_id: str,
    source_name: str,
    title: str,
    url: str,
) -> Tuple[bool, float]:
    u = str(url or "").strip()
    if not u:
        return False, 0.0
    enabled = bool(rules.get("enabled", True))
    if not enabled:
        return True, 0.0
    domain = _mb_extract_domain(u)
    text_norm = _mb_norm_text(" ".join([title or "", source_name or "", domain]))
    ov = rules.get("overrides") or {}
    force_top = set([str(x or "").strip() for x in (ov.get("force_top") or [])])
    force_black = set([str(x or "").strip() for x in (ov.get("force_blacklist") or [])])
    if u in force_black:
        return False, 0.0
    if u in force_top:
        return True, 999.0
    exempt_domains = set([str(x or "").strip().lower() for x in (rules.get("negative_exempt_domains") or [])])
    is_exempt = (domain in exempt_domains) if domain else False
    for kw in rules.get("negative_hard") or []:
        if not is_exempt and _mb_kw_hit(text_norm, kw):
            return False, 0.0
    topic_hits = 0
    for kw in rules.get("topic_keywords") or []:
        if _mb_kw_hit(text_norm, kw):
            topic_hits += 1
            break
    if topic_hits <= 0:
        return False, 0.0
    score = 0.0
    src_scores = rules.get("source_scores") or {}
    sid = str(source_id or "").strip()
    if sid and sid in src_scores:
        try:
            score += float(src_scores.get(sid) or 0.0)
        except Exception:
            pass
    if domain and domain in src_scores:
        try:
            score += float(src_scores.get(domain) or 0.0)
        except Exception:
            pass
    score += float(topic_hits) * 15.0
    depth_hits = 0
    for kw in rules.get("depth_keywords") or []:
        if _mb_kw_hit(text_norm, kw):
            depth_hits += 1
    score += float(depth_hits) * 10.0
    soft_hits = 0
    for kw in rules.get("negative_soft") or []:
        if not is_exempt and _mb_kw_hit(text_norm, kw):
            soft_hits += 1
    score -= float(soft_hits) * 20.0
    return True, score


# ---------------------------------------------------------------------------
# Route endpoints
# ---------------------------------------------------------------------------


@router.get("/api/rss/brief/latest")
async def api_rss_brief_latest(
    since: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
):
    """API: RSS 每刻上新（增量）。"""
    conn = get_online_db()
    s = int(since or 0)
    lim = int(limit or 50)
    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, COALESCE(s.name, '')
            FROM rss_entries e
            LEFT JOIN rss_sources s ON s.id = e.source_id
            WHERE e.created_at > ?
            ORDER BY e.created_at ASC, e.id ASC
            LIMIT ?
            """,
            (s, lim),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    rules = _mb_load_rules(conn)
    items: List[Dict[str, Any]] = []
    next_since = s
    for r in rows:
        sid = str(r[0] or "").strip()
        title = str(r[1] or "")
        url = str(r[2] or "")
        created_at = int(r[3] or 0)
        sname = str(r[4] or "")
        if not url.strip():
            continue
        ok, _ = _mb_eval(rules=rules, source_id=sid, source_name=sname, title=title, url=url)
        if not ok:
            continue
        pid = f"rss-{sid}" if sid else "rss-unknown"
        items.append(
            rss_row_to_item(
                platform_id=pid, source_id=sid, source_name=sname,
                title=title, url=url, created_at=created_at,
            )
        )
        if created_at > next_since:
            next_since = created_at

    return UnicodeJSONResponse(
        content={
            "since": s,
            "next_since": next_since,
            "items": items,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@router.get("/api/rss/brief/curated")
async def api_rss_brief_curated(
    hours: int = Query(48, ge=1, le=24 * 7),
    limit: int = Query(20, ge=1, le=200),
):
    """API: RSS 24h 精选（URL 去重）。"""
    conn = get_online_db()
    cutoff = rss_created_at_cutoff(hours=hours)
    lim = int(limit or 30)
    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, COALESCE(s.name, '')
            FROM rss_entries e
            LEFT JOIN rss_sources s ON s.id = e.source_id
            WHERE e.created_at >= ?
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT 4000
            """,
            (cutoff,),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    rules = _mb_load_rules(conn)
    by_url: Dict[str, Dict[str, Any]] = {}
    for r in rows:
        sid = str(r[0] or "").strip()
        title = str(r[1] or "")
        url = str(r[2] or "")
        created_at = int(r[3] or 0)
        sname = str(r[4] or "")
        u = url.strip()
        if not u:
            continue
        ok, score = _mb_eval(rules=rules, source_id=sid, source_name=sname, title=title, url=u)
        if not ok:
            continue
        prev = by_url.get(u)
        cur_item = {
            "source_id": sid, "source_name": sname, "title": title,
            "url": u, "created_at": created_at, "_mb_score": float(score),
        }
        if prev is None:
            by_url[u] = cur_item
        else:
            try:
                if float(cur_item.get("_mb_score") or 0.0) > float(prev.get("_mb_score") or 0.0):
                    by_url[u] = cur_item
            except Exception:
                pass

    prelim = list(by_url.values())
    prelim.sort(key=lambda x: (float(x.get("_mb_score") or 0.0), int(x.get("created_at") or 0)), reverse=True)

    sd = rules.get("source_decay") or {}
    try:
        decay_second = float(sd.get("second", 0.6))
        decay_third = float(sd.get("third_plus", 0.3))
    except Exception:
        decay_second = 0.6
        decay_third = 0.3

    per_source: Dict[str, int] = {}
    for it in prelim:
        sid = str(it.get("source_id") or "").strip()
        c = int(per_source.get(sid, 0) or 0) + 1
        per_source[sid] = c
        factor = 1.0
        if c == 2:
            factor = decay_second
        elif c >= 3:
            factor = decay_third
        it["_mb_final"] = float(it.get("_mb_score") or 0.0) * float(factor)

    prelim.sort(key=lambda x: (float(x.get("_mb_final") or 0.0), int(x.get("created_at") or 0)), reverse=True)

    items: List[Dict[str, Any]] = []
    for it in prelim[:lim]:
        sid = str(it.get("source_id") or "").strip()
        sname = str(it.get("source_name") or "")
        title = str(it.get("title") or "")
        u = str(it.get("url") or "")
        created_at = int(it.get("created_at") or 0)
        pid = f"rss-{sid}" if sid else "rss-unknown"
        row_item = rss_row_to_item(
            platform_id=pid, source_id=sid, source_name=sname,
            title=title, url=u, created_at=created_at,
        )
        try:
            row_item["score"] = float(it.get("_mb_final") or 0.0)
        except Exception:
            pass
        items.append(row_item)

    return UnicodeJSONResponse(
        content={
            "hours": int(hours),
            "items": items,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@router.get("/api/rss/brief/timeline")
async def api_rss_brief_timeline(
    limit: int = Query(150, ge=1, le=500),
    offset: int = Query(0, ge=0, le=5000),
    drop_published_at_zero: Optional[int] = Query(None),
):
    """API: Morning Brief unified timeline, ordered by published_at DESC only."""
    conn = get_online_db()
    rules = _mb_load_rules(conn)

    lim = int(limit or 150)
    if lim > 2000:
        lim = 2000
    off = int(offset or 0)

    drop_zero = bool(rules.get("drop_published_at_zero", True))
    if drop_published_at_zero is not None:
        drop_zero = int(drop_published_at_zero or 0) == 1

    ai_mode = _mb_ai_enabled()
    raw_fetch = max(5000, int((off + lim) * 20))
    raw_fetch = min(10000, raw_fetch)

    category_whitelist_enabled = bool(rules.get("category_whitelist_enabled", True))
    category_whitelist = set(rules.get("category_whitelist") or [])
    tag_whitelist_enabled = bool(rules.get("tag_whitelist_enabled", True))
    tag_whitelist = set(rules.get("tag_whitelist") or [])

    cache_config = {
        "drop_zero": drop_zero,
        "ai_mode": ai_mode,
        "rules_hash": hash(str(sorted(rules.items()))),
        "category_whitelist": tuple(sorted(category_whitelist)),
        "tag_whitelist": tuple(sorted(tag_whitelist)),
    }

    cached_items = brief_timeline_cache.get(cache_config)
    if cached_items is not None:
        sliced = cached_items[off:off + lim]
        return UnicodeJSONResponse(
            content={
                "offset": int(off), "limit": int(lim),
                "drop_published_at_zero": bool(drop_zero),
                "ai_enabled": bool(ai_mode),
                "category_whitelist_enabled": bool(category_whitelist_enabled),
                "category_whitelist": list(category_whitelist),
                "tag_whitelist_enabled": bool(tag_whitelist_enabled),
                "tag_whitelist": list(tag_whitelist),
                "items": sliced,
                "total_candidates": int(len(cached_items)),
                "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                "cached": True,
            }
        )

    try:
        if ai_mode:
            if drop_zero:
                cur = conn.execute(
                    """
                    SELECT DISTINCT e.source_id, e.dedup_key, e.title, e.url, e.created_at, e.published_at,
                           COALESCE(s.name, ''), COALESCE(s.category, ''),
                           GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids
                    FROM rss_entries e
                    JOIN rss_entry_ai_labels l ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
                    LEFT JOIN rss_sources s ON s.id = e.source_id
                    LEFT JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
                    WHERE e.published_at > 0 AND l.action = 'include' AND l.score >= 75 AND l.confidence >= 0.70
                    GROUP BY e.source_id, e.dedup_key
                    ORDER BY e.published_at DESC, e.id DESC
                    LIMIT ?
                    """,
                    (raw_fetch,),
                )
            else:
                cur = conn.execute(
                    """
                    SELECT DISTINCT e.source_id, e.dedup_key, e.title, e.url, e.created_at, e.published_at,
                           COALESCE(s.name, ''), COALESCE(s.category, ''),
                           GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids
                    FROM rss_entries e
                    JOIN rss_entry_ai_labels l ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
                    LEFT JOIN rss_sources s ON s.id = e.source_id
                    LEFT JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
                    WHERE l.action = 'include' AND l.score >= 75 AND l.confidence >= 0.70
                    GROUP BY e.source_id, e.dedup_key
                    ORDER BY e.published_at DESC, e.id DESC
                    LIMIT ?
                    """,
                    (raw_fetch,),
                )
        else:
            if drop_zero:
                cur = conn.execute(
                    """
                    SELECT DISTINCT e.source_id, e.title, e.url, e.created_at, e.published_at,
                           COALESCE(s.name, ''), COALESCE(s.category, ''),
                           GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids
                    FROM rss_entries e
                    LEFT JOIN rss_sources s ON s.id = e.source_id
                    LEFT JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
                    WHERE e.published_at > 0
                    GROUP BY e.source_id, e.dedup_key
                    ORDER BY e.published_at DESC, e.id DESC
                    LIMIT ?
                    """,
                    (raw_fetch,),
                )
            else:
                cur = conn.execute(
                    """
                    SELECT DISTINCT e.source_id, e.title, e.url, e.created_at, e.published_at,
                           COALESCE(s.name, ''), COALESCE(s.category, ''),
                           GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids
                    FROM rss_entries e
                    LEFT JOIN rss_sources s ON s.id = e.source_id
                    LEFT JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
                    GROUP BY e.source_id, e.dedup_key
                    ORDER BY e.published_at DESC, e.id DESC
                    LIMIT ?
                    """,
                    (raw_fetch,),
                )
        rows = cur.fetchall() or []
    except Exception:
        import traceback
        traceback.print_exc()
        rows = []

    MIN_TIMESTAMP = 946684800
    MAX_TIMESTAMP = int(time.time()) + (7 * 24 * 60 * 60)

    items_all: List[Dict[str, Any]] = []
    seen_urls = set()
    seen_titles = set()
    for r in rows:
        if ai_mode:
            sid, title, url = str(r[0] or "").strip(), str(r[2] or ""), str(r[3] or "")
            created_at, published_at = int(r[4] or 0), int(r[5] or 0)
            sname, scategory = str(r[6] or ""), str(r[7] or "").strip().lower()
            tag_ids_str = str(r[8] or "").strip()
        else:
            sid, title, url = str(r[0] or "").strip(), str(r[1] or ""), str(r[2] or "")
            created_at, published_at = int(r[3] or 0), int(r[4] or 0)
            sname, scategory = str(r[5] or ""), str(r[6] or "").strip().lower()
            tag_ids_str = str(r[7] or "").strip()

        tag_ids = set(t.strip().lower() for t in tag_ids_str.split(',') if t.strip()) if tag_ids_str else set()

        u = url.strip()
        if not u or u in seen_urls:
            continue
        title_normalized = title.strip().lower()
        if title_normalized and title_normalized in seen_titles:
            continue
        if drop_zero and published_at <= 0:
            continue
        if published_at > 0 and (published_at < MIN_TIMESTAMP or published_at > MAX_TIMESTAMP):
            continue

        if tag_whitelist_enabled and tag_whitelist:
            if not tag_ids or not tag_ids.intersection(tag_whitelist):
                continue
        elif category_whitelist_enabled and category_whitelist:
            if scategory not in category_whitelist:
                continue

        if not ai_mode:
            ok, _ = _mb_eval(rules=rules, source_id=sid, source_name=sname, title=title, url=u)
            if not ok:
                continue
        seen_urls.add(u)
        if title_normalized:
            seen_titles.add(title_normalized)
        pid = f"rss-{sid}" if sid else "rss-unknown"
        it = rss_row_to_item(
            platform_id=pid, source_id=sid, source_name=sname,
            title=title, url=u, created_at=created_at,
        )
        it["published_at"] = int(published_at)
        items_all.append(it)

    brief_timeline_cache.set(items_all, cache_config)

    sliced = items_all[off:off + lim]
    return UnicodeJSONResponse(
        content={
            "offset": int(off), "limit": int(lim),
            "drop_published_at_zero": bool(drop_zero),
            "ai_enabled": bool(ai_mode),
            "category_whitelist_enabled": bool(category_whitelist_enabled),
            "category_whitelist": list(category_whitelist),
            "tag_whitelist_enabled": bool(tag_whitelist_enabled),
            "tag_whitelist": list(tag_whitelist),
            "items": sliced,
            "total_candidates": int(len(items_all)),
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@router.get("/api/rss/brief/recent")
async def api_rss_brief_recent(
    hours: int = Query(48, ge=1, le=24 * 7),
    limit: int = Query(20, ge=1, le=200),
):
    conn = get_online_db()
    cutoff = rss_created_at_cutoff(hours=hours)
    lim = int(limit or 20)
    try:
        cur = conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, COALESCE(s.name, '')
            FROM rss_entries e
            LEFT JOIN rss_sources s ON s.id = e.source_id
            WHERE e.created_at >= ?
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT 4000
            """,
            (cutoff,),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    rules = _mb_load_rules(conn)
    items: List[Dict[str, Any]] = []
    seen_urls = set()
    for r in rows:
        if len(items) >= lim:
            break
        sid = str(r[0] or "").strip()
        title = str(r[1] or "")
        url = str(r[2] or "")
        created_at = int(r[3] or 0)
        sname = str(r[4] or "")
        u = url.strip()
        if not u or u in seen_urls:
            continue
        ok, _ = _mb_eval(rules=rules, source_id=sid, source_name=sname, title=title, url=u)
        if not ok:
            continue
        seen_urls.add(u)
        pid = f"rss-{sid}" if sid else "rss-unknown"
        items.append(
            rss_row_to_item(
                platform_id=pid, source_id=sid, source_name=sname,
                title=title, url=u, created_at=created_at,
            )
        )

    return UnicodeJSONResponse(
        content={
            "hours": int(hours),
            "items": items,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@router.get("/api/rss/brief/sources")
async def api_rss_brief_sources(
    hours: int = Query(24, ge=1, le=24 * 7),
    limit: int = Query(20, ge=1, le=200),
):
    """API: RSS 订阅源动态（近 N 小时按源聚合计数）。"""
    conn = get_online_db()
    cutoff = rss_created_at_cutoff(hours=hours)
    lim = int(limit or 20)
    try:
        cur = conn.execute(
            """
            SELECT e.source_id, COUNT(*) AS c, MAX(e.created_at) AS last_created_at
            FROM rss_entries e
            WHERE e.created_at >= ?
            GROUP BY e.source_id
            ORDER BY c DESC, last_created_at DESC
            LIMIT ?
            """,
            (cutoff, lim),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    out: List[Dict[str, Any]] = []
    for r in rows:
        sid = str(r[0] or "").strip()
        cnt = int(r[1] or 0)
        last_created_at = int(r[2] or 0)
        if not sid:
            continue
        try:
            cur2 = conn.execute("SELECT name, url FROM rss_sources WHERE id = ?", (sid,))
            row2 = cur2.fetchone()
        except Exception:
            row2 = None
        name = str(row2[0] if row2 else "")
        url = str(row2[1] if row2 else "")
        out.append(
            {
                "source_id": sid,
                "source_name": name.strip() or sid,
                "source_url": url.strip(),
                "count": cnt,
                "last_created_at": last_created_at,
            }
        )

    return UnicodeJSONResponse(
        content={
            "hours": int(hours),
            "sources": out,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@router.get("/api/rss/brief/source")
async def api_rss_brief_source(
    source_id: str = Query(...),
    hours: int = Query(24, ge=1, le=24 * 7),
    limit: int = Query(50, ge=1, le=200),
):
    """API: RSS 某订阅源近 N 小时条目列表。"""
    sid = (source_id or "").strip()
    if not sid:
        raise HTTPException(status_code=400, detail="Missing source_id")
    cutoff = rss_created_at_cutoff(hours=hours)
    lim = int(limit or 50)
    conn = get_online_db()
    try:
        cur = conn.execute(
            """
            SELECT e.title, e.url, e.created_at, COALESCE(s.name, '')
            FROM rss_entries e
            LEFT JOIN rss_sources s ON s.id = e.source_id
            WHERE e.source_id = ? AND e.created_at >= ?
            ORDER BY e.created_at DESC, e.id DESC
            LIMIT ?
            """,
            (sid, cutoff, lim),
        )
        rows = cur.fetchall() or []
    except Exception:
        rows = []

    items: List[Dict[str, Any]] = []
    for r in rows:
        title = str(r[0] or "")
        url = str(r[1] or "")
        created_at = int(r[2] or 0)
        sname = str(r[3] or "")
        if not url.strip():
            continue
        pid = f"rss-{sid}"
        items.append(
            rss_row_to_item(
                platform_id=pid, source_id=sid, source_name=sname,
                title=title, url=url, created_at=created_at,
            )
        )

    return UnicodeJSONResponse(
        content={
            "source_id": sid,
            "hours": int(hours),
            "items": items,
            "updated_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        }
    )


@router.get("/api/rss/ai-classification/stats")
async def api_rss_ai_classification_stats(
    hours: int = Query(24, ge=1, le=24 * 30, description="统计最近N小时的数据"),
):
    """API: 获取RSS AI分类统计信息"""
    from hotnews.web.rss_scheduler import mb_ai_get_classification_stats

    try:
        stats = mb_ai_get_classification_stats(last_n_hours=hours)
        return UnicodeJSONResponse(content=stats)
    except Exception as e:
        return UnicodeJSONResponse(
            content={"error": str(e)[:500], "time_range_hours": hours},
            status_code=500,
        )


@router.post("/api/rss/ai-classification/test")
async def api_rss_ai_classification_test(request: Request):
    """API: 测试AI分类效果（用于prompt调试）"""
    from hotnews.web.rss_scheduler import mb_ai_test_classification

    try:
        body = await request.json()
        items = body.get("items", [])
        model = body.get("model")

        if not items or not isinstance(items, list):
            return UnicodeJSONResponse(
                content={"ok": False, "error": "items字段必须是非空数组"},
                status_code=400,
            )

        for i, item in enumerate(items):
            if not isinstance(item, dict):
                return UnicodeJSONResponse(
                    content={"ok": False, "error": f"items[{i}]必须是对象"},
                    status_code=400,
                )
            required = ["id", "source", "domain", "title"]
            for field in required:
                if field not in item:
                    return UnicodeJSONResponse(
                        content={"ok": False, "error": f"items[{i}]缺少必需字段: {field}"},
                        status_code=400,
                    )

        result = await mb_ai_test_classification(items, force_model=model)
        return UnicodeJSONResponse(content=result)

    except Exception as e:
        return UnicodeJSONResponse(
            content={"ok": False, "error": str(e)[:500]},
            status_code=500,
        )
