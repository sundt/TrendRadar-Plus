# coding=utf-8
"""
Article Summary Service

Provides article content extraction and AI summarization.
Supports multiple AI providers: Baidu Qianfan (default), Alibaba DashScope (fallback)
"""

import os
import time
import logging
import httpx
from typing import Optional, Tuple

logger = logging.getLogger(__name__)

# Rate limiting: track user requests
_rate_limit_cache = {}  # {user_id: [(timestamp, count)]}
RATE_LIMIT_WINDOW = 3600  # 1 hour
RATE_LIMIT_MAX = 20  # max requests per window

# Content limits
MAX_CONTENT_LENGTH = 8000  # characters
REQUEST_TIMEOUT = 10  # seconds (reduced from 30 for faster feedback)

# AI Provider configuration
# Priority: Baidu Qianfan > Alibaba DashScope
QIANFAN_API_URL = "https://qianfan.baidubce.com/v2/chat/completions"
QIANFAN_DEFAULT_MODEL = "ernie-5.0-thinking-preview"  # Default model, can be overridden
DASHSCOPE_API_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"


def check_rate_limit(user_id: int) -> Tuple[bool, int]:
    """
    Check if user has exceeded rate limit.
    Returns (is_allowed, remaining_requests)
    """
    now = time.time()
    window_start = now - RATE_LIMIT_WINDOW
    
    if user_id not in _rate_limit_cache:
        _rate_limit_cache[user_id] = []
    
    # Clean old entries
    _rate_limit_cache[user_id] = [
        ts for ts in _rate_limit_cache[user_id] if ts > window_start
    ]
    
    count = len(_rate_limit_cache[user_id])
    remaining = RATE_LIMIT_MAX - count
    
    if count >= RATE_LIMIT_MAX:
        return False, 0
    
    return True, remaining


def record_request(user_id: int):
    """Record a request for rate limiting."""
    now = time.time()
    if user_id not in _rate_limit_cache:
        _rate_limit_cache[user_id] = []
    _rate_limit_cache[user_id].append(now)


def _extract_with_readability(html: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract content using readability-lxml."""
    try:
        from readability import Document
        from bs4 import BeautifulSoup
        
        doc = Document(html)
        title = doc.title()
        content_html = doc.summary()
        
        soup = BeautifulSoup(content_html, 'html.parser')
        
        for tag in soup(['script', 'style', 'nav', 'footer', 'header']):
            tag.decompose()
        
        text = soup.get_text(separator='\n', strip=True)
        lines = [line.strip() for line in text.split('\n') if line.strip()]
        content = '\n'.join(lines)
        
        return title, content
    except Exception as e:
        logger.warning(f"Readability extraction failed: {e}")
        return None, None


def _extract_with_selectors(html: str) -> Tuple[Optional[str], Optional[str]]:
    """Extract content using common CSS selectors as fallback."""
    try:
        from bs4 import BeautifulSoup
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Try to get title
        title = None
        title_tag = soup.find('title')
        if title_tag:
            title = title_tag.get_text(strip=True)
        
        # Common article content selectors (priority order)
        selectors = [
            'article',
            '[class*="article-content"]',
            '[class*="post-content"]',
            '[class*="entry-content"]',
            '[class*="content-body"]',
            '[class*="rich_media_content"]',  # WeChat
            '[id*="article"]',
            '[id*="content"]',
            'main',
            '.content',
            '#content',
        ]
        
        content_elem = None
        for selector in selectors:
            content_elem = soup.select_one(selector)
            if content_elem:
                break
        
        if not content_elem:
            # Fallback: find the largest text block
            content_elem = soup.find('body')
        
        if content_elem:
            # Remove unwanted elements
            for tag in content_elem.find_all(['script', 'style', 'nav', 'footer', 'header', 'aside', 'iframe', 'noscript']):
                tag.decompose()
            
            text = content_elem.get_text(separator='\n', strip=True)
            lines = [line.strip() for line in text.split('\n') if line.strip()]
            content = '\n'.join(lines)
            
            return title, content
        
        return title, None
    except Exception as e:
        logger.warning(f"Selector extraction failed: {e}")
        return None, None


def _extract_meta_description(html: str) -> Optional[str]:
    """Extract meta description as last resort."""
    try:
        from bs4 import BeautifulSoup
        
        soup = BeautifulSoup(html, 'html.parser')
        
        # Try og:description first
        og_desc = soup.find('meta', property='og:description')
        if og_desc and og_desc.get('content'):
            return og_desc['content']
        
        # Try regular description
        desc = soup.find('meta', attrs={'name': 'description'})
        if desc and desc.get('content'):
            return desc['content']
        
        return None
    except Exception:
        return None


async def _fetch_with_jina(url: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Fetch content using Jina Reader API (free, returns clean Markdown).
    Returns (content, error_message)
    """
    jina_url = f"https://r.jina.ai/{url}"
    
    headers = {
        'Accept': 'text/plain',
        'User-Agent': 'Mozilla/5.0 (compatible; HotNews/1.0)',
    }
    
    try:
        async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
            resp = await client.get(jina_url, headers=headers)
            resp.raise_for_status()
            content = resp.text
            
            if content and len(content) > 100:
                logger.info(f"Jina Reader succeeded for {url}, got {len(content)} chars")
                return content, None
            else:
                return None, "Jina 返回内容太短"
                
    except httpx.HTTPStatusError as e:
        logger.warning(f"Jina Reader failed ({e.response.status_code}): {url}")
        return None, f"Jina 请求失败: {e.response.status_code}"
    except httpx.TimeoutException:
        logger.warning(f"Jina Reader timeout: {url}")
        return None, "Jina 请求超时"
    except Exception as e:
        logger.warning(f"Jina Reader error: {url} - {e}")
        return None, f"Jina 请求错误: {e}"


async def fetch_article_content(url: str, use_proxy: bool = True) -> Tuple[Optional[str], Optional[str], str]:
    """
    Fetch and extract article content from URL.
    Uses multiple extraction strategies as fallback.
    Returns (content, error_message, fetch_method)
    fetch_method: "http", "jina", "scraperapi", "fallback", "error"
    """
    import os
    
    try:
        from bs4 import BeautifulSoup
    except ImportError as e:
        logger.error(f"Missing dependency: {e}")
        return None, "服务依赖缺失，请联系管理员", "error"
    
    headers = {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'gzip, deflate',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
    }
    
    # Special handling for WeChat articles
    if 'mp.weixin.qq.com' in url:
        headers['Referer'] = 'https://mp.weixin.qq.com/'
    
    html = None
    fetch_error = None
    fetch_method = "error"
    
    # WeChat articles need JS rendering, skip direct fetch
    is_wechat = 'mp.weixin.qq.com' in url
    
    # Try direct fetch first (skip for WeChat)
    if not is_wechat:
        try:
            async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT, follow_redirects=True) as client:
                resp = await client.get(url, headers=headers)
                resp.raise_for_status()
                html = resp.text
                fetch_method = "http"
                logger.info(f"Direct fetch succeeded for {url}")
        except httpx.HTTPStatusError as e:
            fetch_error = f"网页请求失败: {e.response.status_code}"
            logger.warning(f"Direct fetch failed ({e.response.status_code}): {url}")
        except httpx.TimeoutException:
            fetch_error = "网页请求超时"
            logger.warning(f"Direct fetch timeout: {url}")
        except Exception as e:
            fetch_error = "网页无法访问"
            logger.warning(f"Direct fetch error: {url} - {e}")
    
    # If direct fetch failed, try Jina Reader first (free, good for Chinese sites)
    if html is None and use_proxy:
        logger.info(f"Trying Jina Reader for {url}")
        jina_content, jina_error = await _fetch_with_jina(url)
        if jina_content:
            # Jina returns clean Markdown, can use directly
            # Truncate if too long
            if len(jina_content) > MAX_CONTENT_LENGTH:
                jina_content = jina_content[:MAX_CONTENT_LENGTH] + "\n\n[内容已截断...]"
            return jina_content, None, "jina"
        else:
            logger.info(f"Jina Reader failed: {jina_error}")
    
    # If Jina also failed, try ScraperAPI as last resort
    if html is None and use_proxy:
        scraperapi_key = os.environ.get("SCRAPERAPI_KEY", "")
        if scraperapi_key:
            logger.info(f"Trying ScraperAPI for {url}")
            try:
                # ScraperAPI endpoint - enable render for JS-heavy sites
                # render=true for sites like Zhihu that need JS
                import urllib.parse
                encoded_url = urllib.parse.quote(url, safe='')
                
                # Check if site needs JS rendering
                needs_render = any(domain in url for domain in [
                    'zhihu.com', 'weibo.com', 'douyin.com', 'xiaohongshu.com',
                    'bilibili.com', 'toutiao.com', 'mp.weixin.qq.com'
                ])
                render_param = 'true' if needs_render else 'false'
                
                proxy_url = f"http://api.scraperapi.com?api_key={scraperapi_key}&url={encoded_url}&render={render_param}"
                
                async with httpx.AsyncClient(timeout=90, follow_redirects=True) as client:
                    resp = await client.get(proxy_url)
                    resp.raise_for_status()
                    html = resp.text
                    fetch_method = "scraperapi"
                    logger.info(f"ScraperAPI fetch succeeded for {url}")
                    fetch_error = None
            except httpx.HTTPStatusError as e:
                logger.warning(f"ScraperAPI failed ({e.response.status_code}): {url}")
                # Try to get error details
                try:
                    error_body = e.response.text[:200]
                    logger.warning(f"ScraperAPI error body: {error_body}")
                except:
                    pass
                if fetch_error is None:
                    fetch_error = f"代理请求失败: {e.response.status_code}"
            except Exception as e:
                logger.warning(f"ScraperAPI error: {url} - {e}")
                if fetch_error is None:
                    fetch_error = "代理请求失败"
    
    if html is None:
        return None, fetch_error or "该网站暂时无法访问，请稍后再试或直接点击链接阅读 📖", "error"
    
    # Log HTML length for debugging
    logger.info(f"Fetched {len(html)} bytes from {url}")
    
    # Strategy 1: Try readability-lxml
    title, content = _extract_with_readability(html)
    
    # Strategy 2: If readability fails or content too short, try CSS selectors
    if not content or len(content) < 100:
        logger.info(f"Readability got {len(content) if content else 0} chars, trying selectors")
        title2, content2 = _extract_with_selectors(html)
        if content2 and len(content2) > len(content or ''):
            title = title2 or title
            content = content2
    
    # Strategy 3: If still too short, try meta description
    if not content or len(content) < 50:
        meta_desc = _extract_meta_description(html)
        if meta_desc and len(meta_desc) > 50:
            logger.info(f"Using meta description ({len(meta_desc)} chars)")
            content = meta_desc
    
    # Final check
    if not content or len(content) < 50:
        logger.warning(f"Content extraction failed for {url}, got {len(content) if content else 0} chars")
        return None, "该网站设置了访问限制，暂时无法获取文章内容。建议直接点击链接阅读原文 📖", "error"
    
    # Clean up content
    # Remove excessive newlines
    import re
    content = re.sub(r'\n{3,}', '\n\n', content)
    
    # Truncate if too long
    if len(content) > MAX_CONTENT_LENGTH:
        content = content[:MAX_CONTENT_LENGTH] + "\n\n[内容已截断...]"
    
    # Prepend title if available
    if title:
        content = f"# {title}\n\n{content}"
    
    logger.info(f"Extracted {len(content)} chars from {url}")
    return content, None, fetch_method


# System prompt for summarization
SUMMARY_SYSTEM_PROMPT = """你是一位专业的内容分析助手。请对文章进行结构化总结，遵循以下规范：

通用输出规范：
1. 结构化：必须使用 Markdown 标题、列表和加粗来组织信息。
2. 准确性：严禁编造原文不存在的细节。如果是推测，必须注明"可能"。
3. 语言：输出语言与原文保持一致，技术术语保留英文。
4. 深度：不要只做表面摘要，要挖掘核心价值和关键信息。
5. 链接：文中涉及的产品、工具、框架，尽量附带官方链接（格式：[名称](URL)）。
6. 简洁：总结控制在 500 字以内，突出重点。"""

SUMMARY_USER_TEMPLATE = """请总结以下文章的核心内容：

## 🎯 核心要点
（用 2-3 句话概括文章主旨）

## 📝 关键信息
1. 
2. 
3. 

## 💡 主要结论
（作者的核心观点或建议）

## 🔗 相关资源
（文中提到的产品、工具或链接，如无则省略此节）

---
【文章内容】：
{content}"""


async def generate_summary(content: str, api_key: str, model: str = "qwen-plus") -> Tuple[Optional[str], Optional[str]]:
    """
    Generate summary using DashScope API (legacy, uses default template).
    Returns (summary, error_message)
    """
    if not api_key:
        return None, "AI 服务未配置"
    
    user_prompt = SUMMARY_USER_TEMPLATE.format(content=content)
    
    # DashScope compatible API (OpenAI format)
    url = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 1500
    }
    
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            
            if "choices" in data and len(data["choices"]) > 0:
                summary = data["choices"][0]["message"]["content"]
                return summary.strip(), None
            else:
                return None, "AI 返回内容为空"
                
    except httpx.TimeoutException:
        return None, "AI 服务响应超时"
    except httpx.HTTPStatusError as e:
        logger.error(f"DashScope API error: {e.response.text}")
        return None, f"AI 服务错误: {e.response.status_code}"
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        return None, "AI 总结生成失败"


async def classify_article(
    content: str, 
    api_key: str, 
    model: str = None,
    source_name: str = None
) -> dict:
    """
    Classify article type using AI with confidence score.
    Supports Baidu Qianfan and Alibaba DashScope.
    
    Args:
        content: Article content
        api_key: API key (Qianfan or DashScope)
        model: Model name (auto-detected based on provider)
        source_name: Source name for hints (e.g., "36氪")
    
    Returns:
        dict with 'type' and 'confidence', e.g., {"type": "news", "confidence": 0.85}
    """
    from hotnews.kernel.services.prompts import (
        get_classify_prompt, ARTICLE_TYPES, CONFIDENCE_THRESHOLD, TYPE_MAPPING
    )
    import json as json_module
    
    default_result = {"type": "general", "confidence": 0.5}
    
    if not api_key:
        return default_result
    
    # Determine provider and URL based on API key or environment
    # Priority: Qianfan > DashScope
    qianfan_key = os.environ.get("QIANFAN_API_KEY", "")
    use_qianfan = bool(qianfan_key)
    
    if use_qianfan:
        url = QIANFAN_API_URL
        actual_key = qianfan_key
        # Always use QIANFAN_MODEL when using Qianfan (ignore passed model param)
        actual_model = os.environ.get("QIANFAN_MODEL", QIANFAN_DEFAULT_MODEL)
    else:
        url = DASHSCOPE_API_URL
        actual_key = api_key
        actual_model = model or "qwen-plus"
    
    # Use first 2000 chars for classification (save tokens)
    content_preview = content[:2000] if len(content) > 2000 else content
    system_prompt, user_prompt = get_classify_prompt(content_preview, source_name)
    
    headers = {
        "Authorization": f"Bearer {actual_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": actual_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 100
    }
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            
            if "choices" in data and len(data["choices"]) > 0:
                result_str = data["choices"][0]["message"]["content"].strip()
                
                # Try to parse JSON response
                try:
                    # Extract JSON from response (may have extra text)
                    import re
                    json_match = re.search(r'\{[^}]+\}', result_str)
                    if json_match:
                        result = json_module.loads(json_match.group())
                        article_type = result.get("type", "general").lower()
                        confidence = float(result.get("confidence", 0.5))
                        
                        # Handle old type codes
                        if article_type in TYPE_MAPPING:
                            article_type = TYPE_MAPPING[article_type]
                        
                        # Validate type
                        if article_type not in ARTICLE_TYPES:
                            article_type = "general"
                            confidence = 0.5
                        
                        # Apply confidence threshold
                        if confidence < CONFIDENCE_THRESHOLD:
                            logger.info(f"Low confidence ({confidence:.2f}), using general template")
                            article_type = "general"
                        
                        logger.info(f"Article classified as: {article_type} (confidence: {confidence:.2f})")
                        return {"type": article_type, "confidence": confidence}
                except (json_module.JSONDecodeError, ValueError) as e:
                    logger.warning(f"Failed to parse classification JSON: {result_str}, error: {e}")
                
                # Fallback: try to extract type code from text
                for type_code in ARTICLE_TYPES.keys():
                    if type_code in result_str.lower():
                        logger.info(f"Article classified as: {type_code} (fallback)")
                        return {"type": type_code, "confidence": 0.7}
                
                logger.warning(f"Unknown classification result: {result_str}")
                return default_result
            else:
                return default_result
                
    except Exception as e:
        logger.warning(f"Classification failed: {e}, defaulting to 'general'")
        return default_result


async def classify_article_simple(
    content: str, 
    api_key: str, 
    model: str = "qwen-plus",
    source_name: str = None
) -> str:
    """
    Simplified classify_article that returns just the type code.
    For backward compatibility.
    """
    result = await classify_article(content, api_key, model, source_name)
    return result["type"]


async def generate_smart_summary(
    content: str, 
    api_key: str, 
    model: str = None,
    article_type: str = None,
    source_name: str = None
) -> Tuple[Optional[str], Optional[str], str, float]:
    """
    Generate summary using smart template selection.
    Supports Baidu Qianfan and Alibaba DashScope.
    
    Args:
        content: Article content
        api_key: API key (Qianfan or DashScope)
        model: Model name (auto-detected based on provider)
        article_type: Override article type (skip classification)
        source_name: Source name for classification hints
    
    Returns:
        (summary, error_message, article_type, confidence)
    """
    from hotnews.kernel.services.prompts import get_template, get_length_instruction
    
    if not api_key:
        return None, "AI 服务未配置", "general", 0.0
    
    confidence = 1.0  # Default confidence when type is provided
    
    # Step 1: Classify article if type not provided
    if not article_type:
        classify_result = await classify_article(content, api_key, model, source_name)
        article_type = classify_result["type"]
        confidence = classify_result["confidence"]
    
    # Step 2: Get template for this type
    template = get_template(article_type)
    
    # Step 3: Get length instruction based on content length (V5)
    content_length = len(content)
    length_instruction = get_length_instruction(content_length, article_type)
    
    # Step 4: Determine provider and URL
    # Priority: Qianfan > DashScope
    qianfan_key = os.environ.get("QIANFAN_API_KEY", "")
    use_qianfan = bool(qianfan_key)
    
    if use_qianfan:
        url = QIANFAN_API_URL
        actual_key = qianfan_key
        # Always use QIANFAN_MODEL when using Qianfan (ignore passed model param)
        actual_model = os.environ.get("QIANFAN_MODEL", QIANFAN_DEFAULT_MODEL)
    else:
        url = DASHSCOPE_API_URL
        actual_key = api_key
        actual_model = model or "qwen-plus"
    
    # Step 5: Generate summary with specialized template
    # V5: Insert length instruction before content
    user_prompt = template['user'].replace(
        '【文章内容】：\n{content}',
        f'{length_instruction}\n\n---\n【文章内容】（{content_length} 字）：\n{{content}}'
    ).format(content=content)
    
    headers = {
        "Authorization": f"Bearer {actual_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": actual_model,
        "messages": [
            {"role": "system", "content": template['system']},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2500
    }
    
    try:
        async with httpx.AsyncClient(timeout=90) as client:
            resp = await client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            
            if "choices" in data and len(data["choices"]) > 0:
                summary = data["choices"][0]["message"]["content"]
                return summary.strip(), None, article_type, confidence
            else:
                return None, "AI 返回内容为空", article_type, confidence
                
    except httpx.TimeoutException:
        return None, "AI 服务响应超时", article_type, confidence
    except httpx.HTTPStatusError as e:
        logger.error(f"AI API error: {e.response.text}")
        return None, f"AI 服务错误: {e.response.status_code}", article_type, confidence
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        return None, "AI 总结生成失败", article_type, confidence


async def generate_smart_summary_stream(
    content: str, 
    api_key: str, 
    model: str = None,
    article_type: str = None,
    source_name: str = None
):
    """
    Generate summary with streaming output.
    Supports Baidu Qianfan and Alibaba DashScope.
    
    Args:
        content: Article content
        api_key: API key (Qianfan or DashScope)
        model: Model name (auto-detected based on provider)
        article_type: Override article type (skip classification)
        source_name: Source name for classification hints
    
    Yields:
        (chunk, is_done, article_type, error, token_usage, confidence)
        - chunk: Text chunk or None
        - is_done: Whether streaming is complete
        - article_type: Detected article type
        - error: Error message or None
        - token_usage: dict with prompt_tokens, completion_tokens, total_tokens (only on done)
        - confidence: Classification confidence (0.0-1.0)
    """
    from hotnews.kernel.services.prompts import get_template, get_length_instruction
    
    if not api_key:
        yield None, True, "general", "AI 服务未配置", None, 0.0
        return
    
    confidence = 1.0  # Default confidence when type is provided
    
    # Step 1: Classify article if type not provided
    if not article_type:
        classify_result = await classify_article(content, api_key, model, source_name)
        article_type = classify_result["type"]
        confidence = classify_result["confidence"]
    
    # Yield article type and confidence first
    yield None, False, article_type, None, None, confidence
    
    # Step 2: Get template for this type
    template = get_template(article_type)
    
    # Step 3: Get length instruction based on content length (V5)
    content_length = len(content)
    length_instruction = get_length_instruction(content_length, article_type)
    
    # Step 4: Determine provider and URL
    # Priority: Qianfan > DashScope
    qianfan_key = os.environ.get("QIANFAN_API_KEY", "")
    use_qianfan = bool(qianfan_key)
    
    if use_qianfan:
        url = QIANFAN_API_URL
        actual_key = qianfan_key
        # Always use QIANFAN_MODEL when using Qianfan (ignore passed model param)
        actual_model = os.environ.get("QIANFAN_MODEL", QIANFAN_DEFAULT_MODEL)
    else:
        url = DASHSCOPE_API_URL
        actual_key = api_key
        actual_model = model or "qwen-plus"
    
    logger.info(f"Using AI provider: {'Qianfan' if use_qianfan else 'DashScope'}, model: {actual_model}")
    
    # Step 5: Generate summary with streaming
    # V5: Insert length instruction before content
    user_prompt = template['user'].replace(
        '【文章内容】：\n{content}',
        f'{length_instruction}\n\n---\n【文章内容】（{content_length} 字）：\n{{content}}'
    ).format(content=content)
    
    headers = {
        "Authorization": f"Bearer {actual_key}",
        "Content-Type": "application/json"
    }
    
    payload = {
        "model": actual_model,
        "messages": [
            {"role": "system", "content": template['system']},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.7,
        "max_tokens": 2500,
        "stream": True,
        "stream_options": {"include_usage": True}  # Request usage in stream
    }
    
    token_usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    
    try:
        async with httpx.AsyncClient(timeout=120) as client:
            async with client.stream("POST", url, json=payload, headers=headers) as resp:
                resp.raise_for_status()
                
                async for line in resp.aiter_lines():
                    if not line or not line.startswith("data: "):
                        continue
                    
                    data_str = line[6:]  # Remove "data: " prefix
                    if data_str == "[DONE]":
                        logger.info(f"Received [DONE] marker, token_usage: {token_usage}")
                        yield None, True, article_type, None, token_usage, confidence
                        return
                    
                    try:
                        import json
                        data = json.loads(data_str)
                        
                        # Extract usage if present (usually in last chunk)
                        if "usage" in data and data["usage"]:
                            usage = data["usage"]
                            token_usage["prompt_tokens"] = usage.get("prompt_tokens", 0)
                            token_usage["completion_tokens"] = usage.get("completion_tokens", 0)
                            token_usage["total_tokens"] = usage.get("total_tokens", 0)
                            logger.info(f"Got token usage from stream: {token_usage}")
                        
                        if "choices" in data and len(data["choices"]) > 0:
                            choice = data["choices"][0]
                            delta = choice.get("delta") if choice else None
                            if delta:
                                chunk = delta.get("content", "")
                                if chunk:
                                    yield chunk, False, article_type, None, None, confidence
                    except json.JSONDecodeError:
                        continue
                
                # Stream ended without [DONE] marker
                logger.info(f"Stream ended without [DONE], token_usage: {token_usage}")
                yield None, True, article_type, None, token_usage, confidence
                
    except httpx.TimeoutException:
        yield None, True, article_type, "AI 服务响应超时", None, confidence
    except httpx.HTTPStatusError as e:
        logger.error(f"AI API error: {e.response.status_code}")
        yield None, True, article_type, f"AI 服务错误: {e.response.status_code}", None, confidence
    except Exception as e:
        logger.error(f"Summary generation error: {e}")
        yield None, True, article_type, "AI 总结生成失败", None, confidence


async def summarize_article(url: str, api_key: str, model: str = "qwen-plus") -> Tuple[Optional[str], Optional[str]]:
    """
    Full pipeline: fetch article and generate summary.
    Returns (summary, error_message)
    """
    # Step 1: Fetch content
    content, error, _fetch_method = await fetch_article_content(url)
    if error:
        return None, error
    
    # Step 2: Generate summary
    summary, error = await generate_summary(content, api_key, model)
    if error:
        return None, error
    
    return summary, None


def extract_tags_from_summary(summary: str) -> dict:
    """
    Extract tags from summary text.
    Looks for tags in [TAGS_START]...[TAGS_END] block or fallback formats.
    
    Returns dict with 'quality' (str or None) and 'category' (list).
    """
    import re
    from hotnews.kernel.services.prompts import PREDEFINED_TAGS, QUALITY_TAGS
    
    result = {
        'quality': None,    # 质量评估标签 (0-1个，字符串或 None)
        'category': []      # 内容分类标签 (1-2个，列表)
    }
    
    if not summary:
        logger.debug("[TagExtract] Empty summary, returning empty tags")
        return result
    
    # Log summary tail for debugging (last 500 chars where tags should be)
    summary_tail = summary[-500:] if len(summary) > 500 else summary
    logger.debug(f"[TagExtract] Summary tail: {summary_tail}")
    
    # Try to extract from [TAGS_START]...[TAGS_END] or [TAGSSTART]...[TAGSEND] block first
    # Support both formats: with and without underscore
    tags_block_match = re.search(r'\[TAGS_?START\](.*?)\[TAGS_?END\]', summary, re.DOTALL | re.IGNORECASE)
    if tags_block_match:
        search_text = tags_block_match.group(1)
        logger.debug(f"[TagExtract] Found tags block: {search_text}")
    else:
        search_text = summary
        logger.debug("[TagExtract] No tags block found, searching full summary")
    
    # Extract quality tag: **质量评估**: gem
    # Support various formats: with/without **, with/without space, Chinese/English colon
    quality_patterns = [
        r'\*\*质量评估\*\*[：:]\s*([a-z_]+)',
        r'质量评估[：:]\s*([a-z_]+)',
        r'\*\*Quality\*\*[：:]\s*([a-z_]+)',
        r'Quality[：:]\s*([a-z_]+)',
    ]
    
    for pattern in quality_patterns:
        match = re.search(pattern, search_text, re.IGNORECASE)
        if match:
            tag_str = match.group(1).strip().lower()
            logger.debug(f"[TagExtract] Quality pattern matched: {tag_str}")
            if tag_str and tag_str not in ['无', 'none', '空', '', 'null'] and tag_str in QUALITY_TAGS:
                result['quality'] = tag_str
                logger.info(f"[TagExtract] Extracted quality tag: {result['quality']}")
            break
    
    # Extract category tags: **内容分类**: finance, earnings
    # Support various formats
    category_patterns = [
        r'\*\*内容分类\*\*[：:]\s*([a-z_,\s]+)',
        r'内容分类[：:]\s*([a-z_,\s]+)',
        r'\*\*Category\*\*[：:]\s*([a-z_,\s]+)',
        r'Category[：:]\s*([a-z_,\s]+)',
        r'\*\*分类\*\*[：:]\s*([a-z_,\s]+)',
        r'分类[：:]\s*([a-z_,\s]+)',
    ]
    
    for pattern in category_patterns:
        match = re.search(pattern, search_text, re.IGNORECASE)
        if match:
            tags_str = match.group(1).strip()
            logger.debug(f"[TagExtract] Category pattern matched: {tags_str}")
            # Split by comma, space, or Chinese comma
            raw_tags = re.split(r'[,，\s]+', tags_str)
            raw_tags = [t.strip().lower() for t in raw_tags if t.strip()]
            valid_tags = [t for t in raw_tags if t in PREDEFINED_TAGS]
            if valid_tags:
                result['category'] = valid_tags[:2]  # Max 2 category tags
                logger.info(f"[TagExtract] Extracted category tags: {result['category']}")
            else:
                logger.debug(f"[TagExtract] No valid tags in: {raw_tags}")
            break
    
    # Fallback: try old format for backward compatibility
    if not result['category']:
        old_patterns = [
            r'\*\*标签\*\*[：:]\s*([a-z_,\s]+)',
            r'标签[：:]\s*([a-z_,\s]+)',
            r'🏷️[^:：]*[：:]\s*([a-z_,\s]+)',
        ]
        
        for pattern in old_patterns:
            match = re.search(pattern, summary, re.IGNORECASE)
            if match:
                tags_str = match.group(1).strip()
                raw_tags = re.split(r'[,，\s]+', tags_str)
                raw_tags = [t.strip().lower() for t in raw_tags if t.strip()]
                valid_tags = [t for t in raw_tags if t in PREDEFINED_TAGS]
                if valid_tags:
                    result['category'] = valid_tags[:3]
                    logger.info(f"[TagExtract] Extracted tags (old format): {result['category']}")
                break
    
    # Log final result
    if not result['quality'] and not result['category']:
        logger.warning(f"[TagExtract] No tags extracted from summary")
    
    return result


def strip_tags_from_summary(summary: str) -> str:
    """
    Remove the tags block from summary text for display.
    Removes [TAGS_START]...[TAGS_END] or [TAGSSTART]...[TAGSEND] block and old format tags section.
    """
    import re
    
    if not summary:
        return summary
    
    # Remove [TAGS_START]...[TAGS_END] or [TAGSSTART]...[TAGSEND] block
    # Handle various formats: with/without underscore, with/without newlines, with/without --- separator
    patterns = [
        r'\n*-{0,3}\n*\[TAGS_?START\].*?\[TAGS_?END\]\s*',  # Standard format
        r'\[TAGS_?START\].*?\[TAGS_?END\]',  # Compact format (no newlines)
    ]
    
    result = summary
    for pattern in patterns:
        result = re.sub(pattern, '', result, flags=re.DOTALL | re.IGNORECASE)
    
    # Remove old format tags section (## 🏷️ 文章标签 ...)
    result = re.sub(r'\n*---\n*## 🏷️ 文章标签.*$', '', result, flags=re.DOTALL)
    
    # Clean up trailing whitespace and extra newlines
    result = re.sub(r'\n{3,}', '\n\n', result)
    
    return result.strip()


def get_all_tags_from_summary(summary: str) -> list:
    """
    Get all tags as a flat list (for backward compatibility).
    Quality tag first (if any), then category tags.
    """
    tags_dict = extract_tags_from_summary(summary)
    result = []
    if tags_dict.get('quality'):
        result.append(tags_dict['quality'])
    result.extend(tags_dict.get('category', []))
    return result


def update_entry_tags_from_summary(online_conn, url: str, tags: list | dict, confidence: float = 0.95):
    """
    Update rss_entry_tags with tags extracted from summary.
    Uses upsert to update existing tags or insert new ones.
    Silent failure - does not raise exceptions.
    
    Args:
        online_conn: SQLite connection to online.db
        url: Article URL
        tags: List of tag IDs or dict with 'quality' (str or None) and 'category' (list)
        confidence: Confidence score (default 0.95 for summary-based tags)
    """
    import time
    
    # Handle both old list format and new dict format
    if isinstance(tags, dict):
        # quality is a string or None, category is a list
        quality = tags.get('quality')
        category = tags.get('category', [])
        all_tags = []
        if quality:
            all_tags.append(quality)
        if category:
            all_tags.extend(category)
    else:
        all_tags = tags if tags else []
    
    if not all_tags:
        logger.info(f"No tags to update for URL: {url}")
        return
    
    try:
        # Find source_id and dedup_key from URL
        cur = online_conn.execute(
            "SELECT source_id, dedup_key FROM rss_entries WHERE url = ? LIMIT 1",
            (url,)
        )
        row = cur.fetchone()
        if not row:
            logger.info(f"No RSS entry found for URL (article may be from external source): {url[:100]}")
            return
        
        source_id, dedup_key = row
        now = int(time.time())
        
        # Upsert tags
        for tag_id in all_tags:
            online_conn.execute(
                """
                INSERT INTO rss_entry_tags(source_id, dedup_key, tag_id, confidence, source, created_at)
                VALUES (?, ?, ?, ?, 'summary', ?)
                ON CONFLICT(source_id, dedup_key, tag_id) DO UPDATE SET
                    confidence = MAX(excluded.confidence, confidence),
                    source = 'summary',
                    created_at = excluded.created_at
                """,
                (source_id, dedup_key, tag_id, confidence, now)
            )
        
        online_conn.commit()
        logger.info(f"Updated {len(all_tags)} tags for {url}: {all_tags}")
        
    except Exception as e:
        logger.warning(f"Failed to update entry tags: {e}")
