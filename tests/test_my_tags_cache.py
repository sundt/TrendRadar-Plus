"""
Test My Tags Cache Functionality

Tests both backend (timeline_cache) and frontend (localStorage) caching.
"""

import pytest
import time
from hotnews.web.timeline_cache import my_tags_cache


class TestMyTagsCache:
    """Test the my_tags_cache backend cache."""
    
    def test_cache_initialization(self):
        """Test cache is properly initialized."""
        assert my_tags_cache is not None
        assert my_tags_cache._ttl == 300  # 5 minutes
        assert my_tags_cache._max_items == 500
    
    def test_cache_set_and_get(self):
        """Test basic cache set and get operations."""
        my_tags_cache.invalidate()
        
        test_data = [
            {
                "tag": {"id": "tech", "name": "科技"},
                "news": [{"id": 1, "title": "Test News"}],
                "count": 1,
            }
        ]
        
        config = {"user_id": "test_user", "followed_tags": ["tech"]}
        
        # Set cache
        my_tags_cache.set(test_data, config)
        
        # Get cache
        cached = my_tags_cache.get(config)
        assert cached is not None
        assert len(cached) == 1
        assert cached[0]["tag"]["id"] == "tech"
    
    def test_cache_expiration(self):
        """Test cache expires after TTL."""
        my_tags_cache.invalidate()
        
        # Create a cache with 1 second TTL for testing
        from hotnews.web.timeline_cache import TimelineCache
        test_cache = TimelineCache(ttl_seconds=1, max_items=100)
        
        test_data = [{"test": "data"}]
        test_cache.set(test_data)
        
        # Should be valid immediately
        assert test_cache.get() is not None
        
        # Wait for expiration
        time.sleep(1.1)
        
        # Should be expired
        assert test_cache.get() is None
    
    def test_cache_invalidation_on_config_change(self):
        """Test cache invalidates when config changes."""
        my_tags_cache.invalidate()
        
        test_data = [{"tag": {"id": "tech"}}]
        config1 = {"user_id": "user1", "followed_tags": ["tech"]}
        config2 = {"user_id": "user1", "followed_tags": ["tech", "finance"]}
        
        # Set with config1
        my_tags_cache.set(test_data, config1)
        
        # Get with config1 should work
        assert my_tags_cache.get(config1) is not None
        
        # Get with config2 should return None (different config)
        assert my_tags_cache.get(config2) is None
    
    def test_cache_max_items(self):
        """Test cache respects max_items limit."""
        my_tags_cache.invalidate()
        
        # Create more items than max_items
        test_data = [{"id": i} for i in range(600)]
        
        my_tags_cache.set(test_data)
        
        # Should be truncated to max_items (500)
        assert my_tags_cache.item_count == 500
    
    def test_cache_status(self):
        """Test cache status reporting."""
        my_tags_cache.invalidate()
        
        test_data = [{"test": "data"}]
        my_tags_cache.set(test_data)
        
        assert my_tags_cache.is_valid is True
        assert my_tags_cache.item_count == 1
        assert my_tags_cache.age_seconds < 1.0


class TestCacheIntegration:
    """Test cache integration with the API."""
    
    def test_clear_all_caches(self):
        """Test clearing all timeline caches."""
        from hotnews.web.timeline_cache import (
            clear_all_timeline_caches,
            brief_timeline_cache,
            explore_timeline_cache,
            my_tags_cache,
        )
        
        # Set some data in all caches
        brief_timeline_cache.set([{"test": "brief"}])
        explore_timeline_cache.set([{"test": "explore"}])
        my_tags_cache.set([{"test": "tags"}])
        
        # Clear all
        result = clear_all_timeline_caches()
        
        assert result["brief_cleared"] is True
        assert result["explore_cleared"] is True
        assert result["my_tags_cleared"] is True
        
        # Verify all are cleared
        assert brief_timeline_cache.get() is None
        assert explore_timeline_cache.get() is None
        assert my_tags_cache.get() is None
    
    def test_cache_status_reporting(self):
        """Test cache status reporting."""
        from hotnews.web.timeline_cache import get_cache_status, my_tags_cache
        
        my_tags_cache.invalidate()
        my_tags_cache.set([{"test": "data"}])
        
        status = get_cache_status()
        
        assert "my_tags" in status
        assert status["my_tags"]["valid"] is True
        assert status["my_tags"]["item_count"] == 1
        assert isinstance(status["my_tags"]["age_seconds"], (int, float))


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
