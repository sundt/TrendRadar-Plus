"""
RSS Smart Scheduler Service

Implements intelligent scheduling for RSS sources and custom sources:
- Adaptive frequency based on historical update patterns
- Publish time prediction using statistical analysis
- Hit rate tracking (successful fetches with new content / total fetches)
- Automatic cadence adjustment based on actual update frequency

Reference: WeChat smart scheduler (wechat_smart_scheduler.py)
"""

import random
import time
import logging
from collections import Counter
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("uvicorn.error")


# ========== Cadence Configuration ==========

# RSS cadence levels (compatible with existing P0-P6)
RSS_CADENCE_INTERVALS = {
    "P0": 15 * 60,       # 15 minutes - realtime news sources
    "P1": 30 * 60,       # 30 minutes - high frequency
    "P2": 60 * 60,       # 1 hour - daily (default)
    "P3": 2 * 60 * 60,   # 2 hours - daily with fixed time
    "P4": 4 * 60 * 60,   # 4 hours - weekly sources
    "P5": 8 * 60 * 60,   # 8 hours - monthly sources
    "P6": 24 * 60 * 60,  # 24 hours - low frequency
}

# Frequency type to cadence mapping
FREQUENCY_CADENCE_MAP = {
    "realtime": "P0",
    "high": "P1",
    "daily": "P2",
    "daily_fixed": "P3",
    "weekly": "P4",
    "monthly": "P5",
    "low": "P6",
}


def _now_ts() -> int:
    """Get current timestamp."""
    return int(time.time())


# ========== Frequency Classification ==========

def classify_update_frequency(entries: List[Dict[str, Any]]) -> Tuple[str, str]:
    """
    Classify update frequency based on historical entries.
    
    Args:
        entries: List of entries with 'published_at' field, sorted by time DESC
        
    Returns:
        (frequency_type, cadence) tuple
    """
    if len(entries) < 3:
        return ("daily", "P2")  # Not enough data, default to daily
    
    # Calculate intervals between entries (in hours)
    intervals = []
    for i in range(1, min(len(entries), 20)):  # Analyze up to 20 recent entries
        t1 = entries[i-1].get('published_at', 0)
        t2 = entries[i].get('published_at', 0)
        if t1 and t2 and t1 > t2:
            interval_hours = (t1 - t2) / 3600
            intervals.append(interval_hours)
    
    if not intervals:
        return ("daily", "P2")
    
    avg_interval = sum(intervals) / len(intervals)
    
    # Check for multiple posts per day
    daily_counts = Counter()
    for ent in entries[:20]:
        ts = ent.get('published_at', 0)
        if ts:
            try:
                date = datetime.fromtimestamp(ts).date()
                daily_counts[date] += 1
            except Exception:
                pass
    
    max_daily = max(daily_counts.values()) if daily_counts else 1
    
    # Classification logic
    if max_daily >= 5 or avg_interval < 6:
        # Realtime: 5+ posts/day or avg interval < 6 hours
        return ("realtime", "P0")
    elif avg_interval < 18:
        # High frequency: avg interval < 18 hours
        return ("high", "P1")
    elif avg_interval < 36:
        # Normal daily: avg interval < 36 hours
        return ("daily", "P2")
    elif avg_interval < 72:
        # Low frequency daily: avg interval < 3 days
        return ("daily_fixed", "P3")
    elif avg_interval < 168:
        # Weekly: avg interval < 7 days
        return ("weekly", "P4")
    elif avg_interval < 720:
        # Monthly: avg interval < 30 days
        return ("monthly", "P5")
    else:
        # Very low frequency
        return ("low", "P6")


def calculate_publish_time_stats(entries: List[Dict[str, Any]]) -> Tuple[Optional[float], Optional[float]]:
    """
    Calculate average publish hour and standard deviation.
    
    Args:
        entries: List of entries with 'published_at' field
        
    Returns:
        (avg_hour, std_hour) tuple, or (None, None) if not enough data
    """
    if len(entries) < 3:
        return (None, None)
    
    hours = []
    for ent in entries[:30]:  # Use up to 30 entries
        ts = ent.get('published_at', 0)
        if ts:
            try:
                dt = datetime.fromtimestamp(ts)
                # Convert to decimal hour (e.g., 14:30 = 14.5)
                hour = dt.hour + dt.minute / 60
                hours.append(hour)
            except Exception:
                pass
    
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
    1. For sources with regular patterns, check after predicted publish time
    2. For irregular sources, use fixed interval with jitter
    3. Maximum wait is 24 hours (guaranteed daily check)
    
    Args:
        cadence: Cadence level (P0-P6)
        frequency_type: Frequency classification
        avg_publish_hour: Average publish hour (0-23.99)
        std_publish_hour: Standard deviation of publish hour
        last_article_at: Timestamp of last article
        
    Returns:
        Next check timestamp
    """
    now = _now_ts()
    base_interval = RSS_CADENCE_INTERVALS.get(cadence, 60 * 60)
    
    # Strategy 1: Time-based prediction for regular sources
    if frequency_type in ('daily', 'daily_fixed', 'weekly') and avg_publish_hour is not None:
        std = std_publish_hour or 2.0
        
        # Calculate check time = avg publish time + 1 std deviation
        check_hour = avg_publish_hour + std
        
        # Build today's check time
        try:
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
        except Exception:
            pass
    
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
    
    if "429" in msg or "rate" in msg or "频繁" in msg:
        # Rate limited: 6 hour backoff
        return 6 * 3600
    elif "401" in msg or "expired" in msg or "过期" in msg:
        # Auth expired: no backoff
        return 0
    elif "403" in msg or "forbidden" in msg:
        # Forbidden: 12 hour backoff
        return 12 * 3600
    else:
        # Other errors: exponential backoff, max 24 hours
        step = max(0, fail_count - 1)
        return min(24 * 3600, 15 * 60 * (2 ** step))


# ========== Stats Management ==========

def get_source_stats(conn, source_id: str) -> Optional[Dict[str, Any]]:
    """
    Get stats for a specific source.
    
    Args:
        conn: Database connection
        source_id: Source ID
        
    Returns:
        Stats dict or None if not found
    """
    cur = conn.execute(
        "SELECT * FROM source_stats WHERE source_id = ?",
        (source_id,)
    )
    row = cur.fetchone()
    if not row:
        return None
    
    # Convert row to dict
    columns = [desc[0] for desc in cur.description]
    return dict(zip(columns, row))


def get_recent_entries(conn, source_id: str, source_type: str = "rss", limit: int = 30) -> List[Dict[str, Any]]:
    """
    Get recent entries for frequency analysis.
    
    Args:
        conn: Database connection
        source_id: Source ID
        source_type: Source type ('rss' or 'custom')
        limit: Maximum number of entries to return
        
    Returns:
        List of entry dicts with published_at field
    """
    if source_type == "rss":
        # Query from rss_entries table
        cur = conn.execute(
            """
            SELECT id, source_id, title, published_at
            FROM rss_entries
            WHERE source_id = ?
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (source_id, limit)
        )
    else:
        # For custom sources, also query from rss_entries (they share the same table)
        cur = conn.execute(
            """
            SELECT id, source_id, title, published_at
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


def update_source_stats(
    conn,
    source_id: str,
    source_type: str = "rss",
    has_new_entries: bool = False,
    error_message: str = "",
) -> Dict[str, Any]:
    """
    Update source stats after a fetch attempt.
    
    Args:
        conn: Database connection
        source_id: Source ID
        source_type: Source type ('rss' or 'custom')
        has_new_entries: Whether new entries were found
        error_message: Error message if fetch failed
        
    Returns:
        Updated stats dict
    """
    now = _now_ts()
    
    # Get current stats
    stats = get_source_stats(conn, source_id)
    
    if stats:
        # Update existing record
        check_count = (stats.get('check_count') or 0) + 1
        hit_count = (stats.get('hit_count') or 0) + (1 if has_new_entries else 0)
        fail_count = 0 if not error_message else (stats.get('fail_count') or 0) + 1
        
        # Re-analyze frequency every 10 checks or on first hit
        should_reanalyze = (check_count % 10 == 0) or (has_new_entries and check_count <= 3)
        
        if should_reanalyze and not error_message:
            entries = get_recent_entries(conn, source_id, source_type, limit=30)
            freq_type, cadence = classify_update_frequency(entries)
            avg_hour, std_hour = calculate_publish_time_stats(entries)
            
            # Get latest entry time
            last_article_at = entries[0].get('published_at', 0) if entries else 0
        else:
            freq_type = stats.get('frequency_type', 'daily')
            cadence = stats.get('cadence', 'P2')
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
            UPDATE source_stats SET
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
            WHERE source_id = ?
            """,
            (
                freq_type, cadence, avg_hour, std_hour,
                next_due, now,
                last_article_at, last_article_at,
                fail_count, backoff_until,
                error_message if error_message else None,
                check_count, hit_count, now,
                source_id
            )
        )
        
        return {
            "source_id": source_id,
            "source_type": source_type,
            "frequency_type": freq_type,
            "cadence": cadence,
            "next_due_at": next_due,
            "check_count": check_count,
            "hit_count": hit_count,
        }
    else:
        # Create new record
        # Analyze if we have entries
        entries = get_recent_entries(conn, source_id, source_type, limit=30)
        if entries:
            freq_type, cadence = classify_update_frequency(entries)
            avg_hour, std_hour = calculate_publish_time_stats(entries)
            last_article_at = entries[0].get('published_at', 0)
        else:
            freq_type, cadence = "daily", "P2"
            avg_hour, std_hour = None, None
            last_article_at = 0
        
        next_due = calculate_next_check_time(
            cadence, freq_type, avg_hour, std_hour, last_article_at
        )
        
        conn.execute(
            """
            INSERT INTO source_stats (
                source_id, source_type, frequency_type, cadence,
                avg_publish_hour, std_publish_hour,
                next_due_at, last_check_at, last_article_at,
                fail_count, backoff_until, last_error,
                check_count, hit_count,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                source_id, source_type, freq_type, cadence,
                avg_hour, std_hour,
                next_due, now, last_article_at,
                0, 0, None,
                1, 1 if has_new_entries else 0,
                now, now
            )
        )
        
        return {
            "source_id": source_id,
            "source_type": source_type,
            "frequency_type": freq_type,
            "cadence": cadence,
            "next_due_at": next_due,
            "check_count": 1,
            "hit_count": 1 if has_new_entries else 0,
        }


def get_due_sources(conn, now: int, source_type: str = None, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get sources that are due for checking.
    
    Args:
        conn: Database connection
        now: Current timestamp
        source_type: Source type filter ('rss', 'custom', or None for all)
        limit: Maximum number of sources to return
        
    Returns:
        List of due sources
    """
    if source_type:
        cur = conn.execute(
            """
            SELECT source_id, source_type, cadence, next_due_at, backoff_until, fail_count
            FROM source_stats
            WHERE source_type = ? AND next_due_at <= ? AND backoff_until <= ?
            ORDER BY next_due_at ASC
            LIMIT ?
            """,
            (source_type, now, now, limit)
        )
    else:
        cur = conn.execute(
            """
            SELECT source_id, source_type, cadence, next_due_at, backoff_until, fail_count
            FROM source_stats
            WHERE next_due_at <= ? AND backoff_until <= ?
            ORDER BY next_due_at ASC
            LIMIT ?
            """,
            (now, now, limit)
        )
    
    rows = cur.fetchall() or []
    return [{
        "source_id": r[0],
        "source_type": r[1],
        "cadence": r[2],
        "next_due_at": r[3],
        "backoff_until": r[4],
        "fail_count": r[5],
    } for r in rows]


def get_scheduler_stats(conn, source_type: str = None) -> Dict[str, Any]:
    """
    Get overall scheduler statistics.
    
    Args:
        conn: Database connection
        source_type: Source type filter ('rss', 'custom', or None for all)
        
    Returns:
        Statistics dict
    """
    now = _now_ts()
    
    # Build WHERE clause
    type_filter = ""
    params = []
    if source_type:
        type_filter = "WHERE source_type = ?"
        params = [source_type]
    
    # Count total sources with stats
    cur = conn.execute(
        f"SELECT COUNT(*) FROM source_stats {type_filter}",
        params
    )
    total_with_stats = cur.fetchone()[0] or 0
    
    # Count by cadence
    cur = conn.execute(
        f"""
        SELECT cadence, COUNT(*) as cnt
        FROM source_stats
        {type_filter}
        GROUP BY cadence
        """,
        params
    )
    cadence_counts = {r[0]: r[1] for r in cur.fetchall()}
    
    # Count due now
    if source_type:
        cur = conn.execute(
            "SELECT COUNT(*) FROM source_stats WHERE source_type = ? AND next_due_at <= ? AND backoff_until <= ?",
            (source_type, now, now)
        )
    else:
        cur = conn.execute(
            "SELECT COUNT(*) FROM source_stats WHERE next_due_at <= ? AND backoff_until <= ?",
            (now, now)
        )
    due_now = cur.fetchone()[0] or 0
    
    # Count in backoff
    if source_type:
        cur = conn.execute(
            "SELECT COUNT(*) FROM source_stats WHERE source_type = ? AND backoff_until > ?",
            (source_type, now)
        )
    else:
        cur = conn.execute(
            "SELECT COUNT(*) FROM source_stats WHERE backoff_until > ?",
            (now,)
        )
    in_backoff = cur.fetchone()[0] or 0
    
    # Average hit rate
    cur = conn.execute(
        f"""
        SELECT AVG(CAST(hit_count AS FLOAT) / NULLIF(check_count, 0))
        FROM source_stats
        {type_filter}
        AND check_count > 0
        """.replace("WHERE", "WHERE" if not type_filter else type_filter + " AND").replace("AND check_count", "WHERE check_count" if not type_filter else "AND check_count"),
        params
    )
    avg_hit_rate = cur.fetchone()[0] or 0
    
    # Count total sources (from rss_sources and custom_sources)
    total_sources = 0
    if source_type == "rss" or source_type is None:
        cur = conn.execute("SELECT COUNT(*) FROM rss_sources WHERE enabled = 1")
        total_sources += cur.fetchone()[0] or 0
    if source_type == "custom" or source_type is None:
        cur = conn.execute("SELECT COUNT(*) FROM custom_sources WHERE enabled = 1")
        total_sources += cur.fetchone()[0] or 0
    
    return {
        "total_sources": total_sources,
        "total_with_stats": total_with_stats,
        "cadence_distribution": cadence_counts,
        "due_now": due_now,
        "in_backoff": in_backoff,
        "avg_hit_rate": round(avg_hit_rate * 100, 1) if avg_hit_rate else 0.0,
    }
