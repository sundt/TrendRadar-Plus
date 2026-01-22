"""
WeChat MP Smart Scheduler Service

Implements intelligent scheduling for WeChat official account article fetching:
- Adaptive frequency based on historical update patterns
- Publish time prediction using statistical analysis
- Failure backoff with exponential retry
- Multi-user auth rotation

Reference: https://blog.xlab.app/p/d73537b/
"""

import random
import time
import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("uvicorn.error")


# ========== Cadence Configuration ==========

# WeChat-specific cadence levels (W0-W6)
WECHAT_CADENCE_INTERVALS = {
    "W0": 1 * 3600,      # 1 hour - realtime news accounts
    "W1": 2 * 3600,      # 2 hours - high frequency
    "W2": 4 * 3600,      # 4 hours - daily (default)
    "W3": 8 * 3600,      # 8 hours - daily with fixed time
    "W4": 12 * 3600,     # 12 hours - weekly accounts
    "W5": 24 * 3600,     # 24 hours - low frequency
    "W6": 48 * 3600,     # 48 hours - very low frequency
}

# Frequency type to cadence mapping
FREQUENCY_CADENCE_MAP = {
    "realtime": "W0",
    "high": "W1",
    "daily": "W2",
    "daily_fixed": "W3",
    "weekly": "W4",
    "monthly": "W5",
    "low": "W6",
}


def _now_ts() -> int:
    return int(time.time())


# ========== Frequency Classification ==========

def classify_update_frequency(articles: List[Dict[str, Any]]) -> Tuple[str, str]:
    """
    Classify update frequency based on historical articles.
    
    Args:
        articles: List of articles with 'publish_time' field, sorted by time DESC
        
    Returns:
        (frequency_type, cadence) tuple
    """
    if len(articles) < 3:
        return ("daily", "W2")  # Not enough data, default to daily
    
    # Calculate intervals between articles (in hours)
    intervals = []
    for i in range(1, min(len(articles), 20)):  # Analyze up to 20 recent articles
        t1 = articles[i-1].get('publish_time', 0)
        t2 = articles[i].get('publish_time', 0)
        if t1 and t2 and t1 > t2:
            interval_hours = (t1 - t2) / 3600
            intervals.append(interval_hours)
    
    if not intervals:
        return ("daily", "W2")
    
    avg_interval = sum(intervals) / len(intervals)
    
    # Check for multiple posts per day
    daily_counts = Counter()
    for art in articles[:20]:
        ts = art.get('publish_time', 0)
        if ts:
            date = datetime.fromtimestamp(ts).date()
            daily_counts[date] += 1
    
    max_daily = max(daily_counts.values()) if daily_counts else 1
    
    # Classification logic
    if max_daily >= 5 or avg_interval < 6:
        # Realtime: 5+ posts/day or avg interval < 6 hours
        return ("realtime", "W0")
    elif avg_interval < 18:
        # High frequency daily: avg interval < 18 hours
        return ("high", "W1")
    elif avg_interval < 36:
        # Normal daily: avg interval < 36 hours
        return ("daily", "W2")
    elif avg_interval < 72:
        # Low frequency daily: avg interval < 3 days
        return ("daily_fixed", "W3")
    elif avg_interval < 168:
        # Weekly: avg interval < 7 days
        return ("weekly", "W4")
    elif avg_interval < 720:
        # Monthly: avg interval < 30 days
        return ("monthly", "W5")
    else:
        # Very low frequency
        return ("low", "W6")


def calculate_publish_time_stats(articles: List[Dict[str, Any]]) -> Tuple[Optional[float], Optional[float]]:
    """
    Calculate average publish hour and standard deviation.
    
    Args:
        articles: List of articles with 'publish_time' field
        
    Returns:
        (avg_hour, std_hour) tuple, or (None, None) if not enough data
    """
    if len(articles) < 3:
        return (None, None)
    
    hours = []
    for art in articles[:30]:  # Use up to 30 articles
        ts = art.get('publish_time', 0)
        if ts:
            dt = datetime.fromtimestamp(ts)
            # Convert to decimal hour (e.g., 14:30 = 14.5)
            hour = dt.hour + dt.minute / 60
            hours.append(hour)
    
    if len(hours) < 3:
        return (None, None)
    
    avg_hour = sum(hours) / len(hours)
    
    # Calculate standard deviation
    variance = sum((h - avg_hour) ** 2 for h in hours) / len(hours)
    std_hour = variance ** 0.5
    
    # Clamp std to reasonable range (1-6 hours)
    std_hour = max(1.0, min(6.0, std_hour))
    
    return (round(avg_hour, 2), round(std_hour, 2))


# ========== Next Check Time Calculation ==========

def calculate_next_check_time(
    cadence: str,
    frequency_type: str = "daily",
    avg_publish_hour: Optional[float] = None,
    std_publish_hour: Optional[float] = None,
    last_article_at: int = 0,
) -> int:
    """
    Calculate next check time based on frequency and publish patterns.
    
    Strategy:
    1. For accounts with regular patterns, check after predicted publish time
    2. For irregular accounts, use fixed interval with jitter
    3. Maximum wait is 24 hours (guaranteed daily check)
    
    Args:
        cadence: Cadence level (W0-W6)
        frequency_type: Frequency classification
        avg_publish_hour: Average publish hour (0-23.99)
        std_publish_hour: Standard deviation of publish hour
        last_article_at: Timestamp of last article
        
    Returns:
        Next check timestamp
    """
    now = _now_ts()
    base_interval = WECHAT_CADENCE_INTERVALS.get(cadence, 4 * 3600)
    
    # Strategy 1: Time-based prediction for regular accounts
    if frequency_type in ('daily', 'daily_fixed', 'weekly') and avg_publish_hour is not None:
        std = std_publish_hour or 2.0
        
        # Calculate check time = avg publish time + 1 std deviation
        check_hour = avg_publish_hour + std
        
        # Build today's check time
        today = datetime.now().replace(
            hour=int(check_hour) % 24,
            minute=int((check_hour % 1) * 60),
            second=0,
            microsecond=0
        )
        
        if today.timestamp() < now:
            # Today's time has passed, check tomorrow
            today += timedelta(days=1)
        
        predicted_time = int(today.timestamp())
        
        # But don't wait longer than 2x base interval
        max_wait = int(now + base_interval * 2)
        return min(predicted_time, max_wait)
    
    # Strategy 2: Fixed interval with jitter
    jitter = random.uniform(0.85, 1.15)
    next_time = int(now + base_interval * jitter)
    
    # Guaranteed: max 24 hours wait
    max_time = int(now + 24 * 3600)
    return min(next_time, max_time)


# ========== Failure Backoff ==========

def calculate_backoff(fail_count: int, error_message: str = "") -> int:
    """
    Calculate backoff time after failure.
    
    Args:
        fail_count: Number of consecutive failures
        error_message: Error message for classification
        
    Returns:
        Backoff duration in seconds
    """
    msg = (error_message or "").lower()
    
    if "rate" in msg or "429" in msg or "频繁" in msg:
        # Rate limited: 6 hour backoff
        return 6 * 3600
    elif "expired" in msg or "401" in msg or "过期" in msg:
        # Auth expired: no backoff, wait for user to re-auth
        return 0
    elif "403" in msg or "forbidden" in msg:
        # Forbidden: 12 hour backoff
        return 12 * 3600
    else:
        # Other errors: exponential backoff, max 24 hours
        step = max(0, fail_count - 1)
        return min(24 * 3600, 15 * 60 * (2 ** step))


# ========== Stats Management ==========

def get_mp_stats(conn, fakeid: str) -> Optional[Dict[str, Any]]:
    """Get stats for a specific MP account."""
    cur = conn.execute(
        "SELECT * FROM wechat_mp_stats WHERE fakeid = ?",
        (fakeid,)
    )
    row = cur.fetchone()
    if not row:
        return None
    
    # Convert row to dict
    columns = [desc[0] for desc in cur.description]
    return dict(zip(columns, row))


def get_recent_articles(conn, fakeid: str, limit: int = 30) -> List[Dict[str, Any]]:
    """Get recent articles for frequency analysis."""
    cur = conn.execute(
        """
        SELECT id, fakeid, title, publish_time, publish_hour
        FROM wechat_mp_articles
        WHERE fakeid = ?
        ORDER BY publish_time DESC
        LIMIT ?
        """,
        (fakeid, limit)
    )
    rows = cur.fetchall() or []
    columns = [desc[0] for desc in cur.description]
    return [dict(zip(columns, row)) for row in rows]


def update_mp_stats(
    conn,
    fakeid: str,
    nickname: str = "",
    has_new_articles: bool = False,
    error_message: str = "",
) -> Dict[str, Any]:
    """
    Update MP stats after a fetch attempt.
    
    Args:
        conn: Database connection
        fakeid: MP account ID
        nickname: MP account name
        has_new_articles: Whether new articles were found
        error_message: Error message if fetch failed
        
    Returns:
        Updated stats dict
    """
    now = _now_ts()
    
    # Get current stats
    stats = get_mp_stats(conn, fakeid)
    
    if stats:
        # Update existing record
        check_count = (stats.get('check_count') or 0) + 1
        hit_count = (stats.get('hit_count') or 0) + (1 if has_new_articles else 0)
        fail_count = 0 if not error_message else (stats.get('fail_count') or 0) + 1
        
        # Re-analyze frequency every 10 checks or on first hit
        should_reanalyze = (check_count % 10 == 0) or (has_new_articles and check_count <= 3)
        
        if should_reanalyze and not error_message:
            articles = get_recent_articles(conn, fakeid, limit=30)
            freq_type, cadence = classify_update_frequency(articles)
            avg_hour, std_hour = calculate_publish_time_stats(articles)
            
            # Get latest article time
            last_article_at = articles[0].get('publish_time', 0) if articles else 0
        else:
            freq_type = stats.get('frequency_type', 'daily')
            cadence = stats.get('cadence', 'W2')
            avg_hour = stats.get('avg_publish_hour')
            std_hour = stats.get('std_publish_hour')
            last_article_at = stats.get('last_article_at', 0)
        
        # Calculate next check time
        if error_message:
            backoff = calculate_backoff(fail_count, error_message)
            next_due = now + backoff if backoff > 0 else now + 3600  # 1 hour default
            backoff_until = now + backoff
        else:
            next_due = calculate_next_check_time(
                cadence, freq_type, avg_hour, std_hour, last_article_at
            )
            backoff_until = 0
        
        conn.execute(
            """
            UPDATE wechat_mp_stats SET
                nickname = COALESCE(?, nickname),
                frequency_type = ?,
                cadence = ?,
                avg_publish_hour = ?,
                std_publish_hour = ?,
                next_due_at = ?,
                last_check_at = ?,
                last_article_at = CASE WHEN ? > last_article_at THEN ? ELSE last_article_at END,
                fail_count = ?,
                backoff_until = ?,
                last_error = ?,
                check_count = ?,
                hit_count = ?,
                updated_at = ?
            WHERE fakeid = ?
            """,
            (
                nickname or None,
                freq_type, cadence, avg_hour, std_hour,
                next_due, now,
                last_article_at, last_article_at,
                fail_count, backoff_until,
                error_message if error_message else None,
                check_count, hit_count, now,
                fakeid
            )
        )
        
        return {
            "fakeid": fakeid,
            "frequency_type": freq_type,
            "cadence": cadence,
            "next_due_at": next_due,
            "check_count": check_count,
            "hit_count": hit_count,
        }
    else:
        # Create new record
        # Analyze if we have articles
        articles = get_recent_articles(conn, fakeid, limit=30)
        if articles:
            freq_type, cadence = classify_update_frequency(articles)
            avg_hour, std_hour = calculate_publish_time_stats(articles)
            last_article_at = articles[0].get('publish_time', 0)
            total_articles = len(articles)
        else:
            freq_type, cadence = "daily", "W2"
            avg_hour, std_hour = None, None
            last_article_at = 0
            total_articles = 0
        
        next_due = calculate_next_check_time(
            cadence, freq_type, avg_hour, std_hour, last_article_at
        )
        
        conn.execute(
            """
            INSERT INTO wechat_mp_stats (
                fakeid, nickname, frequency_type, cadence,
                avg_publish_hour, std_publish_hour,
                next_due_at, last_check_at, last_article_at,
                fail_count, backoff_until, last_error,
                total_articles, check_count, hit_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                fakeid, nickname, freq_type, cadence,
                avg_hour, std_hour,
                next_due, now, last_article_at,
                0, 0, None,
                total_articles, 1, 1 if has_new_articles else 0,
                now, now
            )
        )
        
        return {
            "fakeid": fakeid,
            "frequency_type": freq_type,
            "cadence": cadence,
            "next_due_at": next_due,
            "check_count": 1,
            "hit_count": 1 if has_new_articles else 0,
        }


def get_due_mps(conn, user_conn, now: int, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get MP accounts that are due for checking.
    
    Args:
        conn: Online database connection
        user_conn: User database connection
        now: Current timestamp
        limit: Maximum number of accounts to return
        
    Returns:
        List of MP accounts to check
    """
    # Get all subscribed fakeids
    sub_cur = user_conn.execute(
        "SELECT DISTINCT fakeid, nickname FROM wechat_mp_subscriptions"
    )
    subscriptions = {r[0]: r[1] for r in sub_cur.fetchall()}
    
    if not subscriptions:
        return []
    
    # Get stats for subscribed accounts
    placeholders = ",".join(["?"] * len(subscriptions))
    fakeids = list(subscriptions.keys())
    
    cur = conn.execute(
        f"""
        SELECT fakeid, nickname, cadence, next_due_at, backoff_until, fail_count
        FROM wechat_mp_stats
        WHERE fakeid IN ({placeholders})
        """,
        fakeids
    )
    stats_map = {r[0]: {
        "fakeid": r[0],
        "nickname": r[1],
        "cadence": r[2],
        "next_due_at": r[3],
        "backoff_until": r[4],
        "fail_count": r[5],
    } for r in cur.fetchall()}
    
    # Build result list
    due_mps = []
    for fakeid, nickname in subscriptions.items():
        stats = stats_map.get(fakeid)
        
        if stats:
            # Check if due
            next_due = stats.get('next_due_at', 0)
            backoff_until = stats.get('backoff_until', 0)
            
            if next_due <= now and backoff_until <= now:
                due_mps.append({
                    "fakeid": fakeid,
                    "nickname": stats.get('nickname') or nickname,
                    "cadence": stats.get('cadence', 'W2'),
                    "next_due_at": next_due,
                    "fail_count": stats.get('fail_count', 0),
                })
        else:
            # No stats yet, always due
            due_mps.append({
                "fakeid": fakeid,
                "nickname": nickname,
                "cadence": "W2",
                "next_due_at": 0,
                "fail_count": 0,
            })
    
    # Sort by next_due_at (oldest first) and limit
    due_mps.sort(key=lambda x: x.get('next_due_at', 0))
    return due_mps[:limit]


def get_scheduler_stats(conn, user_conn) -> Dict[str, Any]:
    """Get overall scheduler statistics."""
    now = _now_ts()
    
    # Count subscriptions
    sub_cur = user_conn.execute("SELECT COUNT(DISTINCT fakeid) FROM wechat_mp_subscriptions")
    total_subscribed = sub_cur.fetchone()[0] or 0
    
    # Count by cadence
    cur = conn.execute(
        """
        SELECT cadence, COUNT(*) as cnt
        FROM wechat_mp_stats
        GROUP BY cadence
        """
    )
    cadence_counts = {r[0]: r[1] for r in cur.fetchall()}
    
    # Count due now
    cur = conn.execute(
        "SELECT COUNT(*) FROM wechat_mp_stats WHERE next_due_at <= ? AND backoff_until <= ?",
        (now, now)
    )
    due_now = cur.fetchone()[0] or 0
    
    # Count in backoff
    cur = conn.execute(
        "SELECT COUNT(*) FROM wechat_mp_stats WHERE backoff_until > ?",
        (now,)
    )
    in_backoff = cur.fetchone()[0] or 0
    
    # Average hit rate
    cur = conn.execute(
        "SELECT AVG(CAST(hit_count AS FLOAT) / NULLIF(check_count, 0)) FROM wechat_mp_stats WHERE check_count > 0"
    )
    avg_hit_rate = cur.fetchone()[0] or 0
    
    return {
        "total_subscribed": total_subscribed,
        "total_with_stats": sum(cadence_counts.values()),
        "cadence_distribution": cadence_counts,
        "due_now": due_now,
        "in_backoff": in_backoff,
        "avg_hit_rate": round(avg_hit_rate * 100, 1),
    }
