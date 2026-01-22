"""
User Keyword Service - Custom keyword subscription for personalized content.

Users can add keywords to track specific topics, people, products, etc.
The system matches news entries against these keywords.
"""

import re
import time
import json
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)


class UserKeywordService:
    """Service for managing user custom keywords."""
    
    def __init__(self, user_db_conn, online_db_conn=None):
        """
        Initialize the service.
        
        Args:
            user_db_conn: SQLite connection to user.db
            online_db_conn: SQLite connection to online.db (for tag lookups)
        """
        self.user_db = user_db_conn
        self.online_db = online_db_conn
    
    def add_keyword(
        self,
        user_id: int,
        keyword: str,
        keyword_type: str = "exact",
        priority: int = 0,
        **options
    ) -> Optional[int]:
        """
        Add a keyword for a user.
        
        Args:
            user_id: User ID
            keyword: The keyword to track
            keyword_type: 'exact', 'fuzzy', or 'semantic'
            priority: Priority level (-10 to 10)
            **options: Additional options (case_sensitive, match_whole_word, etc.)
            
        Returns:
            Keyword ID if successful, None otherwise
        """
        keyword = (keyword or "").strip()
        if not keyword or len(keyword) < 2:
            logger.warning(f"Invalid keyword: '{keyword}'")
            return None
        
        if len(keyword) > 50:
            keyword = keyword[:50]
        
        now = int(time.time())
        
        try:
            cur = self.user_db.execute(
                """
                INSERT INTO user_keywords
                (user_id, keyword, keyword_type, priority, case_sensitive,
                 match_whole_word, is_exclude, auto_expand, enabled, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                """,
                (
                    user_id,
                    keyword,
                    keyword_type,
                    max(-10, min(10, priority)),
                    1 if options.get("case_sensitive") else 0,
                    1 if options.get("match_whole_word") else 0,
                    1 if options.get("is_exclude") else 0,
                    1 if options.get("auto_expand", True) else 0,
                    now,
                    now,
                )
            )
            self.user_db.commit()
            
            keyword_id = cur.lastrowid
            logger.info(f"User {user_id} added keyword: '{keyword}' (ID={keyword_id})")
            
            # Skip related tags lookup for now - it's slow and not critical
            # self._update_related_tags(keyword_id, keyword)
            
            return keyword_id
            
        except Exception as e:
            if "UNIQUE constraint" in str(e):
                logger.info(f"Keyword '{keyword}' already exists for user {user_id}")
                # Return existing keyword ID
                cur = self.user_db.execute(
                    "SELECT id FROM user_keywords WHERE user_id = ? AND keyword = ?",
                    (user_id, keyword)
                )
                row = cur.fetchone()
                return row[0] if row else None
            logger.error(f"Failed to add keyword: {e}")
            return None
    
    def get_user_keywords(
        self,
        user_id: int,
        enabled_only: bool = True,
        include_stats: bool = False
    ) -> List[Dict]:
        """
        Get all keywords for a user.
        
        Args:
            user_id: User ID
            enabled_only: Only return enabled keywords
            include_stats: Include match statistics
            
        Returns:
            List of keyword dictionaries
        """
        query = "SELECT * FROM user_keywords WHERE user_id = ?"
        params = [user_id]
        
        if enabled_only:
            query += " AND enabled = 1"
        
        query += " ORDER BY priority DESC, created_at DESC"
        
        cur = self.user_db.execute(query, params)
        columns = [desc[0] for desc in cur.description]
        
        results = []
        for row in cur.fetchall():
            item = dict(zip(columns, row))
            # Parse JSON fields
            try:
                item["related_tags"] = json.loads(item.get("related_tags") or "[]")
            except:
                item["related_tags"] = []
            results.append(item)
        
        return results
    
    def update_keyword(self, keyword_id: int, user_id: int, **updates) -> bool:
        """
        Update a keyword's settings.
        
        Args:
            keyword_id: Keyword ID
            user_id: User ID (for verification)
            **updates: Fields to update
            
        Returns:
            True if updated successfully
        """
        allowed_fields = [
            "keyword", "keyword_type", "priority", "case_sensitive",
            "match_whole_word", "is_exclude", "auto_expand", "enabled"
        ]
        
        set_clause = []
        values = []
        
        for field, value in updates.items():
            if field in allowed_fields:
                set_clause.append(f"{field} = ?")
                values.append(value)
        
        if not set_clause:
            return False
        
        set_clause.append("updated_at = ?")
        values.append(int(time.time()))
        values.extend([keyword_id, user_id])
        
        try:
            self.user_db.execute(
                f"UPDATE user_keywords SET {', '.join(set_clause)} WHERE id = ? AND user_id = ?",
                values
            )
            self.user_db.commit()
            return True
        except Exception as e:
            logger.error(f"Failed to update keyword {keyword_id}: {e}")
            return False
    
    def delete_keyword(self, keyword_id: int, user_id: int) -> bool:
        """
        Delete a keyword.
        
        Args:
            keyword_id: Keyword ID
            user_id: User ID (for verification)
            
        Returns:
            True if deleted successfully
        """
        try:
            self.user_db.execute(
                "DELETE FROM user_keywords WHERE id = ? AND user_id = ?",
                (keyword_id, user_id)
            )
            self.user_db.commit()
            logger.info(f"Deleted keyword {keyword_id} for user {user_id}")
            return True
        except Exception as e:
            logger.error(f"Failed to delete keyword {keyword_id}: {e}")
            return False
    
    def match_entry(self, entry: Dict, user_keywords: List[Dict]) -> List[Dict]:
        """
        Match a news entry against user keywords.
        
        Args:
            entry: News entry with 'title' and optionally 'description'
            user_keywords: List of user keyword configs
            
        Returns:
            List of matches with keyword info and scores
        """
        matches = []
        
        title = str(entry.get("title") or "")
        description = str(entry.get("description") or entry.get("summary") or "")
        text = f"{title} {description}"
        
        for kw_config in user_keywords:
            if not kw_config.get("enabled", True):
                continue
            
            keyword = kw_config.get("keyword", "")
            if not keyword:
                continue
            
            match_result = self._match_keyword(text, keyword, kw_config)
            
            if match_result:
                matches.append({
                    "keyword_id": kw_config["id"],
                    "keyword": keyword,
                    "match_type": match_result["type"],
                    "match_score": match_result["score"],
                    "priority": kw_config.get("priority", 0),
                    "is_exclude": kw_config.get("is_exclude", 0),
                })
        
        return matches
    
    def _match_keyword(self, text: str, keyword: str, config: Dict) -> Optional[Dict]:
        """
        Match a single keyword against text.
        
        Args:
            text: Text to search in
            keyword: Keyword to find
            config: Keyword configuration
            
        Returns:
            Match result dict or None
        """
        keyword_type = config.get("keyword_type", "exact")
        case_sensitive = config.get("case_sensitive", 0)
        match_whole_word = config.get("match_whole_word", 0)
        
        search_text = text if case_sensitive else text.lower()
        search_keyword = keyword if case_sensitive else keyword.lower()
        
        if keyword_type == "exact":
            if match_whole_word:
                # Word boundary match
                pattern = r'\b' + re.escape(search_keyword) + r'\b'
                if re.search(pattern, search_text):
                    return {"type": "exact", "score": 1.0}
            else:
                # Simple substring match
                if search_keyword in search_text:
                    return {"type": "exact", "score": 1.0}
        
        elif keyword_type == "fuzzy":
            # Fuzzy matching using simple similarity
            words = re.findall(r'\w+', search_text)
            best_score = 0.0
            
            for word in words:
                if len(word) < 2:
                    continue
                # Simple character overlap ratio
                common = set(search_keyword) & set(word)
                if common:
                    score = len(common) / max(len(search_keyword), len(word))
                    if score > best_score:
                        best_score = score
            
            if best_score > 0.7:
                return {"type": "fuzzy", "score": best_score}
        
        return None
    
    def _update_related_tags(self, keyword_id: int, keyword: str):
        """Find and update related tags for a keyword."""
        if not self.online_db:
            return
        
        try:
            # Search for tags containing the keyword
            cur = self.online_db.execute(
                """
                SELECT id FROM tags
                WHERE enabled = 1
                  AND (LOWER(name) LIKE ? OR LOWER(name_en) LIKE ? OR LOWER(description) LIKE ?)
                LIMIT 5
                """,
                (f"%{keyword.lower()}%", f"%{keyword.lower()}%", f"%{keyword.lower()}%")
            )
            
            tag_ids = [row[0] for row in cur.fetchall()]
            
            if tag_ids:
                self.user_db.execute(
                    "UPDATE user_keywords SET related_tags = ? WHERE id = ?",
                    (json.dumps(tag_ids), keyword_id)
                )
                self.user_db.commit()
                logger.info(f"Found related tags for '{keyword}': {tag_ids}")
        except Exception as e:
            logger.warning(f"Failed to find related tags: {e}")
    
    def get_keyword_stats(self, user_id: int) -> Dict:
        """
        Get keyword statistics for a user.
        
        Args:
            user_id: User ID
            
        Returns:
            Statistics dictionary
        """
        cur = self.user_db.execute(
            """
            SELECT
                COUNT(*) as total_keywords,
                SUM(match_count) as total_matches,
                COUNT(CASE WHEN match_count > 0 THEN 1 END) as active_keywords,
                COUNT(CASE WHEN enabled = 1 THEN 1 END) as enabled_keywords
            FROM user_keywords
            WHERE user_id = ?
            """,
            (user_id,)
        )
        row = cur.fetchone()
        
        return {
            "total_keywords": row[0] or 0,
            "total_matches": row[1] or 0,
            "active_keywords": row[2] or 0,
            "enabled_keywords": row[3] or 0,
        }
    
    def increment_match_count(self, keyword_id: int):
        """Increment match count for a keyword."""
        now = int(time.time())
        try:
            self.user_db.execute(
                """
                UPDATE user_keywords
                SET match_count = match_count + 1, last_matched_at = ?
                WHERE id = ?
                """,
                (now, keyword_id)
            )
            self.user_db.commit()
        except Exception as e:
            logger.error(f"Failed to increment match count: {e}")
