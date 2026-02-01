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


def _search_rss_entries(query: str, limit: int = 20) -> List[dict]:
    """搜索 RSS 条目数据库 - 支持分词搜索"""
    try:
        from hotnews.web.db_online import get_online_db_conn
        conn = get_online_db_conn(project_root)
        
        # 分词：按空格分割查询词
        keywords = [kw.strip() for kw in query.split() if kw.strip()]
        if not keywords:
            keywords = [query]
        
        # 构建 SQL：每个关键词都要匹配（AND 逻辑）
        conditions = []
        params = []
        for kw in keywords:
            conditions.append("e.title LIKE ?")
            params.append(f"%{kw}%")
        
        where_clause = " AND ".join(conditions)
        params.append(limit)
        
        sql = f"""
            SELECT e.title, e.url, e.source_id, COALESCE(s.name, e.source_id) as source_name,
                   e.published_at, e.created_at
            FROM rss_entries e
            LEFT JOIN rss_sources s ON s.id = e.source_id
            WHERE {where_clause}
            ORDER BY COALESCE(e.published_at, e.created_at) DESC
            LIMIT ?
        """
        
        logger.info(f"RSS search SQL: keywords={keywords}")
        cur = conn.execute(sql, params)
        
        results = []
        for row in cur.fetchall():
            title, url, source_id, source_name, published_at, created_at = row
            results.append({
                "title": title,
                "url": url or "",
                "platform": source_id,
                "platform_name": source_name,
                "rank": 0,
                "weight": 0.0
            })
        
        return results
    except Exception as e:
        logger.warning(f"RSS search failed: {e}")
        return []


def _search_by_tags(query: str, limit: int = 20) -> List[dict]:
    """按标签搜索新闻 - 更智能的搜索方式"""
    try:
        from hotnews.web.db_online import get_online_db_conn
        conn = get_online_db_conn(project_root)
        
        # 1. 先查找匹配的标签
        keywords = [kw.strip() for kw in query.split() if kw.strip()]
        if not keywords:
            keywords = [query]
        
        # 构建标签搜索条件
        tag_conditions = []
        tag_params = []
        for kw in keywords:
            tag_conditions.append("(name LIKE ? OR name_en LIKE ?)")
            tag_params.extend([f"%{kw}%", f"%{kw}%"])
        
        tag_where = " OR ".join(tag_conditions)
        
        # 查找匹配的标签
        tag_sql = f"SELECT id, name FROM tags WHERE {tag_where} LIMIT 10"
        tag_cur = conn.execute(tag_sql, tag_params)
        matching_tags = tag_cur.fetchall()
        
        if not matching_tags:
            logger.info(f"No matching tags found for: {query}")
            return []
        
        tag_ids = [t[0] for t in matching_tags]
        tag_names = {t[0]: t[1] for t in matching_tags}
        logger.info(f"Found matching tags: {list(tag_names.values())}")
        
        # 2. 获取这些标签下的新闻
        placeholders = ",".join(["?"] * len(tag_ids))
        news_sql = f"""
            SELECT DISTINCT e.title, e.url, e.source_id, COALESCE(s.name, e.source_id) as source_name,
                   e.published_at, t.tag_id
            FROM rss_entries e
            JOIN rss_entry_tags t ON e.source_id = t.source_id AND e.dedup_key = t.dedup_key
            LEFT JOIN rss_sources s ON s.id = e.source_id
            WHERE t.tag_id IN ({placeholders})
              AND e.published_at > 0
            ORDER BY e.published_at DESC
            LIMIT ?
        """
        
        news_cur = conn.execute(news_sql, tag_ids + [limit])
        
        results = []
        for row in news_cur.fetchall():
            title, url, source_id, source_name, published_at, tag_id = row
            results.append({
                "title": title,
                "url": url or "",
                "platform": source_id,
                "platform_name": source_name,
                "rank": 0,
                "weight": 0.0,
                "tag": tag_names.get(tag_id, "")
            })
        
        return results
        
    except Exception as e:
        logger.warning(f"Tag search failed: {e}")
        return []


@router.get("/search", response_model=SearchResponse)
async def search_news(
    request: Request,
    q: str = Query(..., min_length=1, description="搜索关键词"),
    mode: str = Query("keyword", description="搜索模式: keyword/fuzzy/entity/tag"),
    limit: int = Query(20, ge=1, le=100, description="返回数量"),
):
    """
    搜索新闻内容
    
    需要登录认证。
    
    搜索模式：
    - keyword: 精确关键词匹配（分词）
    - fuzzy: 模糊内容匹配
    - entity: 实体名称搜索（人名、公司名等）
    - tag: 按标签搜索（最智能，推荐）
    
    搜索范围：
    1. 标签系统（最智能，基于 AI 分类）
    2. RSS 订阅源数据（数据库）
    3. 爬虫抓取的热榜数据（output 目录）
    """
    # 验证用户登录
    user = _get_current_user(request)
    logger.info(f"User {user.get('id')} searching: {q} (mode={mode})")
    
    all_news = []
    
    try:
        # 1. 优先：按标签搜索（最智能）
        tag_news = _search_by_tags(q, limit)
        if tag_news:
            logger.info(f"Found {len(tag_news)} from tag search")
            for n in tag_news:
                all_news.append(n)
        
        # 2. 搜索 RSS 数据库（关键词匹配）
        if len(all_news) < limit:
            rss_news = _search_rss_entries(q, limit - len(all_news))
            logger.info(f"Found {len(rss_news)} from RSS database")
            
            # 合并结果，去重（按标题）
            seen_titles = set(n["title"] for n in all_news)
            for n in rss_news:
                if n["title"] not in seen_titles:
                    all_news.append(n)
                    seen_titles.add(n["title"])
        
        # 3. 搜索爬虫数据（output 目录）
        if len(all_news) < limit:
            tools = _get_search_tools()
            result = tools.search_news_unified(
                query=q,
                search_mode=mode if mode != "tag" else "keyword",
                limit=limit - len(all_news),
                include_url=True
            )
            
            logger.info(f"Crawler search result: success={result.get('success')}, keys={list(result.keys())}")
            
            if result.get("success"):
                crawler_news = result.get("results", [])
                seen_titles = set(n["title"] for n in all_news)
                for n in crawler_news:
                    title = n.get("title", "")
                    if title and title not in seen_titles:
                        all_news.append({
                            "title": title,
                            "platform": n.get("platform", ""),
                            "platform_name": n.get("platform_name", n.get("platform", "")),
                            "url": n.get("url", ""),
                            "rank": n.get("rank", 0),
                            "weight": n.get("weight", 0.0)
                        })
                        seen_titles.add(title)
                logger.info(f"Found {len(crawler_news)} from crawler data")
        
        # 限制返回数量
        all_news = all_news[:limit]
        
        logger.info(f"Total found: {len(all_news)} news items")
        
        return SearchResponse(
            ok=True,
            total=len(all_news),
            news=[
                NewsItem(
                    title=n.get("title", ""),
                    platform=n.get("platform", ""),
                    platform_name=n.get("platform_name", n.get("platform", "")),
                    url=n.get("url", ""),
                    rank=n.get("rank", 0),
                    weight=n.get("weight", 0.0)
                )
                for n in all_news
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
