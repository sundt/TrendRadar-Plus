"""
WeChat MP (公众号) Article Scheduler

Handles scheduled fetching of articles from subscribed official accounts:
- Smart scheduling based on historical update patterns
- Adaptive frequency classification (W0-W6 cadence levels)
- Publish time prediction using statistical analysis
- Multi-user auth rotation with rate limiting
- Failure backoff with exponential retry
- Unified scheduling for featured MPs and user subscriptions

Reference: https://blog.xlab.app/p/d73537b/
"""

import asyncio
import hashlib
import logging
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

logger = logging.getLogger("uvicorn.error")

# Module-level state
_wechat_scheduler_task: Optional[asyncio.Task] = None
_wechat_scheduler_running: bool = False
_project_root: Optional[Path] = None

# Rate limiting state per user
_user_rate_limit: Dict[int, float] = {}  # user_id -> last_request_time
_user_cooldown: Dict[int, float] = {}  # user_id -> cooldown_until (for rate limited users)

# Configuration
CHECK_INTERVAL_SECONDS = int(os.environ.get("HOTNEWS_MP_CHECK_INTERVAL", "60"))
USER_COOLDOWN_SECONDS = 300  # 5 minutes cooldown after rate limit error
MIN_REQUEST_INTERVAL = 2.0  # Minimum seconds between requests
MAX_MPS_PER_CYCLE = int(os.environ.get("HOTNEWS_MP_MAX_PER_CYCLE", "20"))


def _now_ts() -> int:
    return int(time.time())


def _get_user_db_conn():
    """Get user database connection."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(_project_root)


def _get_online_db_conn():
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(_project_root)


def generate_dedup_key(url: str) -> str:
    """Generate dedup_key from article URL."""
    return hashlib.md5(url.encode("utf-8")).hexdigest()


def generate_source_id(fakeid: str) -> str:
    """Generate source_id for rss_entry_tags."""
    return f"wechat-{fakeid}"


def _is_scheduler_enabled() -> bool:
    """Check if WeChat scheduler is enabled via environment variable."""
    enabled = os.environ.get("HOTNEWS_WECHAT_SCHEDULER_ENABLED", "0").strip().lower()
    return enabled in {"1", "true", "yes"}


def _is_unified_scheduler_enabled() -> bool:
    """Check if unified MP scheduler is enabled (default: enabled)."""
    enabled = os.environ.get("HOTNEWS_UNIFIED_MP_SCHEDULER", "1").strip().lower()
    return enabled in {"1", "true", "yes"}


def _get_valid_auth_users(user_conn) -> List[Dict[str, Any]]:
    """
    Get all users with valid (non-expired) WeChat authentication.
    
    Returns list of dicts with user_id, cookie, token.
    """
    from hotnews.kernel.services.wechat_crypto import decrypt_cookie
    
    now = _now_ts()
    
    cur = user_conn.execute(
        """
        SELECT user_id, cookie_encrypted, token, expires_at
        FROM wechat_mp_auth
        WHERE status = 'valid'
        """
    )
    rows = cur.fetchall() or []
    
    valid_users = []
    for row in rows:
        user_id = row[0]
        cookie_encrypted = row[1]
        token = row[2]
        expires_at = row[3]
        
        # Skip if expired
        if expires_at and expires_at < now:
            logger.debug(f"Skipping user {user_id}: auth expired")
            continue
        
        # Skip if in cooldown
        if user_id in _user_cooldown and _user_cooldown[user_id] > now:
            logger.debug(f"Skipping user {user_id}: in cooldown")
            continue
        
        # Decrypt cookie
        cookie = decrypt_cookie(cookie_encrypted)
        if not cookie:
            logger.warning(f"Failed to decrypt cookie for user {user_id}")
            continue
        
        valid_users.append({
            "user_id": user_id,
            "cookie": cookie,
            "token": token,
        })
    
    return valid_users


def _get_user_subscriptions(user_conn, user_id: int) -> List[Dict[str, str]]:
    """Get all subscriptions for a user."""
    cur = user_conn.execute(
        "SELECT fakeid, nickname FROM wechat_mp_subscriptions WHERE user_id = ?",
        (user_id,)
    )
    rows = cur.fetchall() or []
    return [{"fakeid": r[0], "nickname": r[1]} for r in rows]


def _store_articles(
    online_conn,
    fakeid: str,
    mp_nickname: str,
    articles: List[Any],
) -> int:
    """
    Store articles in the cache table.
    
    Returns number of new articles stored.
    """
    # 使用统一写入模块
    from hotnews.kernel.services.mp_article_writer import save_mp_articles
    
    # 转换文章格式
    articles_to_save = []
    for art in articles:
        if not art.url:
            continue
        articles_to_save.append({
            "title": art.title,
            "url": art.url,
            "digest": art.digest or "",
            "cover_url": art.cover_url or "",
            "publish_time": art.publish_time or _now_ts(),
        })
    
    if not articles_to_save:
        return 0
    
    result = save_mp_articles(online_conn, fakeid, mp_nickname, articles_to_save)
    return result["inserted"]


def _tag_new_articles(online_conn, fakeid: str, articles: List[Any]) -> None:
    """
    Queue new articles for AI tagging.
    
    This integrates with the existing AI classification system by
    inserting entries that will be picked up by the AI labeling loop.
    """
    # For now, we just ensure the articles are stored.
    # The AI labeling system (_mb_ai_loop in rss_scheduler.py) will
    # pick them up if we add them to a queue or they match the query.
    #
    # Since wechat articles are in a separate table, we need to either:
    # 1. Add them to rss_entries with a special source_id prefix
    # 2. Modify the AI loop to also check wechat_mp_articles
    # 3. Call the AI classification directly here
    #
    # For MVP, we'll skip AI tagging and add it later.
    pass


async def _fetch_mp_articles(
    user_id: int,
    cookie: str,
    token: str,
    fakeid: str,
    mp_nickname: str,
    online_conn,
    user_conn,
) -> Dict[str, Any]:
    """
    Fetch articles for a single official account.
    
    Returns dict with:
        - new_count: number of new articles fetched
        - error_message: error message if failed, empty string if success
    """
    from hotnews.kernel.providers.wechat_provider import (
        WeChatMPProvider,
        WeChatErrorCode,
    )
    
    # Rate limiting per user
    now = time.time()
    last_request = _user_rate_limit.get(user_id, 0)
    if now - last_request < MIN_REQUEST_INTERVAL:
        await asyncio.sleep(MIN_REQUEST_INTERVAL - (now - last_request))
    
    _user_rate_limit[user_id] = time.time()
    
    # Create provider and fetch
    provider = WeChatMPProvider(cookie, token)
    
    try:
        result = await asyncio.to_thread(provider.get_articles, fakeid, 20)
    except Exception as e:
        logger.error(f"Failed to fetch articles for {fakeid}: {e}")
        return {"new_count": 0, "error_message": str(e)}
    
    if not result.ok:
        error_msg = result.error_message or "Unknown error"
        
        # Handle specific error codes
        if result.error_code == WeChatErrorCode.SESSION_EXPIRED:
            # Mark user auth as expired
            user_conn.execute(
                "UPDATE wechat_mp_auth SET status = 'expired', last_error = ? WHERE user_id = ?",
                (error_msg, user_id)
            )
            user_conn.commit()
            logger.warning(f"User {user_id} auth expired")
            return {"new_count": 0, "error_message": "expired"}
        elif result.error_code == WeChatErrorCode.RATE_LIMITED:
            # Put user in cooldown
            _user_cooldown[user_id] = time.time() + USER_COOLDOWN_SECONDS
            logger.warning(f"User {user_id} rate limited, cooldown for {USER_COOLDOWN_SECONDS}s")
            return {"new_count": 0, "error_message": "rate_limited"}
        else:
            logger.warning(f"Failed to fetch articles for {fakeid}: {error_msg}")
            return {"new_count": 0, "error_message": error_msg}
    
    # Store articles
    new_count = _store_articles(online_conn, fakeid, mp_nickname, result.articles)
    
    if new_count > 0:
        online_conn.commit()
        logger.info(f"Stored {new_count} new articles for {mp_nickname} ({fakeid})")
    
    return {"new_count": new_count, "error_message": ""}


async def _run_fetch_cycle() -> Dict[str, Any]:
    """
    Run one fetch cycle using smart scheduling.
    
    Uses the smart scheduler to:
    1. Get MPs that are due for checking
    2. Fetch articles using available user auth
    3. Update stats after each fetch attempt
    
    Returns stats about the fetch cycle.
    """
    from hotnews.kernel.services.wechat_smart_scheduler import (
        get_due_mps,
        update_mp_stats,
    )
    
    user_conn = _get_user_db_conn()
    online_conn = _get_online_db_conn()
    
    stats = {
        "users_processed": 0,
        "mps_fetched": 0,
        "articles_new": 0,
        "errors": 0,
        "skipped_no_auth": 0,
    }
    
    now = _now_ts()
    
    # Get MPs that are due for checking
    due_mps = get_due_mps(online_conn, user_conn, now, limit=MAX_MPS_PER_CYCLE)
    if not due_mps:
        logger.debug("No WeChat MPs due for checking")
        return stats
    
    logger.info(f"Smart scheduler: {len(due_mps)} MPs due for checking")
    
    # Get users with valid auth
    valid_users = _get_valid_auth_users(user_conn)
    if not valid_users:
        logger.debug("No users with valid WeChat auth")
        stats["skipped_no_auth"] = len(due_mps)
        return stats
    
    # Track which users we've used
    user_index = 0
    users_used: Set[int] = set()
    
    for mp in due_mps:
        fakeid = mp["fakeid"]
        nickname = mp["nickname"]
        
        # Round-robin through available users
        user = valid_users[user_index % len(valid_users)]
        user_index += 1
        
        user_id = user["user_id"]
        cookie = user["cookie"]
        token = user["token"]
        
        users_used.add(user_id)
        
        # Fetch articles
        try:
            result = await _fetch_mp_articles(
                user_id, cookie, token, fakeid, nickname, online_conn, user_conn
            )
            
            new_count = result["new_count"]
            error_message = result["error_message"]
            
            # Update smart scheduler stats
            update_mp_stats(
                online_conn,
                fakeid,
                nickname=nickname,
                has_new_articles=(new_count > 0),
                error_message=error_message,
            )
            
            # Update last_fetch_at in featured_wechat_mps table (for admin display)
            if not error_message:
                online_conn.execute(
                    "UPDATE featured_wechat_mps SET last_fetch_at = ?, updated_at = ? WHERE fakeid = ?",
                    (now, now, fakeid)
                )
            
            online_conn.commit()
            
            stats["mps_fetched"] += 1
            stats["articles_new"] += new_count
            
            if error_message:
                stats["errors"] += 1
                
        except Exception as e:
            logger.error(f"Error fetching {nickname}: {e}")
            stats["errors"] += 1
            
            # Update stats with error
            try:
                update_mp_stats(
                    online_conn,
                    fakeid,
                    nickname=nickname,
                    has_new_articles=False,
                    error_message=str(e),
                )
                online_conn.commit()
            except Exception:
                pass
        
        # Small delay between fetches
        await asyncio.sleep(0.5)
    
    stats["users_processed"] = len(users_used)
    return stats


async def _scheduler_loop() -> None:
    """Main scheduler loop."""
    global _wechat_scheduler_running
    
    logger.info("WeChat scheduler started")
    
    while _wechat_scheduler_running:
        try:
            if not _is_scheduler_enabled():
                await asyncio.sleep(CHECK_INTERVAL_SECONDS)
                continue
            
            # Use unified scheduler if enabled, otherwise use legacy scheduler
            if _is_unified_scheduler_enabled():
                stats = await _run_unified_fetch_cycle()
            else:
                stats = await _run_fetch_cycle()
            
            if stats["mps_fetched"] > 0 or stats["errors"] > 0:
                logger.info(
                    f"WeChat fetch cycle: "
                    f"mps={stats['mps_fetched']}, new={stats['articles_new']}, "
                    f"errors={stats['errors']}"
                )
            
        except Exception as e:
            logger.error(f"WeChat scheduler error: {e}")
        
        await asyncio.sleep(CHECK_INTERVAL_SECONDS)
    
    logger.info("WeChat scheduler stopped")


def start_wechat_scheduler(project_root: Path) -> None:
    """Start the WeChat article scheduler."""
    global _wechat_scheduler_task, _wechat_scheduler_running, _project_root
    
    if _wechat_scheduler_task is not None:
        logger.warning("WeChat scheduler already running")
        return
    
    _project_root = project_root
    _wechat_scheduler_running = True
    _wechat_scheduler_task = asyncio.create_task(_scheduler_loop())
    logger.info("WeChat scheduler task created")


def stop_wechat_scheduler() -> None:
    """Stop the WeChat article scheduler."""
    global _wechat_scheduler_task, _wechat_scheduler_running
    
    _wechat_scheduler_running = False
    
    if _wechat_scheduler_task is not None:
        _wechat_scheduler_task.cancel()
        _wechat_scheduler_task = None
        logger.info("WeChat scheduler stopped")


async def run_fetch_once() -> Dict[str, Any]:
    """
    Run a single fetch cycle manually.
    
    Useful for testing or manual triggers.
    """
    if _project_root is None:
        return {"ok": False, "error": "Scheduler not initialized"}
    
    try:
        stats = await _run_fetch_cycle()
        return {"ok": True, **stats}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def get_scheduler_status() -> Dict[str, Any]:
    """
    Get current scheduler status and statistics.
    
    Returns scheduler state and smart scheduling stats.
    """
    from hotnews.kernel.services.wechat_smart_scheduler import get_scheduler_stats
    
    if _project_root is None:
        return {
            "running": False,
            "enabled": _is_scheduler_enabled(),
            "unified_enabled": _is_unified_scheduler_enabled(),
            "error": "Scheduler not initialized",
        }
    
    try:
        user_conn = _get_user_db_conn()
        online_conn = _get_online_db_conn()
        
        # Get smart scheduler stats
        smart_stats = get_scheduler_stats(online_conn, user_conn)
        
        # Get valid auth count
        valid_users = _get_valid_auth_users(user_conn)
        
        return {
            "running": _wechat_scheduler_running,
            "enabled": _is_scheduler_enabled(),
            "unified_enabled": _is_unified_scheduler_enabled(),
            "valid_auth_users": len(valid_users),
            "check_interval_seconds": CHECK_INTERVAL_SECONDS,
            "max_mps_per_cycle": MAX_MPS_PER_CYCLE,
            **smart_stats,
        }
    except Exception as e:
        return {
            "running": _wechat_scheduler_running,
            "enabled": _is_scheduler_enabled(),
            "unified_enabled": _is_unified_scheduler_enabled(),
            "error": str(e),
        }


# ========== Unified Scheduler Functions ==========

def _get_due_mps_unified(online_conn, user_conn, now: int, limit: int = 20) -> List[Dict[str, Any]]:
    """
    Get MPs that are due for checking (unified version).
    
    Combines featured MPs and user subscriptions, deduplicated by fakeid.
    Uses smart scheduler to determine which MPs are due.
    
    Args:
        online_conn: Online database connection
        user_conn: User database connection
        now: Current timestamp
        limit: Maximum number of MPs to return
        
    Returns:
        List of MP accounts to check
    """
    from hotnews.kernel.services.mp_unified_list import get_all_mp_fakeids
    from hotnews.kernel.services.wechat_smart_scheduler import get_due_mps
    
    # Get all MPs that need to be fetched (deduplicated)
    all_mps = get_all_mp_fakeids(online_conn, user_conn)
    all_fakeids = {mp["fakeid"]: mp for mp in all_mps}
    
    if not all_fakeids:
        return []
    
    # Get MPs that are due from smart scheduler
    due_sources = get_due_mps(online_conn, user_conn, now, limit=limit * 2)
    
    # Filter: only keep MPs in unified list
    due_mps = []
    seen = set()
    
    for src in due_sources:
        fakeid = src.get("fakeid")
        if fakeid and fakeid in all_fakeids and fakeid not in seen:
            seen.add(fakeid)
            mp_info = all_fakeids[fakeid]
            due_mps.append({
                "fakeid": fakeid,
                "nickname": mp_info["nickname"],
                "source": mp_info["source"],
                "cadence": src.get("cadence", "P2"),
                "next_due_at": src.get("next_due_at", 0),
                "fail_count": src.get("fail_count", 0),
            })
    
    # Add MPs without scheduler records (new MPs, fetch immediately)
    for fakeid, mp_info in all_fakeids.items():
        if fakeid not in seen:
            due_mps.append({
                "fakeid": fakeid,
                "nickname": mp_info["nickname"],
                "source": mp_info["source"],
                "cadence": "P2",
                "next_due_at": 0,
                "fail_count": 0,
            })
    
    # Sort by next_due_at (oldest first) and limit
    due_mps.sort(key=lambda x: x.get("next_due_at", 0))
    return due_mps[:limit]


async def _fetch_mp_with_pool(
    fakeid: str,
    nickname: str,
    credential_pool,
    online_conn,
    user_conn,
) -> Dict[str, Any]:
    """
    Fetch MP articles using credential pool.
    
    Args:
        fakeid: MP account fakeid
        nickname: MP account nickname
        credential_pool: CredentialPool instance
        online_conn: Online database connection
        user_conn: User database connection
        
    Returns:
        {"new_count": int, "error_message": str, "credential_id": str}
    """
    from hotnews.kernel.providers.wechat_provider import WeChatMPProvider, WeChatErrorCode
    from hotnews.kernel.services.mp_article_writer import save_mp_articles
    
    # Get credential from pool
    cred = credential_pool.get_credential()
    if not cred:
        return {"new_count": 0, "error_message": "no_credential", "credential_id": ""}
    
    # Request interval control
    await asyncio.sleep(MIN_REQUEST_INTERVAL)
    
    # Create provider and fetch
    provider = WeChatMPProvider(cred.cookie, cred.token)
    
    try:
        result = await asyncio.to_thread(provider.get_articles, fakeid, 20)
    except Exception as e:
        logger.error(f"Failed to fetch articles for {fakeid}: {e}")
        return {"new_count": 0, "error_message": str(e), "credential_id": cred.id}
    
    if not result.ok:
        error_msg = result.error_message or "Unknown error"
        
        # Handle specific errors
        if result.error_code == WeChatErrorCode.SESSION_EXPIRED:
            credential_pool.mark_expired(cred.id, user_conn)
            return {"new_count": 0, "error_message": "expired", "credential_id": cred.id}
        elif result.error_code == WeChatErrorCode.RATE_LIMITED:
            credential_pool.mark_rate_limited(cred.id)
            return {"new_count": 0, "error_message": "rate_limited", "credential_id": cred.id}
        else:
            return {"new_count": 0, "error_message": error_msg, "credential_id": cred.id}
    
    # Convert and save articles
    articles_to_save = []
    for art in result.articles:
        if not art.url:
            continue
        articles_to_save.append({
            "title": art.title,
            "url": art.url,
            "digest": art.digest or "",
            "cover_url": art.cover_url or "",
            "publish_time": art.publish_time or _now_ts(),
        })
    
    if not articles_to_save:
        return {"new_count": 0, "error_message": "", "credential_id": cred.id}
    
    save_result = save_mp_articles(online_conn, fakeid, nickname, articles_to_save)
    new_count = save_result["inserted"]
    
    if new_count > 0:
        online_conn.commit()
        logger.info(f"Stored {new_count} new articles for {nickname} ({fakeid})")
    
    return {"new_count": new_count, "error_message": "", "credential_id": cred.id}


async def _run_unified_fetch_cycle() -> Dict[str, Any]:
    """
    Run unified fetch cycle.
    
    Uses unified MP list (featured + subscriptions deduplicated) and
    credential pool for fetching.
    
    Returns:
        Stats about the fetch cycle
    """
    from hotnews.kernel.services.mp_credential_pool import get_credential_pool
    from hotnews.kernel.services.wechat_smart_scheduler import update_mp_stats
    
    user_conn = _get_user_db_conn()
    online_conn = _get_online_db_conn()
    
    stats = {
        "mps_fetched": 0,
        "articles_new": 0,
        "errors": 0,
        "skipped_no_credential": 0,
        "featured_fetched": 0,
        "subscription_fetched": 0,
    }
    
    now = _now_ts()
    
    # Initialize credential pool
    credential_pool = get_credential_pool()
    credential_pool.load_credentials(online_conn, user_conn)
    
    pool_stats = credential_pool.get_stats()
    if pool_stats["available"] == 0:
        logger.debug("No available credentials for unified scheduler")
        return stats
    
    # Get MPs due for checking
    due_mps = _get_due_mps_unified(online_conn, user_conn, now, limit=MAX_MPS_PER_CYCLE)
    if not due_mps:
        logger.debug("No WeChat MPs due for checking (unified)")
        return stats
    
    logger.info(f"Unified scheduler: {len(due_mps)} MPs due for checking")
    
    for mp in due_mps:
        fakeid = mp["fakeid"]
        nickname = mp["nickname"]
        source = mp["source"]
        
        # Fetch using credential pool
        try:
            result = await _fetch_mp_with_pool(
                fakeid, nickname, credential_pool, online_conn, user_conn
            )
            
            new_count = result["new_count"]
            error_message = result["error_message"]
            
            # Update scheduler stats
            update_mp_stats(
                online_conn,
                fakeid,
                nickname=nickname,
                has_new_articles=(new_count > 0),
                error_message=error_message,
            )
            
            # Update last_fetch_at in featured_wechat_mps table (for admin display)
            if not error_message:
                online_conn.execute(
                    "UPDATE featured_wechat_mps SET last_fetch_at = ?, updated_at = ? WHERE fakeid = ?",
                    (now, now, fakeid)
                )
            
            online_conn.commit()
            
            stats["mps_fetched"] += 1
            stats["articles_new"] += new_count
            
            if source == "featured":
                stats["featured_fetched"] += 1
            else:
                stats["subscription_fetched"] += 1
            
            if error_message:
                stats["errors"] += 1
                if error_message == "no_credential":
                    stats["skipped_no_credential"] += 1
                    break  # No more credentials, stop fetching
                    
        except Exception as e:
            logger.error(f"Error fetching {nickname}: {e}")
            stats["errors"] += 1
            
            try:
                update_mp_stats(
                    online_conn,
                    fakeid,
                    nickname=nickname,
                    has_new_articles=False,
                    error_message=str(e),
                )
                online_conn.commit()
            except Exception:
                pass
        
        await asyncio.sleep(0.5)
    
    return stats


async def fetch_mps_immediately(
    fakeids: List[str],
    project_root: Path = None
) -> Dict[str, Any]:
    """
    Immediately fetch articles for specified MPs.
    
    This function is called when user creates/updates a topic to fetch
    articles right away instead of waiting for the scheduled cycle.
    
    Args:
        fakeids: List of MP fakeids to fetch
        project_root: Project root path (optional, uses module-level if not provided)
        
    Returns:
        Dict with fetch results:
            - total: number of MPs attempted
            - success: number of successful fetches
            - new_articles: total new articles fetched
            - errors: list of error messages
    """
    global _project_root
    
    if project_root:
        _project_root = project_root
    
    if not _project_root:
        logger.error("Project root not set for immediate MP fetch")
        return {"total": 0, "success": 0, "new_articles": 0, "errors": ["Project root not configured"]}
    
    if not fakeids:
        return {"total": 0, "success": 0, "new_articles": 0, "errors": []}
    
    from hotnews.kernel.services.mp_credential_pool import CredentialPool
    from hotnews.kernel.services.wechat_smart_scheduler import update_mp_stats
    
    online_conn = _get_online_db_conn()
    user_conn = _get_user_db_conn()
    
    # Initialize credential pool
    credential_pool = CredentialPool()
    credential_pool.load_credentials(online_conn, user_conn)
    
    if not credential_pool.has_credentials():
        logger.warning("No valid credentials for immediate MP fetch")
        return {"total": len(fakeids), "success": 0, "new_articles": 0, "errors": ["没有可用的微信凭证"]}
    
    results = {
        "total": len(fakeids),
        "success": 0,
        "new_articles": 0,
        "errors": []
    }
    
    now = _now_ts()
    
    for fakeid in fakeids:
        # Get MP info
        cur = online_conn.execute(
            "SELECT nickname FROM featured_wechat_mps WHERE fakeid = ?",
            (fakeid,)
        )
        row = cur.fetchone()
        if not row:
            logger.warning(f"MP not found: {fakeid}")
            results["errors"].append(f"公众号不存在: {fakeid}")
            continue
        
        nickname = row[0]
        
        try:
            # Fetch using credential pool
            result = await _fetch_mp_with_pool(
                fakeid, nickname, credential_pool, online_conn, user_conn
            )
            
            new_count = result["new_count"]
            error_message = result["error_message"]
            
            # Update scheduler stats
            update_mp_stats(
                online_conn,
                fakeid,
                nickname=nickname,
                has_new_articles=(new_count > 0),
                error_message=error_message,
            )
            
            # Update last_fetch_at
            if not error_message:
                online_conn.execute(
                    "UPDATE featured_wechat_mps SET last_fetch_at = ?, updated_at = ? WHERE fakeid = ?",
                    (now, now, fakeid)
                )
                results["success"] += 1
                results["new_articles"] += new_count
                logger.info(f"Immediate fetch: {nickname} - {new_count} new articles")
            else:
                results["errors"].append(f"{nickname}: {error_message}")
                
            online_conn.commit()
            
        except Exception as e:
            logger.error(f"Error fetching {nickname}: {e}")
            results["errors"].append(f"{nickname}: {str(e)}")
        
        # Small delay between fetches
        await asyncio.sleep(0.5)
    
    return results
