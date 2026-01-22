"""
WeChat MP (公众号) Provider

Provides functionality to interact with WeChat Official Account Platform API:
- Search for official accounts
- Get article lists from subscribed accounts
- Validate authentication credentials

Reference: we-mp-rss project (https://github.com/nichuanfang/we-mp-rss)
"""

import hashlib
import json
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import requests

logger = logging.getLogger("uvicorn.error")


# Common User-Agent strings for rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
]


# WeChat API error codes
class WeChatErrorCode:
    SUCCESS = 0
    SESSION_EXPIRED = 200003  # Cookie/Token expired
    RATE_LIMITED = 200013  # Too many requests


@dataclass
class AuthTestResult:
    """Result of authentication test."""
    ok: bool
    error_code: int = 0
    error_message: str = ""


@dataclass
class MPAccount:
    """WeChat Official Account info."""
    fakeid: str
    nickname: str
    round_head_img: str = ""
    signature: str = ""
    service_type: int = 0  # 0=订阅号, 1=服务号


@dataclass
class SearchResult:
    """Result of MP search."""
    ok: bool
    accounts: List[MPAccount] = field(default_factory=list)
    total: int = 0
    error_code: int = 0
    error_message: str = ""


@dataclass
class Article:
    """WeChat article info."""
    aid: str
    title: str
    url: str
    digest: str = ""
    cover_url: str = ""
    publish_time: int = 0
    create_time: int = 0


@dataclass
class ArticlesResult:
    """Result of getting articles."""
    ok: bool
    articles: List[Article] = field(default_factory=list)
    total: int = 0
    error_code: int = 0
    error_message: str = ""


class WeChatMPProvider:
    """
    WeChat Official Account Platform Provider.
    
    Handles API interactions with mp.weixin.qq.com for:
    - Searching official accounts
    - Fetching article lists
    - Validating credentials
    """
    
    BASE_URL = "https://mp.weixin.qq.com"
    
    # Rate limiting: minimum interval between requests (seconds)
    MIN_REQUEST_INTERVAL = 2.0
    
    # Retry settings
    MAX_RETRIES = 3
    RETRY_DELAYS = [1, 2, 4]  # Exponential backoff
    
    def __init__(self, cookie: str, token: str):
        """
        Initialize the provider with authentication credentials.
        
        Args:
            cookie: WeChat platform cookie string
            token: WeChat platform token
        """
        self.cookie = cookie
        self.token = token
        self._last_request_time: float = 0
        self._session = requests.Session()
        self._session.timeout = (5, 30)  # (connect, read) timeout
    
    def _get_headers(self, referer: Optional[str] = None) -> Dict[str, str]:
        """Get request headers with random User-Agent."""
        user_agent = random.choice(USER_AGENTS)
        headers = {
            "Cookie": self.cookie,
            "User-Agent": user_agent,
            "Referer": referer or f"{self.BASE_URL}/",
            "Accept": "application/json, text/plain, */*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Accept-Encoding": "gzip, deflate, br",
            "Connection": "keep-alive",
        }
        return headers
    
    def _wait_for_rate_limit(self) -> None:
        """Ensure minimum interval between requests."""
        now = time.time()
        elapsed = now - self._last_request_time
        if elapsed < self.MIN_REQUEST_INTERVAL:
            sleep_time = self.MIN_REQUEST_INTERVAL - elapsed
            time.sleep(sleep_time)
        self._last_request_time = time.time()
    
    def _make_request(
        self,
        url: str,
        params: Dict[str, Any],
        *,
        retries: int = 0,
    ) -> Dict[str, Any]:
        """
        Make an API request with rate limiting and retry logic.
        
        Args:
            url: API endpoint URL
            params: Query parameters
            retries: Current retry count
            
        Returns:
            Parsed JSON response
            
        Raises:
            Exception: If request fails after all retries
        """
        self._wait_for_rate_limit()
        
        headers = self._get_headers(url)
        
        try:
            response = self._session.get(url, params=params, headers=headers)
            response.raise_for_status()
            return response.json()
        except requests.exceptions.Timeout:
            if retries < self.MAX_RETRIES:
                delay = self.RETRY_DELAYS[min(retries, len(self.RETRY_DELAYS) - 1)]
                logger.warning(f"WeChat API timeout, retrying in {delay}s (attempt {retries + 1})")
                time.sleep(delay)
                return self._make_request(url, params, retries=retries + 1)
            raise
        except requests.exceptions.RequestException as e:
            if retries < self.MAX_RETRIES:
                delay = self.RETRY_DELAYS[min(retries, len(self.RETRY_DELAYS) - 1)]
                logger.warning(f"WeChat API error: {e}, retrying in {delay}s")
                time.sleep(delay)
                return self._make_request(url, params, retries=retries + 1)
            raise
    
    def _check_response_error(self, data: Dict[str, Any]) -> tuple[int, str]:
        """
        Check response for WeChat API errors.
        
        Returns:
            Tuple of (error_code, error_message)
        """
        base_resp = data.get("base_resp", {})
        ret = base_resp.get("ret", 0)
        err_msg = base_resp.get("err_msg", "")
        
        if ret == WeChatErrorCode.SESSION_EXPIRED:
            return ret, "Cookie/Token 已过期，请重新认证"
        elif ret == WeChatErrorCode.RATE_LIMITED:
            return ret, "请求过于频繁，请稍后再试"
        elif ret != WeChatErrorCode.SUCCESS:
            return ret, err_msg or f"未知错误 (code={ret})"
        
        return 0, ""
    
    def test_auth(self) -> AuthTestResult:
        """
        Test if the authentication credentials are valid.
        
        Makes a minimal API call to verify Cookie/Token.
        
        Returns:
            AuthTestResult with validation status
        """
        try:
            # Use search API with empty query as a lightweight auth check
            url = f"{self.BASE_URL}/cgi-bin/searchbiz"
            params = {
                "action": "search_biz",
                "begin": 0,
                "count": 1,
                "query": "test",
                "token": self.token,
                "lang": "zh_CN",
                "f": "json",
                "ajax": "1",
            }
            
            data = self._make_request(url, params)
            error_code, error_msg = self._check_response_error(data)
            
            if error_code:
                return AuthTestResult(ok=False, error_code=error_code, error_message=error_msg)
            
            return AuthTestResult(ok=True)
            
        except Exception as e:
            logger.error(f"WeChat auth test failed: {e}")
            return AuthTestResult(ok=False, error_code=-1, error_message=str(e))
    
    def search_mp(self, keyword: str, limit: int = 10, offset: int = 0) -> SearchResult:
        """
        Search for official accounts by keyword.
        
        Args:
            keyword: Search keyword (account name)
            limit: Maximum number of results (default 10)
            offset: Pagination offset
            
        Returns:
            SearchResult with matching accounts
        """
        if not keyword or len(keyword.strip()) < 2:
            return SearchResult(ok=False, error_message="搜索关键词至少需要2个字符")
        
        try:
            url = f"{self.BASE_URL}/cgi-bin/searchbiz"
            params = {
                "action": "search_biz",
                "begin": offset,
                "count": min(limit, 20),  # WeChat API max is 20
                "query": keyword.strip(),
                "token": self.token,
                "lang": "zh_CN",
                "f": "json",
                "ajax": "1",
            }
            
            data = self._make_request(url, params)
            error_code, error_msg = self._check_response_error(data)
            
            if error_code:
                return SearchResult(ok=False, error_code=error_code, error_message=error_msg)
            
            # Parse account list
            accounts = []
            for item in data.get("list", []):
                account = MPAccount(
                    fakeid=str(item.get("fakeid", "")),
                    nickname=str(item.get("nickname", "")),
                    round_head_img=str(item.get("round_head_img", "")),
                    signature=str(item.get("signature", "")),
                    service_type=int(item.get("service_type", 0)),
                )
                if account.fakeid and account.nickname:
                    accounts.append(account)
            
            return SearchResult(
                ok=True,
                accounts=accounts,
                total=int(data.get("total", len(accounts))),
            )
            
        except Exception as e:
            logger.error(f"WeChat search failed: {e}")
            return SearchResult(ok=False, error_code=-1, error_message=str(e))
    
    def get_articles(self, fakeid: str, count: int = 20) -> ArticlesResult:
        """
        Get article list from an official account.
        
        Args:
            fakeid: Official account's unique identifier
            count: Number of articles to fetch (default 20)
            
        Returns:
            ArticlesResult with article list
        """
        if not fakeid:
            return ArticlesResult(ok=False, error_message="fakeid 不能为空")
        
        try:
            url = f"{self.BASE_URL}/cgi-bin/appmsgpublish"
            params = {
                "sub": "list",
                "sub_action": "list_ex",
                "begin": 0,
                "count": min(count, 50),  # Reasonable limit
                "fakeid": fakeid,
                "token": self.token,
                "lang": "zh_CN",
                "f": "json",
                "ajax": 1,
            }
            
            data = self._make_request(url, params)
            error_code, error_msg = self._check_response_error(data)
            
            if error_code:
                return ArticlesResult(ok=False, error_code=error_code, error_message=error_msg)
            
            # Parse nested JSON structure
            # Response: {"publish_page": "{\"publish_list\": [...], \"total_count\": N}"}
            articles = []
            total = 0
            
            publish_page_str = data.get("publish_page", "{}")
            if isinstance(publish_page_str, str):
                try:
                    publish_page = json.loads(publish_page_str)
                except json.JSONDecodeError:
                    publish_page = {}
            else:
                publish_page = publish_page_str
            
            total = int(publish_page.get("total_count", 0))
            
            for item in publish_page.get("publish_list", []):
                # Each item has publish_info as nested JSON string
                publish_info_str = item.get("publish_info", "{}")
                if isinstance(publish_info_str, str):
                    try:
                        publish_info = json.loads(publish_info_str)
                    except json.JSONDecodeError:
                        continue
                else:
                    publish_info = publish_info_str
                
                # Extract articles from appmsgex array
                for art in publish_info.get("appmsgex", []):
                    article = Article(
                        aid=str(art.get("aid", "")),
                        title=str(art.get("title", "")),
                        url=str(art.get("link", "")),
                        digest=str(art.get("digest", "")),
                        cover_url=str(art.get("cover", "")),
                        publish_time=int(art.get("update_time", 0)),
                        create_time=int(art.get("create_time", 0)),
                    )
                    if article.title and article.url:
                        articles.append(article)
            
            return ArticlesResult(
                ok=True,
                articles=articles,
                total=total,
            )
            
        except Exception as e:
            logger.error(f"WeChat get_articles failed: {e}")
            return ArticlesResult(ok=False, error_code=-1, error_message=str(e))


def generate_dedup_key(url: str) -> str:
    """
    Generate a dedup_key for a WeChat article URL.
    
    Used for linking with rss_entry_tags table.
    
    Args:
        url: Article URL
        
    Returns:
        MD5 hash of the URL
    """
    return hashlib.md5(url.encode("utf-8")).hexdigest()


def generate_source_id(fakeid: str) -> str:
    """
    Generate a source_id for a WeChat official account.
    
    Used for linking with rss_entry_tags table.
    
    Args:
        fakeid: Official account's unique identifier
        
    Returns:
        source_id in format 'wechat-{fakeid}'
    """
    return f"wechat-{fakeid}"
