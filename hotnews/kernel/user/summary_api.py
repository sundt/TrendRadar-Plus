# coding=utf-8
"""
Smart Summary API

Provides one-click article summarization with auto-classification and auto-favorite.
"""

import os
import time
import hashlib
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


def _save_to_global_cache(request: Request, url: str, title: str, summary: str, article_type: str, model: str, user_id: int, token_usage: dict = None, fetch_method: str = ""):
    """Save summary to global cache for sharing across users."""
    try:
        from hotnews.web.db_online import get_online_db_conn
        
        url_hash = hashlib.md5(url.encode()).hexdigest()
        now = _now_ts()
        
        online_conn = get_online_db_conn(request.app.state.project_root)
        
        prompt_tokens = token_usage.get("prompt_tokens", 0) if token_usage else 0
        completion_tokens = token_usage.get("completion_tokens", 0) if token_usage else 0
        total_tokens = token_usage.get("total_tokens", 0) if token_usage else 0
        
        online_conn.execute(
            """
            INSERT INTO article_summaries (url_hash, url, title, summary, article_type, model, created_at, created_by, hit_count, updated_at, prompt_tokens, completion_tokens, total_tokens, fetch_method)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
            ON CONFLICT(url_hash) DO UPDATE SET
                hit_count = hit_count + 1,
                updated_at = excluded.updated_at
            """,
            (url_hash, url[:2000], title[:500], summary, article_type, model, now, user_id, now, prompt_tokens, completion_tokens, total_tokens, fetch_method or "")
        )
        online_conn.commit()
    except Exception as e:
        import logging
        logging.warning(f"Failed to save to global cache: {e}")


def _get_user_token_info(request: Request, user_id: int) -> dict:
    """Get user's token balance and usage info."""
    try:
        conn = _get_user_db_conn(request)
        cur = conn.execute(
            "SELECT token_balance, tokens_used FROM users WHERE id = ?",
            (user_id,)
        )
        row = cur.fetchone()
        if row:
            return {
                "token_balance": row[0] or 100000,
                "tokens_used": row[1] or 0,
                "default_tokens": 100000
            }
    except Exception:
        pass
    return {
        "token_balance": 100000,
        "tokens_used": 0,
        "default_tokens": 100000
    }


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
        import logging
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
):
    """
    Generate smart summary with streaming output (SSE).
    Returns Server-Sent Events for progressive rendering.
    """
    import json
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
        # Return cached summary as single SSE event with token info
        # Deduct tokens based on original token usage (or default 500 if not recorded)
        cached_tokens = row[2] or 500  # Use stored tokens or default
        
        try:
            user_conn = _get_user_db_conn(request)
            cur = user_conn.execute(
                "SELECT token_balance, tokens_used FROM users WHERE id = ?",
                (user["id"],)
            )
            balance_row = cur.fetchone()
            if balance_row:
                current_balance = balance_row[0] or 100000
                current_used = balance_row[1] or 0
                new_tokens_used = current_used + cached_tokens
                new_token_balance = max(0, current_balance - cached_tokens)
                
                user_conn.execute(
                    "UPDATE users SET token_balance = ?, tokens_used = ? WHERE id = ?",
                    (new_token_balance, new_tokens_used, user["id"])
                )
                user_conn.commit()
                
                token_info = {
                    "token_balance": new_token_balance,
                    "tokens_used": new_tokens_used
                }
            else:
                token_info = _get_user_token_info(request, user["id"])
        except Exception:
            token_info = _get_user_token_info(request, user["id"])
        
        async def cached_stream():
            data = {
                "type": "cached",
                "summary": row[0],
                "article_type": row[1] or "other",
                "article_type_name": get_type_name(row[1] or "other"),
                "news_id": news_id,
                "token_usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": cached_tokens},
                "token_balance": token_info["token_balance"],
                "tokens_used": token_info["tokens_used"]
            }
            yield f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
        
        return StreamingResponse(
            cached_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
    
    # Get API key
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="AI 服务未配置")
    
    model = os.environ.get("DASHSCOPE_MODEL", "qwen-turbo")
    
    async def stream_generator():
        # Step 1: Fetch article content
        yield f"data: {json.dumps({'type': 'status', 'message': '正在获取文章内容...'}, ensure_ascii=False)}\n\n"
        
        content, error, fetch_method = await fetch_article_content(url)
        if error:
            yield f"data: {json.dumps({'type': 'error', 'message': error}, ensure_ascii=False)}\n\n"
            return
        
        yield f"data: {json.dumps({'type': 'status', 'message': '正在分析文章类型...'}, ensure_ascii=False)}\n\n"
        
        # Step 2: Stream summary generation
        full_summary = ""
        article_type = "other"
        token_usage = None
        
        async for chunk, is_done, a_type, err, usage in generate_smart_summary_stream(content, api_key, model):
            if err:
                yield f"data: {json.dumps({'type': 'error', 'message': err}, ensure_ascii=False)}\n\n"
                return
            
            article_type = a_type
            
            if chunk is None and not is_done:
                # Article type determined, send it
                yield f"data: {json.dumps({'type': 'type', 'article_type': article_type, 'article_type_name': get_type_name(article_type)}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'type': 'status', 'message': '正在生成总结...'}, ensure_ascii=False)}\n\n"
            elif chunk:
                full_summary += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'content': chunk}, ensure_ascii=False)}\n\n"
            elif is_done:
                token_usage = usage
                # Save to favorites
                record_request(user["id"])
                now = _now_ts()
                
                # Update user token balance
                total_tokens = token_usage.get("total_tokens", 0) if token_usage else 0
                new_tokens_used = 0
                new_token_balance = 0
                
                try:
                    # Get current balance
                    user_conn = _get_user_db_conn(request)
                    cur = user_conn.execute(
                        "SELECT token_balance, tokens_used FROM users WHERE id = ?",
                        (user["id"],)
                    )
                    row = cur.fetchone()
                    if row:
                        current_balance = row[0] or 100000
                        current_used = row[1] or 0
                        new_tokens_used = current_used + total_tokens
                        new_token_balance = max(0, current_balance - total_tokens)
                        
                        # Update user tokens
                        user_conn.execute(
                            "UPDATE users SET token_balance = ?, tokens_used = ? WHERE id = ?",
                            (new_token_balance, new_tokens_used, user["id"])
                        )
                        user_conn.commit()
                except Exception as e:
                    import logging
                    logging.warning(f"Failed to update token balance: {e}")
                
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
                        (user["id"], news_id, title[:500], url[:2000], source_id, source_name, now, full_summary, now, model, article_type, total_tokens)
                    )
                    conn.commit()
                except Exception as e:
                    import logging
                    logging.warning(f"Failed to save favorite: {e}")
                
                # Save to global cache
                _save_to_global_cache(request, url, title, full_summary, article_type, model, user["id"], token_usage, fetch_method)
                
                # Silently update entry tags from summary
                try:
                    from hotnews.kernel.services.article_summary import extract_tags_from_summary, update_entry_tags_from_summary
                    from hotnews.web.db_online import get_online_db_conn
                    
                    tags = extract_tags_from_summary(full_summary)
                    if tags:
                        online_conn = get_online_db_conn(request.app.state.project_root)
                        update_entry_tags_from_summary(online_conn, url, tags)
                except Exception as e:
                    import logging
                    logging.debug(f"Tag update skipped: {e}")
                
                # Return done with token info
                done_data = {
                    'type': 'done',
                    'news_id': news_id,
                    'remaining': remaining - 1,
                    'token_usage': token_usage,
                    'token_balance': new_token_balance,
                    'tokens_used': new_tokens_used
                }
                yield f"data: {json.dumps(done_data, ensure_ascii=False)}\n\n"
    
    return StreamingResponse(
        stream_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
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
