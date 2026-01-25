# coding=utf-8
"""
Summary Failure Tracker Service

追踪和管理无法总结的网页/订阅源，支持：
1. 文章级别失败记录
2. 域名级别自动黑名单
3. RSS 源失败率统计
"""

import hashlib
import json
import logging
import time
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

# 失败阈值配置
FAILURE_THRESHOLD = 3  # 同一 URL 失败 3 次后标记为不可总结
DOMAIN_BLOCK_THRESHOLD = 10  # 同一域名 10 个 URL 失败后自动拉黑
DOMAIN_BLOCK_RATE_THRESHOLD = 0.7  # 域名失败率超过 70% 时自动拉黑

# 失败原因分类
FAILURE_REASONS = {
    "fetch_timeout": {"name": "请求超时", "retryable": True},
    "fetch_blocked": {"name": "网站反爬/403", "retryable": False},
    "fetch_404": {"name": "页面不存在", "retryable": False},
    "fetch_error": {"name": "请求失败", "retryable": True},
    "content_empty": {"name": "内容为空", "retryable": False},
    "content_short": {"name": "内容过短", "retryable": False},
    "content_paywall": {"name": "付费墙/登录墙", "retryable": False},
    "ai_error": {"name": "AI服务错误", "retryable": True},
    "ai_timeout": {"name": "AI响应超时", "retryable": True},
    "parse_failed": {"name": "内容解析失败", "retryable": False},
    "unknown": {"name": "未知错误", "retryable": True},
}


def init_failure_tables(conn) -> None:
    """初始化失败追踪相关的数据库表"""
    
    # 1. 文章级别失败记录表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summary_failures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            url_hash TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL,
            domain TEXT NOT NULL,
            source_id TEXT,
            source_name TEXT,
            reason TEXT NOT NULL,
            error_detail TEXT,
            fetch_method TEXT,
            attempt_count INTEGER DEFAULT 1,
            first_failed_at INTEGER NOT NULL,
            last_failed_at INTEGER NOT NULL,
            reported_by INTEGER
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_summary_failures_domain ON summary_failures(domain)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_summary_failures_source ON summary_failures(source_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_summary_failures_reason ON summary_failures(reason)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_summary_failures_last ON summary_failures(last_failed_at DESC)")
    
    # 2. 域名级别黑名单表
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summary_blocked_domains (
            domain TEXT PRIMARY KEY,
            failure_count INTEGER DEFAULT 0,
            success_count INTEGER DEFAULT 0,
            sample_urls TEXT DEFAULT '[]',
            primary_reason TEXT,
            source_ids TEXT DEFAULT '[]',
            source_names TEXT DEFAULT '[]',
            blocked_at INTEGER,
            blocked_reason TEXT,
            unblocked_at INTEGER,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_blocked_domains_blocked ON summary_blocked_domains(blocked_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_blocked_domains_count ON summary_blocked_domains(failure_count DESC)")
    
    conn.commit()


def _find_source_for_url(conn, url: str) -> Tuple[Optional[str], Optional[str]]:
    """根据 URL 查找关联的 RSS 源"""
    try:
        cur = conn.execute("""
            SELECT source_id FROM rss_entries WHERE url = ? LIMIT 1
        """, (url,))
        row = cur.fetchone()
        if row:
            source_id = row[0]
            # 获取源名称
            cur2 = conn.execute("SELECT name FROM rss_sources WHERE id = ?", (source_id,))
            row2 = cur2.fetchone()
            return source_id, row2[0] if row2 else None
    except Exception as e:
        logger.debug(f"Failed to find source for URL: {e}")
    return None, None


def record_summary_failure(
    conn,
    url: str,
    reason: str,
    error_detail: str = None,
    fetch_method: str = None,
    user_id: int = None
) -> None:
    """
    记录总结失败
    
    Args:
        conn: 数据库连接
        url: 失败的 URL
        reason: 失败原因代码 (见 FAILURE_REASONS)
        error_detail: 详细错误信息
        fetch_method: 尝试的抓取方式
        user_id: 报告用户 ID
    """
    url_hash = hashlib.md5(url.encode()).hexdigest()
    domain = urlparse(url).netloc
    now = int(time.time())
    
    # 规范化 reason
    if reason not in FAILURE_REASONS:
        reason = "unknown"
    
    # 查找关联的 RSS 源
    source_id, source_name = _find_source_for_url(conn, url)
    
    try:
        # Upsert 失败记录
        conn.execute("""
            INSERT INTO summary_failures (
                url_hash, url, domain, source_id, source_name, 
                reason, error_detail, fetch_method, attempt_count, 
                first_failed_at, last_failed_at, reported_by
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
            ON CONFLICT(url_hash) DO UPDATE SET
                attempt_count = attempt_count + 1,
                last_failed_at = excluded.last_failed_at,
                reason = excluded.reason,
                error_detail = excluded.error_detail,
                fetch_method = COALESCE(excluded.fetch_method, fetch_method)
        """, (url_hash, url[:2000], domain, source_id, source_name, 
              reason, error_detail, fetch_method, now, now, user_id))
        
        # 更新域名统计
        _update_domain_stats(conn, domain, url, source_id, source_name, reason, is_failure=True)
        
        conn.commit()
        logger.info(f"Recorded summary failure: {url[:100]} reason={reason}")
        
    except Exception as e:
        logger.warning(f"Failed to record summary failure: {e}")


def record_summary_success(conn, url: str) -> None:
    """
    记录总结成功（用于更新域名成功率）
    
    Args:
        conn: 数据库连接
        url: 成功的 URL
    """
    domain = urlparse(url).netloc
    
    try:
        _update_domain_stats(conn, domain, url, None, None, None, is_failure=False)
        conn.commit()
    except Exception as e:
        logger.debug(f"Failed to record summary success: {e}")


def _update_domain_stats(
    conn,
    domain: str,
    url: str,
    source_id: Optional[str],
    source_name: Optional[str],
    reason: Optional[str],
    is_failure: bool
) -> None:
    """更新域名级别统计"""
    now = int(time.time())
    
    # 获取现有记录
    cur = conn.execute("""
        SELECT failure_count, success_count, sample_urls, source_ids, source_names, blocked_at
        FROM summary_blocked_domains WHERE domain = ?
    """, (domain,))
    row = cur.fetchone()
    
    if row:
        failure_count = row[0] + (1 if is_failure else 0)
        success_count = row[1] + (0 if is_failure else 1)
        sample_urls = json.loads(row[2] or "[]")
        source_ids = json.loads(row[3] or "[]")
        source_names = json.loads(row[4] or "[]")
        already_blocked = row[5] is not None
        
        # 更新样本 URL（最多保留 5 个）
        if is_failure and url not in sample_urls:
            sample_urls = (sample_urls + [url])[-5:]
        
        # 更新关联的源
        if source_id and source_id not in source_ids:
            source_ids.append(source_id)
        if source_name and source_name not in source_names:
            source_names.append(source_name)
        
        # 检查是否需要自动拉黑
        blocked_at = None
        blocked_reason = None
        if not already_blocked and is_failure:
            total = failure_count + success_count
            if failure_count >= DOMAIN_BLOCK_THRESHOLD:
                blocked_at = now
                blocked_reason = f"失败次数达到 {failure_count} 次"
            elif total >= 5 and (failure_count / total) >= DOMAIN_BLOCK_RATE_THRESHOLD:
                blocked_at = now
                blocked_reason = f"失败率 {failure_count}/{total} ({failure_count/total*100:.0f}%)"
        
        conn.execute("""
            UPDATE summary_blocked_domains SET
                failure_count = ?,
                success_count = ?,
                sample_urls = ?,
                source_ids = ?,
                source_names = ?,
                primary_reason = COALESCE(?, primary_reason),
                blocked_at = COALESCE(?, blocked_at),
                blocked_reason = COALESCE(?, blocked_reason),
                updated_at = ?
            WHERE domain = ?
        """, (failure_count, success_count, json.dumps(sample_urls), 
              json.dumps(source_ids), json.dumps(source_names),
              reason, blocked_at, blocked_reason, now, domain))
        
        if blocked_at:
            logger.warning(f"Domain auto-blocked: {domain} - {blocked_reason}")
    else:
        # 新建记录
        sample_urls = [url] if is_failure else []
        source_ids = [source_id] if source_id else []
        source_names = [source_name] if source_name else []
        
        conn.execute("""
            INSERT INTO summary_blocked_domains (
                domain, failure_count, success_count, sample_urls,
                primary_reason, source_ids, source_names,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (domain, 1 if is_failure else 0, 0 if is_failure else 1,
              json.dumps(sample_urls), reason,
              json.dumps(source_ids), json.dumps(source_names),
              now, now))


def check_summarizable(conn, url: str) -> Tuple[bool, Optional[str], Dict]:
    """
    检查 URL 是否可以总结
    
    Returns:
        (can_summarize, warning_message, extra_info)
        - can_summarize: 是否可以总结
        - warning_message: 警告信息（如果有）
        - extra_info: 额外信息 {failure_count, domain_blocked, reason}
    """
    url_hash = hashlib.md5(url.encode()).hexdigest()
    domain = urlparse(url).netloc
    
    extra_info = {
        "failure_count": 0,
        "domain_blocked": False,
        "reason": None,
        "source_name": None
    }
    
    # 1. 检查 URL 级别
    cur = conn.execute("""
        SELECT attempt_count, reason, last_failed_at, source_name
        FROM summary_failures WHERE url_hash = ?
    """, (url_hash,))
    row = cur.fetchone()
    
    if row:
        extra_info["failure_count"] = row[0]
        extra_info["reason"] = row[1]
        extra_info["source_name"] = row[3]
        
        if row[0] >= FAILURE_THRESHOLD:
            reason_info = FAILURE_REASONS.get(row[1], FAILURE_REASONS["unknown"])
            return False, f"该文章曾多次总结失败 ({reason_info['name']})", extra_info
    
    # 2. 检查域名级别
    cur = conn.execute("""
        SELECT blocked_at, blocked_reason, failure_count, source_names
        FROM summary_blocked_domains WHERE domain = ?
    """, (domain,))
    row = cur.fetchone()
    
    if row:
        if row[0]:  # blocked_at is not None
            extra_info["domain_blocked"] = True
            source_names = json.loads(row[3] or "[]")
            source_hint = f"，来源: {', '.join(source_names[:2])}" if source_names else ""
            return False, f"该网站已被标记为无法总结 ({row[1]}){source_hint}", extra_info
        
        # 有失败记录但未达阈值，返回警告
        if row[2] > 0:
            return True, f"⚠️ 该网站部分文章可能无法总结 (失败 {row[2]} 次)", extra_info
    
    return True, None, extra_info


def check_summarizable_batch(conn, urls: List[str]) -> Dict[str, Dict]:
    """
    批量检查 URL 是否可以总结
    
    Returns:
        {url: {summarizable: bool, warning: str, ...}}
    """
    result = {}
    
    # 收集所有域名
    domains = set()
    url_hashes = {}
    for url in urls:
        domain = urlparse(url).netloc
        domains.add(domain)
        url_hashes[hashlib.md5(url.encode()).hexdigest()] = url
    
    # 批量查询域名黑名单
    domain_info = {}
    if domains:
        placeholders = ",".join("?" * len(domains))
        cur = conn.execute(f"""
            SELECT domain, blocked_at, blocked_reason, failure_count
            FROM summary_blocked_domains WHERE domain IN ({placeholders})
        """, list(domains))
        for row in cur.fetchall():
            domain_info[row[0]] = {
                "blocked": row[1] is not None,
                "reason": row[2],
                "failure_count": row[3]
            }
    
    # 批量查询 URL 失败记录
    url_failures = {}
    if url_hashes:
        placeholders = ",".join("?" * len(url_hashes))
        cur = conn.execute(f"""
            SELECT url_hash, attempt_count, reason
            FROM summary_failures WHERE url_hash IN ({placeholders})
        """, list(url_hashes.keys()))
        for row in cur.fetchall():
            url_failures[row[0]] = {"count": row[1], "reason": row[2]}
    
    # 组装结果
    for url in urls:
        url_hash = hashlib.md5(url.encode()).hexdigest()
        domain = urlparse(url).netloc
        
        info = {
            "summarizable": True,
            "warning": None,
            "failure_count": 0,
            "domain_blocked": False
        }
        
        # 检查 URL 级别
        if url_hash in url_failures:
            failure = url_failures[url_hash]
            info["failure_count"] = failure["count"]
            if failure["count"] >= FAILURE_THRESHOLD:
                reason_info = FAILURE_REASONS.get(failure["reason"], FAILURE_REASONS["unknown"])
                info["summarizable"] = False
                info["warning"] = f"多次失败 ({reason_info['name']})"
        
        # 检查域名级别
        if domain in domain_info:
            d_info = domain_info[domain]
            if d_info["blocked"]:
                info["summarizable"] = False
                info["domain_blocked"] = True
                info["warning"] = f"网站已被标记 ({d_info['reason']})"
            elif d_info["failure_count"] > 0 and info["summarizable"]:
                info["warning"] = f"部分文章可能失败"
        
        result[url] = info
    
    return result


def get_failure_stats(conn) -> Dict:
    """获取失败统计概览"""
    stats = {
        "total_failures": 0,
        "blocked_domains": 0,
        "by_reason": {},
        "top_domains": [],
        "top_sources": []
    }
    
    # 总失败数
    cur = conn.execute("SELECT COUNT(*) FROM summary_failures")
    stats["total_failures"] = cur.fetchone()[0]
    
    # 被拉黑的域名数
    cur = conn.execute("SELECT COUNT(*) FROM summary_blocked_domains WHERE blocked_at IS NOT NULL")
    stats["blocked_domains"] = cur.fetchone()[0]
    
    # 按原因分组
    cur = conn.execute("""
        SELECT reason, COUNT(*) as cnt FROM summary_failures GROUP BY reason ORDER BY cnt DESC
    """)
    for row in cur.fetchall():
        reason_info = FAILURE_REASONS.get(row[0], {"name": row[0]})
        stats["by_reason"][row[0]] = {"name": reason_info["name"], "count": row[1]}
    
    # Top 10 失败域名
    cur = conn.execute("""
        SELECT domain, failure_count, blocked_at, source_names
        FROM summary_blocked_domains ORDER BY failure_count DESC LIMIT 10
    """)
    for row in cur.fetchall():
        stats["top_domains"].append({
            "domain": row[0],
            "failure_count": row[1],
            "blocked": row[2] is not None,
            "sources": json.loads(row[3] or "[]")
        })
    
    # Top 10 失败 RSS 源
    cur = conn.execute("""
        SELECT source_id, source_name, COUNT(*) as cnt
        FROM summary_failures WHERE source_id IS NOT NULL
        GROUP BY source_id ORDER BY cnt DESC LIMIT 10
    """)
    for row in cur.fetchall():
        stats["top_sources"].append({
            "source_id": row[0],
            "source_name": row[1],
            "failure_count": row[2]
        })
    
    return stats


def get_blocked_domains(conn, page: int = 1, limit: int = 20) -> Tuple[List[Dict], int]:
    """获取被拉黑的域名列表"""
    offset = (page - 1) * limit
    
    # 总数
    cur = conn.execute("SELECT COUNT(*) FROM summary_blocked_domains WHERE blocked_at IS NOT NULL")
    total = cur.fetchone()[0]
    
    # 列表
    cur = conn.execute("""
        SELECT domain, failure_count, success_count, sample_urls, 
               primary_reason, source_names, blocked_at, blocked_reason
        FROM summary_blocked_domains 
        WHERE blocked_at IS NOT NULL
        ORDER BY blocked_at DESC
        LIMIT ? OFFSET ?
    """, (limit, offset))
    
    domains = []
    for row in cur.fetchall():
        domains.append({
            "domain": row[0],
            "failure_count": row[1],
            "success_count": row[2],
            "sample_urls": json.loads(row[3] or "[]"),
            "primary_reason": row[4],
            "sources": json.loads(row[5] or "[]"),
            "blocked_at": row[6],
            "blocked_reason": row[7]
        })
    
    return domains, total


def unblock_domain(conn, domain: str) -> bool:
    """解除域名黑名单"""
    now = int(time.time())
    try:
        conn.execute("""
            UPDATE summary_blocked_domains SET
                blocked_at = NULL,
                blocked_reason = NULL,
                unblocked_at = ?,
                updated_at = ?
            WHERE domain = ?
        """, (now, now, domain))
        conn.commit()
        logger.info(f"Domain unblocked: {domain}")
        return True
    except Exception as e:
        logger.warning(f"Failed to unblock domain: {e}")
        return False


def block_domain_manually(conn, domain: str, reason: str = "手动拉黑") -> bool:
    """手动拉黑域名"""
    now = int(time.time())
    try:
        conn.execute("""
            INSERT INTO summary_blocked_domains (domain, blocked_at, blocked_reason, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(domain) DO UPDATE SET
                blocked_at = excluded.blocked_at,
                blocked_reason = excluded.blocked_reason,
                unblocked_at = NULL,
                updated_at = excluded.updated_at
        """, (domain, now, reason, now, now))
        conn.commit()
        logger.info(f"Domain manually blocked: {domain}")
        return True
    except Exception as e:
        logger.warning(f"Failed to block domain: {e}")
        return False
