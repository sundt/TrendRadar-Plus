"""
TrendRadar Web Viewer Server

提供基于 Web 的新闻分类查看器界面
支持定时自动获取最新数据
"""

import asyncio
import os
import sqlite3
import sys
import time
from collections import deque
from datetime import datetime, date, timedelta
from pathlib import Path
from threading import Lock
from typing import Optional
from urllib.parse import unquote

from fastapi import FastAPI, Request, Query
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import json
import requests

# 添加项目根目录到 Python 路径
# trendradar/web/server.py -> trendradar/web -> trendradar -> hotnews (项目根目录)
project_root = Path(__file__).parent.parent.parent
sys.path.insert(0, str(project_root))

from trendradar.web.news_viewer import NewsViewerService
from mcp_server.services.data_service import DataService
from mcp_server.services.cache_service import get_cache
from trendradar.crawler import DataFetcher
from trendradar.core import load_config
from trendradar.storage import convert_crawl_results_to_news_data

# 创建 FastAPI 应用
app = FastAPI(title="TrendRadar News Viewer", version="1.0.0")

# 启用 Gzip 压缩（响应大于 500 字节时压缩）
app.add_middleware(GZipMiddleware, minimum_size=500)

# 挂载静态文件目录（带缓存控制）
static_dir = Path(__file__).parent / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")


# 静态资源缓存中间件
@app.middleware("http")
async def add_cache_headers(request: Request, call_next):
    response = await call_next(request)
    path = request.url.path
    
    # 为静态资源添加缓存头
    if path.startswith("/static/"):
        # CSS/JS 文件缓存 1 小时（开发期间），生产环境可设更长
        response.headers["Cache-Control"] = "public, max-age=3600"
    
    return response

_FETCH_METRICS_MAX = 5000
_fetch_metrics = deque(maxlen=_FETCH_METRICS_MAX)
_fetch_metrics_lock = Lock()

_last_platform_content_keys = {}


def _metrics_file_path() -> Path:
    return project_root / "output" / "metrics" / "fetch_metrics.jsonl"


def _append_fetch_metrics_batch(metrics):
    if not metrics:
        return

    try:
        fp = _metrics_file_path()
        fp.parent.mkdir(parents=True, exist_ok=True)
        with fp.open("a", encoding="utf-8") as f:
            for m in metrics:
                f.write(json.dumps(m, ensure_ascii=False) + "\n")

        try:
            lines = fp.read_text(encoding="utf-8").splitlines()
        except Exception:
            lines = []
        if len(lines) > _FETCH_METRICS_MAX:
            fp.write_text("\n".join(lines[-_FETCH_METRICS_MAX:]) + "\n", encoding="utf-8")
    except Exception:
        return


def _record_fetch_metrics(metrics):
    if not metrics:
        return

    with _fetch_metrics_lock:
        for m in metrics:
            _fetch_metrics.append(m)


# 自定义 JSONResponse 类，确保中文正确显示
class UnicodeJSONResponse(Response):
    media_type = "application/json"
    
    def render(self, content) -> bytes:
        return json.dumps(
            content,
            ensure_ascii=False,
            allow_nan=False,
            indent=None,
            separators=(",", ":"),
        ).encode("utf-8")

# 配置模板目录
templates_dir = Path(__file__).parent / "templates"
templates_dir.mkdir(exist_ok=True)
templates = Jinja2Templates(directory=str(templates_dir))

# 全局服务实例
_viewer_service: Optional[NewsViewerService] = None
_data_service: Optional[DataService] = None

# 定时任务状态
_scheduler_task: Optional[asyncio.Task] = None
_scheduler_running: bool = False
_last_fetch_time: Optional[datetime] = None
_fetch_interval_minutes: int = 30  # 默认30分钟获取一次

_online_db_conn: Optional[sqlite3.Connection] = None


def _get_online_db_conn() -> sqlite3.Connection:
    global _online_db_conn

    if _online_db_conn is not None:
        return _online_db_conn

    output_dir = project_root / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    db_path = output_dir / "online.db"

    conn = sqlite3.connect(str(db_path), check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA synchronous=NORMAL")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS online_sessions (session_id TEXT PRIMARY KEY, last_seen INTEGER NOT NULL)"
    )
    conn.commit()

    _online_db_conn = conn
    return conn


def get_services():
    """获取或初始化服务实例"""
    global _viewer_service, _data_service
    
    if _viewer_service is None:
        _data_service = DataService(project_root=str(project_root))
        _viewer_service = NewsViewerService(
            project_root=str(project_root),
            data_service=_data_service
        )
    
    return _viewer_service, _data_service


async def fetch_news_data():
    """执行一次数据获取"""
    global _last_fetch_time

    def _run_blocking_fetch():
        try:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] 🔄 开始获取最新数据...")

            # 加载配置
            config = load_config(str(project_root / "config" / "config.yaml"))

            # 获取平台列表（load_config 返回的 key 是大写 PLATFORMS）
            platforms_config = config.get("PLATFORMS", [])

            # 处理列表格式：[{id: "xxx", name: "xxx"}, ...]
            if isinstance(platforms_config, list):
                platforms = {p["id"]: p["name"] for p in platforms_config if isinstance(p, dict) and "id" in p}
            else:
                # 字典格式：{id: name, ...}
                platforms = platforms_config

            platform_ids = list(platforms.keys())

            if not platform_ids:
                print("⚠️ 未配置任何平台")
                return {"success": False, "error": "未配置平台"}

            # 创建数据获取器
            crawler_config = config.get("CRAWLER", {})
            proxy_url = crawler_config.get("proxy_url") if crawler_config.get("use_proxy") else None
            api_url = crawler_config.get("api_url")
            fetcher = DataFetcher(proxy_url=proxy_url, api_url=api_url)

            # 构建平台ID和名称的元组列表
            platform_tuples = [(pid, platforms[pid]) for pid in platform_ids]

            # 批量获取数据（阻塞调用，放到线程里执行，避免卡住事件循环）
            crawl_results, id_to_name, failed_ids = fetcher.crawl_websites(platform_tuples)

            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            batch_metrics = []
            for m in getattr(fetcher, "last_crawl_metrics", []) or []:
                if not isinstance(m, dict):
                    continue
                mm = dict(m)
                mm["fetched_at"] = now_str

                pid = str(mm.get("platform_id") or "").strip()
                content_keys = mm.pop("_content_keys", None)
                changed_count = None
                if pid and isinstance(content_keys, list):
                    prev = _last_platform_content_keys.get(pid)
                    if isinstance(prev, list) and prev:
                        prev_set = set(prev)
                        changed_count = sum(1 for k in content_keys if k not in prev_set)
                    else:
                        changed_count = len(content_keys)
                    _last_platform_content_keys[pid] = content_keys

                mm["changed_count"] = changed_count
                batch_metrics.append(mm)
            _record_fetch_metrics(batch_metrics)
            _append_fetch_metrics_batch(batch_metrics)

            if not crawl_results:
                print("⚠️ 未获取到任何数据")
                return {"success": False, "error": "未获取到数据"}

            # 获取当前时间
            now = datetime.now()
            crawl_time = now.strftime("%H:%M")
            crawl_date = now.strftime("%Y-%m-%d")

            # 转换并保存数据
            news_data = convert_crawl_results_to_news_data(
                crawl_results,
                id_to_name,
                failed_ids,
                crawl_time,
                crawl_date,
            )

            # 获取存储管理器并保存
            from trendradar.storage import StorageManager

            # 使用正确的存储配置初始化
            storage_config = config.get("STORAGE", {})
            storage = StorageManager(
                backend_type=storage_config.get("backend", "local"),
                data_dir=str(project_root / storage_config.get("local", {}).get("data_dir", "output")),
                enable_txt=storage_config.get("formats", {}).get("txt", False),
                enable_html=storage_config.get("formats", {}).get("html", False),
            )
            storage.save_news_data(news_data)

            try:
                from trendradar.providers.runner import build_default_registry, run_provider_ingestion_once

                print(f"[{now.strftime('%H:%M:%S')}] 🔄 运行 Provider Ingestion...")
                ok, metrics = run_provider_ingestion_once(
                    registry=build_default_registry(),
                    project_root=project_root,
                    config_path=project_root / "config" / "config.yaml",
                    now=now,
                )
                if metrics:
                    for m in metrics:
                        pid = m.get("platform_id", "?")
                        status = m.get("status", "?")
                        count = m.get("items_count", 0)
                        print(f"  - {pid}: {status} ({count} items)")
                else:
                    print("  - Provider Ingestion: 无配置或已禁用")
            except Exception as e:
                print(f"[{now.strftime('%H:%M:%S')}] ⚠️ Provider Ingestion 失败: {e}")

            global _viewer_service, _data_service, _last_fetch_time
            _last_fetch_time = datetime.now()

            # 清除缓存以加载新数据
            from mcp_server.services.cache_service import get_cache
            from trendradar.web.news_viewer import clear_categorized_news_cache

            cache = get_cache()
            cache.clear()  # 清除所有缓存
            clear_categorized_news_cache()  # 清除分类新闻缓存

            # 重置服务实例
            _viewer_service = None
            _data_service = None

            total_news = sum(len(items) for items in crawl_results.values())
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ 数据获取完成: {len(crawl_results)} 个平台, {total_news} 条新闻")

            return {"success": True, "platforms": len(crawl_results), "news_count": total_news}

        except Exception as e:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ❌ 数据获取失败: {e}")
            return {"success": False, "error": str(e)}

    return await asyncio.to_thread(_run_blocking_fetch)


@app.get("/api/fetch-metrics")
async def api_fetch_metrics(
    limit: int = Query(200, ge=1, le=_FETCH_METRICS_MAX),
    platform: Optional[str] = Query(None),
    provider: Optional[str] = Query(None),
):
    with _fetch_metrics_lock:
        items = list(_fetch_metrics)

    if provider:
        items = [m for m in items if str(m.get("provider") or "").strip() == provider]
    if platform:
        items = [m for m in items if str(m.get("platform_id") or "").strip() == platform]

    items = items[-limit:]

    summary = {}
    for m in items:
        pid = str(m.get("platform_id") or "").strip() or "unknown"
        ent = summary.get(pid)
        if ent is None:
            ent = {
                "platform_id": pid,
                "platform_name": m.get("platform_name") or pid,
                "provider": m.get("provider") or "",
                "success": 0,
                "cache": 0,
                "error": 0,
                "avg_duration_ms": None,
                "avg_items_count": None,
                "avg_changed_count": None,
                "last_status": None,
                "last_fetched_at": None,
                "last_changed_count": None,
                "last_content_hash": None,
            }
            summary[pid] = ent

        st = str(m.get("status") or "").strip()
        if st in ("success", "cache", "error"):
            ent[st] += 1
        else:
            ent["error"] += 1

        ent["last_status"] = st
        ent["last_fetched_at"] = m.get("fetched_at")
        ent["last_changed_count"] = m.get("changed_count")
        ent["last_content_hash"] = m.get("content_hash")

        dur = m.get("duration_ms")
        cnt = m.get("items_count")
        chg = m.get("changed_count")
        if isinstance(dur, (int, float)):
            ent.setdefault("_dur_sum", 0)
            ent.setdefault("_dur_n", 0)
            ent["_dur_sum"] += float(dur)
            ent["_dur_n"] += 1
        if isinstance(cnt, (int, float)):
            ent.setdefault("_cnt_sum", 0)
            ent.setdefault("_cnt_n", 0)
            ent["_cnt_sum"] += float(cnt)
            ent["_cnt_n"] += 1
        if isinstance(chg, (int, float)):
            ent.setdefault("_chg_sum", 0)
            ent.setdefault("_chg_n", 0)
            ent["_chg_sum"] += float(chg)
            ent["_chg_n"] += 1

    for ent in summary.values():
        dn = ent.pop("_dur_n", 0)
        ds = ent.pop("_dur_sum", 0)
        cn = ent.pop("_cnt_n", 0)
        cs = ent.pop("_cnt_sum", 0)
        hn = ent.pop("_chg_n", 0)
        hs = ent.pop("_chg_sum", 0)
        if dn:
            ent["avg_duration_ms"] = int(ds / dn)
        if cn:
            ent["avg_items_count"] = round(cs / cn, 2)
        if hn:
            ent["avg_changed_count"] = round(hs / hn, 2)

    return UnicodeJSONResponse(content={"limit": limit, "metrics": items, "summary": list(summary.values())})


async def scheduler_loop():
    """定时任务循环"""
    global _scheduler_running
    
    while _scheduler_running:
        await fetch_news_data()
        
        # 等待下一次执行
        print(f"⏰ 下次获取时间: {_fetch_interval_minutes} 分钟后")
        await asyncio.sleep(_fetch_interval_minutes * 60)


def start_scheduler(interval_minutes: int = 30):
    """启动定时任务"""
    global _scheduler_task, _scheduler_running, _fetch_interval_minutes
    
    if _scheduler_running:
        print("⚠️ 定时任务已在运行中")
        return
    
    _fetch_interval_minutes = interval_minutes
    _scheduler_running = True
    _scheduler_task = asyncio.create_task(scheduler_loop())
    print(f"✅ 定时任务已启动，间隔: {interval_minutes} 分钟")


def stop_scheduler():
    """停止定时任务"""
    global _scheduler_task, _scheduler_running
    
    _scheduler_running = False
    if _scheduler_task:
        _scheduler_task.cancel()
        _scheduler_task = None
    print("⏹️ 定时任务已停止")


def _get_cdn_base_url() -> str:
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


def _read_user_config_from_cookie(request: Request) -> Optional[dict]:
    """从 Cookie 读取用户配置"""
    try:
        cookie_value = request.cookies.get("trendradar_config")
        if not cookie_value:
            return None
        
        # 解码并解析 JSON
        decoded = unquote(cookie_value)
        config = json.loads(decoded)
        
        # 验证版本
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
        
        # 获取配置
        custom_categories = user_config.get("custom", [])
        hidden_categories = user_config.get("hidden", [])
        category_order = user_config.get("order", [])
        
        # 构建新的分类字典
        result_categories = {}
        
        # 按照用户定义的顺序处理
        for cat_id in category_order:
            # 跳过隐藏的分类
            if cat_id in hidden_categories:
                continue
            
            # 检查是否是自定义分类
            custom_cat = next((c for c in custom_categories if c.get("id") == cat_id), None)
            
            if custom_cat:
                # 自定义分类：从所有平台中筛选
                platforms = {}
                for platform_id in custom_cat.get("platforms", []):
                    # 在所有默认分类中查找该平台
                    for cat in categories.values():
                        if platform_id in cat.get("platforms", {}):
                            platforms[platform_id] = cat["platforms"][platform_id]
                            break
                
                if platforms:
                    result_categories[cat_id] = {
                        "name": custom_cat.get("name", cat_id),
                        "icon": "📱",
                        "platforms": platforms
                    }
            elif cat_id in categories:
                # 默认分类：直接使用
                result_categories[cat_id] = categories[cat_id]
        
        # 添加未在 order 中的默认分类（但不在 hidden 中）
        for cat_id, cat_data in categories.items():
            if cat_id not in result_categories and cat_id not in hidden_categories:
                result_categories[cat_id] = cat_data
        
        # 更新数据
        data["categories"] = result_categories
        return data
        
    except Exception as e:
        print(f"Failed to apply user config: {e}")
        return data


async def _render_viewer_page(
    request: Request,
    filter: Optional[str],
    platforms: Optional[str],
):
    viewer_service, _ = get_services()

    platform_list = None
    if platforms:
        platform_list = [p.strip() for p in platforms.split(",") if p.strip()]

    try:
        data = viewer_service.get_categorized_news(
            platforms=platform_list,
            limit=5000,
            apply_filter=True,
            filter_mode=filter,
        )

        # 获取 CDN 配置
        cdn_base_url = _get_cdn_base_url()
        static_prefix = cdn_base_url if cdn_base_url else "/static"

        return templates.TemplateResponse(
            "viewer.html",
            {
                "request": request,
                "data": data,
                "available_filters": ["strict", "moderate", "off"],
                "current_filter": filter or data.get("filter_mode", "moderate"),
                "static_prefix": static_prefix,
            },
        )
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


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    return await _render_viewer_page(request, filter=None, platforms=None)


@app.get("/viewer", response_class=HTMLResponse)
async def viewer(
    request: Request,
    filter: Optional[str] = Query(None, description="过滤模式: strict/moderate/off"),
    platforms: Optional[str] = Query(None, description="平台列表，逗号分隔")
):
    """
    新闻分类查看器主页面
    
    Args:
        filter: 临时覆盖过滤模式
        platforms: 指定要查看的平台（逗号分隔）
    """
    return await _render_viewer_page(request, filter=filter, platforms=platforms)


@app.get("/api/news")
async def api_news(
    platforms: Optional[str] = Query(None),
    limit: int = Query(5000, ge=1, le=10000),
    filter_mode: Optional[str] = Query(None)
):
    """API: 获取分类新闻数据（JSON格式）"""
    viewer_service, _ = get_services()
    
    platform_list = None
    if platforms:
        platform_list = [p.strip() for p in platforms.split(",") if p.strip()]
    
    data = viewer_service.get_categorized_news(
        platforms=platform_list,
        limit=limit,
        apply_filter=True,
        filter_mode=filter_mode
    )

    return UnicodeJSONResponse(content=data)


@app.get("/api/nba-today")
async def api_nba_today():
    today = date.today().strftime("%Y-%m-%d")
    url = f"https://matchweb.sports.qq.com/kbs/list?columnId=100000&startTime={today}&endTime={today}"

    def _fetch():
        resp = requests.get(
            url,
            headers={
                "Referer": "https://kbs.sports.qq.com/",
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json, text/plain, */*",
            },
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()

    try:
        payload = await asyncio.to_thread(_fetch)
    except Exception as e:
        return JSONResponse(content={"detail": f"Failed to fetch Tencent NBA data: {e}"}, status_code=502)

    from trendradar.providers.tencent_nba import _extract_tencent_nba_matches

    games = _extract_tencent_nba_matches(payload)
    return UnicodeJSONResponse(content={"date": today, "games": games})


@app.post("/api/online/ping")
async def online_ping(request: Request):
    body = {}
    try:
        body = await request.json()
    except Exception:
        body = {}

    session_id = (body.get("session_id") or "").strip()
    if not session_id:
        return JSONResponse(content={"detail": "Missing session_id"}, status_code=400)

    now = int(time.time())
    conn = _get_online_db_conn()
    conn.execute(
        "INSERT OR REPLACE INTO online_sessions(session_id, last_seen) VALUES (?, ?)",
        (session_id, now),
    )
    conn.execute("DELETE FROM online_sessions WHERE last_seen < ?", (now - 86400,))
    conn.commit()

    return JSONResponse(content={"ok": True})


@app.get("/api/online")
async def online_stats():
    now = int(time.time())
    conn = _get_online_db_conn()

    def count_since(seconds: int) -> int:
        cur = conn.execute(
            "SELECT COUNT(*) FROM online_sessions WHERE last_seen >= ?",
            (now - seconds,),
        )
        row = cur.fetchone()
        return int(row[0] if row else 0)

    stats = {
        "online_1m": count_since(60),
        "online_5m": count_since(5 * 60),
        "online_15m": count_since(15 * 60),
        "server_time": now,
    }

    return JSONResponse(content=stats)


@app.get("/api/categories")
async def api_categories():
    """API: 获取分类列表"""
    viewer_service, _ = get_services()
    categories = viewer_service.get_category_list()
    return UnicodeJSONResponse(content=categories)


@app.get("/api/filter/stats")
async def api_filter_stats():
    """API: 获取过滤统计"""
    viewer_service, _ = get_services()
    stats = viewer_service.get_filter_stats()
    return UnicodeJSONResponse(content=stats)


@app.post("/api/filter/mode")
async def api_set_filter_mode(mode: str):
    """API: 设置过滤模式"""
    viewer_service, _ = get_services()
    success = viewer_service.set_filter_mode(mode)
    return UnicodeJSONResponse(content={"success": success, "mode": mode})


@app.get("/api/blacklist/keywords")
async def api_blacklist_keywords():
    """API: 获取黑名单关键词"""
    viewer_service, _ = get_services()
    keywords = viewer_service.get_blacklist_keywords()
    return UnicodeJSONResponse(content={"keywords": keywords})


@app.post("/api/blacklist/reload")
async def api_reload_blacklist():
    """API: 重新加载黑名单"""
    viewer_service, _ = get_services()
    count = viewer_service.reload_blacklist()
    return UnicodeJSONResponse(content={"success": True, "keywords_count": count})


@app.get("/health")
async def health():
    """健康检查"""
    return {
        "status": "healthy",
        "service": "TrendRadar News Viewer",
        "health_schema": "2",
        "version": os.environ.get("APP_VERSION", "unknown"),
        "config_rev": os.environ.get("CONFIG_REV", "0"),
    }


# === 定时任务相关 API ===

@app.post("/api/scheduler/start")
async def api_start_scheduler(interval: int = Query(30, ge=5, le=1440)):
    """
    启动定时数据获取任务
    
    Args:
        interval: 获取间隔（分钟），默认30，范围5-1440
    """
    start_scheduler(interval)
    return UnicodeJSONResponse(content={
        "success": True,
        "message": f"定时任务已启动，间隔 {interval} 分钟",
        "interval_minutes": interval
    })


@app.post("/api/scheduler/stop")
async def api_stop_scheduler():
    """停止定时数据获取任务"""
    stop_scheduler()
    return UnicodeJSONResponse(content={
        "success": True,
        "message": "定时任务已停止"
    })


@app.get("/api/scheduler/status")
async def api_scheduler_status():
    """获取定时任务状态"""
    return UnicodeJSONResponse(content={
        "running": _scheduler_running,
        "interval_minutes": _fetch_interval_minutes,
        "last_fetch_time": _last_fetch_time.isoformat() if _last_fetch_time else None
    })


@app.post("/api/fetch")
async def api_fetch_now():
    """立即执行一次数据获取"""
    result = await fetch_news_data()
    try:
        get_cache().clear()
    except Exception:
        pass
    return UnicodeJSONResponse(content=result)


async def _warmup_cache():
    """预热缓存：在服务启动时预加载数据"""
    try:
        print("🔥 预热缓存中...")
        start_time = time.time()
        
        # 预加载新闻数据到缓存
        viewer_service, _ = get_services()
        viewer_service.get_categorized_news(
            platforms=None,
            limit=5000,
            apply_filter=True,
            filter_mode=None
        )
        
        elapsed = time.time() - start_time
        print(f"✅ 缓存预热完成 ({elapsed:.2f}s)")
    except Exception as e:
        print(f"⚠️ 缓存预热失败: {e}")


@app.on_event("startup")
async def on_startup():
    """服务器启动时的初始化"""
    # 1. 预热缓存
    await _warmup_cache()
    
    # 2. 读取配置决定是否自动启动定时任务
    try:
        import yaml
        config_path = project_root / "config" / "config.yaml"
        with open(config_path, "r", encoding="utf-8") as f:
            full_config = yaml.safe_load(f) or {}
        viewer_config = full_config.get("viewer", {}) or {}
        
        auto_fetch = viewer_config.get("auto_fetch", False)
        fetch_interval = viewer_config.get("fetch_interval_minutes", 30)
        
        if auto_fetch:
            print(f"📅 自动启动定时获取任务 (间隔: {fetch_interval} 分钟)")
            start_scheduler(fetch_interval)

            # scheduler_loop 本身会立即执行一次 fetch_news_data()，避免启动时重复触发
    except Exception as e:
        print(f"⚠️ 读取配置失败，跳过自动定时任务: {e}")


def run_server(host: str = "0.0.0.0", port: int = 8080, auto_fetch: bool = False, interval: int = 30):
    """运行 Web 服务器"""
    import uvicorn
    
    print("=" * 60)
    print("🚀 TrendRadar News Viewer Server")
    print("=" * 60)
    print(f"📡 Server Address: http://{host}:{port}")
    print(f"🌐 Viewer URL: http://localhost:{port}/viewer")
    print(f"📊 API Docs: http://localhost:{port}/docs")
    print("-" * 60)
    print("📌 定时任务 API:")
    print(f"   POST /api/scheduler/start?interval=30  启动定时获取")
    print(f"   POST /api/scheduler/stop               停止定时获取")
    print(f"   GET  /api/scheduler/status             查看任务状态")
    print(f"   POST /api/fetch                        立即获取一次")
    print("=" * 60)
    print()
    
    uvicorn.run(app, host=host, port=port)


if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="TrendRadar News Viewer Server")
    parser.add_argument("--host", default="0.0.0.0", help="监听地址")
    parser.add_argument("--port", type=int, default=8080, help="监听端口")
    
    args = parser.parse_args()
    run_server(host=args.host, port=args.port)
