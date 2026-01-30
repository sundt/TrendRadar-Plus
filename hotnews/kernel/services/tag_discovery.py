"""
Tag Discovery Service - AI-driven dynamic tag discovery and management.

This service handles:
1. Extracting new tag candidates from AI responses
2. Normalizing and validating tag IDs
3. Saving and updating candidate statistics
4. Promoting candidates to official tags
"""

import re
import time
import json
import logging
from typing import List, Dict, Optional, Any

logger = logging.getLogger(__name__)


# Tag normalization rules
TAG_NORMALIZATION = {
    # Naming pattern: lowercase letters, numbers, underscores
    "pattern": re.compile(r"^[a-z][a-z0-9_]*$"),
    "max_length": 30,
    "min_length": 2,
    
    # Common synonyms to normalize
    "synonyms": {
        "deep_seek": "deepseek",
        "deep-seek": "deepseek",
        "chatgpt": "gpt",
        "chat_gpt": "gpt",
        "chat-gpt": "gpt",
        "openai": "openai",
        "open_ai": "openai",
        "open-ai": "openai",
    },
    
    # Blacklisted terms (not allowed as tags)
    "blacklist": {
        "test", "demo", "example", "temp", "tmp",
        "unknown", "misc", "other", "none", "null",
        "undefined", "error", "todo", "fixme",
    },
}

# English-Chinese keyword mapping for tag linking
# Maps English tag names/IDs to their Chinese equivalents for better news matching
TAG_KEYWORD_MAPPING = {
    # AI & Tech
    "embodied_intelligence": ["具身智能", "Embodied Intelligence", "Embodied AI"],
    "embodied_ai": ["具身智能", "Embodied AI", "具身人工智能"],
    "artificial_intelligence": ["人工智能", "AI"],
    "machine_learning": ["机器学习", "ML"],
    "deep_learning": ["深度学习"],
    "natural_language_processing": ["自然语言处理", "NLP"],
    "computer_vision": ["计算机视觉", "CV"],
    "large_language_model": ["大语言模型", "大模型", "LLM"],
    "generative_ai": ["生成式AI", "生成式人工智能", "AIGC"],
    "autonomous_driving": ["自动驾驶", "无人驾驶"],
    "robotics": ["机器人", "机器人技术"],
    "brain_computer_interface": ["脑机接口", "BCI"],
    "quantum_computing": ["量子计算", "量子计算机"],
    "semiconductor": ["半导体", "芯片"],
    "solid_state_battery": ["固态电池"],
    "commercial_spaceflight": ["商业航天", "商业太空"],
    "commercial_aerospace": ["商业航空航天"],
    "commercial_space": ["商业航天"],
    
    # Companies & Products
    "openai": ["OpenAI"],
    "anthropic": ["Anthropic", "Claude"],
    "deepseek": ["DeepSeek", "深度求索"],
    "minimax": ["MiniMax", "稀宇科技"],
    "moonshot": ["月之暗面", "Moonshot", "Kimi"],
    "baichuan": ["百川智能", "Baichuan"],
    "zhipu": ["智谱AI", "智谱", "GLM"],
    "nvidia": ["英伟达", "NVIDIA"],
    "tesla": ["特斯拉", "Tesla"],
    "tesla_fsd": ["特斯拉FSD", "Tesla FSD", "全自动驾驶"],
    "spacex": ["SpaceX", "太空探索"],
    "apple": ["苹果", "Apple"],
    "google": ["谷歌", "Google"],
    "microsoft": ["微软", "Microsoft"],
    "meta": ["Meta", "脸书"],
    "amazon": ["亚马逊", "Amazon"],
    "huawei": ["华为", "Huawei"],
    "xiaomi": ["小米", "Xiaomi"],
    "xiaomi_su7": ["小米SU7", "小米汽车"],
    "bytedance": ["字节跳动", "ByteDance"],
    "tencent": ["腾讯", "Tencent"],
    "alibaba": ["阿里巴巴", "阿里", "Alibaba"],
    "baidu": ["百度", "Baidu"],
    
    # Models
    "gpt": ["GPT", "ChatGPT"],
    "claude": ["Claude"],
    "gemini": ["Gemini"],
    "llama": ["LLaMA", "Llama"],
    "qwen": ["通义千问", "Qwen"],
    "doubao": ["豆包"],
    "kimi": ["Kimi"],
    "grok": ["Grok"],
    "codex": ["Codex"],
    "optimus": ["Optimus", "擎天柱"],
    
    # Events & Conferences
    "ces": ["CES", "消费电子展"],
    "mwc": ["MWC", "世界移动通信大会"],
    "wwdc": ["WWDC", "苹果开发者大会"],
    "gdc": ["GDC", "游戏开发者大会"],
    "davos": ["达沃斯", "世界经济论坛"],
    
    # Finance & Economy
    "cryptocurrency": ["加密货币", "数字货币"],
    "bitcoin": ["比特币", "Bitcoin", "BTC"],
    "ethereum": ["以太坊", "Ethereum", "ETH"],
    "stock_market": ["股市", "股票市场"],
    "ipo": ["IPO", "首次公开募股"],
    "commodity": ["大宗商品", "商品期货"],
    "gold_price": ["金价", "黄金价格"],
}

# Promotion criteria
PROMOTION_CRITERIA = {
    "min_occurrence": 10,        # At least 10 occurrences
    "min_confidence": 0.7,       # Average confidence >= 0.7
    "min_time_span_days": 3,     # Must persist for 3+ days
}

# Fast-track promotion criteria (for trending topics)
FAST_TRACK_CRITERIA = [
    {
        "hours": 4,              # Within 4 hours
        "min_occurrence": 8,     # At least 8 occurrences
        "min_confidence": 0.9,   # Average confidence >= 0.9
    },
    {
        "hours": 12,             # Within 12 hours
        "min_occurrence": 15,    # At least 15 occurrences
        "min_confidence": 0.9,   # Average confidence >= 0.9
    },
    {
        "hours": 24,             # Within 24 hours
        "min_occurrence": 20,    # At least 20 occurrences
        "min_confidence": 0.8,   # Average confidence >= 0.8
    },
]


class TagDiscoveryService:
    """Service for discovering and managing AI-suggested tags."""
    
    def __init__(self, conn):
        """
        Initialize the service.
        
        Args:
            conn: SQLite database connection (online.db)
        """
        self.conn = conn
    
    def normalize_tag_id(self, tag_id: str) -> Optional[str]:
        """
        Normalize a tag ID to standard format.
        
        Args:
            tag_id: Raw tag ID from AI
            
        Returns:
            Normalized tag ID or None if invalid
        """
        if not tag_id:
            return None
        
        # Convert to lowercase
        normalized = tag_id.lower().strip()
        
        # Replace common separators with underscores
        normalized = re.sub(r'[-\s]+', '_', normalized)
        
        # Remove non-alphanumeric characters except underscores
        normalized = re.sub(r'[^a-z0-9_]', '', normalized)
        
        # Apply synonym mapping
        if normalized in TAG_NORMALIZATION["synonyms"]:
            normalized = TAG_NORMALIZATION["synonyms"][normalized]
        
        # Check blacklist
        if normalized in TAG_NORMALIZATION["blacklist"]:
            logger.debug(f"Tag '{tag_id}' is blacklisted")
            return None
        
        # Check length
        if len(normalized) < TAG_NORMALIZATION["min_length"]:
            logger.debug(f"Tag '{tag_id}' is too short")
            return None
        
        if len(normalized) > TAG_NORMALIZATION["max_length"]:
            normalized = normalized[:TAG_NORMALIZATION["max_length"]]
        
        # Validate pattern
        if not TAG_NORMALIZATION["pattern"].match(normalized):
            logger.debug(f"Tag '{tag_id}' does not match pattern")
            return None
        
        return normalized
    
    def tag_exists(self, tag_id: str) -> bool:
        """Check if a tag already exists in official tags table."""
        cur = self.conn.execute(
            "SELECT 1 FROM tags WHERE id = ? LIMIT 1",
            (tag_id,)
        )
        return cur.fetchone() is not None
    
    def candidate_exists(self, tag_id: str) -> bool:
        """Check if a candidate tag already exists."""
        cur = self.conn.execute(
            "SELECT 1 FROM tag_candidates WHERE tag_id = ? LIMIT 1",
            (tag_id,)
        )
        return cur.fetchone() is not None
    
    def save_candidate(
        self,
        tag_id: str,
        name: str,
        tag_type: str = "topic",
        parent_id: Optional[str] = None,
        description: Optional[str] = None,
        confidence: float = 0.8,
        sample_title: Optional[str] = None,
        keywords: Optional[List[str]] = None,
    ) -> bool:
        """
        Save a new candidate tag or update existing one.
        
        Args:
            tag_id: Normalized tag ID
            name: Display name (Chinese)
            tag_type: 'topic' or 'attribute'
            parent_id: Parent tag ID
            description: Tag description
            confidence: AI confidence score (0-1)
            sample_title: Sample news title that triggered this tag
            keywords: List of search keywords (Chinese/English) for news matching
            
        Returns:
            True if saved/updated, False otherwise
        """
        now = int(time.time())
        
        # Check if already an official tag
        if self.tag_exists(tag_id):
            # Update usage count for official tag
            self.conn.execute(
                """
                UPDATE tags 
                SET usage_count = usage_count + 1, 
                    last_used_at = ?
                WHERE id = ?
                """,
                (now, tag_id)
            )
            self.conn.commit()
            return False
        
        # Check if candidate exists
        if self.candidate_exists(tag_id):
            # Update existing candidate (also update keywords if provided)
            self._update_candidate_stats(tag_id, confidence, sample_title, now, keywords)
            return True
        
        # Create new candidate
        try:
            self.conn.execute(
                """
                INSERT INTO tag_candidates (
                    tag_id, name, name_en, type, parent_id, description,
                    occurrence_count, first_seen_at, last_seen_at,
                    avg_confidence, total_confidence, status,
                    sample_titles, keywords, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)
                """,
                (
                    tag_id, name, tag_id, tag_type, parent_id, description,
                    now, now, confidence, confidence,
                    json.dumps([sample_title] if sample_title else []),
                    json.dumps(keywords or []),
                    now, now
                )
            )
            self.conn.commit()
            
            # Log discovery event
            self._log_evolution(tag_id, "discover", None, {
                "name": name,
                "type": tag_type,
                "confidence": confidence,
                "keywords": keywords,
            })
            
            logger.info(f"Discovered new tag candidate: {tag_id} ({name}), keywords={keywords}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to save candidate {tag_id}: {e}")
            return False
    
    def _normalize_title_for_dedup(self, title: str) -> str:
        """Normalize title for deduplication comparison."""
        if not title:
            return ""
        # Remove punctuation and spaces, convert to lowercase
        return re.sub(r'[^\w\u4e00-\u9fff]', '', title.lower())
    
    def _is_similar_title(self, t1: str, t2: str, threshold: float = 0.85) -> bool:
        """Check if two titles are similar using character overlap."""
        n1, n2 = self._normalize_title_for_dedup(t1), self._normalize_title_for_dedup(t2)
        if not n1 or not n2:
            return False
        # Quick exact match
        if n1 == n2:
            return True
        # Length difference too big
        if abs(len(n1) - len(n2)) > max(len(n1), len(n2)) * 0.2:
            return False
        # Character-based similarity
        shorter, longer = (n1, n2) if len(n1) <= len(n2) else (n2, n1)
        matches = sum(1 for c in shorter if c in longer)
        return matches / len(shorter) >= threshold
    
    def _update_candidate_stats(
        self,
        tag_id: str,
        confidence: float,
        sample_title: Optional[str],
        now: int,
        keywords: Optional[List[str]] = None
    ):
        """Update statistics for an existing candidate.
        
        Deduplicates by title similarity to avoid counting the same news
        from different platforms multiple times.
        Also merges new keywords with existing ones.
        """
        # Get current stats
        cur = self.conn.execute(
            """
            SELECT occurrence_count, total_confidence, sample_titles, keywords
            FROM tag_candidates
            WHERE tag_id = ?
            """,
            (tag_id,)
        )
        row = cur.fetchone()
        if not row:
            return
        
        # Parse existing sample titles
        try:
            sample_titles = json.loads(row[2] or "[]")
        except:
            sample_titles = []
        
        # Parse existing keywords
        try:
            existing_keywords = json.loads(row[3] or "[]")
        except:
            existing_keywords = []
        
        # Merge new keywords with existing (deduplicate)
        if keywords:
            keyword_set = set(existing_keywords)
            for kw in keywords:
                if kw and kw not in keyword_set:
                    existing_keywords.append(kw)
                    keyword_set.add(kw)
        
        # Check if this title is similar to any existing sample title
        # If similar, don't increment occurrence_count (avoid duplicate counting)
        is_duplicate_title = False
        if sample_title:
            for existing_title in sample_titles:
                if self._is_similar_title(sample_title, existing_title):
                    is_duplicate_title = True
                    break
        
        if is_duplicate_title:
            # Only update last_seen_at and keywords, don't increment count
            self.conn.execute(
                """
                UPDATE tag_candidates
                SET last_seen_at = ?, updated_at = ?, keywords = ?
                WHERE tag_id = ?
                """,
                (now, now, json.dumps(existing_keywords), tag_id)
            )
            self.conn.commit()
            return
        
        # Not a duplicate - increment occurrence count
        occurrence_count = row[0] + 1
        total_confidence = row[1] + confidence
        avg_confidence = total_confidence / occurrence_count
        
        # Add new sample title (keep last 10)
        if sample_title and sample_title not in sample_titles:
            sample_titles.append(sample_title)
            sample_titles = sample_titles[-10:]  # Keep last 10
        
        self.conn.execute(
            """
            UPDATE tag_candidates
            SET occurrence_count = ?,
                last_seen_at = ?,
                total_confidence = ?,
                avg_confidence = ?,
                sample_titles = ?,
                keywords = ?,
                updated_at = ?
            WHERE tag_id = ?
            """,
            (
                occurrence_count, now, total_confidence, avg_confidence,
                json.dumps(sample_titles), json.dumps(existing_keywords), now, tag_id
            )
        )
        self.conn.commit()
    
    def extract_and_save_tags(
        self,
        ai_response: Dict[str, Any],
        news_title: Optional[str] = None
    ) -> List[str]:
        """
        Extract suggested tags from AI response and save as candidates.
        
        Args:
            ai_response: AI labeling response containing 'suggested_tags'
            news_title: Original news title for sample
            
        Returns:
            List of successfully saved tag IDs
        """
        suggested_tags = ai_response.get("suggested_tags") or []
        saved_tags = []
        
        for tag_data in suggested_tags:
            if not isinstance(tag_data, dict):
                continue
            
            raw_id = tag_data.get("id", "")
            tag_id = self.normalize_tag_id(raw_id)
            
            if not tag_id:
                continue
            
            name = tag_data.get("name", tag_id)
            tag_type = tag_data.get("type", "topic")
            parent_id = tag_data.get("parent_id")
            description = tag_data.get("description")
            confidence = float(tag_data.get("confidence", 0.8))
            
            if self.save_candidate(
                tag_id=tag_id,
                name=name,
                tag_type=tag_type,
                parent_id=parent_id,
                description=description,
                confidence=confidence,
                sample_title=news_title,
            ):
                saved_tags.append(tag_id)
        
        return saved_tags
    
    def get_candidates(
        self,
        status: str = "pending",
        limit: int = 50,
        order_by: str = "occurrence_count"
    ) -> List[Dict]:
        """
        Get candidate tags with specified status.
        
        Args:
            status: 'pending', 'approved', 'rejected', or 'all'
            limit: Maximum number to return
            order_by: 'occurrence_count', 'avg_confidence', 'created_at'
            
        Returns:
            List of candidate tag dictionaries
        """
        order_map = {
            "occurrence_count": "occurrence_count DESC",
            "avg_confidence": "avg_confidence DESC",
            "created_at": "created_at DESC",
            "last_seen_at": "last_seen_at DESC",
        }
        order_clause = order_map.get(order_by, "occurrence_count DESC")
        
        if status == "all":
            query = f"""
                SELECT * FROM tag_candidates
                ORDER BY {order_clause}
                LIMIT ?
            """
            params = (limit,)
        else:
            query = f"""
                SELECT * FROM tag_candidates
                WHERE status = ?
                ORDER BY {order_clause}
                LIMIT ?
            """
            params = (status, limit)
        
        cur = self.conn.execute(query, params)
        columns = [desc[0] for desc in cur.description]
        
        results = []
        for row in cur.fetchall():
            item = dict(zip(columns, row))
            # Parse JSON fields
            try:
                item["sample_titles"] = json.loads(item.get("sample_titles") or "[]")
            except:
                item["sample_titles"] = []
            results.append(item)
        
        return results
    
    def promote_candidate(self, tag_id: str, icon: str = "🏷️") -> dict:
        """
        Promote a candidate tag to official tag.
        
        Args:
            tag_id: Candidate tag ID
            icon: Emoji icon for the tag
            
        Returns:
            Dict with 'success' bool and 'error' message if failed
        """
        now = int(time.time())
        
        # Get candidate info
        cur = self.conn.execute(
            """
            SELECT tag_id, name, name_en, type, parent_id, description,
                   occurrence_count, avg_confidence
            FROM tag_candidates
            WHERE tag_id = ? AND status = 'pending'
            """,
            (tag_id,)
        )
        row = cur.fetchone()
        if not row:
            # Check if candidate exists with different status
            cur = self.conn.execute(
                "SELECT tag_id, status FROM tag_candidates WHERE tag_id = ?",
                (tag_id,)
            )
            existing = cur.fetchone()
            if existing:
                logger.warning(f"Candidate {tag_id} exists but status is '{existing[1]}', not 'pending'")
                return {"success": False, "error": f"候选标签 '{tag_id}' 状态是 '{existing[1]}'，不是 pending"}
            else:
                logger.warning(f"Candidate {tag_id} not found in tag_candidates table")
                return {"success": False, "error": f"候选标签 '{tag_id}' 不存在"}
        
        # Check if tag already exists in official tags
        cur = self.conn.execute("SELECT 1 FROM tags WHERE id = ?", (tag_id,))
        if cur.fetchone():
            logger.warning(f"Tag {tag_id} already exists in official tags")
            return {"success": False, "error": f"标签 '{tag_id}' 已存在于正式标签中"}
        
        # Check if required columns exist in tags table
        try:
            cur = self.conn.execute("PRAGMA table_info(tags)")
            columns = {row[1] for row in cur.fetchall()}
            required_columns = {'is_dynamic', 'lifecycle', 'usage_count', 'promoted_from'}
            missing = required_columns - columns
            if missing:
                logger.error(f"Missing columns in tags table: {missing}")
                return {"success": False, "error": f"数据库缺少列: {', '.join(missing)}，请重启服务以执行迁移"}
        except Exception as e:
            logger.error(f"Failed to check table schema: {e}")
        
        # Insert into official tags
        try:
            self.conn.execute(
                """
                INSERT INTO tags (
                    id, name, name_en, type, parent_id, icon, description,
                    sort_order, enabled, is_dynamic, lifecycle, usage_count,
                    promoted_from, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 100, 1, 1, 'active', ?, ?, ?, ?)
                """,
                (
                    row[0], row[1], row[2], row[3], row[4], icon, row[5],
                    row[6], tag_id, now, now
                )
            )
            
            # Update candidate status
            self.conn.execute(
                """
                UPDATE tag_candidates
                SET status = 'approved', promoted_at = ?, updated_at = ?
                WHERE tag_id = ?
                """,
                (now, now, tag_id)
            )
            
            self.conn.commit()
            
            # Log promotion
            self._log_evolution(tag_id, "promote", {
                "occurrence_count": row[6],
                "avg_confidence": row[7],
            }, {
                "name": row[1],
                "type": row[3],
            })
            
            logger.info(f"Promoted candidate {tag_id} to official tag")
            
            # Auto-link entries for the new dynamic tag
            linked_count = self.link_tag_to_entries(tag_id, days_back=30)
            logger.info(f"Auto-linked {linked_count} entries for new tag {tag_id}")
            
            return {"success": True, "linked_count": linked_count}
            
        except Exception as e:
            logger.error(f"Failed to promote candidate {tag_id}: {e}")
            self.conn.rollback()
            return {"success": False, "error": f"数据库操作失败: {str(e)}"}
    
    def reject_candidate(self, tag_id: str, reason: str = "") -> bool:
        """
        Reject a candidate tag.
        
        Args:
            tag_id: Candidate tag ID
            reason: Rejection reason
            
        Returns:
            True if rejected successfully
        """
        now = int(time.time())
        
        try:
            self.conn.execute(
                """
                UPDATE tag_candidates
                SET status = 'rejected', rejected_reason = ?, updated_at = ?
                WHERE tag_id = ? AND status = 'pending'
                """,
                (reason, now, tag_id)
            )
            self.conn.commit()
            
            self._log_evolution(tag_id, "reject", None, {"reason": reason})
            
            logger.info(f"Rejected candidate {tag_id}: {reason}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to reject candidate {tag_id}: {e}")
            return False
    
    def get_qualified_candidates(self) -> List[Dict]:
        """
        Get candidates that meet promotion criteria.
        
        Includes both:
        1. Standard criteria (10+ occurrences, 0.7+ confidence, 3+ days)
        2. Fast-track criteria for trending topics:
           - 12h: 15+ occurrences, 0.9+ confidence
           - 24h: 20+ occurrences, 0.8+ confidence
        
        Returns:
            List of qualified candidate dictionaries
        """
        now = int(time.time())
        min_first_seen = now - (PROMOTION_CRITERIA["min_time_span_days"] * 86400)
        
        # Standard criteria query
        cur = self.conn.execute(
            """
            SELECT * FROM tag_candidates
            WHERE status = 'pending'
              AND occurrence_count >= ?
              AND avg_confidence >= ?
              AND first_seen_at <= ?
            ORDER BY occurrence_count DESC
            """,
            (
                PROMOTION_CRITERIA["min_occurrence"],
                PROMOTION_CRITERIA["min_confidence"],
                min_first_seen,
            )
        )
        
        columns = [desc[0] for desc in cur.description]
        results = []
        seen_tag_ids = set()
        
        for row in cur.fetchall():
            item = dict(zip(columns, row))
            item["promotion_reason"] = "standard"
            try:
                item["sample_titles"] = json.loads(item.get("sample_titles") or "[]")
            except:
                item["sample_titles"] = []
            results.append(item)
            seen_tag_ids.add(item.get("tag_id"))
        
        # Fast-track criteria queries
        for criteria in FAST_TRACK_CRITERIA:
            hours = criteria["hours"]
            min_occurrence = criteria["min_occurrence"]
            min_confidence = criteria["min_confidence"]
            
            # Calculate time window - candidates first seen within the last N hours
            min_first_seen_fast = now - (hours * 3600)
            
            cur = self.conn.execute(
                """
                SELECT * FROM tag_candidates
                WHERE status = 'pending'
                  AND occurrence_count >= ?
                  AND avg_confidence >= ?
                  AND first_seen_at >= ?
                ORDER BY occurrence_count DESC
                """,
                (min_occurrence, min_confidence, min_first_seen_fast)
            )
            
            for row in cur.fetchall():
                item = dict(zip(columns, row))
                tag_id = item.get("tag_id")
                
                # Skip if already in results
                if tag_id in seen_tag_ids:
                    continue
                
                item["promotion_reason"] = f"fast_track_{hours}h"
                try:
                    item["sample_titles"] = json.loads(item.get("sample_titles") or "[]")
                except:
                    item["sample_titles"] = []
                results.append(item)
                seen_tag_ids.add(tag_id)
                
                logger.info(f"Fast-track candidate: {tag_id} ({hours}h, {item.get('occurrence_count')} occurrences, {item.get('avg_confidence'):.2f} confidence)")
        
        return results
    
    def get_evolution_logs(
        self,
        tag_id: Optional[str] = None,
        action: Optional[str] = None,
        limit: int = 100
    ) -> List[Dict]:
        """
        Get tag evolution logs.
        
        Args:
            tag_id: Filter by tag ID
            action: Filter by action type
            limit: Maximum number to return
            
        Returns:
            List of log entries
        """
        conditions = []
        params = []
        
        if tag_id:
            conditions.append("tag_id = ?")
            params.append(tag_id)
        
        if action:
            conditions.append("action = ?")
            params.append(action)
        
        where_clause = ""
        if conditions:
            where_clause = "WHERE " + " AND ".join(conditions)
        
        query = f"""
            SELECT * FROM tag_evolution_log
            {where_clause}
            ORDER BY created_at DESC
            LIMIT ?
        """
        params.append(limit)
        
        cur = self.conn.execute(query, params)
        columns = [desc[0] for desc in cur.description]
        
        results = []
        for row in cur.fetchall():
            item = dict(zip(columns, row))
            # Parse JSON fields
            for field in ["old_value", "new_value", "metadata"]:
                try:
                    if item.get(field):
                        item[field] = json.loads(item[field])
                except:
                    pass
            results.append(item)
        
        return results
    
    def _log_evolution(
        self,
        tag_id: str,
        action: str,
        old_value: Optional[Dict],
        new_value: Optional[Dict],
        reason: str = "",
        created_by: str = "system"
    ):
        """Log a tag evolution event."""
        now = int(time.time())
        
        try:
            self.conn.execute(
                """
                INSERT INTO tag_evolution_log (
                    tag_id, action, old_value, new_value, reason, created_at, created_by
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    tag_id, action,
                    json.dumps(old_value) if old_value else None,
                    json.dumps(new_value) if new_value else None,
                    reason, now, created_by
                )
            )
            self.conn.commit()
        except Exception as e:
            logger.error(f"Failed to log evolution for {tag_id}: {e}")


    def link_tag_to_entries(
        self,
        tag_id: str,
        keywords: List[str] = None,
        days_back: int = 30,
        max_entries: int = 500,
        confidence: float = 0.85
    ) -> int:
        """
        Link a dynamic tag to matching RSS entries by keyword search.
        
        Keyword priority:
        1. Explicitly provided keywords parameter
        2. Stored keywords in tag_candidates table (AI-generated)
        3. TAG_KEYWORD_MAPPING (static mapping)
        4. Tag name and name_en as fallback
        
        Args:
            tag_id: Tag ID to link
            keywords: List of keywords to search (optional, uses smart fallback)
            days_back: How many days back to search
            max_entries: Maximum entries to link
            confidence: Confidence score for the links
            
        Returns:
            Number of entries linked
        """
        now = int(time.time())
        min_timestamp = now - (days_back * 86400)
        
        # Get tag info if keywords not provided
        if not keywords:
            # Priority 1: Check tag_candidates for AI-generated keywords
            cur = self.conn.execute(
                "SELECT keywords FROM tag_candidates WHERE tag_id = ?",
                (tag_id,)
            )
            row = cur.fetchone()
            if row and row[0]:
                try:
                    stored_keywords = json.loads(row[0] or "[]")
                    if stored_keywords:
                        keywords = stored_keywords
                        logger.debug(f"Using stored keywords for {tag_id}: {keywords}")
                except:
                    pass
            
            # Priority 2: Check TAG_KEYWORD_MAPPING (static mapping)
            if not keywords:
                if tag_id in TAG_KEYWORD_MAPPING:
                    keywords = TAG_KEYWORD_MAPPING[tag_id]
                    logger.debug(f"Using static mapping for {tag_id}: {keywords}")
            
            # Priority 3: Fall back to tag name/name_en
            if not keywords:
                cur = self.conn.execute(
                    "SELECT name, name_en FROM tags WHERE id = ?",
                    (tag_id,)
                )
                row = cur.fetchone()
                if not row:
                    logger.warning(f"Tag {tag_id} not found")
                    return 0
                
                keywords = []
                if row[0]:  # name (Chinese)
                    keywords.append(row[0])
                if row[1]:  # name_en (English)
                    keywords.append(row[1])
                # Also add tag_id as keyword (e.g., "deepseek")
                keywords.append(tag_id)
                logger.debug(f"Using tag name fallback for {tag_id}: {keywords}")
        
        if not keywords:
            logger.warning(f"No keywords for tag {tag_id}")
            return 0
        
        # Build LIKE conditions for all keywords
        like_conditions = []
        params = []
        for kw in keywords:
            if kw and len(kw) >= 2:
                like_conditions.append("title LIKE ?")
                params.append(f"%{kw}%")
        
        if not like_conditions:
            return 0
        
        where_clause = " OR ".join(like_conditions)
        params.extend([min_timestamp, max_entries])
        
        # Find matching entries
        query = f"""
            SELECT source_id, dedup_key, title
            FROM rss_entries
            WHERE ({where_clause})
              AND published_at >= ?
            ORDER BY published_at DESC
            LIMIT ?
        """
        
        cur = self.conn.execute(query, params)
        entries = cur.fetchall() or []
        
        if not entries:
            logger.info(f"No entries found for tag {tag_id} with keywords {keywords}")
            return 0
        
        # Insert into rss_entry_tags (upsert)
        linked_count = 0
        for source_id, dedup_key, title in entries:
            try:
                self.conn.execute(
                    """
                    INSERT INTO rss_entry_tags (source_id, dedup_key, tag_id, confidence, source, created_at)
                    VALUES (?, ?, ?, ?, 'keyword', ?)
                    ON CONFLICT(source_id, dedup_key, tag_id) DO UPDATE SET
                        confidence = MAX(excluded.confidence, confidence),
                        source = CASE WHEN source = 'ai' THEN source ELSE 'keyword' END
                    """,
                    (source_id, dedup_key, tag_id, confidence, now)
                )
                linked_count += 1
            except Exception as e:
                logger.debug(f"Failed to link entry: {e}")
        
        self.conn.commit()
        
        # Update tag usage count
        self.conn.execute(
            "UPDATE tags SET usage_count = ?, last_used_at = ? WHERE id = ?",
            (linked_count, now, tag_id)
        )
        self.conn.commit()
        
        logger.info(f"Linked {linked_count} entries to tag {tag_id}")
        return linked_count
    
    def refresh_all_dynamic_tags(
        self,
        days_back: int = 7,
        max_entries_per_tag: int = 200
    ) -> Dict[str, int]:
        """
        Refresh entry links for all active dynamic tags.
        Call this periodically (e.g., every hour) to keep links up-to-date.
        
        Args:
            days_back: How many days back to search for new entries
            max_entries_per_tag: Maximum entries to link per tag
            
        Returns:
            Dict of tag_id -> linked_count
        """
        # Get all active dynamic tags
        cur = self.conn.execute(
            """
            SELECT id, name, name_en
            FROM tags
            WHERE is_dynamic = 1 AND lifecycle = 'active' AND enabled = 1
            """
        )
        tags = cur.fetchall() or []
        
        results = {}
        for tag_id, name, name_en in tags:
            keywords = [k for k in [name, name_en, tag_id] if k]
            count = self.link_tag_to_entries(
                tag_id=tag_id,
                keywords=keywords,
                days_back=days_back,
                max_entries=max_entries_per_tag
            )
            results[tag_id] = count
        
        # Invalidate my_tags cache after bulk update
        try:
            from hotnews.web.timeline_cache import my_tags_cache
            my_tags_cache.invalidate()
            logger.info("Invalidated my_tags_cache after refreshing dynamic tags")
        except Exception as e:
            logger.warning(f"Failed to invalidate cache: {e}")
        
        return results


def link_dynamic_tag_entries(conn, tag_id: str, days_back: int = 30) -> int:
    """
    Convenience function to link a single dynamic tag to entries.
    
    Args:
        conn: Database connection
        tag_id: Tag ID to link
        days_back: How many days back to search
        
    Returns:
        Number of entries linked
    """
    service = TagDiscoveryService(conn)
    count = service.link_tag_to_entries(tag_id, days_back=days_back)
    
    # Invalidate cache
    try:
        from hotnews.web.timeline_cache import my_tags_cache
        my_tags_cache.invalidate()
    except:
        pass
    
    return count


def refresh_dynamic_tag_entries(conn, days_back: int = 7) -> Dict[str, int]:
    """
    Convenience function to refresh all dynamic tag entries.
    
    Args:
        conn: Database connection
        days_back: How many days back to search
        
    Returns:
        Dict of tag_id -> linked_count
    """
    service = TagDiscoveryService(conn)
    return service.refresh_all_dynamic_tags(days_back=days_back)
