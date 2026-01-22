from __future__ import annotations

import time
import hashlib
import traceback
import builtins as py_builtins
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from hotnews.storage.base import NewsItem
from .base import ProviderFetchContext, ProviderFetchResult, ProviderFetchError

@dataclass(frozen=True)
class DynamicPyProvider:
    """
    Provider that executes a Python script stored in the database/config 'script_content'.
    The script must define a global function:
    
    def fetch(config, context) -> List[dict]
    
    where:
      - config: dict derived from custom_source config
      - context: provider context (has .now, .project_root)
    
    The function should return a list of dictionaries that map to NewsItem fields.
    """
    provider_id: str = "dynamic_py"

    def fetch(
        self,
        *,
        ctx: ProviderFetchContext,
        platform_id: str,
        platform_name: str,
        platform_config: Dict[str, Any],
    ) -> ProviderFetchResult:
        started_at = time.time()
        
        # 1. Get script content
        script_content = platform_config.get("script_content")
        if not script_content:
             # Try to see if it's passed in via a special key or look up from DB if config is empty?
             # Actually, runner _load_custom_sources should populate 'script_content' into config 
             # OR we keep it separate.
             # Ideally runner passes it in platform_config.
             pass

        if not script_content:
            raise ProviderFetchError(
                "No script content provided",
                platform_id=platform_id,
                provider=self.provider_id
            )

        # 2. Prepare execution environment
        # Create a restricted builtins dictionary
        safe_builtins: Dict[str, Any] = {}
        for name in [
            # Basic types and functions
            'abs', 'all', 'any', 'ascii', 'bin', 'bool', 'bytes', 'bytearray',
            'callable', 'chr', 'complex', 'dict', 'dir', 'divmod', 'enumerate',
            'filter', 'float', 'format', 'frozenset', 'getattr', 'hasattr', 'hash',
            'hex', 'id', 'int', 'isinstance', 'issubclass', 'iter', 'len', 'list',
            'map', 'max', 'min', 'next', 'object', 'oct', 'ord', 'pow', 'print',
            'range', 'repr', 'reversed', 'round', 'set', 'slice', 'sorted',
            'str', 'sum', 'tuple', 'type', 'vars', 'zip',
            # Exceptions (commonly needed)
            'Exception', 'BaseException', 'ValueError', 'TypeError', 'KeyError',
            'IndexError', 'AttributeError', 'RuntimeError', 'StopIteration',
            'ImportError', 'IOError', 'OSError', 'NameError', 'ZeroDivisionError',
            # Built-in functions for iteration
            'input', 'open',  # open is risky but often needed, consider removing if security is paramount
        ]:
            # NOTE: Avoid using `__builtins__` directly because it may be a module
            # or a dict depending on environment. Using the `builtins` module is stable.
            if hasattr(py_builtins, name):
                safe_builtins[name] = getattr(py_builtins, name)

        # Constants
        safe_builtins['True'] = True
        safe_builtins['False'] = False
        safe_builtins['None'] = None

        # Security: Custom import function with whitelist
        ALLOWED_MODULES = {
            'requests', 'bs4', 'json', 're', 'datetime', 'time', 
            'math', 'random', 'hashlib', 'base64', 'urllib', 
            'collections', 'typing', 'lxml', 'html', 'encodings', '__future__'
        }

        def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
            # Check if root module is allowed
            root_name = name.split('.')[0]
            if root_name in ALLOWED_MODULES:
                return __import__(name, globals, locals, fromlist, level)
            raise ImportError(f"Security restricted: Module '{name}' is not in the allowed whitelist.")

        safe_builtins['__import__'] = safe_import

        local_scope = {}
        
        # Helper function for ScraperAPI-aware requests
        import os as _os
        import requests as _requests
        from pathlib import Path as _Path
        from datetime import datetime as _datetime
        import sqlite3 as _sqlite3
        
        def _get_scraperapi_settings():
            """获取 ScraperAPI 配置"""
            try:
                from hotnews.kernel.admin.settings_admin import get_system_settings
                project_root = _Path(ctx.project_root)
                settings = get_system_settings(project_root)
                return settings.get("scraperapi", {})
            except Exception:
                return {"enabled": True, "max_calls_per_hour": 0, "max_calls_per_day": 0}
        
        def _check_and_record_quota(source_id=""):
            """检查配额并记录调用，返回 (allowed, reason)
            
            Args:
                source_id: 数据源 ID，用于统计每个源的调用次数
            """
            try:
                settings = _get_scraperapi_settings()
                
                # 全局开关检查
                if not settings.get("enabled", True):
                    return (False, "ScraperAPI 已被全局禁用")
                
                max_per_hour = settings.get("max_calls_per_hour", 0)
                max_per_day = settings.get("max_calls_per_day", 0)
                
                project_root = _Path(ctx.project_root)
                db_path = project_root / "output" / "online.db"
                
                conn = _sqlite3.connect(str(db_path))
                
                # 确保表存在 (包含 source_id 列)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS scraperapi_usage (
                        date TEXT NOT NULL,
                        hour INTEGER NOT NULL,
                        source_id TEXT DEFAULT '',
                        call_count INTEGER DEFAULT 0,
                        last_call_at TEXT,
                        PRIMARY KEY (date, hour, source_id)
                    )
                """)
                
                now = _datetime.now()
                today = now.strftime("%Y-%m-%d")
                current_hour = now.hour
                now_str = now.strftime("%Y-%m-%d %H:%M:%S")
                
                # 查询今日总调用量 (所有源)
                cur = conn.execute(
                    "SELECT SUM(call_count) FROM scraperapi_usage WHERE date = ?",
                    (today,)
                )
                daily_count = cur.fetchone()[0] or 0
                
                # 查询当前小时调用量 (所有源)
                cur = conn.execute(
                    "SELECT SUM(call_count) FROM scraperapi_usage WHERE date = ? AND hour = ?",
                    (today, current_hour)
                )
                row = cur.fetchone()
                hourly_count = (row[0] or 0) if row else 0
                
                # 检查全局配额
                if max_per_hour > 0 and hourly_count >= max_per_hour:
                    conn.close()
                    return (False, f"已达每小时配额限制 ({hourly_count}/{max_per_hour})")
                
                if max_per_day > 0 and daily_count >= max_per_day:
                    conn.close()
                    return (False, f"已达每日配额限制 ({daily_count}/{max_per_day})")
                
                # 记录调用 (包含 source_id)
                conn.execute("""
                    INSERT INTO scraperapi_usage (date, hour, source_id, call_count, last_call_at) 
                    VALUES (?, ?, ?, 1, ?)
                    ON CONFLICT(date, hour, source_id) DO UPDATE SET 
                        call_count = call_count + 1,
                        last_call_at = excluded.last_call_at
                """, (today, current_hour, source_id or "", now_str))
                conn.commit()
                conn.close()
                
                return (True, None)
                
            except Exception as e:
                print(f"[ScraperAPI Quota] 检查失败: {e}")
                return (True, None)  # 失败时允许调用，避免阻塞
        
        def _scraperapi_get(url, use_scraperapi=False, use_socks_proxy=False, scraperapi_params=None, **kwargs):
            """
            Make HTTP GET request, optionally routing through ScraperAPI or Socks5 proxy.
            
            Args:
                url: Target URL
                use_scraperapi: If True, route through ScraperAPI (takes precedence over socks5)
                use_socks_proxy: If True, route through Socks5 proxy
                scraperapi_params: Optional dict or string of additional ScraperAPI parameters (e.g., {'render': 'true'} or "render=true")
                **kwargs: Additional arguments passed to requests.get (headers, timeout, etc.)
            
            Returns:
                requests.Response object
            
            Raises:
                Exception: 如果配额超限
            """
            # ScraperAPI takes precedence
            if use_scraperapi:
                # 配额检查 (传递 platform_id 用于按源统计)
                allowed, reason = _check_and_record_quota(source_id=platform_id)
                if not allowed:
                    raise Exception(f"ScraperAPI 配额超限: {reason}")
                
                api_key = _os.environ.get("SCRAPERAPI_KEY", "").strip()
                if api_key:
                    import urllib.parse
                    extra_params = ""
                    if scraperapi_params and isinstance(scraperapi_params, dict):
                        extra_params = "&" + urllib.parse.urlencode(scraperapi_params)
                    elif isinstance(scraperapi_params, str): # Support string like "render=true"
                         extra_params = "&" + scraperapi_params.lstrip("&")

                    api_url = f"https://api.scraperapi.com?api_key={api_key}&url={url}{extra_params}"
                    return _requests.get(api_url, **kwargs)
            
            # Socks5 proxy support
            if use_socks_proxy:
                socks_proxy = _os.environ.get("HOTNEWS_SOCKS_PROXY", "").strip()
                if socks_proxy:
                    # Convert socks5h to socks5 for requests library
                    if socks_proxy.startswith("socks5h://"):
                        socks_proxy = socks_proxy.replace("socks5h://", "socks5://", 1)
                    proxies = {
                        "http": socks_proxy,
                        "https": socks_proxy,
                    }
                    print(f"[Custom Source] Using Socks5 proxy: {socks_proxy}")
                    return _requests.get(url, proxies=proxies, **kwargs)
            
            return _requests.get(url, **kwargs)
        
        import xml.etree.ElementTree as _ET
        global_scope = {
            "__builtins__": safe_builtins,
            "print": print, # Allowed
            "time": time,
            "hashlib": hashlib,
            # Common libs
            "datetime": __import__("datetime"),
            "requests": __import__("requests"),
            "re": __import__("re"),
            "json": __import__("json"),
            "bs4": __import__("bs4"),
            "etree": _ET,
            # ScraperAPI helper
            "scraperapi_get": _scraperapi_get,
        }
        
        # 3. Compile and exec
        # We share the same dictionary for globals and locals so that top-level definitions
        # (imports, classes, functions) are visible to functions defined in the script.
        try:
            exec(script_content, global_scope)
        except Exception as e:
            raise ProviderFetchError(
                f"Script execution error: {traceback.format_exc()}",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=e
            )
            
        # 4. Find 'fetch' function
        fetch_func = global_scope.get("fetch")
        if not callable(fetch_func):
             raise ProviderFetchError(
                "Script must define a 'fetch(config, context)' function",
                platform_id=platform_id,
                provider=self.provider_id
            )
            
        # 5. Execute fetch
        try:
            # We pass a simple context dict to avoid imports in user script
            simple_ctx = {
                "now": ctx.now,
                "project_root": ctx.project_root,
                "platform_id": platform_id,
                "platform_name": platform_name,
                "use_scraperapi": platform_config.get("use_scraperapi", False),
                "use_socks_proxy": platform_config.get("use_socks_proxy", False),
            }
            
            raw_items = fetch_func(platform_config, simple_ctx)
        except Exception as e:
             raise ProviderFetchError(
                f"Script 'fetch' function error: {traceback.format_exc()}",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=e
            )
            
        if not isinstance(raw_items, list):
            raw_items = []
            
        # 6. Convert to NewsItem
        items: List[NewsItem] = []
        for ri in raw_items:
            if not isinstance(ri, dict):
                continue
            
            items.append(NewsItem(
                title=str(ri.get("title", "")),
                url=str(ri.get("url", "")),
                source_id=platform_id,
                source_name=platform_name,
                rank=int(ri.get("rank", 0) or len(items)+1),
                crawl_time=ctx.now.strftime("%H:%M"),
                content=str(ri.get("content", "")),
                published_at=int(ri.get("published_at", 0) or 0)
            ))
            
        duration_ms = int((time.time() - started_at) * 1000)
        content_hash = hashlib.sha1("\n".join([it.title for it in items]).encode("utf-8")).hexdigest()
        
        metric = {
            "provider": self.provider_id,
            "platform_id": platform_id,
            "platform_name": platform_name,
            "status": "success",
            "duration_ms": duration_ms,
            "items_count": len(items),
            "error": "",
            "content_hash": content_hash,
        }
        
        return ProviderFetchResult(
            platform_id=platform_id,
            platform_name=platform_name,
            provider=self.provider_id,
            items=items,
            metric=metric,
        )
