"""
Topic Tracker API - REST API for topic tracking feature.

Endpoints:
- GET /api/topics - Get user's topics
- POST /api/topics - Create a new topic
- PUT /api/topics/{id} - Update a topic
- DELETE /api/topics/{id} - Delete a topic
- POST /api/topics/generate-keywords - AI generate keywords and recommend sources
- POST /api/topics/validate-sources - Validate and create RSS sources
- GET /api/topics/{id}/news - Get news for a topic
"""

import asyncio
import json
import logging
import time
import uuid
from pathlib import Path
from typing import Dict, Any, List
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Request, Body, Query, HTTPException
from fastapi.responses import JSONResponse

from hotnews.storage.topic_storage import TopicStorage, init_topic_tables
from hotnews.web.db_online import get_online_db_conn
from hotnews.web.user_db import get_user_db_conn
from hotnews.web.timeline_cache import topic_news_cache

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/topics", tags=["topics"])

SESSION_COOKIE_NAME = "hotnews_session"


async def _trigger_source_fetch(source_ids: List[str], project_root: Path) -> None:
    """
    触发数据源抓取（后台任务）。
    
    Args:
        source_ids: 数据源 ID 列表（如 mp-xxx, rss-xxx）
        project_root: 项目根目录
    """
    if not source_ids:
        logger.info("No source_ids to fetch")
        return
    
    logger.info(f"Triggering fetch for sources: {source_ids}")
    
    # 分离公众号和 RSS 源
    mp_fakeids = []
    rss_ids = []
    
    for sid in source_ids:
        if sid.startswith("mp-"):
            mp_fakeids.append(sid[3:])  # 去掉 "mp-" 前缀
        else:
            rss_ids.append(sid)
    
    logger.info(f"MP fakeids to fetch: {mp_fakeids}")
    
    # 抓取公众号
    if mp_fakeids:
        try:
            from hotnews.kernel.scheduler.wechat_scheduler import fetch_mps_immediately
            result = await fetch_mps_immediately(mp_fakeids, project_root)
            logger.info(f"Immediate MP fetch result: {result}")
        except Exception as e:
            logger.error(f"Failed to trigger MP fetch: {e}", exc_info=True)
    
    # RSS 源通常已经有数据，不需要立即抓取
    if rss_ids:
        logger.info(f"RSS sources will be fetched in next cycle: {rss_ids}")


def _get_session_token(request: Request) -> str:
    """Get session token from cookie."""
    token = request.cookies.get(SESSION_COOKIE_NAME, "")
    logger.debug(f"[TopicAPI] Session token from cookie: {token[:20] if token else 'EMPTY'}...")
    return token


def _get_current_user(request: Request) -> dict:
    """Get current user from session cookie."""
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        logger.warning("[TopicAPI] No session token in cookie")
        raise HTTPException(status_code=401, detail="请先登录")
    
    conn = get_user_db_conn(request.app.state.project_root)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        logger.warning(f"[TopicAPI] Session validation failed: is_valid={is_valid}, user_info={user_info}")
        raise HTTPException(status_code=401, detail="请先登录")
    
    logger.debug(f"[TopicAPI] User authenticated: {user_info.get('id')}")
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
    
    # 立即触发数据源抓取（后台执行，不阻塞响应）
    asyncio.create_task(_trigger_source_fetch(rss_source_ids, request.app.state.project_root))
    
    return {"ok": True, "topic": topic}


@router.put("/{topic_id}")
async def update_topic(request: Request, topic_id: str, body: Dict[str, Any] = Body(...)):
    """Update a topic."""
    user = _get_current_user(request)
    user_id = user["id"]
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
        user_id=str(user_id),
        name=name,
        icon=body.get("icon"),
        keywords=keywords,
        enabled=body.get("enabled"),
        sort_order=body.get("sort_order"),
        rss_source_ids=body.get("rss_source_ids")
    )
    
    if not success:
        return JSONResponse({"ok": False, "error": "更新失败，主题不存在或无权限"}, status_code=404)
    
    # Invalidate cache for this topic
    topic_news_cache.invalidate(user_id=user_id, topic_id=topic_id)
    logger.debug(f"[TopicAPI] Cache invalidated for user={user_id}, topic={topic_id}")
    
    # 如果更新了数据源，立即触发抓取
    rss_source_ids = body.get("rss_source_ids")
    if rss_source_ids:
        asyncio.create_task(_trigger_source_fetch(rss_source_ids, request.app.state.project_root))
    
    # Return updated topic
    topic = storage.get_topic_by_id(topic_id, str(user_id))
    return {"ok": True, "topic": topic}


@router.delete("/{topic_id}")
async def delete_topic(request: Request, topic_id: str):
    """Delete a topic."""
    user = _get_current_user(request)
    user_id = user["id"]
    storage = _get_storage(request)
    
    success = storage.delete_topic(topic_id, str(user_id))
    
    if not success:
        return JSONResponse({"ok": False, "error": "删除失败，主题不存在或无权限"}, status_code=404)
    
    # Invalidate cache for this topic
    topic_news_cache.invalidate(user_id=user_id, topic_id=topic_id)
    logger.debug(f"[TopicAPI] Cache invalidated for deleted topic: user={user_id}, topic={topic_id}")
    
    return {"ok": True}


@router.post("/generate-keywords")
async def generate_keywords(request: Request, body: Dict[str, Any] = Body(...)):
    """
    AI generate keywords and recommend data sources for a topic.
    
    组合方案：
    1. 先从数据库搜索匹配的源（已验证）
    2. 再让 AI 推荐补充（待验证）
    3. 合并去重返回
    """
    user = _get_current_user(request)
    
    topic_name = (body.get("topic_name") or "").strip()
    if not topic_name:
        return JSONResponse({"ok": False, "error": "主题名称不能为空"}, status_code=400)
    
    try:
        # 获取数据库连接
        online_conn = get_online_db_conn(project_root=request.app.state.project_root)
        user_conn = get_user_db_conn(request.app.state.project_root)
        
        # 检查是否有有效的微信凭证
        has_wechat_credentials = _check_wechat_credentials(online_conn, user_conn)
        
        # Step 1: AI 生成关键词和推荐源（传入 conn 用于验证公众号）
        ai_result = await _generate_keywords_with_ai(topic_name, online_conn, user_conn)
        
        icon = ai_result.get("icon", "🏷️")
        keywords = ai_result.get("keywords", [])
        ai_sources = ai_result.get("recommended_sources", [])
        
        # Step 2: 从数据库搜索匹配的源（已验证）
        db_sources = await _search_sources_from_database(topic_name, keywords, online_conn)
        
        # Step 3: 合并去重（数据库源优先）
        all_sources = db_sources.copy()
        seen_names = {s["name"].lower() for s in db_sources}
        
        for src in ai_sources:
            name_lower = src.get("name", "").lower()
            if name_lower and name_lower not in seen_names:
                seen_names.add(name_lower)
                all_sources.append(src)
        
        logger.info(f"Total sources: {len(all_sources)} (db={len(db_sources)}, ai={len(ai_sources)})")
        
        return {
            "ok": True,
            "icon": icon,
            "keywords": keywords,
            "recommended_sources": all_sources,
            "has_wechat_credentials": has_wechat_credentials
        }
    except Exception as e:
        logger.error(f"AI generate keywords failed: {e}")
        return JSONResponse(
            {"ok": False, "error": f"AI 生成失败: {str(e)}，请手动输入关键词"},
            status_code=500
        )


def _check_wechat_credentials(online_conn, user_conn=None) -> bool:
    """检查是否有有效的微信凭证"""
    try:
        from hotnews.kernel.services.mp_credential_pool import CredentialPool
        pool = CredentialPool()
        pool.load_credentials(online_conn, user_conn)
        cred = pool.get_credential()
        return cred is not None
    except Exception as e:
        logger.warning(f"Failed to check wechat credentials: {e}")
        return False


@router.get("/check-credentials")
async def check_credentials(request: Request):
    """检查是否有有效的微信凭证"""
    try:
        user = _get_current_user(request)
        online_conn = get_online_db_conn(project_root=request.app.state.project_root)
        user_conn = get_user_db_conn(request.app.state.project_root)
        has_credentials = _check_wechat_credentials(online_conn, user_conn)
        return {"ok": True, "has_wechat_credentials": has_credentials}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Check credentials failed: {e}")
        return {"ok": False, "has_wechat_credentials": False}


async def _quick_validate_rss_url(url: str) -> bool:
    """
    快速验证 RSS URL 是否有效。
    
    Args:
        url: RSS URL to validate
        
    Returns:
        True if valid RSS/Atom feed, False otherwise
    """
    if not url:
        return False
    
    try:
        # 减少超时时间到 5 秒，避免长时间等待
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
            response = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; HotNews/1.0)"
            })
            
            if response.status_code != 200:
                return False
            
            content_type = response.headers.get("content-type", "").lower()
            content = response.text[:2000]
            
            # Check if it looks like RSS/Atom
            if any(x in content_type for x in ["xml", "rss", "atom"]):
                return True
            if "<rss" in content or "<feed" in content or "<channel>" in content:
                return True
            
            return False
    except Exception as e:
        logger.debug(f"RSS validation failed for {url}: {e}")
        return False


async def _generate_keywords_with_ai(topic_name: str, online_conn=None, user_conn=None) -> Dict[str, Any]:
    """
    Call AI to generate keywords and recommend sources.
    
    Args:
        topic_name: Topic name to generate keywords for
        online_conn: Database connection for MP validation (optional)
        user_conn: User database connection for user credentials (optional)
    
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
    
    # 使用腾讯混元模型生成推荐源（更精准的公众号推荐）
    ai_recommended_sources = await _generate_sources_with_hunyuan(topic_name, online_conn, user_conn)
    
    # 如果混元模型没有返回结果，回退到阿里云模型
    if not ai_recommended_sources:
        logger.info("Hunyuan returned no sources, falling back to Dashscope")
        ai_recommended_sources = await _generate_sources_with_dashscope(topic_name, online_conn, user_conn)
    
    logger.info(f"Returning keywords={len(keywords)}, ai_sources={len(ai_recommended_sources)}")
    return {
        "icon": icon,
        "keywords": keywords,
        "recommended_sources": ai_recommended_sources
    }


async def _generate_sources_with_hunyuan(topic_name: str, online_conn=None, user_conn=None) -> list:
    """
    使用腾讯混元模型生成推荐数据源。
    混元模型对公众号有更精准的知识，可以返回准确的公众号 ID。
    
    Args:
        topic_name: 主题名称
        online_conn: 数据库连接（用于验证公众号）
        user_conn: 用户数据库连接（用于用户凭证）
        
    Returns:
        推荐源列表
    """
    import httpx
    import os
    
    api_key = os.environ.get("HUNYUAN_API_KEY", "")
    if not api_key:
        logger.info("HUNYUAN_API_KEY not configured, skipping Hunyuan")
        return []
    
    model = os.environ.get("HUNYUAN_MODEL", "hunyuan-2.0-thinking-20251109")
    url = "https://api.hunyuan.cloud.tencent.com/v1/chat/completions"
    
    # 针对公众号推荐的专用 prompt
    sources_prompt = f"""你是一个微信公众号和 RSS 数据源专家。用户想要追踪关于「{topic_name}」的新闻和资讯。

请推荐 8-10 个与该主题相关的信息源：

要求：
1. 微信公众号：请提供准确的公众号名称和微信号（如果知道的话），优先推荐 5-6 个公众号
2. RSS 源：请提供确实存在的 RSS/Atom 订阅地址，推荐 3-4 个 RSS 源

重要：
- 只推荐你确定存在的公众号和 RSS 源
- 公众号要与主题高度相关
- 优先推荐官方账号、权威媒体、行业头部自媒体

请按以下 JSON 格式输出：
{{
    "sources": [
        {{"name": "公众号名称", "type": "wechat_mp", "wechat_id": "微信号（如果知道）", "description": "简短描述"}},
        {{"name": "网站名称", "type": "rss", "url": "https://example.com/feed", "description": "简短描述"}}
    ]
}}

只输出 JSON，不要其他内容。"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    ai_recommended_sources = []
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            # 混元 API 使用 OpenAI 兼容格式
            request_body = {
                "model": model,
                "messages": [{"role": "user", "content": sources_prompt}],
                "temperature": 0.5,
            }
            
            # 混元特有参数（使用 extra_body 方式或直接添加）
            # 根据文档，这些参数直接放在请求体中
            request_body["enable_enhancement"] = True  # 开启功能增强（搜索）
            
            logger.info(f"Calling Hunyuan API with model: {model}")
            
            response = await client.post(url, headers=headers, json=request_body)
            
            # 记录响应状态
            if response.status_code != 200:
                error_text = response.text
                logger.warning(f"Hunyuan API error: {response.status_code} - {error_text[:500]}")
            
            response.raise_for_status()
            data = response.json()
            
            content = data["choices"][0]["message"]["content"]
            # 混元模型可能返回带 markdown 的 JSON，需要提取
            content = _extract_json_from_response(content)
            sources_result = json.loads(content)
            raw_sources = sources_result.get("sources", [])
            
            logger.info(f"Hunyuan returned {len(raw_sources)} sources for topic: {topic_name}")
            
            # 分离 RSS 源和公众号
            rss_sources = [src for src in raw_sources if src.get("type") == "rss" and src.get("url")]
            mp_sources = [src for src in raw_sources if src.get("type") == "wechat_mp"]
            
            # 并行验证 RSS 源
            if rss_sources:
                async def validate_rss_source(src):
                    url_to_check = src.get("url", "")
                    is_valid = await _quick_validate_rss_url(url_to_check)
                    return (src, is_valid)
                
                rss_results = await asyncio.gather(*[validate_rss_source(src) for src in rss_sources])
                
                for src, is_valid in rss_results:
                    if is_valid:
                        src["verified"] = True
                        src["source"] = "hunyuan_verified"
                        ai_recommended_sources.append(src)
                        logger.info(f"Hunyuan RSS source validated: {src.get('name')}")
                    else:
                        logger.info(f"Hunyuan RSS source invalid: {src.get('name')} - {src.get('url')}")
            
            # 验证公众号
            for src in mp_sources:
                mp_name = src.get("name") or src.get("wechat_id", "")
                if mp_name and online_conn:
                    mp_info = await _validate_mp_by_search(online_conn, mp_name, user_conn)
                    if mp_info:
                        src["verified"] = True
                        src["source"] = "hunyuan_verified"
                        src["wechat_id"] = mp_info.get("fakeid", "")
                        src["name"] = mp_info.get("nickname", mp_name)
                        src["avatar"] = mp_info.get("round_head_img", "")
                        if mp_info.get("signature"):
                            src["description"] = mp_info.get("signature", "")
                        ai_recommended_sources.append(src)
                        logger.info(f"Hunyuan MP source validated: {mp_name} -> {mp_info.get('nickname')}")
                    else:
                        # 即使验证失败，也添加到列表（标记为未验证）
                        src["verified"] = False
                        src["source"] = "hunyuan_unverified"
                        ai_recommended_sources.append(src)
                        logger.info(f"Hunyuan MP source unverified: {mp_name}")
                else:
                    src["verified"] = False
                    src["source"] = "hunyuan_unverified"
                    ai_recommended_sources.append(src)
                    logger.info(f"Hunyuan MP source added (no validation): {mp_name}")
            
            logger.info(f"Hunyuan: {len(raw_sources)} sources -> {len(ai_recommended_sources)} after validation")
            
    except Exception as e:
        logger.warning(f"Hunyuan API failed: {e}")
    
    return ai_recommended_sources


def _extract_json_from_response(content: str) -> str:
    """
    从 AI 响应中提取 JSON 内容。
    有些模型会返回带 markdown 代码块的 JSON。
    """
    import re
    
    # 尝试提取 ```json ... ``` 代码块
    json_match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', content)
    if json_match:
        return json_match.group(1).strip()
    
    # 尝试提取 { ... } JSON 对象
    json_match = re.search(r'\{[\s\S]*\}', content)
    if json_match:
        return json_match.group(0)
    
    return content


async def _generate_sources_with_dashscope(topic_name: str, online_conn=None, user_conn=None) -> list:
    """
    使用阿里云 Dashscope 模型生成推荐数据源（回退方案）。
    """
    import httpx
    import os
    
    api_key = os.environ.get("DASHSCOPE_API_KEY", "")
    if not api_key:
        return []
    
    model = os.environ.get("DASHSCOPE_MODEL", "qwen-plus")
    url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    
    sources_prompt = f"""你是一个数据源搜索专家。用户想要追踪关于「{topic_name}」的新闻。

请通过网络搜索，推荐 3-5 个**确实存在且可访问**的信息源：

要求：
1. RSS 源：必须是你通过搜索确认存在的 RSS/Atom 订阅地址
2. 微信公众号：必须是你通过搜索确认存在的公众号，提供准确的公众号名称

重要：
- 不要猜测或编造 URL，只推荐你确认存在的源
- 如果不确定某个源是否存在，不要推荐
- 宁可少推荐，也不要推荐错误的源

请按以下 JSON 格式输出：
{{
    "sources": [
        {{"name": "网站名称", "type": "rss", "url": "https://example.com/feed", "description": "简短描述"}},
        {{"name": "公众号名称", "type": "wechat_mp", "wechat_id": "公众号微信号或名称", "description": "简短描述"}}
    ]
}}

只输出 JSON，不要其他内容。"""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    ai_recommended_sources = []
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(url, headers=headers, json={
                "model": model,
                "messages": [{"role": "user", "content": sources_prompt}],
                "temperature": 0.5,
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
            raw_sources = sources_result.get("sources", [])
            
            # 并行验证 AI 推荐的 RSS 源，大幅减少等待时间
            rss_sources = [src for src in raw_sources if src.get("type") == "rss" and src.get("url")]
            mp_sources = [src for src in raw_sources if src.get("type") == "wechat_mp"]
            
            # 并行验证所有 RSS 源
            if rss_sources:
                async def validate_rss_source(src):
                    url_to_check = src.get("url", "")
                    is_valid = await _quick_validate_rss_url(url_to_check)
                    return (src, is_valid)
                
                rss_results = await asyncio.gather(*[validate_rss_source(src) for src in rss_sources])
                
                for src, is_valid in rss_results:
                    if is_valid:
                        src["verified"] = True
                        src["source"] = "dashscope_verified"
                        ai_recommended_sources.append(src)
                        logger.info(f"Dashscope RSS source validated: {src.get('name')}")
                    else:
                        logger.info(f"Dashscope RSS source invalid: {src.get('name')} - {src.get('url')}")
            
            # 验证公众号
            for src in mp_sources:
                mp_name = src.get("name") or src.get("wechat_id", "")
                if mp_name and online_conn:
                    mp_info = await _validate_mp_by_search(online_conn, mp_name, user_conn)
                    if mp_info:
                        src["verified"] = True
                        src["source"] = "dashscope_verified"
                        src["wechat_id"] = mp_info.get("fakeid", "")
                        src["name"] = mp_info.get("nickname", mp_name)
                        src["avatar"] = mp_info.get("round_head_img", "")
                        if mp_info.get("signature"):
                            src["description"] = mp_info.get("signature", "")
                        ai_recommended_sources.append(src)
                        logger.info(f"Dashscope MP source validated: {mp_name}")
                    else:
                        logger.info(f"Dashscope MP source not found: {mp_name}")
                else:
                    logger.info(f"Dashscope MP source skipped (no conn): {mp_name}")
            
            logger.info(f"Dashscope: {len(raw_sources)} sources -> {len(ai_recommended_sources)} after validation")
            
    except Exception as e:
        logger.warning(f"Dashscope API failed: {e}")
    
    return ai_recommended_sources


async def _search_sources_from_database(topic_name: str, keywords: list, online_conn) -> list:
    """
    从数据库中搜索匹配的数据源。
    
    Args:
        topic_name: 主题名称
        keywords: 关键词列表
        online_conn: 在线数据库连接
        
    Returns:
        匹配的数据源列表（已验证）
    """
    verified_sources = []
    seen_ids = set()
    
    # 构建搜索关键词（主题名 + 生成的关键词）
    search_terms = [topic_name] + (keywords[:5] if keywords else [])
    
    # 1. 搜索 RSS 源
    for term in search_terms:
        if len(verified_sources) >= 10:
            break
        try:
            cur = online_conn.execute(
                """
                SELECT id, name, url, category 
                FROM rss_sources 
                WHERE enabled = 1 
                  AND category != 'wechat_mp'
                  AND (name LIKE ? OR url LIKE ?)
                LIMIT 5
                """,
                (f"%{term}%", f"%{term}%")
            )
            for row in cur.fetchall():
                source_id = row[0]
                if source_id not in seen_ids:
                    seen_ids.add(source_id)
                    verified_sources.append({
                        "name": row[1],
                        "type": "rss",
                        "url": row[2],
                        "description": f"分类: {row[3] or '未分类'}",
                        "verified": True,
                        "source": "database",
                        "id": source_id
                    })
        except Exception as e:
            logger.warning(f"RSS search error for term '{term}': {e}")
    
    # 2. 搜索公众号
    for term in search_terms:
        if len(verified_sources) >= 15:
            break
        try:
            cur = online_conn.execute(
                """
                SELECT fakeid, nickname, signature, round_head_img
                FROM featured_wechat_mps 
                WHERE enabled = 1 
                  AND (nickname LIKE ? OR signature LIKE ?)
                LIMIT 5
                """,
                (f"%{term}%", f"%{term}%")
            )
            for row in cur.fetchall():
                fakeid = row[0]
                mp_id = f"mp-{fakeid}"
                if mp_id not in seen_ids:
                    seen_ids.add(mp_id)
                    verified_sources.append({
                        "name": row[1],
                        "type": "wechat_mp",
                        "wechat_id": fakeid,
                        "description": row[2] or "",
                        "verified": True,
                        "source": "database",
                        "id": mp_id,
                        "avatar": row[3] or ""
                    })
        except Exception as e:
            logger.warning(f"MP search error for term '{term}': {e}")
    
    logger.info(f"Found {len(verified_sources)} verified sources from database")
    return verified_sources


@router.post("/validate-sources")
async def validate_and_create_sources(request: Request, body: Dict[str, Any] = Body(...)):
    """
    Validate RSS URLs and create sources in database.
    
    Request body:
        sources: List of source objects with type, name, url/wechat_id, description
        
    Returns:
        validated_sources: List of validated sources with their IDs
        failed_sources: List of sources that failed validation with reasons
    """
    user = _get_current_user(request)
    
    sources = body.get("sources") or []
    if not sources:
        return {"ok": True, "validated_sources": [], "failed_sources": []}
    
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    user_conn = get_user_db_conn(request.app.state.project_root)
    validated_sources = []
    failed_sources = []
    
    for source in sources:
        source_type = source.get("type", "")
        name = source.get("name", "")
        
        if source_type == "rss":
            url = source.get("url", "")
            if not url:
                failed_sources.append({"name": name or "未知", "type": "rss", "reason": "URL 为空"})
                continue
            
            # Validate and create RSS source
            result, error = await _validate_and_create_rss_source(conn, name, url, source.get("description", ""))
            if result:
                validated_sources.append(result)
            else:
                failed_sources.append({"name": name or url, "type": "rss", "url": url, "reason": error or "验证失败"})
        
        elif source_type == "wechat_mp":
            wechat_id = source.get("wechat_id", "")
            if not wechat_id:
                failed_sources.append({"name": name or "未知", "type": "wechat_mp", "reason": "微信号为空"})
                continue
            
            # Create WeChat MP source with auto-search
            result = await _create_wechat_mp_source_async(conn, name, wechat_id, source.get("description", ""), user_conn)
            if result:
                if result.get("verified", True):
                    validated_sources.append(result)
                else:
                    # Unverified MP - add to failed list with reason
                    failed_sources.append({
                        "name": name or wechat_id,
                        "type": "wechat_mp",
                        "wechat_id": wechat_id,
                        "reason": "未找到该公众号，请手动搜索添加"
                    })
    
    return {"ok": True, "validated_sources": validated_sources, "failed_sources": failed_sources}


@router.get("/sources/{source_id}")
async def get_source_info(request: Request, source_id: str):
    """Get source info by ID."""
    user = _get_current_user(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    
    # Check if it's a WeChat MP source (mp- prefix)
    if source_id.startswith("mp-"):
        fakeid = source_id[3:]  # Remove "mp-" prefix
        cur = conn.execute(
            "SELECT fakeid, nickname, signature FROM featured_wechat_mps WHERE fakeid = ?",
            (fakeid,)
        )
        row = cur.fetchone()
        if row:
            return {
                "ok": True,
                "source": {
                    "id": source_id,
                    "name": row[1],
                    "url": None,
                    "wechat_id": row[0],
                    "type": "wechat_mp"
                }
            }
        # Fallback: check rss_sources for legacy data
    
    # Query rss_sources
    cur = conn.execute(
        "SELECT id, name, url, category FROM rss_sources WHERE id = ?",
        (source_id,)
    )
    row = cur.fetchone()
    
    if not row:
        return JSONResponse({"ok": False, "error": "源不存在"}, status_code=404)
    
    source_type = "wechat_mp" if row[3] == "wechat_mp" else "rss"
    wechat_id = None
    if source_type == "wechat_mp" and row[2].startswith("wechat://mp/"):
        wechat_id = row[2].replace("wechat://mp/", "")
    
    return {
        "ok": True,
        "source": {
            "id": row[0],
            "name": row[1],
            "url": row[2] if source_type == "rss" else None,
            "wechat_id": wechat_id,
            "type": source_type
        }
    }


@router.post("/sources/batch")
async def get_sources_batch(request: Request, body: Dict[str, Any] = Body(...)):
    """Get multiple sources info by IDs."""
    user = _get_current_user(request)
    
    source_ids = body.get("source_ids") or []
    if not source_ids:
        return {"ok": True, "sources": []}
    
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    
    sources = []
    found_ids = set()
    
    # First, check featured_wechat_mps for mp- prefixed IDs
    mp_ids = [sid for sid in source_ids if sid.startswith("mp-")]
    if mp_ids:
        fakeids = [sid[3:] for sid in mp_ids]  # Remove "mp-" prefix
        placeholders = ",".join("?" * len(fakeids))
        cur = conn.execute(
            f"SELECT fakeid, nickname, signature FROM featured_wechat_mps WHERE fakeid IN ({placeholders})",
            fakeids
        )
        for row in cur.fetchall():
            source_id = f"mp-{row[0]}"
            sources.append({
                "id": source_id,
                "name": row[1],
                "url": None,
                "wechat_id": row[0],
                "type": "wechat_mp"
            })
            found_ids.add(source_id)
    
    # Then, check rss_sources for remaining IDs (including legacy mp data)
    remaining_ids = [sid for sid in source_ids if sid not in found_ids]
    if remaining_ids:
        placeholders = ",".join("?" * len(remaining_ids))
        cur = conn.execute(
            f"SELECT id, name, url, category FROM rss_sources WHERE id IN ({placeholders})",
            remaining_ids
        )
        
        for row in cur.fetchall():
            source_type = "wechat_mp" if row[3] == "wechat_mp" else "rss"
            wechat_id = None
            if source_type == "wechat_mp" and row[2].startswith("wechat://mp/"):
                wechat_id = row[2].replace("wechat://mp/", "")
            
            sources.append({
                "id": row[0],
                "name": row[1],
                "url": row[2] if source_type == "rss" else None,
                "wechat_id": wechat_id,
                "type": source_type
            })
    
    return {"ok": True, "sources": sources}


@router.get("/wechat-mps/search")
async def search_wechat_mps(
    request: Request,
    q: str = Query("", description="Search query"),
    limit: int = Query(20, ge=1, le=50)
):
    """
    Search featured WeChat MPs by nickname.
    Returns list of available MPs for user to select.
    """
    user = _get_current_user(request)
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    
    query = q.strip()
    if query:
        cur = conn.execute(
            """
            SELECT fakeid, nickname, signature, round_head_img
            FROM featured_wechat_mps
            WHERE enabled = 1 AND nickname LIKE ?
            ORDER BY sort_order ASC, nickname ASC
            LIMIT ?
            """,
            (f"%{query}%", limit)
        )
    else:
        cur = conn.execute(
            """
            SELECT fakeid, nickname, signature, round_head_img
            FROM featured_wechat_mps
            WHERE enabled = 1
            ORDER BY sort_order ASC, nickname ASC
            LIMIT ?
            """,
            (limit,)
        )
    
    mps = []
    for row in cur.fetchall():
        mps.append({
            "fakeid": row[0],
            "nickname": row[1],
            "signature": row[2] or "",
            "avatar": row[3] or ""
        })
    
    return {"ok": True, "mps": mps}


async def _validate_and_create_rss_source(
    conn,
    name: str,
    url: str,
    description: str
) -> tuple[Dict[str, Any] | None, str | None]:
    """
    Validate RSS URL and create source in database.
    
    Returns:
        Tuple of (Source dict with id, error message)
        - If success: (source_dict, None)
        - If failed: (None, error_message)
    """
    # Check if source already exists
    cur = conn.execute("SELECT id, name FROM rss_sources WHERE url = ?", (url,))
    existing = cur.fetchone()
    if existing:
        return {
            "id": existing[0],
            "name": existing[1],
            "type": "rss",
            "url": url,
            "status": "exists"
        }, None
    
    # Validate URL format
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            logger.warning(f"Invalid RSS URL format: {url}")
            return None, "URL 格式无效"
        if parsed.scheme not in ['http', 'https']:
            return None, "仅支持 http/https 协议"
        host = parsed.netloc
    except Exception:
        return None, "URL 解析失败"
    
    # Try to fetch the RSS feed
    is_valid = False
    error_msg = "未知错误"
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            response = await client.get(url, headers={
                "User-Agent": "Mozilla/5.0 (compatible; HotNews/1.0; +https://hotnews.example.com)"
            })
            
            if response.status_code == 200:
                content_type = response.headers.get("content-type", "").lower()
                content = response.text[:2000]  # Check first 2KB
                
                # Check if it looks like RSS/Atom
                if any(x in content_type for x in ["xml", "rss", "atom"]):
                    is_valid = True
                elif "<rss" in content or "<feed" in content or "<channel>" in content:
                    is_valid = True
                else:
                    error_msg = "不是有效的 RSS/Atom 格式"
            elif response.status_code == 404:
                error_msg = "页面不存在 (404)"
            elif response.status_code == 403:
                error_msg = "访问被拒绝 (403)"
            else:
                error_msg = f"HTTP 错误 ({response.status_code})"
    except httpx.TimeoutException:
        logger.warning(f"Timeout validating RSS URL {url}")
        return None, "连接超时"
    except httpx.ConnectError:
        logger.warning(f"Connection error validating RSS URL {url}")
        return None, "无法连接服务器"
    except Exception as e:
        logger.warning(f"Failed to validate RSS URL {url}: {e}")
        return None, "网络请求失败"
    
    if not is_valid:
        logger.warning(f"URL does not appear to be a valid RSS feed: {url}")
        return None, error_msg
    
    # Create the source
    now = int(time.time())
    source_id = f"user-{uuid.uuid4().hex[:12]}"
    
    try:
        conn.execute(
            """
            INSERT INTO rss_sources (id, name, url, host, category, cadence, created_at, updated_at, added_at)
            VALUES (?, ?, ?, ?, 'user', 'P4', ?, ?, ?)
            """,
            (source_id, name or host, url, host, now, now, now)
        )
        conn.commit()
        
        return {
            "id": source_id,
            "name": name or host,
            "type": "rss",
            "url": url,
            "status": "created"
        }, None
    except Exception as e:
        logger.error(f"Failed to create RSS source: {e}")
        conn.rollback()
        return None, "数据库写入失败"


async def _validate_mp_by_search(online_conn, name: str, user_conn=None) -> Dict[str, Any] | None:
    """
    Validate a WeChat MP by real-time search (not database lookup).
    
    This is used for AI-recommended MPs to ensure they actually exist.
    Unlike _search_mp_by_name, this function does NOT check the database first,
    to avoid returning stale or incorrect data.
    
    Args:
        online_conn: Online database connection (for credentials)
        name: MP name to search
        user_conn: User database connection (for user credentials)
        
    Returns:
        MP info dict with fakeid, nickname, etc. or None if not found
    """
    from hotnews.kernel.services.mp_credential_pool import CredentialPool
    from hotnews.kernel.providers.wechat_provider import WeChatMPProvider
    
    try:
        pool = CredentialPool()
        pool.load_credentials(online_conn, user_conn)
        
        cred = pool.get_credential()
        if not cred:
            logger.warning(f"[TopicAPI] No valid credentials for MP validation: {name}")
            return None
        
        provider = WeChatMPProvider(cred.cookie, cred.token)
        result = provider.search_mp(name, limit=5)
        
        if result.ok and result.accounts:
            # Find best match (exact name match preferred)
            best_match = None
            for acc in result.accounts:
                if acc.nickname == name:
                    best_match = acc
                    break
            
            if not best_match:
                # Use first result if no exact match
                best_match = result.accounts[0]
            
            logger.info(f"[TopicAPI] MP validated via search: {name} -> {best_match.fakeid} ({best_match.nickname})")
            return {
                "fakeid": best_match.fakeid,
                "nickname": best_match.nickname,
                "round_head_img": best_match.round_head_img or "",
                "signature": best_match.signature or "",
                "source": "search"
            }
        else:
            logger.warning(f"[TopicAPI] MP validation failed for {name}: {result.error_message}")
            
    except Exception as e:
        logger.error(f"[TopicAPI] MP validation error for {name}: {e}")
    
    return None


async def _search_mp_by_name(online_conn, name: str, user_conn=None) -> Dict[str, Any] | None:
    """
    Search for a WeChat MP by name using system credentials.
    
    Args:
        online_conn: Online database connection
        name: MP name to search
        user_conn: User database connection (optional, for user credentials)
        
    Returns:
        MP info dict with fakeid, nickname, etc. or None if not found
    """
    from hotnews.kernel.services.mp_credential_pool import CredentialPool
    from hotnews.kernel.providers.wechat_provider import WeChatMPProvider
    
    # First, check if MP already exists in featured_wechat_mps (fuzzy match)
    cur = online_conn.execute(
        "SELECT fakeid, nickname, round_head_img, signature FROM featured_wechat_mps WHERE nickname LIKE ? LIMIT 1",
        (f"%{name}%",)
    )
    row = cur.fetchone()
    if row:
        logger.info(f"[TopicAPI] Found existing MP: {name} -> {row[0]} ({row[1]})")
        return {
            "fakeid": row[0],
            "nickname": row[1],
            "round_head_img": row[2] or "",
            "signature": row[3] or "",
            "source": "database"
        }
    
    # Try to search using system credentials
    try:
        pool = CredentialPool()
        
        # Load credentials from both online_conn (shared) and user_conn (user's own)
        pool.load_credentials(online_conn, user_conn)
        
        cred = pool.get_credential()
        if not cred:
            logger.warning(f"[TopicAPI] No valid credentials for MP search: {name}")
            return None
        
        provider = WeChatMPProvider(cred.cookie, cred.token)
        result = provider.search_mp(name, limit=5)
        
        if result.ok and result.accounts:
            # Find best match (exact name match preferred)
            best_match = None
            for acc in result.accounts:
                if acc.nickname == name:
                    best_match = acc
                    break
            
            if not best_match:
                # Use first result if no exact match
                best_match = result.accounts[0]
            
            logger.info(f"[TopicAPI] Found MP via search: {name} -> {best_match.fakeid} ({best_match.nickname})")
            return {
                "fakeid": best_match.fakeid,
                "nickname": best_match.nickname,
                "round_head_img": best_match.round_head_img or "",
                "signature": best_match.signature or "",
                "source": "search"
            }
        else:
            logger.warning(f"[TopicAPI] MP search failed for {name}: {result.error_message}")
            
    except Exception as e:
        logger.error(f"[TopicAPI] MP search error for {name}: {e}")
    
    return None


async def _create_wechat_mp_source_async(
    conn,
    name: str,
    wechat_id: str,
    description: str,
    user_conn=None
) -> Dict[str, Any] | None:
    """
    Create a WeChat MP source reference with auto-search.
    
    This function will:
    1. First search for the MP by name to get real fakeid
    2. If found, use the real fakeid
    3. If not found, return None (don't create with fake data)
    """
    from hotnews.kernel.services.mp_service import MPService
    
    nickname = name or wechat_id
    
    # Try to find real fakeid by searching
    mp_info = await _search_mp_by_name(conn, nickname, user_conn)
    
    if mp_info:
        # Found real MP, use its fakeid
        fakeid = mp_info["fakeid"]
        nickname = mp_info["nickname"]
        round_head_img = mp_info.get("round_head_img", "")
        signature = mp_info.get("signature", "") or description
        
        try:
            service = MPService(conn)
            result = service.get_or_create_mp(
                fakeid=fakeid,
                nickname=nickname,
                source='ai_recommend',
                round_head_img=round_head_img,
                signature=signature,
                category="general",
                enabled=1,
            )
            
            return {
                "id": f"mp-{result['fakeid']}",
                "name": result['nickname'],
                "type": "wechat_mp",
                "wechat_id": fakeid,
                "status": "created" if result["is_new"] else "exists",
                "verified": True
            }
        except Exception as e:
            logger.error(f"Failed to create WeChat MP source: {e}")
            return None
    else:
        # MP not found, return as unverified
        logger.warning(f"[TopicAPI] MP not found: {nickname}, returning as unverified")
        return {
            "id": f"mp-unverified-{wechat_id}",
            "name": nickname,
            "type": "wechat_mp",
            "wechat_id": wechat_id,
            "status": "unverified",
            "verified": False
        }


def _create_wechat_mp_source(
    conn,
    name: str,
    wechat_id: str,
    description: str
) -> Dict[str, Any] | None:
    """
    Create a WeChat MP source reference (sync wrapper).
    
    Note: This is a sync wrapper for backward compatibility.
    For new code, use _create_wechat_mp_source_async instead.
    """
    import asyncio
    
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # Already in async context, create task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(
                    asyncio.run,
                    _create_wechat_mp_source_async(conn, name, wechat_id, description)
                )
                return future.result(timeout=30)
        else:
            return asyncio.run(_create_wechat_mp_source_async(conn, name, wechat_id, description))
    except Exception as e:
        logger.error(f"Failed to create WeChat MP source: {e}")
        # Fallback: return unverified
        return {
            "id": f"mp-unverified-{wechat_id}",
            "name": name or wechat_id,
            "type": "wechat_mp",
            "wechat_id": wechat_id,
            "status": "unverified",
            "verified": False
        }


@router.get("/{topic_id}/news")
async def get_topic_news(
    request: Request,
    topic_id: str,
    keyword: str = Query(None, description="Filter by specific keyword"),
    limit: int = Query(50, ge=1, le=100, description="Max news per keyword")
):
    """
    Get news for a topic, grouped by keywords and sources.
    Uses caching for better performance.
    
    Returns:
        - keywords_news: 关键词搜索结果（按关键词分组）
        - sources_news: 订阅源最新文章（按订阅源分组）
    """
    user = _get_current_user(request)
    user_id = user["id"]
    storage = _get_storage(request)
    
    topic = storage.get_topic_by_id(topic_id, str(user_id))
    if not topic:
        return JSONResponse({"ok": False, "error": "主题不存在或无权限"}, status_code=404)
    
    keywords = topic["keywords"]
    rss_sources = topic.get("rss_sources", [])
    
    if keyword:
        # Filter to specific keyword
        if keyword not in keywords:
            return JSONResponse({"ok": False, "error": "关键词不存在"}, status_code=400)
        keywords = [keyword]
    
    # Check cache first (only for full topic, not filtered by keyword)
    cache_key = f"{topic_id}_v2"  # 新版本缓存 key
    if not keyword:
        cached = topic_news_cache.get(user_id, cache_key)
        if cached is not None:
            cache_age = topic_news_cache._cache.get(user_id, {}).get(cache_key, {}).get("created_at", 0)
            age_seconds = int(time.time() - cache_age) if cache_age else 0
            logger.debug(f"[TopicAPI] Cache hit for user={user_id}, topic={topic_id}, age={age_seconds}s")
            return {
                "ok": True, 
                "keywords_news": cached.get("keywords_news", {}),
                "sources_news": cached.get("sources_news", {}),
                "cached": True, 
                "cache_age": age_seconds
            }
    
    # Get database connection
    conn = get_online_db_conn(project_root=request.app.state.project_root)
    
    # 1. Get news for each keyword (关键词搜索结果)
    keywords_news = {}
    for kw in keywords:
        news = _search_news_by_keyword(conn, kw, rss_sources, limit)
        keywords_news[kw] = news
    
    # 2. Get latest articles from subscribed sources (订阅源最新文章)
    sources_news = {}
    if rss_sources:
        sources_news = _get_sources_latest_articles(conn, rss_sources, limit_per_source=10)
    
    # Store in cache (only for full topic)
    if not keyword:
        topic_news_cache.set(user_id, cache_key, {
            "keywords_news": keywords_news,
            "sources_news": sources_news
        })
        logger.debug(f"[TopicAPI] Cache set for user={user_id}, topic={topic_id}")
    
    return {
        "ok": True, 
        "keywords_news": keywords_news, 
        "sources_news": sources_news,
        "cached": False
    }


def _get_sources_latest_articles(
    conn,
    source_ids: List[str],
    limit_per_source: int = 10
) -> Dict[str, List[Dict[str, Any]]]:
    """
    获取订阅源的最新文章。
    
    Args:
        conn: 数据库连接
        source_ids: 订阅源 ID 列表（如 mp-xxx, rss-xxx）
        limit_per_source: 每个源的最大文章数
        
    Returns:
        按源名称分组的文章字典 { "源名称": [文章列表] }
    """
    if not source_ids:
        return {}
    
    results = {}
    
    # 分离公众号和 RSS 源
    mp_fakeids = []
    rss_ids = []
    
    for sid in source_ids:
        if sid.startswith("mp-"):
            mp_fakeids.append(sid[3:])  # 去掉 "mp-" 前缀
        else:
            rss_ids.append(sid)
    
    # 1. 获取公众号文章
    if mp_fakeids:
        # 先获取公众号名称
        mp_names = {}
        placeholders = ",".join("?" * len(mp_fakeids))
        try:
            cur = conn.execute(
                f"SELECT fakeid, nickname FROM featured_wechat_mps WHERE fakeid IN ({placeholders})",
                mp_fakeids
            )
            for row in cur.fetchall():
                mp_names[row[0]] = row[1]
        except Exception as e:
            logger.warning(f"Failed to get MP names: {e}")
        
        # 获取公众号文章（从 rss_entries 中查询 mp- 前缀的源）
        mp_source_ids = [f"mp-{fid}" for fid in mp_fakeids]
        placeholders = ",".join("?" * len(mp_source_ids))
        try:
            cur = conn.execute(
                f"""
                SELECT source_id, id, title, url, published_at
                FROM rss_entries
                WHERE source_id IN ({placeholders})
                ORDER BY published_at DESC
                """,
                mp_source_ids
            )
            
            # 按源分组
            source_articles = {}
            for row in cur.fetchall():
                source_id = row[0]
                if source_id not in source_articles:
                    source_articles[source_id] = []
                if len(source_articles[source_id]) < limit_per_source:
                    source_articles[source_id].append({
                        "id": f"rss-{row[1]}",
                        "title": row[2],
                        "url": row[3],
                        "source": source_id,
                        "source_type": "wechat_mp",
                        "published_at": row[4]
                    })
            
            # 转换为按名称分组
            for source_id, articles in source_articles.items():
                fakeid = source_id[3:]  # 去掉 "mp-" 前缀
                name = mp_names.get(fakeid, source_id)
                results[name] = articles
                
        except Exception as e:
            logger.warning(f"Failed to get MP articles: {e}")
    
    # 2. 获取 RSS 源文章
    if rss_ids:
        # 先获取 RSS 源名称
        rss_names = {}
        placeholders = ",".join("?" * len(rss_ids))
        try:
            cur = conn.execute(
                f"SELECT id, name FROM rss_sources WHERE id IN ({placeholders})",
                rss_ids
            )
            for row in cur.fetchall():
                rss_names[row[0]] = row[1]
        except Exception as e:
            logger.warning(f"Failed to get RSS names: {e}")
        
        # 获取 RSS 文章
        try:
            cur = conn.execute(
                f"""
                SELECT source_id, id, title, url, published_at
                FROM rss_entries
                WHERE source_id IN ({placeholders})
                ORDER BY published_at DESC
                """,
                rss_ids
            )
            
            # 按源分组
            source_articles = {}
            for row in cur.fetchall():
                source_id = row[0]
                if source_id not in source_articles:
                    source_articles[source_id] = []
                if len(source_articles[source_id]) < limit_per_source:
                    source_articles[source_id].append({
                        "id": f"rss-{row[1]}",
                        "title": row[2],
                        "url": row[3],
                        "source": source_id,
                        "source_type": "rss",
                        "published_at": row[4]
                    })
            
            # 转换为按名称分组
            for source_id, articles in source_articles.items():
                name = rss_names.get(source_id, source_id)
                results[name] = articles
                
        except Exception as e:
            logger.warning(f"Failed to get RSS articles: {e}")
    
    logger.info(f"Got articles from {len(results)} sources")
    return results


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
