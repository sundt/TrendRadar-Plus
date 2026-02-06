#!/usr/bin/env python3
"""
数据生命周期管理脚本
每日凌晨执行，清理过期数据 + 自动调整 Cadence

用法:
    python scripts/cleanup_old_data.py
    
环境变量:
    ONLINE_DB_PATH: online.db 路径 (默认: /app/output/online.db)
"""
import sqlite3
import os
import time
from datetime import datetime
from pathlib import Path


def cleanup_old_data(db_path: str, retention_config: dict) -> dict:
    """
    清理过期数据
    
    Args:
        db_path: 数据库路径
        retention_config: 保留天数配置
        
    Returns:
        清理统计
    """
    conn = sqlite3.connect(db_path)
    now_ts = int(time.time())
    stats = {}
    
    # rss_entries: 保留 60 天
    cutoff_entries = now_ts - retention_config.get("rss_entries", 60) * 86400
    conn.execute("DELETE FROM rss_entries WHERE fetched_at < ?", (cutoff_entries,))
    stats["rss_entries_deleted"] = conn.total_changes
    
    # rss_entry_ai_labels: 保留 30 天
    cutoff_labels = now_ts - retention_config.get("rss_entry_ai_labels", 30) * 86400
    try:
        conn.execute("DELETE FROM rss_entry_ai_labels WHERE labeled_at < ?", (cutoff_labels,))
        stats["ai_labels_deleted"] = conn.total_changes
    except Exception:
        stats["ai_labels_deleted"] = 0
    
    # rss_usage_events: 保留 90 天
    cutoff_events = now_ts - retention_config.get("rss_usage_events", 90) * 86400
    try:
        conn.execute("DELETE FROM rss_usage_events WHERE ts < ?", (cutoff_events,))
        stats["usage_events_deleted"] = conn.total_changes
    except Exception:
        stats["usage_events_deleted"] = 0
    
    conn.commit()
    
    # VACUUM 回收空间
    try:
        conn.execute("VACUUM")
    except Exception:
        pass
    
    conn.close()
    return stats


def auto_adjust_cadence(db_path: str) -> dict:
    """
    根据过去 7 天的数据量自动调整 Cadence
    
    Returns:
        调整统计
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    now_ts = int(time.time())
    cutoff_7d = now_ts - 7 * 86400
    
    # 获取所有启用的自定义源
    cursor = conn.execute("SELECT id, cadence FROM custom_sources WHERE enabled = 1")
    sources = cursor.fetchall()
    
    adjusted = 0
    
    for src in sources:
        source_id = src["id"]
        current_cadence = src["cadence"] or "P2"
        
        # 统计过去 7 天的条目数
        cursor = conn.execute("""
            SELECT COUNT(*) FROM rss_entries 
            WHERE source_id = ? AND fetched_at > ?
        """, (source_id, cutoff_7d))
        count_7d = cursor.fetchone()[0]
        daily_avg = count_7d / 7
        
        # 根据日均数量推荐 Cadence
        if daily_avg >= 50:
            recommended = "P0"
        elif daily_avg >= 20:
            recommended = "P1"
        elif daily_avg >= 10:
            recommended = "P2"
        elif daily_avg >= 5:
            recommended = "P3"
        elif daily_avg >= 1:
            recommended = "P4"
        else:
            recommended = "P6"
        
        # 如果推荐值与当前值不同，更新
        if recommended != current_cadence:
            conn.execute(
                "UPDATE custom_sources SET cadence = ?, updated_at = ? WHERE id = ?",
                (recommended, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), source_id)
            )
            adjusted += 1
            print(f"  [Auto-Cadence] {source_id}: {current_cadence} -> {recommended} (daily_avg={daily_avg:.1f})")
    
    conn.commit()
    conn.close()
    
    return {"sources_checked": len(sources), "cadence_adjusted": adjusted}


def cleanup_inactive_mps(db_path: str, inactive_days: int = 60) -> dict:
    """
    清理超过指定天数没有更新的用户添加的公众号
    
    Args:
        db_path: 数据库路径
        inactive_days: 不活跃天数阈值（默认60天，即2个月）
        
    Returns:
        清理统计
    """
    conn = sqlite3.connect(db_path)
    now_ts = int(time.time())
    cutoff_ts = now_ts - (inactive_days * 86400)
    
    # 查找不活跃的公众号（所有来源）
    query = """
        SELECT 
            f.fakeid,
            f.nickname,
            f.source,
            MAX(e.published_at) as last_article_at
        FROM featured_wechat_mps f
        LEFT JOIN rss_entries e ON e.source_id = 'mp-' || f.fakeid
        WHERE f.enabled = 1
        GROUP BY f.fakeid
        HAVING last_article_at IS NULL OR last_article_at < ?
    """
    
    cursor = conn.execute(query, (cutoff_ts,))
    inactive_mps = cursor.fetchall()
    
    if not inactive_mps:
        conn.close()
        return {"checked": 0, "deleted": 0}
    
    # 删除这些公众号记录
    fakeids = [row[0] for row in inactive_mps]
    placeholders = ",".join(["?"] * len(fakeids))
    
    conn.execute(
        f"DELETE FROM featured_wechat_mps WHERE fakeid IN ({placeholders})",
        fakeids
    )
    conn.commit()
    
    # 打印详情
    for fakeid, nickname, source, last_at in inactive_mps:
        if last_at:
            last_str = datetime.fromtimestamp(last_at).strftime("%Y-%m-%d")
        else:
            last_str = "从未更新"
        source_str = source or "admin"
        print(f"  [Inactive MP] 删除: {nickname} ({source_str}, 最后更新: {last_str})")
    
    conn.close()
    
    return {"checked": len(inactive_mps), "deleted": len(fakeids)}


def main():
    """主入口"""
    db_path = os.environ.get("ONLINE_DB_PATH", "/app/output/online.db")
    
    # 如果本地开发，尝试查找项目路径
    if not Path(db_path).exists():
        project_root = Path(__file__).resolve().parents[1]
        db_path = str(project_root / "output" / "online.db")
    
    if not Path(db_path).exists():
        print(f"[Cleanup] Database not found: {db_path}")
        return
    
    print(f"[Cleanup] Starting at {datetime.now()}")
    print(f"[Cleanup] Database: {db_path}")
    
    # 1. 清理过期数据
    retention_config = {
        "rss_entries": 60,
        "rss_entry_ai_labels": 30,
        "rss_usage_events": 90,
    }
    cleanup_stats = cleanup_old_data(db_path, retention_config)
    print(f"[Cleanup] Deleted: entries={cleanup_stats.get('rss_entries_deleted', 0)}, "
          f"labels={cleanup_stats.get('ai_labels_deleted', 0)}, "
          f"events={cleanup_stats.get('usage_events_deleted', 0)}")
    
    # 2. 自动调整 Cadence
    cadence_stats = auto_adjust_cadence(db_path)
    print(f"[Auto-Cadence] Checked {cadence_stats['sources_checked']} sources, "
          f"adjusted {cadence_stats['cadence_adjusted']}")
    
    # 3. 清理不活跃的用户公众号（超过60天没更新）
    mp_stats = cleanup_inactive_mps(db_path, inactive_days=60)
    print(f"[Inactive MPs] Deleted {mp_stats['deleted']} inactive user-added MPs")
    
    print(f"[Cleanup] Completed at {datetime.now()}")


if __name__ == "__main__":
    main()
