"""
MP Migration - 公众号数据迁移模块

将公众号文章从 wechat_mp_articles 迁移到 rss_entries 表，
将调度统计从 wechat_mp_stats 迁移到 source_stats 表。
"""

import logging
import time
from typing import Any, Dict, List

logger = logging.getLogger("uvicorn.error")


def _now_ts() -> int:
    return int(time.time())


# ========== 文章迁移 ==========

def migrate_mp_articles(
    conn,
    *,
    batch_size: int = 1000,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    将 wechat_mp_articles 数据迁移到 rss_entries
    
    Args:
        conn: 数据库连接
        batch_size: 每批处理数量
        dry_run: 是否仅预览不执行
        
    Returns:
        {"total": int, "migrated": int, "skipped": int, "errors": List[str]}
    """
    # 统计总数
    cur = conn.execute("SELECT COUNT(*) FROM wechat_mp_articles")
    total = cur.fetchone()[0] or 0
    
    if dry_run:
        return {"total": total, "migrated": 0, "skipped": 0, "errors": [], "dry_run": True}
    
    migrated = 0
    skipped = 0
    errors: List[str] = []
    offset = 0
    now_ts = _now_ts()
    
    while True:
        # 分批读取
        cur = conn.execute(
            """
            SELECT fakeid, dedup_key, title, url, digest, cover_url, publish_time, fetched_at
            FROM wechat_mp_articles
            ORDER BY id
            LIMIT ? OFFSET ?
            """,
            (batch_size, offset)
        )
        rows = cur.fetchall() or []
        
        if not rows:
            break
        
        for row in rows:
            fakeid, dedup_key, title, url, digest, cover_url, publish_time, fetched_at = row
            source_id = f"mp-{fakeid}"
            
            try:
                # 检查是否已存在
                check_cur = conn.execute(
                    "SELECT 1 FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
                    (source_id, dedup_key)
                )
                if check_cur.fetchone():
                    skipped += 1
                    continue
                
                # 插入新表
                conn.execute(
                    """
                    INSERT INTO rss_entries
                    (source_id, dedup_key, url, title, published_at, published_raw, 
                     fetched_at, created_at, description, cover_url, source_type)
                    VALUES (?, ?, ?, ?, ?, '', ?, ?, ?, ?, 'mp')
                    """,
                    (source_id, dedup_key, url, title, publish_time, fetched_at or now_ts, now_ts, digest or "", cover_url or "")
                )
                migrated += 1
                
            except Exception as e:
                errors.append(f"Error migrating {url[:50] if url else 'unknown'}: {e}")
        
        conn.commit()
        offset += batch_size
        logger.info(f"[MPMigration] Articles progress: {offset}/{total}, migrated={migrated}, skipped={skipped}")
    
    return {
        "total": total,
        "migrated": migrated,
        "skipped": skipped,
        "errors": errors[:100]  # 限制错误数量
    }


def verify_articles_migration(conn) -> Dict[str, Any]:
    """
    验证文章迁移数据完整性
    
    Returns:
        {"old_count": int, "new_count": int, "match": bool, "missing": int}
    """
    # 旧表数量
    cur = conn.execute("SELECT COUNT(*) FROM wechat_mp_articles")
    old_count = cur.fetchone()[0] or 0
    
    # 新表中公众号文章数量
    cur = conn.execute("SELECT COUNT(*) FROM rss_entries WHERE source_type = 'mp'")
    new_count = cur.fetchone()[0] or 0
    
    # 检查缺失的文章
    cur = conn.execute(
        """
        SELECT COUNT(*) FROM wechat_mp_articles w
        WHERE NOT EXISTS (
            SELECT 1 FROM rss_entries r 
            WHERE r.source_id = 'mp-' || w.fakeid 
            AND r.dedup_key = w.dedup_key
        )
        """
    )
    missing = cur.fetchone()[0] or 0
    
    return {
        "old_count": old_count,
        "new_count": new_count,
        "match": old_count == new_count,
        "missing": missing
    }


# ========== 调度统计迁移 ==========

def migrate_mp_stats(
    conn,
    *,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    将 wechat_mp_stats 数据迁移到 source_stats
    
    Args:
        conn: 数据库连接
        dry_run: 是否仅预览不执行
        
    Returns:
        {"total": int, "migrated": int, "skipped": int, "errors": List[str]}
    """
    # 统计总数
    cur = conn.execute("SELECT COUNT(*) FROM wechat_mp_stats")
    total = cur.fetchone()[0] or 0
    
    if dry_run:
        return {"total": total, "migrated": 0, "skipped": 0, "errors": [], "dry_run": True}
    
    migrated = 0
    skipped = 0
    errors: List[str] = []
    now_ts = _now_ts()
    
    # 读取所有 wechat_mp_stats 记录
    cur = conn.execute(
        """
        SELECT fakeid, frequency_type, cadence, avg_publish_hour, std_publish_hour,
               next_due_at, last_check_at, last_article_at, fail_count, backoff_until,
               last_error, check_count, hit_count, created_at, updated_at
        FROM wechat_mp_stats
        """
    )
    rows = cur.fetchall() or []
    
    for row in rows:
        (fakeid, frequency_type, cadence, avg_publish_hour, std_publish_hour,
         next_due_at, last_check_at, last_article_at, fail_count, backoff_until,
         last_error, check_count, hit_count, created_at, updated_at) = row
        
        source_id = f"mp-{fakeid}"
        
        try:
            # 检查是否已存在
            check_cur = conn.execute(
                "SELECT 1 FROM source_stats WHERE source_id = ?",
                (source_id,)
            )
            if check_cur.fetchone():
                skipped += 1
                continue
            
            # 插入 source_stats
            conn.execute(
                """
                INSERT INTO source_stats (
                    source_id, source_type, frequency_type, cadence,
                    avg_publish_hour, std_publish_hour, next_due_at,
                    last_check_at, last_article_at, fail_count, backoff_until,
                    last_error, check_count, hit_count, created_at, updated_at
                ) VALUES (?, 'mp', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (source_id, frequency_type or "daily", cadence or "W2", avg_publish_hour, std_publish_hour,
                 next_due_at or 0, last_check_at or 0, last_article_at or 0, fail_count or 0, backoff_until or 0,
                 last_error or "", check_count or 0, hit_count or 0, created_at or now_ts, updated_at or now_ts)
            )
            migrated += 1
            
        except Exception as e:
            errors.append(f"Error migrating stats for {fakeid}: {e}")
    
    conn.commit()
    logger.info(f"[MPMigration] Stats completed: total={total}, migrated={migrated}, skipped={skipped}")
    
    return {
        "total": total,
        "migrated": migrated,
        "skipped": skipped,
        "errors": errors[:100]
    }


def verify_stats_migration(conn) -> Dict[str, Any]:
    """
    验证调度统计迁移完整性
    
    Returns:
        {"old_count": int, "new_count": int, "match": bool, "missing": int}
    """
    # 旧表数量
    cur = conn.execute("SELECT COUNT(*) FROM wechat_mp_stats")
    old_count = cur.fetchone()[0] or 0
    
    # 新表中公众号统计数量
    cur = conn.execute("SELECT COUNT(*) FROM source_stats WHERE source_type = 'mp'")
    new_count = cur.fetchone()[0] or 0
    
    # 检查缺失的统计
    cur = conn.execute(
        """
        SELECT COUNT(*) FROM wechat_mp_stats w
        WHERE NOT EXISTS (
            SELECT 1 FROM source_stats s 
            WHERE s.source_id = 'mp-' || w.fakeid
        )
        """
    )
    missing = cur.fetchone()[0] or 0
    
    return {
        "old_count": old_count,
        "new_count": new_count,
        "match": old_count == new_count,
        "missing": missing
    }


# ========== 完整迁移 ==========

def migrate_all(
    conn,
    *,
    batch_size: int = 1000,
    dry_run: bool = False
) -> Dict[str, Any]:
    """
    执行完整迁移（文章 + 调度统计）
    
    Args:
        conn: 数据库连接
        batch_size: 文章迁移每批处理数量
        dry_run: 是否仅预览不执行
        
    Returns:
        {"articles": {...}, "stats": {...}}
    """
    articles_result = migrate_mp_articles(conn, batch_size=batch_size, dry_run=dry_run)
    stats_result = migrate_mp_stats(conn, dry_run=dry_run)
    
    return {
        "articles": articles_result,
        "stats": stats_result
    }


def verify_all(conn) -> Dict[str, Any]:
    """
    验证完整迁移
    
    Returns:
        {"articles": {...}, "stats": {...}, "all_match": bool}
    """
    articles_result = verify_articles_migration(conn)
    stats_result = verify_stats_migration(conn)
    
    return {
        "articles": articles_result,
        "stats": stats_result,
        "all_match": articles_result["match"] and stats_result["match"]
    }


def get_migration_status(conn) -> Dict[str, Any]:
    """
    获取迁移状态概览
    
    Returns:
        迁移状态信息
    """
    # 文章统计
    cur = conn.execute("SELECT COUNT(*) FROM wechat_mp_articles")
    old_articles = cur.fetchone()[0] or 0
    
    cur = conn.execute("SELECT COUNT(*) FROM rss_entries WHERE source_type = 'mp'")
    new_articles = cur.fetchone()[0] or 0
    
    # 调度统计
    cur = conn.execute("SELECT COUNT(*) FROM wechat_mp_stats")
    old_stats = cur.fetchone()[0] or 0
    
    cur = conn.execute("SELECT COUNT(*) FROM source_stats WHERE source_type = 'mp'")
    new_stats = cur.fetchone()[0] or 0
    
    return {
        "articles": {
            "old_table": old_articles,
            "new_table": new_articles,
            "progress": round(new_articles / old_articles * 100, 2) if old_articles > 0 else 100
        },
        "stats": {
            "old_table": old_stats,
            "new_table": new_stats,
            "progress": round(new_stats / old_stats * 100, 2) if old_stats > 0 else 100
        }
    }
