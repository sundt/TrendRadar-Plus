"""
MP Article Reader - 公众号文章统一读取模块

从统一的 rss_entries 表或旧的 wechat_mp_articles 表读取公众号文章，
支持配置读取来源。
"""

import logging
import os
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger("uvicorn.error")


class ReadSource(Enum):
    """读取来源配置"""
    NEW_TABLE = "new"    # 从 rss_entries 读取
    OLD_TABLE = "old"    # 从 wechat_mp_articles 读取


def get_read_source() -> ReadSource:
    """获取读取来源配置（从环境变量读取）"""
    source = os.environ.get("MP_ARTICLE_READ_SOURCE", "new").lower()
    try:
        return ReadSource(source)
    except ValueError:
        return ReadSource.NEW_TABLE


def generate_source_id(fakeid: str) -> str:
    """生成公众号的 source_id"""
    return f"mp-{fakeid}"


def get_mp_articles(
    conn,
    fakeid: str,
    *,
    limit: int = 50,
    read_source: Optional[ReadSource] = None
) -> List[Dict[str, Any]]:
    """
    统一的公众号文章读取函数
    
    Args:
        conn: 数据库连接
        fakeid: 公众号 fakeid
        limit: 返回文章数量限制
        read_source: 读取来源，默认从环境变量读取
        
    Returns:
        文章列表，格式统一为 [{"id", "title", "url", "digest", "cover_url", "publish_time"}, ...]
    """
    if read_source is None:
        read_source = get_read_source()
    
    articles = []
    
    if read_source == ReadSource.NEW_TABLE:
        source_id = generate_source_id(fakeid)
        cur = conn.execute(
            """
            SELECT id, title, url, description, cover_url, published_at
            FROM rss_entries
            WHERE source_id = ?
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (source_id, limit)
        )
        for row in cur.fetchall() or []:
            articles.append({
                "id": row[0],
                "title": row[1],
                "url": row[2],
                "digest": row[3] or "",
                "cover_url": row[4] or "",
                "publish_time": row[5]
            })
    else:
        cur = conn.execute(
            """
            SELECT id, title, url, digest, cover_url, publish_time
            FROM wechat_mp_articles
            WHERE fakeid = ?
            ORDER BY publish_time DESC
            LIMIT ?
            """,
            (fakeid, limit)
        )
        for row in cur.fetchall() or []:
            articles.append({
                "id": row[0],
                "title": row[1],
                "url": row[2],
                "digest": row[3] or "",
                "cover_url": row[4] or "",
                "publish_time": row[5]
            })
    
    return articles


def get_mp_articles_by_fakeids(
    conn,
    fakeids: List[str],
    *,
    limit_per_mp: int = 50,
    read_source: Optional[ReadSource] = None
) -> Dict[str, List[Dict[str, Any]]]:
    """
    批量获取多个公众号的文章
    
    Args:
        conn: 数据库连接
        fakeids: 公众号 fakeid 列表
        limit_per_mp: 每个公众号返回的文章数量限制
        read_source: 读取来源，默认从环境变量读取
        
    Returns:
        {fakeid: [articles], ...}
    """
    result = {}
    for fakeid in fakeids:
        result[fakeid] = get_mp_articles(conn, fakeid, limit=limit_per_mp, read_source=read_source)
    return result


def get_mp_articles_count(
    conn,
    fakeid: str,
    *,
    read_source: Optional[ReadSource] = None
) -> int:
    """
    获取公众号文章数量
    
    Args:
        conn: 数据库连接
        fakeid: 公众号 fakeid
        read_source: 读取来源，默认从环境变量读取
        
    Returns:
        文章数量
    """
    if read_source is None:
        read_source = get_read_source()
    
    if read_source == ReadSource.NEW_TABLE:
        source_id = generate_source_id(fakeid)
        cur = conn.execute(
            "SELECT COUNT(*) FROM rss_entries WHERE source_id = ?",
            (source_id,)
        )
    else:
        cur = conn.execute(
            "SELECT COUNT(*) FROM wechat_mp_articles WHERE fakeid = ?",
            (fakeid,)
        )
    
    return cur.fetchone()[0] or 0


def get_all_mp_articles_count(
    conn,
    *,
    read_source: Optional[ReadSource] = None
) -> int:
    """
    获取所有公众号文章总数
    
    Args:
        conn: 数据库连接
        read_source: 读取来源，默认从环境变量读取
        
    Returns:
        文章总数
    """
    if read_source is None:
        read_source = get_read_source()
    
    if read_source == ReadSource.NEW_TABLE:
        cur = conn.execute(
            "SELECT COUNT(*) FROM rss_entries WHERE source_type = 'mp'"
        )
    else:
        cur = conn.execute(
            "SELECT COUNT(*) FROM wechat_mp_articles"
        )
    
    return cur.fetchone()[0] or 0


def get_recent_mp_articles(
    conn,
    *,
    limit: int = 100,
    read_source: Optional[ReadSource] = None
) -> List[Dict[str, Any]]:
    """
    获取最近的公众号文章（跨所有公众号）
    
    Args:
        conn: 数据库连接
        limit: 返回文章数量限制
        read_source: 读取来源，默认从环境变量读取
        
    Returns:
        文章列表
    """
    if read_source is None:
        read_source = get_read_source()
    
    articles = []
    
    if read_source == ReadSource.NEW_TABLE:
        cur = conn.execute(
            """
            SELECT id, source_id, title, url, description, cover_url, published_at
            FROM rss_entries
            WHERE source_type = 'mp'
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (limit,)
        )
        for row in cur.fetchall() or []:
            source_id = row[1]
            fakeid = source_id[3:] if source_id.startswith("mp-") else source_id
            articles.append({
                "id": row[0],
                "fakeid": fakeid,
                "title": row[2],
                "url": row[3],
                "digest": row[4] or "",
                "cover_url": row[5] or "",
                "publish_time": row[6]
            })
    else:
        cur = conn.execute(
            """
            SELECT id, fakeid, title, url, digest, cover_url, publish_time
            FROM wechat_mp_articles
            ORDER BY publish_time DESC
            LIMIT ?
            """,
            (limit,)
        )
        for row in cur.fetchall() or []:
            articles.append({
                "id": row[0],
                "fakeid": row[1],
                "title": row[2],
                "url": row[3],
                "digest": row[4] or "",
                "cover_url": row[5] or "",
                "publish_time": row[6]
            })
    
    return articles



def get_mp_articles_paginated(
    conn,
    fakeids: List[str],
    *,
    limit: int = 20,
    offset: int = 0,
    read_source: Optional[ReadSource] = None
) -> tuple:
    """
    分页获取多个公众号的文章（用于用户订阅列表）
    
    Args:
        conn: 数据库连接
        fakeids: 公众号 fakeid 列表
        limit: 每页数量
        offset: 偏移量
        read_source: 读取来源，默认从环境变量读取
        
    Returns:
        (articles, total) 元组
    """
    if not fakeids:
        return [], 0
    
    if read_source is None:
        read_source = get_read_source()
    
    placeholders = ",".join(["?"] * len(fakeids))
    articles = []
    
    if read_source == ReadSource.NEW_TABLE:
        # 生成 source_ids
        source_ids = [f"mp-{fid}" for fid in fakeids]
        source_placeholders = ",".join(["?"] * len(source_ids))
        
        cur = conn.execute(
            f"""
            SELECT id, source_id, title, url, description, cover_url, published_at
            FROM rss_entries
            WHERE source_id IN ({source_placeholders})
            ORDER BY published_at DESC
            LIMIT ? OFFSET ?
            """,
            (*source_ids, limit, offset)
        )
        for row in cur.fetchall() or []:
            source_id = row[1]
            fakeid = source_id[3:] if source_id.startswith("mp-") else source_id
            articles.append({
                "id": row[0],
                "fakeid": fakeid,
                "title": row[2],
                "url": row[3],
                "digest": row[4] or "",
                "cover_url": row[5] or "",
                "publish_time": row[6],
            })
        
        # 获取总数
        count_cur = conn.execute(
            f"SELECT COUNT(*) FROM rss_entries WHERE source_id IN ({source_placeholders})",
            source_ids
        )
        total = count_cur.fetchone()[0] or 0
    else:
        cur = conn.execute(
            f"""
            SELECT id, fakeid, title, url, digest, cover_url, publish_time, mp_nickname
            FROM wechat_mp_articles
            WHERE fakeid IN ({placeholders})
            ORDER BY publish_time DESC
            LIMIT ? OFFSET ?
            """,
            (*fakeids, limit, offset)
        )
        for row in cur.fetchall() or []:
            articles.append({
                "id": row[0],
                "fakeid": row[1],
                "title": row[2],
                "url": row[3],
                "digest": row[4] or "",
                "cover_url": row[5] or "",
                "publish_time": row[6],
                "mp_nickname": row[7] or "",
            })
        
        # 获取总数
        count_cur = conn.execute(
            f"SELECT COUNT(*) FROM wechat_mp_articles WHERE fakeid IN ({placeholders})",
            fakeids
        )
        total = count_cur.fetchone()[0] or 0
    
    return articles, total
