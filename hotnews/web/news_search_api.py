"""
新闻搜索 API

提供给外部客户端（如 topic-explorer）调用的新闻搜索接口。
需要 hotnews 登录用户认证。
"""

import json
import logging
from typing import List, Optional
from pathlib import Path

from fastapi import APIRouter, Query, Request, HTTPException
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/news", tags=["news-search"])

# 项目根目录
project_root = Path(__file__).parent.parent.parent


def _get_user_db_conn(request: Request):
    """Get user database connection."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(project_root)


def _get_current_user(request: Request):
    """Get current authenticated user or raise 401."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="Session expired")
    
    return user_info


def _get_search_tools():
    """Get search tools instance."""
    from mcp_server.tools.search_tools import SearchTools
    return SearchTools(str(project_root))


class NewsItem(BaseModel):
    title: str
    platform: str = ""
    platform_name: str = ""
    url: str = ""
    rank: int = 0
    weight: float = 0.0


class SearchResponse(BaseModel):
    ok: bool = True
    total: int = 0
    news: List[NewsItem] = []
    search_mode: str = ""
    query: str = ""


@router.get("/search", response_model=SearchResponse)
async def search_news(
    request: Request,
    q: str = Query(..., min_length=1, description="搜索关键词"),
    mode: str = Query("keyword", description="搜索模式: keyword/fuzzy/entity"),
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
):
    """
    搜索新闻内容
    
    需要登录认证。
    
    搜索模式：
    - keyword: 精确关键词匹配
    - fuzzy: 模糊内容匹配
    - entity: 实体名称搜索（人名、公司名等）
    """
    # 验证用户登录
    user = _get_current_user(request)
    logger.info(f"User {user.get('id')} searching: {q} (mode={mode})")
    
    try:
        tools = _get_search_tools()
        result = tools.search_news_unified(
            query=q,
            search_mode=mode,
            limit=limit,
            include_url=True
        )
        
        if not result.get("success"):
            return SearchResponse(
                ok=False,
                query=q,
                search_mode=mode
            )
        
        news_list = result.get("news", [])
        return SearchResponse(
            ok=True,
            total=len(news_list),
            news=[
                NewsItem(
                    title=n.get("title", ""),
                    platform=n.get("platform", ""),
                    platform_name=n.get("platform_name", n.get("platform", "")),
                    url=n.get("url", ""),
                    rank=n.get("rank", 0),
                    weight=n.get("weight", 0.0)
                )
                for n in news_list
            ],
            search_mode=mode,
            query=q
        )
        
    except Exception as e:
        logger.error(f"Search failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/latest", response_model=SearchResponse)
async def get_latest_news(
    request: Request,
    platforms: Optional[str] = Query(None, description="平台列表，逗号分隔"),
    limit: int = Query(30, ge=1, le=100, description="返回数量"),
):
    """
    获取最新新闻
    
    需要登录认证。
    """
    # 验证用户登录
    user = _get_current_user(request)
    logger.info(f"User {user.get('id')} getting latest news")
    
    try:
        from mcp_server.services.data_service import DataService
        
        data_service = DataService(str(project_root))
        platform_list = platforms.split(",") if platforms else None
        
        news_list = data_service.get_latest_news(
            platforms=platform_list,
            limit=limit,
            include_url=True
        )
        
        return SearchResponse(
            ok=True,
            total=len(news_list),
            news=[
                NewsItem(
                    title=n.get("title", ""),
                    platform=n.get("platform", ""),
                    platform_name=n.get("platform_name", n.get("platform", "")),
                    url=n.get("url", ""),
                    rank=n.get("rank", 0),
                    weight=n.get("weight", 0.0)
                )
                for n in news_list
            ],
            search_mode="latest",
            query=""
        )
        
    except Exception as e:
        logger.error(f"Get latest failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
