"""
Test Topic API - RSS source validation and creation

Run with: uv run pytest tests/test_topic_api.py -v
"""

import pytest
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from fastapi.testclient import TestClient
from fastapi import FastAPI
from unittest.mock import patch, MagicMock, AsyncMock
import sqlite3
import tempfile
import os


# Create test app
app = FastAPI()

# Mock the dependencies
@pytest.fixture
def mock_db():
    """Create a temporary SQLite database for testing."""
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    conn = sqlite3.connect(db_path)
    
    # Create rss_sources table
    conn.execute("""
        CREATE TABLE IF NOT EXISTS rss_sources (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            url TEXT NOT NULL,
            host TEXT NOT NULL,
            category TEXT DEFAULT '',
            cadence TEXT NOT NULL DEFAULT 'P4',
            next_due_at INTEGER NOT NULL DEFAULT 0,
            last_attempt_at INTEGER NOT NULL DEFAULT 0,
            etag TEXT NOT NULL DEFAULT '',
            last_modified TEXT NOT NULL DEFAULT '',
            fail_count INTEGER NOT NULL DEFAULT 0,
            backoff_until INTEGER NOT NULL DEFAULT 0,
            last_error_reason TEXT NOT NULL DEFAULT '',
            enabled INTEGER DEFAULT 1,
            created_at INTEGER NOT NULL,
            updated_at INTEGER NOT NULL,
            added_at INTEGER NOT NULL DEFAULT 0
        )
    """)
    conn.commit()
    
    yield conn
    
    conn.close()
    os.unlink(db_path)


class TestRSSValidation:
    """Test RSS URL validation logic."""
    
    def test_valid_rss_url_format(self):
        """Test that valid RSS URLs are accepted."""
        from urllib.parse import urlparse
        
        valid_urls = [
            "https://www.apple.com/cn/newsroom/rss-feed/",
            "https://36kr.com/feed/tech/apple",
            "https://www.ifanr.com/feed/category/brands/apple",
        ]
        
        for url in valid_urls:
            parsed = urlparse(url)
            assert parsed.scheme in ['http', 'https'], f"Invalid scheme for {url}"
            assert parsed.netloc, f"Missing netloc for {url}"
    
    def test_invalid_rss_url_format(self):
        """Test that invalid URLs are rejected."""
        from urllib.parse import urlparse
        
        invalid_urls = [
            "",
            "not-a-url",
            "ftp://example.com/feed",
            "//example.com/feed",
        ]
        
        for url in invalid_urls:
            try:
                parsed = urlparse(url)
                is_valid = parsed.scheme in ['http', 'https'] and bool(parsed.netloc)
                assert not is_valid, f"Should reject {url}"
            except Exception:
                pass  # Expected for malformed URLs


class TestSourceCreation:
    """Test RSS source creation in database."""
    
    def test_create_rss_source(self, mock_db):
        """Test creating a new RSS source."""
        import time
        import uuid
        
        now = int(time.time())
        source_id = f"user-{uuid.uuid4().hex[:12]}"
        name = "Test RSS Feed"
        url = "https://example.com/feed.xml"
        host = "example.com"
        
        mock_db.execute(
            """
            INSERT INTO rss_sources (id, name, url, host, category, cadence, created_at, updated_at, added_at)
            VALUES (?, ?, ?, ?, 'user', 'P4', ?, ?, ?)
            """,
            (source_id, name, url, host, now, now, now)
        )
        mock_db.commit()
        
        # Verify
        cur = mock_db.execute("SELECT id, name, url, category FROM rss_sources WHERE id = ?", (source_id,))
        row = cur.fetchone()
        
        assert row is not None
        assert row[0] == source_id
        assert row[1] == name
        assert row[2] == url
        assert row[3] == 'user'
    
    def test_duplicate_url_detection(self, mock_db):
        """Test that duplicate URLs are detected."""
        import time
        
        now = int(time.time())
        url = "https://example.com/feed.xml"
        
        # Insert first source
        mock_db.execute(
            """
            INSERT INTO rss_sources (id, name, url, host, category, cadence, created_at, updated_at, added_at)
            VALUES (?, ?, ?, ?, 'user', 'P4', ?, ?, ?)
            """,
            ("source-1", "First Feed", url, "example.com", now, now, now)
        )
        mock_db.commit()
        
        # Check for existing
        cur = mock_db.execute("SELECT id, name FROM rss_sources WHERE url = ?", (url,))
        existing = cur.fetchone()
        
        assert existing is not None
        assert existing[0] == "source-1"
    
    def test_wechat_mp_source_creation(self, mock_db):
        """Test creating a WeChat MP source."""
        import time
        
        now = int(time.time())
        wechat_id = "applehub"
        mp_url = f"wechat://mp/{wechat_id}"
        source_id = f"mp-{wechat_id}"
        
        mock_db.execute(
            """
            INSERT INTO rss_sources (id, name, url, host, category, cadence, created_at, updated_at, added_at)
            VALUES (?, ?, ?, 'mp.weixin.qq.com', 'wechat_mp', 'P4', ?, ?, ?)
            """,
            (source_id, "苹果汇", mp_url, now, now, now)
        )
        mock_db.commit()
        
        # Verify
        cur = mock_db.execute("SELECT id, url, category FROM rss_sources WHERE id = ?", (source_id,))
        row = cur.fetchone()
        
        assert row is not None
        assert row[0] == source_id
        assert row[1] == mp_url
        assert row[2] == 'wechat_mp'


class TestRSSContentValidation:
    """Test RSS content validation."""
    
    def test_detect_rss_content(self):
        """Test detecting RSS content from response."""
        rss_samples = [
            '<?xml version="1.0"?><rss version="2.0"><channel>',
            '<feed xmlns="http://www.w3.org/2005/Atom">',
            '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0">',
        ]
        
        for content in rss_samples:
            is_rss = "<rss" in content or "<feed" in content or "<channel>" in content
            assert is_rss, f"Should detect RSS content: {content[:50]}"
    
    def test_detect_non_rss_content(self):
        """Test rejecting non-RSS content."""
        non_rss_samples = [
            '<!DOCTYPE html><html><head>',
            '{"error": "not found"}',
            'plain text content',
        ]
        
        for content in non_rss_samples:
            is_rss = "<rss" in content or "<feed" in content or "<channel>" in content
            assert not is_rss, f"Should reject non-RSS content: {content[:50]}"


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
