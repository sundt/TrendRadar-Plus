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
    
    print(f"[Cleanup] Completed at {datetime.now()}")


if __name__ == "__main__":
    main()
