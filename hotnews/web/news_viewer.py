"""
新闻查看器服务

提供按平台分类的新闻查看功能，支持内容过滤。
"""

import hashlib
import re
import time
from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from .content_filter import ContentFilter

# 简单的内存缓存
# 使用统一的缓存 TTL，与 timeline_cache.py 保持一致
from hotnews.web.timeline_cache import DEFAULT_CACHE_TTL

_categorized_news_cache = {}
_categorized_news_cache_time = 0
_CACHE_TTL_SECONDS = DEFAULT_CACHE_TTL  # 统一缓存时间（10分钟）


def clear_categorized_news_cache():
    """清除分类新闻缓存"""
    global _categorized_news_cache, _categorized_news_cache_time
    _categorized_news_cache = {}
    _categorized_news_cache_time = 0


def generate_news_id(platform_id: str, title: str) -> str:
    """
    生成基于内容的稳定新闻ID
    
    Args:
        platform_id: 平台ID
        title: 新闻标题
        
    Returns:
        稳定的新闻ID，格式为 platform_id-hash8
    """
    content = f"{platform_id}:{title}"
    hash_value = hashlib.md5(content.encode()).hexdigest()[:8]
    return f"{platform_id}-{hash_value}"


_CAIXIN_DATE_PREFIX_RE = re.compile(r"^\[(\d{4}-\d{2}-\d{2})\]\s+")
_NBA_TIME_PREFIX_RE = re.compile(r"^\[(\d{2}-\d{2}\s+\d{2}:\d{2})\]\s+")


def _parse_nba_meta_dt(meta: str) -> Optional[datetime]:
    s = (meta or "").strip()
    if not s:
        return None
    try:
        # meta format is MM-DD HH:MM
        dt = datetime.strptime(s, "%m-%d %H:%M")
        # attach current year for stable ordering
        return dt.replace(year=datetime.now().year)
    except Exception:
        return None


# 平台分类定义（6类）
PLATFORM_CATEGORIES = {
    "ai": {
        "name": "AI 资讯",
        "icon": "🤖",
        "news_limit": 10,
        "platforms": []
    },
    "general": {
        "name": "综合新闻",
        "icon": "📰",
        "news_limit": 10,
        "platforms": [
            "toutiao", "baidu", "thepaper", "ifeng", 
            "cankaoxiaoxi", "zaobao", "tencent-hot"
        ]
    },
    "finance": {
        "name": "财经投资",
        "icon": "💰",
        "news_limit": 10,
        "platforms": [
            "caixin",
            "sina_finance_roll",
            "wallstreetcn-hot", "wallstreetcn-quick", "cls-hot",
            "cls-telegraph", "gelonghui", "xueqiu", "jin10",
        ]
    },
    "social": {
        "name": "社交娱乐",
        "icon": "🔥",
        "news_limit": 10,
        "platforms": [
            "weibo", "douyin", "bilibili-hot-search", "tieba", "zhihu", "douban"
        ]
    },
    "knowledge": {
        "name": "每日AI早报",
        "icon": "📚",
        "news_limit": 10,
        "platforms": []
    },
    "tech_news": {
        "name": "科技资讯",
        "icon": "📱",
        "news_limit": 10,
        "platforms": [
            "ithome", "36kr-quick", "36kr-renqi", "sspai"
        ]
    },
    "developer": {
        "name": "开发者",
        "icon": "💻",
        "news_limit": 10,
        "platforms": [
            "juejin", "github", "hackernews", "v2ex", "producthunt", "freebuf"
        ]
    },
    "sports": {
        "name": "体育",
        "icon": "🏀",
        "news_limit": 10,
        "platforms": [
            "nba-schedule"  # hupu removed - controlled by category_override
        ],
    },
    "explore": {
        "name": "精选博客",
        "icon": "🧐",
        "news_limit": 20,
        "platforms": []
    }
}

# 分类显示顺序（用户期望的顺序）
# Note: "explore" is injected by server.py and will always be the first tab.
CATEGORY_ORDER = ['knowledge', 'ai', 'finance', 'tech_news', 'developer', 'social', 'general', 'sports', 'other']


class NewsViewerService:
    """新闻查看器服务"""

    def __init__(
        self, 
        project_root: Optional[str] = None,
        config: Optional[Dict] = None,
        data_service = None
    ):
        """
        初始化新闻查看器服务

        Args:
            project_root: 项目根目录
            config: 查看器配置
            data_service: 数据服务实例（用于获取新闻数据）
        """
        if project_root:
            self.project_root = Path(project_root)
        else:
            self.project_root = Path(__file__).parent.parent.parent

        self.config = config or {}
        self.data_service = data_service

        # 初始化内容过滤器
        viewer_config = self._load_viewer_config()
        self.content_filter = ContentFilter(
            project_root=str(self.project_root),
            config=viewer_config
        )

        # 平台ID到分类的映射
        self._platform_to_category = {}
        self._dynamic_categories = None
        self._reload_platform_config()

    def reload_cache(self):
        """Public method to reload platform and category cache."""
        self._reload_platform_config()
        return {"status": "ok", "message": "Cache reloaded successfully"}

    def _reload_platform_config(self):
        """Reload platform categories and mappings from database."""
        try:
            from .db_online import get_online_db_conn
            conn = get_online_db_conn(self.project_root)
            
            # 1. Load Categories
            categories = {}
            name_to_id = {}
            deleted_category_ids = set()  # Track soft-deleted categories
            
            try:
                # First, get all deleted category IDs (format: deleted_{original_id}_{timestamp})
                cur = conn.execute("SELECT id FROM platform_categories WHERE enabled=0 AND id LIKE 'deleted_%'")
                for r in cur.fetchall():
                    deleted_id = r[0]
                    # Extract original category id from deleted entries
                    # Format: deleted_{original_id}_{timestamp}
                    for known_id in PLATFORM_CATEGORIES.keys():
                        if deleted_id.startswith(f"deleted_{known_id}_"):
                            deleted_category_ids.add(known_id)
                            break
                
                # Now load enabled categories
                cur = conn.execute("SELECT id, name, icon, sort_order FROM platform_categories WHERE enabled=1 ORDER BY sort_order ASC")
                rows = cur.fetchall()
                if rows:
                    for r in rows:
                        cid, name, icon, sort_order = r
                        categories[cid] = {
                            "name": name,
                            "icon": icon or "📰",
                            "platforms": [],
                            "news_limit": 10,
                            "_sort_order": sort_order
                        }
                        name_to_id[name] = cid
            except Exception:
                pass
            
            # Fallback to defaults (filtered by what might be in DB if partial)
            # Fix: Always ensure default categories exist even if DB has some other categories
            # BUT skip categories that have been soft-deleted
            for k, v in PLATFORM_CATEGORIES.items():
                if k in deleted_category_ids:
                    # Skip soft-deleted categories
                    continue
                if k not in categories:
                    categories[k] = {**v, "platforms": [], "_sort_order": 999}
                    if v["name"] not in name_to_id:
                        name_to_id[v["name"]] = k
                else:
                    # Update name mapping just in case
                    if categories[k]["name"] not in name_to_id:
                        name_to_id[categories[k]["name"]] = k

            # 2. Load Platform Mappings
            # Helper to assign
            def assign(pid, cat_val):
                if not cat_val: return
                cid = None
                
                # Try exact match
                if cat_val in categories:
                    cid = cat_val
                elif cat_val in name_to_id:
                    cid = name_to_id[cat_val]
                
                # Try case-insensitive match if not found
                if not cid:
                    cat_val_lower = cat_val.lower()
                    if cat_val_lower in categories:
                        cid = cat_val_lower
                    # Also try matching by name case-insensitively
                    elif not cid:
                        for k, v in categories.items():
                             if v["name"].lower() == cat_val_lower:
                                 cid = k
                                 break
                
                if cid:
                    categories[cid]["platforms"].append(pid)
                    self._platform_to_category[pid] = cid

            # NewsNow
            try:
                from hotnews.kernel.admin.category_rules import get_category_for_platform
                for r in conn.execute("SELECT id, name, category_override FROM newsnow_platforms WHERE enabled=1"):
                    platform_id = str(r[0])
                    platform_name = str(r[1])
                    category_override = r[2]
                    
                    # Use override if set, otherwise use rule engine
                    if category_override:
                        assign(platform_id, category_override)
                    else:
                        auto_category = get_category_for_platform(conn, platform_id, platform_name)
                        assign(platform_id, auto_category)
            except Exception: pass
            
            # Custom Sources
            try:
                for r in conn.execute("SELECT id, category FROM custom_sources WHERE enabled=1"):
                    assign(str(r[0]), r[1])
            except Exception: pass

            # RSS Sources
            try:
                for r in conn.execute("SELECT id, category FROM rss_sources WHERE enabled=1"):
                    assign(f"rss-{r[0]}", r[1])
            except Exception: pass
            
            # 3. Load Standard Platforms from Config
            for cat_id, cat_info in PLATFORM_CATEGORIES.items():
                if cat_id in categories:
                    for pid in cat_info.get("platforms", []):
                        # Avoid duplicates if somehow already added
                        if pid not in categories[cat_id]["platforms"]:
                            categories[cat_id]["platforms"].append(pid)
                        # Always ensure mapping exists (standard platforms might not be in DB tables)
                        self._platform_to_category[pid] = cat_id
            
            self._dynamic_categories = categories
            
        except Exception as e:
            # Fallback to hardcoded
            print(f"Error loading platform config: {e}")
            self._dynamic_categories = {k: {**v} for k, v in PLATFORM_CATEGORIES.items()}
            for cat_id, cat_info in PLATFORM_CATEGORIES.items():
                for platform_id in cat_info["platforms"]:
                    self._platform_to_category[platform_id] = cat_id

    def _load_viewer_config(self) -> Dict:
        """加载查看器配置"""
        try:
            import yaml
            config_path = self.project_root / "config" / "config.yaml"
            if config_path.exists():
                with open(config_path, "r", encoding="utf-8") as f:
                    full_config = yaml.safe_load(f)
                    return full_config.get("viewer", {})
        except Exception:
            pass
        return {}

    def get_platform_category(self, platform_id: str) -> str:
        """获取平台所属分类"""
        # Lazy reload if needed or relying on periodic restarts? 
        # For now, let's just use what initialized or reloaded manually.
        # Ideally we might want a TTL here too, but let's stick to simple first.
        return self._platform_to_category.get(platform_id, "other")

    def _detect_cross_platform_news(self, news_list: List[Dict]) -> Dict[str, List[str]]:
        """
        检测跨平台出现的新闻标题
        
        Args:
            news_list: 新闻列表
            
        Returns:
            {标题: [平台名称列表]} 字典，只包含出现在2个及以上平台的标题
        """
        # 统计每个标题出现在哪些平台
        title_platforms = defaultdict(set)
        for news in news_list:
            title = news.get("title", "").strip()
            platform_name = news.get("platform_name", news.get("platform", ""))
            if title and platform_name:
                title_platforms[title].add(platform_name)
        
        # 只保留出现在多个平台的标题
        cross_platform = {
            title: list(platforms) 
            for title, platforms in title_platforms.items() 
            if len(platforms) >= 2
        }
        return cross_platform

    def categorize_news(
        self, 
        news_list: List[Dict],
        apply_filter: bool = True,
        apply_ai_filter: bool = True
    ) -> Dict:
        """
        将新闻按平台分类组织

        Args:
            news_list: 新闻列表
            apply_filter: 是否应用内容过滤
            apply_ai_filter: 是否应用 AI 过滤

        Returns:
            分类后的新闻数据结构
        """
        def _derive_updated_at(items: List[Dict]) -> str:
            best: Optional[datetime] = None
            for it in items or []:
                ts = it.get("timestamp")
                if not ts or not isinstance(ts, str):
                    continue
                try:
                    dt = datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
                except Exception:
                    continue
                if best is None or dt > best:
                    best = dt
            if best is None:
                return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            return best.strftime("%Y-%m-%d %H:%M:%S")

        updated_at = _derive_updated_at(news_list)

        # AI 过滤（在关键词过滤之前）
        ai_filter_stats = {}
        if apply_ai_filter:
            try:
                from .ai_filter import apply_ai_filter as do_ai_filter
                from .db_online import get_online_db_conn
                conn = get_online_db_conn(self.project_root)

                from collections import defaultdict
                ai_filtered_count = 0
                ai_no_label_count = 0
                ai_filter_by_category = {}

                by_cat = defaultdict(list)
                no_ai_items = []
                for news in news_list:
                    if news.get("source_id"):
                        cat_id = self.get_platform_category(news.get("platform", ""))
                        by_cat[cat_id].append(news)
                    else:
                        no_ai_items.append(news)

                kept_items = list(no_ai_items)
                for cat_id, cat_items in by_cat.items():
                    filtered, stats = do_ai_filter(cat_items, cat_id, conn)
                    kept_items.extend(filtered)
                    cat_filtered = stats.get("ai_filtered_count", 0)
                    ai_filtered_count += cat_filtered
                    ai_no_label_count += stats.get("ai_no_label_count", 0)
                    if cat_filtered > 0:
                        ai_filter_by_category[cat_id] = cat_filtered

                news_list = kept_items
                ai_filter_stats = {
                    "ai_filtered_count": ai_filtered_count,
                    "ai_no_label_count": ai_no_label_count,
                    "ai_filter_by_category": ai_filter_by_category,
                }
            except Exception:
                pass

        # 应用内容过滤
        if apply_filter:
            filtered_news, removed_news, filter_stats = self.content_filter.filter_news(
                news_list, title_key="title"
            )
        else:
            filtered_news = news_list
            removed_news = []
            filter_stats = {"filtered_count": 0, "mode": "off"}

        viewer_config = self._load_viewer_config() or {}
        disabled_platforms = viewer_config.get("disabled_platforms", [])
        disabled_set = set(
            [
                str(pid or "").strip()
                for pid in (disabled_platforms if isinstance(disabled_platforms, list) else [])
                if str(pid or "").strip()
            ]
        )
        
        # Also load disabled NewsNow platforms from database
        try:
            from .db_online import get_online_db_conn
            conn = get_online_db_conn(self.project_root)
            cur = conn.execute("SELECT id FROM newsnow_platforms WHERE enabled = 0")
            rows = cur.fetchall()
            for r in rows:
                disabled_set.add(str(r[0]))
        except Exception:
            # Silently ignore database errors (table might not exist)
            pass
        
        if disabled_set:
            filtered_news = [n for n in filtered_news if str(n.get("platform") or "").strip() not in disabled_set]
            removed_news = [n for n in removed_news if str(n.get("platform") or "").strip() not in disabled_set]

        # 检测跨平台新闻
        # cross_platform_news = self._detect_cross_platform_news(filtered_news)
        cross_platform_news = {}

        # 按分类组织新闻
        categories = {}
        new_badges = viewer_config.get("new_badges", {}) if isinstance(viewer_config, dict) else {}
        new_platform_ids = set(new_badges.get("platforms", []) or []) if isinstance(new_badges, dict) else set()
        new_category_ids = set(new_badges.get("categories", []) or []) if isinstance(new_badges, dict) else set()
        
        # Use dynamic categories
        source_cats = self._dynamic_categories or {}
        if not source_cats:
             source_cats = PLATFORM_CATEGORIES # Fallback
             
        for cat_id, cat_info in source_cats.items():
            categories[cat_id] = {
                "id": cat_id,
                "name": cat_info["name"],
                "icon": cat_info["icon"],
                "news_limit": cat_info.get("news_limit", 10),
                "platforms": {},
                "news_count": 0,
                "filtered_count": 0,
                "is_new": cat_id in new_category_ids,
            }

        # 其他分类（不在预定义分类中的平台）
        categories["other"] = {
            "id": "other",
            "name": "其他平台",
            "icon": "📋",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
        }

        # 记录已显示的跨平台新闻标题，用于去重
        shown_cross_platform_titles = set()

        # 分配新闻到分类
        for news in filtered_news:
            platform_id = news.get("platform", "unknown")
            platform_name = news.get("platform_name", platform_id)
            cat_id = self.get_platform_category(platform_id)
            
            # DEBUG: Trace RSS categorization
            if str(platform_id).startswith("rss-"):
                print(f"DEBUG: RSS Item {platform_id} -> Category {cat_id}")
                
            title = news.get("title", "").strip()

            display_title = title
            meta = ""
            if platform_id == "caixin":
                display_title = _CAIXIN_DATE_PREFIX_RE.sub("", display_title).strip()
            _sort_dt = None
            if platform_id == "nba-schedule":
                m = _NBA_TIME_PREFIX_RE.match(display_title)
                if m:
                    time_str = m.group(1)
                    _sort_dt = _parse_nba_meta_dt(time_str)
                    display_title = _NBA_TIME_PREFIX_RE.sub("", display_title).strip()
                    meta = time_str  # 日期显示在标题下方

            # 跨平台新闻去重：只在第一个出现的平台显示
            is_cross = title in cross_platform_news
            if is_cross and title in shown_cross_platform_titles:
                # 已经在其他平台显示过，跳过
                continue

            if platform_id not in categories[cat_id]["platforms"]:
                categories[cat_id]["platforms"][platform_id] = {
                    "id": platform_id,
                    "name": platform_name,
                    "news": [],
                    "is_new": platform_id in new_platform_ids,
                }

            if categories[cat_id]["platforms"][platform_id].get("is_new"):
                categories[cat_id]["is_new"] = True

            # 生成稳定的新闻ID
            stable_id = generate_news_id(platform_id, title)
            
            # 添加跨平台信息和稳定ID
            news_with_cross = {**news, "stable_id": stable_id, "display_title": display_title, "meta": meta, "_sort_dt": _sort_dt}
            if is_cross:
                other_platforms = [p for p in cross_platform_news[title] if p != platform_name]
                if other_platforms:
                    news_with_cross["is_cross_platform"] = True
                    news_with_cross["cross_platform_count"] = len(cross_platform_news[title])
                    news_with_cross["cross_platforms"] = other_platforms
                    # 标记为已显示
                    shown_cross_platform_titles.add(title)

            categories[cat_id]["platforms"][platform_id]["news"].append(news_with_cross)
            categories[cat_id]["news_count"] += 1

        # 统计被过滤的新闻分布
        for news in removed_news:
            platform_id = news.get("platform", "unknown")
            cat_id = self.get_platform_category(platform_id)
            categories[cat_id]["filtered_count"] += 1

        # 移除空分类
        # 总是保留配置的分类，即使是空的 (Always keep configured categories)
        keep_empty = {"ai", "knowledge", "explore"}
        if self._dynamic_categories:
            keep_empty.update(self._dynamic_categories.keys())
        else:
            keep_empty.update(PLATFORM_CATEGORIES.keys())

        categories = {
            k: v for k, v in categories.items() 
            if (k in keep_empty) or v["news_count"] > 0 or v["filtered_count"] > 0
        }

        # Ensure platforms are ordered by configured category platform list.
        for cat_id, cat in list(categories.items()):
            cat_info = (self._dynamic_categories or {}).get(cat_id)
            if not cat_info:
                cat_info = PLATFORM_CATEGORIES.get(cat_id)
            if not cat_info:
                continue
            if not cat_info:
                continue
            desired = cat_info.get("platforms")
            if not isinstance(desired, list):
                continue

            ordered = {}
            for pid in desired:
                if pid in cat["platforms"]:
                    ordered[pid] = cat["platforms"][pid]
            for pid, pdata in cat["platforms"].items():
                if pid not in ordered:
                    ordered[pid] = pdata
            cat["platforms"] = ordered

        # Sort nba-schedule items by match datetime desc (newest -> oldest)
        sports = categories.get("sports")
        if isinstance(sports, dict):
            plats = sports.get("platforms")
            if isinstance(plats, dict):
                nba = plats.get("nba-schedule")
                if isinstance(nba, dict) and isinstance(nba.get("news"), list):
                    def _key(it: Dict) -> datetime:
                        sd = it.get("_sort_dt")
                        if isinstance(sd, datetime):
                            return sd
                        return datetime.min

                    nba["news"] = sorted(list(nba["news"]), key=_key, reverse=True)
                    # Remove _sort_dt to avoid JSON serialization error
                    for item in nba["news"]:
                        item.pop("_sort_dt", None)

        # 按预定义顺序排序分类 (Use sort_order from dynamic config)
        def get_order(cat_id):
            # Prefer dynamic sort order
            dcat = (self._dynamic_categories or {}).get(cat_id)
            if dcat and "_sort_order" in dcat:
                return dcat["_sort_order"]
                
            try:
                return CATEGORY_ORDER.index(cat_id)
            except ValueError:
                return 999
        
        sorted_categories = dict(
            sorted(categories.items(), key=lambda x: get_order(x[0]))
        )

        return {
            "categories": sorted_categories,
            "cross_platform_count": len(cross_platform_news),
            "total_news": len(filtered_news),
            "total_filtered": len(removed_news),
            "filter_stats": {**filter_stats, **ai_filter_stats},
            "updated_at": updated_at
        }

    def get_categorized_news(
        self,
        platforms: Optional[List[str]] = None,
        limit: int = 25000,
        apply_filter: bool = True,
        filter_mode: Optional[str] = None,
        per_platform_limit: int = 50,
        apply_ai_filter: bool = True
    ) -> Dict:
        """
        获取分类后的新闻

        Args:
            platforms: 指定平台列表，None表示所有平台
            limit: 最大新闻数量
            apply_filter: 是否应用内容过滤
            filter_mode: 临时覆盖过滤模式
            per_platform_limit: 每个平台的最大新闻数量
            apply_ai_filter: 是否应用 AI 过滤

        Returns:
            分类后的新闻数据
        """
        global _categorized_news_cache, _categorized_news_cache_time
        
        # 构建缓存键
        cache_key = f"{','.join(platforms or [])}:{limit}:{apply_filter}:{filter_mode or ''}:{per_platform_limit}:{apply_ai_filter}"
        
        # 检查缓存是否有效
        now = time.time()
        if cache_key in _categorized_news_cache and (now - _categorized_news_cache_time) < _CACHE_TTL_SECONDS:
            return _categorized_news_cache[cache_key]
        
        # 临时设置过滤模式
        original_mode = None
        if filter_mode and filter_mode in ("strict", "moderate", "off"):
            original_mode = self.content_filter.filter_mode
            self.content_filter.set_filter_mode(filter_mode)

        try:
            # 获取新闻数据
            if self.data_service:
                try:
                    news_list = self.data_service.get_latest_news(
                        platforms=platforms,
                        limit=limit,
                        include_url=True,
                        per_platform_limit=per_platform_limit
                    )
                except TypeError:
                    # Fallback for older DataService versions
                    news_list = self.data_service.get_latest_news(
                        platforms=platforms,
                        limit=limit,
                        include_url=True
                    )
            else:
                # 如果没有数据服务，返回空数据
                news_list = []

            # 分类新闻
            result = self.categorize_news(news_list, apply_filter=apply_filter, apply_ai_filter=apply_ai_filter)
            result["filter_mode"] = self.content_filter.filter_mode
            
            # 更新缓存
            _categorized_news_cache[cache_key] = result
            _categorized_news_cache_time = now

            return result

        finally:
            # 恢复原始过滤模式
            if original_mode is not None:
                self.content_filter.set_filter_mode(original_mode)

    def get_category_list(self) -> List[Dict]:
        """获取所有分类列表"""
        cats = self._dynamic_categories or PLATFORM_CATEGORIES
        # Sort by sort_order
        sorted_items = sorted(cats.items(), key=lambda x: x[1].get("_sort_order", 0) if isinstance(x[1], dict) else 0)
        
        return [
            {
                "id": cat_id,
                "name": cat_info["name"],
                "icon": cat_info["icon"],
                "platform_count": len(cat_info["platforms"])
            }
            for cat_id, cat_info in sorted_items
        ]

    def get_filter_stats(self) -> Dict:
        """获取过滤统计"""
        return self.content_filter.get_stats()

    def set_filter_mode(self, mode: str) -> bool:
        """设置过滤模式"""
        return self.content_filter.set_filter_mode(mode)

    def get_blacklist_keywords(self) -> List[str]:
        """获取黑名单关键词列表"""
        return self.content_filter.get_keywords()

    def reload_blacklist(self) -> int:
        """重新加载黑名单"""
        return self.content_filter.reload_blacklist()
