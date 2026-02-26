"""
Admin API for user statistics.

Endpoints:
- GET /admin/stats/users - Get user statistics overview
- GET /admin/stats/users/trend - Get user registration trend
- GET /admin/stats/users/list - Get user list with pagination
"""

import time
from typing import Optional
from fastapi import APIRouter, Request, Query
from pathlib import Path

router = APIRouter(prefix="/admin/stats", tags=["User Stats Admin"])

# Get project root
project_root = Path(__file__).parent.parent.parent.parent


def _get_user_db_conn():
    """Get user database connection."""
    from hotnews.web.user_db import get_user_db_conn
    return get_user_db_conn(project_root)


def _get_online_db_conn():
    """Get online database connection."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(project_root)


@router.get("/users")
async def get_user_stats(request: Request):
    """Get user statistics overview."""
    conn = _get_user_db_conn()
    now = int(time.time())
    
    # Time boundaries
    today_start = now - (now % 86400)  # Start of today (UTC)
    week_start = today_start - (7 * 86400)
    month_start = today_start - (30 * 86400)
    
    stats = {
        "overview": {},
        "by_auth_type": {},
        "sessions": {},
        "recent_users": [],
        "ai_summary": {},
    }
    
    try:
        # Total users
        cur = conn.execute("SELECT COUNT(*) FROM users")
        stats["overview"]["total_users"] = cur.fetchone()[0]
        
        # OAuth users (users with auth methods)
        cur = conn.execute("SELECT COUNT(DISTINCT user_id) FROM user_auth_methods")
        stats["overview"]["oauth_users"] = cur.fetchone()[0]
        
        # Today new users
        cur = conn.execute(
            "SELECT COUNT(*) FROM users WHERE created_at >= ?",
            (today_start,)
        )
        stats["overview"]["today_new"] = cur.fetchone()[0]
        
        # This week new users
        cur = conn.execute(
            "SELECT COUNT(*) FROM users WHERE created_at >= ?",
            (week_start,)
        )
        stats["overview"]["week_new"] = cur.fetchone()[0]
        
        # This month new users
        cur = conn.execute(
            "SELECT COUNT(*) FROM users WHERE created_at >= ?",
            (month_start,)
        )
        stats["overview"]["month_new"] = cur.fetchone()[0]
        
        # By auth type
        cur = conn.execute("""
            SELECT auth_type, COUNT(*) 
            FROM user_auth_methods 
            GROUP BY auth_type 
            ORDER BY COUNT(*) DESC
        """)
        for row in cur.fetchall():
            stats["by_auth_type"][row[0]] = row[1]
        
        # Anonymous users (users without auth methods)
        oauth_user_count = stats["overview"]["oauth_users"]
        total_users = stats["overview"]["total_users"]
        stats["by_auth_type"]["anonymous"] = total_users - oauth_user_count
        
        # Today unique visitors (distinct users with sessions created today)
        cur = conn.execute("""
            SELECT COUNT(DISTINCT user_id) FROM user_sessions 
            WHERE created_at >= ?
        """, (today_start,))
        stats["sessions"]["today_visitors"] = cur.fetchone()[0]
        
        # Today logins (sessions created today)
        cur = conn.execute("""
            SELECT COUNT(*) FROM user_sessions 
            WHERE created_at >= ?
        """, (today_start,))
        stats["sessions"]["today_logins"] = cur.fetchone()[0]
        
        # AI Summary statistics - split into VIP usage and Token usage
        try:
            online_conn = _get_online_db_conn()
            
            # === VIP Usage Statistics (from user_subscriptions) ===
            cur = online_conn.execute("""
                SELECT user_id, plan_type, usage_used, usage_quota
                FROM user_subscriptions
                WHERE usage_used > 0
                ORDER BY usage_used DESC
                LIMIT 10
            """)
            vip_usage_rows = cur.fetchall()
            
            # Get user info for VIP users
            vip_user_ids = [row[0] for row in vip_usage_rows]
            vip_users = []
            if vip_user_ids:
                placeholders = ','.join('?' * len(vip_user_ids))
                cur = conn.execute(f"""
                    SELECT id, nickname, email FROM users WHERE id IN ({placeholders})
                """, vip_user_ids)
                user_info = {row[0]: {"nickname": row[1], "email": row[2]} for row in cur.fetchall()}
                
                for row in vip_usage_rows:
                    user_id, plan_type, usage_used, usage_quota = row
                    info = user_info.get(user_id, {})
                    vip_users.append({
                        "id": user_id,
                        "nickname": info.get("nickname", "-"),
                        "email": info.get("email", "-"),
                        "plan_type": plan_type,
                        "usage_used": usage_used,
                        "usage_quota": usage_quota,
                    })
            
            # === Token Usage Statistics (from token_usage_logs) ===
            cur = online_conn.execute("""
                SELECT user_id, SUM(tokens_used) as total_tokens, COUNT(*) as usage_count
                FROM token_usage_logs
                GROUP BY user_id
                ORDER BY total_tokens DESC
                LIMIT 10
            """)
            token_usage_rows = cur.fetchall()
            
            # Get user info for token users
            token_user_ids = [row[0] for row in token_usage_rows]
            token_users = []
            if token_user_ids:
                placeholders = ','.join('?' * len(token_user_ids))
                cur = conn.execute(f"""
                    SELECT id, nickname, email, token_balance FROM users WHERE id IN ({placeholders})
                """, token_user_ids)
                user_info = {row[0]: {"nickname": row[1], "email": row[2], "token_balance": row[3]} for row in cur.fetchall()}
                
                for row in token_usage_rows:
                    user_id, total_tokens, usage_count = row
                    info = user_info.get(user_id, {})
                    token_users.append({
                        "id": user_id,
                        "nickname": info.get("nickname", "-"),
                        "email": info.get("email", "-"),
                        "tokens_used": total_tokens,
                        "token_balance": info.get("token_balance", 0),
                        "summary_count": usage_count,
                    })
            
            # === Summary counts ===
            # Total VIP usage
            cur = online_conn.execute("SELECT COALESCE(SUM(usage_used), 0) FROM user_subscriptions")
            total_vip_usage = cur.fetchone()[0] or 0
            
            # Total token usage
            cur = online_conn.execute("SELECT COALESCE(SUM(tokens_used), 0) FROM token_usage_logs")
            total_token_usage = cur.fetchone()[0] or 0
            
            # Users count
            cur = online_conn.execute("SELECT COUNT(*) FROM user_subscriptions WHERE usage_used > 0")
            vip_users_count = cur.fetchone()[0]
            
            cur = online_conn.execute("SELECT COUNT(DISTINCT user_id) FROM token_usage_logs")
            token_users_count = cur.fetchone()[0]
            
            # Total summaries generated
            cur = conn.execute("SELECT COUNT(*) FROM user_favorites WHERE summary IS NOT NULL AND summary != ''")
            total_summaries = cur.fetchone()[0]
            
            stats["ai_summary"] = {
                "vip_users_count": vip_users_count,
                "token_users_count": token_users_count,
                "total_vip_usage": total_vip_usage,
                "total_tokens_used": total_token_usage,
                "total_summaries": total_summaries,
                "vip_top_users": vip_users,
                "token_top_users": token_users,
                # Keep old field for compatibility
                "users_count": vip_users_count + token_users_count,
                "top_users": token_users,  # Backward compatibility
            }
        except Exception as e:
            import traceback
            traceback.print_exc()
            stats["ai_summary"] = {"users_count": 0, "total_tokens_used": 0, "total_summaries": 0, "top_users": [], "vip_top_users": [], "token_top_users": []}
        
        # Recent registered users (only users with auth methods, last 20)
        cur = conn.execute("""
            SELECT u.id, u.nickname, u.email, u.avatar_url, u.created_at,
                   GROUP_CONCAT(a.auth_type) as auth_types
            FROM users u
            INNER JOIN user_auth_methods a ON u.id = a.user_id
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT 20
        """)
        columns = [desc[0] for desc in cur.description]
        for row in cur.fetchall():
            user = dict(zip(columns, row))
            user["auth_types"] = user["auth_types"].split(",") if user["auth_types"] else []
            stats["recent_users"].append(user)
        
    except Exception as e:
        stats["error"] = str(e)
    
    return {"ok": True, "stats": stats}


@router.get("/users/trend")
async def get_user_trend(
    request: Request,
    days: int = Query(30, ge=1, le=365),
):
    """Get user registration trend by day."""
    conn = _get_user_db_conn()
    now = int(time.time())
    start_time = now - (days * 86400)
    
    trend = []
    
    try:
        # Get daily registration counts
        cur = conn.execute("""
            SELECT 
                date(created_at, 'unixepoch', 'localtime') as date,
                COUNT(*) as count
            FROM users
            WHERE created_at >= ?
            GROUP BY date(created_at, 'unixepoch', 'localtime')
            ORDER BY date
        """, (start_time,))
        
        for row in cur.fetchall():
            trend.append({
                "date": row[0],
                "new_users": row[1],
            })
        
        # Get daily login counts
        cur = conn.execute("""
            SELECT 
                date(created_at, 'unixepoch', 'localtime') as date,
                COUNT(*) as count
            FROM user_sessions
            WHERE created_at >= ?
            GROUP BY date(created_at, 'unixepoch', 'localtime')
            ORDER BY date
        """, (start_time,))
        
        login_by_date = {row[0]: row[1] for row in cur.fetchall()}
        
        # Merge login data into trend
        for item in trend:
            item["logins"] = login_by_date.get(item["date"], 0)
        
    except Exception as e:
        return {"ok": False, "error": str(e)}
    
    return {"ok": True, "trend": trend, "days": days}


@router.get("/users/list")
async def get_user_list(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    auth_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
):
    """Get paginated user list."""
    conn = _get_user_db_conn()
    offset = (page - 1) * page_size
    
    users = []
    total = 0
    
    try:
        # Build query conditions
        conditions = []
        params = []
        
        if auth_type:
            if auth_type == "anonymous":
                conditions.append("""
                    u.id NOT IN (SELECT DISTINCT user_id FROM user_auth_methods)
                """)
            else:
                conditions.append("""
                    u.id IN (SELECT user_id FROM user_auth_methods WHERE auth_type = ?)
                """)
                params.append(auth_type)
        
        if search:
            conditions.append("(u.nickname LIKE ? OR u.email LIKE ?)")
            params.extend([f"%{search}%", f"%{search}%"])
        
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        
        # Get total count
        count_query = f"SELECT COUNT(DISTINCT u.id) FROM users u {where_clause}"
        cur = conn.execute(count_query, params)
        total = cur.fetchone()[0]
        
        # Get users
        query = f"""
            SELECT u.id, u.nickname, u.email, u.avatar_url, u.created_at, u.updated_at,
                   GROUP_CONCAT(DISTINCT a.auth_type) as auth_types
            FROM users u
            LEFT JOIN user_auth_methods a ON u.id = a.user_id
            {where_clause}
            GROUP BY u.id
            ORDER BY u.created_at DESC
            LIMIT ? OFFSET ?
        """
        params.extend([page_size, offset])
        
        cur = conn.execute(query, params)
        columns = [desc[0] for desc in cur.description]
        
        for row in cur.fetchall():
            user = dict(zip(columns, row))
            user["auth_types"] = user["auth_types"].split(",") if user["auth_types"] else []
            users.append(user)
        
    except Exception as e:
        return {"ok": False, "error": str(e)}
    
    return {
        "ok": True,
        "users": users,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }


@router.get("/users/activity")
async def get_user_activity(
    request: Request,
    days: int = Query(7, ge=1, le=30),
):
    """Get user activity statistics (DAU, sessions by device)."""
    conn = _get_user_db_conn()
    now = int(time.time())
    start_time = now - (days * 86400)
    
    activity = {
        "dau": [],  # Daily Active Users
        "by_device": {},
    }
    
    try:
        # DAU - unique users with sessions per day
        cur = conn.execute("""
            SELECT 
                date(created_at, 'unixepoch', 'localtime') as date,
                COUNT(DISTINCT user_id) as active_users
            FROM user_sessions
            WHERE created_at >= ?
            GROUP BY date(created_at, 'unixepoch', 'localtime')
            ORDER BY date
        """, (start_time,))
        
        for row in cur.fetchall():
            activity["dau"].append({
                "date": row[0],
                "active_users": row[1],
            })
        
        # Sessions by device (extract from device_info)
        cur = conn.execute("""
            SELECT device_info, COUNT(*) as count
            FROM user_sessions
            WHERE created_at >= ?
            GROUP BY device_info
            ORDER BY count DESC
            LIMIT 20
        """, (start_time,))
        
        for row in cur.fetchall():
            device = _parse_device(row[0])
            if device not in activity["by_device"]:
                activity["by_device"][device] = 0
            activity["by_device"][device] += row[1]
        
    except Exception as e:
        return {"ok": False, "error": str(e)}
    
    return {"ok": True, "activity": activity, "days": days}


def _parse_device(user_agent: str) -> str:
    """Parse device type from User-Agent string."""
    if not user_agent:
        return "Unknown"
    
    ua_lower = user_agent.lower()
    
    if "mobile" in ua_lower or "android" in ua_lower or "iphone" in ua_lower:
        return "Mobile"
    elif "tablet" in ua_lower or "ipad" in ua_lower:
        return "Tablet"
    elif "bot" in ua_lower or "spider" in ua_lower or "crawler" in ua_lower:
        return "Bot"
    else:
        return "Desktop"
