"""
MP Article Writer - 公众号文章统一写入模块

将公众号文章写入统一的 rss_entries 表，支持配置写入目标（新表/旧表/两者）。
"""

import hashlib
import logging
import os
import time
from enum import Enum
from typing import Any, Dict, List, Optional

logger = logging.getLogger("uvicorn.error")


class WriteTarget(Enum):
    """写入目标配置"""
    NEW_TABLE = "new"    # 仅写入 rss_entries
    OLD_TABLE = "old"    # 仅写入 wechat_mp_articles
    BOTH = "both"        # 同时写入两张表（迁移过渡期）


def get_write_target() -> WriteTarget:
    """获取写入目标配置（从环境变量读取）"""
    target = os.environ.get("MP_ARTICLE_WRITE_TARGET", "new").lower()
    try:
        return WriteTarget(target)
    except ValueError:
        return WriteTarget.NEW_TABLE


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
    *,
    write_target: Optional[WriteTarget] = None
) -> Dict[str, Any]:
    """
    统一的公众号文章写入函数
    
    Args:
        conn: 数据库连接
        fakeid: 公众号 fakeid
        nickname: 公众号昵称
        articles: 文章列表，每个文章包含 title, url, digest, cover_url, publish_time
        write_target: 写入目标，默认从环境变量读取
        
    Returns:
        {"inserted": int, "skipped": int, "errors": List[str]}
    """
    if write_target is None:
        write_target = get_write_target()
    
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
            publish_hour = (publish_time // 3600) % 24 if publish_time > 0 else None
            
            new_inserted = False
            old_inserted = False
            
            # 写入新表 (rss_entries)
            if write_target in (WriteTarget.NEW_TABLE, WriteTarget.BOTH):
                try:
                    cur = conn.execute(
                        """
                        INSERT OR IGNORE INTO rss_entries
                        (source_id, dedup_key, url, title, published_at, published_raw, 
                         fetched_at, created_at, description, cover_url, source_type)
                        VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 'mp')
                        """,
                        (source_id, dedup_key, url, title, publish_time, now_ts, now_ts, digest, cover_url)
                    )
                    new_inserted = cur.rowcount > 0
                except Exception as e:
                    errors.append(f"New table error for {url[:50]}: {e}")
            
            # 写入旧表 (wechat_mp_articles)
            if write_target in (WriteTarget.OLD_TABLE, WriteTarget.BOTH):
                try:
                    cur = conn.execute(
                        """
                        INSERT OR IGNORE INTO wechat_mp_articles
                        (fakeid, dedup_key, title, url, digest, cover_url, publish_time, publish_hour, fetched_at, mp_nickname)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (fakeid, dedup_key, title, url, digest, cover_url, publish_time, publish_hour, now_ts, nickname)
                    )
                    old_inserted = cur.rowcount > 0
                except Exception as e:
                    errors.append(f"Old table error for {url[:50]}: {e}")
            
            # 统计插入数量
            if write_target == WriteTarget.NEW_TABLE:
                if new_inserted:
                    inserted += 1
                else:
                    skipped += 1
            elif write_target == WriteTarget.OLD_TABLE:
                if old_inserted:
                    inserted += 1
                else:
                    skipped += 1
            else:  # BOTH
                if new_inserted or old_inserted:
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
    *,
    write_target: Optional[WriteTarget] = None
) -> bool:
    """
    写入单篇公众号文章（便捷函数）
    
    Returns:
        是否成功插入
    """
    result = save_mp_articles(conn, fakeid, nickname, [article], write_target=write_target)
    return result["inserted"] > 0
