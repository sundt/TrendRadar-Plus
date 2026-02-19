# coding=utf-8
"""
Image Upload API Routes

Provides REST API endpoints for image upload and management.
"""

import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Request, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse

from .auth import require_member, _get_online_db_conn
from .db import save_temp_image, get_temp_image, cleanup_expired_images

router = APIRouter(prefix="/api/publisher", tags=["publisher"])


# ==================== Constants ====================

ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
UPLOAD_DIR_NAME = "publisher_uploads"


def _get_upload_dir(request: Request) -> Path:
    """Get the upload directory path."""
    project_root = request.app.state.project_root
    upload_dir = project_root / "output" / UPLOAD_DIR_NAME
    upload_dir.mkdir(parents=True, exist_ok=True)
    return upload_dir


def _get_file_extension(filename: str) -> str:
    """Get file extension from filename."""
    if '.' not in filename:
        return ''
    return filename.rsplit('.', 1)[1].lower()


def _validate_image(file: UploadFile, content: bytes) -> str:
    """
    Validate uploaded image.
    
    Returns:
        File extension
        
    Raises:
        HTTPException: If validation fails
    """
    # Check file extension
    ext = _get_file_extension(file.filename or '')
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的图片格式，支持: {', '.join(ALLOWED_EXTENSIONS)}")
    
    # Check file size
    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"图片大小不能超过 {MAX_FILE_SIZE // 1024 // 1024}MB")
    
    # Basic magic number check for common image formats
    magic_numbers = {
        b'\x89PNG': 'png',
        b'\xff\xd8\xff': 'jpg',
        b'GIF87a': 'gif',
        b'GIF89a': 'gif',
        b'RIFF': 'webp',  # WebP starts with RIFF
    }
    
    is_valid = False
    for magic, _ in magic_numbers.items():
        if content.startswith(magic):
            is_valid = True
            break
    
    if not is_valid:
        raise HTTPException(400, "无效的图片文件")
    
    return ext


def _detect_ext_from_bytes(content: bytes) -> str:
    """Detect image extension from file content magic bytes."""
    if content.startswith(b'\x89PNG'):
        return 'png'
    if content.startswith(b'\xff\xd8\xff'):
        return 'jpg'
    if content.startswith(b'GIF87a') or content.startswith(b'GIF89a'):
        return 'gif'
    if content.startswith(b'RIFF') and len(content) > 12 and content[8:12] == b'WEBP':
        return 'webp'
    return ''


# ==================== API Endpoints ====================

@router.post("/upload/image")
async def api_upload_image(
    request: Request,
    file: UploadFile = File(...),
    type: str = Query("content", pattern="^(cover|content)$"),
):
    """
    Upload an image.
    
    Args:
        file: Image file
        type: Image type (cover or content)
        
    Returns:
        Temp image info with URL
    """
    user = await require_member(request)
    
    # Read file content
    content = await file.read()
    
    # Validate
    ext = _validate_image(file, content)
    
    # Generate safe filename
    temp_id = str(uuid.uuid4())
    safe_filename = f"{temp_id}.{ext}"
    
    # Save file
    upload_dir = _get_upload_dir(request)
    file_path = upload_dir / safe_filename
    
    with open(file_path, 'wb') as f:
        f.write(content)
    
    # Save to database
    conn = _get_online_db_conn(request)
    image_info = save_temp_image(
        conn,
        user_id=user["id"],
        file_path=str(file_path),
        original_name=file.filename or '',
        file_size=len(content),
        mime_type=file.content_type or f"image/{ext}",
    )
    
    # Build response URL
    image_url = f"/api/publisher/image/{image_info['id']}"
    
    return {
        "ok": True,
        "data": {
            "temp_id": image_info["id"],
            "url": image_url,
            "original_name": image_info["original_name"],
            "file_size": image_info["file_size"],
            "expires_at": image_info["expires_at"],
        }
    }


@router.get("/image/{image_id}")
async def api_get_image(request: Request, image_id: str):
    """
    Get a temp image by ID.
    
    Returns the image file.
    """
    conn = _get_online_db_conn(request)
    image = get_temp_image(conn, image_id)
    
    if not image:
        raise HTTPException(404, "图片不存在")
    
    # Check if expired
    import time
    if image["expires_at"] < int(time.time()):
        raise HTTPException(410, "图片已过期")
    
    # Check if file exists
    file_path = Path(image["file_path"])
    if not file_path.exists():
        raise HTTPException(404, "图片文件不存在")
    
    return FileResponse(
        path=str(file_path),
        media_type=image["mime_type"],
        filename=image["original_name"],
    )


@router.delete("/upload/cleanup")
async def api_cleanup_images(request: Request):
    """
    Clean up expired temp images.
    
    This endpoint should be called by a scheduled task.
    """
    # Note: In production, this should be protected or called internally
    conn = _get_online_db_conn(request)
    count, paths = cleanup_expired_images(conn)
    
    # Delete actual files
    deleted_files = 0
    for path in paths:
        try:
            if os.path.exists(path):
                os.remove(path)
                deleted_files += 1
        except Exception:
            pass
    
    return {
        "ok": True,
        "data": {
            "records_deleted": count,
            "files_deleted": deleted_files,
        }
    }


# ==================== URL-based Image Upload ====================

from pydantic import BaseModel, Field
import logging

logger = logging.getLogger("uvicorn.error")


class UploadFromUrlRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=4096, description="外部图片 URL")


@router.post("/upload/from-url")
async def api_upload_from_url(request: Request, data: UploadFromUrlRequest):
    """
    从外部 URL 下载图片并上传到本地。
    
    用于粘贴图文混合内容时，将外部图片转存到自己服务器。
    """
    import httpx

    user = await require_member(request)

    url = data.url.strip()
    if not url.startswith(("http://", "https://")):
        raise HTTPException(400, "无效的图片 URL")

    # 根据域名设置合适的 Referer 和 headers
    from urllib.parse import urlparse
    parsed = urlparse(url)
    hostname = (parsed.hostname or "").lower()
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    }
    
    # 微信图片需要微信域名的 Referer
    if "qpic.cn" in hostname or "mmbiz" in hostname or "weixin" in hostname:
        headers["Referer"] = "https://mp.weixin.qq.com/"
    else:
        headers["Referer"] = f"{parsed.scheme}://{parsed.netloc}/"

    # 下载外部图片
    try:
        async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            content = resp.content
    except Exception as e:
        logger.warning(f"Failed to download image from {url[:200]}: {e}")
        raise HTTPException(400, f"图片下载失败: {str(e)[:100]}")

    if len(content) > MAX_FILE_SIZE:
        raise HTTPException(400, f"图片大小不能超过 {MAX_FILE_SIZE // 1024 // 1024}MB")

    # 通过 magic bytes 检测格式
    ext = _detect_ext_from_bytes(content)
    if not ext:
        raise HTTPException(400, "无法识别的图片格式")

    # 保存文件
    temp_id = str(uuid.uuid4())
    safe_filename = f"{temp_id}.{ext}"

    upload_dir = _get_upload_dir(request)
    file_path = upload_dir / safe_filename

    with open(file_path, "wb") as f:
        f.write(content)

    # 从 URL 提取原始文件名
    from urllib.parse import urlparse
    parsed = urlparse(url)
    original_name = os.path.basename(parsed.path) or f"image.{ext}"

    conn = _get_online_db_conn(request)
    image_info = save_temp_image(
        conn,
        user_id=user["id"],
        file_path=str(file_path),
        original_name=original_name,
        file_size=len(content),
        mime_type=f"image/{ext}",
    )

    image_url = f"/api/publisher/image/{image_info['id']}"

    return {
        "ok": True,
        "data": {
            "temp_id": image_info["id"],
            "url": image_url,
            "original_name": original_name,
            "file_size": len(content),
        },
    }
