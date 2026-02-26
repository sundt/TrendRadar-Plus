import json
import hashlib
import os
import secrets
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional
from urllib.parse import unquote

from fastapi import Request
from fastapi.responses import HTMLResponse


def _inject_user_topics_as_categories(data: Dict[str, Any], request: Request) -> Dict[str, Any]:
    """
    Inject user's tracked topics as categories (metadata only, news loaded via API).
    Topics are inserted after 'my-tags' category.
    
    NOTE: Disabled to prevent cache leakage issues when multiple users are online.
    Topics are now loaded entirely via frontend API calls.
    """
    # Disabled - topics are now loaded via frontend API to prevent cache issues
    # When pages are cached (CDN/Nginx), server-rendered topics from user A
    # could be shown to user B. Frontend loading ensures each user only sees
    # their own topics.
    return data
    
    # Original implementation below (kept for reference):
    import logging
    logger = logging.getLogger(__name__)
    
    try:
        # Get user ID from session
        from hotnews.kernel.auth.auth_api import _get_session_token
        from hotnews.kernel.auth.auth_service import validate_session
        
        token = _get_session_token(request)
        if not token:
            return data
        
        # Get database connection
        from hotnews.web.user_db import get_user_db_conn
        project_root = getattr(request.app.state, "project_root", None)
        if not project_root:
            from pathlib import Path
            project_root = Path(__file__).parent.parent.parent
        
        user_db_conn = get_user_db_conn(project_root)
        if not user_db_conn:
            logger.warning("No database connection for topic injection")
            return data
        
        # Validate session with conn and token
        is_valid, user_info = validate_session(user_db_conn, token)
        if not is_valid or not user_info or not user_info.get("id"):
            return data
        
        user_id = user_info["id"]
        logger.debug(f"Injecting topics for user {user_id}")
        
        # Get user's topics from database
        from hotnews.storage.topic_storage import TopicStorage
        storage = TopicStorage(user_db_conn)
        topics = storage.get_topics_by_user(str(user_id))
        
        logger.info(f"Found {len(topics) if topics else 0} topics for user {user_id}")
        
        if not topics:
            return data
        
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        
        # Build new categories dict with topics inserted BEFORE my-tags
        # 只注入元数据，新闻通过 API 动态加载
        new_cats = {}
        for k, v in cats.items():
            if k == "my-tags":
                # Insert topics BEFORE my-tags (metadata only)
                for topic in topics:
                    topic_cat_id = f"topic-{topic['id']}"
                    if topic_cat_id not in new_cats:
                        new_cats[topic_cat_id] = {
                            "id": topic_cat_id,
                            "name": topic.get("name", "主题"),
                            "icon": topic.get("icon", "🏷️"),
                            "platforms": {},  # 空，通过 API 加载
                            "news_count": 0,
                            "filtered_count": 0,
                            "is_new": False,
                            "requires_auth": True,
                            "is_dynamic": True,  # 标记为动态加载
                            "is_topic": True,
                            "topic_id": topic["id"],
                            "keywords": topic.get("keywords", []),
                            "owner_user_id": user_id,  # 用于前端验证
                        }
                        logger.debug(f"Injected topic category: {topic_cat_id} ({topic.get('name')})")
            new_cats[k] = v
        
        # If my-tags not found, append topics at the beginning
        if not any(k.startswith("topic-") for k in new_cats):
            topic_cats = {}
            for topic in topics:
                topic_cat_id = f"topic-{topic['id']}"
                topic_cats[topic_cat_id] = {
                    "id": topic_cat_id,
                    "name": topic.get("name", "主题"),
                    "icon": topic.get("icon", "🏷️"),
                    "platforms": {},
                    "news_count": 0,
                    "filtered_count": 0,
                    "is_new": False,
                    "requires_auth": True,
                    "is_dynamic": True,
                    "is_topic": True,
                    "topic_id": topic["id"],
                    "keywords": topic.get("keywords", []),
                    "owner_user_id": user_id,  # 用于前端验证
                }
            new_cats = {**topic_cats, **new_cats}
            logger.debug(f"Injected {len(topic_cats)} topics at beginning (my-tags not found)")
        
        data["categories"] = new_cats
        return data
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to inject user topics: {e}", exc_info=True)
        return data

def _build_topic_platforms(
    conn,
    keywords: List[str],
    priority_source_ids: List[str],
    limit_per_keyword: int = 30
) -> Dict[str, Any]:
    """
    Build platforms dict for a topic, with each keyword as a platform.
    
    Args:
        conn: Database connection
        keywords: List of keywords to search
        priority_source_ids: RSS source IDs to prioritize
        limit_per_keyword: Max news per keyword
        
    Returns:
        Dict of platforms, keyed by keyword
    """
    import re
    import hashlib
    
    platforms = {}
    
    def normalize_title(title: str) -> str:
        return re.sub(r'[^\w\u4e00-\u9fff]', '', title.lower())
    
    def generate_news_id(platform_id: str, title: str) -> str:
        """Generate stable news ID."""
        key = f"{platform_id}:{title}"
        return hashlib.md5(key.encode()).hexdigest()[:12]
    
    for kw in keywords:
        platform_id = f"topic-kw-{hashlib.md5(kw.encode()).hexdigest()[:8]}"
        news_items = []
        seen_titles = set()
        
        # Search in priority sources first
        if priority_source_ids:
            placeholders = ",".join("?" * len(priority_source_ids))
            try:
                cur = conn.execute(
                    f"""
                    SELECT id, source_id, title, url, published_at
                    FROM rss_entries
                    WHERE source_id IN ({placeholders}) AND title LIKE ?
                    ORDER BY published_at DESC
                    LIMIT ?
                    """,
                    (*priority_source_ids, f"%{kw}%", limit_per_keyword)
                )
                for row in cur.fetchall():
                    norm = normalize_title(row[2])
                    if norm not in seen_titles:
                        seen_titles.add(norm)
                        news_items.append({
                            "stable_id": generate_news_id(platform_id, row[2]),
                            "title": row[2],
                            "display_title": row[2],
                            "url": row[3],
                            "meta": "",
                        })
            except Exception:
                pass
        
        # Search in all entries
        remaining = limit_per_keyword - len(news_items)
        if remaining > 0:
            try:
                cur = conn.execute(
                    """
                    SELECT id, source_id, title, url, published_at
                    FROM rss_entries
                    WHERE title LIKE ?
                    ORDER BY published_at DESC
                    LIMIT ?
                    """,
                    (f"%{kw}%", remaining + 50)
                )
                for row in cur.fetchall():
                    if len(news_items) >= limit_per_keyword:
                        break
                    norm = normalize_title(row[2])
                    if norm not in seen_titles:
                        seen_titles.add(norm)
                        news_items.append({
                            "stable_id": generate_news_id(platform_id, row[2]),
                            "title": row[2],
                            "display_title": row[2],
                            "url": row[3],
                            "meta": "",
                        })
            except Exception:
                pass
        
        # Only add platform if it has news
        if news_items:
            platforms[platform_id] = {
                "id": platform_id,
                "name": f"🔍 {kw}",
                "news": news_items,
                "is_new": False,
            }
    
    return platforms


def _inject_my_tags_category(data: Dict[str, Any]) -> Dict[str, Any]:
    """Inject 'my-tags' as the first category (requires auth, loaded dynamically)."""
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        if "my-tags" in cats:
            return data

        my_tags = {
            "id": "my-tags",
            "name": "我的关注",
            "icon": "🏷️",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
            "requires_auth": True,
            "is_dynamic": True,
        }
        # Insert at the beginning
        data["categories"] = {"my-tags": my_tags, **cats}
        return data
    except Exception:
        return data


def _inject_discovery_category(data: Dict[str, Any]) -> Dict[str, Any]:
    """Inject 'discovery' category after 'my-tags' (public, no auth required)."""
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        if "discovery" in cats:
            return data

        discovery = {
            "id": "discovery",
            "name": "新发现",
            "icon": "✨",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
            "requires_auth": False,
            "is_dynamic": True,
        }
        
        # Insert after my-tags
        new_cats = {}
        for k, v in cats.items():
            new_cats[k] = v
            if k == "my-tags":
                new_cats["discovery"] = discovery
        if "discovery" not in new_cats:
            new_cats["discovery"] = discovery
        data["categories"] = new_cats
        return data
    except Exception:
        return data


def _inject_source_subscription_category(data: Dict[str, Any]) -> Dict[str, Any]:
    """Inject 'source-subscription' category tab for subscribed sources."""
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        if "source-subscription" in cats:
            return data

        source_sub = {
            "id": "source-subscription",
            "name": "订阅",
            "icon": "📡",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
            "requires_auth": True,
            "is_dynamic": True,
        }
        # Insert after my-tags
        new_cats = {}
        for k, v in cats.items():
            new_cats[k] = v
            if k == "my-tags":
                new_cats["source-subscription"] = source_sub
        if "source-subscription" not in new_cats:
            new_cats["source-subscription"] = source_sub
        data["categories"] = new_cats
        return data
    except Exception:
        return data


def _slim_categories_for_ssr(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    优化 SSR 数据：只保留特殊栏目的元数据，普通栏目保留完整数据。
    特殊栏目（explore, my-tags, discovery）有自己的加载逻辑。
    普通栏目（ai, finance, tech_news 等）需要预渲染数据。
    """
    # 直接返回原始数据，不做精简
    # 普通栏目的数据量不大，预渲染可以保证兼容性
    return data


# 默认隐藏的栏目（与前端 settings.js 保持一致）
DEFAULT_HIDDEN_CATEGORIES = ['other', 'general', 'social', 'tech_news', 'developer']

# 特殊栏目，不应该被服务端过滤（它们有自己的动态加载逻辑）
PROTECTED_CATEGORIES = ['my-tags', 'discovery', 'explore', 'source-subscription', 'finance']


def _filter_default_hidden_categories(data: Dict[str, Any], request) -> Dict[str, Any]:
    """
    过滤默认隐藏的栏目，减少 SSR 数据量。
    
    逻辑：
    1. 检查用户是否有自定义配置（通过 Cookie）
    2. 如果没有自定义配置，使用默认隐藏列表
    3. 如果有自定义配置，使用用户的隐藏列表
    4. 特殊栏目（my-tags, discovery 等）不会被过滤
    """
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        
        # 尝试从 Cookie 读取用户的隐藏配置
        hidden_categories = DEFAULT_HIDDEN_CATEGORIES
        try:
            config_cookie = request.cookies.get("hotnews_hidden_cats", "")
            if config_cookie:
                # Cookie 值是 URL 编码的 JSON，需要先解码
                decoded_cookie = unquote(config_cookie)
                user_hidden = json.loads(decoded_cookie)
                if isinstance(user_hidden, list):
                    hidden_categories = user_hidden
        except Exception:
            pass
        
        # 过滤隐藏的栏目（但保护特殊栏目不被过滤）
        filtered_cats = {}
        for cat_id, cat_data in cats.items():
            # 特殊栏目始终保留
            if cat_id in PROTECTED_CATEGORIES:
                filtered_cats[cat_id] = cat_data
            # 主题栏目（topic-xxx）始终保留
            elif cat_id.startswith('topic-'):
                filtered_cats[cat_id] = cat_data
            # 普通栏目根据隐藏列表过滤
            elif cat_id not in hidden_categories:
                filtered_cats[cat_id] = cat_data
        
        data["categories"] = filtered_cats
        return data
    except Exception:
        return data


def _inject_explore_category(data: Dict[str, Any]) -> Dict[str, Any]:
    try:
        cats = data.get("categories") if isinstance(data, dict) else None
        if not isinstance(cats, dict):
            return data
        if "explore" in cats:
            return data

        explore = {
            "id": "explore",
            "name": "精选博客",
            "icon": "🔎",
            "platforms": {},
            "news_count": 0,
            "filtered_count": 0,
            "is_new": False,
        }
        data["categories"] = {"explore": explore, **cats}
        return data
    except Exception:
        return data


def _get_cdn_base_url(project_root) -> str:
    """获取 CDN 基础 URL"""
    try:
        import yaml

        config_path = project_root / "config" / "config.yaml"
        with open(config_path, "r", encoding="utf-8") as f:
            full_config = yaml.safe_load(f) or {}
        viewer_config = full_config.get("viewer", {}) or {}
        return (viewer_config.get("cdn_base_url") or "").strip()
    except Exception:
        return ""


def _load_column_config_for_ssr(project_root) -> List[Dict[str, Any]]:
    """
    Load column_config tree for SSR tab rendering.
    Same logic as /api/columns endpoint, so SSR tabs match the JS-rendered tabs.
    """
    try:
        from hotnews.web.db_online import get_online_db_conn
        conn = get_online_db_conn(project_root)
        rows = conn.execute(
            """
            SELECT id, name, icon, parent_id, tag_ids,
                   source_type, source_filter, default_view,
                   sort_order, enabled
            FROM column_config
            WHERE enabled = 1
            ORDER BY sort_order ASC, id ASC
            """
        ).fetchall()

        if not rows:
            return []

        # Build tree (same as columns_routes.py)
        by_parent: Dict[Optional[str], List[Dict]] = {}
        for row in rows:
            sf_str = row[6] or "{}"
            try:
                sf = json.loads(sf_str)
            except Exception:
                sf = {}
            tag_ids_raw = row[4] or "[]"
            try:
                tag_ids = json.loads(tag_ids_raw)
            except Exception:
                tag_ids = []

            node = {
                "id": row[0],
                "name": row[1],
                "icon": row[2] or "",
                "tag_ids": tag_ids,
                "default_view": row[7] or "timeline",
                "sort_order": row[8] or 0,
                "require_login": bool(sf.get("require_login", False)),
                "children": [],
                "_parent_id": row[3],
            }
            pid = node["_parent_id"]
            by_parent.setdefault(pid, []).append(node)

        def attach_children(nodes):
            result = []
            for node in nodes:
                nid = node["id"]
                children = by_parent.get(nid, [])
                if children:
                    node["children"] = attach_children(children)
                del node["_parent_id"]
                result.append(node)
            return result

        roots = by_parent.get(None, [])
        return attach_children(roots)
    except Exception:
        return []


def _get_asset_rev(project_root) -> str:
    forced = (os.environ.get("ASSET_REV") or "").strip()
    if forced:
        return forced

    # Use the new esbuild output files
    static_dir = project_root / "hotnews" / "web" / "static"
    files_to_hash = [
        static_dir / "css" / "viewer.css",
        static_dir / "js" / "index.js",
        static_dir / "css" / "topic-tracker.css",
        static_dir / "js" / "topic-tracker.js",
        static_dir / "css" / "mobile-enhance.css",
        static_dir / "js" / "src" / "mobile-enhance.js",
    ]

    h = hashlib.md5()
    found = False

    for p in files_to_hash:
        try:
            if p.exists():
                h.update(p.read_bytes())
                found = True
        except Exception:
            pass

    return h.hexdigest() if found else "0"


def _read_user_config_from_cookie(request: Request) -> Optional[dict]:
    """从 Cookie 读取用户配置"""
    try:
        cookie_value = request.cookies.get("hotnews_config")
        if not cookie_value:
            return None

        decoded = unquote(cookie_value)
        config = json.loads(decoded)

        if config.get("v") != 1:
            return None

        return config
    except Exception as e:
        print(f"Failed to read user config from cookie: {e}")
        return None


def _apply_user_config_to_data(data: dict, user_config: dict) -> dict:
    """应用用户配置到数据"""
    try:
        categories = data.get("categories", {})
        if not categories:
            return data

        custom_categories = user_config.get("custom", [])
        hidden_categories = user_config.get("hidden", [])
        category_order = user_config.get("order", [])

        result_categories = {}

        for cat_id in category_order:
            if cat_id in hidden_categories:
                continue

            custom_cat = next((c for c in custom_categories if c.get("id") == cat_id), None)

            if custom_cat:
                platforms = {}
                for platform_id in custom_cat.get("platforms", []):
                    for cat in categories.values():
                        if platform_id in cat.get("platforms", {}):
                            platforms[platform_id] = cat["platforms"][platform_id]
                            break

                if platforms:
                    result_categories[cat_id] = {
                        "name": custom_cat.get("name", cat_id),
                        "icon": "📱",
                        "platforms": platforms,
                    }
            elif cat_id in categories:
                result_categories[cat_id] = categories[cat_id]

        for cat_id, cat_data in categories.items():
            if cat_id not in result_categories and cat_id not in hidden_categories:
                result_categories[cat_id] = cat_data

        data["categories"] = result_categories
        return data

    except Exception as e:
        print(f"Failed to apply user config: {e}")
        return data


def _build_e2e_viewer_data() -> Dict[str, Any]:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def item(pid: str, title: str, url: str) -> Dict[str, Any]:
        return {
            "stable_id": f"{pid}-e2e",
            "title": title,
            "display_title": title,
            "url": url,
            "meta": "",
        }

    def platform(pid: str, name: str) -> Dict[str, Any]:
        return {
            "id": pid,
            "name": name,
            "news": [item(pid, f"{name} Item", f"https://example.com/{pid}")],
            "is_new": False,
        }

    social_plats = {
        "weibo": platform("weibo", "微博"),
        "douyin": platform("douyin", "抖音"),
        "bilibili-hot-search": platform("bilibili-hot-search", "B站"),
        "tieba": platform("tieba", "贴吧"),
        "hupu": platform("hupu", "虎扑"),
        "social-extra": platform("social-extra", "Extra"),
    }

    finance_plats = {
        "caixin": platform("caixin", "财新"),
        "wallstreetcn-hot": platform("wallstreetcn-hot", "华尔街见闻"),
        "wallstreetcn-quick": platform("wallstreetcn-quick", "华尔街见闻快讯"),
        "cls-hot": platform("cls-hot", "财联社"),
        "cls-telegraph": platform("cls-telegraph", "财联社电报"),
        "xueqiu": platform("xueqiu", "雪球"),
    }

    general_plats = {
        "toutiao": platform("toutiao", "今日头条"),
        "baidu": platform("baidu", "百度"),
    }

    data: Dict[str, Any] = {
        "updated_at": now,
        "filter_mode": "off",
        "categories": {
            "social": {
                "id": "social",
                "name": "社交娱乐",
                "icon": "🔥",
                "news_limit": 10,
                "platforms": social_plats,
                "news_count": len(social_plats),
                "filtered_count": 0,
                "is_new": False,
            },
            "finance": {
                "id": "finance",
                "name": "财经投资",
                "icon": "💰",
                "news_limit": 10,
                "platforms": finance_plats,
                "news_count": len(finance_plats),
                "filtered_count": 0,
                "is_new": False,
            },
            "general": {
                "id": "general",
                "name": "综合新闻",
                "icon": "📰",
                "news_limit": 10,
                "platforms": general_plats,
                "news_count": len(general_plats),
                "filtered_count": 0,
                "is_new": False,
            },
        },
    }
    return _inject_explore_category(data)


async def render_viewer_page(
    request: Request,
    filter: Optional[str],
    platforms: Optional[str],
    *,
    get_services: Callable[[], Any],
    templates: Any,
    project_root: Any,
    beta_can_mint_identity: Callable[[Request], bool],
    get_user_db_conn: Callable[[], Any],
    create_user_with_cookie_identity: Callable[..., Any],
    merge_rss_subscription_news_into_data: Optional[Callable[..., Dict[str, Any]]] = None,
):
    viewer_service, _ = get_services()

    platform_list = None
    if platforms:
        platform_list = [p.strip() for p in platforms.split(",") if p.strip()]

    # Load system settings first
    from hotnews.kernel.admin.settings_admin import get_system_settings
    sys_settings = get_system_settings(project_root)
    items_per_card = sys_settings.get("display", {}).get("items_per_card", 20)

    try:
        qp = getattr(request, "query_params", None)
        e2e = str(qp.get("e2e") if qp else "").strip()
        allow_e2e = e2e == "1"

        if allow_e2e:
            data = _build_e2e_viewer_data()
        else:
            data = viewer_service.get_categorized_news(
                platforms=platform_list,
                limit=10000,
                apply_filter=True,
                filter_mode=filter,
                per_platform_limit=sys_settings.get("display", {}).get("items_per_card", 50)
            )

        data = _inject_explore_category(data)
        data = _inject_my_tags_category(data)
        # 安全修复：不再在服务端注入用户主题，改为前端动态加载
        # 这样即使页面被 CDN/Nginx 缓存，也不会泄露用户主题
        # data = _inject_user_topics_as_categories(data, request)
        data = _inject_discovery_category(data)
        # Removed: source-subscription tab is now integrated into user settings page
        # data = _inject_source_subscription_category(data)

        if callable(merge_rss_subscription_news_into_data):
            try:
                data = merge_rss_subscription_news_into_data(request=request, data=data)
            except Exception:
                pass

        # 过滤默认隐藏的栏目，减少 SSR 数据量
        data = _filter_default_hidden_categories(data, request)

        # 优化：只保留第一个激活栏目的完整数据，其他栏目只保留元数据
        # 这样可以大幅减少初始 HTML 大小
        data = _slim_categories_for_ssr(data)

        cdn_base_url = _get_cdn_base_url(project_root)
        static_prefix = cdn_base_url if cdn_base_url else "/static"

        asset_rev = _get_asset_rev(project_root)

        # Load column_config for SSR tab rendering (same source as /api/columns)
        ssr_columns = _load_column_config_for_ssr(project_root)

        is_mobile = _detect_mobile(request)

        resp = templates.TemplateResponse(
            "viewer.html",
            {
                "request": request,
                "data": data,
                "available_filters": ["strict", "moderate", "off"],
                "current_filter": filter or data.get("filter_mode", "moderate"),
                "static_prefix": static_prefix,
                "asset_rev": asset_rev,
                "items_per_card": items_per_card,
                "sys_settings": sys_settings,
                "ssr_columns": ssr_columns,
                "ssr_columns_json": json.dumps(ssr_columns, ensure_ascii=False),
                "is_mobile": is_mobile,
            },
        )

        # 缓存策略由 server.py 中间件统一控制（HTML: public, max-age=60）
        # 不在此处设置，避免与中间件产生矛盾的头信息

        # Note: Removed automatic anonymous user creation - users must login now

        return resp
    except Exception as e:
        return HTMLResponse(
            content=f"""
            <html>
                <head><title>错误</title></head>
                <body>
                    <h1>加载失败</h1>
                    <p>错误信息: {str(e)}</p>
                    <p>请确保已经运行过爬虫并有新闻数据。</p>
                </body>
            </html>
            """,
            status_code=500,
        )

def _detect_mobile(request: Request) -> bool:
    """通过 User-Agent 粗略判断是否为移动端，用于条件加载资源。

    不需要 100% 精确 — 只是优化提示，客户端 JS 仍有自己的检测逻辑。
    """
    ua = (request.headers.get("user-agent") or "").lower()
    mobile_keywords = ("mobile", "android", "iphone", "ipad", "ipod", "webos", "opera mini", "ucbrowser", "micromessenger")
    return any(kw in ua for kw in mobile_keywords)


