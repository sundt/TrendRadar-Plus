from __future__ import annotations

import time
import hashlib
import traceback
from typing import Any, Dict, List, Optional
from dataclasses import dataclass

from trendradar.storage.base import NewsItem
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
        local_scope = {}
        global_scope = {
            "__builtins__": __builtins__,
            "print": print, # Allowed
            "time": time,
            "hashlib": hashlib,
            # Common libs
            "datetime": __import__("datetime"),
            "requests": __import__("requests"),
            "re": __import__("re"),
            "json": __import__("json"),
            "bs4": __import__("bs4"),
            "etree": __import__("xml.etree.ElementTree"),
        }
        
        # 3. Compile and exec
        try:
            exec(script_content, global_scope, local_scope)
        except Exception as e:
            raise ProviderFetchError(
                f"Script execution error: {traceback.format_exc()}",
                platform_id=platform_id,
                provider=self.provider_id,
                cause=e
            )
            
        # 4. Find 'fetch' function
        fetch_func = local_scope.get("fetch")
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
                "platform_name": platform_name
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
                content=str(ri.get("content", ""))
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
