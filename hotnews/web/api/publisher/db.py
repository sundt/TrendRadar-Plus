# coding=utf-8
"""
Publisher Database Module

Handles database operations for user articles (drafts and published).
All data stored in online.db for consistency.
"""

import time
import uuid
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

# Constants
TITLE_MAX_LENGTH = 100
DIGEST_MAX_LENGTH = 200
CONTENT_MAX_LENGTH = 100000  # ~10万字


def _now_ts() -> int:
    return int(time.time())


def _gen_id() -> str:
    return str(uuid.uuid4())


# ==================== User Source Operations ====================

def ensure_user_source(conn, user_id: int, nickname: str) -> str:
    """
    Ensure user's RSS source exists, create if not.
    
    Args:
        conn: online.db connection
        user_id: User ID
        nickname: User's display name
        
    Returns:
        source_id: user_{user_id}
    """
    source_id = f"user_{user_id}"
    now = _now_ts()
    
    # Check if source exists
    cur = conn.execute("SELECT id FROM rss_sources WHERE id = ?", (source_id,))
    if cur.fetchone():
        # Update name if changed
        conn.execute(
            "UPDATE rss_sources SET name = ?, updated_at = ? WHERE id = ?",
            (f"{nickname}的博客", now, source_id)
        )
    else:
        # Create new source
        conn.execute("""
            INSERT INTO rss_sources (
                id, name, url, host, category, cadence, source_type, enabled, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            source_id,
            f"{nickname}的博客",
            f"internal://user/{user_id}",
            "hotnews.local",
            "explore",
            "P0",
            "user",
            1,
            now,
            now
        ))
    
    conn.commit()
    return source_id


# ==================== Article CRUD Operations ====================

def create_article(
    conn,
    user_id: int,
    source_id: str,
    title: str = "",
    digest: str = "",
    cover_url: str = "",
    html_content: str = "",
    markdown_content: str = "",
    import_type: str = "manual",
    import_source_id: str = "",
    import_source_url: str = "",
) -> Dict[str, Any]:
    """Create a new article (draft)."""
    now = _now_ts()
    article_id = _gen_id()
    
    conn.execute("""
        INSERT INTO user_articles (
            id, user_id, source_id, title, digest, cover_url, html_content, markdown_content,
            import_type, import_source_id, import_source_url, status, version,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', 1, ?, ?)
    """, (
        article_id, user_id, source_id, title, digest, cover_url, html_content, markdown_content,
        import_type, import_source_id, import_source_url, now, now
    ))
    conn.commit()
    
    return {
        "id": article_id,
        "user_id": user_id,
        "source_id": source_id,
        "title": title,
        "digest": digest,
        "cover_url": cover_url,
        "status": "draft",
        "version": 1,
        "created_at": now,
        "updated_at": now,
    }


def get_article(conn, article_id: str) -> Optional[Dict[str, Any]]:
    """Get an article by ID."""
    cur = conn.execute("""
        SELECT id, user_id, source_id, title, digest, cover_url, html_content, markdown_content,
               import_type, import_source_id, import_source_url, status, version,
               view_count, published_at, created_at, updated_at
        FROM user_articles WHERE id = ?
    """, (article_id,))
    row = cur.fetchone()
    
    if not row:
        return None
    
    return {
        "id": row[0],
        "user_id": row[1],
        "source_id": row[2],
        "title": row[3],
        "digest": row[4],
        "cover_url": row[5],
        "html_content": row[6],
        "markdown_content": row[7],
        "import_type": row[8],
        "import_source_id": row[9],
        "import_source_url": row[10],
        "status": row[11],
        "version": row[12],
        "view_count": row[13],
        "published_at": row[14],
        "created_at": row[15],
        "updated_at": row[16],
    }


def get_published_article(conn, article_id: str) -> Optional[Dict[str, Any]]:
    """Get a published article by ID (public access)."""
    cur = conn.execute("""
        SELECT a.id, a.user_id, a.source_id, a.title, a.digest, a.cover_url, 
               a.html_content, a.view_count, a.published_at, a.created_at,
               s.name as author_name
        FROM user_articles a
        LEFT JOIN rss_sources s ON a.source_id = s.id
        WHERE a.id = ? AND a.status = 'published'
    """, (article_id,))
    row = cur.fetchone()
    
    if not row:
        return None
    
    return {
        "id": row[0],
        "user_id": row[1],
        "source_id": row[2],
        "title": row[3],
        "digest": row[4],
        "cover_url": row[5],
        "html_content": row[6],
        "view_count": row[7],
        "published_at": row[8],
        "created_at": row[9],
        "author_name": row[10],
    }


def list_articles(
    conn,
    user_id: int,
    status: str = "",
    page: int = 1,
    page_size: int = 20,
) -> Tuple[List[Dict[str, Any]], int]:
    """List articles for a user with pagination."""
    offset = (page - 1) * page_size
    
    # Build query
    where_clause = "WHERE user_id = ?"
    params: List[Any] = [user_id]
    
    if status:
        where_clause += " AND status = ?"
        params.append(status)
    
    # Get total count
    cur = conn.execute(f"SELECT COUNT(*) FROM user_articles {where_clause}", params)
    total = cur.fetchone()[0]
    
    # Get items
    cur = conn.execute(f"""
        SELECT id, user_id, source_id, title, digest, cover_url, status, version, 
               view_count, published_at, created_at, updated_at
        FROM user_articles {where_clause}
        ORDER BY updated_at DESC
        LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    
    items = []
    for row in cur.fetchall():
        items.append({
            "id": row[0],
            "user_id": row[1],
            "source_id": row[2],
            "title": row[3],
            "digest": row[4],
            "cover_url": row[5],
            "status": row[6],
            "version": row[7],
            "view_count": row[8],
            "published_at": row[9],
            "created_at": row[10],
            "updated_at": row[11],
        })
    
    return items, total


def update_article(
    conn,
    article_id: str,
    user_id: int,
    expected_version: Optional[int] = None,
    **updates,
) -> Dict[str, Any]:
    """
    Update an article.
    
    Raises:
        ValueError: If article not found or version mismatch
        PermissionError: If user doesn't own the article
    """
    # Get current article
    article = get_article(conn, article_id)
    if not article:
        raise ValueError("文章不存在")
    
    if article["user_id"] != user_id:
        raise PermissionError("无权访问此文章")
    
    # Check version for optimistic locking
    if expected_version is not None and article["version"] != expected_version:
        raise ValueError("文章已被修改，请刷新后重试")
    
    # Build update query
    allowed_fields = {"title", "digest", "cover_url", "html_content", "markdown_content", "status", "published_at"}
    set_parts = []
    params = []
    
    for key, value in updates.items():
        if key in allowed_fields and value is not None:
            set_parts.append(f"{key} = ?")
            params.append(value)
    
    if not set_parts:
        return article
    
    # Always update version and updated_at
    now = _now_ts()
    new_version = article["version"] + 1
    set_parts.extend(["version = ?", "updated_at = ?"])
    params.extend([new_version, now])
    
    # Execute update
    params.append(article_id)
    conn.execute(f"UPDATE user_articles SET {', '.join(set_parts)} WHERE id = ?", params)
    conn.commit()
    
    # Return updated article
    return get_article(conn, article_id)


def delete_article(conn, article_id: str, user_id: int) -> bool:
    """
    Delete an article.
    
    Raises:
        ValueError: If article not found
        PermissionError: If user doesn't own the article
    """
    article = get_article(conn, article_id)
    if not article:
        raise ValueError("文章不存在")
    
    if article["user_id"] != user_id:
        raise PermissionError("无权删除此文章")
    
    conn.execute("DELETE FROM user_articles WHERE id = ?", (article_id,))
    conn.commit()
    return True


def increment_view_count(conn, article_id: str) -> None:
    """Increment article view count."""
    conn.execute(
        "UPDATE user_articles SET view_count = view_count + 1 WHERE id = ?",
        (article_id,)
    )
    conn.commit()


# ==================== Publish Operations ====================

def publish_article(conn, article_id: str, user_id: int) -> Dict[str, Any]:
    """
    Publish an article to explore (精选博客).
    
    This is a single-database transaction:
    1. Update article status to 'published'
    2. Insert/update rss_entries record
    
    Returns:
        Updated article dict with article_url
    """
    article = get_article(conn, article_id)
    if not article:
        raise ValueError("文章不存在")
    
    if article["user_id"] != user_id:
        raise PermissionError("无权发布此文章")
    
    if not article["title"].strip():
        raise ValueError("请输入标题")
    
    # Check content length
    content = article.get("html_content", "")
    if len(content) < 100:
        raise ValueError("内容太短，至少需要100字")
    
    now = _now_ts()
    source_id = article["source_id"]
    
    # 1. Update article status
    conn.execute("""
        UPDATE user_articles 
        SET status = 'published', published_at = ?, updated_at = ?, version = version + 1
        WHERE id = ?
    """, (now, now, article_id))
    
    # 2. Insert/update rss_entries
    conn.execute("""
        INSERT OR REPLACE INTO rss_entries (
            source_id, dedup_key, url, title, 
            published_at, published_raw, fetched_at, created_at,
            description, cover_url, source_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')
    """, (
        source_id,
        article_id,
        f"/article/{article_id}",
        article["title"],
        now,
        datetime.fromtimestamp(now).strftime('%Y-%m-%d %H:%M:%S'),
        now,
        now,
        article.get("digest", ""),
        article.get("cover_url", ""),
    ))
    
    conn.commit()
    
    # Return updated article
    updated = get_article(conn, article_id)
    updated["article_url"] = f"/article/{article_id}"
    return updated


def unpublish_article(conn, article_id: str, user_id: int) -> Dict[str, Any]:
    """
    Unpublish an article (remove from explore).
    
    This is a single-database transaction:
    1. Update article status to 'draft'
    2. Delete rss_entries record
    
    Returns:
        Updated article dict
    """
    article = get_article(conn, article_id)
    if not article:
        raise ValueError("文章不存在")
    
    if article["user_id"] != user_id:
        raise PermissionError("无权操作此文章")
    
    if article["status"] != "published":
        raise ValueError("文章未发布")
    
    now = _now_ts()
    source_id = article["source_id"]
    
    # 1. Update article status
    conn.execute("""
        UPDATE user_articles 
        SET status = 'draft', published_at = NULL, updated_at = ?, version = version + 1
        WHERE id = ?
    """, (now, article_id))
    
    # 2. Delete rss_entries record
    conn.execute(
        "DELETE FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
        (source_id, article_id)
    )
    
    conn.commit()
    
    return get_article(conn, article_id)


# ==================== Admin Operations ====================

def list_all_articles(
    conn,
    status: str = "",
    user_id: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
) -> Tuple[List[Dict[str, Any]], int]:
    """List all articles for admin with pagination."""
    offset = (page - 1) * page_size
    
    # Build query
    where_parts = []
    params: List[Any] = []
    
    if status:
        where_parts.append("a.status = ?")
        params.append(status)
    
    if user_id:
        where_parts.append("a.user_id = ?")
        params.append(user_id)
    
    where_clause = f"WHERE {' AND '.join(where_parts)}" if where_parts else ""
    
    # Get total count
    cur = conn.execute(f"SELECT COUNT(*) FROM user_articles a {where_clause}", params)
    total = cur.fetchone()[0]
    
    # Get items with author name
    cur = conn.execute(f"""
        SELECT a.id, a.user_id, a.title, a.status, a.view_count, 
               a.published_at, a.created_at, s.name as author_name
        FROM user_articles a
        LEFT JOIN rss_sources s ON a.source_id = s.id
        {where_clause}
        ORDER BY a.updated_at DESC
        LIMIT ? OFFSET ?
    """, params + [page_size, offset])
    
    items = []
    for row in cur.fetchall():
        items.append({
            "id": row[0],
            "user_id": row[1],
            "title": row[2],
            "status": row[3],
            "view_count": row[4],
            "published_at": row[5],
            "created_at": row[6],
            "author_name": row[7] or "未知用户",
        })
    
    return items, total


def admin_unpublish_article(conn, article_id: str) -> Dict[str, Any]:
    """Admin unpublish an article (no permission check)."""
    article = get_article(conn, article_id)
    if not article:
        raise ValueError("文章不存在")
    
    if article["status"] != "published":
        raise ValueError("文章未发布")
    
    now = _now_ts()
    source_id = article["source_id"]
    
    # 1. Update article status
    conn.execute("""
        UPDATE user_articles 
        SET status = 'draft', published_at = NULL, updated_at = ?, version = version + 1
        WHERE id = ?
    """, (now, article_id))
    
    # 2. Delete rss_entries record
    conn.execute(
        "DELETE FROM rss_entries WHERE source_id = ? AND dedup_key = ?",
        (source_id, article_id)
    )
    
    conn.commit()
    
    return get_article(conn, article_id)


# ==================== Temp Image Operations (unchanged) ====================

def save_temp_image(
    conn,
    user_id: int,
    file_path: str,
    original_name: str = "",
    file_size: int = 0,
    mime_type: str = "",
    expires_hours: int = 168,  # 7 days default
) -> Dict[str, Any]:
    """Save a temp image record."""
    now = _now_ts()
    image_id = _gen_id()
    expires_at = now + (expires_hours * 3600)
    
    conn.execute("""
        INSERT INTO temp_images (id, user_id, file_path, original_name, file_size, mime_type, created_at, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (image_id, user_id, file_path, original_name, file_size, mime_type, now, expires_at))
    conn.commit()
    
    return {
        "id": image_id,
        "file_path": file_path,
        "original_name": original_name,
        "file_size": file_size,
        "mime_type": mime_type,
        "created_at": now,
        "expires_at": expires_at,
    }


def get_temp_image(conn, image_id: str) -> Optional[Dict[str, Any]]:
    """Get a temp image by ID."""
    cur = conn.execute("""
        SELECT id, user_id, file_path, original_name, file_size, mime_type, created_at, expires_at
        FROM temp_images WHERE id = ?
    """, (image_id,))
    row = cur.fetchone()
    
    if not row:
        return None
    
    return {
        "id": row[0],
        "user_id": row[1],
        "file_path": row[2],
        "original_name": row[3],
        "file_size": row[4],
        "mime_type": row[5],
        "created_at": row[6],
        "expires_at": row[7],
    }


def cleanup_expired_images(conn) -> Tuple[int, List[str]]:
    """
    Clean up expired temp images.
    
    Returns:
        (count, file_paths) - Number of deleted records and their file paths
    """
    now = _now_ts()
    
    # Get expired image paths
    cur = conn.execute("SELECT file_path FROM temp_images WHERE expires_at < ?", (now,))
    paths = [row[0] for row in cur.fetchall()]
    
    # Delete records
    cur = conn.execute("DELETE FROM temp_images WHERE expires_at < ?", (now,))
    count = cur.rowcount
    conn.commit()
    
    return count, paths
