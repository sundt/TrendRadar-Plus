#!/usr/bin/env python3
"""
公众号数据迁移脚本

将 rss_sources 表中 category='wechat_mp' 的公众号数据迁移到 featured_wechat_mps 表。

使用方法:
    python scripts/migrate_wechat_mp_sources.py [--dry-run] [--cleanup]

参数:
    --dry-run   只显示将要迁移的数据，不实际执行
    --cleanup   迁移后删除 rss_sources 中的公众号数据
"""

import sys
import json
import time
import sqlite3
import argparse
from pathlib import Path
from datetime import datetime


def get_project_root() -> Path:
    """获取项目根目录"""
    return Path(__file__).parent.parent


def get_online_db_path() -> Path:
    """获取在线数据库路径"""
    return get_project_root() / "output" / "online.db"


def migrate_wechat_mp_from_rss_sources(
    conn: sqlite3.Connection,
    dry_run: bool = False
) -> dict:
    """
    将 rss_sources 中的公众号数据迁移到 featured_wechat_mps
    
    Args:
        conn: 数据库连接
        dry_run: 是否只预览不执行
    
    Returns:
        {
            "total": int,       # 总记录数
            "migrated": int,    # 成功迁移数
            "skipped": int,     # 跳过数（已存在）
            "failed": int,      # 失败数
            "records": list     # 迁移记录详情
        }
    """
    result = {
        "total": 0,
        "migrated": 0,
        "skipped": 0,
        "failed": 0,
        "records": []
    }
    
    # 查询 rss_sources 中的公众号数据
    cur = conn.execute("""
        SELECT id, name, url, created_at, updated_at
        FROM rss_sources
        WHERE category = 'wechat_mp'
    """)
    rows = cur.fetchall() or []
    result["total"] = len(rows)
    
    if not rows:
        print("没有找到需要迁移的公众号数据")
        return result
    
    print(f"找到 {len(rows)} 条公众号数据待迁移")
    
    now = int(time.time())
    
    for row in rows:
        source_id = row[0]
        name = row[1]
        url = row[2]
        created_at = row[3] or now
        updated_at = row[4] or now
        
        # 解析 wechat_id (从 url: wechat://mp/{wechat_id})
        wechat_id = None
        if url and url.startswith("wechat://mp/"):
            wechat_id = url.replace("wechat://mp/", "")
        elif source_id and source_id.startswith("mp-"):
            wechat_id = source_id[3:]
        
        if not wechat_id:
            print(f"  ⚠️ 跳过: {source_id} - 无法解析 wechat_id")
            result["failed"] += 1
            result["records"].append({
                "source_id": source_id,
                "name": name,
                "status": "failed",
                "reason": "无法解析 wechat_id"
            })
            continue
        
        # 检查是否已存在
        check_cur = conn.execute(
            "SELECT id FROM featured_wechat_mps WHERE fakeid = ?",
            (wechat_id,)
        )
        existing = check_cur.fetchone()
        
        if existing:
            print(f"  ⏭️ 跳过: {name} ({wechat_id}) - 已存在")
            result["skipped"] += 1
            result["records"].append({
                "source_id": source_id,
                "name": name,
                "wechat_id": wechat_id,
                "status": "skipped",
                "reason": "已存在"
            })
            continue
        
        if dry_run:
            print(f"  📋 将迁移: {name} ({wechat_id})")
            result["migrated"] += 1
            result["records"].append({
                "source_id": source_id,
                "name": name,
                "wechat_id": wechat_id,
                "status": "will_migrate"
            })
            continue
        
        # 执行迁移
        try:
            conn.execute("""
                INSERT INTO featured_wechat_mps 
                (fakeid, nickname, round_head_img, signature, category, 
                 sort_order, enabled, source, added_by_user_id, created_at, updated_at)
                VALUES (?, ?, '', '', 'general', 0, 1, 'ai_recommend', NULL, ?, ?)
            """, (wechat_id, name, created_at, updated_at))
            
            print(f"  ✅ 已迁移: {name} ({wechat_id})")
            result["migrated"] += 1
            result["records"].append({
                "source_id": source_id,
                "name": name,
                "wechat_id": wechat_id,
                "status": "migrated"
            })
        except Exception as e:
            print(f"  ❌ 失败: {name} ({wechat_id}) - {e}")
            result["failed"] += 1
            result["records"].append({
                "source_id": source_id,
                "name": name,
                "wechat_id": wechat_id,
                "status": "failed",
                "reason": str(e)
            })
    
    if not dry_run:
        conn.commit()
    
    return result


def cleanup_rss_sources(conn: sqlite3.Connection, dry_run: bool = False) -> int:
    """
    删除 rss_sources 中的公众号数据
    
    Args:
        conn: 数据库连接
        dry_run: 是否只预览不执行
    
    Returns:
        删除的记录数
    """
    # 先统计数量
    cur = conn.execute("SELECT COUNT(*) FROM rss_sources WHERE category = 'wechat_mp'")
    count = cur.fetchone()[0] or 0
    
    if count == 0:
        print("没有需要清理的公众号数据")
        return 0
    
    if dry_run:
        print(f"将删除 {count} 条公众号数据（dry-run 模式，未实际执行）")
        return count
    
    # 执行删除
    conn.execute("DELETE FROM rss_sources WHERE category = 'wechat_mp'")
    conn.commit()
    
    print(f"已删除 {count} 条公众号数据")
    return count


def save_migration_log(result: dict, log_path: Path):
    """保存迁移日志"""
    log_data = {
        "timestamp": datetime.now().isoformat(),
        "result": result
    }
    
    with open(log_path, "w", encoding="utf-8") as f:
        json.dump(log_data, f, ensure_ascii=False, indent=2)
    
    print(f"迁移日志已保存到: {log_path}")


def main():
    parser = argparse.ArgumentParser(description="公众号数据迁移脚本")
    parser.add_argument("--dry-run", action="store_true", help="只预览不执行")
    parser.add_argument("--cleanup", action="store_true", help="迁移后删除 rss_sources 中的公众号数据")
    args = parser.parse_args()
    
    db_path = get_online_db_path()
    if not db_path.exists():
        print(f"数据库不存在: {db_path}")
        sys.exit(1)
    
    conn = sqlite3.connect(str(db_path))
    
    try:
        print("=" * 60)
        print("公众号数据迁移")
        print("=" * 60)
        
        if args.dry_run:
            print("⚠️ DRY-RUN 模式，不会实际执行迁移")
        
        print()
        result = migrate_wechat_mp_from_rss_sources(conn, dry_run=args.dry_run)
        
        print()
        print("-" * 60)
        print(f"迁移结果: 总计 {result['total']}, 成功 {result['migrated']}, "
              f"跳过 {result['skipped']}, 失败 {result['failed']}")
        
        # 保存迁移日志
        if not args.dry_run and result["migrated"] > 0:
            log_path = get_project_root() / "output" / f"migration_log_{int(time.time())}.json"
            save_migration_log(result, log_path)
        
        # 清理 rss_sources
        if args.cleanup and not args.dry_run:
            print()
            print("-" * 60)
            print("清理 rss_sources 中的公众号数据")
            cleanup_rss_sources(conn, dry_run=args.dry_run)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
