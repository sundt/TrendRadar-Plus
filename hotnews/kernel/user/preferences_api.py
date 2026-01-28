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

from fastapi import APIRouter, Request, HTTPException, Body, Query

router = APIRouter(prefix="/api/user/preferences", tags=["preferences"])


# ==================== Title Deduplication Helpers ====================

def _normalize_title(title: str) -> str:
    """Remove punctuation and spaces for comparison."""
    return re.sub(r'[^\w\u4e00-\u9fff]', '', title.lower())


def _is_similar_title(t1: str, t2: str, threshold: float = 0.9) -> bool:
    """Check if two titles are similar using character overlap."""
    n1, n2 = _normalize_title(t1), _normalize_title(t2)
    if not n1 or not n2:
        return False
    # Quick exact match
    if n1 == n2:
        return True
    # Length difference too big
    if abs(len(n1) - len(n2)) > max(len(n1), len(n2)) * 0.15:
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


def _get_current_user(request: Request):
    """Get current authenticated user or raise 401."""
    from hotnews.kernel.auth.auth_api import _get_session_token
    from hotnews.kernel.auth.auth_service import validate_session
    
    session_token = _get_session_token(request)
    if not session_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    conn = _get_user_db_conn(request)
    is_valid, user_info = validate_session(conn, session_token)
    
    if not is_valid or not user_info:
        raise HTTPException(status_code=401, detail="Session expired")
    
    return user_info


# ==================== Tag Preferences (Learned) ====================

@router.get("/tags")
async def get_tag_preferences(request: Request, limit: int = Query(50, ge=1, le=100)):
    """Get user's learned tag preferences sorted by preference score."""
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
async def get_tag_settings(request: Request):
    """Get user's explicit tag settings (followed tags only)."""
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
    """Set explicit preference for a tag (follow or neutral)."""
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    
    tag_id = tag_id.strip().lower()
    preference = preference.strip().lower()
    
    if preference not in ("follow", "neutral"):
        raise HTTPException(status_code=400, detail="Invalid preference. Use: follow or neutral")
    
    if preference == "neutral":
        # Remove setting
        conn.execute(
            "DELETE FROM user_tag_settings WHERE user_id = ? AND tag_id = ?",
            (user["id"], tag_id)
        )
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
async def get_recommended_tags(request: Request, limit: int = Query(10, ge=1, le=30)):
    """Get recommended tags based on trending data and user behavior.
    
    Returns:
    - hot_tags: Popular tags by recent news count (last 30 days)
    - new_tags: Recently discovered dynamic tags
    - related_tags: Tags related to user's followed tags (if any)
    """
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
    days_30_ago = now - 30 * 86400
    days_7_ago = now - 7 * 86400
    
    # 1. Hot tags: Most used in recent news (by entry count)
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
            tag_id = row[0]
            if tag_id not in followed:
                hot_tags.append({
                    "id": tag_id, "name": row[1], "name_en": row[2],
                    "type": row[3], "icon": row[4], "color": row[5],
                    "is_dynamic": bool(row[6]),
                    "news_count": row[7] or 0,
                    "badge": "hot",
                    "reason": "热门标签，最近30天活跃"
                })
                if len(hot_tags) >= 8:
                    break
    except Exception:
        hot_tags = []
    
    # 2. New tags: Candidates that meet fast-track or standard promotion criteria
    # Use the same criteria as defined in tag_discovery.py
    try:
        from datetime import datetime
        
        # Time boundaries for fast-track criteria
        hours_4_ago = now - 4 * 3600
        hours_12_ago = now - 12 * 3600
        hours_24_ago = now - 24 * 3600
        days_3_ago = now - 3 * 86400
        
        # Get all pending candidates, we'll filter in Python to match the complex criteria
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
            if tag_id in followed or tag_id in [t["id"] for t in hot_tags]:
                continue
                
            first_seen_ts = row[6] or now
            occurrence_count = row[7] or 0
            avg_confidence = row[8] or 0
            
            # Check if meets any promotion criteria:
            # 1. Fast-track 4h: first_seen >= 4h ago, occurrence >= 8, confidence >= 0.9
            # 2. Fast-track 12h: first_seen >= 12h ago, occurrence >= 15, confidence >= 0.9
            # 3. Fast-track 24h: first_seen >= 24h ago, occurrence >= 20, confidence >= 0.8
            # 4. Standard: first_seen <= 3 days ago, occurrence >= 10, confidence >= 0.7
            
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
            if len(new_tags) >= 20:
                break
        
        # Also include recently promoted dynamic tags
        if len(new_tags) < 20:
            new_cur = online_conn.execute(
                """
                SELECT id, name, name_en, type, icon, color, created_at
                FROM tags
                WHERE is_dynamic = 1 AND lifecycle = 'active'
                ORDER BY created_at DESC
                LIMIT 20
                """,
            )
            for row in new_cur.fetchall() or []:
                tag_id = row[0]
                if tag_id not in followed and tag_id not in seen_ids and tag_id not in [t["id"] for t in hot_tags]:
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
                    if len(new_tags) >= 20:
                        break
    except Exception:
        new_tags = []
    
    # 3. Related tags: Based on user's followed tags (simple co-occurrence)
    related_tags = []
    if followed:
        try:
            # Find tags that often appear with user's followed tags
            placeholders = ",".join(["?"] * len(followed))
            related_cur = online_conn.execute(
                f"""
                SELECT t.id, t.name, t.name_en, t.type, t.icon, t.color, t.is_dynamic,
                       COUNT(DISTINCT et.dedup_key) as co_count
                FROM tags t
                JOIN rss_entry_tags et ON t.id = et.tag_id
                WHERE et.dedup_key IN (
                    SELECT DISTINCT dedup_key FROM rss_entry_tags WHERE tag_id IN ({placeholders})
                )
                AND t.id NOT IN ({placeholders})
                AND t.lifecycle = 'active'
                GROUP BY t.id
                ORDER BY co_count DESC
                LIMIT 10
                """,
                tuple(followed) + tuple(followed)
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
    }


# ==================== Followed News ====================

@router.get("/followed-news")
async def get_followed_news(
    request: Request, 
    limit: int = Query(50, ge=1, le=100),
    source_type: Optional[str] = Query(None, description="Filter by source type: tag, source, keyword, wechat, or all")
):
    """Get news matching user's followed tags, subscribed sources, and keywords, grouped by tag/source/keyword.
    
    Args:
        limit: Maximum number of news items per group
        source_type: Filter by source type (tag, source, keyword, wechat, or all/None for all types)
    """
    user = _get_current_user(request)
    conn = _get_user_db_conn(request)
    online_conn = _get_online_db_conn(request)
    
    # Normalize source_type filter
    filter_type = (source_type or "").strip().lower()
    if filter_type not in ("tag", "source", "keyword", "wechat"):
        filter_type = None  # Show all
    
    # Get followed tag_ids (skip if filtering for other types)
    followed_tag_ids = []
    if filter_type is None or filter_type == "tag":
        cur = conn.execute(
            "SELECT tag_id FROM user_tag_settings WHERE user_id = ? AND preference = 'follow'",
            (user["id"],)
        )
        followed_tag_ids = [r[0] for r in cur.fetchall() or []]
    
    # Get subscribed source_ids (skip if filtering for other types)
    subscribed_sources = []
    if filter_type is None or filter_type == "source":
        sub_cur = conn.execute(
            "SELECT source_id, display_name FROM user_rss_subscriptions WHERE user_id = ?",
            (user["id"],)
        )
        subscribed_sources = [(r[0], r[1]) for r in sub_cur.fetchall() or []]
    
    # Get user keywords (skip if filtering for other types)
    user_keywords = []
    if filter_type is None or filter_type == "keyword":
        kw_cur = conn.execute(
            "SELECT id, keyword, keyword_type, priority FROM user_keywords WHERE user_id = ? AND enabled = 1",
            (user["id"],)
        )
        user_keywords = [(r[0], r[1], r[2], r[3]) for r in kw_cur.fetchall() or []]
    
    # Get WeChat MP subscriptions (skip if filtering for other types)
    wechat_subscriptions = []
    if filter_type is None or filter_type == "wechat":
        try:
            wechat_cur = conn.execute(
                "SELECT fakeid, nickname FROM wechat_mp_subscriptions WHERE user_id = ?",
                (user["id"],)
            )
            wechat_subscriptions = [(r[0], r[1]) for r in wechat_cur.fetchall() or []]
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
        })
    
    # === Part 4: Get news for WeChat MP subscriptions ===
    # Use the pre-fetched wechat_subscriptions from above
    for fakeid, nickname in wechat_subscriptions:
        try:
            # Query articles from wechat_mp_articles table
            art_cur = online_conn.execute(
                """
                SELECT id, title, url, publish_time, digest
                FROM wechat_mp_articles
                WHERE fakeid = ?
                  AND publish_time > 0
                  AND publish_time >= ?
                  AND publish_time <= ?
                ORDER BY publish_time DESC
                LIMIT ?
                """,
                (fakeid, MIN_TIMESTAMP, MAX_TIMESTAMP, limit)
            )
            news_items = []
            for row in art_cur.fetchall() or []:
                publish_time = row[3]
                if publish_time < MIN_TIMESTAMP or publish_time > MAX_TIMESTAMP:
                    continue
                news_items.append({
                    "id": row[0],
                    "title": row[1],
                    "url": row[2],
                    "published_at": publish_time,
                    "source_id": f"wechat-{fakeid}",
                    "digest": row[4] or "",
                })
            
            result.append({
                "tag": {
                    "id": f"wechat-{fakeid}",
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
            })
        except Exception:
            # wechat_mp_articles table may not exist in public mode
            pass
    
    # Get stored order to sort results (tags first, then sources)
    order_cur = conn.execute(
        "SELECT preference FROM user_tag_settings WHERE user_id = ? AND tag_id = '__tag_order__'",
        (user["id"],)
    )
    order_row = order_cur.fetchone()
    tag_order = order_row[0].split(",") if order_row and order_row[0] else []
    
    # Sort: tags by user order, then keywords, then wechat, then sources at the end
    def sort_key(item):
        item_type = item.get("item_type", "tag")
        item_id = item["tag"]["id"]
        if item_type == "tag":
            try:
                return (0, tag_order.index(item_id))
            except ValueError:
                return (0, 9999)  # Unordered tags
        elif item_type == "keyword":
            return (1, -item["count"])  # Keywords sorted by count
        elif item_type == "wechat":
            return (2, -item["count"])  # WeChat sorted by count
        else:
            return (3, -item["count"])  # Sources sorted by count
    
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
):
    """Get discovery tags and their news (public endpoint, no auth required).
    
    Returns NEW tags that meet promotion criteria with their related news.
    """
    online_conn = _get_online_db_conn(request)
    
    # Try to get from global cache first
    from hotnews.web.timeline_cache import discovery_news_cache
    
    cache_key = {"news_limit": news_limit, "tag_limit": tag_limit}
    cached_result = discovery_news_cache.get(config=cache_key)
    if cached_result is not None:
        return {
            "ok": True,
            "tags": cached_result,
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
        """Check if new tag is similar to any existing tag (should be skipped)."""
        new_name = new_tag.get("name", "")
        new_id = new_tag.get("id", "")
        
        for existing in existing_tags:
            existing_name = existing.get("name", "")
            existing_id = existing.get("id", "")
            
            # Rule 1: Name contains relationship (skip shorter one)
            if new_name and existing_name:
                if new_name in existing_name:
                    return True  # Skip new_tag, keep existing (longer)
                # If existing is shorter, we'll keep new_tag
            
            # Rule 2: ID contains relationship
            if new_id and existing_id:
                if new_id in existing_id:
                    return True
            
            # Rule 3: Same base name after removing version numbers
            if new_name and existing_name:
                import re
                new_base = re.sub(r'\s*[vV]?\d+(\.\d+)*$', '', new_name).strip()
                existing_base = re.sub(r'\s*[vV]?\d+(\.\d+)*$', '', existing_name).strip()
                if new_base and existing_base and new_base == existing_base:
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
            
            if len(qualifying_tags) >= tag_limit:
                break
        
        # Part 2: Also include recently promoted dynamic tags (last 7 days)
        days_7_ago = now - 7 * 86400
        if len(qualifying_tags) < tag_limit:
            dyn_cur = online_conn.execute(
                """
                SELECT id, name, name_en, type, icon, color, created_at
                FROM tags
                WHERE is_dynamic = 1 AND lifecycle = 'active' AND created_at >= ?
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (days_7_ago, tag_limit - len(qualifying_tags))
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
                if len(qualifying_tags) >= tag_limit:
                    break
        
        # Sort by occurrence_count descending
        qualifying_tags.sort(key=lambda x: x["occurrence_count"], reverse=True)
        
        # Fetch news for each qualifying tag
        for tag_data in qualifying_tags:
            tag_id = tag_data["id"]
            tag_name = tag_data.get("name", "")
            is_candidate = tag_data.get("is_candidate", False)
            sample_titles = tag_data.get("sample_titles", [])
            
            news_items = []
            
            if is_candidate:
                # For candidates: search by sample_titles first (exact match), then by name
                # sample_titles are the actual news titles that triggered this tag
                found_ids = set()
                
                # Strategy 1: Search by sample titles (most accurate)
                if sample_titles:
                    for sample_title in sample_titles[:5]:  # Use up to 5 sample titles
                        if not sample_title or len(sample_title) < 5:
                            continue
                        # Search for exact or partial match
                        news_cur = online_conn.execute(
                            """
                            SELECT DISTINCT e.id, e.title, e.url, e.published_at, e.source_id
                            FROM rss_entries e
                            WHERE e.title LIKE ?
                              AND e.published_at > 0
                              AND e.published_at >= ?
                              AND e.published_at <= ?
                            ORDER BY e.published_at DESC
                            LIMIT 20
                            """,
                            (f"%{sample_title[:30]}%", MIN_TIMESTAMP, MAX_TIMESTAMP)
                        )
                        for row in news_cur.fetchall() or []:
                            if row[0] not in found_ids:
                                found_ids.add(row[0])
                
                # Strategy 2: Search by tag name and tag_id as keywords
                keywords = [k for k in [tag_name, tag_id] if k and len(k) >= 2]
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
    
    return {"ok": True, "tags": result, "cached": False}


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
