"""
WeChat MP Smart Scheduler Service

Implements intelligent scheduling for WeChat official account article fetching:
- Adaptive frequency based on historical update patterns
- Publish time prediction using statistical analysis
- Failure backoff with exponential retry
- Multi-user auth rotation

This module now wraps rss_smart_scheduler.py functions for unified scheduling,
while preserving WeChat-specific logic (frequency analysis, publish time stats).

Reference: https://blog.xlab.app/p/d73537b/
"""

import random
import time
import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

# Import unified scheduler functions
from hotnews.kernel.services.rss_smart_scheduler import (
    get_source_stats,
    update_source_stats,
    get_due_sources,
    get_scheduler_stats as get_unified_scheduler_stats,
    classify_update_frequency as unified_classify_frequency,
    calculate_publish_time_stats as unified_publish_time_stats,
    calculate_next_check_time as unified_next_check_time,
    calculate_backoff as unified_backoff,
)

logger = logging.getLogger("uvicorn.error")


# ========== Constants ==========

MP_SOURCE_TYPE = "mp"  # Source type for WeChat MP in unified tables


# ========== Cadence Configuration ==========

# WeChat-specific cadence levels (W0-W6) - kept for backward compatibility
# Note: New code should use P0-P6 from rss_smart_scheduler
WECHAT_CADENCE_INTERVALS = {
    "W0": 1 * 3600,      # 1 hour - realtime news accounts
    "W1": 2 * 3600,      # 2 hours - high frequency
    "W2": 4 * 3600,      # 4 hours - daily (default)
    "W3": 8 * 3600,      # 8 hours - daily with fixed time
    "W4": 12 * 3600,     # 12 hours - weekly accounts
    "W5": 24 * 3600,     # 24 hours - low frequency
    "W6": 48 * 3600,     # 48 hours - very low frequency
}

# Mapping from W-cadence to P-cadence (for migration)
W_TO_P_CADENCE = {
    "W0": "P0",
    "W1": "P1",
    "W2": "P2",
    "W3": "P3",
    "W4": "P4",
    "W5": "P5",
    "W6": "P6",
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


def _generate_mp_source_id(fakeid: str) -> str:
    """Generate source_id for MP account."""
    return f"mp-{fakeid}"


def _extract_fakeid(source_id: str) -> str:
    """Extract fakeid from source_id."""
    if source_id.startswith("mp-"):
        return source_id[3:]
    return source_id


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


# ========== Stats Management (Wrapper Functions) ==========

def get_mp_stats(conn, fakeid: str) -> Optional[Dict[str, Any]]:
    """
    Get stats for a specific MP account.
    
    Wraps get_source_stats() from rss_smart_scheduler.
    """
    source_id = _generate_mp_source_id(fakeid)
    stats = get_source_stats(conn, source_id)
    
    if not stats:
        return None
    
    # Convert to MP-style dict for backward compatibility
    return {
        "fakeid": fakeid,
        "nickname": "",  # Not stored in source_stats
        "frequency_type": stats.get("frequency_type", "daily"),
        "cadence": stats.get("cadence", "P2"),
        "avg_publish_hour": stats.get("avg_publish_hour"),
        "std_publish_hour": stats.get("std_publish_hour"),
        "next_due_at": stats.get("next_due_at", 0),
        "last_check_at": stats.get("last_check_at", 0),
        "last_article_at": stats.get("last_article_at", 0),
        "fail_count": stats.get("fail_count", 0),
        "backoff_until": stats.get("backoff_until", 0),
        "last_error": stats.get("last_error"),
        "check_count": stats.get("check_count", 0),
        "hit_count": stats.get("hit_count", 0),
    }


def get_recent_articles(conn, fakeid: str, limit: int = 30) -> List[Dict[str, Any]]:
    """Get recent articles for frequency analysis."""
    source_id = f"mp-{fakeid}"
    cur = conn.execute(
        """
        SELECT id, title, published_at as publish_time, 
               (published_at / 3600) % 24 as publish_hour
        FROM rss_entries
        WHERE source_id = ?
        ORDER BY published_at DESC
        LIMIT ?
        """,
        (source_id, limit)
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
    
    Wraps update_source_stats() from rss_smart_scheduler.
    
    Args:
        conn: Database connection
        fakeid: MP account ID
        nickname: MP account name (not used in unified table)
        has_new_articles: Whether new articles were found
        error_message: Error message if fetch failed
        
    Returns:
        Updated stats dict
    """
    source_id = _generate_mp_source_id(fakeid)
    
    # Call unified update function
    result = update_source_stats(
        conn,
        source_id=source_id,
        source_type=MP_SOURCE_TYPE,
        has_new_entries=has_new_articles,
        error_message=error_message,
    )
    
    # Convert to MP-style response for backward compatibility
    return {
        "fakeid": fakeid,
        "frequency_type": result.get("frequency_type", "daily"),
        "cadence": result.get("cadence", "P2"),
        "next_due_at": result.get("next_due_at", 0),
        "check_count": result.get("check_count", 0),
        "hit_count": result.get("hit_count", 0),
    }


def get_due_mps(conn, user_conn, now: int, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get MP accounts that are due for checking.
    
    Wraps get_due_sources() from rss_smart_scheduler.
    
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
    
    # Get all featured fakeids
    featured_cur = conn.execute(
        "SELECT fakeid, nickname FROM featured_wechat_mps WHERE enabled = 1"
    )
    featured = {r[0]: r[1] for r in featured_cur.fetchall()}
    
    # Merge: featured takes priority for nickname
    all_mps = {**subscriptions, **featured}
    
    if not all_mps:
        return []
    
    # Get due sources from unified table
    due_sources = get_due_sources(conn, now, source_type=MP_SOURCE_TYPE, limit=limit * 2)
    
    # Filter to only MPs in our list and convert format
    due_mps = []
    seen_fakeids = set()
    
    for src in due_sources:
        source_id = src.get("source_id", "")
        fakeid = _extract_fakeid(source_id)
        
        if fakeid in all_mps and fakeid not in seen_fakeids:
            seen_fakeids.add(fakeid)
            due_mps.append({
                "fakeid": fakeid,
                "nickname": all_mps.get(fakeid, ""),
                "cadence": src.get("cadence", "P2"),
                "next_due_at": src.get("next_due_at", 0),
                "fail_count": src.get("fail_count", 0),
            })
    
    # Add MPs that don't have stats yet (always due)
    for fakeid, nickname in all_mps.items():
        if fakeid not in seen_fakeids:
            due_mps.append({
                "fakeid": fakeid,
                "nickname": nickname,
                "cadence": "P2",
                "next_due_at": 0,
                "fail_count": 0,
            })
    
    # Sort by next_due_at (oldest first) and limit
    due_mps.sort(key=lambda x: x.get('next_due_at', 0))
    return due_mps[:limit]


def get_scheduler_stats(conn, user_conn) -> Dict[str, Any]:
    """
    Get overall scheduler statistics for MP accounts.
    
    Wraps get_scheduler_stats() from rss_smart_scheduler.
    """
    now = _now_ts()
    
    # Count subscriptions
    sub_cur = user_conn.execute("SELECT COUNT(DISTINCT fakeid) FROM wechat_mp_subscriptions")
    total_subscribed = sub_cur.fetchone()[0] or 0
    
    # Get unified stats for MP type
    unified_stats = get_unified_scheduler_stats(conn, source_type=MP_SOURCE_TYPE)
    
    return {
        "total_subscribed": total_subscribed,
        "total_with_stats": unified_stats.get("total_with_stats", 0),
        "cadence_distribution": unified_stats.get("cadence_distribution", {}),
        "due_now": unified_stats.get("due_now", 0),
        "in_backoff": unified_stats.get("in_backoff", 0),
        "avg_hit_rate": unified_stats.get("avg_hit_rate", 0.0),
    }
