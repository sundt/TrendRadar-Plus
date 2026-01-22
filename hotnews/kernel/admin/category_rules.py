# coding=utf-8
"""
Platform Category Rules Engine

Automatically assigns categories to platforms using regex pattern matching.
Priority: manual override > rule matching > default category
"""
import re
import sqlite3
from typing import List, Dict, Any, Optional
from pathlib import Path


def get_category_for_platform(
    conn: sqlite3.Connection,
    platform_id: str,
    platform_name: str = ""
) -> str:
    """
    Determine category for a platform using priority chain:
    1. Manual override (category_override field)
    2. Rule matching (platform_category_rules)
    3. Default category ('general')
    """
    # 1. Check manual override
    override = _get_platform_override(conn, platform_id)
    if override:
        return override
    
    # 2. Rule matching
    category = _match_rules(conn, platform_id, platform_name)
    if category:
        return category
    
    # 3. Default
    return "general"


def _get_platform_override(conn: sqlite3.Connection, platform_id: str) -> Optional[str]:
    """Get manual category override for platform."""
    try:
        cur = conn.execute(
            "SELECT category_override FROM newsnow_platforms WHERE id = ? AND category_override != ''",
            (platform_id,)
        )
        row = cur.fetchone()
        return row[0] if row else None
    except Exception:
        return None


def _match_rules(conn: sqlite3.Connection, platform_id: str, platform_name: str) -> Optional[str]:
    """Match platform against rules, return first matching category."""
    try:
        cur = conn.execute(
            """SELECT pattern, category_id 
               FROM platform_category_rules 
               WHERE enabled = 1 
               ORDER BY priority DESC, id ASC"""
        )
        rules = cur.fetchall()
        
        for pattern, category_id in rules:
            try:
                # Match against both ID and name
                if re.search(pattern, platform_id, re.IGNORECASE):
                    return category_id
                if platform_name and re.search(pattern, platform_name, re.IGNORECASE):
                    return category_id
            except re.error:
                # Invalid regex, skip
                continue
        
        return None
    except Exception:
        return None


def get_all_rules(conn: sqlite3.Connection) -> List[Dict[str, Any]]:
    """Get all category rules."""
    try:
        cur = conn.execute(
            """SELECT id, pattern, category_id, priority, enabled, description, created_at, updated_at
               FROM platform_category_rules
               ORDER BY priority DESC, id ASC"""
        )
        rules = []
        for row in cur.fetchall():
            rules.append({
                "id": row[0],
                "pattern": row[1],
                "category_id": row[2],
                "priority": row[3],
                "enabled": bool(row[4]),
                "description": row[5] or "",
                "created_at": row[6],
                "updated_at": row[7]
            })
        return rules
    except Exception:
        return []


def create_rule(
    conn: sqlite3.Connection,
    pattern: str,
    category_id: str,
    priority: int = 0,
    description: str = ""
) -> int:
    """Create a new category rule. Returns rule ID."""
    from datetime import datetime
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    
    # Validate regex
    try:
        re.compile(pattern)
    except re.error as e:
        raise ValueError(f"Invalid regex pattern: {e}")
    
    cur = conn.execute(
        """INSERT INTO platform_category_rules (pattern, category_id, priority, description, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (pattern, category_id, priority, description, now, now)
    )
    conn.commit()
    return cur.lastrowid


def update_rule(
    conn: sqlite3.Connection,
    rule_id: int,
    pattern: Optional[str] = None,
    category_id: Optional[str] = None,
    priority: Optional[int] = None,
    enabled: Optional[bool] = None,
    description: Optional[str] = None
) -> bool:
    """Update an existing rule."""
    from datetime import datetime
    
    # Validate regex if pattern is being updated
    if pattern is not None:
        try:
            re.compile(pattern)
        except re.error as e:
            raise ValueError(f"Invalid regex pattern: {e}")
    
    updates = []
    params = []
    
    if pattern is not None:
        updates.append("pattern = ?")
        params.append(pattern)
    if category_id is not None:
        updates.append("category_id = ?")
        params.append(category_id)
    if priority is not None:
        updates.append("priority = ?")
        params.append(priority)
    if enabled is not None:
        updates.append("enabled = ?")
        params.append(1 if enabled else 0)
    if description is not None:
        updates.append("description = ?")
        params.append(description)
    
    if not updates:
        return False
    
    updates.append("updated_at = ?")
    params.append(datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
    params.append(rule_id)
    
    conn.execute(
        f"UPDATE platform_category_rules SET {', '.join(updates)} WHERE id = ?",
        params
    )
    conn.commit()
    return True


def delete_rule(conn: sqlite3.Connection, rule_id: int) -> bool:
    """Delete a rule."""
    conn.execute("DELETE FROM platform_category_rules WHERE id = ?", (rule_id,))
    conn.commit()
    return True


def test_rule(pattern: str, test_id: str, test_name: str = "") -> bool:
    """Test if a pattern matches given platform ID/name."""
    try:
        regex = re.compile(pattern, re.IGNORECASE)
        return bool(regex.search(test_id) or (test_name and regex.search(test_name)))
    except re.error:
        return False


def initialize_default_rules(conn: sqlite3.Connection) -> int:
    """Initialize default category rules. Returns number of rules created."""
    default_rules = [
        ("hupu|nba|sport", "sports", 100, "体育相关平台"),
        ("weibo|douyin|bilibili|zhihu|tieba|douban", "social", 90, "社交娱乐平台"),
        ("wallstreetcn|cls|gelonghui|xueqiu|jin10", "finance", 90, "财经投资平台"),
        ("ithome|juejin|github|hackernews|v2ex|sspai|36kr|producthunt|freebuf", "tech_news", 90, "科技资讯平台"),
        ("toutiao|baidu|thepaper|ifeng|cankaoxiaoxi|zaobao|tencent", "general", 80, "综合新闻平台"),
    ]
    
    created = 0
    for pattern, category_id, priority, description in default_rules:
        try:
            create_rule(conn, pattern, category_id, priority, description)
            created += 1
        except Exception:
            # Rule might already exist or other error
            continue
    
    return created
