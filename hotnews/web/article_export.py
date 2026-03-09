"""
Article Export API — 文章合集导出

POST /api/articles/export
接收文章列表，并发获取正文，返回合集 HTML 页面
"""

import asyncio
import logging
import time
from typing import List, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import HTMLResponse
from pydantic import BaseModel

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/articles", tags=["article-export"])


class ArticleItem(BaseModel):
    title: str
    url: str


class ExportRequest(BaseModel):
    articles: List[ArticleItem]
    card_title: Optional[str] = ""


# Max concurrent fetches to avoid overwhelming targets
MAX_CONCURRENT = 3
# Max articles per export request
MAX_ARTICLES = 30
# Timeout per article fetch
FETCH_TIMEOUT = 20


async def _fetch_single_article(title: str, url: str, semaphore: asyncio.Semaphore) -> dict:
    """Fetch a single article's content."""
    async with semaphore:
        try:
            is_wechat = "mp.weixin.qq.com" in url

            if is_wechat:
                from hotnews.kernel.services.wechat_content_fetcher import fetch_wechat_article
                content, error = await asyncio.wait_for(
                    fetch_wechat_article(url, output_format="html"),
                    timeout=FETCH_TIMEOUT,
                )
                if content:
                    return {"title": title, "url": url, "content": content, "format": "html", "error": None}
                else:
                    # Fallback: try text format
                    content, error = await asyncio.wait_for(
                        fetch_wechat_article(url, output_format="text"),
                        timeout=FETCH_TIMEOUT,
                    )
                    if content:
                        return {"title": title, "url": url, "content": content, "format": "text", "error": None}
                    return {"title": title, "url": url, "content": None, "format": None, "error": error}
            else:
                # Non-WeChat: use article_summary's fetch
                from hotnews.kernel.services.article_summary import fetch_article_content
                content, error, method = await asyncio.wait_for(
                    fetch_article_content(url),
                    timeout=FETCH_TIMEOUT,
                )
                if content:
                    return {"title": title, "url": url, "content": content, "format": "text", "error": None}
                return {"title": title, "url": url, "content": None, "format": None, "error": error}

        except asyncio.TimeoutError:
            return {"title": title, "url": url, "content": None, "format": None, "error": "获取超时"}
        except Exception as e:
            logger.error(f"[ArticleExport] Error fetching {url}: {e}")
            return {"title": title, "url": url, "content": None, "format": None, "error": str(e)}


def _build_export_html(card_title: str, results: list) -> str:
    """Build a beautiful HTML page combining all articles."""
    from datetime import datetime

    now = datetime.now().strftime("%Y-%m-%d %H:%M")
    success_count = sum(1 for r in results if r.get("content"))
    total_count = len(results)

    # Build table of contents
    toc_items = []
    for i, r in enumerate(results, 1):
        status = "✓" if r.get("content") else "✗"
        toc_items.append(f'<li><a href="#article-{i}">{status} {_escape(r["title"])}</a></li>')
    toc_html = "\n".join(toc_items)

    # Build article sections
    article_sections = []
    for i, r in enumerate(results, 1):
        title = _escape(r["title"])
        url = _escape(r["url"])

        if r.get("content"):
            if r.get("format") == "html":
                # WeChat HTML content — extract body content only
                body = _extract_body(r["content"])
            else:
                # Text content — wrap in pre-formatted block
                body = f'<div class="text-content">{_escape(r["content"])}</div>'
        else:
            error = _escape(r.get("error") or "未知错误")
            body = f'<div class="fetch-error">⚠️ 无法获取文章内容：{error}</div>'

        article_sections.append(f"""
        <article id="article-{i}" class="article-section">
            <div class="article-header">
                <h2 class="article-title">{i}. {title}</h2>
                <a href="{url}" class="article-source" target="_blank">查看原文 ↗</a>
            </div>
            <div class="article-body">
                {body}
            </div>
        </article>
        <hr class="article-divider">
        """)

    articles_html = "\n".join(article_sections)

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{_escape(card_title or '文章合集')} — HotNews</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');

        * {{ margin: 0; padding: 0; box-sizing: border-box; }}

        body {{
            font-family: 'Noto Serif SC', 'Georgia', serif;
            line-height: 1.8;
            color: #1a1a1a;
            background: #fff;
            max-width: 800px;
            margin: 0 auto;
            padding: 40px 24px 80px;
        }}

        /* ─── Cover ─── */
        .cover {{
            text-align: center;
            padding: 60px 20px 40px;
            margin-bottom: 40px;
            border-bottom: 3px double #333;
        }}
        .cover h1 {{
            font-size: 28px;
            font-weight: 700;
            margin-bottom: 12px;
            letter-spacing: 1px;
        }}
        .cover .meta {{
            font-family: 'Inter', sans-serif;
            font-size: 13px;
            color: #888;
        }}

        /* ─── TOC ─── */
        .toc {{
            margin: 30px 0 50px;
            padding: 24px 30px;
            background: #f8f8f8;
            border-radius: 8px;
        }}
        .toc h3 {{
            font-size: 16px;
            margin-bottom: 12px;
            color: #555;
        }}
        .toc ol {{
            padding-left: 20px;
            font-size: 14px;
            line-height: 2;
        }}
        .toc a {{
            color: #333;
            text-decoration: none;
        }}
        .toc a:hover {{
            color: #0066cc;
        }}

        /* ─── Articles ─── */
        .article-section {{
            margin: 40px 0;
            page-break-inside: avoid;
        }}
        .article-header {{
            display: flex;
            justify-content: space-between;
            align-items: baseline;
            margin-bottom: 16px;
            flex-wrap: wrap;
            gap: 8px;
        }}
        .article-title {{
            font-size: 20px;
            font-weight: 600;
            color: #111;
            flex: 1;
        }}
        .article-source {{
            font-family: 'Inter', sans-serif;
            font-size: 12px;
            color: #999;
            text-decoration: none;
            white-space: nowrap;
        }}
        .article-source:hover {{
            color: #0066cc;
        }}
        .article-body {{
            font-size: 16px;
            line-height: 1.9;
            color: #333;
        }}
        .article-body img {{
            max-width: 100%;
            height: auto;
            margin: 16px 0;
            border-radius: 4px;
        }}
        .article-body p {{
            margin-bottom: 12px;
        }}
        .text-content {{
            white-space: pre-wrap;
            word-wrap: break-word;
            font-family: 'Noto Serif SC', serif;
        }}
        .fetch-error {{
            padding: 16px 20px;
            background: #fff3cd;
            border: 1px solid #ffc107;
            border-radius: 6px;
            color: #856404;
            font-size: 14px;
        }}

        /* ─── Divider ─── */
        .article-divider {{
            border: none;
            border-top: 1px solid #e5e5e5;
            margin: 50px auto;
            width: 60%;
        }}

        /* ─── Print Styles ─── */
        @media print {{
            body {{
                padding: 0;
                max-width: none;
            }}
            .cover {{
                page-break-after: always;
            }}
            .toc {{
                page-break-after: always;
            }}
            .article-section {{
                page-break-before: always;
            }}
            .article-source {{
                display: none;
            }}
            .no-print {{
                display: none !important;
            }}
        }}
    </style>
</head>
<body>
    <!-- Cover -->
    <div class="cover">
        <h1>{_escape(card_title or '文章合集')}</h1>
        <div class="meta">
            共 {total_count} 篇文章 · 成功获取 {success_count} 篇 · 生成于 {now}
        </div>
    </div>

    <!-- Table of Contents -->
    <div class="toc">
        <h3>📑 目录</h3>
        <ol>
            {toc_html}
        </ol>
    </div>

    <!-- Articles -->
    {articles_html}

    <!-- Footer -->
    <div style="text-align: center; padding: 30px 0; color: #ccc; font-size: 12px;">
        Powered by HotNews · {now}
    </div>

    <!-- Auto print (only in popup window) -->
    <script>
        if (window.opener || window.name === 'export-window') {{
            window.onload = function() {{
                setTimeout(function() {{
                    window.print();
                }}, 800);
            }};
        }}
    </script>
</body>
</html>"""


def _escape(s: str) -> str:
    """HTML escape."""
    return (s or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def _extract_body(html: str) -> str:
    """Extract body content from a full HTML document."""
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        body = soup.find("body")
        if body:
            return str(body.decode_contents())
        return html
    except Exception:
        return html


@router.post("/export", response_class=HTMLResponse)
async def export_articles(req: ExportRequest):
    """
    批量获取文章内容，返回合集 HTML 页面。

    前端可以在新窗口中打开此 HTML，然后 Ctrl+P 保存为 PDF。
    """
    if not req.articles:
        raise HTTPException(status_code=400, detail="文章列表不能为空")

    if len(req.articles) > MAX_ARTICLES:
        raise HTTPException(status_code=400, detail=f"最多支持 {MAX_ARTICLES} 篇文章")

    logger.info(f"[ArticleExport] Exporting {len(req.articles)} articles, card: {req.card_title}")
    start_time = time.time()

    # Fetch all articles concurrently
    semaphore = asyncio.Semaphore(MAX_CONCURRENT)
    tasks = [
        _fetch_single_article(a.title, a.url, semaphore)
        for a in req.articles
    ]
    results = await asyncio.gather(*tasks)

    elapsed = time.time() - start_time
    success = sum(1 for r in results if r.get("content"))
    logger.info(f"[ArticleExport] Done: {success}/{len(results)} articles in {elapsed:.1f}s")

    # Build combined HTML
    html = _build_export_html(req.card_title or "", list(results))
    return HTMLResponse(content=html)
