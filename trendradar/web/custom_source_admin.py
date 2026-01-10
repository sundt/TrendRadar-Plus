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

from trendradar.web.db_online import get_online_db_conn
from trendradar.providers.runner import run_provider_ingestion_once, build_default_registry, ProviderRegistry

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

class TestSourceRequest(BaseModel):
    provider_type: str
    config_json: str
    script_content: Optional[str] = None

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
    test_error: Optional[str] = None

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

@router.get("", response_model=List[Dict[str, Any]])
async def list_custom_sources(request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    
    # Get all custom sources with stats fields
    cur = conn.execute("""
        SELECT id, name, provider_type, config_json, enabled, schedule_cron, 
               category, country, language, last_run_at, last_status, last_error, 
               backoff_until, created_at, updated_at, entries_count, fail_count, script_content
        FROM custom_sources 
        ORDER BY updated_at DESC
    """)
    rows = cur.fetchall()
    
    # Get counts from today's news.db
    real_counts = {}
    try:
        root = _get_project_root(request)
        news_conn = _get_news_db_conn(root)
        if news_conn:
            try:
                # Count items per platform for today
                cur_news = news_conn.execute("SELECT platform_id, COUNT(*) FROM news_items GROUP BY platform_id")
                for r in cur_news.fetchall():
                    real_counts[r[0]] = r[1]
            finally:
                news_conn.close()
    except Exception as e:
        print(f"Error querying news.db counts: {e}")
    
    results = []
    for r in rows:
        source_id = r[0]
        # Use real count from news.db if available, otherwise fallback to stats
        real_count = real_counts.get(source_id, 0)
        
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
            "last_run_at": r[9],
            "last_status": r[10],
            "last_error": r[11],
            "backoff_until": r[12],
            "created_at": r[13],
            "updated_at": r[14],
            "stats": {
                "entries": real_count, # Use real DB count
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
            INSERT INTO custom_sources (id, name, provider_type, config_json, enabled, schedule_cron, category, country, language, script_content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (source.id, source.name, source.provider_type, source.config_json, source.enabled, source.schedule_cron, source.category, source.country, source.language, source.script_content or '', now, now)
        )
        conn.commit()
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
            SET name = ?, provider_type = ?, config_json = ?, enabled = ?, schedule_cron = ?, category = ?, country = ?, language = ?, script_content = ?, updated_at = ?
            WHERE id = ?
            """,
            (source.name, source.provider_type, source.config_json, source.enabled, source.schedule_cron, source.category, source.country, source.language, source.script_content or '', now, source_id)
        )
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{source_id}")
async def delete_custom_source(source_id: str, request: Request, _=Depends(_require_admin)):
    conn = _get_conn(request)
    try:
        conn.execute("DELETE FROM custom_sources WHERE id = ?", (source_id,))
        conn.commit()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/{source_id}/run")
async def run_custom_source(source_id: str, request: Request, _=Depends(_require_admin)):
    """Trigger immediate run for a source."""
    conn = _get_conn(request)
    
    # Load config from DB - include script_content
    cur = conn.execute("SELECT name, config_json, provider_type, entries_count, fail_count, script_content FROM custom_sources WHERE id = ?", (source_id,))
    row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Source not found")
        
    source_name = row[0]
    config_json = row[1]
    provider_type = row[2]
    current_entries = row[3] or 0
    current_fails = row[4] or 0
    script_content = row[5] or ""
    
    try:
        config = json.loads(config_json)
    except:
        raise HTTPException(status_code=500, detail="Invalid config JSON in DB")
    
    # Add script_content to config for dynamic_py provider
    if provider_type == "dynamic_py" and script_content:
        config["script_content"] = script_content

    registry = build_default_registry()
    try:
        provider = registry.get(provider_type)
    except KeyError:
        raise HTTPException(status_code=400, detail=f"Provider {provider_type} not found")

    root = _get_project_root(request)
    
    from trendradar.core import load_config
    from trendradar.providers.base import ProviderFetchContext
    
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
            from trendradar.storage.base import NewsData
            from trendradar.storage.local import LocalStorageBackend
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
        
        return {"success": True, "items_count": items_count}
        
    except Exception as e:
        traceback.print_exc()
        new_fails = current_fails + 1
        
        # Update DB error with fail_count
        conn.execute("""
            UPDATE custom_sources 
            SET last_run_at = ?, last_status = 'error', last_error = ?, 
                fail_count = ?, updated_at = ?
            WHERE id = ?
        """, (now_str, str(e), new_fails, now_str, source_id))
        conn.commit()
        
        raise HTTPException(status_code=500, detail=f"Run failed: {str(e)}")

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
    """Get latest items from a custom source."""
    conn = _get_conn(request)
    
    # Verify source exists
    cur = conn.execute("SELECT id FROM custom_sources WHERE id = ?", (source_id,))
    if not cur.fetchone():
        raise HTTPException(status_code=404, detail="Source not found")
    
    items = []
    
    # Query latest items from today's news_items table
    root = _get_project_root(request)
    news_conn = _get_news_db_conn(root)
    
    if news_conn:
        try:
            # Query items from news.db
            cur = news_conn.execute("""
                SELECT title, url, last_crawl_time, first_crawl_time 
                FROM news_items 
                WHERE platform_id = ? 
                ORDER BY last_crawl_time DESC 
                LIMIT 10
            """, (source_id,))
            
            for row in cur.fetchall():
                items.append({
                    "title": row[0],
                    "url": row[1],
                    "crawl_time": row[2],
                    "first_time": row[3]
                })
        except Exception as e:
            # Table might not exist or other error
            print(f"Error querying news.db: {e}")
            pass
        finally:
            try:
                news_conn.close()
            except:
                pass
    
    return {"items": items}

@router.post("/test")
async def test_custom_source(payload: TestSourceRequest, request: Request, _=Depends(_require_admin)):
    """Dry run a provider configuration effectively."""
    print(f"DEBUG: test_custom_source payload: {payload}")
    try:
        config = json.loads(payload.config_json)
        if payload.script_content:
             config["script_content"] = payload.script_content
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
    from trendradar.core import load_config
    app_config = load_config(str(root / "config" / "config.yaml"))
    
    # Mock ingestion config just for this run
    # But wait, `run_provider_ingestion_once` reads config from file or DB.
    # We should invoke the provider directly or make `run_provider_ingestion_once` support passing config directly?
    # `run_provider_ingestion_once` loads from config inside.
    # It takes `registry` and `project_root`.
    
    # Better to invoke provider directly here to capture output immediately without side effects (like metrics)? 
    # Or just reuse the logic. Let's reuse logic by subclassing or careful call.
    # Actually, simpler to just instantiate the provider and call fetch.
    
    from trendradar.providers.base import ProviderFetchContext
    
    ctx = ProviderFetchContext(
        project_root=str(root),
        now=datetime.now(),
        config=app_config
    )
    
    try:
        provider = registry.get(provider_id)
        result = provider.fetch(
            ctx=ctx,
            platform_id="test_run",
            platform_name="Test Run",
            platform_config=config,
        )
        
        # Serialize result for preview
        items = []
        for it in result.items:
            items.append({
                "title": it.title,
                "url": it.url,
                "time": it.crawl_time
            })
            
        return {
            "success": True,
            "items_count": len(items),
            "items": items[:20], # limit preview
            "metric": result.metric,
            "warning": "选择器可能需要调整：只抓到少量数据，建议检查 items 选择器是否正确匹配了页面上的多个元素" if len(items) <= 2 else None
        }
        
    except Exception as e:
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
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
            res = requests.get(url, headers=headers, timeout=10, verify=False)
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
             model = (os.environ.get("TREND_RADAR_SCRAPER_AI_MODEL") or 
                      os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip() or "qwen-plus"
             endpoint = (os.environ.get("TREND_RADAR_MB_AI_ENDPOINT") or "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
             
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
                if os.environ.get("TREND_RADAR_MB_AI_USE_PROXY", "").strip().lower() in {"1", "true", "yes"}:
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

        # Helper to clean HTML for LLM
        def _clean_html_for_llm(html_content: str) -> str:
            try:
                soup = BeautifulSoup(html_content, "html.parser")
                # Remove scripts, styles, svg, meta, link, comments
                for tag in soup(["script", "style", "svg", "meta", "link", "noscript"]):
                    tag.decompose()
                # Remove comments
                from bs4 import Comment
                for comment in soup.find_all(text=lambda text: isinstance(text, Comment)):
                    comment.extract()
                return str(soup)
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

    endpoint = (os.environ.get("TREND_RADAR_MB_AI_ENDPOINT") or "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
    model = (os.environ.get("TREND_RADAR_SCRAPER_AI_MODEL") or os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip()

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
        if os.environ.get("TREND_RADAR_MB_AI_USE_PROXY", "").strip().lower() in {"1", "true", "yes"}:
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
    
    endpoint = (os.environ.get("TREND_RADAR_MB_AI_ENDPOINT") or 
                "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions").strip()
    model = (os.environ.get("TREND_RADAR_SCRAPER_AI_MODEL") or 
             os.environ.get("TREND_RADAR_MB_AI_MODEL") or "qwen-plus").strip()
    
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
        system_prompt = f"""You are an expert web scraper debugging assistant with deep knowledge of HTML parsing.
You are helping to create a working scraper for: {url}

SCRAPER MODES:
1. html_scraper - Use CSS selectors for simple HTML pages
2. dynamic_py - Write custom Python code for complex pages

THINK STEP BY STEP:
1. First, analyze the HTML structure - what patterns exist?
2. Identify where the news items are - look for <article>, <li>, <div> with repeated classes
3. For each item, find: title (usually in h1-h6 or a), link (a href), date (time, span)
4. Consider: Is data loaded via JavaScript? Is it in JSON inside a <script> tag?
5. If CSS selectors keep failing, switch to Python and parse the page differently

CRITICAL RULES:
- NEVER repeat a failed approach - if CSS selectors returned 0 items twice, use Python
- In Python scripts, use requests.get() to fetch the page, then parse with BeautifulSoup
- Items selector must match MULTIPLE elements (5+), not just one
- Return items as list of dicts with 'title', 'url', 'crawl_time' keys
- For crawl_time, use: datetime.now().strftime("%Y-%m-%d %H:%M")
- Handle encoding: resp.encoding = resp.apparent_encoding if resp.encoding == 'ISO-8859-1' else resp.encoding

RESPONSE FORMAT (strict JSON):
{{
  "thinking": "Your detailed step-by-step analysis:\\n1. First I noticed...\\n2. The structure shows...\\n3. My approach is...",
  "type": "html_scraper" or "dynamic_py",
  "config": {{"url": "...", "scrape_rules": {{"items": "...", "title": "...", "link": "...", "date": "..."}}}},
  "script_content": "def fetch(config, ctx):\\n    from datetime import datetime\\n    import requests\\n    from bs4 import BeautifulSoup\\n    ...\\n    return items",
  "name_suggestion": "网站名称 - 频道/栏目",
  "confidence": 1-10
}}

HTML (truncated to first 25000 chars):
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

Please analyze what went wrong and provide a FIXED version. Remember what you tried before and don't repeat the same approach if it failed."""
        messages.append({"role": "user", "content": user_msg})
    else:
        # First attempt
        messages.append({"role": "user", "content": "Please generate an initial scraper configuration for this page. Analyze the HTML structure carefully."})
    
    # 3. Call LLM
    try:
        req_body = {
            "model": model,
            "messages": messages,
            "temperature": 0.2
        }
        headers_ai = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        
        proxies = {"http": None, "https": None}
        if os.environ.get("TREND_RADAR_MB_AI_USE_PROXY", "").strip().lower() in {"1", "true", "yes"}:
            proxies = None
        
        ai_res = requests.post(endpoint, headers=headers_ai, json=req_body, timeout=60, proxies=proxies)
        if ai_res.status_code != 200:
            raise HTTPException(status_code=500, detail=f"AI Error: {ai_res.text}")
        
        data = ai_res.json()
        content = data["choices"][0]["message"]["content"]
        
        # Clean markdown
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]
        
        # Clean control characters that break JSON parsing
        import re
        # Replace actual newlines/tabs in string values with escaped versions
        # First, try to parse as-is
        try:
            result = json.loads(content.strip())
        except json.JSONDecodeError:
            # Try cleaning control characters
            # Remove control chars except for standard JSON whitespace
            cleaned = re.sub(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', '', content)
            # Also try to fix unescaped newlines in strings
            # This is a heuristic - replace actual newlines with \n
            cleaned = cleaned.replace('\n', '\\n').replace('\t', '\\t').replace('\r', '\\r')
            # But we need to restore proper JSON structure newlines
            # A better approach: use strict=False
            try:
                result = json.loads(content.strip(), strict=False)
            except json.JSONDecodeError:
                # Last resort: try cleaned version
                result = json.loads(cleaned.strip())
        
        # Build response
        ret = {
            "thinking": result.get("thinking", ""),
            "confidence": result.get("confidence", 5),
            "html_snippet": html_snippet[:5000],  # Return truncated for frontend caching
            "name_suggestion": result.get("name_suggestion", ""),
        }
        
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
