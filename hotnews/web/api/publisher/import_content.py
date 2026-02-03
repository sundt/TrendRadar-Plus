# coding=utf-8
"""
Content Import API Routes

Provides REST API endpoints for importing content from various sources:
- HotNews news articles
- User collections
- AI summaries
- External URLs
- Document files (Markdown, PDF, Word)
"""

from typing import Optional

from fastapi import APIRouter, Request, HTTPException, Body, UploadFile, File
from pydantic import BaseModel

from .auth import require_member, _get_user_db_conn
from .sanitize import sanitize_html

router = APIRouter(prefix="/api/publisher/import", tags=["publisher"])


# ==================== Request Models ====================

class UrlImportRequest(BaseModel):
    url: str


# ==================== Helper Functions ====================

def _get_online_db_conn(request: Request):
    """Get online database connection for news data."""
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


# ==================== API Endpoints ====================

@router.get("/news/{news_id}")
async def api_import_news(request: Request, news_id: str):
    """
    Import content from a HotNews news article.
    
    Args:
        news_id: News article ID
        
    Returns:
        Article content ready for draft creation
    """
    user = await require_member(request)
    
    # Get news from online database
    try:
        conn = _get_online_db_conn(request)
        cur = conn.execute("""
            SELECT id, title, summary, url, cover_url, source_name, published_at
            FROM news WHERE id = ?
        """, (news_id,))
        row = cur.fetchone()
        
        if not row:
            raise HTTPException(404, "新闻不存在")
        
        # Build content
        title = row[1] or ""
        summary = row[2] or ""
        source_url = row[3] or ""
        cover_url = row[4] or ""
        source_name = row[5] or ""
        
        # Create HTML content from summary
        html_content = f"<p>{summary}</p>" if summary else ""
        if source_url:
            html_content += f'<p><a href="{source_url}" target="_blank">原文链接</a></p>'
        
        return {
            "ok": True,
            "data": {
                "title": title,
                "digest": summary[:200] if summary else "",
                "cover_url": cover_url,
                "html_content": html_content,
                "source_url": source_url,
                "source_name": source_name,
                "import_type": "news",
                "import_source_id": news_id,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"导入失败: {str(e)}")


@router.get("/collection/{collection_id}")
async def api_import_collection(request: Request, collection_id: str):
    """
    Import content from a user's collection.
    
    Args:
        collection_id: Collection item ID
        
    Returns:
        Collection content ready for draft creation
    """
    user = await require_member(request)
    
    # Get collection from user database
    try:
        conn = _get_user_db_conn(request)
        cur = conn.execute("""
            SELECT id, news_id, title, summary, url, cover_url, user_id
            FROM user_collections WHERE id = ?
        """, (collection_id,))
        row = cur.fetchone()
        
        if not row:
            raise HTTPException(404, "收藏不存在")
        
        # Check ownership
        if row[6] != user["id"]:
            raise HTTPException(403, "无权访问此收藏")
        
        title = row[2] or ""
        summary = row[3] or ""
        source_url = row[4] or ""
        cover_url = row[5] or ""
        
        html_content = f"<p>{summary}</p>" if summary else ""
        if source_url:
            html_content += f'<p><a href="{source_url}" target="_blank">原文链接</a></p>'
        
        return {
            "ok": True,
            "data": {
                "title": title,
                "digest": summary[:200] if summary else "",
                "cover_url": cover_url,
                "html_content": html_content,
                "source_url": source_url,
                "import_type": "collection",
                "import_source_id": collection_id,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"导入失败: {str(e)}")


@router.get("/summary/{summary_id}")
async def api_import_summary(request: Request, summary_id: str):
    """
    Import content from an AI summary.
    
    Args:
        summary_id: Summary ID
        
    Returns:
        Summary content ready for draft creation
    """
    user = await require_member(request)
    
    # Get summary from database
    try:
        conn = _get_user_db_conn(request)
        cur = conn.execute("""
            SELECT id, title, content, user_id, source_url
            FROM ai_summaries WHERE id = ?
        """, (summary_id,))
        row = cur.fetchone()
        
        if not row:
            raise HTTPException(404, "总结不存在")
        
        # Check ownership
        if row[3] != user["id"]:
            raise HTTPException(403, "无权访问此总结")
        
        title = row[1] or ""
        content = row[2] or ""
        source_url = row[4] or ""
        
        # Convert markdown to HTML if needed (simple conversion)
        html_content = content.replace('\n\n', '</p><p>').replace('\n', '<br>')
        if html_content:
            html_content = f"<p>{html_content}</p>"
        
        return {
            "ok": True,
            "data": {
                "title": title,
                "digest": content[:200] if content else "",
                "cover_url": "",
                "html_content": html_content,
                "source_url": source_url,
                "import_type": "summary",
                "import_source_id": summary_id,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"导入失败: {str(e)}")


def _clean_article_html(html_content: str) -> str:
    """
    Clean extracted article HTML to keep only essential content elements.
    
    This function:
    1. Removes all non-content elements (buttons, forms, etc.)
    2. Keeps only allowed tags (p, h1-h6, img, a, ul, ol, li, blockquote, etc.)
    3. Removes empty elements
    4. Cleans up attributes
    """
    from bs4 import BeautifulSoup
    
    if not html_content:
        return ""
    
    soup = BeautifulSoup(html_content, 'html.parser')
    
    # Tags to completely remove (including content)
    remove_tags = [
        'script', 'style', 'nav', 'header', 'footer', 'aside', 'form',
        'iframe', 'noscript', 'svg', 'canvas', 'button', 'input', 'select',
        'textarea', 'video', 'audio', 'source', 'track', 'map', 'area',
        'object', 'embed', 'param', 'picture', 'figcaption',
    ]
    for tag_name in remove_tags:
        for el in soup.find_all(tag_name):
            el.decompose()
    
    # Remove elements by class/id patterns (UI elements, not content)
    ui_patterns = [
        'comment', 'share', 'social', 'follow', 'subscribe', 'author',
        'avatar', 'profile', 'sidebar', 'related', 'recommend', 'ad',
        'advertisement', 'popup', 'modal', 'toast', 'notification',
        'breadcrumb', 'pagination', 'tag', 'meta', 'footer', 'header',
        'nav', 'menu', 'toolbar', 'action', 'button', 'btn', 'icon',
        'badge', 'label', 'chip', 'card-footer', 'card-header',
        'like', 'vote', 'rating', 'bookmark', 'favorite', 'collect',
        'reply', 'report', 'flag', 'more', 'expand', 'collapse',
    ]
    
    for el in list(soup.find_all(True)):
        if el is None or el.name is None:
            continue
        try:
            el_class = ' '.join(el.get('class', []) or []).lower()
            el_id = (el.get('id') or '').lower()
        except (AttributeError, TypeError):
            continue
        
        # Check if element matches UI patterns
        should_remove = False
        for pattern in ui_patterns:
            if pattern in el_class or pattern in el_id:
                should_remove = True
                break
        if should_remove:
            el.decompose()
    
    # Tags to keep (content tags)
    allowed_tags = {
        'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'strong', 'b', 'em', 'i', 'u', 's', 'del',
        'blockquote', 'code', 'pre',
        'ul', 'ol', 'li',
        'a', 'img',
        'br', 'hr',
        'table', 'thead', 'tbody', 'tr', 'td', 'th',
        'figure',
    }
    
    # Allowed attributes per tag
    allowed_attrs = {
        'a': ['href', 'title'],
        'img': ['src', 'alt', 'data-src', 'data-original'],
        '*': [],  # No global attributes by default
    }
    
    # Process all elements
    for el in list(soup.find_all(True)):
        if el.name is None:
            continue
        tag_name = el.name.lower()
        
        if tag_name not in allowed_tags:
            # Unwrap the tag but keep its content
            el.unwrap()
        else:
            # Clean attributes
            tag_allowed = allowed_attrs.get(tag_name, [])
            attrs_to_remove = []
            for attr in el.attrs:
                if attr not in tag_allowed:
                    attrs_to_remove.append(attr)
            for attr in attrs_to_remove:
                del el[attr]
    
    # Fix image src (handle lazy loading)
    for img in list(soup.find_all('img')):
        if img.name is None:
            continue
        src = img.get('src', '')
        data_src = img.get('data-src') or img.get('data-original')
        
        # Use data-src if src is a placeholder
        if data_src and (not src or 'placeholder' in src.lower() or 'loading' in src.lower() or len(src) < 20):
            img['src'] = data_src
        
        # Remove data attributes
        for attr in ['data-src', 'data-original']:
            if attr in img.attrs:
                del img[attr]
        
        # Remove small images (likely icons)
        src = img.get('src', '')
        if any(x in src.lower() for x in ['avatar', 'profile', 'icon', 'logo', 'emoji', 'badge']):
            img.decompose()
    
    # Remove empty elements
    for _ in range(3):  # Multiple passes to handle nested empty elements
        for el in list(soup.find_all(['p', 'div', 'span', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'])):
            if el.name is None:
                continue
            if not el.get_text(strip=True) and not el.find('img'):
                el.decompose()
    
    # Convert to string and clean up whitespace
    result = str(soup)
    
    # Remove excessive whitespace
    import re
    result = re.sub(r'\n\s*\n', '\n', result)
    result = re.sub(r'>\s+<', '><', result)
    
    return result.strip()


@router.post("/url")
async def api_import_url(request: Request, data: UrlImportRequest):
    """
    Import content from an external URL.
    
    This endpoint fetches the URL and extracts article content.
    
    Args:
        data: URL to import
        
    Returns:
        Extracted content ready for draft creation
    """
    user = await require_member(request)
    
    url = data.url.strip()
    if not url:
        raise HTTPException(400, "URL 不能为空")
    
    if not url.startswith(('http://', 'https://')):
        raise HTTPException(400, "URL 必须以 http:// 或 https:// 开头")
    
    try:
        import httpx
        from bs4 import BeautifulSoup
        
        # Fetch URL
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            response = await client.get(url, headers={
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            })
            response.raise_for_status()
            html = response.text
        
        # Parse HTML
        soup = BeautifulSoup(html, 'html.parser')
        
        # Extract title
        title = ""
        # Try og:title first
        og_title = soup.find('meta', property='og:title')
        if og_title:
            title = og_title.get('content', '').strip()
        # Fallback to title tag
        if not title:
            title_tag = soup.find('title')
            if title_tag:
                title = title_tag.get_text().strip()
                # Remove site name suffix (e.g., "文章标题 - 少数派")
                if ' - ' in title:
                    title = title.split(' - ')[0].strip()
                elif ' | ' in title:
                    title = title.split(' | ')[0].strip()
        
        # Remove unwanted elements before extracting content
        unwanted_selectors = [
            'script', 'style', 'nav', 'header', 'footer', 'aside',
            'iframe', 'noscript', 'svg', 'canvas', 'form', 'button',
        ]
        
        for selector in unwanted_selectors:
            for el in soup.select(selector):
                el.decompose()
        
        # Try to find article content with more specific selectors
        content = ""
        
        # Priority selectors for article body
        article_selectors = [
            'article .content',
            'article .post-content',
            'article .article-content',
            'article .entry-content',
            '.article-body',
            '.post-body',
            '.entry-content',
            '.post-content',
            '.article-content',
            '[itemprop="articleBody"]',
            '[class*="article-content"]',
            '[class*="post-content"]',
            '[class*="entry-content"]',
            'article',
            'main article',
            'main',
            '#content',
            '.content',
        ]
        
        for selector in article_selectors:
            article = soup.select_one(selector)
            if article:
                # Check if it has meaningful content
                text = article.get_text(strip=True)
                if len(text) > 100:  # At least 100 chars
                    content = str(article)
                    break
        
        # Fallback to body
        if not content:
            body = soup.find('body')
            if body:
                content = str(body)
        
        # Clean the extracted content
        content = _clean_article_html(content)
        
        # Sanitize content (XSS protection)
        content = sanitize_html(content)
        
        # Extract cover image
        cover_url = ""
        og_image = soup.find('meta', property='og:image')
        if og_image:
            cover_url = og_image.get('content', '') or ''
        
        # Extract description for digest
        digest = ""
        og_desc = soup.find('meta', property='og:description')
        if og_desc:
            digest = (og_desc.get('content') or '')[:200]
        else:
            meta_desc = soup.find('meta', attrs={'name': 'description'})
            if meta_desc:
                digest = (meta_desc.get('content') or '')[:200]
        
        return {
            "ok": True,
            "data": {
                "title": title[:64] if title else "",
                "digest": digest,
                "cover_url": cover_url,
                "html_content": content,
                "source_url": url,
                "import_type": "url",
                "import_source_url": url,
            }
        }
        
    except httpx.HTTPError as e:
        raise HTTPException(400, f"无法访问 URL: {str(e)}")
    except Exception as e:
        raise HTTPException(500, f"导入失败: {str(e)}")



@router.post("/document")
async def api_import_document(
    request: Request,
    file: UploadFile = File(...)
):
    """
    Import content from a document file.
    
    Supported formats:
    - Markdown (.md, .markdown)
    - PDF (.pdf)
    - Word (.docx)
    
    Args:
        file: Uploaded document file
        
    Returns:
        Extracted content ready for draft creation
    """
    user = await require_member(request)
    
    # Validate file
    if not file.filename:
        raise HTTPException(400, "文件名不能为空")
    
    # Check file size (max 10MB)
    MAX_SIZE = 10 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(400, "文件大小不能超过 10MB")
    
    try:
        from .document_parser import parse_document, DocumentParseError, get_supported_formats
        
        title, digest, html_content = parse_document(content, file.filename)
        
        # Sanitize HTML content
        html_content = sanitize_html(html_content)
        
        return {
            "ok": True,
            "data": {
                "title": title,
                "digest": digest,
                "cover_url": "",
                "html_content": html_content,
                "import_type": "document",
                "import_filename": file.filename,
            }
        }
        
    except DocumentParseError as e:
        raise HTTPException(400, str(e))
    except Exception as e:
        raise HTTPException(500, f"文档解析失败: {str(e)}")


@router.get("/document/formats")
async def api_get_supported_formats(request: Request):
    """
    Get list of supported document formats.
    
    Returns:
        List of supported formats with extensions and names
    """
    from .document_parser import get_supported_formats
    
    return {
        "ok": True,
        "data": get_supported_formats()
    }
