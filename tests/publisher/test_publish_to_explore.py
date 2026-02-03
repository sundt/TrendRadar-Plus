"""
Tests for publishing user articles to explore (精选博客).

Tests the new simplified publishing flow:
1. Create draft -> 2. Publish to explore -> 3. Article appears in rss_entries
"""

import pytest
import time
import uuid
from unittest.mock import MagicMock, patch


class TestEnsureUserSource:
    """Test ensure_user_source function."""
    
    def test_creates_new_source_for_new_user(self):
        """Test that ensure_user_source creates a new source for first-time users."""
        from hotnews.web.api.publisher.db import ensure_user_source
        
        # Mock connection - source doesn't exist
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = None
        
        source_id = ensure_user_source(mock_conn, 123, "测试用户")
        
        assert source_id == "user_123"
        # Verify INSERT was called
        calls = [str(call) for call in mock_conn.execute.call_args_list]
        assert any("INSERT" in call for call in calls)
    
    def test_updates_existing_source(self):
        """Test that ensure_user_source updates existing source name."""
        from hotnews.web.api.publisher.db import ensure_user_source
        
        # Mock connection - source exists
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = ("user_123",)
        
        source_id = ensure_user_source(mock_conn, 123, "新昵称")
        
        assert source_id == "user_123"
        # Verify UPDATE was called
        calls = [str(call) for call in mock_conn.execute.call_args_list]
        assert any("UPDATE" in call for call in calls)


class TestPublishArticle:
    """Test publish_article function."""
    
    def test_publish_updates_status(self):
        """Test that publish_article updates article status to published."""
        from hotnews.web.api.publisher.db import publish_article, get_article
        
        mock_conn = MagicMock()
        
        # Mock get_article to return a valid draft
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.side_effect = [
                # First call: before publish
                {
                    "id": "article_123",
                    "user_id": 123,
                    "source_id": "user_123",
                    "title": "Test Title",
                    "digest": "Test digest",
                    "cover_url": "",
                    "html_content": "<p>" + "x" * 200 + "</p>",  # > 100 chars
                    "status": "draft",
                    "version": 1,
                },
                # Second call: after publish
                {
                    "id": "article_123",
                    "user_id": 123,
                    "source_id": "user_123",
                    "title": "Test Title",
                    "status": "published",
                    "version": 2,
                },
            ]
            
            result = publish_article(mock_conn, "article_123", 123)
            
            assert result["status"] == "published"
            assert "article_url" in result
    
    def test_publish_creates_rss_entry(self):
        """Test that publish_article creates an rss_entries record."""
        from hotnews.web.api.publisher.db import publish_article
        
        mock_conn = MagicMock()
        
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.return_value = {
                "id": "article_123",
                "user_id": 123,
                "source_id": "user_123",
                "title": "Test Title",
                "digest": "Test digest",
                "cover_url": "cover.jpg",
                "html_content": "<p>" + "x" * 200 + "</p>",
                "status": "draft",
                "version": 1,
            }
            
            publish_article(mock_conn, "article_123", 123)
            
            # Verify INSERT INTO rss_entries was called
            calls = [str(call) for call in mock_conn.execute.call_args_list]
            assert any("rss_entries" in call and "INSERT" in call for call in calls)
    
    def test_publish_requires_title(self):
        """Test that publishing requires a non-empty title."""
        from hotnews.web.api.publisher.db import publish_article
        
        mock_conn = MagicMock()
        
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.return_value = {
                "id": "article_123",
                "user_id": 123,
                "source_id": "user_123",
                "title": "",  # Empty title
                "html_content": "<p>" + "x" * 200 + "</p>",
                "status": "draft",
                "version": 1,
            }
            
            with pytest.raises(ValueError, match="标题"):
                publish_article(mock_conn, "article_123", 123)
    
    def test_publish_requires_content(self):
        """Test that publishing requires non-empty content."""
        from hotnews.web.api.publisher.db import publish_article
        
        mock_conn = MagicMock()
        
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.return_value = {
                "id": "article_123",
                "user_id": 123,
                "source_id": "user_123",
                "title": "Test Title",
                "html_content": "<p>short</p>",  # Too short
                "status": "draft",
                "version": 1,
            }
            
            with pytest.raises(ValueError, match="内容"):
                publish_article(mock_conn, "article_123", 123)


class TestUnpublishArticle:
    """Test unpublish_article function."""
    
    def test_unpublish_removes_from_rss_entries(self):
        """Test that unpublish_article removes the rss_entries record."""
        from hotnews.web.api.publisher.db import unpublish_article
        
        mock_conn = MagicMock()
        
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.return_value = {
                "id": "article_123",
                "user_id": 123,
                "source_id": "user_123",
                "title": "Test Title",
                "status": "published",
                "version": 1,
            }
            
            unpublish_article(mock_conn, "article_123", 123)
            
            # Verify DELETE FROM rss_entries was called
            calls = [str(call) for call in mock_conn.execute.call_args_list]
            assert any("rss_entries" in call and "DELETE" in call for call in calls)
    
    def test_unpublish_updates_status_to_draft(self):
        """Test that unpublish_article sets status back to draft."""
        from hotnews.web.api.publisher.db import unpublish_article
        
        mock_conn = MagicMock()
        
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.side_effect = [
                # First call: before unpublish
                {
                    "id": "article_123",
                    "user_id": 123,
                    "source_id": "user_123",
                    "title": "Test Title",
                    "status": "published",
                    "version": 1,
                },
                # Second call: after unpublish
                {
                    "id": "article_123",
                    "user_id": 123,
                    "source_id": "user_123",
                    "title": "Test Title",
                    "status": "draft",
                    "version": 2,
                },
            ]
            
            result = unpublish_article(mock_conn, "article_123", 123)
            
            assert result["status"] == "draft"


class TestPermissions:
    """Test permission checks for article operations."""
    
    def test_cannot_publish_others_article(self):
        """Test that users cannot publish articles they don't own."""
        from hotnews.web.api.publisher.db import publish_article
        
        mock_conn = MagicMock()
        
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.return_value = {
                "id": "article_123",
                "user_id": 456,  # Different user
                "source_id": "user_456",
                "title": "Test Title",
                "html_content": "<p>" + "x" * 200 + "</p>",
                "status": "draft",
                "version": 1,
            }
            
            with pytest.raises(PermissionError):
                publish_article(mock_conn, "article_123", 123)  # User 123 trying to publish
    
    def test_cannot_unpublish_others_article(self):
        """Test that users cannot unpublish articles they don't own."""
        from hotnews.web.api.publisher.db import unpublish_article
        
        mock_conn = MagicMock()
        
        with patch('hotnews.web.api.publisher.db.get_article') as mock_get:
            mock_get.return_value = {
                "id": "article_123",
                "user_id": 456,  # Different user
                "source_id": "user_456",
                "title": "Test Title",
                "status": "published",
                "version": 1,
            }
            
            with pytest.raises(PermissionError):
                unpublish_article(mock_conn, "article_123", 123)  # User 123 trying to unpublish


class TestGetPublishedArticle:
    """Test get_published_article function."""
    
    def test_returns_article_with_author(self):
        """Test that get_published_article returns article with author info."""
        from hotnews.web.api.publisher.db import get_published_article
        
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = (
            "article_123", 123, "user_123", "Test Title", "Digest", "cover.jpg",
            "<p>Content</p>", 100, int(time.time()), int(time.time()),
            "测试用户的博客"
        )
        
        result = get_published_article(mock_conn, "article_123")
        
        assert result is not None
        assert result["title"] == "Test Title"
        assert result["author_name"] == "测试用户的博客"
    
    def test_returns_none_for_draft(self):
        """Test that get_published_article returns None for draft articles."""
        from hotnews.web.api.publisher.db import get_published_article
        
        mock_conn = MagicMock()
        mock_conn.execute.return_value.fetchone.return_value = None
        
        result = get_published_article(mock_conn, "article_123")
        
        assert result is None
