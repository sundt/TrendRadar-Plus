"""
Topic Tracker API - REST API for topic tracking feature.

Endpoints:
- GET /api/topics - Get user's topics
- POST /api/topics - Create a new topic
- PUT /api/topics/{id} - Update a topic
- DELETE /api/topics/{id} - Delete a topic
- POST /api/topics/generate-keywords - AI generate keywords and recommend sources
- GET /api/topics/{id}/news - Get news for a topic
"""

import json
import logging
from typing import Dict, Any, List

from fastapi import APIRouter, Request, Body, Query, HTTPException
from fastapi.responses import JSONResponse

from hotnews.storage.topic_storage import TopicStorage, init_topic_tables
from hotnews.web.db_online import get_online_db_conn
from hotnews.web.user_db import get_user_db_conn

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/topics", tags=["topics"])

SESSION_COOKIE_NAME = "hotnews_session"


def _get_session_token(request: Request) -> str:
    """Get session token from cookie."""
    return request.cookies.get(SESSION_COOKIE_NAME, "")


def _get_current_user(request: Request) -> dict:
    """Get current user from session cookie."""
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="请先登录")
    
    conn = get_user_db_conn(request.app.state.project_root)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="请先登录")
    
    return user_info


def _get_storage(request: Request) -> TopicStorage:
    """Get topic storage instance."""
    conn = get_user_db_conn(request.app.state.project_root)
    # Ensure tables exist
    init_topic_tables(conn)
    return TopicStorage(conn)


@router.get("")
async def get_topics(request: Request):
    """Get all topics for current user."""
    user = _get_current_user(request)
    storage = _get_storage(request)
    
    topics = storage.get_topics_by_user(str(user["id"]))
    return {"ok": True, "topics": topics}


@router.post("")
async def create_topic(request: Request, body: Dict[str, Any] = Body(...)):
    """Create a new topic."""
    user = _get_current_user(request)
    storage = _get_storage(request)
    
    name = (body.get("name") or "").strip()
    if not name:
        return JSONResponse({"ok": False, "error": "主题名称不能为空"}, status_code=400)
    
    if len(name) > 50:
        return JSONResponse({"ok": False, "error": "主题名称不能超过50个字符"}, status_code=400)
    
    keywords = body.get("keywords") or []
    if not keywords:
        return JSONResponse({"ok": False, "error": "至少需要一个关键词"}, status_code=400)
    
    if len(keywords) > 20:
        return JSONResponse({"ok": False, "error": "关键词不能超过20个"}, status_code=400)
    
    icon = body.get("icon") or "🏷️"
    rss_source_ids = body.get("rss_source_ids") or []
    
    topic = storage.create_topic(
        user_id=str(user["id"]),
        name=name,
        keywords=keywords,
        icon=icon,
        rss_source_ids=rss_source_ids
    )
    
    if not topic:
        return JSONResponse({"ok": False, "error": "创建主题失败"}, status_code=500)
    
    return {"ok": True, "topic": topic}


@router.put("/{topic_id}")
async def update_topic(request: Request, topic_id: str, body: Dict[str, Any] = Body(...)):
    """Update a topic."""
    user = _get_current_user(request)
    storage = _get_storage(request)
    
    # Validate
    name = body.get("name")
    if name is not None:
        name = name.strip()
        if not name:
            return JSONResponse({"ok": False, "error": "主题名称不能为空"}, status_code=400)
        if len(name) > 50:
            return JSONResponse({"ok": False, "error": "主题名称不能超过50个字符"}, status_code=400)
    
    keywords = body.get("keywords")
    if keywords is not None:
        if not keywords:
            return JSONResponse({"ok": False, "error": "至少需要一个关键词"}, status_code=400)
        if len(keywords) > 20:
            return JSONResponse({"ok": False, "error": "关键词不能超过20个"}, status_code=400)
    
    success = storage.update_topic(
        topic_id=topic_id,
        user_id=str(user["id"]),
        name=name,
        icon=body.get("icon"),
        keywords=keywords,
        enabled=body.get("enabled"),
        sort_order=body.get("sort_order"),
        rss_source_ids=body.get("rss_source_ids")
    )
    
    if not success:
        return JSONResponse({"ok": False, "error": "更新失败，主题不存在或无权限"}, status_code=404)
    
    # Return updated topic
    topic = storage.get_topic_by_id(topic_id, str(user["id"]))
    return {"ok": True, "topic": topic}


@router.delete("/{topic_id}")
async def delete_topic(request: Request, topic_id: str):
    """Delete a topic."""
    user = _get_current_user(request)
    storage = _get_storage(request)
    
    success = storage.delete_topic(topic_id, str(user["id"]))
    
    if not success:
        return JSONResponse({"ok": False, "error": "删除失败，主题不存在或无权限"}, status_code=404)
    
    return {"ok": True}


@router.post("/generate-keywords")
async def generate_keywords(request: Request, body: Dict[str, Any] = Body(...)):
    """
    AI generate keywords and recommend data sources for a topic.
    Uses DashScope with enable_search for real-time web search.
    """
    user = _get_current_user(request)
    
    topic_name = (body.get("topic_name") or "").strip()
    if not topic_name:
        return JSONResponse({"ok": False, "error": "主题名称不能为空"}, status_code=400)
    
    try:
        result = await _generate_keywords_with_ai(topic_name)
        return {"ok": True, **result}
    except Exception as e:
        logger.error(f"AI generate keywords failed: {e}")
        return JSONResponse(
            {"ok": False, "error": f"AI 生成失败: {str(e)}，请手动输入关键词"},
            status_code=500
        )


async def _generate_keywords_with_ai(topic_name: str) -> Dict[str, Any]:
    """
    Call AI to generate keywords and recommend sources.
    
    Returns:
        Dict with icon, keywords, recommended_sources
    """
    import httpx
    import os
    
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        raise ValueError("DASHSCOPE_API_KEY not configured")
    
    model = os.environ.get("DASHSCOPE_MODEL", "qwen-plus")
    
    # Prompt for generating keywords and icon
    keywords_prompt = f"""你是一个新闻追踪专家。用户想要追踪关于「{topic_name}」的新闻。

请为这个主题生成：
1. 一个最合适的 emoji 图标（单个 emoji）
2. 8-12 个相关的搜索关键词，用于在新闻标题中匹配

关键词要求：
- 包含中文和英文关键词
- 包含主题的不同表述方式（如公司名、产品名、人名等）
- 关键词要具体，避免太宽泛

请按以下 JSON 格式输出：
{{
    "icon": "🍎",
    "keywords": ["关键词1", "关键词2", "Keyword3", ...]
}}

只输出 JSON，不要其他内容。"""

    # Call AI for keywords
    url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(url, headers=headers, json={
            "model": model,
            "messages": [{"role": "user", "content": keywords_prompt}],
            "temperature": 0.7,
            "response_format": {"type": "json_object"}
        })
        response.raise_for_status()
        data = response.json()
        keywords_result = json.loads(data["choices"][0]["message"]["content"])
    
    icon = keywords_result.get("icon", "🏷️")
    keywords = keywords_result.get("keywords", [])
    
    # Prompt for recommending data sources (with web search)
    sources_prompt = f"""你是一个数据源搜索专家。用户想要追踪关于「{topic_name}」的新闻。

请搜索并推荐 4-6 个高质量的信息源，包括：
1. 提供 RSS 订阅的网站（优先）
2. 相关的微信公众号

要求：
- 推荐真实存在的网站和公众号
- 优先推荐中文信息源
- 提供准确的 RSS 地址或公众号微信号

请按以下 JSON 格式输出：
{{
    "sources": [
        {{"name": "网站名称", "type": "rss", "url": "https://example.com/feed", "description": "简短描述"}},
        {{"name": "公众号名称", "type": "wechat_mp", "wechat_id": "微信号", "description": "简短描述"}}
    ]
}}

只输出 JSON，不要其他内容。"""

    # Call AI with web search enabled
    recommended_sources = []
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, json={
                "model": model,
                "messages": [{"role": "user", "content": sources_prompt}],
                "temperature": 0.7,
                "response_format": {"type": "json_object"},
                "enable_search": True,
                "search_options": {
                    "forced_search": True,
                    "search_strategy": "standard"
                }
            })
            response.raise_for_status()
            data = response.json()
            sources_result = json.loads(data["choices"][0]["message"]["content"])
            recommended_sources = sources_result.get("sources", [])
    except Exception as e:
        logger.warning(f"Failed to get recommended sources: {e}")
        # Continue without sources, keywords are more important
    
    return {
        "icon": icon,
        "keywords": keywords,
        "recommended_sources": recommended_sources
    }


@router.get("/{topic_id}/news")
async def get_topic_news(
    request: Request,
    topic_id: str,
    keyword: str = Query(None, description="Filter by specific keyword"),
    limit: int = Query(50, ge=1, le=100, description="Max news per keyword")
):
    """
    Get news for a topic, grouped by keywords.
    """
    user = _get_current_user(request)
    storage = _get_storage(request)
    
    topic = storage.get_topic_by_id(topic_id, str(user["id"]))
    if not topic:
        return JSONResponse({"ok": False, "error": "主题不存在或无权限"}, status_code=404)
    
    keywords = topic["keywords"]
    if keyword:
        # Filter to specific keyword
        if keyword not in keywords:
            return JSONResponse({"ok": False, "error": "关键词不存在"}, status_code=400)
        keywords = [keyword]
    
    # Get news for each keyword
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    keywords_news = {}
    
    for kw in keywords:
        news = _search_news_by_keyword(conn, kw, topic["rss_sources"], limit)
        keywords_news[kw] = news
    
    return {"ok": True, "keywords_news": keywords_news}


def _search_news_by_keyword(
    conn,
    keyword: str,
    priority_source_ids: List[str],
    limit: int
) -> List[Dict[str, Any]]:
    """
    Search news by keyword in title.
    
    Args:
        conn: Database connection
        keyword: Keyword to search
        priority_source_ids: RSS source IDs to prioritize
        limit: Max results
        
    Returns:
        List of news items
    """
    results = []
    seen_titles = set()
    
    # Helper to normalize title for dedup
    def normalize_title(title: str) -> str:
        import re
        return re.sub(r'[^\w\u4e00-\u9fff]', '', title.lower())
    
    # Search in rss_entries (priority sources first if any)
    if priority_source_ids:
        placeholders = ",".join("?" * len(priority_source_ids))
        cur = conn.execute(
            f"""
            SELECT id, source_id, title, url, published_at
            FROM rss_entries
            WHERE source_id IN ({placeholders}) AND title LIKE ?
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (*priority_source_ids, f"%{keyword}%", limit)
        )
        for row in cur.fetchall():
            norm = normalize_title(row[2])
            if norm not in seen_titles:
                seen_titles.add(norm)
                results.append({
                    "id": f"rss-{row[0]}",
                    "title": row[2],
                    "url": row[3],
                    "source": row[1],
                    "source_type": "rss",
                    "published_at": row[4]
                })
    
    # Search in all rss_entries
    remaining = limit - len(results)
    if remaining > 0:
        cur = conn.execute(
            """
            SELECT id, source_id, title, url, published_at
            FROM rss_entries
            WHERE title LIKE ?
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (f"%{keyword}%", remaining + 50)  # Fetch extra for dedup
        )
        for row in cur.fetchall():
            if len(results) >= limit:
                break
            norm = normalize_title(row[2])
            if norm not in seen_titles:
                seen_titles.add(norm)
                results.append({
                    "id": f"rss-{row[0]}",
                    "title": row[2],
                    "url": row[3],
                    "source": row[1],
                    "source_type": "rss",
                    "published_at": row[4]
                })
    
    # Search in wechat_mp_articles is not needed - all data is in rss_entries
    # (including mp- prefixed entries for WeChat MP articles)
    
    # Sort by published_at desc
    results.sort(key=lambda x: x.get("published_at") or 0, reverse=True)
    
    return results[:limit]
