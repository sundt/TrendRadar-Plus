"""
Timeline Cache Service

Provides caching for Morning Brief and Explore timeline APIs.
Cache TTL: 5 minutes (300 seconds)
Max items: 1000 per cache (20 cards × 50 items)
"""

import time
import hashlib
from typing import Any, Dict, List, Optional


class TimelineCache:
    """Simple in-memory cache for timeline data."""
    
    def __init__(self, ttl_seconds: int = 300, max_items: int = 1000):
        """
        Initialize cache.
        
        Args:
            ttl_seconds: Cache time-to-live in seconds (default 5 minutes)
            max_items: Maximum items to cache (default 1000)
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
    
    def __init__(self, ttl_seconds: int = 300, max_items_per_user: int = 500, max_users: int = 100):
        """
        Initialize per-user cache.
        
        Args:
            ttl_seconds: Cache time-to-live in seconds (default 5 minutes)
            max_items_per_user: Maximum items per user (default 500)
            max_users: Maximum number of users to cache (default 100, LRU eviction)
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


# Global cache instances
brief_timeline_cache = TimelineCache(ttl_seconds=300, max_items=1000)
explore_timeline_cache = TimelineCache(ttl_seconds=300, max_items=1000)
my_tags_cache = UserTimelineCache(ttl_seconds=300, max_items_per_user=500, max_users=100)  # Per-user cache


def clear_all_timeline_caches() -> Dict[str, bool]:
    """Clear all timeline caches."""
    brief_timeline_cache.invalidate()
    explore_timeline_cache.invalidate()
    my_tags_cache.invalidate()
    return {
        "brief_cleared": True,
        "explore_cleared": True,
        "my_tags_cleared": True,
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
    }
