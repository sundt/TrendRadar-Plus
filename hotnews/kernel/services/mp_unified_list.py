"""
Unified MP List Module (统一公众号列表模块)

Provides functions to get a unified list of all WeChat official accounts
that need to be fetched, combining:
- Featured MPs (精选公众号) from featured_wechat_mps table
- User subscriptions (用户订阅) from wechat_mp_subscriptions table

The list is deduplicated by fakeid, with featured MPs taking priority
for nickname when the same fakeid exists in both sources.
"""

import logging
from typing import Dict, List, Set

logger = logging.getLogger("uvicorn.error")


def get_all_mp_fakeids(online_conn, user_conn) -> List[Dict[str, str]]:
    """
    Get all MP accounts that need to be fetched (featured + user subscriptions, deduplicated).
    
    Args:
        online_conn: Online database connection (for featured_wechat_mps)
        user_conn: User database connection (for wechat_mp_subscriptions)
        
    Returns:
        Deduplicated list of MP accounts:
        [{"fakeid": str, "nickname": str, "source": str}, ...]
        
        source: "featured" or "subscription"
        
    Note:
        - Featured MPs have priority: if a fakeid exists in both featured and
          subscriptions, the nickname from featured_wechat_mps is used.
        - Only enabled featured MPs are included.
    """
    result: Dict[str, Dict[str, str]] = {}
    
    # 1. Get featured MPs (higher priority)
    try:
        cur = online_conn.execute(
            """
            SELECT fakeid, nickname 
            FROM featured_wechat_mps 
            WHERE enabled = 1
            """
        )
        for row in cur.fetchall() or []:
            fakeid, nickname = row[0], row[1]
            if fakeid:
                result[fakeid] = {
                    "fakeid": fakeid,
                    "nickname": nickname or "",
                    "source": "featured"
                }
    except Exception as e:
        logger.warning(f"Failed to load featured MPs: {e}")
    
    # 2. Get user subscriptions (lower priority - skip if already in featured)
    try:
        cur = user_conn.execute(
            """
            SELECT DISTINCT fakeid, nickname 
            FROM wechat_mp_subscriptions
            """
        )
        for row in cur.fetchall() or []:
            fakeid, nickname = row[0], row[1]
            if fakeid and fakeid not in result:
                result[fakeid] = {
                    "fakeid": fakeid,
                    "nickname": nickname or "",
                    "source": "subscription"
                }
    except Exception as e:
        logger.warning(f"Failed to load user subscriptions: {e}")
    
    return list(result.values())


def get_featured_fakeids(online_conn) -> Set[str]:
    """
    Get all enabled featured MP fakeids.
    
    Args:
        online_conn: Online database connection
        
    Returns:
        Set of fakeid strings
    """
    try:
        cur = online_conn.execute(
            "SELECT fakeid FROM featured_wechat_mps WHERE enabled = 1"
        )
        return {row[0] for row in cur.fetchall() or [] if row[0]}
    except Exception as e:
        logger.warning(f"Failed to load featured fakeids: {e}")
        return set()


def get_subscription_fakeids(user_conn) -> Set[str]:
    """
    Get all user-subscribed MP fakeids.
    
    Args:
        user_conn: User database connection
        
    Returns:
        Set of fakeid strings
    """
    try:
        cur = user_conn.execute(
            "SELECT DISTINCT fakeid FROM wechat_mp_subscriptions"
        )
        return {row[0] for row in cur.fetchall() or [] if row[0]}
    except Exception as e:
        logger.warning(f"Failed to load subscription fakeids: {e}")
        return set()


def get_mp_info(online_conn, user_conn, fakeid: str) -> Dict[str, str]:
    """
    Get info for a specific MP account.
    
    Args:
        online_conn: Online database connection
        user_conn: User database connection
        fakeid: MP account fakeid
        
    Returns:
        {"fakeid": str, "nickname": str, "source": str} or empty dict if not found
    """
    # Check featured first
    try:
        cur = online_conn.execute(
            "SELECT nickname FROM featured_wechat_mps WHERE fakeid = ? AND enabled = 1",
            (fakeid,)
        )
        row = cur.fetchone()
        if row:
            return {
                "fakeid": fakeid,
                "nickname": row[0] or "",
                "source": "featured"
            }
    except Exception as e:
        logger.warning(f"Failed to check featured MP {fakeid}: {e}")
    
    # Check subscriptions
    try:
        cur = user_conn.execute(
            "SELECT nickname FROM wechat_mp_subscriptions WHERE fakeid = ? LIMIT 1",
            (fakeid,)
        )
        row = cur.fetchone()
        if row:
            return {
                "fakeid": fakeid,
                "nickname": row[0] or "",
                "source": "subscription"
            }
    except Exception as e:
        logger.warning(f"Failed to check subscription {fakeid}: {e}")
    
    return {}


def get_unified_mp_count(online_conn, user_conn) -> Dict[str, int]:
    """
    Get count statistics for unified MP list.
    
    Returns:
        {
            "total": int,           # Total unique fakeids
            "featured": int,        # Featured MPs count
            "subscription_only": int,  # Subscription-only MPs count
            "overlap": int,         # MPs in both featured and subscriptions
        }
    """
    featured = get_featured_fakeids(online_conn)
    subscriptions = get_subscription_fakeids(user_conn)
    
    overlap = featured & subscriptions
    subscription_only = subscriptions - featured
    
    return {
        "total": len(featured | subscriptions),
        "featured": len(featured),
        "subscription_only": len(subscription_only),
        "overlap": len(overlap),
    }
