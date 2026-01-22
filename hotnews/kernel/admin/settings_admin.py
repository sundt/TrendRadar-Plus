# coding=utf-8
"""
系统配置管理 API

提供系统配置的读取和保存功能。
采用混合方案：数据库优先，YAML 作为默认值。
"""

import json
import time
import os
from pathlib import Path
from typing import Any, Dict

import yaml
from fastapi import APIRouter, Body, Request
from fastapi.responses import JSONResponse

from hotnews.web.db_online import get_online_db_conn

router = APIRouter()

# 配置项 key
SETTINGS_KEY = "system_settings_v1"


def _ensure_admin_kv(conn) -> None:
    """确保 admin_kv 表存在"""
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


def _get_project_root(request: Request) -> Path:
    """获取项目根目录"""
    return Path(request.app.state.project_root)


def _load_yaml_defaults(project_root: Path) -> Dict[str, Any]:
    """从 config.yaml 加载默认配置"""
    config_path = project_root / "config" / "config.yaml"
    defaults = {
        "scheduler": {
            "auto_fetch": True,
            "fetch_interval_minutes": 15,
            "fetch_on_startup": True,
            "request_interval": 1000,
        },
        "search": {
            "search_days": 30,
            "vector_enabled": True,
            "embedding_model": "shibing624/text2vec-base-chinese",
            "vector_top_k": 50,
            "keyword_min_score": 0.3,
        },
        "retention": {
            "local_retention_days": 0,
            "remote_retention_days": 0,
            "rss_entries_retention_days": 90,  # RSS 条目保留天数（基于入库时间，0 = 永久保留）
            "push_window_enabled": False,
            "push_window_start": "20:00",
            "push_window_end": "22:00",
        },
        "display": {
            "items_per_card": 20,
            "morning_brief_items": 50,
        },
        "ai": {
            "mb_ai_enabled": True,
            "rss_source_ai_enabled": False,
            "custom_ingest_ai_enabled": True, # Default to True as per user implication, or False? Let's say True for now or match others.
        },
        "scraperapi": {
            "enabled": True,                   # 全局开关
            "max_calls_per_hour": 100,         # 每小时最大调用次数 (0 = 无限制)
            "max_calls_per_day": 1000,         # 每天最大调用次数 (0 = 无限制)
            "default_cron": "0 */6 * * *",     # 默认调度 (每6小时)
        }
    }

    if not config_path.exists():
        # Fallback to env vars
        defaults["ai"]["mb_ai_enabled"] = (os.environ.get("HOTNEWS_MB_AI_ENABLED") or "0").strip().lower() in {"1", "true", "yes"}
        defaults["ai"]["rss_source_ai_enabled"] = (os.environ.get("HOTNEWS_RSS_SOURCE_AI_ENABLED") or "0").strip().lower() in {"1", "true", "yes"}
        # Custom ingest AI env var? define new one HOTNEWS_CUSTOM_INGEST_AI_ENABLED
        defaults["ai"]["custom_ingest_ai_enabled"] = (os.environ.get("HOTNEWS_CUSTOM_INGEST_AI_ENABLED") or "1").strip().lower() in {"1", "true", "yes"}
        return defaults

    try:
        with open(config_path, "r", encoding="utf-8") as f:
            yaml_config = yaml.safe_load(f) or {}

        # 从 YAML 提取对应的配置项
        viewer = yaml_config.get("viewer", {})
        crawler = yaml_config.get("crawler", {})
        storage = yaml_config.get("storage", {})
        notification = yaml_config.get("notification", {})
        # ai config might not be in yaml yet, assume env vars primarily for now

        defaults["scheduler"]["auto_fetch"] = viewer.get("auto_fetch", True)
        defaults["scheduler"]["fetch_interval_minutes"] = viewer.get("fetch_interval_minutes", 15)
        defaults["scheduler"]["fetch_on_startup"] = viewer.get("fetch_on_startup", True)
        defaults["scheduler"]["request_interval"] = crawler.get("request_interval", 1000)

        # Search config comes from environment/search module defaults
        
        local_storage = storage.get("local", {})
        remote_storage = storage.get("remote", {})
        push_window = notification.get("push_window", {})

        defaults["retention"]["local_retention_days"] = local_storage.get("retention_days", 0)
        defaults["retention"]["remote_retention_days"] = remote_storage.get("retention_days", 0)
        defaults["retention"]["push_window_enabled"] = push_window.get("enabled", False)

        time_range = push_window.get("time_range", {})
        defaults["retention"]["push_window_start"] = time_range.get("start", "20:00")
        defaults["retention"]["push_window_end"] = time_range.get("end", "22:00")
        
        # AI Defaults from Env (since not standard in config.yaml yet)
        defaults["ai"]["mb_ai_enabled"] = (os.environ.get("HOTNEWS_MB_AI_ENABLED") or "0").strip().lower() in {"1", "true", "yes"}
        defaults["ai"]["rss_source_ai_enabled"] = (os.environ.get("HOTNEWS_RSS_SOURCE_AI_ENABLED") or "0").strip().lower() in {"1", "true", "yes"}
        defaults["ai"]["custom_ingest_ai_enabled"] = (os.environ.get("HOTNEWS_CUSTOM_INGEST_AI_ENABLED") or "1").strip().lower() in {"1", "true", "yes"}

    except Exception:
        pass

    return defaults


def get_system_settings(project_root: Path) -> Dict[str, Any]:
    """Public helper to get merged settings"""
    conn = get_online_db_conn(project_root)
    defaults = _load_yaml_defaults(project_root)
    db_settings = _load_db_settings(conn)
    return _merge_settings(defaults, db_settings)


def _load_db_settings(conn) -> Dict[str, Any] | None:
    """从数据库加载配置"""
    _ensure_admin_kv(conn)
    try:
        cur = conn.execute(
            "SELECT value FROM admin_kv WHERE key = ? LIMIT 1",
            (SETTINGS_KEY,),
        )
        row = cur.fetchone()
        if row:
            return json.loads(row[0])
    except Exception:
        pass
    return None


def _merge_settings(defaults: Dict[str, Any], db_settings: Dict[str, Any] | None) -> Dict[str, Any]:
    """合并配置：DB 优先，defaults 补充"""
    if db_settings is None:
        return defaults

    result = {}
    for section_key, section_defaults in defaults.items():
        db_section = db_settings.get(section_key, {})
        result[section_key] = {}
        for key, default_value in section_defaults.items():
            result[section_key][key] = db_section.get(key, default_value)

    return result


@router.get("/api/admin/settings")
async def api_admin_settings_get(request: Request):
    """读取系统配置"""
    project_root = _get_project_root(request)
    settings = get_system_settings(project_root)
    
    # Check source
    conn = get_online_db_conn(project_root)
    db_settings = _load_db_settings(conn)

    return JSONResponse({
        "success": True,
        "settings": settings,
        "source": "database" if db_settings else "yaml_defaults",
    })


@router.post("/api/admin/settings")
async def api_admin_settings_save(request: Request, body: Dict[str, Any] = Body(None)):
    """保存系统配置"""
    if not body or "settings" not in body:
        return JSONResponse({"success": False, "error": "Missing settings in body"}, status_code=400)

    settings = body["settings"]

    # 基本校验
    scheduler = settings.get("scheduler", {})
    interval = scheduler.get("fetch_interval_minutes", 15)
    if not (5 <= interval <= 1440):
        return JSONResponse({"success": False, "error": "fetch_interval_minutes must be between 5 and 1440"}, status_code=400)

    search = settings.get("search", {})
    search_days = search.get("search_days", 30)
    if search_days < 1:
        return JSONResponse({"success": False, "error": "search_days must be at least 1"}, status_code=400)

    project_root = _get_project_root(request)
    conn = get_online_db_conn(project_root)
    _ensure_admin_kv(conn)

    try:
        now_ts = int(time.time())
        conn.execute(
            "INSERT OR REPLACE INTO admin_kv(key, value, updated_at) VALUES (?, ?, ?)",
            (SETTINGS_KEY, json.dumps(settings, ensure_ascii=False), now_ts),
        )
        conn.commit()
        return JSONResponse({"success": True, "message": "Settings saved"})
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)


@router.get("/api/admin/scraperapi/usage")
async def api_scraperapi_usage(request: Request):
    """获取 ScraperAPI 使用统计"""
    import sqlite3
    from datetime import datetime
    
    project_root = _get_project_root(request)
    db_path = project_root / "output" / "online.db"
    
    if not db_path.exists():
        return JSONResponse({"success": True, "today_total": 0, "by_source": []})
    
    try:
        conn = sqlite3.connect(str(db_path))
        today = datetime.now().strftime("%Y-%m-%d")
        
        # 今日总调用量
        cur = conn.execute(
            "SELECT SUM(call_count) FROM scraperapi_usage WHERE date = ?",
            (today,)
        )
        today_total = cur.fetchone()[0] or 0
        
        # 按源汇总
        cur = conn.execute("""
            SELECT source_id, SUM(call_count) as total, MAX(last_call_at) as last_call
            FROM scraperapi_usage 
            WHERE date = ? AND source_id != ''
            GROUP BY source_id
            ORDER BY total DESC
        """, (today,))
        
        by_source = []
        for row in cur.fetchall():
            source_id, total, last_call = row
            by_source.append({
                "source_id": source_id,
                "calls": total,
                "last_call": last_call
            })
        
        conn.close()
        
        # 尝试获取源名称
        try:
            online_conn = get_online_db_conn(project_root)
            for item in by_source:
                cur = online_conn.execute(
                    "SELECT name FROM custom_sources WHERE id = ?",
                    (item["source_id"],)
                )
                row = cur.fetchone()
                item["name"] = row[0] if row else item["source_id"]
        except Exception:
            pass
        
        return JSONResponse({
            "success": True,
            "today_total": today_total,
            "by_source": by_source
        })
        
    except Exception as e:
        return JSONResponse({"success": False, "error": str(e)}, status_code=500)

