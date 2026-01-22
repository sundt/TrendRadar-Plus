# coding=utf-8
import json
import os
import sqlite3
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel

from hotnews.web.db_online import get_online_db_conn
from hotnews.kernel.providers.runner import run_provider_ingestion_once, build_default_registry, ProviderRegistry

router = APIRouter(prefix="/api/custom_sources", tags=["custom_sources"])

class CustomSource(BaseModel):
    id: str
    name: str
    provider_type: str
    config_json: str
    enabled: bool
    schedule_cron: Optional[str] = None
    category: Optional[str] = ""
    country: Optional[str] = ""
    language: Optional[str] = ""
    script_content: Optional[str] = ""
    use_scraperapi: Optional[bool] = False
    use_socks_proxy: Optional[bool] = False

class TestSourceRequest(BaseModel):
    provider_type: str
    config_json: str
    script_content: Optional[str] = None
    use_scraperapi: Optional[bool] = False

class DetectRequest(BaseModel):
    url: str

class AutofixRequest(BaseModel):
    url: str
    provider_type: str
    config_json: Optional[str] = None
    script_content: Optional[str] = None
    error_message: str

class AIDebugMessage(BaseModel):
    role: str  # "user" or "assistant"
    content: str

class AIDebugRequest(BaseModel):
    url: str
    html_snippet: Optional[str] = None  # Can be fetched if not provided
    conversation: List[AIDebugMessage] = []
    current_config: Optional[str] = None
    current_script: Optional[str] = None
    current_provider: Optional[str] = None
    current_provider: Optional[str] = None
    test_error: Optional[str] = None
    user_objective: Optional[str] = None
    execution_logs: Optional[str] = None

def _get_project_root(request: Request) -> Path:
    return request.app.state.project_root

def _get_conn(request: Request) -> sqlite3.Connection:
    return get_online_db_conn(_get_project_root(request))

def _require_admin(request: Request):
    if hasattr(request.app.state, "require_admin"):
        request.app.state.require_admin(request)
    else:
        # Fallback if not configured
        pass

def _trigger_viewer_reload(request: Request):
    """Trigger reload of platform config in NewsViewerService."""
    try:
        if hasattr(request.app.state, "get_services"):
            viewer_service, _ = request.app.state.get_services()
            if viewer_service and hasattr(viewer_service, "_reload_platform_config"):
                viewer_service._reload_platform_config()
                # Also clear the result cache
                try:
                    from hotnews.web.news_viewer import clear_categorized_news_cache
                    clear_categorized_news_cache()
                except ImportError:
                    pass
    except Exception as e:
        print(f"Failed to reload viewer config: {e}")

@router.get("", response_model=List[Dict[str, Any]])
async def list_custom_sources(request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    
    # Get all custom sources with stats fields
    cur = conn.execute("""
        SELECT id, name, provider_type, config_json, enabled, schedule_cron, 
               category, country, language, last_run_at, last_status, last_error, 
               backoff_until, created_at, updated_at, entries_count, fail_count, script_content, use_scraperapi, use_socks_proxy
        FROM custom_sources 
        ORDER BY updated_at DESC
    """)
    rows = cur.fetchall()
    
    # Get real-time entries count from rss_entries (unified storage)
    entries_count_map = {}
    try:
        cur_counts = conn.execute("""
            SELECT source_id, COUNT(*) 
            FROM rss_entries 
            WHERE source_id IN (SELECT id FROM custom_sources)
            GROUP BY source_id
        """)
        for row in cur_counts.fetchall():
            entries_count_map[row[0]] = row[1]
    except Exception as e:
        print(f"Error getting entries count from rss_entries: {e}")
    
    results = []
    for r in rows:
        source_id = r[0]
        
        # Parse config to get URL
        url = ""
        scrape_rules_json = ""
        try:
             import json
             config = json.loads(r[3])
             url = config.get("url", "")
             # If scrape_rules is a dict, json dump it for the data attribute
             rules = config.get("scrape_rules", {})
             if isinstance(rules, dict):
                 scrape_rules_json = json.dumps(rules)
             else:
                 scrape_rules_json = str(rules)
        except:
             pass
        
        results.append({
            "id": source_id,
            "name": r[1],
            "url": url,  # Add extracted URL
            "provider_type": r[2],
            "config_json": r[3],
            "scrape_rules": scrape_rules_json, # Add rules for edit modal
            "enabled": bool(r[4]),

            "provider_type": r[2],
            "config_json": r[3],
            "enabled": bool(r[4]),
            "schedule_cron": r[5],
            "category": r[6] or "",
            "country": r[7] or "",
            "language": r[8] or "",
            "script_content": r[17] or "",
            "use_scraperapi": bool(r[18] or 0),
            "use_socks_proxy": bool(r[19] or 0),
            "last_run_at": r[9],
            "last_status": r[10],
            "last_error": r[11],
            "backoff_until": r[12],
            "created_at": r[13],
            "updated_at": r[14],
            "stats": {
                "entries": entries_count_map.get(source_id, 0),  # Real-time count from rss_entries
                "fails": r[16] or 0,
                "last_update": r[9]
            }
        })
    return results

@router.post("")
async def create_custom_source(source: CustomSource, request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    try:
        # Validate JSON
        try:
            json.loads(source.config_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON config")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """
            INSERT INTO custom_sources (id, name, provider_type, config_json, enabled, schedule_cron, category, country, language, script_content, use_scraperapi, use_socks_proxy, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (source.id, source.name, source.provider_type, source.config_json, source.enabled, source.schedule_cron, source.category, source.country, source.language, source.script_content or '', 1 if source.use_scraperapi else 0, 1 if source.use_socks_proxy else 0, now, now)
        )
        conn.commit()
        
        # Helper: Learn lesson in background (sync for now)
        try:
            # get url from config
            try: cfg = json.loads(source.config_json); url = cfg.get('url')
            except: url = ""
            if url: _extract_and_save_lesson(url, source.config_json, source.script_content or '')
        except: pass

        _trigger_viewer_reload(request)
        return {"success": True}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="ID already exists")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/{source_id}")
async def update_custom_source(source_id: str, source: CustomSource, request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    try:
        try:
            json.loads(source.config_json)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid JSON config")

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        conn.execute(
            """
            UPDATE custom_sources
            SET name = ?, provider_type = ?, config_json = ?, enabled = ?, schedule_cron = ?, category = ?, country = ?, language = ?, script_content = ?, use_scraperapi = ?, use_socks_proxy = ?, updated_at = ?
            WHERE id = ?
            """,
            (source.name, source.provider_type, source.config_json, source.enabled, source.schedule_cron, source.category, source.country, source.language, source.script_content or '', 1 if source.use_scraperapi else 0, 1 if source.use_socks_proxy else 0, now, source_id)
        )
        conn.commit()

        # Helper: Learn lesson
        try:
             # get url from config
             try: cfg = json.loads(source.config_json); url = cfg.get('url')
             except: url = ""
             if url: _extract_and_save_lesson(url, source.config_json, source.script_content or '')
        except: pass

        _trigger_viewer_reload(request)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{source_id}")
async def delete_custom_source(source_id: str, request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    try:
        conn.execute("DELETE FROM custom_sources WHERE id = ?", (source_id,))
        conn.commit()
        
        # Also delete items from today's news.db to prevent ghost items
        try:
            root = _get_project_root(request)
            news_conn = _get_news_db_conn(root)
            if news_conn:
                try:
                    # Delete items
                    news_conn.execute("DELETE FROM news_items WHERE platform_id = ?", (source_id,))
                    news_conn.commit()
                    print(f"Deleted items for source {source_id} from today's news.db")
                except Exception as e:
                    print(f"Error deleting items for source {source_id}: {e}")
                finally:
                    news_conn.close()
        except Exception:
            pass

        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{source_id}/run")
async def run_custom_source(source_id: str, request: Request, _=Depends(_require_admin)):
    """Trigger immediate run for a source."""
    conn = _get_conn(request)
    
    # Load config from DB - include script_content, use_scraperapi, and use_socks_proxy
    cur = conn.execute("SELECT name, config_json, provider_type, entries_count, fail_count, script_content, use_scraperapi, use_socks_proxy FROM custom_sources WHERE id = ?", (source_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Source not found")
        
    source_name = row[0]
    config_json = row[1]
    provider_type = row[2]
    current_entries = row[3] or 0
    current_fails = row[4] or 0
    script_content = row[5] or ""
    use_scraperapi = bool(row[6] or 0)
    use_socks_proxy = bool(row[7] or 0)
    
    try:
        config = json.loads(config_json)
    except:
        raise HTTPException(status_code=500, detail="Invalid config JSON in DB")
    
    # Add script_content, use_scraperapi, and use_socks_proxy to config for dynamic_py provider
    if provider_type == "dynamic_py" and script_content:
        config["script_content"] = script_content
    config["use_scraperapi"] = use_scraperapi
    config["use_socks_proxy"] = use_socks_proxy

    registry = build_default_registry()
    try:
        provider = registry.get(provider_type)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Provider {provider_type} not found")

    root = _get_project_root(request)
    
    from hotnews.core import load_config
    from hotnews.kernel.providers.base import ProviderFetchContext
    
    app_config = load_config(str(root / "config" / "config.yaml"))
    
    ctx = ProviderFetchContext(
        project_root=str(root),
        now=datetime.now(),
        config=app_config
    )
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    try:
        result = provider.fetch(
            ctx=ctx,
            platform_id=source_id,
            platform_name=source_name,
            platform_config=config,
        )
        
        items_count = len(result.items)
        new_entries = current_entries + items_count
        
        # Update DB status with entries_count
        conn.execute("""
            UPDATE custom_sources 
            SET last_run_at = ?, last_status = 'success', last_error = '', 
                entries_count = ?, updated_at = ?
            WHERE id = ?
        """, (now_str, new_entries, now_str, source_id))
        conn.commit()
        
        # Save to storage (news.db)
        try:
            from hotnews.storage.base import NewsData
            from hotnews.storage.local import LocalStorageBackend
            import pytz
            
            try:
                tz = pytz.timezone("Asia/Shanghai")
                now_obj = datetime.now(tz)
            except:
                now_obj = datetime.now()
                
            items_dict = {source_id: result.items}
            crawl_time_str = now_obj.strftime("%H-%M")
            
            # Ensure items have crawl_time set
            for item in result.items:
                 if not item.crawl_time:
                     item.crawl_time = crawl_time_str

            news_data = NewsData(
                date=now_obj.strftime("%Y-%m-%d"),
                crawl_time=crawl_time_str,
                items=items_dict,
                id_to_name={source_id: source_name},
                failed_ids=[]
            )
            
            storage_path = root / "output"
            storage = LocalStorageBackend(str(storage_path))
            storage.save_news_data(news_data)
        except Exception as e:
            print(f"Error saving to storage: {e}")
            traceback.print_exc()
            # Don't fail the request if storage save fails, as DB update succeeded
        
        # Also save to rss_entries table for unified statistics
        try:
            import hashlib
            import time
            now_ts = int(time.time())
            rows_to_insert = []
            for item in result.items:
                # Generate dedup_key from URL
                url = getattr(item, 'url', '') or ''
                title = getattr(item, 'title', '') or ''
                if not url:
                    continue
                dedup_key = hashlib.md5(url.encode()).hexdigest()[:32]
                # Parse published time if available
                published_at = 0
                published_raw = getattr(item, 'crawl_time', '') or ''
                rows_to_insert.append(
                    (source_id, dedup_key[:500], url[:2000], title[:500], published_at, published_raw[:500], now_ts, now_ts)
                )
            if rows_to_insert:
                conn.executemany(
                    "INSERT OR IGNORE INTO rss_entries(source_id, dedup_key, url, title, published_at, published_raw, fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                    rows_to_insert,
                )
                conn.commit()
                print(f"Custom source {source_id}: inserted {len(rows_to_insert)} rows into rss_entries")
        except Exception as e:
            print(f"Error saving to rss_entries: {e}")
            traceback.print_exc()
        
        _trigger_viewer_reload(request)
        return {"success": True, "items_count": items_count}
        
    except Exception as e:
        traceback.print_exc()
        new_fails = current_fails + 1
        error_str = str(e)
        
        # Auto-enable ScraperAPI on 403 errors if key is available and not already enabled
        if not use_scraperapi and ("403" in error_str or "Forbidden" in error_str):
            if os.environ.get("SCRAPERAPI_KEY", "").strip():
                conn.execute("UPDATE custom_sources SET use_scraperapi = 1 WHERE id = ?", (source_id,))
                conn.commit()
                print(f"Auto-enabled ScraperAPI for custom source {source_id} due to 403 error")
        
        # Update DB error with fail_count
        conn.execute("""
            UPDATE custom_sources 
            SET last_run_at = ?, last_status = 'error', last_error = ?, 
                fail_count = ?, updated_at = ?
            WHERE id = ?
        """, (now_str, error_str, new_fails, now_str, source_id))
        conn.commit()
        
        raise HTTPException(status_code=500, detail=f"Run failed: {error_str}")

def _get_news_db_conn(project_root: Path) -> Optional[sqlite3.Connection]:
    """Get connection to today's news.db."""
    try:
        import pytz
        tz = pytz.timezone("Asia/Shanghai")
        now = datetime.now(tz)
    except Exception:
        now = datetime.now()
        
    date_str = now.strftime("%Y-%m-%d")
    db_path = project_root / "output" / date_str / "news.db"
    
    if not db_path.exists():
        return None
        
    try:
        conn = sqlite3.connect(str(db_path))
        return conn
    except Exception:
        return None


@router.get("/{source_id}/items")
async def get_custom_source_items(source_id: str, request: Request, _=Depends(_require_admin)):
    """Get latest items from a custom source (from rss_entries table)."""
    conn = _get_conn(request)
    
    # Verify source exists
    cur = conn.execute("SELECT id FROM custom_sources WHERE id = ?", (source_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Source not found")
    
    items = []
    
    try:
        # Query from rss_entries (unified storage for custom sources)
        cur = conn.execute("""
            SELECT id, title, url, fetched_at, published_at
            FROM rss_entries 
            WHERE source_id = ? 
            ORDER BY fetched_at DESC 
            LIMIT 10
        """, (source_id,))
        
        for row in cur.fetchall():
            # Format timestamp for display (convert UTC to Beijing time UTC+8)
            fetched_at = row[3]
            if isinstance(fetched_at, int) and fetched_at > 0:
                from datetime import datetime, timedelta
                try:
                    # Add 8 hours for Beijing timezone
                    utc_time = datetime.utcfromtimestamp(fetched_at)
                    beijing_time = utc_time + timedelta(hours=8)
                    crawl_time = beijing_time.strftime("%Y-%m-%d %H:%M:%S")
                except:
                    crawl_time = str(fetched_at)
            else:
                crawl_time = str(fetched_at) if fetched_at else "-"
            
            items.append({
                "id": row[0],
                "title": row[1],
                "url": row[2],
                "crawl_time": crawl_time,
                "first_time": crawl_time  # For compatibility
            })
    except Exception as e:
        print(f"Error querying rss_entries for custom source: {e}")
        traceback.print_exc()

    return {"items": items}

class UpdateItemTitleRequest(BaseModel):
    title: str

@router.put("/items/{item_id}")
async def update_news_item_title(item_id: int, payload: UpdateItemTitleRequest, request: Request, _=Depends(_require_admin)):
    """Update the title of a specific news item in today's db."""
    root = _get_project_root(request)
    news_conn = _get_news_db_conn(root)
    
    if not news_conn:
        raise HTTPException(status_code=500, detail="Could not connect to today's news database")
        
    try:
        # Check if item exists
        cur = news_conn.execute("SELECT id FROM news_items WHERE id = ?", (item_id,))
        if not cur.fetchone():
             raise HTTPException(status_code=404, detail="Item not found")
             
        # Update title
        # We also update updated_at
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        news_conn.execute("""
            UPDATE news_items 
            SET title = ?, updated_at = ?
            WHERE id = ?
        """, (payload.title.strip(), now_str, item_id))
        news_conn.commit()
        
        return {"success": True}
    except Exception as e:
        print(f"Error updating item title: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        news_conn.close()

@router.post("/test")
async def test_custom_source(payload: TestSourceRequest, request: Request, _=Depends(_require_admin)):
    """Dry run a provider configuration effectively."""
    print(f"DEBUG: test_custom_source payload: {payload}")
    try:
        config = json.loads(payload.config_json)
        if payload.script_content:
             config["script_content"] = payload.script_content
        # Add use_scraperapi to config for test
        config["use_scraperapi"] = payload.use_scraperapi or False
    except Exception as e:
        print(f"DEBUG: JSON load failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid JSON config")

    provider_id = payload.provider_type
    
    # Construct a temporary config for the runner
    # We will use the existing runner but point it to a "test" platform config
    
    registry = build_default_registry()
    try:
        registry.get(provider_id)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Provider {provider_id} not found")

    root = _get_project_root(request)
    
    # We need to manually construct the context to run just this one
    from hotnews.core import load_config
    app_config = load_config(str(root / "config" / "config.yaml"))
    
    # Mock ingestion config just for this run
    # But wait, `run_provider_ingestion_once` reads config from file or DB.
    # We should invoke the provider directly or make `run_provider_ingestion_once` support passing config directly?
    # `run_provider_ingestion_once` loads from config inside.
    # It takes `registry` and `project_root`.
    
    # Better to invoke provider directly here to capture output immediately without side effects (like metrics)? 
    # Or just reuse the logic. Let's reuse logic by subclassing or careful call.
    # Actually, simpler to just instantiate the provider and call fetch.
    
    from hotnews.kernel.providers.base import ProviderFetchContext
    
    ctx = ProviderFetchContext(
        project_root=str(root),
        now=datetime.now(),
        config=app_config
    )
    
    import contextlib
    import io
    
    # Capture stdout
    f_stdout = io.StringIO()
    
    try:
        provider = registry.get(provider_id)
        
        with contextlib.redirect_stdout(f_stdout):
            result = provider.fetch(
                ctx=ctx,
                platform_id="test_run",
                platform_name="Test Run",
                platform_config=config,
            )
        
        captured_logs = f_stdout.getvalue()
        
        # Serialize result for preview
        items = []
        for it in result.items:
            items.append({
                "title": it.title,
                "url": it.url,
                "time": it.crawl_time
            })
            
        # Check for fake items (AI trying to pass debug info as an item)
        # Check for fake items (AI trying to pass debug info as an item)
        # Strategy: If result has very few items (<=5), check if they look like error messages.
        if len(items) > 0 and len(items) <= 5:
            fake_indicator_count = 0
            debug_infos = []
            
            for check_item in items:
                 t = str(check_item.get('title', '')).strip().lower()
                 debug_infos.append(t)
                 
                 # Keywords that suggest this is NOT a real news item
                 if (t.startswith('[debug]') or 
                     t.startswith('error:') or 
                     'no data found' in t or 
                     'unable to scrape' in t or 
                     'check network tab' in t or
                     len(t) > 200): # Error messages are often long explanations
                     fake_indicator_count += 1
            
            # If ALL items look fake, or if we have 1 item and it looks fake
            if fake_indicator_count == len(items) or (len(items) == 1 and fake_indicator_count > 0):
                 print(f"VALIDATION FAILED: Detected fake/debug items: {debug_infos}")
                 return {
                     "success": False,
                     "error": f"AI Validation Failed: The script returned items that appear to be debug messages, not real data. Titles: {debug_infos[:2]}",
                     "logs": captured_logs
                 }

        return {
            "success": True,
            "items_count": len(items),
            "items": items[:20], # limit preview
            "metric": result.metric,
            "logs": captured_logs,
            "warning": "选择器可能需要调整：只抓到少量数据，建议检查 items 选择器是否正确匹配了页面上的多个元素" if len(items) <= 2 else None
        }
        
    except Exception as e:
        traceback.print_exc()
        captured_logs = f_stdout.getvalue() if 'f_stdout' in locals() else ""
        return {
            "success": False,
            "error": str(e),
            "logs": captured_logs
        }

@router.post("/detect")
async def detect_custom_source(req: DetectRequest, request: Request, _=Depends(_require_admin)):
    import requests
    from urllib.parse import urlparse
    import hashlib
    
    url = req.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="Empty URL")

    # Helpers for guessing
    def guess_country_lang(hostname):
        if hostname.endswith(".cn"): return "CN", "zh"
        if hostname.endswith(".hk"): return "HK", "zh"
        if hostname.endswith(".tw"): return "TW", "zh"
        if hostname.endswith(".jp"): return "JP", "jp"
        if hostname.endswith(".kr"): return "KR", "ko"
        if hostname.endswith(".uk"): return "UK", "en"
        return "US", "en" # Default

    parsed = urlparse(url)
    hostname = parsed.hostname or ""
    path = parsed.path
    
    # Generate ID: source_name_hash_prefix
    # e.g. caixin_a1b2c3
    name_slug = hostname.split('.')[0] if hostname else "custom"
    if "www." in hostname:
        name_slug = hostname.split('.')[1]
    
    # Simple hash of URL to ensure uniqueness
    url_hash = hashlib.md5(url.encode()).hexdigest()[:6]
    generated_id = f"{name_slug}_{url_hash}"

    country, lang = guess_country_lang(hostname)
    category = "News" # Default

    common_cron = "*/30 * * * *"

    try:
        # Try fetching with requests
        # Try fetching with requests
        # Retry with verify=False if SSLError
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        try:
            res = requests.get(url, headers=headers, timeout=10)
        except requests.exceptions.SSLError:
            # SSL Verification: Default to True
            ssl_verify = os.environ.get("HOTNEWS_SSL_VERIFY", "true").lower() == "true"
            res = requests.get(url, headers=headers, timeout=10, verify=ssl_verify)
        except Exception as e:
            # Check for 403 specifically
            if hasattr(e, 'response') and e.response is not None and e.response.status_code == 403:
                raise HTTPException(status_code=403, detail="Target site blocked access (403). You might need ScraperAPI.")
            raise e
            
        if res.status_code == 403:
            # Try once more with ScraperAPI if ENV exists
            scraper_key = os.environ.get("SCRAPERAPI_KEY")
            if scraper_key:
                api_url = f"http://api.scraperapi.com?api_key={scraper_key}&url={url}"
                res = requests.get(api_url, timeout=20)
            else:
                raise HTTPException(status_code=403, detail="Target site blocked access (403). Try adding a ScraperAPI key.")
        
        res.raise_for_status()
        
        # Handle encoding
        if res.encoding is None or res.encoding == 'ISO-8859-1':
            res.encoding = res.apparent_encoding
        content_type = res.headers.get("Content-Type", "").lower()
        
        # 1. Check if JSON
        is_json = "application/json" in content_type or url.endswith(".json")
        try:
            data = res.json()
            is_json = True
        except:
            data = None

        if is_json and data:
            # Basic guess for JSON API
            items_key = ""
            if isinstance(data, list):
                items_key = "" 
            elif isinstance(data, dict):
                # Find the first list that looks like it has news items
                for k, v in data.items():
                    if isinstance(v, list) and len(v) > 0:
                        items_key = k
                        break
            
            field_mapping = {
                "title": "title",
                "link": "url",
                "published_at": "created_at",
                "content": "content"
            }
            
            config = {
                "url": url,
                "method": "GET",
                "items_key": items_key,
                "field_mapping": field_mapping
            }
            return {
                "provider_type": "http_json",
                "config_json": json.dumps(config, indent=2, ensure_ascii=False),
                "name_suggestion": hostname or "New API Source",
                "id_suggestion": generated_id,
                "category_suggestion": category,
                "country_suggestion": country,
                "language_suggestion": lang,
                "cron_suggestion": common_cron
            }

        # 2. Otherwise HTML scraping
        from bs4 import BeautifulSoup
        
        # Helper to validate and fix selectors
        def validate_and_fix_selectors(soup, ai_rules):
            """Validate AI-generated selectors and find the most specific ones."""
            items_sel = ai_rules.get("items", "article")
            title_sel = ai_rules.get("title", "h2 a")
            link_sel = ai_rules.get("link", "a")
            
            # Test items selector
            items = soup.select(items_sel)
            if not items:
                # Try common alternatives
                for alt in ["article", "div.post", "div.entry", "li", "div.item", "div.card"]:
                    items = soup.select(alt)
                    if items:
                        items_sel = alt
                        break
            
            if items and len(items) > 0:
                # Test within first item to find best selectors
                first_item = items[0]
                
                # Find best title selector (prioritize specific class-based ones)
                title_candidates = [
                    "h1 a[class*='title']", "h2 a[class*='title']", "h3 a[class*='title']",
                    "a[class*='title']", "[class*='title'] a",
                    "h1 a", "h2 a", "h3 a", 
                    "a.headline", "a.entry-title", 
                    "h1", "h2", "h3", "a"
                ]
                
                best_title_sel = None
                for candidate in title_candidates:
                    elem = first_item.select_one(candidate)
                    if elem and elem.get_text(strip=True):
                        best_title_sel = candidate
                        break
                
                if best_title_sel:
                    title_sel = best_title_sel
                
                # Find best link selector (prioritize same as title if it has href)
                if best_title_sel:
                    # Check if title element is or contains a link
                    title_elem = first_item.select_one(best_title_sel)
                    if title_elem:
                        if title_elem.name == 'a' and title_elem.get('href'):
                            link_sel = best_title_sel
                        else:
                            link_in_title = title_elem.find('a')
                            if link_in_title and link_in_title.get('href'):
                                # Build selector for link within title
                                link_sel = best_title_sel
                
                # If link still not found, search independently
                if not link_sel or not first_item.select_one(link_sel):
                    link_candidates = [
                        "a[href*='http']", "a[href^='/']", "a[href^='./']",
                        "a", "h1 a", "h2 a", "h3 a"
                    ]
                    for candidate in link_candidates:
                        elem = first_item.select_one(candidate)
                        if elem and elem.get('href'):
                            link_sel = candidate
                            break
            
            return {
                "items": items_sel,
                "title": title_sel,
                "link": link_sel,
                "date": ai_rules.get("date", "")
            }
        
        
        # Helper to call LLM
        def call_llm_for_config(html_content: str, url: str) -> Dict[str, Any]:
             import os
             import requests
             api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
             if not api_key:
                 return {}

             # Use dedicated scraper model if set, otherwise fall back to general MB AI model
             model = (os.environ.get("HOTNEWS_SCRAPER_AI_MODEL") or 
                      os.environ.get("HOTNEWS_MB_AI_MODEL") or "qwen-plus").strip() or "qwen-plus"
             endpoint = (os.environ.get("HOTNEWS_MB_AI_ENDPOINT") or "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
             
             prompt = f"""
You are an expert web scraper configuration generator. 
Analyze the following HTML snippet from {url} and generate a JSON configuration for scraping news articles.
The goal is to extract a list of news items with title, link, date, and content.

CRITICAL REQUIREMENTS:
1. The "items" selector MUST match at least 5 or more repeating elements on the page. Look for patterns like multiple <article> tags, multiple <div> with the same class, or multiple <li> in a list.
2. DO NOT use IDs (like #post-123) for the "items" selector because IDs are unique. Use class-based selectors instead.
3. Prefer simple, common selectors: article, .post, .entry, .card, .item, li, etc.
4. DO NOT use classes that contain colons (like dark:bg-white or hover:text-blue). These are Tailwind CSS utility classes and break CSS selector parsing.
5. Keep selectors SHORT and SIMPLE. Avoid long chains of multiple classes.
6. The "title" and "link" selectors must be RELATIVE to each item container.
7. For "link", prefer the selector that gives you the article URL (usually an <a> tag wrapping or inside the title).

Output strict JSON only, no markdown code blocks, no explanation.
Format 1 (Simple HTML - Preferred):
{{
  "type": "json_scraper",
  "scrape_rules": {{
      "items": "CSS selector for article container",
      "title": "CSS selector for title",
      "link": "CSS selector for link",
      "date": "CSS selector for date"
  }},
  "metadata": {{
      "category": "...",
      "country": "...",
      "language": "...",
      "name": "..."
  }}
}}

Format 2 (Complex/Script - Use if logic needed):
{{
  "type": "python_script",
  "script_content": "def fetch(config, ctx):\\n    import requests\\n    import bs4\\n    # Full python code implementation extracting items as list of dicts with title, url, crawl_time\\n    # Must handle parsing manually. Use response = requests.get(config['url']) inside.\\n    return items",
  "metadata": {{ ... }}
}}

Choose 'python_script' if:
- Standard CSS selectors match nothing reliably.
- Data is in a script tag or JSON blob inside HTML.
- Complex transformation is needed.
Otherwise use 'json_scraper'.

HTML Snippet (truncated, cleaned):
{html_content[:50000]}
"""
             try:
                payload = {
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "temperature": 0.1
                }
                headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
                
                # Proxy handling
                proxies = {"http": None, "https": None}
                if os.environ.get("HOTNEWS_MB_AI_USE_PROXY", "").strip().lower() in {"1", "true", "yes"}:
                    proxies = None

                resp = requests.post(endpoint, headers=headers, json=payload, timeout=30, proxies=proxies)
                if resp.status_code == 200:
                    data = resp.json()
                    content = data["choices"][0]["message"]["content"]
                    # Clean markdown code blocks if present
                    if "```json" in content:
                        content = content.split("```json")[1].split("```")[0]
                    elif "```" in content:
                        content = content.split("```")[1].split("```")[0]
                    return json.loads(content.strip())
             except Exception as e:
                 print(f"LLM Call failed: {e}")
                 traceback.print_exc()
             return {}

        # Fetch page with requests
        page_content = res.text
        page_title = hostname
        
        try:
            soup = BeautifulSoup(page_content, "html.parser")
            title_tag = soup.find("title")
            if title_tag:
                page_title = title_tag.get_text(strip=True)
        except:
            pass

        # Helper to clean HTML for LLM - preserves embedded data scripts
        def _clean_html_for_llm(html_content: str) -> str:
            try:
                soup = BeautifulSoup(html_content, "html.parser")
                
                # Extract data from embedded scripts BEFORE removing them
                data_scripts = []
                for script in soup.find_all("script"):
                    script_type = script.get("type", "")
                    script_id = script.get("id", "")
                    script_text = script.string or ""
                    
                    # Keep JSON-type scripts (Next.js, Nuxt, etc.)
                    if script_type == "application/json" or script_type == "application/ld+json":
                        content = script_text[:5000] if script_text else ""
                        if content.strip():
                            data_scripts.append(f"[JSON_SCRIPT id={script_id}]: {content}")
                    # Keep scripts with common initial state patterns
                    elif script_text:
                        text_preview = script_text[:500]
                        state_patterns = ['__NEXT_DATA__', '__INITIAL_STATE__', '__NUXT__', 
                                         'window.__data', 'window.pageData', 'var data =', 
                                         '"articles":', '"news":', '"items":']
                        if any(p in text_preview for p in state_patterns):
                            # Try to extract just the JSON part
                            content = script_text[:4000]
                            data_scripts.append(f"[STATE_SCRIPT]: {content}")
                
                # Remove all scripts, styles, etc.
                for tag in soup(["script", "style", "svg", "meta", "link", "noscript"]):
                    tag.decompose()
                # Remove comments
                from bs4 import Comment
                for comment in soup.find_all(text=lambda text: isinstance(text, Comment)):
                    comment.extract()
                
                html_result = str(soup)[:35000]
                
                # Prepend embedded data if found
                if data_scripts:
                    embedded_section = "=== EMBEDDED DATA (check these first!) ===\n" + "\n\n".join(data_scripts[:3]) + "\n\n=== HTML CONTENT ===\n"
                    return embedded_section + html_result
                return html_result
            except:
                return html_content

        # Call AI
        cleaned_html = _clean_html_for_llm(page_content)
        # Increase context size to 50k chars after cleaning, as modern LLMs can handle it
        ai_result = call_llm_for_config(cleaned_html, url)
        
        # Get and validate selectors
        scrape_rules = ai_result.get("scrape_rules", {})
        metadata = ai_result.get("metadata", {})
        
        if not scrape_rules:
             scrape_rules = {
                "items": "article",
                "title": "h2 a",
                "link": "a"
            }
        
        if ai_result.get("type") == "python_script":
            script_content = ai_result.get("script_content", "")
            return {
                "provider_type": "dynamic_py",
                "config_json": json.dumps({"url": url}, indent=2),
                "script_content": script_content,
                "name_suggestion": metadata.get("name") or page_title,
                "id_suggestion": generated_id,
                "category_suggestion": metadata.get("category") or category,
                "country_suggestion": metadata.get("country") or country,
                "language_suggestion": metadata.get("language") or lang,
                "cron_suggestion": common_cron
            }

        # Validate and fix selectors - check match count
        try:
            soup = BeautifulSoup(page_content, "html.parser")
            items_sel = scrape_rules.get("items", "article")
            matched = soup.select(items_sel)
            
            # If AI selector matches less than 3 elements, try common fallbacks
            if len(matched) < 3:
                fallback_selectors = [
                    "article", "article.post", ".post", ".entry", ".card", 
                    "div.item", "div.card", "li.post", "div.post", 
                    "div.article", "div.entry", "li"
                ]
                for fallback in fallback_selectors:
                    fallback_matched = soup.select(fallback)
                    if len(fallback_matched) >= 3:
                        scrape_rules["items"] = fallback
                        matched = fallback_matched
                        break
            
            # Now validate/fix title and link selectors within the found items
            scrape_rules = validate_and_fix_selectors(soup, scrape_rules)
        except:
            pass
        
        final_category = metadata.get("category") or category
        final_country = metadata.get("country") or country
        final_language = metadata.get("language") or lang
        final_name = metadata.get("name") or page_title

        config = {
            "url": url,
            "scrape_rules": scrape_rules
        }
        
        return {
            "provider_type": "html_scraper",
            "config_json": json.dumps(config, indent=2, ensure_ascii=False),
            "name_suggestion": final_name,
            "id_suggestion": generated_id,
            "category_suggestion": final_category,
            "country_suggestion": final_country,
            "language_suggestion": final_language,
            "cron_suggestion": common_cron
        }

    except Exception as e:
        traceback.print_exc()
        config = {"url": url, "scrape_rules": {"items": "article", "title": "h2 a", "link": "a"}}
        return {
            "provider_type": "html_scraper",
            "config_json": json.dumps(config, indent=2, ensure_ascii=False),
            "name_suggestion": hostname or "New Source",
            "id_suggestion": generated_id,
            "category_suggestion": category,
            "country_suggestion": country,
            "language_suggestion": lang,
            "cron_suggestion": common_cron
        }

@router.post("/autofix")
async def autofix_custom_source(payload: AutofixRequest, _=Depends(_require_admin)):
    """Auto-fix a failing configuration using AI."""
    url = payload.url
    error_msg = payload.error_message
    
    # 1. Fetch content for context
    import requests
    from bs4 import BeautifulSoup
    import os
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    }
    try:
        res = requests.get(url, headers=headers, timeout=15)
        if res.status_code == 403:
             # Try scraper api if avail
             scraper_key = os.environ.get("SCRAPERAPI_KEY")
             if scraper_key:
                 res = requests.get(f"http://api.scraperapi.com?api_key={scraper_key}&url={url}", timeout=30)
        
        # Encoding
        if res.encoding is None or res.encoding == 'ISO-8859-1':
            res.encoding = res.apparent_encoding
            
        page_content = res.text
    except Exception as e:
        page_content = f"Failed to fetch page content: {e}"

    # Clean HTML
    try:
        soup = BeautifulSoup(page_content, "html.parser")
        for tag in soup(["script", "style", "svg", "meta", "link", "noscript"]):
            tag.decompose()
        # retain structure
        html_snippet = str(soup)[:40000] 
    except:
        html_snippet = page_content[:10000]

    # 2. Call AI
    api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="No AI API Key configured")

    endpoint = (os.environ.get("HOTNEWS_MB_AI_ENDPOINT") or "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
    model = (os.environ.get("HOTNEWS_SCRAPER_AI_MODEL") or os.environ.get("HOTNEWS_MB_AI_MODEL") or "qwen-plus").strip()

    current_code = payload.script_content if payload.provider_type == 'dynamic_py' else payload.config_json
    
    prompt = f"""
You are an expert web scraper debugger.
The user is trying to scrape: {url}
Current Mode: {payload.provider_type}

The current configuration/code failed with this error:
{error_msg}

Current Code:
{current_code}

Page HTML Snippet (truncated):
{html_snippet}

TASK:
Analyze the error and the HTML.
Fix the code to resolve the error. 
If the error assumes a certain HTML structure that is different from the snippet, adjust the selectors.
If the current mode (e.g. JSON) is insufficient for the complexity (e.g. dynamic content needing logic), switch to 'python_script'.

Output strict JSON:
Format 1 (Fixed JSON):
{{
  "type": "json_scraper",
  "scrape_rules": {{
      "items": "...",
      "title": "...",
      "link": "...",
      "date": "..."
  }},
  "reason": "Explanation of fix"
}}

Format 2 (Fixed/Switched to Python):
{{
  "type": "python_script",
  "script_content": "def fetch(config, ctx):\\n ...",
  "reason": "Explanation of fix"
}}
"""
    try:
        req_body = {
            "model": model,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1
        }
        headers_ai = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        
        # Proxy
        proxies = {"http": None, "https": None}
        if os.environ.get("HOTNEWS_MB_AI_USE_PROXY", "").strip().lower() in {"1", "true", "yes"}:
            proxies = None

        ai_res = requests.post(endpoint, headers=headers_ai, json=req_body, timeout=45, proxies=proxies)
        if ai_res.status_code != 200:
             raise HTTPException(status_code=500, detail=f"AI Error: {ai_res.text}")
             
        data = ai_res.json()
        content = data["choices"][0]["message"]["content"]
        
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
            
        result = json.loads(content.strip())
        
        # Normalize result for frontend
        ret = {}
        if result.get("type") == "python_script":
            ret["provider_type"] = "dynamic_py"
            ret["script_content"] = result.get("script_content")
            ret["config_json"] = json.dumps({"url": url}, indent=2)
        else:
            ret["provider_type"] = "html_scraper"
            cfg = {"url": url, "scrape_rules": result.get("scrape_rules")}
            ret["config_json"] = json.dumps(cfg, indent=2, ensure_ascii=False)
            
        ret["reason"] = result.get("reason", "Fixed by AI")
        return ret
        
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Autofix failed: {str(e)}")





@router.post("/ai_debug")
async def ai_debug_conversation(payload: AIDebugRequest, _=Depends(_require_admin)):
    """
    Conversational AI debugging endpoint.
    Maintains conversation history for smarter, iterative debugging.
    """
    import requests
    from bs4 import BeautifulSoup
    import os
    
    url = payload.url
    
    # 1. Fetch content and detect type (JSON API vs HTML)
    html_snippet = payload.html_snippet
    is_json_api = False
    json_response = None
    content_type = ""
    
    if not html_snippet:
        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        }
        try:
            res = requests.get(url, headers=headers, timeout=15)
            if res.status_code == 403:
                scraper_key = os.environ.get("SCRAPERAPI_KEY")
                if scraper_key:
                    res = requests.get(f"http://api.scraperapi.com?api_key={scraper_key}&url={url}", timeout=30)
            
            if res.encoding is None or res.encoding == 'ISO-8859-1':
                res.encoding = res.apparent_encoding
            
            # Explicit check for common Mojibake indicators (e.g. è, å, ï, or garbled sequence)
            # If content looks like CP1252/Latin-1 but should be UTF-8
            if 'è' in res.text and 'ï' in res.text:
                try:
                    # Check directly in content-type header
                    ct = res.headers.get('content-type', '').lower()
                    if 'charset' not in ct:
                        res.encoding = 'utf-8'
                except:
                    pass
            
            content_type = res.headers.get("Content-Type", "").lower()
            
            # Check if it's a JSON API
            if "application/json" in content_type or "text/json" in content_type:
                is_json_api = True
                try:
                    json_response = res.json()
                    html_snippet = f"JSON API Response (truncated):\n{json.dumps(json_response, ensure_ascii=False, indent=2)[:30000]}"
                except:
                    html_snippet = res.text[:30000]
            else:
                # Check if content looks like JSON even without proper content-type
                text = res.text.strip()
                if text.startswith("{") or text.startswith("["):
                    try:
                        json_response = json.loads(text)
                        is_json_api = True
                        html_snippet = f"JSON API Response (truncated):\n{json.dumps(json_response, ensure_ascii=False, indent=2)[:30000]}"
                    except:
                        pass
                
                if not is_json_api:
                    soup = BeautifulSoup(res.text, "html.parser")
                    for tag in soup(["script", "style", "svg", "meta", "link", "noscript"]):
                        tag.decompose()
                    html_snippet = str(soup)[:35000]
        except Exception as e:
            html_snippet = f"Failed to fetch: {e}"
    
    # 2. Build conversation messages for LLM
    api_key = (os.environ.get("DASHSCOPE_API_KEY") or "").strip()
    if not api_key:
        raise HTTPException(status_code=500, detail="No AI API Key configured")
    
    endpoint = (os.environ.get("HOTNEWS_MB_AI_ENDPOINT") or 
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
    model = (os.environ.get("HOTNEWS_SCRAPER_AI_MODEL") or 
             os.environ.get("HOTNEWS_MB_AI_MODEL") or "qwen-plus").strip()
    
    # System prompt - conditionally different for JSON API vs HTML
    if is_json_api:
        # Check if API returned an error
        api_error_msg = ""
        if json_response and isinstance(json_response, dict):
            # Common error patterns
            status = json_response.get("result", {}).get("status", {})
            if status.get("code") and status.get("code") != 0:
                api_error_msg = f"API returned error: code={status.get('code')}, msg={status.get('msg')}"
            elif json_response.get("error"):
                api_error_msg = f"API error: {json_response.get('error')}"
            elif json_response.get("message") and not json_response.get("data"):
                api_error_msg = f"API message: {json_response.get('message')}"
        
        system_prompt = f"""You are an expert API configuration assistant.
You are helping to create a working scraper for a JSON API: {url}

THIS IS A JSON API, NOT AN HTML PAGE.

{"**API ERROR DETECTED**: " + api_error_msg + '''

The API returned an error, likely because required parameters are missing.
ANALYZE the error message and ADD NECESSARY PARAMETERS to the URL.
Common API parameters include: page, num, limit, count, lid, pageid, category, type, etc.
Look at the error message for hints about what parameters are needed.
''' if api_error_msg else ''}

AVAILABLE MODES:
- http_json - Use path-based field mapping for JSON APIs (PREFERRED for APIs)
- dynamic_py - Write Python script if the JSON structure is complex

ANALYZE THE JSON RESPONSE:
1. If the API returned an error, figure out what parameters are missing
2. Find the array that contains the news items (e.g., "result.data", "data.list", "items")
3. For each item in the array, identify the field names for: title, url, time
4. Use dot notation for nested paths (e.g., "article.title", "meta.publishedAt")

RESPONSE FORMAT (strict JSON):
{{
  "thinking": "The API needs parameters. Based on error 'param lid illegal', I need to add lid parameter. Common values for Sina API are lid=2509 (finance), pageid=153, num=50...",
  "type": "http_json",
  "config": {{
    "url": "{url}?pageid=153&lid=2509&num=50&page=1",
    "response_path": "result.data",
    "field_mapping": {{
      "title": "title",
      "url": "url", 
      "time": "ctime",
      "content": "intro",
      "source": "media_name"
    }}
  }},
  "name_suggestion": "新浪财经 - 滚动新闻",
  "confidence": 1-10
}}

OR for complex cases use Python:
{{
  "thinking": "The JSON structure is complex, needs custom parsing...",
  "type": "dynamic_py",
  "script_content": "def fetch(config, ctx):\\n    import requests\\n    from datetime import datetime\\n    resp = requests.get(config['url'])\\n    data = resp.json()\\n    items = []\\n    for item in data['result']['data']:\\n        items.append({{'title': item['title'], 'url': item['url'], 'crawl_time': datetime.now().strftime('%Y-%m-%d %H:%M')}})\\n    return items",
  "confidence": 1-10
}}

JSON API Response:
{html_snippet[:25000]}
"""
    else:
        # Get lessons
        domain_lessons = _get_lessons(url)
        if not domain_lessons:
             domain_lessons = "None"
             
        system_prompt = f"""You are an expert web scraper debugging assistant with deep knowledge of HTML parsing.
You are helping to create a working scraper for: {url}

SCRAPER MODES:
1. html_scraper - Use CSS selectors for simple HTML pages
2. dynamic_py - Write custom Python code for complex pages
3. http_json - If you find a direct API URL in the embedded data

KNOWLEDGE BASE (Lessons from previous successful scrapes on this domain):
{domain_lessons}

**ANALYSIS PRIORITY (FOLLOW THIS ORDER)**:

1. **CHECK EMBEDDED DATA FIRST** (if present above HTML):
   - Look for [JSON_SCRIPT] or [STATE_SCRIPT] sections at the top of content
   - Many modern sites (Next.js, Nuxt, React) embed data in these scripts
   - If you find news arrays in embedded JSON, use dynamic_py to parse it
   - Example: window.__NEXT_DATA__ contains pageProps with articles array

2. **CHECK data-* ATTRIBUTES**: 
   - Some sites embed JSON in data-* attributes on HTML elements
   - e.g. <div data-items='[{{"title":"..."}}]'>

3. **FALLBACK TO CSS SELECTORS** (only if above fail):
   - Prefer class-based selectors over tag-only selectors
   - Items selector must match 5+ elements
   - Never use ID selectors for item lists (IDs are unique)

CRITICAL RULES:
- **NEVER repeat a failed approach** - if CSS selectors returned 0 items, try embedded data or Python
- If you see [JSON_SCRIPT] or [STATE_SCRIPT] in the content, prioritize parsing that data
- In Python scripts, use requests.get() with proper headers
- Return items as list of dicts with 'title', 'url', 'crawl_time' keys
- For crawl_time, use: datetime.now().strftime("%Y-%m-%d %H:%M")
- DEBUGGING: You can add `print()` statements. Output will show in next turn.
- **CRITICAL**: If you cannot find items, return empty list `[]`. NO fake items or debug messages.

RESPONSE FORMAT (strict JSON):
{{
  "thinking": "1. First I checked embedded data: [what I found]\\n2. Analysis: [patterns]\\n3. My approach: [chosen strategy]",
  "type": "html_scraper" or "dynamic_py" or "http_json",
  "config": {{"url": "...", "scrape_rules": {{"items": "...", "title": "...", "link": "...", "date": "..."}}}},
  "script_content": "def fetch(config, ctx):\\n    from datetime import datetime\\n    import requests\\n    from bs4 import BeautifulSoup\\n    # If using embedded JSON:\\n    # import json\\n    # data = json.loads(soup.find('script', id='__NEXT_DATA__').string)\\n    ...\\n    return items",
  "name_suggestion": "网站名称 - 频道/栏目",
  "confidence": 1-10
}}

PAGE CONTENT (embedded data sections appear first if found):
{html_snippet[:25000]}
"""
    
    # Build messages array
    messages = [{"role": "system", "content": system_prompt}]
    
    # Add conversation history
    for msg in payload.conversation:
        messages.append({"role": msg.role, "content": msg.content})
    
    # Add current state if this is a retry
    if payload.test_error:
        current_code = payload.current_script if payload.current_provider == "dynamic_py" else payload.current_config
        user_msg = f"""The previous attempt failed.

Current Provider: {payload.current_provider or 'unknown'}
Current Code:
{current_code or 'None'}

Test Error:
{payload.test_error}
"""
        if payload.execution_logs:
             user_msg += f"\nEXECUTION LOGS (stdout from your script):\n{payload.execution_logs[:10000]}\n"

        if payload.user_objective:
             user_msg += f"\nREMINDER - USER OBJECTIVE: {payload.user_objective}\n"

        user_msg += "\nPlease analyze what went wrong and provide a FIXED version. Remember what you tried before and don't repeat the same approach if it failed."
        
        # Count attempted strategies from conversation
        css_attempts = sum(1 for m in payload.conversation if 'html_scraper' in m.content)
        py_attempts = sum(1 for m in payload.conversation if 'dynamic_py' in m.content)
        
        # --- SMART STRATEGY GUIDANCE ---
        if css_attempts >= 2 and py_attempts == 0:
            user_msg += f"""

**STRATEGY ANALYSIS**: CSS selectors have failed {css_attempts} times.
MANDATORY: Switch to 'dynamic_py' Python script mode. 
Look for [JSON_SCRIPT] or [STATE_SCRIPT] in the content and parse the embedded JSON data directly."""

        elif py_attempts >= 2:
            user_msg += """

**STRATEGY ANALYSIS**: Python scripts have also failed multiple times.
Try a completely different parsing approach:
- Use regex to extract JSON from page source
- Look for data-* attributes on elements
- Try fetching a different URL (API endpoint) if visible in content"""
        
        # --- LOOP BREAKER ---
        # If we have many turns (e.g. > 6 messages = ~3 retries), the AI is likely stuck.
        if len(payload.conversation) > 6:
            user_msg += """

🚨 **CRITICAL**: You have failed multiple times and are likely stuck.
You MUST change your approach NOW. Consider:
1. The data might be loaded via JavaScript - look for API URLs in source
2. The site might block scrapers - add realistic headers
3. Return empty list if truly no data found - DO NOT fake results"""

        messages.append({"role": "user", "content": user_msg})
    else:
        # First attempt
        user_content = "Please generate an initial scraper configuration for this page. Analyze the HTML structure carefully."
        if payload.user_objective:
            user_content += f"\n\nUSER OBJECTIVE/FOCUS: {payload.user_objective}\nIMPORTANT: Prioritize this objective in your analysis and selector generation."
            
        messages.append({"role": "user", "content": user_content})
    
    # 3. Call LLM
    try:
        req_body = {
            "model": model,
            "messages": messages,
            "temperature": 0.2
        }
        headers_ai = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        
        proxies = {"http": None, "https": None}
        if os.environ.get("HOTNEWS_MB_AI_USE_PROXY", "").strip().lower() in {"1", "true", "yes"}:
            proxies = None
        
        ai_res = requests.post(endpoint, headers=headers_ai, json=req_body, timeout=60, proxies=proxies)
        if ai_res.status_code != 200:
            raise HTTPException(status_code=500, detail=f"AI Error: {ai_res.text}")
        
        data = ai_res.json()
        content = data["choices"][0]["message"]["content"]
        
        import re
        import ast

        # Strategy 1: Clean Markdown
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        content = content.strip()

        # Strategy 2: Direct JSON parsing
        try:
            result = json.loads(content)
        except Exception:
            # Strategy 3: Try to find the JSON object if there's extra text
            try:
                # Find first { and last }
                start = content.find('{')
                end = content.rfind('}')
                if start != -1 and end != -1:
                    json_str = content[start:end+1]
                    result = json.loads(json_str)
                else:
                    raise ValueError("No JSON object found")
            except Exception:
                # Strategy 4: Handle single quotes (Python dict syntax) using ast.literal_eval
                try:
                    # Finds the largest {} block
                    json_candidates = re.findall(r'\{.*\}', content, re.DOTALL)
                    if json_candidates:
                        # Take the longest match which is likely the full object
                        candidate = max(json_candidates, key=len)
                        # Remove comments //
                        candidate = re.sub(r'//.*', '', candidate)
                        result = ast.literal_eval(candidate)
                    else:
                        raise ValueError("No dict structure found")
                except Exception as e:
                     print(f"JSON PARSE ERROR: {e}\nContent: {content}")
                     # Strategy 5: Last ditch - try to fix single quotes to double quotes via regex (risky but better than fail)
                     try:
                         fixed = re.sub(r"'([^']*)':", r'"\1":', content) # Keys
                         fixed = re.sub(r": '([^']*)'", r': "\1"', fixed) # Values
                         result = json.loads(fixed)
                     except Exception:
                         # Give up, return error to AI prompt in next turn
                         return {
                             "thinking": "Failed to parse AI response. " + str(e),
                             "confidence": 0,
                             "html_snippet": "",
                             "error": f"Invalid JSON format: {str(e)}"
                         }
        
        # Build response
        ret = {
            "thinking": result.get("thinking", ""),
            "confidence": result.get("confidence", 5),
            "html_snippet": html_snippet[:5000],  # Return truncated for frontend caching
            "name_suggestion": result.get("name_suggestion", ""),
        }
        
        # Add should_stop signal when AI has failed too many times
        if len(payload.conversation) > 6:
            ret["should_stop"] = True
            ret["stop_reason"] = "AI 已多次失败，建议手动配置或更换目标URL"
        
        if result.get("type") == "dynamic_py":
            ret["provider_type"] = "dynamic_py"
            ret["script_content"] = result.get("script_content", "")
            ret["config_json"] = json.dumps({"url": url}, indent=2)
        elif result.get("type") == "http_json":
            ret["provider_type"] = "http_json"
            config = result.get("config") or {}
            if "url" not in config:
                config["url"] = url
            ret["config_json"] = json.dumps(config, indent=2, ensure_ascii=False)
        else:
            ret["provider_type"] = "html_scraper"
            config = result.get("config") or {"url": url, "scrape_rules": result.get("scrape_rules", {})}
            if "url" not in config:
                config["url"] = url
            ret["config_json"] = json.dumps(config, indent=2, ensure_ascii=False)
        
        # Return the assistant's response for history tracking
        ret["assistant_message"] = content
        
        return ret
        
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=500, detail=f"AI returned invalid JSON: {str(e)}")
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"AI Debug failed: {str(e)}")

# --- AI LESSON SYSTEM ---

def _get_domain(url: str) -> str:
    from urllib.parse import urlparse
    try:
        domain = urlparse(url).netloc
        # Strip www.
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except:
        return ""

def _get_lessons(url: str) -> str:
    try:
        domain = _get_domain(url)
        if not domain:
            return ""

        # Connect to DB
        from hotnews.web.db_online import get_online_db_conn
        root = _get_project_root_path()
        conn = get_online_db_conn(root)
        
        # Query for exact domain or parent domain is harder in SQL without LIKE
        # But for simplicity, we'll try exact match first, then maybe broader search in python if needed
        # Actually our current logic was: exact match or "domain endswith d"
        
        cur = conn.execute("SELECT domain, lesson FROM ai_learning_lessons")
        rows = cur.fetchall()
        
        relevant_lessons = []
        for d, lesson in rows:
            if d == domain or domain.endswith("." + d) or d.endswith("." + domain):
                relevant_lessons.append(f"- [{d}]: {lesson}")
                
        if not relevant_lessons:
            return ""
            
        return "\n".join(relevant_lessons)
    except Exception as e:
        print(f"Error getting lessons: {e}")
        return ""

def _extract_and_save_lesson(url: str, config: str, script: str):
    """
    Ask AI to summarize the 'secret' of this success.
    """
    try:
        domain = _get_domain(url)
        if not domain: return
        
        # Only learn if it looks like a complex success (script or custom config)
        if not script and (not config or len(config) < 50):
            return

        tech_content = script if script and len(script) > 20 else config
        
        system_prompt = "You are a senior web scraping engineer."
        user_msg = f"""We successfully scraped a URL on domain '{domain}'.
        
URL: {url}
Configuration/Script:
{tech_content[:2000]}

Please summarize the ONE key technical insight or 'trick' required for this site in a single concise sentence.
Examples: 
- "Requires user-agent header to avoid 403."
- "Data is loaded via JSONP callback named 'OnNewsLoaded'."
- "Content is in a <script> tag, requires regex extraction."

Reply ONLY with the lesson sentence."""

        # Call LLM (reuse logic or simple request)
        req_body = {
            "model": os.environ.get("HOTNEWS_SCRAPER_AI_MODEL", "qwen-plus"),
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg}
            ],
            "temperature": 0.1
        }
        api_key = os.environ.get("DASHSCOPE_API_KEY")
        if not api_key: return
        
        # Determine endpoint
        endpoint = os.environ.get("HOTNEWS_MB_AI_ENDPOINT", "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions")
        
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        
        res = requests.post(endpoint, headers=headers, json=req_body, timeout=10)
        if res.status_code == 200:
            lesson = res.json()["choices"][0]["message"]["content"].strip()
            
            # Save to DB
            from hotnews.web.db_online import get_online_db_conn
            from datetime import datetime
            
            root = _get_project_root_path()
            conn = get_online_db_conn(root)
            now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            
            # Upsert
            conn.execute("""
                INSERT INTO ai_learning_lessons (domain, lesson, updated_at) 
                VALUES (?, ?, ?)
                ON CONFLICT(domain) DO UPDATE SET lesson=excluded.lesson, updated_at=excluded.updated_at
            """, (domain, lesson, now))
            conn.commit()
            
            print(f"Learned lesson for {domain}: {lesson}")
            
    except Exception as e:
        print(f"Lesson extraction error: {e}")

def _get_project_root_path() -> Path:
    from pathlib import Path
    return Path(__file__).resolve().parent.parent.parent.parent
