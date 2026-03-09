"""
WeChat Article Content Fetcher (微信文章内容获取器)

直接从 mp.weixin.qq.com 获取文章完整 HTML 内容，并提取正文。

参考: wechat-article-exporter 项目的 Downloader + html.ts + renderer.ts

功能:
1. fetch_wechat_article_html() — 服务端直接请求微信文章页面
2. extract_wechat_content() — 从 HTML 中提取正文
3. to_text() / to_markdown() / to_clean_html() — 格式转换

使用方式:
    content, error = await fetch_wechat_article(url)
"""

import asyncio
import logging
import random
import re
import time
from typing import Optional, Tuple

import httpx

logger = logging.getLogger("uvicorn.error")

# ========== Configuration ==========

# Request settings
REQUEST_TIMEOUT = 30  # seconds
MAX_RETRIES = 3
RETRY_DELAYS = [1, 2, 4]  # Exponential backoff (seconds)
MIN_REQUEST_INTERVAL = 1.0  # Minimum interval between requests

# Rate limiting state
_last_request_time: float = 0

# User-Agent rotation pool
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
]

# Elements to remove from article HTML
# Reference: wechat-article-exporter Exporter.ts getPureContent()
REMOVE_SELECTORS = [
    "#js_top_ad_area",         # 顶部广告
    "#js_tags_preview_toast",  # 标签预览
    "#content_bottom_area",    # 底部区域
    "#js_pc_qr_code",          # PC 二维码
    "#wx_stream_article_slide_tip",  # 滑动提示
    "script",                  # 所有脚本
    "style",                   # 所有样式标签（正文内的）
    "noscript",
    "iframe",
]

# Content selectors (priority order)
CONTENT_SELECTORS = [
    "#js_content",             # 微信文章正文主容器
    "#js_article",             # 微信文章外层容器
    ".rich_media_content",     # 备用选择器
]


# ========== Core Functions ==========

async def fetch_wechat_article_html(url: str) -> Tuple[Optional[str], Optional[str]]:
    """
    从微信文章页面获取完整 HTML。

    Args:
        url: 微信文章 URL (mp.weixin.qq.com/s/xxx)

    Returns:
        (html_content, error_message)
        成功时 html_content 非空，error_message 为 None
        失败时 html_content 为 None，error_message 包含错误信息
    """
    global _last_request_time

    if "mp.weixin.qq.com" not in url:
        return None, "非微信文章链接"

    headers = {
        "User-Agent": random.choice(USER_AGENTS),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
        "Referer": "https://mp.weixin.qq.com/",
    }

    for attempt in range(MAX_RETRIES):
        # Rate limiting
        now = time.time()
        elapsed = now - _last_request_time
        if elapsed < MIN_REQUEST_INTERVAL:
            await asyncio.sleep(MIN_REQUEST_INTERVAL - elapsed)
        _last_request_time = time.time()

        try:
            async with httpx.AsyncClient(
                timeout=REQUEST_TIMEOUT,
                follow_redirects=True,
            ) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                html = resp.text

            # Validate the HTML content
            # Reference: wechat-article-exporter html.ts validateHTMLContent()
            status, detail = _validate_html(html)

            if status == "success":
                logger.info(f"[WeChatFetcher] Fetched article HTML: {url} ({len(html)} bytes)")
                return html, None
            elif status == "deleted":
                logger.warning(f"[WeChatFetcher] Article deleted: {url}")
                return None, "该文章已被作者删除"
            elif status == "blocked":
                logger.warning(f"[WeChatFetcher] Article blocked: {url} - {detail}")
                return None, f"文章状态异常: {detail}"
            else:
                # Parse error or risk control — retry
                logger.warning(f"[WeChatFetcher] HTML validation failed for {url}: {detail}, attempt {attempt + 1}")
                if attempt < MAX_RETRIES - 1:
                    delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
                    await asyncio.sleep(delay)
                    # Rotate User-Agent on retry
                    headers["User-Agent"] = random.choice(USER_AGENTS)
                    continue
                return None, f"文章解析失败: {detail}"

        except httpx.HTTPStatusError as e:
            logger.warning(f"[WeChatFetcher] HTTP {e.response.status_code} for {url}, attempt {attempt + 1}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)])
            else:
                return None, f"请求失败: HTTP {e.response.status_code}"

        except httpx.TimeoutException:
            logger.warning(f"[WeChatFetcher] Timeout for {url}, attempt {attempt + 1}")
            if attempt < MAX_RETRIES - 1:
                await asyncio.sleep(RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)])
            else:
                return None, "请求超时"

        except Exception as e:
            logger.error(f"[WeChatFetcher] Error fetching {url}: {e}")
            return None, f"请求异常: {e}"

    return None, "请求失败，已达最大重试次数"


def _validate_html(html: str) -> Tuple[str, Optional[str]]:
    """
    验证微信文章 HTML 是否包含有效内容。

    Reference: wechat-article-exporter shared/utils/html.ts validateHTMLContent()

    Returns:
        (status, detail)
        status: "success" | "deleted" | "blocked" | "error"
        detail: 详细信息（用于日志和错误消息）
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")

    # Check for article content
    js_article = soup.select_one("#js_article")
    if js_article:
        return "success", None

    # Check for error/message pages
    weui_msg = soup.select_one(".weui-msg")
    if weui_msg:
        title_el = weui_msg.select_one(".weui-msg__title")
        msg = title_el.get_text(strip=True) if title_el else ""
        # Normalize whitespace
        msg = re.sub(r"\s+", " ", msg).strip()

        if msg in [
            "该内容已被发布者删除",
            "The content has been deleted by the author.",
        ]:
            return "deleted", msg
        else:
            return "blocked", msg or "未知异常"

    # Check for block message
    mesg_block = soup.select_one(".mesg-block")
    if mesg_block:
        msg = re.sub(r"\s+", " ", mesg_block.get_text(strip=True))
        return "blocked", msg

    return "error", "未找到文章内容容器"


def extract_wechat_content(
    html: str,
    output_format: str = "text",
) -> Optional[str]:
    """
    从微信文章 HTML 中提取正文内容。

    Reference: wechat-article-exporter Exporter.ts getPureContent() + renderer.ts

    Args:
        html: 完整的微信文章 HTML
        output_format: "text" | "markdown" | "html"

    Returns:
        提取的内容字符串，失败返回 None
    """
    from bs4 import BeautifulSoup

    soup = BeautifulSoup(html, "html.parser")

    # Find the content container (try multiple selectors)
    content_el = None
    for selector in CONTENT_SELECTORS:
        content_el = soup.select_one(selector)
        if content_el:
            break

    if not content_el:
        logger.warning("[WeChatFetcher] No content container found in HTML")
        return None

    # Remove unwanted elements
    # Reference: wechat-article-exporter Exporter.ts getPureContent()
    for selector in REMOVE_SELECTORS:
        for el in content_el.select(selector):
            el.decompose()

    # Handle lazy-loaded images: data-src → src
    # Reference: wechat-article-exporter Exporter.ts getPureContent()
    for img in content_el.select("img"):
        src = img.get("src")
        data_src = img.get("data-src")
        if not src and data_src:
            img["src"] = data_src
        # Remove height to fix aspect ratio (reference: renderer.ts renderContent_0)
        if img.get("height"):
            del img["height"]

    # Handle text share messages (#js_text_desc)
    # Reference: wechat-article-exporter Exporter.ts getPureContent()
    js_text_desc = content_el.select_one("#js_text_desc")
    if js_text_desc and not js_text_desc.get_text(strip=True):
        # Try to extract from JavaScript variables
        text_content_match = re.search(
            r"var\s+TextContentNoEncode\s*=\s*window\.a_value_which_never_exists\s*\|\|\s*'([^']*)'",
            html,
        )
        content_match = re.search(
            r"var\s+ContentNoEncode\s*=\s*window\.a_value_which_never_exists\s*\|\|\s*'([^']*)'",
            html,
        )

        desc = None
        if text_content_match:
            desc = text_content_match.group(1)
        elif content_match:
            desc = content_match.group(1)

        if desc:
            # Unescape and set content
            desc = desc.replace("\\x0a", "\n").replace("\\n", "\n")
            js_text_desc.string = desc

    # Make #js_content visible (it's hidden by default via inline style)
    js_content = content_el.select_one("#js_content")
    if js_content and js_content.get("style"):
        del js_content["style"]

    # Extract title
    title = ""
    title_el = soup.select_one("#activity-name")
    if title_el:
        title = title_el.get_text(strip=True)

    if output_format == "text":
        return _to_text(content_el, title)
    elif output_format == "markdown":
        return _to_markdown(content_el, title)
    elif output_format == "html":
        return _to_clean_html(content_el, title, html)
    else:
        return _to_text(content_el, title)


def _to_text(content_el, title: str = "") -> str:
    """
    提取纯文本内容。

    Reference: wechat-article-exporter Exporter.ts getPureContent() format='text'
    """
    text = content_el.get_text(separator="\n", strip=True)

    # Clean up whitespace
    lines = text.split("\n")
    lines = [line.strip() for line in lines if line.strip()]
    text = "\n".join(lines)

    # Prepend title
    if title:
        text = f"{title}\n\n{text}"

    return text


def _to_markdown(content_el, title: str = "") -> str:
    """
    转换为 Markdown 格式。

    Uses html2text for conversion.
    Reference: wechat-article-exporter Exporter.ts exportMarkdownFiles() using TurndownService
    """
    try:
        import html2text

        h = html2text.HTML2Text()
        h.ignore_links = False
        h.ignore_images = False
        h.body_width = 0  # No wrapping
        h.unicode_snob = True
        h.images_to_alt = False
        h.single_line_break = True

        html_content = str(content_el)
        markdown = h.handle(html_content)

        # Clean up
        markdown = re.sub(r"\n{3,}", "\n\n", markdown).strip()

        # Prepend title
        if title:
            markdown = f"# {title}\n\n{markdown}"

        return markdown

    except ImportError:
        logger.warning("[WeChatFetcher] html2text not installed, falling back to text")
        return _to_text(content_el, title)


def _to_clean_html(content_el, title: str = "", original_html: str = "") -> str:
    """
    生成清理后的 HTML（保留排版样式）。

    Reference: wechat-article-exporter shared/utils/html.ts normalizeHtml()
    """
    from bs4 import BeautifulSoup

    # Extract stylesheets from original HTML
    styles = ""
    if original_html:
        orig_soup = BeautifulSoup(original_html, "html.parser")
        for style_tag in orig_soup.select("head style"):
            styles += str(style_tag) + "\n"
        for link_tag in orig_soup.select('head link[rel="stylesheet"]'):
            styles += str(link_tag) + "\n"

    page_content = str(content_el)

    return f"""<!DOCTYPE html>
<html lang="zh_CN">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=0,viewport-fit=cover">
    <meta name="referrer" content="no-referrer">
    <title>{title}</title>
    {styles}
    <style>
        #js_row_immersive_stream_wrap {{
            max-width: 667px;
            margin: 0 auto;
        }}
        #page-content,
        #js_article_bottom_bar,
        .__page_content__ {{
            max-width: 667px;
            margin: 0 auto;
        }}
        img {{
            max-width: 100%;
        }}
    </style>
</head>
<body>
{page_content}
</body>
</html>"""


# ========== High-Level API ==========

async def fetch_wechat_article(
    url: str,
    output_format: str = "text",
) -> Tuple[Optional[str], Optional[str]]:
    """
    获取微信文章内容的高级 API。

    一步完成：请求页面 → 提取正文 → 格式转换

    Args:
        url: 微信文章 URL
        output_format: "text" | "markdown" | "html"

    Returns:
        (content, error_message)
        成功时 content 非空，error_message 为 None
    """
    # Step 1: Fetch HTML
    html, error = await fetch_wechat_article_html(url)
    if error or html is None:
        return None, error

    # Step 2: Extract content
    content = extract_wechat_content(html, output_format=output_format)

    if content is None or len(content) < 50:
        logger.warning(f"[WeChatFetcher] Content too short for {url}: {len(content) if content else 0} chars")
        return None, "提取的文章内容过短，可能是防爬限制"

    logger.info(f"[WeChatFetcher] Extracted {len(content)} chars ({output_format}) from {url}")
    return content, None
