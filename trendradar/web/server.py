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
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, Query
from fastapi.responses import HTMLResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
import json

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

            global _viewer_service, _data_service, _last_fetch_time
            _last_fetch_time = datetime.now()

            # 清除缓存以加载新数据
            from mcp_server.services.cache_service import get_cache

            cache = get_cache()
            cache.clear()  # 清除所有缓存

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

        return templates.TemplateResponse(
            "viewer.html",
            {
                "request": request,
                "data": data,
                "available_filters": ["strict", "moderate", "off"],
                "current_filter": filter or data.get("filter_mode", "moderate"),
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


@app.on_event("startup")
async def on_startup():
    """服务器启动时的初始化"""
    # 读取配置决定是否自动启动定时任务
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
