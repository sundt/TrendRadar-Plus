# coding=utf-8
"""
Tests for draft database operations.
"""

import pytest
import sqlite3
import sys
import tempfile
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from hotnews.web.api.publisher.db import (
    init_publisher_tables,
    create_draft,
    get_draft,
    list_drafts,
    update_draft,
    delete_draft,
    add_publish_history,
    get_publish_history,
    save_temp_image,
    get_temp_image,
    cleanup_expired_images,
    TITLE_MAX_LENGTH,
    DIGEST_MAX_LENGTH,
)


@pytest.fixture
def test_db():
    """Create a temporary test database."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        db_path = f.name
    
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.execute("PRAGMA journal_mode=WAL")
    
    # Create users table (simplified)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT DEFAULT '',
            is_member INTEGER DEFAULT 0
        )
    """)
    conn.execute("INSERT INTO users (id, email, is_member) VALUES (1, 'test@example.com', 1)")
    conn.execute("INSERT INTO users (id, email, is_member) VALUES (2, 'other@example.com', 1)")
    conn.commit()
    
    # Initialize publisher tables
    init_publisher_tables(conn)
    
    yield conn
    
    conn.close()
    Path(db_path).unlink(missing_ok=True)


class TestCreateDraft:
    """Tests for create_draft function."""
    
    def test_create_draft_minimal(self, test_db):
        """Create draft with minimal data."""
        draft = create_draft(test_db, user_id=1)
        
        assert draft["id"] is not None
        assert draft["user_id"] == 1
        assert draft["title"] == ""
        assert draft["status"] == "draft"
        assert draft["version"] == 1
    
    def test_create_draft_full(self, test_db):
        """Create draft with all fields."""
        draft = create_draft(
            test_db,
            user_id=1,
            title="Test Title",
            digest="Test digest",
            cover_url="https://example.com/cover.jpg",
            html_content="<p>Test content</p>",
            markdown_content="Test content",
            import_type="news",
            import_source_id="news-123",
            import_source_url="https://example.com/news/123",
        )
        
        assert draft["title"] == "Test Title"
        assert draft["digest"] == "Test digest"
        assert draft["cover_url"] == "https://example.com/cover.jpg"
    
    def test_create_draft_generates_unique_id(self, test_db):
        """Each draft should have a unique ID."""
        draft1 = create_draft(test_db, user_id=1, title="Draft 1")
        draft2 = create_draft(test_db, user_id=1, title="Draft 2")
        
        assert draft1["id"] != draft2["id"]


class TestGetDraft:
    """Tests for get_draft function."""
    
    def test_get_existing_draft(self, test_db):
        """Get an existing draft."""
        created = create_draft(test_db, user_id=1, title="Test", html_content="<p>Content</p>")
        
        draft = get_draft(test_db, created["id"])
        
        assert draft is not None
        assert draft["id"] == created["id"]
        assert draft["title"] == "Test"
        assert draft["html_content"] == "<p>Content</p>"
    
    def test_get_nonexistent_draft(self, test_db):
        """Get a non-existent draft returns None."""
        draft = get_draft(test_db, "nonexistent-id")
        assert draft is None


class TestListDrafts:
    """Tests for list_drafts function."""
    
    def test_list_empty(self, test_db):
        """List drafts when none exist."""
        items, total = list_drafts(test_db, user_id=1)
        
        assert items == []
        assert total == 0
    
    def test_list_user_drafts(self, test_db):
        """List drafts for a specific user."""
        create_draft(test_db, user_id=1, title="User 1 Draft 1")
        create_draft(test_db, user_id=1, title="User 1 Draft 2")
        create_draft(test_db, user_id=2, title="User 2 Draft")
        
        items, total = list_drafts(test_db, user_id=1)
        
        assert total == 2
        assert len(items) == 2
        assert all(d["user_id"] == 1 for d in items)
    
    def test_list_with_status_filter(self, test_db):
        """List drafts with status filter."""
        d1 = create_draft(test_db, user_id=1, title="Draft 1")
        d2 = create_draft(test_db, user_id=1, title="Draft 2")
        update_draft(test_db, d2["id"], user_id=1, status="published")
        
        items, total = list_drafts(test_db, user_id=1, status="draft")
        
        assert total == 1
        assert items[0]["title"] == "Draft 1"
    
    def test_list_pagination(self, test_db):
        """List drafts with pagination."""
        for i in range(5):
            create_draft(test_db, user_id=1, title=f"Draft {i}")
        
        items, total = list_drafts(test_db, user_id=1, page=1, page_size=2)
        
        assert total == 5
        assert len(items) == 2
        
        items2, _ = list_drafts(test_db, user_id=1, page=2, page_size=2)
        assert len(items2) == 2
        assert items[0]["id"] != items2[0]["id"]


class TestUpdateDraft:
    """Tests for update_draft function."""
    
    def test_update_title(self, test_db):
        """Update draft title."""
        draft = create_draft(test_db, user_id=1, title="Original")
        
        updated = update_draft(test_db, draft["id"], user_id=1, title="Updated")
        
        assert updated["title"] == "Updated"
        assert updated["version"] == 2
    
    def test_update_multiple_fields(self, test_db):
        """Update multiple fields at once."""
        draft = create_draft(test_db, user_id=1, title="Original")
        
        updated = update_draft(
            test_db,
            draft["id"],
            user_id=1,
            title="New Title",
            digest="New Digest",
            html_content="<p>New Content</p>",
        )
        
        assert updated["title"] == "New Title"
        assert updated["digest"] == "New Digest"
        assert updated["html_content"] == "<p>New Content</p>"
    
    def test_update_nonexistent_draft(self, test_db):
        """Update non-existent draft raises error."""
        with pytest.raises(ValueError, match="草稿不存在"):
            update_draft(test_db, "nonexistent", user_id=1, title="New")
    
    def test_update_other_user_draft(self, test_db):
        """Update another user's draft raises error."""
        draft = create_draft(test_db, user_id=1, title="User 1 Draft")
        
        with pytest.raises(PermissionError, match="无权访问"):
            update_draft(test_db, draft["id"], user_id=2, title="Hacked")
    
    def test_update_with_version_check(self, test_db):
        """Update with version check (optimistic locking)."""
        draft = create_draft(test_db, user_id=1, title="Original")
        
        # First update succeeds
        updated = update_draft(
            test_db, draft["id"], user_id=1,
            expected_version=1, title="Updated"
        )
        assert updated["version"] == 2
        
        # Second update with old version fails
        with pytest.raises(ValueError, match="草稿已被修改"):
            update_draft(
                test_db, draft["id"], user_id=1,
                expected_version=1, title="Conflict"
            )


class TestDeleteDraft:
    """Tests for delete_draft function."""
    
    def test_delete_draft(self, test_db):
        """Delete a draft."""
        draft = create_draft(test_db, user_id=1, title="To Delete")
        
        result = delete_draft(test_db, draft["id"], user_id=1)
        
        assert result is True
        assert get_draft(test_db, draft["id"]) is None
    
    def test_delete_nonexistent_draft(self, test_db):
        """Delete non-existent draft raises error."""
        with pytest.raises(ValueError, match="草稿不存在"):
            delete_draft(test_db, "nonexistent", user_id=1)
    
    def test_delete_other_user_draft(self, test_db):
        """Delete another user's draft raises error."""
        draft = create_draft(test_db, user_id=1, title="User 1 Draft")
        
        with pytest.raises(PermissionError, match="无权删除"):
            delete_draft(test_db, draft["id"], user_id=2)


class TestPublishHistory:
    """Tests for publish history functions."""
    
    def test_add_publish_history(self, test_db):
        """Add publish history record."""
        draft = create_draft(test_db, user_id=1, title="Test")
        
        history = add_publish_history(
            test_db,
            draft_id=draft["id"],
            user_id=1,
            platform="zhihu",
            status="success",
            platform_url="https://zhuanlan.zhihu.com/p/123",
        )
        
        assert history["id"] is not None
        assert history["platform"] == "zhihu"
        assert history["status"] == "success"
    
    def test_get_publish_history(self, test_db):
        """Get publish history for a draft."""
        import time
        import uuid
        
        draft = create_draft(test_db, user_id=1, title="Test")
        now = int(time.time())
        
        # Insert with explicit timestamps to ensure ordering
        test_db.execute("""
            INSERT INTO publish_history (id, draft_id, user_id, platform, status, platform_url, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), draft["id"], 1, "zhihu", "success", "", "", now - 10))
        test_db.execute("""
            INSERT INTO publish_history (id, draft_id, user_id, platform, status, platform_url, error_message, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (str(uuid.uuid4()), draft["id"], 1, "juejin", "failed", "", "Network error", now))
        test_db.commit()
        
        history = get_publish_history(test_db, draft["id"])
        
        assert len(history) == 2
        # Should be ordered by created_at DESC
        assert history[0]["platform"] == "juejin"
        assert history[1]["platform"] == "zhihu"


class TestTempImages:
    """Tests for temp image functions."""
    
    def test_save_temp_image(self, test_db):
        """Save temp image record."""
        image = save_temp_image(
            test_db,
            user_id=1,
            file_path="/tmp/test.jpg",
            original_name="photo.jpg",
            file_size=1024,
            mime_type="image/jpeg",
        )
        
        assert image["id"] is not None
        assert image["file_path"] == "/tmp/test.jpg"
        assert image["expires_at"] > image["created_at"]
    
    def test_get_temp_image(self, test_db):
        """Get temp image by ID."""
        saved = save_temp_image(test_db, user_id=1, file_path="/tmp/test.jpg")
        
        image = get_temp_image(test_db, saved["id"])
        
        assert image is not None
        assert image["id"] == saved["id"]
    
    def test_cleanup_expired_images(self, test_db):
        """Cleanup expired images."""
        import time
        
        # Create an image that expires in the past
        now = int(time.time())
        image_id = str(__import__('uuid').uuid4())
        test_db.execute("""
            INSERT INTO temp_images (id, user_id, file_path, original_name, file_size, mime_type, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (image_id, 1, "/tmp/expired.jpg", "expired.jpg", 100, "image/jpeg", now - 100, now - 50))
        test_db.commit()
        
        count, paths = cleanup_expired_images(test_db)
        
        assert count == 1
        assert "/tmp/expired.jpg" in paths
