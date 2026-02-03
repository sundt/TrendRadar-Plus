# coding=utf-8
"""
Tests for image upload API endpoints.

Integration tests for /api/publisher/upload endpoints.
"""

import pytest
import sys
import io
from pathlib import Path
from unittest.mock import patch, MagicMock

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from fastapi.testclient import TestClient
from fastapi import FastAPI

from hotnews.web.api.publisher.upload import router as upload_router, ALLOWED_EXTENSIONS, MAX_FILE_SIZE


# Create test app
app = FastAPI()
app.include_router(upload_router)


@pytest.fixture
def mock_member_user():
    """Mock authenticated member user."""
    return {"id": 1, "nickname": "Test User", "is_member": True}


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


def create_test_image(format="PNG", size=(100, 100)):
    """Create a test image file."""
    try:
        from PIL import Image
        img = Image.new("RGB", size, color="red")
        buffer = io.BytesIO()
        img.save(buffer, format=format)
        buffer.seek(0)
        return buffer
    except ImportError:
        # Fallback: create minimal valid image bytes
        if format.upper() == "PNG":
            # Minimal valid PNG
            return io.BytesIO(b'\x89PNG\r\n\x1a\n' + b'\x00' * 100)
        elif format.upper() in ("JPEG", "JPG"):
            # Minimal valid JPEG
            return io.BytesIO(b'\xff\xd8\xff\xe0' + b'\x00' * 100)
        elif format.upper() == "GIF":
            # Minimal valid GIF
            return io.BytesIO(b'GIF89a' + b'\x00' * 100)
        elif format.upper() == "WEBP":
            # Minimal valid WebP
            return io.BytesIO(b'RIFF' + b'\x00' * 100)
        return io.BytesIO(b'\x00' * 100)


class TestUploadImage:
    """Tests for POST /api/publisher/upload/image endpoint."""
    
    def test_upload_invalid_type(self, client, mock_member_user):
        """Upload non-image file should fail."""
        with patch('hotnews.web.api.publisher.upload.require_member', return_value=mock_member_user):
            response = client.post(
                "/api/publisher/upload/image",
                files={"file": ("test.txt", b"not an image", "text/plain")},
            )
            
            assert response.status_code == 400
            assert "不支持" in response.json()["detail"]
    
    def test_upload_file_too_large(self, client, mock_member_user):
        """Upload file exceeding size limit should fail."""
        with patch('hotnews.web.api.publisher.upload.require_member', return_value=mock_member_user):
            # Create a large fake file (> 5MB)
            large_data = b"x" * (6 * 1024 * 1024)
            
            response = client.post(
                "/api/publisher/upload/image",
                files={"file": ("large.png", large_data, "image/png")},
            )
            
            assert response.status_code == 400
            assert "5MB" in response.json()["detail"]


class TestGetImage:
    """Tests for GET /api/publisher/image/{image_id} endpoint."""
    
    def test_get_image_not_found(self, client):
        """Get non-existent image returns 404."""
        with patch('hotnews.web.api.publisher.upload._get_user_db_conn') as mock_conn:
            with patch('hotnews.web.api.publisher.upload.get_temp_image') as mock_get:
                mock_get.return_value = None
                
                response = client.get("/api/publisher/image/nonexistent")
                
                assert response.status_code == 404


class TestImageValidation:
    """Tests for image validation constants."""
    
    def test_allowed_extensions_png(self):
        """PNG extension should be allowed."""
        assert "png" in ALLOWED_EXTENSIONS
    
    def test_allowed_extensions_jpg(self):
        """JPG extension should be allowed."""
        assert "jpg" in ALLOWED_EXTENSIONS
        assert "jpeg" in ALLOWED_EXTENSIONS
    
    def test_allowed_extensions_gif(self):
        """GIF extension should be allowed."""
        assert "gif" in ALLOWED_EXTENSIONS
    
    def test_allowed_extensions_webp(self):
        """WebP extension should be allowed."""
        assert "webp" in ALLOWED_EXTENSIONS
    
    def test_max_file_size(self):
        """Max file size should be 5MB."""
        assert MAX_FILE_SIZE == 5 * 1024 * 1024
