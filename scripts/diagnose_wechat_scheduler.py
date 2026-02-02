#!/usr/bin/env python3
"""
诊断微信公众号抓取调度器状态

检查项目：
1. 调度器是否启用
2. 凭证池状态
3. 最近的抓取记录
4. 错误日志
"""

import os
import sys
import sqlite3
from datetime import datetime
from pathlib import Path

# 添加项目路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

def get_db_conn(db_path: str):
    """获取数据库连接"""
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

def check_scheduler_config():
    """检查调度器配置"""
    print("\n" + "=" * 60)
    print("1. 调度器配置检查")
    print("=" * 60)
    
    enabled = os.environ.get("HOTNEWS_WECHAT_SCHEDULER_ENABLED", "0")
    unified = os.environ.get("HOTNEWS_UNIFIED_MP_SCHEDULER", "1")
    interval = os.environ.get("HOTNEWS_MP_CHECK_INTERVAL", "60")
    max_per_cycle = os.environ.get("HOTNEWS_MP_MAX_PER_CYCLE", "20")
    
    print(f"  HOTNEWS_WECHAT_SCHEDULER_ENABLED: {enabled}")
    print(f"  HOTNEWS_UNIFIED_MP_SCHEDULER: {unified}")
    print(f"  HOTNEWS_MP_CHECK_INTERVAL: {interval}s")
    print(f"  HOTNEWS_MP_MAX_PER_CYCLE: {max_per_cycle}")
    
    if enabled not in ("1", "true", "yes"):
        print("\n  ⚠️  调度器未启用！请设置 HOTNEWS_WECHAT_SCHEDULER_ENABLED=1")
        return False
    
    print("\n  ✅ 调度器配置正常")
    return True

def check_credentials(user_db_path: str, online_db_path: str):
    """检查凭证状态"""
    print("\n" + "=" * 60)
    print("2. 凭证状态检查")
    print("=" * 60)
    
    user_conn = get_db_conn(user_db_path)
    online_conn = get_db_conn(online_db_path)
    now = int(datetime.now().timestamp())
    
    # 检查用户凭证
    print("\n  用户凭证 (wechat_mp_auth):")
    try:
        cur = user_conn.execute("""
            SELECT user_id, status, expires_at, last_error, updated_at
            FROM wechat_mp_auth
            ORDER BY updated_at DESC
        """)
        rows = cur.fetchall()
        
        if not rows:
            print("    ❌ 没有找到任何用户凭证")
        else:
            for row in rows:
                user_id = row["user_id"]
                status = row["status"]
                expires_at = row["expires_at"]
                last_error = row["last_error"] or ""
                updated_at = row["updated_at"]
                
                # 检查是否过期
                is_expired = expires_at and expires_at < now
                expire_str = datetime.fromtimestamp(expires_at).strftime("%Y-%m-%d %H:%M") if expires_at else "未设置"
                update_str = datetime.fromtimestamp(updated_at).strftime("%Y-%m-%d %H:%M") if updated_at else "未知"
                
                status_icon = "✅" if status == "valid" and not is_expired else "❌"
                print(f"    {status_icon} 用户 {user_id}: status={status}, 过期时间={expire_str}, 更新时间={update_str}")
                if last_error:
                    print(f"       最后错误: {last_error[:50]}...")
    except Exception as e:
        print(f"    ❌ 查询失败: {e}")
    
    # 检查共享凭证
    print("\n  共享凭证 (wechat_shared_credentials):")
    try:
        cur = online_conn.execute("""
            SELECT id, name, status, expires_at, last_error, updated_at
            FROM wechat_shared_credentials
            ORDER BY updated_at DESC
        """)
        rows = cur.fetchall()
        
        if not rows:
            print("    ❌ 没有找到任何共享凭证")
        else:
            for row in rows:
                cred_id = row["id"]
                name = row["name"]
                status = row["status"]
                expires_at = row["expires_at"]
                last_error = row["last_error"] or ""
                updated_at = row["updated_at"]
                
                is_expired = expires_at and expires_at < now
                expire_str = datetime.fromtimestamp(expires_at).strftime("%Y-%m-%d %H:%M") if expires_at else "未设置"
                update_str = datetime.fromtimestamp(updated_at).strftime("%Y-%m-%d %H:%M") if updated_at else "未知"
                
                status_icon = "✅" if status == "valid" and not is_expired else "❌"
                print(f"    {status_icon} {name} (ID={cred_id}): status={status}, 过期={expire_str}, 更新={update_str}")
                if last_error:
                    print(f"       最后错误: {last_error[:50]}...")
    except Exception as e:
        print(f"    ❌ 查询失败: {e}")
    
    user_conn.close()
    online_conn.close()

def check_featured_mps(online_db_path: str):
    """检查精选公众号状态"""
    print("\n" + "=" * 60)
    print("3. 精选公众号状态")
    print("=" * 60)
    
    conn = get_db_conn(online_db_path)
    now = int(datetime.now().timestamp())
    
    try:
        cur = conn.execute("""
            SELECT fakeid, nickname, enabled, last_fetch_at, article_count
            FROM featured_wechat_mps
            ORDER BY last_fetch_at DESC NULLS LAST
            LIMIT 10
        """)
        rows = cur.fetchall()
        
        if not rows:
            print("  ❌ 没有找到精选公众号")
        else:
            print(f"  共 {len(rows)} 个精选公众号 (显示最近10个):\n")
            for row in rows:
                nickname = row["nickname"]
                enabled = row["enabled"]
                last_fetch = row["last_fetch_at"]
                article_count = row["article_count"] or 0
                
                if last_fetch:
                    fetch_str = datetime.fromtimestamp(last_fetch).strftime("%Y-%m-%d %H:%M")
                    hours_ago = (now - last_fetch) / 3600
                    fetch_info = f"{fetch_str} ({hours_ago:.1f}小时前)"
                else:
                    fetch_info = "从未抓取"
                
                status_icon = "✅" if enabled else "⏸️"
                print(f"    {status_icon} {nickname}: 文章数={article_count}, 最后抓取={fetch_info}")
    except Exception as e:
        print(f"  ❌ 查询失败: {e}")
    
    conn.close()

def check_scheduler_stats(online_db_path: str):
    """检查调度器统计"""
    print("\n" + "=" * 60)
    print("4. 调度器统计 (wechat_mp_scheduler_stats)")
    print("=" * 60)
    
    conn = get_db_conn(online_db_path)
    now = int(datetime.now().timestamp())
    
    try:
        # 检查最近的抓取记录
        cur = conn.execute("""
            SELECT fakeid, nickname, cadence, last_check_at, next_due_at, 
                   fail_count, last_error, total_checks, total_new_articles
            FROM wechat_mp_scheduler_stats
            ORDER BY last_check_at DESC NULLS LAST
            LIMIT 10
        """)
        rows = cur.fetchall()
        
        if not rows:
            print("  ❌ 没有调度器统计记录")
        else:
            print(f"  最近10条调度记录:\n")
            for row in rows:
                nickname = row["nickname"]
                cadence = row["cadence"]
                last_check = row["last_check_at"]
                next_due = row["next_due_at"]
                fail_count = row["fail_count"]
                last_error = row["last_error"] or ""
                total_checks = row["total_checks"]
                total_new = row["total_new_articles"]
                
                if last_check:
                    check_str = datetime.fromtimestamp(last_check).strftime("%m-%d %H:%M")
                else:
                    check_str = "从未"
                
                if next_due:
                    if next_due < now:
                        due_str = "已到期"
                    else:
                        due_str = datetime.fromtimestamp(next_due).strftime("%m-%d %H:%M")
                else:
                    due_str = "未设置"
                
                status_icon = "✅" if fail_count == 0 else "⚠️"
                print(f"    {status_icon} {nickname}: cadence={cadence}, 检查={total_checks}次, 新文章={total_new}, 失败={fail_count}")
                print(f"       最后检查={check_str}, 下次到期={due_str}")
                if last_error:
                    print(f"       最后错误: {last_error[:40]}...")
    except Exception as e:
        print(f"  ❌ 查询失败: {e}")
    
    conn.close()

def check_recent_articles(online_db_path: str):
    """检查最近抓取的文章"""
    print("\n" + "=" * 60)
    print("5. 最近抓取的文章 (wechat_mp_articles)")
    print("=" * 60)
    
    conn = get_db_conn(online_db_path)
    
    try:
        cur = conn.execute("""
            SELECT mp_nickname, title, publish_time, created_at
            FROM wechat_mp_articles
            ORDER BY created_at DESC
            LIMIT 10
        """)
        rows = cur.fetchall()
        
        if not rows:
            print("  ❌ 没有找到任何文章")
        else:
            print(f"  最近10篇文章:\n")
            for row in rows:
                nickname = row["mp_nickname"]
                title = row["title"][:30] + "..." if len(row["title"]) > 30 else row["title"]
                publish_time = row["publish_time"]
                created_at = row["created_at"]
                
                pub_str = datetime.fromtimestamp(publish_time).strftime("%m-%d %H:%M") if publish_time else "未知"
                create_str = datetime.fromtimestamp(created_at).strftime("%m-%d %H:%M") if created_at else "未知"
                
                print(f"    [{nickname}] {title}")
                print(f"       发布={pub_str}, 入库={create_str}")
    except Exception as e:
        print(f"  ❌ 查询失败: {e}")
    
    conn.close()

def main():
    print("\n" + "=" * 60)
    print("微信公众号抓取调度器诊断")
    print("=" * 60)
    print(f"诊断时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    # 数据库路径 - 支持 Docker 容器环境
    if os.path.exists("/app/output"):
        # Docker 容器内
        output_dir = Path("/app/output")
    else:
        # 本地开发环境
        output_dir = project_root / "output"
    
    user_db_path = str(output_dir / "user.db")
    online_db_path = str(output_dir / "online.db")
    
    # 检查数据库文件
    if not os.path.exists(user_db_path):
        print(f"\n❌ 用户数据库不存在: {user_db_path}")
        return
    if not os.path.exists(online_db_path):
        print(f"\n❌ 在线数据库不存在: {online_db_path}")
        return
    
    # 运行检查
    check_scheduler_config()
    check_credentials(user_db_path, online_db_path)
    check_featured_mps(online_db_path)
    check_scheduler_stats(online_db_path)
    check_recent_articles(online_db_path)
    
    print("\n" + "=" * 60)
    print("诊断完成")
    print("=" * 60)
    print("\n常见问题解决方案:")
    print("  1. 凭证过期: 需要重新扫码登录微信公众平台")
    print("  2. 调度器未启用: 设置 HOTNEWS_WECHAT_SCHEDULER_ENABLED=1")
    print("  3. 被限流: 等待一段时间后自动恢复")
    print("  4. 没有精选公众号: 在管理后台添加公众号")

if __name__ == "__main__":
    main()
