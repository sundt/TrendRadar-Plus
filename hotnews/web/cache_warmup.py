"""
Cache Warmup Service

服务启动时预热缓存，避免冷缓存导致首次请求慢。
直接调用数据库查询，不使用 HTTP 请求。

使用方式：
    from hotnews.web.cache_warmup import CacheWarmupService, WarmupConfig
    
    service = CacheWarmupService(db_conn=conn, config=warmup_config)
    result = await service.warmup_all()
"""

import hashlib
import json
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Set

from hotnews.web.timeline_cache import (
    brief_timeline_cache,
    explore_timeline_cache,
)

logger = logging.getLogger(__name__)


@dataclass
class WarmupConfig:
    """缓存预热配置"""
    enabled: bool = True
    brief_timeline_limit: int = 1000
    explore_timeline_limit: int = 500
    timeout_seconds: int = 60

    @classmethod
    def from_yaml(cls, config: dict) -> "WarmupConfig":
        perf = config.get("performance", {}) or {}
        warmup = perf.get("cache_warmup", {}) or {}
        return cls(
            enabled=warmup.get("enabled", True),
            brief_timeline_limit=warmup.get("brief_timeline_limit", 1000),
            explore_timeline_limit=warmup.get("explore_timeline_limit", 500),
            timeout_seconds=warmup.get("timeout_seconds", 60),
        )


@dataclass
class WarmupResult:
    """预热结果"""
    success: bool = False
    brief_count: int = 0
    explore_count: int = 0
    elapsed_ms: int = 0
    errors: List[str] = field(default_factory=list)


def _generate_news_id(platform_id: str, title: str) -> str:
    """Generate stable news ID (same logic as server.py generate_news_id)."""
    key = f"{platform_id}:{title}"
    return hashlib.md5(key.encode("utf-8")).hexdigest()[:12]


def _rss_row_to_item(*, platform_id: str, source_id: str, source_name: str,
                     title: str, url: str, created_at: int) -> Dict[str, Any]:
    """Convert a DB row to a timeline item dict."""
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
        "stable_id": _generate_news_id(platform_id, t),
    }


def _load_brief_rules(conn: sqlite3.Connection) -> Dict[str, Any]:
    """Load morning brief rules from admin_kv (simplified version)."""
    defaults = {
        "enabled": True,
        "drop_published_at_zero": True,
        "category_whitelist_enabled": True,
        "category_whitelist": ["explore", "tech_news", "ainews", "developer", "ai"],
        "tag_whitelist_enabled": True,
        "tag_whitelist": ["ai_ml"],
    }
    try:
        cur = conn.execute(
            "SELECT value FROM admin_kv WHERE key = ? LIMIT 1",
            ("morning_brief_rules_v1",),
        )
        row = cur.fetchone()
        raw = str(row[0] or "") if row else ""
        if raw.strip():
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                defaults = {**defaults, **parsed}
    except Exception:
        pass

    # Normalize whitelist fields
    cw = defaults.get("category_whitelist")
    if not isinstance(cw, list):
        defaults["category_whitelist"] = ["explore", "tech_news", "ainews", "developer", "ai"]
    else:
        defaults["category_whitelist"] = [str(x or "").strip().lower() for x in cw if str(x or "").strip()]

    tw = defaults.get("tag_whitelist")
    if not isinstance(tw, list):
        defaults["tag_whitelist"] = ["ai_ml"]
    else:
        defaults["tag_whitelist"] = [str(x or "").strip().lower() for x in tw if str(x or "").strip()]

    return defaults


class CacheWarmupService:
    """缓存预热服务 - 直接查询数据库填充缓存"""

    def __init__(self, db_conn: sqlite3.Connection, config: WarmupConfig):
        self.conn = db_conn
        self.config = config

    async def warmup_all(self) -> WarmupResult:
        """预热所有公共缓存"""
        if not self.config.enabled:
            logger.info("Cache warmup is disabled by config")
            return WarmupResult(success=True)

        start = time.time()
        result = WarmupResult()
        errors: List[str] = []

        # Brief Timeline
        try:
            result.brief_count = self._warmup_brief_timeline()
            logger.info(f"  ✅ Brief Timeline 缓存已预热: {result.brief_count} 条")
        except Exception as e:
            msg = f"Brief Timeline warmup failed: {e}"
            logger.warning(f"  ⚠️ {msg}")
            errors.append(msg)

        # Explore Timeline
        try:
            result.explore_count = self._warmup_explore_timeline()
            logger.info(f"  ✅ Explore Timeline 缓存已预热: {result.explore_count} 条")
        except Exception as e:
            msg = f"Explore Timeline warmup failed: {e}"
            logger.warning(f"  ⚠️ {msg}")
            errors.append(msg)

        # Tag-driven Timelines (AI、开发者、商业、财经、科学健康、生活等)
        try:
            tag_count = self._warmup_tag_timelines()
            if tag_count > 0:
                logger.info(f"  ✅ Tag Timelines 缓存已预热: {tag_count} 个标签")
        except Exception as e:
            msg = f"Tag Timelines warmup failed: {e}"
            logger.warning(f"  ⚠️ {msg}")
            errors.append(msg)

        result.elapsed_ms = int((time.time() - start) * 1000)
        result.errors = errors
        result.success = len(errors) == 0
        return result

    # ------------------------------------------------------------------
    # Tag-driven Timelines warmup (预热 SQLite 页面缓存)
    # ------------------------------------------------------------------
    def _warmup_tag_timelines(self) -> int:
        """预热 tag-driven 栏目的 SQLite 页面缓存。
        
        读取 column_config 表中的 tag_ids，执行与 /api/timeline 相同的查询，
        让 SQLite 页面缓存提前加载到内存，避免首次请求慢。
        """
        # 1. 从 column_config 收集所有 tag_ids
        all_tags: Set[str] = set()
        try:
            rows = self.conn.execute(
                "SELECT tag_ids FROM column_config WHERE enabled = 1"
            ).fetchall()
            for row in rows:
                raw = str(row[0] or "").strip()
                if not raw:
                    continue
                try:
                    tags = json.loads(raw)
                    if isinstance(tags, list):
                        for t in tags:
                            s = str(t or "").strip()
                            if s:
                                all_tags.add(s)
                except (json.JSONDecodeError, TypeError):
                    pass
        except Exception:
            # column_config 表可能不存在
            return 0

        if not all_tags:
            return 0

        # 2. 对每个 tag 执行轻量查询，预热 SQLite 页面缓存
        warmed = 0
        for tag_id in all_tags:
            try:
                # 与 timeline_routes.py 的查询结构一致
                self.conn.execute(
                    """
                    SELECT et.source_id, et.dedup_key, MAX(et.created_at) AS latest
                    FROM rss_entry_tags et
                    WHERE et.tag_id = ?
                    GROUP BY et.source_id, et.dedup_key
                    ORDER BY latest DESC
                    LIMIT 50
                    """,
                    (tag_id,),
                ).fetchall()
                warmed += 1
            except Exception:
                pass

        return warmed

    # ------------------------------------------------------------------
    # Brief Timeline warmup
    # ------------------------------------------------------------------
    def _warmup_brief_timeline(self) -> int:
        """预热 Brief Timeline 缓存，返回加载的条目数"""
        rules = _load_brief_rules(self.conn)
        drop_zero = bool(rules.get("drop_published_at_zero", True))

        category_whitelist_enabled = bool(rules.get("category_whitelist_enabled", True))
        category_whitelist = set(rules.get("category_whitelist") or [])
        tag_whitelist_enabled = bool(rules.get("tag_whitelist_enabled", True))
        tag_whitelist = set(rules.get("tag_whitelist") or [])

        raw_fetch = min(self.config.brief_timeline_limit * 2, 8000)

        # AI mode is always enabled
        if drop_zero:
            cur = self.conn.execute(
                """
                SELECT DISTINCT e.source_id, e.dedup_key, e.title, e.url, e.created_at, e.published_at,
                       COALESCE(s.name, ''), COALESCE(s.category, ''),
                       GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids
                FROM rss_entries e
                JOIN rss_entry_ai_labels l
                  ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
                LEFT JOIN rss_sources s ON s.id = e.source_id
                LEFT JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
                WHERE e.published_at > 0
                  AND l.action = 'include'
                  AND l.score >= 75
                  AND l.confidence >= 0.70
                GROUP BY e.source_id, e.dedup_key
                ORDER BY e.published_at DESC, e.id DESC
                LIMIT ?
                """,
                (raw_fetch,),
            )
        else:
            cur = self.conn.execute(
                """
                SELECT DISTINCT e.source_id, e.dedup_key, e.title, e.url, e.created_at, e.published_at,
                       COALESCE(s.name, ''), COALESCE(s.category, ''),
                       GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids
                FROM rss_entries e
                JOIN rss_entry_ai_labels l
                  ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
                LEFT JOIN rss_sources s ON s.id = e.source_id
                LEFT JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
                WHERE l.action = 'include'
                  AND l.score >= 75
                  AND l.confidence >= 0.70
                GROUP BY e.source_id, e.dedup_key
                ORDER BY e.published_at DESC, e.id DESC
                LIMIT ?
                """,
                (raw_fetch,),
            )

        rows = cur.fetchall() or []

        # Timestamp validation range
        MIN_TS = 946684800  # 2000-01-01
        MAX_TS = int(time.time()) + 7 * 86400

        items: List[Dict[str, Any]] = []
        seen_urls: Set[str] = set()
        seen_titles: Set[str] = set()

        for r in rows:
            sid = str(r[0] or "").strip()
            title = str(r[2] or "")
            url = str(r[3] or "")
            created_at = int(r[4] or 0)
            published_at = int(r[5] or 0)
            sname = str(r[6] or "")
            scategory = str(r[7] or "").strip().lower()
            tag_ids_str = str(r[8] or "").strip()

            tag_ids = set(t.strip().lower() for t in tag_ids_str.split(",") if t.strip()) if tag_ids_str else set()

            u = url.strip()
            if not u or u in seen_urls:
                continue
            title_norm = title.strip().lower()
            if title_norm and title_norm in seen_titles:
                continue
            if drop_zero and published_at <= 0:
                continue
            if published_at > 0 and (published_at < MIN_TS or published_at > MAX_TS):
                continue

            # Tag/category whitelist filtering (shared logic)
            from hotnews.web.deps import passes_tag_whitelist
            if not passes_tag_whitelist(
                tag_ids, scategory,
                tag_whitelist=tag_whitelist,
                tag_whitelist_enabled=tag_whitelist_enabled,
                category_whitelist=category_whitelist,
                category_whitelist_enabled=category_whitelist_enabled,
            ):
                continue

            seen_urls.add(u)
            if title_norm:
                seen_titles.add(title_norm)

            pid = f"rss-{sid}" if sid else "rss-unknown"
            it = _rss_row_to_item(
                platform_id=pid, source_id=sid, source_name=sname,
                title=title, url=u, created_at=created_at,
            )
            it["published_at"] = int(published_at)
            items.append(it)

        # Build cache config (same keys as server.py)
        cache_config = {
            "drop_zero": drop_zero,
            "ai_mode": True,
            "rules_hash": hash(str(sorted(rules.items()))),
            "category_whitelist": tuple(sorted(category_whitelist)),
            "tag_whitelist": tuple(sorted(tag_whitelist)),
        }
        brief_timeline_cache.set(items, cache_config)
        return len(items)

    # ------------------------------------------------------------------
    # Explore Timeline warmup
    # ------------------------------------------------------------------
    def _warmup_explore_timeline(self) -> int:
        """预热 Explore Timeline 缓存，返回加载的条目数"""
        min_ts = 946684800
        max_ts = int(time.time()) + 365 * 86400
        fetch_limit = min(self.config.explore_timeline_limit * 2, 1000)

        cur = self.conn.execute(
            """
            SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
                   e.description
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
            (min_ts, max_ts, fetch_limit),
        )
        rows = cur.fetchall() or []

        # Batch fetch source names
        source_ids = list(set(str(r[0] or "").strip() for r in rows if r[0]))
        source_names: Dict[str, str] = {}
        if source_ids:
            try:
                ph = ",".join("?" * len(source_ids))
                cur2 = self.conn.execute(
                    f"SELECT id, name FROM rss_sources WHERE id IN ({ph})", source_ids
                )
                source_names = {str(r[0]): str(r[1] or "") for r in cur2.fetchall()}
            except Exception:
                pass

        items: List[Dict[str, Any]] = []
        seen_titles: Set[str] = set()
        max_items = 500

        for r in rows:
            if len(items) >= max_items:
                break
            sid = str(r[0] or "").strip()
            title = str(r[1] or "").strip()
            url = str(r[2] or "")
            created_at = int(r[3] or 0)
            published_at = int(r[4] or 0)
            description = str(r[5] or "").strip() if len(r) > 5 else ""
            sname = source_names.get(sid, "")

            if not url.strip():
                continue
            tk = title.lower()
            if tk in seen_titles:
                continue
            seen_titles.add(tk)

            pid = f"rss-{sid}" if sid else "rss-unknown"
            it = _rss_row_to_item(
                platform_id=pid, source_id=sid, source_name=sname,
                title=title, url=url, created_at=created_at,
            )
            it["published_at"] = published_at
            # 不缓存 content/description 大字段，节省内存
            items.append(it)

        explore_timeline_cache.set(items)
        return len(items)
