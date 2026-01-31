"""
数据源发现 API

提供给 topic-explorer 等外部服务查询 hotnews 的数据源。
"""

import sqlite3
from typing import List, Optional
from fastapi import APIRouter, Query
from pydantic import BaseModel

from hotnews.web.db_online import get_online_db_conn
from pathlib import Path

router = APIRouter(prefix="/api/sources", tags=["source-discovery"])

project_root = Path(__file__).parent.parent.parent


def _get_conn() -> sqlite3.Connection:
    return get_online_db_conn(project_root)


class SourceItem(BaseModel):
    id: str
    name: str
    url: str
    category: str = ""
    feed_type: str = ""
    country: str = ""
    language: str = ""


class SourceSearchResponse(BaseModel):
    ok: bool = True
    total: int
    sources: List[SourceItem]


@router.get("/search", response_model=SourceSearchResponse)
async def search_sources(
    q: str = Query(default="", description="搜索关键词（匹配名称、URL、分类）"),
    category: str = Query(default="", description="按分类筛选"),
    feed_type: str = Query(default="", description="按类型筛选（如 rss, atom）"),
    country: str = Query(default="", description="按国家筛选"),
    language: str = Query(default="", description="按语言筛选"),
    limit: int = Query(default=50, ge=1, le=200, description="返回数量限制"),
):
    """
    搜索数据源
    
    支持按关键词、分类、类型等条件筛选。
    返回经过验证的、可用的 RSS/Atom 数据源。
    """
    conn = _get_conn()
    conn.row_factory = sqlite3.Row
    
    # 构建查询
    conditions = ["enabled = 1"]
    params = []
    
    if q:
        conditions.append("(name LIKE ? OR url LIKE ? OR category LIKE ? OR host LIKE ?)")
        like_q = f"%{q}%"
        params.extend([like_q, like_q, like_q, like_q])
    
    if category:
        conditions.append("category LIKE ?")
        params.append(f"%{category}%")
    
    if feed_type:
        conditions.append("feed_type LIKE ?")
        params.append(f"%{feed_type}%")
    
    if country:
        conditions.append("country = ?")
        params.append(country)
    
    if language:
        conditions.append("language = ?")
        params.append(language)
    
    where_clause = " AND ".join(conditions)
    
    # 查询总数
    count_sql = f"SELECT COUNT(*) FROM rss_sources WHERE {where_clause}"
    cursor = conn.execute(count_sql, params)
    total = cursor.fetchone()[0]
    
    # 查询数据
    sql = f"""
        SELECT id, name, url, category, feed_type, country, language
        FROM rss_sources 
        WHERE {where_clause}
        ORDER BY updated_at DESC
        LIMIT ?
    """
    params.append(limit)
    
    cursor = conn.execute(sql, params)
    rows = cursor.fetchall()
    
    sources = [
        SourceItem(
            id=row["id"],
            name=row["name"],
            url=row["url"],
            category=row["category"] or "",
            feed_type=row["feed_type"] or "",
            country=row["country"] or "",
            language=row["language"] or "",
        )
        for row in rows
    ]
    
    return SourceSearchResponse(total=total, sources=sources)


@router.get("/categories")
async def list_categories():
    """
    获取所有分类列表
    """
    conn = _get_conn()
    cursor = conn.execute("""
        SELECT category, COUNT(*) as count 
        FROM rss_sources 
        WHERE enabled = 1 AND category != ''
        GROUP BY category
        ORDER BY count DESC
    """)
    rows = cursor.fetchall()
    
    return {
        "ok": True,
        "categories": [
            {"name": row[0], "count": row[1]}
            for row in rows
        ]
    }


@router.get("/stats")
async def get_stats():
    """
    获取数据源统计信息
    """
    conn = _get_conn()
    
    # 总数
    cursor = conn.execute("SELECT COUNT(*) FROM rss_sources WHERE enabled = 1")
    total = cursor.fetchone()[0]
    
    # 按类型统计
    cursor = conn.execute("""
        SELECT feed_type, COUNT(*) as count 
        FROM rss_sources 
        WHERE enabled = 1 AND feed_type != ''
        GROUP BY feed_type
    """)
    by_type = {row[0]: row[1] for row in cursor.fetchall()}
    
    # 按语言统计
    cursor = conn.execute("""
        SELECT language, COUNT(*) as count 
        FROM rss_sources 
        WHERE enabled = 1 AND language != ''
        GROUP BY language
        ORDER BY count DESC
        LIMIT 10
    """)
    by_language = {row[0]: row[1] for row in cursor.fetchall()}
    
    return {
        "ok": True,
        "total": total,
        "by_type": by_type,
        "by_language": by_language
    }


@router.get("/{source_id}")
async def get_source(source_id: str):
    """
    获取单个数据源详情
    """
    conn = _get_conn()
    conn.row_factory = sqlite3.Row
    
    cursor = conn.execute("""
        SELECT id, name, url, host, category, feed_type, country, language,
               cadence, fail_count, last_error_reason, enabled, created_at, updated_at
        FROM rss_sources 
        WHERE id = ?
    """, (source_id,))
    row = cursor.fetchone()
    
    if not row:
        return {"ok": False, "error": "Source not found"}
    
    return {
        "ok": True,
        "source": dict(row)
    }
