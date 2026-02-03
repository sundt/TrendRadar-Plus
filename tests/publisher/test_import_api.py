# coding=utf-8
"""
Tests for content import API endpoints.

Integration tests for /api/publisher/import endpoints.
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock, AsyncMock

sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi.testclient import TestClient
from fastapi import FastAPI

from hotnews.web.api.publisher.import_content import router as import_router


# Create test app
app = FastAPI()
app.include_router(import_router)


@pytest.fixture
def mock_member_user():
    """Mock authenticated member user."""
    return {"id": 1, "nickname": "Test User", "is_member": True}


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


class TestImportNews:
    """Tests for GET /api/publisher/import/news/{news_id} endpoint."""
    
    def test_import_news_not_found(self, client, mock_member_user):
        """Import non-existent news returns 404."""
        with patch('hotnews.web.api.publisher.import_content.require_member', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = mock_member_user
            with patch('hotnews.web.api.publisher.import_content._get_online_db_conn') as mock_conn:
                mock_cursor = MagicMock()
                mock_cursor.fetchone.return_value = None
                mock_conn.return_value.execute.return_value = mock_cursor
                
                response = client.get("/api/publisher/import/news/nonexistent")
                
                assert response.status_code == 404
    
    def test_import_news_success(self, client, mock_member_user):
        """Import existing news returns content."""
        with patch('hotnews.web.api.publisher.import_content.require_member', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = mock_member_user
            with patch('hotnews.web.api.publisher.import_content._get_online_db_conn') as mock_conn:
                mock_cursor = MagicMock()
                # (id, title, summary, url, cover_url, source_name, published_at)
                mock_cursor.fetchone.return_value = (
                    "news123", "Test Title", "Test Summary", 
                    "https://example.com", "https://example.com/cover.jpg",
                    "Test Source", 1234567890
                )
                mock_conn.return_value.execute.return_value = mock_cursor
                
                response = client.get("/api/publisher/import/news/news123")
                
                assert response.status_code == 200
                data = response.json()
                assert data["ok"] is True
                assert data["data"]["title"] == "Test Title"
                assert data["data"]["import_type"] == "news"


class TestImportCollection:
    """Tests for GET /api/publisher/import/collection/{collection_id} endpoint."""
    
    def test_import_collection_not_found(self, client, mock_member_user):
        """Import non-existent collection returns 404."""
        with patch('hotnews.web.api.publisher.import_content.require_member', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = mock_member_user
            with patch('hotnews.web.api.publisher.import_content._get_user_db_conn') as mock_conn:
                mock_cursor = MagicMock()
                mock_cursor.fetchone.return_value = None
                mock_conn.return_value.execute.return_value = mock_cursor
                
                response = client.get("/api/publisher/import/collection/nonexistent")
                
                assert response.status_code == 404
    
    def test_import_collection_forbidden(self, client, mock_member_user):
        """Import other user's collection returns 403."""
        with patch('hotnews.web.api.publisher.import_content.require_member', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = mock_member_user
            with patch('hotnews.web.api.publisher.import_content._get_user_db_conn') as mock_conn:
                mock_cursor = MagicMock()
                # (id, news_id, title, summary, url, cover_url, user_id)
                mock_cursor.fetchone.return_value = (
                    "col123", "news123", "Test Title", "Test Summary",
                    "https://example.com", "https://example.com/cover.jpg",
                    999  # Different user
                )
                mock_conn.return_value.execute.return_value = mock_cursor
                
                response = client.get("/api/publisher/import/collection/col123")
                
                assert response.status_code == 403


class TestImportUrl:
    """Tests for POST /api/publisher/import/url endpoint."""
    
    def test_import_url_empty(self, client, mock_member_user):
        """Import empty URL returns 400."""
        with patch('hotnews.web.api.publisher.import_content.require_member', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = mock_member_user
            
            response = client.post(
                "/api/publisher/import/url",
                json={"url": ""}
            )
            
            assert response.status_code == 400
    
    def test_import_url_invalid_protocol(self, client, mock_member_user):
        """Import URL with invalid protocol returns 400."""
        with patch('hotnews.web.api.publisher.import_content.require_member', new_callable=AsyncMock) as mock_auth:
            mock_auth.return_value = mock_member_user
            
            response = client.post(
                "/api/publisher/import/url",
                json={"url": "ftp://example.com"}
            )
            
            assert response.status_code == 400
            assert "http" in response.json()["detail"].lower()
