# coding=utf-8
"""
User Preferences API

Provides endpoints for:
- Viewing user tag preferences (learned from clicks)
- Managing tag settings (follow/mute)
- Getting personalized recommendations
"""

import json
import re
import time
import hashlib
from typing import Optional, List

from fastapi import APIRouter, Request, HTTPException, Body, Query, Response

router = APIRouter(prefix="/api/user/preferences", tags=["preferences"])


# Response headers to prevent CDN/browser caching of user-specific data
NO_CACHE_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0",
}


# ==================== Title Deduplication Helpers ====================

def _normalize_title(title: str) -> str:
    """Remove punctuation and spaces for comparison."""
    return re.sub(r'[^\w\u4e00-\u9fff]', '', title.lower())


def _is_similar_title(t1: str, t2: str, threshold: float = 0.85) -> bool:
    """Check if two titles are similar using character overlap.
    
    Uses 0.85 threshold to catch more duplicates from different platforms
    (e.g., same news with slightly different wording).
    """
    n1, n2 = _normalize_title(t1), _normalize_title(t2)
    if not n1 or not n2:
        return False
    # Quick exact match
    if n1 == n2:
        return True
    # Length difference too big
    if abs(len(n1) - len(n2)) > max(len(n1), len(n2)) * 0.2:
        return False
    # Character-based similarity (simple and fast)
    shorter, longer = (n1, n2) if len(n1) <= len(n2) else (n2, n1)
    # Check if shorter is mostly contained in longer
    matches = sum(1 for c in shorter if c in longer)
    return matches / len(shorter) >= threshold


def _deduplicate_news_by_title(news_rows: list, limit: int) -> list:
    """
    Deduplicate news items by title similarity.
    
    Args:
        news_rows: List of tuples (id, title, url, published_at, source_id)
        limit: Maximum number of items to return
    
    Returns:
        List of deduplicated news dicts
    """
    seen_titles = []
    news_items = []
    
    for row in news_rows:
        title = row[1]
        
        # Check against all seen titles for similarity
        is_dup = False
        for seen in seen_titles:
            if _is_similar_title(title, seen):
                is_dup = True
                break
        
        if is_dup:
            continue
        
        seen_titles.append(title)
        news_items.append({
            "id": row[0],
            "title": title,
            "url": row[2],
            "published_at": row[3],
            "source_id": row[4],
        })
        
        if len(news_items) >= limit:
            break
    
    return news_items


def _now_ts() -> int:
    return int(time.time())


def _get_user_db_conn(request: Request):
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(request.app.state.project_root)


def _get_online_db_conn(request: Request):
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


from hotnews.kernel.auth.deps import get_current_user as _get_current_user


# ==================== Tag Preferences (Learned) ====================

@router.get("/tags")
async def get_tag_preferences(request: Request, response: Response, limit: int = Query(50, ge=1, le=100)):
    """Get user's learned tag preferences sorted by preference score."""
    # Set no-cache headers to prevent CDN/browser caching of user-specific data
    for key, value in NO_CACHE_HEADERS.items():
        response.headers[key] = value
    
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    cur = conn.execute(
        """
        SELECT tag_id, click_count, view_time_seconds, last_interaction_at, preference_score
        FROM user_tag_preferences
        WHERE user_id = ?
        ORDER BY preference_score DESC, click_count DESC
        LIMIT ?
        """,
        (user["id"], limit)
    )
    prefs = cur.fetchall() or []
    
    # Get tag details
    tag_ids = [p[0] for p in prefs]
    tag_details = {}
    if tag_ids:
        placeholders = ",".join(["?"] * len(tag_ids))
        tag_cur = online_conn.execute(
            f"SELECT id, name, name_en, type, icon, color FROM tags WHERE id IN ({placeholders})",
            tuple(tag_ids)
        )
        for t in tag_cur.fetchall() or []:
            tag_details[t[0]] = {
                "id": t[0], "name": t[1], "name_en": t[2],
                "type": t[3], "icon": t[4], "color": t[5]
            }
    
    result = []
    for p in prefs:
        tag_id = p[0]
        result.append({
            "tag_id": tag_id,
            "tag": tag_details.get(tag_id, {"id": tag_id, "name": tag_id}),
            "click_count": p[1],
            "view_time_seconds": p[2],
            "last_interaction_at": p[3],
            "preference_score": p[4],
        })
    
    return {"ok": True, "preferences": result}


# ==================== Tag Settings (Explicit) ====================

@router.get("/tag-settings")
async def get_tag_settings(request: Request, response: Response):
    """Get user's explicit tag settings (followed tags only)."""
    # Set no-cache headers to prevent CDN/browser caching of user-specific data
    for key, value in NO_CACHE_HEADERS.items():
        response.headers[key] = value
    
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    # Get followed tags
    cur = conn.execute(
        "SELECT tag_id, preference, created_at FROM user_tag_settings WHERE user_id = ? AND preference = 'follow'",
        (user["id"],)
    )
    settings = cur.fetchall() or []
    
    # Get stored order
    order_cur = conn.execute(
        "SELECT preference FROM user_tag_settings WHERE user_id = ? AND tag_id = '__tag_order__'",
        (user["id"],)
    )
    order_row = order_cur.fetchone()
    tag_order = order_row[0].split(",") if order_row and order_row[0] else []
    
    # Get tag details
    tag_ids = [s[0] for s in settings]
    tag_details = {}
    if tag_ids:
        placeholders = ",".join(["?"] * len(tag_ids))
        tag_cur = online_conn.execute(
            f"SELECT id, name, name_en, type, icon, color FROM tags WHERE id IN ({placeholders})",
            tuple(tag_ids)
        )
        for t in tag_cur.fetchall() or []:
            tag_details[t[0]] = {
                "id": t[0], "name": t[1], "name_en": t[2],
                "type": t[3], "icon": t[4], "color": t[5]
            }
    
    followed = []
    for s in settings:
        tag_id, pref, created_at = s
        item = {
            "tag_id": tag_id,
            "tag": tag_details.get(tag_id, {"id": tag_id, "name": tag_id}),
            "created_at": created_at,
        }
        followed.append(item)
    
    # Sort by order
    def sort_key(item):
        try:
            return tag_order.index(item["tag_id"])
        except ValueError:
            return len(tag_order)  # Put unordered items at end
    
    followed.sort(key=sort_key)
    
    return {"ok": True, "followed": followed, "order": tag_order}


@router.post("/tag-settings")
async def set_tag_setting(
    request: Request,
    tag_id: str = Body(...),
    preference: str = Body(...),  # 'follow' or 'neutral' to remove
):
    """Set explicit preference for a tag (follow or neutral).
    
    When preference is 'neutral', this also removes matching entries from
    user_rss_subscriptions, user_keywords, and wechat_mp_subscriptions
    so it works as a unified unfollow endpoint.
    """
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    tag_id_raw = tag_id.strip()
    tag_id = tag_id_raw.lower()
    preference = preference.strip().lower()
    
    if preference not in ("follow", "neutral"):
        raise HTTPException(status_code=400, detail="Invalid preference. Use: follow or neutral")
    
    if preference == "neutral":
        # Remove from user_tag_settings
        conn.execute(
            "DELETE FROM user_tag_settings WHERE user_id = ? AND tag_id = ?",
            (user["id"], tag_id)
        )
        
        # Also try to remove from user_rss_subscriptions (source_id is case-sensitive)
        conn.execute(
            "DELETE FROM user_rss_subscriptions WHERE user_id = ? AND source_id = ?",
            (user["id"], tag_id_raw)
        )
        
        # Also try keyword removal: tag_id format is "keyword_{id}"
        import re
        kw_match = re.match(r'^keyword_(\d+)$', tag_id_raw)
        if kw_match:
            kw_id = int(kw_match.group(1))
            conn.execute(
                "DELETE FROM user_keywords WHERE id = ? AND user_id = ?",
                (kw_id, user["id"])
            )
        
        # Also try wechat MP removal: tag_id format is "mp-{fakeid}"
        if tag_id_raw.startswith("mp-"):
            fakeid = tag_id_raw[3:]
            try:
                conn.execute(
                    "DELETE FROM wechat_mp_subscriptions WHERE user_id = ? AND fakeid = ?",
                    (user["id"], fakeid)
                )
            except Exception:
                pass  # Table may not exist
    else:
        # Upsert setting
        now = _now_ts()
        conn.execute(
            """
            INSERT INTO user_tag_settings (user_id, tag_id, preference, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, tag_id) DO UPDATE SET preference = ?, created_at = ?
            """,
            (user["id"], tag_id, preference, now, preference, now)
        )
    
    conn.commit()
    
    # Invalidate cache when settings change
    from hotnews.web.timeline_cache import my_tags_cache
    my_tags_cache.invalidate()
    
    return {"ok": True, "tag_id": tag_id, "preference": preference}


@router.post("/tag-settings/batch")
async def batch_set_tag_settings(
    request: Request,
    follow: List[str] = Body(default=[]),
):
    """Batch set tag settings (follow only)."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    now = _now_ts()
    
    for tag_id in follow:
        tag_id = tag_id.strip().lower()
        if tag_id:
            conn.execute(
                """
                INSERT INTO user_tag_settings (user_id, tag_id, preference, created_at)
                VALUES (?, ?, 'follow', ?)
                ON CONFLICT(user_id, tag_id) DO UPDATE SET preference = 'follow', created_at = ?
                """,
                (user["id"], tag_id, now, now)
            )
    
    conn.commit()
    
    # Invalidate cache when settings change
    from hotnews.web.timeline_cache import my_tags_cache
    my_tags_cache.invalidate()
    
    return {"ok": True, "followed": len(follow)}


@router.post("/tag-order")
async def save_tag_order(
    request: Request,
    order: List[str] = Body(...),
):
    """Save the display order of followed tags."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    # Store order as a JSON string in user preferences
    order_json = ",".join([t.strip().lower() for t in order if t.strip()])
    now = _now_ts()
    
    conn.execute(
        """
        INSERT INTO user_tag_settings (user_id, tag_id, preference, created_at)
        VALUES (?, '__tag_order__', ?, ?)
        ON CONFLICT(user_id, tag_id) DO UPDATE SET preference = ?, created_at = ?
        """,
        (user["id"], order_json, now, order_json, now)
    )
    
    conn.commit()
    
    # Invalidate cache when order changes
    from hotnews.web.timeline_cache import my_tags_cache
    my_tags_cache.invalidate()
    
    return {"ok": True, "order": order}


# ==================== Recommendation Helpers ====================

@router.get("/recommended-tags")
async def get_recommended_tags(request: Request, response: Response, limit: int = Query(10, ge=1, le=30)):
    """Get recommended tags based on trending data and user behavior.
    
    Returns:
    - hot_tags: Popular tags by recent news count (last 30 days)
    - new_tags: Recently discovered dynamic tags
    - related_tags: Tags related to user's followed tags (if any)
    
    Performance: hot_tags and new_tags are cached for 5 minutes (shared across users).
    Only related_tags is computed per-user.
    """
    # Set no-cache headers to prevent CDN/browser caching of user-specific data
    for key, value in NO_CACHE_HEADERS.items():
        response.headers[key] = value
    
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    # Get followed tags to exclude from recommendations
    cur = conn.execute(
        "SELECT tag_id FROM user_tag_settings WHERE user_id = ? AND preference = 'follow'",
        (user["id"],)
    )
    followed = set(r[0] for r in cur.fetchall() or [])
    
    now = _now_ts()
    
    # Try to get hot_tags and new_tags from cache
    from hotnews.web.timeline_cache import recommended_tags_cache
    
    cached_list = recommended_tags_cache.get()
    if cached_list and len(cached_list) > 0:
        # Use cached data, just filter out followed tags
        cached_data = cached_list[0]
        all_hot_tags = cached_data.get("hot_tags", [])
        all_new_tags = cached_data.get("new_tags", [])
        cache_age = recommended_tags_cache.age_seconds
    else:
        # Cache miss - compute hot_tags and new_tags
        all_hot_tags = _compute_hot_tags(online_conn, now)
        all_new_tags = _compute_new_tags(online_conn, now)
        
        # Store in cache (without filtering by followed - that's user-specific)
        recommended_tags_cache.set([{
            "hot_tags": all_hot_tags,
            "new_tags": all_new_tags,
        }])
        cache_age = 0
    
    # Filter out followed tags (user-specific)
    hot_tags = [t for t in all_hot_tags if t["id"] not in followed][:8]
    new_tags = [t for t in all_new_tags if t["id"] not in followed][:20]
    
    # 3. Related tags: Based on user's followed tags (computed per-user, but simplified)
    related_tags = []
    if followed:
        try:
            # Simplified query: just get tags that co-occur with followed tags
            # Limit the subquery to recent entries for performance
            days_7_ago = now - 7 * 86400
            placeholders = ",".join(["?"] * len(followed))
            related_cur = online_conn.execute(
                f"""
                SELECT t.id, t.name, t.name_en, t.type, t.icon, t.color, t.is_dynamic,
                       COUNT(*) as co_count
                FROM tags t
                JOIN rss_entry_tags et ON t.id = et.tag_id
                WHERE et.dedup_key IN (
                    SELECT DISTINCT dedup_key FROM rss_entry_tags 
                    WHERE tag_id IN ({placeholders}) AND created_at >= ?
                    LIMIT 1000
                )
                AND t.id NOT IN ({placeholders})
                AND t.lifecycle = 'active'
                GROUP BY t.id
                ORDER BY co_count DESC
                LIMIT 10
                """,
                tuple(followed) + (days_7_ago,) + tuple(followed)
            )
            already_recommended = set(t["id"] for t in hot_tags + new_tags)
            for row in related_cur.fetchall() or []:
                tag_id = row[0]
                if tag_id not in already_recommended:
                    related_tags.append({
                        "id": tag_id, "name": row[1], "name_en": row[2],
                        "type": row[3], "icon": row[4], "color": row[5],
                        "is_dynamic": bool(row[6]),
                        "badge": "related",
                        "reason": "与你关注的标签相关"
                    })
                    if len(related_tags) >= 5:
                        break
        except Exception:
            related_tags = []
    
    return {
        "ok": True,
        "hot_tags": hot_tags,
        "new_tags": new_tags,
        "related_tags": related_tags,
        "followed_count": len(followed),
        "cached": cache_age > 0,
        "cache_age": round(cache_age, 1) if cache_age > 0 else None,
    }


def _compute_hot_tags(online_conn, now: int) -> list:
    """Compute hot tags (cached separately from user-specific filtering)."""
    days_30_ago = now - 30 * 86400
    
    try:
        hot_cur = online_conn.execute(
            """
            SELECT t.id, t.name, t.name_en, t.type, t.icon, t.color, t.is_dynamic,
                   COUNT(DISTINCT et.dedup_key) as news_count
            FROM tags t
            LEFT JOIN rss_entry_tags et ON t.id = et.tag_id AND et.created_at >= ?
            WHERE t.lifecycle = 'active'
            GROUP BY t.id
            ORDER BY news_count DESC
            LIMIT 20
            """,
            (days_30_ago,)
        )
        hot_tags = []
        for row in hot_cur.fetchall() or []:
            hot_tags.append({
                "id": row[0], "name": row[1], "name_en": row[2],
                "type": row[3], "icon": row[4], "color": row[5],
                "is_dynamic": bool(row[6]),
                "news_count": row[7] or 0,
                "badge": "hot",
                "reason": "热门标签，最近30天活跃"
            })
        return hot_tags
    except Exception:
        return []


def _compute_new_tags(online_conn, now: int) -> list:
    """Compute new tags (cached separately from user-specific filtering)."""
    from datetime import datetime
    
    # Time boundaries for fast-track criteria
    hours_4_ago = now - 4 * 3600
    hours_12_ago = now - 12 * 3600
    hours_24_ago = now - 24 * 3600
    days_3_ago = now - 3 * 86400
    
    try:
        # Get all pending candidates
        cand_cur = online_conn.execute(
            """
            SELECT tag_id, name, name_en, type, NULL as icon, NULL as color, 
                   first_seen_at, occurrence_count, avg_confidence
            FROM tag_candidates
            WHERE status = 'pending'
            ORDER BY first_seen_at DESC
            LIMIT 200
            """,
        )
        
        new_tags = []
        seen_ids = set()
        
        for row in cand_cur.fetchall() or []:
            tag_id = row[0]
            first_seen_ts = row[6] or now
            occurrence_count = row[7] or 0
            avg_confidence = row[8] or 0
            
            # Check if meets any promotion criteria
            qualifies = False
            if first_seen_ts >= hours_4_ago and occurrence_count >= 8 and avg_confidence >= 0.9:
                qualifies = True
            elif first_seen_ts >= hours_12_ago and occurrence_count >= 15 and avg_confidence >= 0.9:
                qualifies = True
            elif first_seen_ts >= hours_24_ago and occurrence_count >= 20 and avg_confidence >= 0.8:
                qualifies = True
            elif first_seen_ts <= days_3_ago and occurrence_count >= 10 and avg_confidence >= 0.7:
                qualifies = True
            
            if not qualifies:
                continue
            
            first_seen_date = datetime.fromtimestamp(first_seen_ts).strftime("%m-%d")
            new_tags.append({
                "id": tag_id, "name": row[1], "name_en": row[2],
                "type": row[3], "icon": row[4] or "🏷️", "color": row[5],
                "is_dynamic": True,
                "is_candidate": True,
                "occurrence_count": occurrence_count,
                "confidence": round(avg_confidence, 2) if avg_confidence else None,
                "first_seen_at": first_seen_ts,
                "first_seen_date": first_seen_date,
                "badge": "new",
                "reason": f"首次发现: {first_seen_date}"
            })
            seen_ids.add(tag_id)
            if len(new_tags) >= 30:
                break
        
        # Also include recently promoted dynamic tags
        if len(new_tags) < 30:
            new_cur = online_conn.execute(
                """
                SELECT id, name, name_en, type, icon, color, created_at
                FROM tags
                WHERE is_dynamic = 1 AND lifecycle = 'active'
                ORDER BY created_at DESC
                LIMIT 30
                """,
            )
            for row in new_cur.fetchall() or []:
                tag_id = row[0]
                if tag_id not in seen_ids:
                    created_ts = row[6] or now
                    created_date = datetime.fromtimestamp(created_ts).strftime("%m-%d")
                    new_tags.append({
                        "id": tag_id, "name": row[1], "name_en": row[2],
                        "type": row[3], "icon": row[4], "color": row[5],
                        "is_dynamic": True,
                        "first_seen_at": created_ts,
                        "first_seen_date": created_date,
                        "badge": "new",
                        "reason": f"首次发现: {created_date}"
                    })
                    seen_ids.add(tag_id)
                    if len(new_tags) >= 30:
                        break
        
        return new_tags
    except Exception:
        return []


# ==================== Followed News ====================

@router.get("/followed-news")
async def get_followed_news(
    request: Request,
    response: Response,
    limit: int = Query(50, ge=1, le=100),
    source_type: Optional[str] = Query(None, description="Filter by source type: tag, source, keyword, wechat, or all")
):
    """Get news matching user's followed tags, subscribed sources, and keywords, grouped by tag/source/keyword.
    
    Args:
        limit: Maximum number of news items per group
        source_type: Filter by source type (tag, source, keyword, wechat, or all/None for all types)
    """
    # Set no-cache headers to prevent CDN/browser caching of user-specific data
    for key, value in NO_CACHE_HEADERS.items():
        response.headers[key] = value
    
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    # Normalize source_type filter
    filter_type = (source_type or "").strip().lower()
    if filter_type not in ("tag", "source", "keyword", "wechat"):
        filter_type = None  # Show all
    
    # Get followed tag_ids with created_at (skip if filtering for other types)
    followed_tag_ids = []
    tag_follow_times = {}  # tag_id -> created_at
    if filter_type is None or filter_type == "tag":
        cur = conn.execute(
            "SELECT tag_id, created_at FROM user_tag_settings WHERE user_id = ? AND preference = 'follow'",
            (user["id"],)
        )
        for r in cur.fetchall() or []:
            followed_tag_ids.append(r[0])
            tag_follow_times[r[0]] = r[1] or 0
    
    # Get subscribed source_ids with created_at (skip if filtering for other types)
    subscribed_sources = []
    source_follow_times = {}  # source_id -> created_at
    if filter_type is None or filter_type == "source":
        sub_cur = conn.execute(
            "SELECT source_id, display_name, created_at FROM user_rss_subscriptions WHERE user_id = ?",
            (user["id"],)
        )
        for r in sub_cur.fetchall() or []:
            subscribed_sources.append((r[0], r[1]))
            source_follow_times[r[0]] = r[2] or 0
    
    # Get user keywords with created_at (skip if filtering for other types)
    user_keywords = []
    keyword_follow_times = {}  # keyword_id -> created_at
    if filter_type is None or filter_type == "keyword":
        kw_cur = conn.execute(
            "SELECT id, keyword, keyword_type, priority, created_at FROM user_keywords WHERE user_id = ? AND enabled = 1",
            (user["id"],)
        )
        for r in kw_cur.fetchall() or []:
            user_keywords.append((r[0], r[1], r[2], r[3]))
            keyword_follow_times[r[0]] = r[4] or 0
    
    # Get WeChat MP subscriptions with subscribed_at (skip if filtering for other types)
    wechat_subscriptions = []
    wechat_follow_times = {}  # fakeid -> subscribed_at
    if filter_type is None or filter_type == "wechat":
        try:
            wechat_cur = conn.execute(
                "SELECT fakeid, nickname, subscribed_at FROM wechat_mp_subscriptions WHERE user_id = ?",
                (user["id"],)
            )
            for r in wechat_cur.fetchall() or []:
                wechat_subscriptions.append((r[0], r[1]))
                wechat_follow_times[r[0]] = r[2] or 0
        except Exception:
            pass  # Table may not exist in public mode
    
    if not followed_tag_ids and not subscribed_sources and not user_keywords and not wechat_subscriptions:
        return {"ok": True, "tags": [], "message": "No followed tags, subscribed sources, keywords, or WeChat subscriptions", "filter": filter_type}
    
    # Create cache key based on user_id, followed tags, subscribed sources, keywords, wechat, and filter
    from hotnews.web.timeline_cache import my_tags_cache
    
    cache_key_data = {
        "user_id": user["id"],
        "followed_tags": sorted(followed_tag_ids),
        "subscribed_sources": sorted([s[0] for s in subscribed_sources]),
        "keywords": sorted([kw[1] for kw in user_keywords]),
        "wechat_subs": sorted([w[0] for w in wechat_subscriptions]),
        "limit": limit,
        "filter": filter_type,
    }
    
    # Try to get from cache
    cached_result = my_tags_cache.get(config=cache_key_data)
    if cached_result is not None:
        return {
            "ok": True,
            "tags": cached_result,
            "cached": True,
            "cache_age": round(my_tags_cache.age_seconds, 1),
            "filter": filter_type,
        }
    
    # Cache miss - fetch from database
    result = []
    
    # Define valid timestamp range: 2000-01-01 to current time + 7 days
    import time as time_module
    MIN_TIMESTAMP = 946684800  # 2000-01-01 00:00:00 UTC
    MAX_TIMESTAMP = int(time_module.time()) + (7 * 24 * 60 * 60)  # Current + 7 days
    
    # === Part 1: Get news for followed tags ===
    if followed_tag_ids:
        # Get tag details
        placeholders = ",".join(["?"] * len(followed_tag_ids))
        tag_cur = online_conn.execute(
            f"SELECT id, name, name_en, type, icon, color FROM tags WHERE id IN ({placeholders})",
            tuple(followed_tag_ids)
        )
        tag_details = {}
        for t in tag_cur.fetchall() or []:
            tag_details[t[0]] = {
                "id": t[0], "name": t[1], "name_en": t[2],
                "type": t[3], "icon": t[4], "color": t[5]
            }
        
        for tag_id in followed_tag_ids:
            if tag_id not in tag_details:
                continue
            
            # Query news matching this tag using rss_entry_tags table
            # Fetch more results for deduplication
            news_cur = online_conn.execute(
                """
                SELECT DISTINCT e.id, e.title, e.url, e.published_at, e.source_id
                FROM rss_entries e
                JOIN rss_entry_tags t ON e.source_id = t.source_id AND e.dedup_key = t.dedup_key
                WHERE t.tag_id = ?
                  AND e.published_at > 0
                  AND e.published_at >= ?
                  AND e.published_at <= ?
                ORDER BY e.published_at DESC
                LIMIT ?
                """,
                (tag_id, MIN_TIMESTAMP, MAX_TIMESTAMP, limit * 2)
            )
            
            # Filter by timestamp and deduplicate by title similarity
            valid_rows = []
            for row in news_cur.fetchall() or []:
                published_at = row[3]
                if published_at >= MIN_TIMESTAMP and published_at <= MAX_TIMESTAMP:
                    valid_rows.append(row)
            
            news_items = _deduplicate_news_by_title(valid_rows, limit)
            
            result.append({
                "tag": tag_details[tag_id],
                "news": news_items,
                "count": len(news_items),
                "item_type": "tag",
                "followed_at": tag_follow_times.get(tag_id, 0),
            })
    
    # === Part 2: Get news for subscribed sources ===
    for source_id, display_name in subscribed_sources:
        # Get source details from rss_sources
        src_cur = online_conn.execute(
            "SELECT name, url, category FROM rss_sources WHERE id = ?",
            (source_id,)
        )
        src_row = src_cur.fetchone()
        source_name = display_name or (src_row[0] if src_row else source_id)
        source_url = src_row[1] if src_row else ""
        source_category = src_row[2] if src_row else ""
        
        # Query news from this source (fetch more for deduplication)
        news_cur = online_conn.execute(
            """
            SELECT id, title, url, published_at
            FROM rss_entries
            WHERE source_id = ?
              AND published_at > 0
              AND published_at >= ?
              AND published_at <= ?
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (source_id, MIN_TIMESTAMP, MAX_TIMESTAMP, limit * 2)
        )
        
        # Filter by timestamp and deduplicate by title similarity
        valid_rows = []
        for row in news_cur.fetchall() or []:
            published_at = row[3]
            if published_at >= MIN_TIMESTAMP and published_at <= MAX_TIMESTAMP:
                # Add source_id as 5th element for compatibility with _deduplicate_news_by_title
                valid_rows.append((row[0], row[1], row[2], row[3], source_id))
        
        news_items = _deduplicate_news_by_title(valid_rows, limit)
        
        result.append({
            "tag": {
                "id": source_id,
                "name": source_name,
                "name_en": "",
                "type": "source",
                "icon": "📰",
                "color": "#3b82f6",
            },
            "news": news_items,
            "count": len(news_items),
            "item_type": "source",
            "followed_at": source_follow_times.get(source_id, 0),
        })
    
    # === Part 3: Get news for user keywords (search in rss_entries only) ===
    for kw_id, keyword, kw_type, priority in user_keywords:
        # Simple LIKE search on rss_entries table (RSS + custom sources only)
        search_pattern = f"%{keyword}%"
        
        # Query more results for deduplication
        news_cur = online_conn.execute(
            """
            SELECT id, title, url, published_at, source_id
            FROM rss_entries
            WHERE title LIKE ?
              AND published_at > 0
              AND published_at >= ?
              AND published_at <= ?
            ORDER BY published_at DESC
            LIMIT ?
            """,
            (search_pattern, MIN_TIMESTAMP, MAX_TIMESTAMP, limit * 3)
        )
        
        # Filter by timestamp and deduplicate by title similarity
        valid_rows = []
        for row in news_cur.fetchall() or []:
            published_at = row[3]
            if published_at >= MIN_TIMESTAMP and published_at <= MAX_TIMESTAMP:
                valid_rows.append(row)
        
        news_items = _deduplicate_news_by_title(valid_rows, limit)
        
        result.append({
            "tag": {
                "id": f"keyword_{kw_id}",
                "name": keyword,
                "name_en": "",
                "type": "keyword",
                "icon": "🔑",
                "color": "#f59e0b",
            },
            "news": news_items,
            "count": len(news_items),
            "item_type": "keyword",
            "keyword_id": kw_id,
            "followed_at": keyword_follow_times.get(kw_id, 0),
        })
    
    # === Part 4: Get news for WeChat MP subscriptions ===
    # Use the pre-fetched wechat_subscriptions from above
    # 使用统一读取模块
    from hotnews.kernel.services.mp_article_reader import get_mp_articles
    
    for fakeid, nickname in wechat_subscriptions:
        try:
            # Query articles using unified reader
            articles = get_mp_articles(online_conn, fakeid, limit=limit)
            
            news_items = []
            for art in articles:
                publish_time = art.get("publish_time", 0)
                if publish_time < MIN_TIMESTAMP or publish_time > MAX_TIMESTAMP:
                    continue
                news_items.append({
                    "id": art["id"],
                    "title": art["title"],
                    "url": art["url"],
                    "published_at": publish_time,
                    "source_id": f"mp-{fakeid}",  # 统一使用 mp- 前缀
                    "digest": art.get("digest", ""),
                })
            
            result.append({
                "tag": {
                    "id": f"mp-{fakeid}",  # 统一使用 mp- 前缀
                    "name": nickname or fakeid,
                    "name_en": "",
                    "type": "wechat",
                    "icon": "💬",
                    "color": "#07c160",  # WeChat green
                },
                "news": news_items,
                "count": len(news_items),
                "item_type": "wechat",
                "fakeid": fakeid,
                "followed_at": wechat_follow_times.get(fakeid, 0),
            })
        except Exception:
            # MP articles may not be available in public mode
            pass
    
    # Get stored order to sort results (tags first, then sources)
    order_cur = conn.execute(
        "SELECT preference FROM user_tag_settings WHERE user_id = ? AND tag_id = '__tag_order__'",
        (user["id"],)
    )
    order_row = order_cur.fetchone()
    tag_order = order_row[0].split(",") if order_row and order_row[0] else []
    
    # Sort: newest followed/subscribed items first, regardless of type.
    # Within same followed_at time, use tag_order for tags, then count for others.
    def sort_key(item):
        followed_at = item.get("followed_at", 0)
        item_type = item.get("item_type", "tag")
        item_id = item["tag"]["id"]
        # Primary: newest followed first (negate for descending)
        # Secondary: type order (tag=0, keyword=1, wechat=2, source=3)
        # Tertiary: tag_order for tags, count for others
        if item_type == "tag":
            try:
                tertiary = tag_order.index(item_id)
            except ValueError:
                tertiary = 9999
            return (-followed_at, 0, tertiary)
        elif item_type == "keyword":
            return (-followed_at, 1, -item["count"])
        elif item_type == "wechat":
            return (-followed_at, 2, -item["count"])
        else:
            return (-followed_at, 3, -item["count"])
    
    result.sort(key=sort_key)
    
    # Store in cache
    my_tags_cache.set(result, config=cache_key_data)
    
    return {"ok": True, "tags": result, "cached": False, "filter": filter_type}


# ==================== Settings Page ====================

# ==================== Discovery News (Public) ====================

@router.get("/discovery-news")
async def get_discovery_news(
    request: Request,
    news_limit: int = Query(50, ge=1, le=100),
    tag_limit: int = Query(30, ge=1, le=50),
    limit: int = Query(0, ge=0, le=50),
    offset: int = Query(0, ge=0),
):
    """Get discovery tags and their news (public endpoint, no auth required).
    
    Returns NEW tags that meet promotion criteria with their related news.
    
    When limit > 0, returns a paginated slice of tags (for infinite scroll).
    When limit = 0 (default), returns all tags (backward compatible).
    """
    online_conn = _get_online_db_conn(request)
    
    # Try to get from global cache first
    from hotnews.web.timeline_cache import discovery_news_cache
    
    # Cache key is based on the full query (not pagination params)
    cache_key = {"news_limit": news_limit, "tag_limit": tag_limit}
    cached_result = discovery_news_cache.get(config=cache_key)
    if cached_result is not None:
        all_tags = cached_result
        total = len(all_tags)
        if limit > 0:
            sliced = all_tags[offset:offset + limit]
        else:
            sliced = all_tags
        return {
            "ok": True,
            "tags": sliced,
            "total": total,
            "offset": offset,
            "cached": True,
            "cache_age": round(discovery_news_cache.age_seconds, 1),
        }
    
    # Cache miss - fetch from database
    now = _now_ts()
    
    # Time boundaries for fast-track criteria
    hours_4_ago = now - 4 * 3600
    hours_12_ago = now - 12 * 3600
    hours_24_ago = now - 24 * 3600
    days_3_ago = now - 3 * 86400
    
    # Define valid timestamp range
    MIN_TIMESTAMP = 946684800  # 2000-01-01 00:00:00 UTC
    MAX_TIMESTAMP = now + (7 * 24 * 60 * 60)  # Current + 7 days
    
    result = []
    
    def _is_similar_tag(new_tag: dict, existing_tags: list) -> bool:
        """Check if new tag is similar to any existing tag (should be skipped).
        
        Strategy: Keep the tag with higher occurrence_count (more popular).
        If new_tag has higher count, we should NOT skip it (return False),
        and we should remove the existing similar tag.
        """
        new_name = new_tag.get("name", "")
        new_id = new_tag.get("id", "")
        new_count = new_tag.get("occurrence_count", 0)
        
        for i, existing in enumerate(existing_tags):
            existing_name = existing.get("name", "")
            existing_id = existing.get("id", "")
            existing_count = existing.get("occurrence_count", 0)
            
            is_similar = False
            
            # Rule 1: Name contains relationship
            if new_name and existing_name:
                if new_name in existing_name or existing_name in new_name:
                    is_similar = True
            
            # Rule 2: ID contains relationship
            if not is_similar and new_id and existing_id:
                if new_id in existing_id or existing_id in new_id:
                    is_similar = True
            
            # Rule 3: Same base name after removing version numbers
            if not is_similar and new_name and existing_name:
                import re
                new_base = re.sub(r'\s*[vV]?\d+(\.\d+)*$', '', new_name).strip()
                existing_base = re.sub(r'\s*[vV]?\d+(\.\d+)*$', '', existing_name).strip()
                if new_base and existing_base and new_base == existing_base:
                    is_similar = True
            
            if is_similar:
                # Keep the one with higher occurrence_count
                if new_count > existing_count:
                    # New tag is more popular, remove existing and keep new
                    existing_tags.pop(i)
                    return False  # Don't skip new_tag
                else:
                    # Existing is more popular (or equal), skip new_tag
                    return True
        
        return False
    
    try:
        from datetime import datetime
        import json as json_module
        
        qualifying_tags = []
        seen_ids = set()
        
        # Part 1: Get pending candidates that meet promotion criteria
        cand_cur = online_conn.execute(
            """
            SELECT tag_id, name, name_en, type, NULL as icon, NULL as color, 
                   first_seen_at, occurrence_count, avg_confidence, sample_titles
            FROM tag_candidates
            WHERE status = 'pending'
            ORDER BY occurrence_count DESC, first_seen_at DESC
            LIMIT 200
            """,
        )
        
        for row in cand_cur.fetchall() or []:
            tag_id = row[0]
            first_seen_ts = row[6] or now
            occurrence_count = row[7] or 0
            avg_confidence = row[8] or 0
            sample_titles_json = row[9] or "[]"
            
            # Parse sample_titles
            try:
                sample_titles = json_module.loads(sample_titles_json)
            except:
                sample_titles = []
            
            # Check if meets any promotion criteria:
            # 1. Fast-track 4h: discovered within last 4h, occurrence >= 8, confidence >= 0.9
            # 2. Fast-track 12h: discovered within last 12h, occurrence >= 15, confidence >= 0.9
            # 3. Fast-track 24h: discovered within last 24h, occurrence >= 20, confidence >= 0.8
            # 4. Standard: discovered within last 3 days, occurrence >= 10, confidence >= 0.7
            
            qualifies = False
            if first_seen_ts >= hours_4_ago and occurrence_count >= 8 and avg_confidence >= 0.9:
                qualifies = True
            elif first_seen_ts >= hours_12_ago and occurrence_count >= 15 and avg_confidence >= 0.9:
                qualifies = True
            elif first_seen_ts >= hours_24_ago and occurrence_count >= 20 and avg_confidence >= 0.8:
                qualifies = True
            elif first_seen_ts >= days_3_ago and occurrence_count >= 10 and avg_confidence >= 0.7:
                qualifies = True
            
            if not qualifies:
                continue
            
            first_seen_date = datetime.fromtimestamp(first_seen_ts).strftime("%m-%d")
            new_tag = {
                "id": tag_id,
                "name": row[1],
                "name_en": row[2],
                "type": row[3],
                "icon": row[4] or "🏷️",
                "color": row[5],
                "first_seen_at": first_seen_ts,
                "first_seen_date": first_seen_date,
                "occurrence_count": occurrence_count,
                "confidence": round(avg_confidence, 2) if avg_confidence else None,
                "badge": "new",
                "is_candidate": True,
                "sample_titles": sample_titles,  # Keep for news search
            }
            
            # Skip if similar to existing tag (deduplication)
            if _is_similar_tag(new_tag, qualifying_tags):
                continue
            
            qualifying_tags.append(new_tag)
            seen_ids.add(tag_id)
            
            if len(qualifying_tags) >= tag_limit * 2:  # Allow more candidates initially
                break
        
        # Part 2: Also include recently promoted dynamic tags (last 7 days)
        # Always include these to match "快速订阅" hot_tags behavior
        # Use larger limit to ensure we don't miss any recent tags
        days_7_ago = now - 7 * 86400
        dyn_cur = online_conn.execute(
            """
            SELECT id, name, name_en, type, icon, color, created_at
            FROM tags
            WHERE is_dynamic = 1 AND lifecycle = 'active' AND created_at >= ?
            ORDER BY created_at DESC
            LIMIT 100
            """,
            (days_7_ago,)
        )
        for row in dyn_cur.fetchall() or []:
            tag_id = row[0]
            if tag_id in seen_ids:
                continue
            created_ts = row[6] or now
            created_date = datetime.fromtimestamp(created_ts).strftime("%m-%d")
            new_tag = {
                "id": tag_id,
                "name": row[1],
                "name_en": row[2],
                "type": row[3],
                "icon": row[4] or "🏷️",
                "color": row[5],
                "first_seen_at": created_ts,
                "first_seen_date": created_date,
                "occurrence_count": 0,
                "confidence": None,
                "badge": "new",
                "is_candidate": False,
            }
            
            # Skip if similar to existing tag
            if _is_similar_tag(new_tag, qualifying_tags):
                continue
            
            qualifying_tags.append(new_tag)
            seen_ids.add(tag_id)
        
        # Sort: candidates by occurrence_count, promoted tags by created_at
        # Mix them by first_seen_at (newest first) to show recent discoveries
        qualifying_tags.sort(key=lambda x: x.get("first_seen_at", 0), reverse=True)
        
        # Limit to tag_limit
        qualifying_tags = qualifying_tags[:tag_limit]
        
        # Fetch news for each qualifying tag
        for tag_data in qualifying_tags:
            tag_id = tag_data["id"]
            tag_name = tag_data.get("name", "")
            tag_name_en = tag_data.get("name_en", "")
            is_candidate = tag_data.get("is_candidate", False)
            sample_titles = tag_data.get("sample_titles", [])
            
            news_items = []
            
            if is_candidate:
                # For candidates: search by multiple keywords
                # Build comprehensive keyword list
                keywords = set()
                
                # Add tag name (Chinese)
                if tag_name and len(tag_name) >= 2:
                    keywords.add(tag_name)
                    # Also add base name without year/version
                    import re
                    base_name = re.sub(r'\s*\d{4}$', '', tag_name).strip()  # Remove year like "2026"
                    base_name = re.sub(r'\s*[vV]?\d+(\.\d+)*$', '', base_name).strip()  # Remove version
                    if base_name and len(base_name) >= 2 and base_name != tag_name:
                        keywords.add(base_name)
                
                # Add tag_id (often English name)
                if tag_id and len(tag_id) >= 2:
                    keywords.add(tag_id)
                    # Convert underscore to space for search
                    keywords.add(tag_id.replace('_', ' '))
                
                # Add name_en if different
                if tag_name_en and len(tag_name_en) >= 2 and tag_name_en != tag_id:
                    keywords.add(tag_name_en)
                
                # Build search query
                if keywords:
                    like_conditions = []
                    params = []
                    for kw in keywords:
                        like_conditions.append("e.title LIKE ?")
                        params.append(f"%{kw}%")
                    
                    where_clause = " OR ".join(like_conditions)
                    params.extend([MIN_TIMESTAMP, MAX_TIMESTAMP, news_limit * 2])
                    
                    news_cur = online_conn.execute(
                        f"""
                        SELECT DISTINCT e.id, e.title, e.url, e.published_at, e.source_id
                        FROM rss_entries e
                        WHERE ({where_clause})
                          AND e.published_at > 0
                          AND e.published_at >= ?
                          AND e.published_at <= ?
                        ORDER BY e.published_at DESC
                        LIMIT ?
                        """,
                        params
                    )
                    
                    valid_rows = []
                    for row in news_cur.fetchall() or []:
                        published_at = row[3]
                        if published_at >= MIN_TIMESTAMP and published_at <= MAX_TIMESTAMP:
                            valid_rows.append(row)
                    
                    news_items = _deduplicate_news_by_title(valid_rows, news_limit)
            else:
                # For promoted tags: use rss_entry_tags table
                news_cur = online_conn.execute(
                    """
                    SELECT DISTINCT e.id, e.title, e.url, e.published_at, e.source_id
                    FROM rss_entries e
                    JOIN rss_entry_tags t ON e.source_id = t.source_id AND e.dedup_key = t.dedup_key
                    WHERE t.tag_id = ?
                      AND e.published_at > 0
                      AND e.published_at >= ?
                      AND e.published_at <= ?
                    ORDER BY e.published_at DESC
                    LIMIT ?
                    """,
                    (tag_id, MIN_TIMESTAMP, MAX_TIMESTAMP, news_limit * 2)
                )
                
                valid_rows = []
                for row in news_cur.fetchall() or []:
                    published_at = row[3]
                    if published_at >= MIN_TIMESTAMP and published_at <= MAX_TIMESTAMP:
                        valid_rows.append(row)
                
                news_items = _deduplicate_news_by_title(valid_rows, news_limit)
            
            # Only add tags that have news
            if news_items:
                # Remove sample_titles from tag_data before sending to frontend
                tag_data_clean = {k: v for k, v in tag_data.items() if k != "sample_titles"}
                result.append({
                    "tag": tag_data_clean,
                    "news": news_items,
                    "count": len(news_items),
                })
        
    except Exception as e:
        print(f"[Discovery] Error fetching discovery news: {e}")
        return {"ok": False, "error": str(e), "tags": []}
    
    # Store in cache
    discovery_news_cache.set(result, config=cache_key)
    
    total = len(result)
    if limit > 0:
        sliced = result[offset:offset + limit]
    else:
        sliced = result
    return {"ok": True, "tags": sliced, "total": total, "offset": offset, "cached": False}


@router.get("/page", include_in_schema=False)
async def settings_page(request: Request):
    """Serve the user settings HTML page."""
    from pathlib import Path
    from fastapi.responses import HTMLResponse
    
    template_path = Path(__file__).parent.parent / "templates" / "user_settings.html"
    if template_path.exists():
        return HTMLResponse(content=template_path.read_text(encoding="utf-8"))
    else:
        return HTMLResponse(content="<h1>Settings page not found</h1>", status_code=404)
