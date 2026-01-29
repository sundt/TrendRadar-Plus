"""
MP Article Writer - 公众号文章统一写入模块

将公众号文章写入统一的 rss_entries 表。
"""

import hashlib
import logging
import time
from typing import Any, Dict, List

logger = logging.getLogger("uvicorn.error")


def generate_source_id(fakeid: str) -> str:
    """生成公众号的 source_id"""
    return f"mp-{fakeid}"


def generate_dedup_key(url: str) -> str:
    """生成去重键（URL 的 MD5）"""
    return hashlib.md5(url.encode()).hexdigest()


def save_mp_articles(
    conn,
    fakeid: str,
    nickname: str,
    articles: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """
    统一的公众号文章写入函数
    
    Args:
        conn: 数据库连接
        fakeid: 公众号 fakeid
        nickname: 公众号昵称
        articles: 文章列表，每个文章包含 title, url, digest, cover_url, publish_time
        
    Returns:
        {"inserted": int, "skipped": int, "errors": List[str]}
    """
    source_id = generate_source_id(fakeid)
    now_ts = int(time.time())
    
    inserted = 0
    skipped = 0
    errors = []
    
    for art in articles:
        try:
            url = (art.get("url") or "").strip()
            if not url:
                skipped += 1
                continue
                
            dedup_key = generate_dedup_key(url)
            title = (art.get("title") or "").strip()
            digest = art.get("digest") or ""
            cover_url = art.get("cover_url") or ""
            publish_time = int(art.get("publish_time") or 0)
            
            cur = conn.execute(
                """
                INSERT OR IGNORE INTO rss_entries
                (source_id, dedup_key, url, title, published_at, published_raw, 
                 fetched_at, created_at, description, cover_url, source_type)
                VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 'mp')
                """,
                (source_id, dedup_key, url, title, publish_time, now_ts, now_ts, digest, cover_url)
            )
            
            if cur.rowcount > 0:
                inserted += 1
            else:
                skipped += 1
            
        except Exception as e:
            errors.append(f"Error processing article: {e}")
            skipped += 1
    
    conn.commit()
    
    if errors:
        logger.warning(f"[MPWriter] fakeid={fakeid} inserted={inserted} skipped={skipped} errors={len(errors)}")
    
    return {
        "inserted": inserted,
        "skipped": skipped,
        "errors": errors
    }


def save_mp_article(
    conn,
    fakeid: str,
    nickname: str,
    article: Dict[str, Any],
) -> bool:
    """
    写入单篇公众号文章（便捷函数）
    
    Returns:
        是否成功插入
    """
    result = save_mp_articles(conn, fakeid, nickname, [article])
    return result["inserted"] > 0
