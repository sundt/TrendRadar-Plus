# coding=utf-8
"""
Smart Summary API

Provides one-click article summarization with auto-classification and auto-favorite.
"""

import os
import time
import hashlib
import logging
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Body

router = APIRouter(prefix="/api/summary", tags=["summary"])


def _now_ts() -> int:
    return int(time.time())


def _generate_news_id(url: str) -> str:
    """Generate a unique news_id from URL."""
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    return f"summary-{url_hash}"


def _get_user_db_conn(request: Request):
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_current_user(request: Request):
    """Get current authenticated user or raise 401."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="请先登录")
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="登录已过期")
    
    return user_info


def _ensure_favorites_table(conn):
    """Ensure the favorites table exists with all columns."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_favorites (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            news_id TEXT NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            source_id TEXT,
            source_name TEXT,
            published_at INTEGER,
            created_at INTEGER NOT NULL,
            note TEXT,
            summary TEXT,
            summary_at INTEGER,
            summary_model TEXT,
            article_type TEXT,
            summary_tokens INTEGER DEFAULT 0,
            UNIQUE(user_id, news_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_favorites_user ON user_favorites(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_favorites_created ON user_favorites(user_id, created_at DESC)")
    
    # Migration: add new columns if they don't exist
    try:
        conn.execute("SELECT article_type FROM user_favorites LIMIT 1")
    except Exception:
        try:
            conn.execute("ALTER TABLE user_favorites ADD COLUMN article_type TEXT")
        except:
            pass
    
    # Migration: add summary_tokens column
    try:
        conn.execute("SELECT summary_tokens FROM user_favorites LIMIT 1")
    except Exception:
        try:
            conn.execute("ALTER TABLE user_favorites ADD COLUMN summary_tokens INTEGER DEFAULT 0")
        except:
            pass
    
    conn.commit()


def _save_to_global_cache(request: Request, url: str, title: str, summary: str, article_type: str, model: str, user_id: int, token_usage: dict = None, fetch_method: str = "", quality_tag: str = "", category_tags: list = None, generation_time_ms: int = 0):
    """Save summary to global cache for sharing across users."""
    try:
        from hotnews.web.db_online import get_online_db_conn
        import json
        
        url_hash = hashlib.md5(url.encode()).hexdigest()
        now = _now_ts()
        
        online_conn = get_online_db_conn(request.app.state.project_root)
        
        prompt_tokens = token_usage.get("prompt_tokens", 0) if token_usage else 0
        completion_tokens = token_usage.get("completion_tokens", 0) if token_usage else 0
        total_tokens = token_usage.get("total_tokens", 0) if token_usage else 0
        
        # Serialize category_tags to JSON
        category_tags_json = json.dumps(category_tags or [], ensure_ascii=False)
        
        online_conn.execute(
            """
            INSERT INTO article_summaries (url_hash, url, title, summary, article_type, model, created_at, created_by, hit_count, updated_at, prompt_tokens, completion_tokens, total_tokens, fetch_method, quality_tag, category_tags, generation_time_ms)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url_hash) DO UPDATE SET
                hit_count = hit_count + 1,
                updated_at = excluded.updated_at,
                quality_tag = excluded.quality_tag,
                category_tags = excluded.category_tags
            """,
            (url_hash, url[:2000], title[:500], summary, article_type, model, now, user_id, now, prompt_tokens, completion_tokens, total_tokens, fetch_method or "", quality_tag or "", category_tags_json, generation_time_ms)
        )
        online_conn.commit()
    except Exception as e:

        logging.warning(f"Failed to save to global cache: {e}")


def _get_user_token_info(request: Request, user_id: int) -> dict:
    """Get user's token balance and subscription status.
    
    Returns:
        token_balance: Total available tokens (for free users)
        tokens_used: Not used anymore (kept for compatibility)
        default_tokens: Default free quota
        is_vip: Whether user is VIP
        usage_remaining: VIP usage remaining (if VIP)
        permission_type: Current permission type
    """
    
    total_balance = 0
    is_vip = False
    usage_remaining = 0
    permission_type = "token"
    
    try:
        from hotnews.web.db_online import get_online_db_conn
        from hotnews.kernel.user.payment_api import get_user_token_balance, ensure_user_free_quota
        from hotnews.kernel.user.permission_checker import can_use_summary
        from hotnews.kernel.user.subscription_service import ensure_user_subscription
        
        online_conn = get_online_db_conn(request.app.state.project_root)
        
        # Ensure user has free quota and subscription record
        ensure_user_free_quota(online_conn, user_id)
        ensure_user_subscription(online_conn, user_id)
        
        # Check permission
        can_use, perm_type, extra_info = can_use_summary(online_conn, user_id)
        permission_type = perm_type
        
        if perm_type == "vip":
            is_vip = True
            usage_remaining = extra_info.get("usage_remaining", 0)
        
        # Get total token balance (for display)
        recharge_balance = get_user_token_balance(online_conn, user_id)
        total_balance = recharge_balance.get("total", 0)
        
        logging.debug(f"[TokenInfo] user_id={user_id}, total_balance={total_balance}, is_vip={is_vip}, perm={permission_type}")
    except Exception as e:
        logging.warning(f"[TokenInfo] Failed to get token balance: {e}")
        total_balance = 100000  # Fallback to default
    
    return {
        "token_balance": total_balance,
        "tokens_used": 0,  # Deprecated, kept for compatibility
        "default_tokens": 100000,
        "is_vip": is_vip,
        "usage_remaining": usage_remaining,
        "permission_type": permission_type,
    }


def _consume_user_tokens(request: Request, user_id: int, amount: int, news_id: str = None, title: str = None) -> dict:
    """
    Consume tokens/quota from user account based on permission type.
    VIP users: consume usage quota, log tokens (no deduction)
    Free users: consume tokens from balance
    
    Returns:
        token_balance: New total balance after consumption
        tokens_used: Deprecated (always 0)
        is_vip: Whether user is VIP
        usage_remaining: VIP usage remaining (if VIP)
    """
    
    try:
        from hotnews.web.db_online import get_online_db_conn
        from hotnews.kernel.user.permission_checker import can_use_summary, consume_quota
        from hotnews.kernel.user.subscription_service import ensure_user_subscription
        from hotnews.kernel.user.payment_api import ensure_user_free_quota
        
        online_conn = get_online_db_conn(request.app.state.project_root)
        
        # Ensure user has records
        ensure_user_free_quota(online_conn, user_id)
        ensure_user_subscription(online_conn, user_id)
        
        # Check permission type
        can_use, perm_type, extra_info = can_use_summary(online_conn, user_id)
        
        if can_use:
            # Consume based on permission type
            consume_quota(online_conn, user_id, perm_type, amount, news_id, title)
            logging.info(f"[TokenConsume] Consumed: user={user_id}, type={perm_type}, amount={amount}")
        else:
            logging.warning(f"[TokenConsume] No permission: user={user_id}, type={perm_type}")
    except Exception as e:
        logging.warning(f"[TokenConsume] Failed to consume tokens: {e}")
    
    # Return updated token info
    return _get_user_token_info(request, user_id)


@router.post("")
async def generate_summary(
    request: Request,
    url: str = Body(...),
    title: str = Body(...),
    news_id: Optional[str] = Body(None),
    source_id: Optional[str] = Body(None),
    source_name: Optional[str] = Body(None),
):
    """
    Generate smart summary for an article.
    Auto-classifies article type and uses specialized template.
    Auto-adds to favorites.
    """
    from hotnews.kernel.services.article_summary import (
        check_rate_limit, record_request, fetch_article_content, generate_smart_summary
    )
    from hotnews.kernel.services.prompts import get_type_name
    
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    # Check rate limit
    is_allowed, remaining = check_rate_limit(user["id"])
    if not is_allowed:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试（每小时限制20次）")
    
    # Generate news_id if not provided
    if not news_id:
        news_id = _generate_news_id(url)
    
    # Check if already summarized
    cur = conn.execute(
        "SELECT summary, article_type FROM user_favorites WHERE user_id = ? AND news_id = ?",
        (user["id"], news_id)
    )
    row = cur.fetchone()
    
    if row and row[0]:
        # Return cached summary
        return {
            "ok": True,
            "summary": row[0],
            "article_type": row[1] or "other",
            "article_type_name": get_type_name(row[1] or "other"),
            "cached": True,
            "favorited": True,
            "news_id": news_id
        }
    
    # Get API key
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI 服务未配置")
    
    model = os.environ.get("DASHSCOPE_MODEL", "qwen-turbo")
    
    # Step 1: Fetch article content
    content, error, _fetch_method = await fetch_article_content(url)
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    # Step 2: Generate smart summary (includes classification)
    summary, error, article_type = await generate_smart_summary(content, api_key, model)
    if error:
        raise HTTPException(status_code=500, detail=error)
    
    # Record the request for rate limiting
    record_request(user["id"])
    
    # Step 3: Auto-add to favorites (upsert)
    now = _now_ts()
    
    try:
        conn.execute(
            """
            INSERT INTO user_favorites (user_id, news_id, title, url, source_id, source_name, created_at, summary, summary_at, summary_model, article_type)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, news_id) DO UPDATE SET
                title = excluded.title,
                summary = excluded.summary,
                summary_at = excluded.summary_at,
                summary_model = excluded.summary_model,
                article_type = excluded.article_type
            """,
            (user["id"], news_id, title[:500], url[:2000], source_id, source_name, now, summary, now, model, article_type)
        )
        conn.commit()
    except Exception as e:
        # Log but don't fail - summary is more important

        logging.warning(f"Failed to save favorite: {e}")
    
    return {
        "ok": True,
        "summary": summary,
        "article_type": article_type,
        "article_type_name": get_type_name(article_type),
        "cached": False,
        "favorited": True,
        "news_id": news_id,
        "remaining": remaining - 1
    }


@router.post("/stream")
async def generate_summary_stream(
    request: Request,
    url: str = Body(...),
    title: str = Body(...),
    news_id: Optional[str] = Body(None),
    source_id: Optional[str] = Body(None),
    source_name: Optional[str] = Body(None),
    content: Optional[str] = Body(None),  # 插件提取的页面内容（优先使用）
    contribute: Optional[bool] = Body(False),  # 是否贡献内容到缓存
    force: Optional[int] = None,  # Query param: force=1 to skip short content check
):
    """
    Generate smart summary with streaming output (SSE).
    Returns Server-Sent Events for progressive rendering.
    
    Body params:
        content: Pre-extracted page content from browser extension (preferred over fetching)
        contribute: Whether to contribute content to cache for other users
    
    Query params:
        force: Set to 1 to skip short content check
    """
    import json
    
    # Check force param from query string
    force_summary = request.query_params.get('force') == '1'
    from fastapi.responses import StreamingResponse
    from hotnews.kernel.services.article_summary import (
        check_rate_limit, record_request, fetch_article_content, generate_smart_summary_stream
    )
    from hotnews.kernel.services.prompts import get_type_name
    
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    # Check rate limit
    is_allowed, remaining = check_rate_limit(user["id"])
    if not is_allowed:
        raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试（每小时限制20次）")
    
    # Check permission (VIP or token balance)
    try:
        from hotnews.web.db_online import get_online_db_conn
        from hotnews.kernel.user.permission_checker import can_use_summary, get_permission_error_message
        from hotnews.kernel.user.subscription_service import ensure_user_subscription
        from hotnews.kernel.user.payment_api import ensure_user_free_quota
        
        online_conn = get_online_db_conn(request.app.state.project_root)
        ensure_user_free_quota(online_conn, user["id"])
        ensure_user_subscription(online_conn, user["id"])
        
        can_use, perm_type, extra_info = can_use_summary(online_conn, user["id"])
        if not can_use:
            error_msg = get_permission_error_message(perm_type, extra_info)
            raise HTTPException(status_code=403, detail=error_msg)
    except HTTPException:
        raise
    except Exception as e:
        logging.warning(f"Permission check failed: {e}")
        # Continue anyway if permission check fails (fallback)
    
    # Generate news_id if not provided
    if not news_id:
        news_id = _generate_news_id(url)
    
    # Check if already summarized (return cached)
    cur = conn.execute(
        "SELECT summary, article_type, summary_tokens FROM user_favorites WHERE user_id = ? AND news_id = ?",
        (user["id"], news_id)
    )
    row = cur.fetchone()
    
    if row and row[0]:
        # Return cached summary - user viewing their own cached summary, NO charge
        # (Different users using global cache would be charged, but that's handled separately)
        
        # Just get current balance, don't consume
        token_info = _get_user_token_info(request, user["id"])
        cached_tokens = row[2] or 0  # Original tokens used when generated
        
        # Get tags from global cache
        cached_tags = {'quality': None, 'category': []}
        try:
            from hotnews.web.db_online import get_online_db_conn
            import hashlib
            url_hash = hashlib.md5(url.encode()).hexdigest()
            online_conn = get_online_db_conn(request.app.state.project_root)
            tag_cur = online_conn.execute(
                "SELECT quality_tag, category_tags FROM article_summaries WHERE url_hash = ?",
                (url_hash,)
            )
            tag_row = tag_cur.fetchone()
            if tag_row:
                cached_tags['quality'] = tag_row[0] if tag_row[0] else None
                try:
                    cached_tags['category'] = json.loads(tag_row[1]) if tag_row[1] else []
                except:
                    cached_tags['category'] = []
        except Exception as e:

            logging.debug(f"Failed to get cached tags: {e}")
        
        async def cached_stream():
            data = {
                "type": "cached",
                "summary": row[0],
                "article_type": row[1] or "other",
                "article_type_name": get_type_name(row[1] or "other"),
                "news_id": news_id,
                "token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": cached_tokens},  # Show original consumption
                "token_balance": token_info["token_balance"],
                "tokens_used": token_info["tokens_used"],
                "tags": cached_tags
            }
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
        
        return StreamingResponse(
            cached_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache, no-store, must-revalidate",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
                "X-Content-Type-Options": "nosniff",
            }
        )
    
    # Get API key
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI 服务未配置")
    
    model = os.environ.get("DASHSCOPE_MODEL", "qwen-turbo")
    
    # Minimum content length for AI summary (characters)
    MIN_CONTENT_FOR_SUMMARY = 500
    
    async def stream_generator():
        nonlocal content  # 使用外部传入的 content 参数
        
        # Record start time for generation time tracking
        import time
        start_time_ms = int(time.time() * 1000)
        
        # Step 1: Get article content (prefer plugin-provided content)
        fetch_method = "plugin"  # 默认标记为插件提供
        error = None
        
        # 检查插件是否提供了有效内容
        plugin_content = content.strip() if content else ""
        if plugin_content and len(plugin_content) >= 100:
            # 使用插件提供的内容
            content = plugin_content
            fetch_method = "plugin"
            yield f"data: {json.dumps({'type': 'status', 'message': '使用浏览器提取的内容...'}, ensure_ascii=False)}\n\n"
            logging.info(f"[Summary] Using plugin-provided content for {url[:50]}, length={len(content)}")
        else:
            # 插件没有提供有效内容，回退到服务器抓取
            yield f"data: {json.dumps({'type': 'status', 'message': '正在获取文章内容...'}, ensure_ascii=False)}\n\n"
            content, error, fetch_method = await fetch_article_content(url)
        if error:
            # Record failure for tracking
            try:
                from hotnews.web.db_online import get_online_db_conn
                from hotnews.kernel.services.summary_failure_tracker import record_summary_failure
                
                online_conn = get_online_db_conn(request.app.state.project_root)
                # Map error message to reason code
                reason = "fetch_error"
                if "超时" in error:
                    reason = "fetch_timeout"
                elif "403" in error or "反爬" in error or "限制" in error:
                    reason = "fetch_blocked"
                elif "404" in error or "不存在" in error:
                    reason = "fetch_404"
                elif "无法获取" in error or "内容" in error:
                    reason = "content_empty"
                
                record_summary_failure(online_conn, url, reason, error, fetch_method, user["id"])
            except Exception as e:
                logging.warning(f"Failed to record summary failure: {e}")
            
            yield f"data: {json.dumps({'type': 'error', 'message': error}, ensure_ascii=False)}\n\n"
            return
        
        # Check for anti-crawler/CAPTCHA content patterns
        # These indicate the page couldn't be properly fetched
        ANTI_CRAWLER_PATTERNS = [
            "环境异常",
            "当前环境异常",
            "请完成验证",
            "验证码",
            "CAPTCHA",
            "请输入验证码",
            "访问验证",
            "安全验证",
            "人机验证",
            "请先登录",
            "需要登录",
            "登录后查看",
            "请使用微信扫码",
        ]
        
        content_lower = (content or "").lower()
        is_anti_crawler = False
        detected_pattern = None
        
        for pattern in ANTI_CRAWLER_PATTERNS:
            if pattern.lower() in content_lower:
                is_anti_crawler = True
                detected_pattern = pattern
                break
        
        # Also check if content is suspiciously short AND contains warning keywords
        content_length = len(content) if content else 0
        if content_length < 800 and any(kw in content_lower for kw in ["warning", "error", "异常", "失败", "无法"]):
            is_anti_crawler = True
            detected_pattern = "suspicious_short_content"
        
        if is_anti_crawler:
            # Record as fetch_blocked failure
            try:
                from hotnews.web.db_online import get_online_db_conn
                from hotnews.kernel.services.summary_failure_tracker import record_summary_failure
                
                online_conn = get_online_db_conn(request.app.state.project_root)
                error_detail = f"检测到反爬/验证码页面: {detected_pattern}"
                record_summary_failure(
                    online_conn, url, "fetch_blocked", error_detail, fetch_method, user["id"],
                    source_id=source_id, source_name=source_name
                )
                logging.info(f"Recorded anti-crawler detection for {url}: {detected_pattern}")
            except Exception as e:
                logging.warning(f"Failed to record anti-crawler failure: {e}")
            
            # Show error to user
            error_data = {
                'type': 'error',
                'message': '该网站需要验证，暂时无法获取内容。建议直接阅读原文 📖'
            }
            yield f"data: {json.dumps(error_data, ensure_ascii=False)}\n\n"
            return
        
        # Check if content is too short for summary (skip if force=1)
        if not force_summary and content_length < MIN_CONTENT_FOR_SUMMARY:
            # Content too short - suggest reading original
            # Get a preview (first 300 chars, clean up)
            preview = content[:300].strip() if content else ""
            if len(content) > 300:
                preview += "..."
            
            short_data = {
                'type': 'short_content',
                'message': '内容较短，建议直接阅读原文',
                'content_length': content_length,
                'preview': preview,
                'news_id': news_id
            }
            yield f"data: {json.dumps(short_data, ensure_ascii=False)}\n\n"
            return
        
        yield f"data: {json.dumps({'type': 'status', 'message': '正在分析文章类型...'}, ensure_ascii=False)}\n\n"
        
        # Step 2: Stream summary generation
        full_summary = ""
        article_type = "other"
        token_usage = None
        confidence = 0.0
        
        async for chunk, is_done, a_type, err, usage, conf in generate_smart_summary_stream(content, api_key, model, source_name=source_name):
            if err:
                # Record AI failure for tracking
                try:
                    from hotnews.web.db_online import get_online_db_conn
                    from hotnews.kernel.services.summary_failure_tracker import record_summary_failure
                    
                    online_conn = get_online_db_conn(request.app.state.project_root)
                    reason = "ai_error"
                    if "超时" in err:
                        reason = "ai_timeout"
                    
                    record_summary_failure(online_conn, url, reason, err, fetch_method, user["id"])
                except Exception as e:
                    logging.warning(f"Failed to record AI failure: {e}")
                
                yield f"data: {json.dumps({'type': 'error', 'message': err}, ensure_ascii=False)}\n\n"
                return
            
            article_type = a_type
            if conf is not None:
                confidence = conf
            
            if chunk is None and not is_done:
                # Article type determined, send it with confidence
                yield f"data: {json.dumps({'type': 'type', 'article_type': article_type, 'article_type_name': get_type_name(article_type), 'confidence': confidence}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'status', 'message': '正在生成总结...'}, ensure_ascii=False)}\n\n"
            elif chunk:
                full_summary += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
            elif is_done:
                token_usage = usage
                # Save to favorites
                record_request(user["id"])
                now = _now_ts()
                
                # Update user token balance using unified helper (with logging)
                total_tokens = token_usage.get("total_tokens", 0) if token_usage else 0
                token_info = _consume_user_tokens(request, user["id"], total_tokens, news_id, title)
                
                # Extract tags before stripping
                quality_tag = ""
                category_tags = []
                try:
                    from hotnews.kernel.services.article_summary import extract_tags_from_summary, strip_tags_from_summary, update_entry_tags_from_summary
                    from hotnews.web.db_online import get_online_db_conn
                    
                    logging.info(f"[TagExtract] Extracting tags from summary (length={len(full_summary)})")
                    tags = extract_tags_from_summary(full_summary)
                    quality_tag = tags.get('quality') or ""
                    category_tags = tags.get('category') or []
                    logging.info(f"[TagExtract] Result: quality={quality_tag}, category={category_tags}")
                except Exception as e:
                    logging.warning(f"[TagExtract] Tag extraction failed: {e}")
                
                # Strip tags block from summary for display/storage
                try:
                    from hotnews.kernel.services.article_summary import strip_tags_from_summary
                    display_summary = strip_tags_from_summary(full_summary)
                except:
                    display_summary = full_summary
                
                try:
                    conn.execute(
                        """
                        INSERT INTO user_favorites (user_id, news_id, title, url, source_id, source_name, created_at, summary, summary_at, summary_model, article_type, summary_tokens)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(user_id, news_id) DO UPDATE SET
                            title = excluded.title,
                            summary = excluded.summary,
                            summary_at = excluded.summary_at,
                            summary_model = excluded.summary_model,
                            article_type = excluded.article_type,
                            summary_tokens = excluded.summary_tokens
                        """,
                        (user["id"], news_id, title[:500], url[:2000], source_id, source_name, now, display_summary, now, model, article_type, total_tokens)
                    )
                    conn.commit()
                except Exception as e:

                    logging.warning(f"Failed to save favorite: {e}")
                
                # Calculate generation time
                generation_time_ms = int(time.time() * 1000) - start_time_ms
                
                # Save to global cache with tags and generation time
                _save_to_global_cache(request, url, title, display_summary, article_type, model, user["id"], token_usage, fetch_method, quality_tag, category_tags, generation_time_ms)
                
                # Record success for domain stats
                try:
                    from hotnews.kernel.services.summary_failure_tracker import record_summary_success
                    record_summary_success(online_conn, url)
                except Exception as e:
                    logging.debug(f"Failed to record summary success: {e}")
                
                # Also update rss_entry_tags for "我的关注" feature (category tags only)
                try:
                    if category_tags:
                        from hotnews.kernel.services.article_summary import update_entry_tags_from_summary
                        from hotnews.web.db_online import get_online_db_conn
                        online_conn = get_online_db_conn(request.app.state.project_root)
                        update_entry_tags_from_summary(online_conn, url, {'category': category_tags})
                        logging.info(f"[MyTags] Updated entry tags for {url[:50]}: {category_tags}")
                    else:
                        logging.info(f"[MyTags] No category tags extracted for {url[:50]}")
                except Exception as e:
                    logging.warning(f"[MyTags] Tag update failed: {e}")
                
                # Return done with token info and tags
                done_data = {
                    'type': 'done',
                    'news_id': news_id,
                    'remaining': remaining - 1,
                    'token_usage': token_usage,
                    'token_balance': token_info["token_balance"],
                    'tokens_used': token_info["tokens_used"],
                    'tags': {
                        'quality': quality_tag if quality_tag else None,
                        'category': category_tags
                    }
                }
                yield f"data: {json.dumps(done_data, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff",
            "Transfer-Encoding": "chunked",
            # Cloudflare specific
            "CF-Cache-Status": "DYNAMIC",
        }
    )


@router.delete("/{news_id}")
async def delete_summary(request: Request, news_id: str):
    """Delete cached summary (allows regeneration)."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    conn.execute(
        "UPDATE user_favorites SET summary = NULL, summary_at = NULL, summary_model = NULL, article_type = NULL WHERE user_id = ? AND news_id = ?",
        (user["id"], news_id)
    )
    conn.commit()
    
    return {"ok": True, "news_id": news_id}


@router.get("/list")
async def list_summarized(request: Request):
    """Get list of news_ids that have been summarized by current user."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    _ensure_favorites_table(conn)
    
    cur = conn.execute(
        "SELECT news_id FROM user_favorites WHERE user_id = ? AND summary IS NOT NULL AND summary != ''",
        (user["id"],)
    )
    rows = cur.fetchall() or []
    news_ids = [row[0] for row in rows]
    
    return {"ok": True, "news_ids": news_ids}


# Create a separate router for user token API
user_router = APIRouter(prefix="/api/user", tags=["user"])


@user_router.get("/tokens")
async def get_user_tokens(request: Request):
    """Get current user's token balance and usage."""
    user = _get_current_user(request)
    token_info = _get_user_token_info(request, user["id"])
    return {
        "ok": True,
        **token_info
    }


@router.get("/tags")
async def get_article_tags(request: Request, urls: str = ""):
    """
    Get tags for articles by URLs (batch query).
    
    Query params:
        urls: Comma-separated list of article URLs
    
    Returns:
        {
            "ok": true,
            "tags": {
                "url1": {"quality": "gem", "category": ["ai_ml", "tutorial"]},
                "url2": {"quality": null, "category": ["finance"]},
                ...
            }
        }
    
    Note: Only summarized articles have tags.
    """
    import json as json_module
    
    if not urls:
        return {"ok": True, "tags": {}}
    
    url_list = [u.strip() for u in urls.split(",") if u.strip()]
    if not url_list:
        return {"ok": True, "tags": {}}
    
    # Limit to 50 URLs per request
    url_list = url_list[:50]
    
    try:
        from hotnews.web.db_online import get_online_db_conn
        
        online_conn = get_online_db_conn(request.app.state.project_root)
        
        # Build query with placeholders
        placeholders = ",".join(["?"] * len(url_list))
        cur = online_conn.execute(
            f"""
            SELECT url, quality_tag, category_tags
            FROM article_summaries
            WHERE url IN ({placeholders})
            """,
            tuple(url_list)
        )
        rows = cur.fetchall() or []
        
        result = {}
        for row in rows:
            url = row[0]
            quality_tag = row[1] or None
            category_tags_raw = row[2] or "[]"
            
            try:
                category_tags = json_module.loads(category_tags_raw)
            except:
                category_tags = []
            
            result[url] = {
                "quality": quality_tag if quality_tag else None,
                "category": category_tags
            }
        
        return {"ok": True, "tags": result}
        
    except Exception as e:

        logging.warning(f"Failed to get article tags: {e}")
        return {"ok": False, "error": str(e), "tags": {}}


@router.get("/tags/by-hash")
async def get_article_tags_by_hash(request: Request, hashes: str = ""):
    """
    Get tags for articles by URL hashes (batch query).
    More efficient than URL-based query for frontend.
    
    Query params:
        hashes: Comma-separated list of URL MD5 hashes
    
    Returns same format as /tags endpoint.
    """
    import json as json_module
    
    if not hashes:
        return {"ok": True, "tags": {}}
    
    hash_list = [h.strip() for h in hashes.split(",") if h.strip()]
    if not hash_list:
        return {"ok": True, "tags": {}}
    
    # Limit to 100 hashes per request
    hash_list = hash_list[:100]
    
    try:
        from hotnews.web.db_online import get_online_db_conn
        
        online_conn = get_online_db_conn(request.app.state.project_root)
        
        placeholders = ",".join(["?"] * len(hash_list))
        cur = online_conn.execute(
            f"""
            SELECT url_hash, url, quality_tag, category_tags
            FROM article_summaries
            WHERE url_hash IN ({placeholders})
            """,
            tuple(hash_list)
        )
        rows = cur.fetchall() or []
        
        result = {}
        for row in rows:
            url_hash = row[0]
            url = row[1]
            quality_tag = row[2] or None
            category_tags_raw = row[3] or "[]"
            
            try:
                category_tags = json_module.loads(category_tags_raw)
            except:
                category_tags = []
            
            result[url_hash] = {
                "url": url,
                "quality": quality_tag if quality_tag else None,
                "category": category_tags
            }
        
        return {"ok": True, "tags": result}
        
    except Exception as e:

        logging.warning(f"Failed to get article tags by hash: {e}")
        return {"ok": False, "error": str(e), "tags": {}}
