# coding=utf-8
"""
Tests for draft API endpoints.

Integration tests for /api/publisher/drafts endpoints.
"""

import pytest
import sys
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi.testclient import TestClient
from fastapi import FastAPI

from hotnews.web.api.publisher.drafts import router as drafts_router


# Create test app
app = FastAPI()
app.include_router(drafts_router)


@pytest.fixture
def mock_db():
    """Mock database connection."""
    conn = MagicMock()
    return conn


@pytest.fixture
def mock_member_user():
    """Mock authenticated member user."""
    return {"id": 1, "nickname": "Test User", "is_member": True}


@pytest.fixture
def mock_non_member_user():
    """Mock authenticated non-member user."""
    return {"id": 2, "nickname": "Non Member", "is_member": False}


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


class TestCreateDraftAPI:
    """Tests for POST /api/publisher/drafts endpoint."""
    
    def test_create_draft_success(self, client, mock_member_user, mock_db):
        """Create draft with valid data."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.create_draft') as mock_create:
                    mock_create.return_value = {
                        "id": "test-id",
                        "user_id": 1,
                        "title": "Test Title",
                        "version": 1,
                    }
                    
                    response = client.post("/api/publisher/drafts", json={
                        "title": "Test Title",
                        "digest": "Test digest",
                        "html_content": "<p>Content</p>",
                    })
                    
                    assert response.status_code == 200
                    data = response.json()
                    assert data["ok"] is True
                    assert data["data"]["id"] == "test-id"
    
    def test_create_draft_empty(self, client, mock_member_user, mock_db):
        """Create draft with empty data."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.create_draft') as mock_create:
                    mock_create.return_value = {
                        "id": "test-id",
                        "user_id": 1,
                        "title": "",
                        "version": 1,
                    }
                    
                    response = client.post("/api/publisher/drafts", json={})
                    
                    assert response.status_code == 200
    
    def test_create_draft_title_too_long(self, client, mock_member_user):
        """Create draft with title exceeding max length."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            response = client.post("/api/publisher/drafts", json={
                "title": "x" * 200,  # Exceeds 64 char limit
            })
            
            assert response.status_code == 400
            assert "标题" in response.json()["detail"]
    
    def test_create_draft_xss_sanitized(self, client, mock_member_user, mock_db):
        """XSS in content should be sanitized."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.create_draft') as mock_create:
                    mock_create.return_value = {"id": "test-id", "user_id": 1, "version": 1}
                    
                    response = client.post("/api/publisher/drafts", json={
                        "html_content": '<p>Hello</p><script>alert("xss")</script>',
                    })
                    
                    assert response.status_code == 200
                    # Verify sanitize_html was called
                    call_args = mock_create.call_args
                    assert "<script>" not in call_args.kwargs.get("html_content", "")


class TestListDraftsAPI:
    """Tests for GET /api/publisher/drafts endpoint."""
    
    def test_list_drafts_success(self, client, mock_member_user, mock_db):
        """List drafts successfully."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.list_drafts') as mock_list:
                    mock_list.return_value = ([
                        {"id": "1", "title": "Draft 1"},
                        {"id": "2", "title": "Draft 2"},
                    ], 2)
                    
                    response = client.get("/api/publisher/drafts")
                    
                    assert response.status_code == 200
                    data = response.json()
                    assert data["ok"] is True
                    assert data["data"]["total"] == 2
                    assert len(data["data"]["items"]) == 2
    
    def test_list_drafts_with_pagination(self, client, mock_member_user, mock_db):
        """List drafts with pagination params."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.list_drafts') as mock_list:
                    mock_list.return_value = ([], 0)
                    
                    response = client.get("/api/publisher/drafts?page=2&page_size=10")
                    
                    assert response.status_code == 200
                    mock_list.assert_called_once()
                    call_kwargs = mock_list.call_args.kwargs
                    assert call_kwargs["page"] == 2
                    assert call_kwargs["page_size"] == 10
    
    def test_list_drafts_with_status_filter(self, client, mock_member_user, mock_db):
        """List drafts with status filter."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.list_drafts') as mock_list:
                    mock_list.return_value = ([], 0)
                    
                    response = client.get("/api/publisher/drafts?status=published")
                    
                    assert response.status_code == 200
                    call_kwargs = mock_list.call_args.kwargs
                    assert call_kwargs["status"] == "published"


class TestGetDraftAPI:
    """Tests for GET /api/publisher/drafts/{draft_id} endpoint."""
    
    def test_get_draft_success(self, client, mock_member_user, mock_db):
        """Get draft successfully."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.get_draft') as mock_get:
                    with patch('hotnews.web.api.publisher.drafts.get_publish_history') as mock_history:
                        mock_get.return_value = {
                            "id": "test-id",
                            "user_id": 1,
                            "title": "Test",
                        }
                        mock_history.return_value = []
                        
                        response = client.get("/api/publisher/drafts/test-id")
                        
                        assert response.status_code == 200
                        data = response.json()
                        assert data["ok"] is True
                        assert data["data"]["id"] == "test-id"
    
    def test_get_draft_not_found(self, client, mock_member_user, mock_db):
        """Get non-existent draft returns 404."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.get_draft') as mock_get:
                    mock_get.return_value = None
                    
                    response = client.get("/api/publisher/drafts/nonexistent")
                    
                    assert response.status_code == 404
    
    def test_get_draft_forbidden(self, client, mock_member_user, mock_db):
        """Get another user's draft returns 403."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.get_draft') as mock_get:
                    mock_get.return_value = {
                        "id": "test-id",
                        "user_id": 999,  # Different user
                        "title": "Test",
                    }
                    
                    response = client.get("/api/publisher/drafts/test-id")
                    
                    assert response.status_code == 403


class TestUpdateDraftAPI:
    """Tests for PUT /api/publisher/drafts/{draft_id} endpoint."""
    
    def test_update_draft_success(self, client, mock_member_user, mock_db):
        """Update draft successfully."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.update_draft') as mock_update:
                    mock_update.return_value = {
                        "id": "test-id",
                        "title": "Updated",
                        "version": 2,
                    }
                    
                    response = client.put("/api/publisher/drafts/test-id", json={
                        "title": "Updated",
                    })
                    
                    assert response.status_code == 200
                    data = response.json()
                    assert data["data"]["title"] == "Updated"
    
    def test_update_draft_version_conflict(self, client, mock_member_user, mock_db):
        """Update with version conflict returns 400."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.update_draft') as mock_update:
                    mock_update.side_effect = ValueError("草稿已被修改")
                    
                    response = client.put("/api/publisher/drafts/test-id", json={
                        "title": "Updated",
                        "expected_version": 1,
                    })
                    
                    assert response.status_code == 400
                    assert "已被修改" in response.json()["detail"]


class TestDeleteDraftAPI:
    """Tests for DELETE /api/publisher/drafts/{draft_id} endpoint."""
    
    def test_delete_draft_success(self, client, mock_member_user, mock_db):
        """Delete draft successfully."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.delete_draft') as mock_delete:
                    mock_delete.return_value = True
                    
                    response = client.delete("/api/publisher/drafts/test-id")
                    
                    assert response.status_code == 200
                    assert response.json()["ok"] is True
    
    def test_delete_draft_not_found(self, client, mock_member_user, mock_db):
        """Delete non-existent draft returns 404."""
        with patch('hotnews.web.api.publisher.drafts.require_member', return_value=mock_member_user):
            with patch('hotnews.web.api.publisher.drafts._get_user_db_conn', return_value=mock_db):
                with patch('hotnews.web.api.publisher.drafts.delete_draft') as mock_delete:
                    mock_delete.side_effect = ValueError("草稿不存在")
                    
                    response = client.delete("/api/publisher/drafts/nonexistent")
                    
                    assert response.status_code == 404
