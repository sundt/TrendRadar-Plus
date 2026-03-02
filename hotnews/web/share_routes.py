# coding=utf-8
"""
Share Page Routes - 分享页面

提供分享内容的 HTML 页面展示
"""

import logging
from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import HTMLResponse

router = APIRouter()


def _get_online_db_conn(request: Request):
    from hotnews.web.db_online import get_online_db_conn
    return get_online_db_conn(request.app.state.project_root)


def _ensure_share_table(conn):
    """Ensure the share table exists."""
    conn.execute("""
        CREATE TABLE IF NOT EXISTS summary_shares (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            share_id TEXT UNIQUE NOT NULL,
            user_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            url TEXT NOT NULL,
            summary TEXT NOT NULL,
            article_type TEXT,
            created_at INTEGER NOT NULL,
            view_count INTEGER DEFAULT 0,
            is_public INTEGER DEFAULT 1
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS idx_share_id ON summary_shares(share_id)")
    conn.commit()


def _escape_attr(value: str) -> str:
    """Escape value for safe use in HTML attribute context."""
    return (value
            .replace('&', '&amp;')
            .replace('"', '&quot;')
            .replace("'", '&#x27;')
            .replace('<', '&lt;')
            .replace('>', '&gt;'))


def _escape_html(value: str) -> str:
    """Escape value for safe use in HTML text content."""
    return (value
            .replace('&', '&amp;')
            .replace('<', '&lt;')
            .replace('>', '&gt;'))


def _safe_url(url: str) -> str:
    """Only allow http/https URLs to prevent javascript: injection."""
    try:
        from urllib.parse import urlparse
        if urlparse(url).scheme in ('http', 'https'):
            return url
    except Exception:
        pass
    return '#'


def _render_markdown_to_html(md_text: str) -> str:
    """Simple markdown to HTML conversion."""
    import re
    
    html = md_text
    
    # Escape HTML
    html = html.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
    
    # Headers
    html = re.sub(r'^### (.+)$', r'<h3>\1</h3>', html, flags=re.MULTILINE)
    html = re.sub(r'^## (.+)$', r'<h2>\1</h2>', html, flags=re.MULTILINE)
    html = re.sub(r'^# (.+)$', r'<h1>\1</h1>', html, flags=re.MULTILINE)
    
    # Bold
    html = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', html)
    
    # Italic
    html = re.sub(r'\*(.+?)\*', r'<em>\1</em>', html)
    
    # Lists
    html = re.sub(r'^- (.+)$', r'<li>\1</li>', html, flags=re.MULTILINE)
    html = re.sub(r'(<li>.*</li>\n?)+', r'<ul>\g<0></ul>', html)
    
    # Paragraphs
    paragraphs = html.split('\n\n')
    html = ''.join(f'<p>{p}</p>' if not p.startswith('<') else p for p in paragraphs if p.strip())
    
    return html


@router.get("/share/{share_id}")
async def share_page(request: Request, share_id: str, background_tasks: BackgroundTasks):
    """Render share page HTML."""
    conn = _get_online_db_conn(request)
    _ensure_share_table(conn)
    
    cur = conn.execute(
        "SELECT title, url, summary, article_type, created_at FROM summary_shares WHERE share_id = ? AND is_public = 1",
        (share_id,)
    )
    row = cur.fetchone()
    
    if not row:
        return HTMLResponse(content="""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>分享不存在 - uihash</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .error { text-align: center; color: #666; }
        .error h1 { font-size: 48px; margin: 0; }
        .error p { font-size: 18px; }
        .error a { color: #007aff; text-decoration: none; }
    </style>
</head>
<body>
    <div class="error">
        <h1>404</h1>
        <p>分享不存在或已删除</p>
        <p><a href="https://hot.uihash.com">返回首页</a></p>
    </div>
</body>
</html>
        """, status_code=404)
    
    title, url, summary, article_type, created_at = row

    # Increment view count in background to avoid blocking response
    def _increment_view(c, sid):
        try:
            c.execute("UPDATE summary_shares SET view_count = view_count + 1 WHERE share_id = ?", (sid,))
            c.commit()
        except Exception:
            pass
    background_tasks.add_task(_increment_view, conn, share_id)

    # Convert markdown to HTML
    summary_html = _render_markdown_to_html(summary)

    # Format date
    from datetime import datetime
    date_str = datetime.fromtimestamp(created_at).strftime('%Y-%m-%d %H:%M') if created_at else ''

    # Extract domain from URL
    try:
        from urllib.parse import urlparse
        domain = urlparse(url).netloc.replace('www.', '')
    except Exception:
        domain = ''

    # Escape all user-controlled values before embedding in HTML
    title_html = _escape_html(title)
    title_attr = _escape_attr(title)
    summary_attr = _escape_attr(summary[:150])
    safe_url = _escape_attr(_safe_url(url))
    domain_html = _escape_html(domain)

    html = f"""
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title_html} - uihash 总结</title>
    <meta name="description" content="{summary_attr}...">
    <meta property="og:title" content="{title_attr}">
    <meta property="og:description" content="{summary_attr}...">
    <meta property="og:type" content="article">
    <link rel="icon" href="/static/images/hxlogo.webp" type="image/webp">
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
            background: #F5F5F3;
            min-height: 100vh;
            padding: 24px 16px;
        }}
        .container {{
            max-width: 680px;
            margin: 0 auto;
        }}
        .header {{
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 12px 0 24px;
        }}
        .logo {{
            width: 28px;
            height: 28px;
            border-radius: 6px;
        }}
        .brand {{
            color: #86868B;
            font-size: 14px;
            font-weight: 500;
        }}
        .card {{
            background: #FAFAF8;
            border-radius: 12px;
            box-shadow: 0 1px 3px rgba(0,0,0,0.08);
            overflow: hidden;
        }}
        .card-header {{
            padding: 32px 32px 24px;
        }}
        .card-title {{
            font-size: 24px;
            font-weight: 600;
            color: #1D1D1F;
            line-height: 1.4;
            margin-bottom: 16px;
            letter-spacing: -0.02em;
        }}
        .card-meta {{
            display: flex;
            align-items: center;
            gap: 16px;
            font-size: 13px;
            color: #86868B;
        }}
        .divider {{
            height: 1px;
            background: #E8E6E3;
            margin: 0 32px;
        }}
        .card-content {{
            padding: 24px 32px 32px;
            font-size: 16px;
            line-height: 1.8;
            color: #424245;
        }}
        .card-content h1, .card-content h2 {{
            font-size: 18px;
            font-weight: 600;
            margin: 1.5em 0 0.6em;
            color: #1D1D1F;
        }}
        .card-content h3 {{
            font-size: 16px;
            font-weight: 600;
            margin: 1.2em 0 0.5em;
            color: #1D1D1F;
        }}
        .card-content p {{
            margin: 0.8em 0;
        }}
        .card-content ul {{
            margin: 0.8em 0;
            padding-left: 0;
            list-style: none;
        }}
        .card-content li {{
            position: relative;
            padding-left: 1.2em;
            margin: 0.5em 0;
        }}
        .card-content li::before {{
            content: "";
            position: absolute;
            left: 0;
            top: 0.7em;
            width: 5px;
            height: 5px;
            background: #86868B;
            border-radius: 50%;
        }}
        .card-content strong {{
            color: #1D1D1F;
            font-weight: 600;
        }}
        .card-footer {{
            padding: 20px 32px;
            background: #F5F5F3;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }}
        .source-link {{
            color: #007AFF;
            text-decoration: none;
            font-size: 14px;
            font-weight: 500;
        }}
        .source-link:hover {{
            text-decoration: underline;
        }}
        .powered {{
            font-size: 14px;
            color: #86868B;
        }}
        .powered a {{
            color: #007AFF;
            text-decoration: none;
            font-weight: 500;
        }}
        .powered a:hover {{
            color: #1D1D1F;
        }}
        @media (max-width: 600px) {{
            body {{ padding: 16px 12px; }}
            .card-header {{ padding: 24px 20px 20px; }}
            .card-content {{ padding: 20px; }}
            .card-footer {{ padding: 16px 20px; }}
            .divider {{ margin: 0 20px; }}
            .card-title {{ font-size: 20px; }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <img src="/static/images/hxlogo.webp" alt="uihash" class="logo">
            <span class="brand">uihash · 智能总结</span>
        </div>
        <div class="card">
            <div class="card-header">
                <h1 class="card-title">{title_html}</h1>
                <div class="card-meta">
                    <span>{date_str}</span>
                    {f'<span>{domain_html}</span>' if domain else ''}
                </div>
            </div>
            <div class="divider"></div>
            <div class="card-content">
                {summary_html}
            </div>
            <div class="card-footer">
                <a href="{safe_url}" target="_blank" rel="noopener noreferrer" class="source-link">阅读原文 →</a>
                <span class="powered"><a href="https://hot.uihash.com" target="_blank">uihash智能总结</a></span>
            </div>
        </div>
    </div>
</body>
</html>
    """
    
    return HTMLResponse(
        content=html,
        headers={"Cache-Control": "public, max-age=300"},
    )
