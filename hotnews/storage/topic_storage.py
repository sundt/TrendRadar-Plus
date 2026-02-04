"""
Topic Tracker Storage - Database operations for topic tracking feature.

Tables:
- topic_configs: User's topic configurations
- topic_rss_sources: Association between topics and RSS sources
"""

import json
import time
import uuid
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)


def init_topic_tables(conn) -> None:
    """
    Initialize topic tracking tables.
    
    Args:
        conn: SQLite database connection
    """
    # topic_configs table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS topic_configs (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            icon TEXT DEFAULT '🏷️',
            keywords TEXT NOT NULL,
            enabled INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_topic_configs_user ON topic_configs(user_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_topic_configs_enabled ON topic_configs(enabled)")
    
    # topic_rss_sources table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS topic_rss_sources (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            topic_id TEXT NOT NULL,
            rss_source_id TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            FOREIGN KEY (topic_id) REFERENCES topic_configs(id) ON DELETE CASCADE,
            UNIQUE(topic_id, rss_source_id)
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_topic_rss_topic ON topic_rss_sources(topic_id)")
    
    conn.commit()
    logger.info("Topic tracking tables initialized")


class TopicStorage:
    """Storage operations for topic tracking."""
    
    def __init__(self, conn):
        """
        Initialize storage.
        
        Args:
            conn: SQLite database connection (user_db or online_db)
        """
        self.conn = conn
    
    def create_topic(
        self,
        user_id: str,
        name: str,
        keywords: List[str],
        icon: str = "🏷️",
        rss_source_ids: List[str] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Create a new topic configuration.
        
        Args:
            user_id: User ID
            name: Topic name
            keywords: List of keywords
            icon: Emoji icon
            rss_source_ids: List of RSS source IDs to associate
            
        Returns:
            Created topic dict or None if failed
        """
        now = int(time.time())
        topic_id = str(uuid.uuid4())
        
        try:
            self.conn.execute(
                """
                INSERT INTO topic_configs (id, user_id, name, icon, keywords, enabled, sort_order, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)
                """,
                (topic_id, user_id, name, icon, json.dumps(keywords), now, now)
            )
            
            # Associate RSS sources
            if rss_source_ids:
                for source_id in rss_source_ids:
                    self.conn.execute(
                        """
                        INSERT OR IGNORE INTO topic_rss_sources (topic_id, rss_source_id, created_at)
                        VALUES (?, ?, ?)
                        """,
                        (topic_id, source_id, now)
                    )
            
            self.conn.commit()
            
            return {
                "id": topic_id,
                "user_id": user_id,
                "name": name,
                "icon": icon,
                "keywords": keywords,
                "enabled": True,
                "sort_order": 0,
                "rss_sources": rss_source_ids or [],
                "created_at": now,
                "updated_at": now
            }
        except Exception as e:
            logger.error(f"Failed to create topic: {e}")
            self.conn.rollback()
            return None
    
    def get_topics_by_user(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all topics for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            List of topic dicts
        """
        cur = self.conn.execute(
            """
            SELECT id, user_id, name, icon, keywords, enabled, sort_order, created_at, updated_at
            FROM topic_configs
            WHERE user_id = ?
            ORDER BY sort_order ASC, created_at DESC
            """,
            (user_id,)
        )
        
        topics = []
        for row in cur.fetchall():
            topic = {
                "id": row[0],
                "user_id": row[1],
                "name": row[2],
                "icon": row[3],
                "keywords": json.loads(row[4]) if row[4] else [],
                "enabled": bool(row[5]),
                "sort_order": row[6],
                "created_at": row[7],
                "updated_at": row[8],
                "rss_sources": []
            }
            
            # Get associated RSS sources
            src_cur = self.conn.execute(
                "SELECT rss_source_id FROM topic_rss_sources WHERE topic_id = ?",
                (topic["id"],)
            )
            topic["rss_sources"] = [r[0] for r in src_cur.fetchall()]
            
            topics.append(topic)
        
        return topics
    
    def get_topic_by_id(self, topic_id: str, user_id: str = None) -> Optional[Dict[str, Any]]:
        """
        Get a topic by ID.
        
        Args:
            topic_id: Topic ID
            user_id: Optional user ID for permission check
            
        Returns:
            Topic dict or None
        """
        query = "SELECT id, user_id, name, icon, keywords, enabled, sort_order, created_at, updated_at FROM topic_configs WHERE id = ?"
        params = [topic_id]
        
        if user_id:
            query += " AND user_id = ?"
            params.append(user_id)
        
        cur = self.conn.execute(query, params)
        row = cur.fetchone()
        
        if not row:
            return None
        
        topic = {
            "id": row[0],
            "user_id": row[1],
            "name": row[2],
            "icon": row[3],
            "keywords": json.loads(row[4]) if row[4] else [],
            "enabled": bool(row[5]),
            "sort_order": row[6],
            "created_at": row[7],
            "updated_at": row[8],
            "rss_sources": []
        }
        
        # Get associated RSS sources
        src_cur = self.conn.execute(
            "SELECT rss_source_id FROM topic_rss_sources WHERE topic_id = ?",
            (topic_id,)
        )
        topic["rss_sources"] = [r[0] for r in src_cur.fetchall()]
        
        return topic
    
    def update_topic(
        self,
        topic_id: str,
        user_id: str,
        name: str = None,
        icon: str = None,
        keywords: List[str] = None,
        enabled: bool = None,
        sort_order: int = None,
        rss_source_ids: List[str] = None
    ) -> bool:
        """
        Update a topic configuration.
        
        Args:
            topic_id: Topic ID
            user_id: User ID (for permission check)
            name: New name
            icon: New icon
            keywords: New keywords
            enabled: New enabled status
            sort_order: New sort order
            rss_source_ids: New RSS source IDs (replaces existing)
            
        Returns:
            True if updated successfully
        """
        # Check ownership
        existing = self.get_topic_by_id(topic_id, user_id)
        if not existing:
            return False
        
        now = int(time.time())
        updates = []
        params = []
        
        if name is not None:
            updates.append("name = ?")
            params.append(name)
        
        if icon is not None:
            updates.append("icon = ?")
            params.append(icon)
        
        if keywords is not None:
            updates.append("keywords = ?")
            params.append(json.dumps(keywords))
        
        if enabled is not None:
            updates.append("enabled = ?")
            params.append(1 if enabled else 0)
        
        if sort_order is not None:
            updates.append("sort_order = ?")
            params.append(sort_order)
        
        if not updates and rss_source_ids is None:
            return True  # Nothing to update
        
        try:
            if updates:
                updates.append("updated_at = ?")
                params.append(now)
                params.append(topic_id)
                params.append(user_id)
                
                self.conn.execute(
                    f"UPDATE topic_configs SET {', '.join(updates)} WHERE id = ? AND user_id = ?",
                    params
                )
            
            # Update RSS sources if provided
            if rss_source_ids is not None:
                # Remove existing associations
                self.conn.execute(
                    "DELETE FROM topic_rss_sources WHERE topic_id = ?",
                    (topic_id,)
                )
                # Add new associations
                for source_id in rss_source_ids:
                    self.conn.execute(
                        "INSERT OR IGNORE INTO topic_rss_sources (topic_id, rss_source_id, created_at) VALUES (?, ?, ?)",
                        (topic_id, source_id, now)
                    )
            
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to update topic {topic_id}: {e}")
            self.conn.rollback()
            return False
    
    def delete_topic(self, topic_id: str, user_id: str) -> bool:
        """
        Delete a topic.
        
        Args:
            topic_id: Topic ID
            user_id: User ID (for permission check)
            
        Returns:
            True if deleted successfully
        """
        try:
            # Delete RSS source associations first
            self.conn.execute(
                "DELETE FROM topic_rss_sources WHERE topic_id = ?",
                (topic_id,)
            )
            
            # Delete topic
            cur = self.conn.execute(
                "DELETE FROM topic_configs WHERE id = ? AND user_id = ?",
                (topic_id, user_id)
            )
            
            self.conn.commit()
            return cur.rowcount > 0
        except Exception as e:
            logger.error(f"Failed to delete topic {topic_id}: {e}")
            self.conn.rollback()
            return False
    
    def add_rss_source_to_topic(self, topic_id: str, rss_source_id: str) -> bool:
        """Add an RSS source to a topic."""
        now = int(time.time())
        try:
            self.conn.execute(
                "INSERT OR IGNORE INTO topic_rss_sources (topic_id, rss_source_id, created_at) VALUES (?, ?, ?)",
                (topic_id, rss_source_id, now)
            )
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to add RSS source to topic: {e}")
            return False
    
    def remove_rss_source_from_topic(self, topic_id: str, rss_source_id: str) -> bool:
        """Remove an RSS source from a topic."""
        try:
            self.conn.execute(
                "DELETE FROM topic_rss_sources WHERE topic_id = ? AND rss_source_id = ?",
                (topic_id, rss_source_id)
            )
            self.conn.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to remove RSS source from topic: {e}")
            return False
