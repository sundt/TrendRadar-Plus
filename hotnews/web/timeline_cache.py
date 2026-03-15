"""
Timeline Cache Service

Provides unified caching for all category APIs.

=== CACHE CONFIGURATION ===
All caches use the same TTL for consistency and simplicity.
Frontend localStorage caching is DISABLED to avoid compatibility issues.

When adding a new category:
1. Use DEFAULT_CACHE_TTL for TTL (do not hardcode values)
2. Do NOT implement frontend localStorage caching
3. Add cache instance to clear_all_timeline_caches() and get_cache_status()

See: docs/fixes/wechat-browser-compatibility.md for rationale.
"""

import time
import hashlib
from typing import Any, Dict, List, Optional


# =============================================================================
# UNIFIED CACHE CONFIGURATION
# =============================================================================
# All caches should use these constants for consistency.
# Do NOT hardcode TTL values when creating new cache instances.

DEFAULT_CACHE_TTL = 600  # 10 minutes - unified TTL for all caches
DEFAULT_MAX_ITEMS = 200   # Reduced from 1000 to save ~60% timeline cache RAM
DEFAULT_MAX_ITEMS_PER_USER = 100  # Reduced from 500
DEFAULT_MAX_USERS = 50   # Reduced from 100


class TimelineCache:
    """Simple in-memory cache for timeline data."""
    
    def __init__(self, ttl_seconds: int = DEFAULT_CACHE_TTL, max_items: int = DEFAULT_MAX_ITEMS):
        """
        Initialize cache.
        
        Args:
            ttl_seconds: Cache time-to-live in seconds (default: DEFAULT_CACHE_TTL)
            max_items: Maximum items to cache (default: DEFAULT_MAX_ITEMS)
        """
        self._ttl = ttl_seconds
        self._max_items = max_items
        self._items: Optional[List[Dict[str, Any]]] = None
        self._created_at: float = 0
        self._config_hash: str = ""
    
    def _compute_config_hash(self, config: Dict[str, Any]) -> str:
        """Compute a hash of the config for cache invalidation."""
        try:
            # Sort dict for consistent hashing
            config_str = str(sorted(config.items()))
            return hashlib.md5(config_str.encode('utf-8')).hexdigest()[:16]
        except Exception:
            return ""
    
    def get(self, config: Optional[Dict[str, Any]] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached items if valid.
        
        Args:
            config: Optional config dict to check for changes
            
        Returns:
            Cached items list or None if cache is invalid
        """
        # Check if cache exists
        if self._items is None:
            return None
        
        # Check TTL
        if (time.time() - self._created_at) >= self._ttl:
            return None
        
        # Check config hash if provided
        if config is not None:
            current_hash = self._compute_config_hash(config)
            if current_hash != self._config_hash:
                return None
        
        return self._items
    
    def set(self, items: List[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> None:
        """
        Store items in cache.
        
        Args:
            items: List of items to cache (will be truncated to max_items)
            config: Optional config dict for invalidation tracking
        """
        # Truncate to max items
        self._items = items[:self._max_items] if len(items) > self._max_items else items
        self._created_at = time.time()
        
        if config is not None:
            self._config_hash = self._compute_config_hash(config)
        else:
            self._config_hash = ""
    
    def invalidate(self) -> None:
        """Clear the cache."""
        self._items = None
        self._created_at = 0
        self._config_hash = ""
    
    def get_slice(self, offset: int, limit: int, config: Optional[Dict[str, Any]] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Get a slice of cached items.
        
        Args:
            offset: Start offset
            limit: Number of items to return
            config: Optional config for validation
            
        Returns:
            Sliced items or None if cache is invalid
        """
        items = self.get(config)
        if items is None:
            return None
        return items[offset:offset + limit]
    
    @property
    def is_valid(self) -> bool:
        """Check if cache is valid (not expired)."""
        if self._items is None:
            return False
        return (time.time() - self._created_at) < self._ttl
    
    @property
    def item_count(self) -> int:
        """Get number of cached items."""
        return len(self._items) if self._items else 0
    
    @property
    def age_seconds(self) -> float:
        """Get cache age in seconds."""
        if self._created_at == 0:
            return float('inf')
        return time.time() - self._created_at


class UserTimelineCache:
    """Per-user in-memory cache for timeline data (e.g., my-tags)."""
    
    def __init__(
        self,
        ttl_seconds: int = DEFAULT_CACHE_TTL,
        max_items_per_user: int = DEFAULT_MAX_ITEMS_PER_USER,
        max_users: int = DEFAULT_MAX_USERS
    ):
        """
        Initialize per-user cache.
        
        Args:
            ttl_seconds: Cache time-to-live in seconds (default: DEFAULT_CACHE_TTL)
            max_items_per_user: Maximum items per user (default: DEFAULT_MAX_ITEMS_PER_USER)
            max_users: Maximum number of users to cache (default: DEFAULT_MAX_USERS, LRU eviction)
        """
        self._ttl = ttl_seconds
        self._max_items = max_items_per_user
        self._max_users = max_users
        # Dict of user_id -> {items, created_at, config_hash}
        self._user_caches: Dict[int, Dict[str, Any]] = {}
        # Track access order for LRU eviction
        self._access_order: List[int] = []
    
    def _compute_config_hash(self, config: Dict[str, Any]) -> str:
        """Compute a hash of the config for cache invalidation."""
        try:
            config_str = str(sorted(config.items()))
            return hashlib.md5(config_str.encode('utf-8')).hexdigest()[:16]
        except Exception:
            return ""
    
    def _touch_user(self, user_id: int) -> None:
        """Update access order for LRU."""
        if user_id in self._access_order:
            self._access_order.remove(user_id)
        self._access_order.append(user_id)
    
    def _evict_if_needed(self) -> None:
        """Evict oldest users if over limit."""
        while len(self._user_caches) >= self._max_users and self._access_order:
            oldest_user = self._access_order.pop(0)
            self._user_caches.pop(oldest_user, None)
    
    def get(self, config: Optional[Dict[str, Any]] = None) -> Optional[List[Dict[str, Any]]]:
        """
        Get cached items for a user if valid.
        
        Args:
            config: Config dict containing user_id and other params
            
        Returns:
            Cached items list or None if cache is invalid
        """
        if config is None:
            return None
        
        user_id = config.get("user_id")
        if user_id is None:
            return None
        
        cache_entry = self._user_caches.get(user_id)
        if cache_entry is None:
            return None
        
        # Check TTL
        if (time.time() - cache_entry["created_at"]) >= self._ttl:
            self._user_caches.pop(user_id, None)
            return None
        
        # Check config hash
        current_hash = self._compute_config_hash(config)
        if current_hash != cache_entry["config_hash"]:
            return None
        
        self._touch_user(user_id)
        return cache_entry["items"]
    
    def set(self, items: List[Dict[str, Any]], config: Optional[Dict[str, Any]] = None) -> None:
        """
        Store items in cache for a user.
        
        Args:
            items: List of items to cache
            config: Config dict containing user_id
        """
        if config is None:
            return
        
        user_id = config.get("user_id")
        if user_id is None:
            return
        
        self._evict_if_needed()
        
        truncated_items = items[:self._max_items] if len(items) > self._max_items else items
        self._user_caches[user_id] = {
            "items": truncated_items,
            "created_at": time.time(),
            "config_hash": self._compute_config_hash(config),
        }
        self._touch_user(user_id)
    
    def invalidate(self, user_id: Optional[int] = None) -> None:
        """Clear cache for a specific user or all users."""
        if user_id is not None:
            self._user_caches.pop(user_id, None)
            if user_id in self._access_order:
                self._access_order.remove(user_id)
        else:
            self._user_caches.clear()
            self._access_order.clear()
    
    @property
    def is_valid(self) -> bool:
        """Check if any cache entries exist."""
        return len(self._user_caches) > 0
    
    @property
    def item_count(self) -> int:
        """Get total number of cached items across all users."""
        return sum(len(c["items"]) for c in self._user_caches.values())
    
    @property
    def user_count(self) -> int:
        """Get number of cached users."""
        return len(self._user_caches)
    
    @property
    def age_seconds(self) -> float:
        """Get age of oldest cache entry."""
        if not self._user_caches:
            return float('inf')
        oldest = min(c["created_at"] for c in self._user_caches.values())
        return time.time() - oldest


# =============================================================================
# GLOBAL CACHE INSTANCES
# =============================================================================
# All caches use DEFAULT_CACHE_TTL (10 minutes) for consistency.
# When adding a new category, create a cache instance here using the defaults.

brief_timeline_cache = TimelineCache(max_items=200)   # 早报 (deprecated, kept for cache_warmup compat)
explore_timeline_cache = TimelineCache(max_items=200)  # 探索 (explore)
my_tags_cache = UserTimelineCache()  # 我的关注 (my-tags) - per-user
discovery_news_cache = TimelineCache(max_items=300)   # 新发现 (discovery)
recommended_tags_cache = TimelineCache(ttl_seconds=300, max_items=100)  # 推荐标签 (5分钟缓存，数据变化不频繁)
# featured_mps uses API-level caching, not timeline cache


class TopicNewsCache:
    """Per-user per-topic cache for topic news."""
    
    def __init__(
        self,
        ttl_seconds: int = DEFAULT_CACHE_TTL,
        max_topics_per_user: int = 20,
        max_users: int = DEFAULT_MAX_USERS
    ):
        """
        Initialize per-user per-topic cache.
        
        Args:
            ttl_seconds: Cache time-to-live in seconds
            max_topics_per_user: Maximum topics per user (LRU eviction)
            max_users: Maximum number of users to cache
        """
        self._ttl = ttl_seconds
        self._max_topics = max_topics_per_user
        self._max_users = max_users
        # Dict of user_id -> {topic_id -> {keywords_news, created_at}}
        self._cache: Dict[int, Dict[str, Dict[str, Any]]] = {}
        # Track user access order for LRU
        self._user_access_order: List[int] = []
    
    def _touch_user(self, user_id: int) -> None:
        """Update user access order for LRU."""
        if user_id in self._user_access_order:
            self._user_access_order.remove(user_id)
        self._user_access_order.append(user_id)
    
    def _evict_users_if_needed(self) -> None:
        """Evict oldest users if over limit."""
        while len(self._cache) >= self._max_users and self._user_access_order:
            oldest_user = self._user_access_order.pop(0)
            self._cache.pop(oldest_user, None)
    
    def get(self, user_id: int, topic_id: str) -> Optional[Dict[str, Any]]:
        """
        Get cached topic news if valid.
        
        Args:
            user_id: User ID
            topic_id: Topic ID
            
        Returns:
            Cached keywords_news dict or None if cache miss/expired
        """
        user_cache = self._cache.get(user_id)
        if not user_cache:
            return None
        
        entry = user_cache.get(topic_id)
        if not entry:
            return None
        
        # Check TTL
        if (time.time() - entry["created_at"]) >= self._ttl:
            user_cache.pop(topic_id, None)
            return None
        
        self._touch_user(user_id)
        return entry["keywords_news"]
    
    def set(self, user_id: int, topic_id: str, keywords_news: Dict[str, Any]) -> None:
        """
        Store topic news in cache.
        
        Args:
            user_id: User ID
            topic_id: Topic ID
            keywords_news: Dict of keyword -> news list
        """
        self._evict_users_if_needed()
        
        if user_id not in self._cache:
            self._cache[user_id] = {}
        
        user_cache = self._cache[user_id]
        
        # LRU eviction for topics within user
        if len(user_cache) >= self._max_topics and topic_id not in user_cache:
            # Find oldest topic
            oldest_topic = min(user_cache.items(), key=lambda x: x[1]["created_at"])
            user_cache.pop(oldest_topic[0], None)
        
        user_cache[topic_id] = {
            "keywords_news": keywords_news,
            "created_at": time.time()
        }
        self._touch_user(user_id)
    
    def invalidate(self, user_id: Optional[int] = None, topic_id: Optional[str] = None) -> None:
        """
        Clear cache.
        
        Args:
            user_id: If provided, clear only this user's cache
            topic_id: If provided with user_id, clear only this topic
        """
        if user_id is None:
            self._cache.clear()
            self._user_access_order.clear()
        elif topic_id is None:
            self._cache.pop(user_id, None)
            if user_id in self._user_access_order:
                self._user_access_order.remove(user_id)
        else:
            if user_id in self._cache:
                self._cache[user_id].pop(topic_id, None)
    
    @property
    def is_valid(self) -> bool:
        """Check if any cache entries exist."""
        return len(self._cache) > 0
    
    @property
    def user_count(self) -> int:
        """Get number of cached users."""
        return len(self._cache)
    
    @property
    def topic_count(self) -> int:
        """Get total number of cached topics across all users."""
        return sum(len(topics) for topics in self._cache.values())
    
    @property
    def age_seconds(self) -> float:
        """Get age of oldest cache entry."""
        if not self._cache:
            return float('inf')
        oldest = float('inf')
        for user_cache in self._cache.values():
            for entry in user_cache.values():
                oldest = min(oldest, time.time() - entry["created_at"])
        return oldest


# Topic news cache instance
topic_news_cache = TopicNewsCache()


def clear_all_timeline_caches() -> Dict[str, bool]:
    """Clear all timeline caches."""
    brief_timeline_cache.invalidate()
    explore_timeline_cache.invalidate()
    my_tags_cache.invalidate()
    discovery_news_cache.invalidate()
    topic_news_cache.invalidate()
    recommended_tags_cache.invalidate()
    return {
        "brief_cleared": True,
        "explore_cleared": True,
        "my_tags_cleared": True,
        "discovery_cleared": True,
        "topic_news_cleared": True,
        "recommended_tags_cleared": True,
    }


def get_cache_status() -> Dict[str, Any]:
    """Get status of all timeline caches."""
    return {
        "brief": {
            "valid": brief_timeline_cache.is_valid,
            "item_count": brief_timeline_cache.item_count,
            "age_seconds": round(brief_timeline_cache.age_seconds, 1),
        },
        "explore": {
            "valid": explore_timeline_cache.is_valid,
            "item_count": explore_timeline_cache.item_count,
            "age_seconds": round(explore_timeline_cache.age_seconds, 1),
        },
        "my_tags": {
            "valid": my_tags_cache.is_valid,
            "item_count": my_tags_cache.item_count,
            "user_count": my_tags_cache.user_count,
            "age_seconds": round(my_tags_cache.age_seconds, 1),
        },
        "discovery": {
            "valid": discovery_news_cache.is_valid,
            "item_count": discovery_news_cache.item_count,
            "age_seconds": round(discovery_news_cache.age_seconds, 1),
        },
        "topic_news": {
            "valid": topic_news_cache.is_valid,
            "user_count": topic_news_cache.user_count,
            "topic_count": topic_news_cache.topic_count,
            "age_seconds": round(topic_news_cache.age_seconds, 1),
        },
        "recommended_tags": {
            "valid": recommended_tags_cache.is_valid,
            "item_count": recommended_tags_cache.item_count,
            "age_seconds": round(recommended_tags_cache.age_seconds, 1),
        },
    }
