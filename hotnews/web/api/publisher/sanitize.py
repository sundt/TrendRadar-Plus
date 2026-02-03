# coding=utf-8
"""
HTML Sanitization Module

Provides XSS protection by sanitizing HTML content.
"""

import re
from typing import Set

# Allowed HTML tags
ALLOWED_TAGS: Set[str] = {
    'p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'del',
    'blockquote', 'code', 'pre',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tr', 'td', 'th',
    'div', 'span',
    'hr',
}

# Allowed attributes per tag
ALLOWED_ATTRIBUTES = {
    'a': {'href', 'title', 'target', 'rel'},
    'img': {'src', 'alt', 'width', 'height', 'title'},
    '*': {'class', 'id', 'style'},
}

# Dangerous patterns to remove
DANGEROUS_PATTERNS = [
    re.compile(r'<script[^>]*>.*?</script>', re.IGNORECASE | re.DOTALL),
    re.compile(r'<style[^>]*>.*?</style>', re.IGNORECASE | re.DOTALL),
    re.compile(r'<iframe[^>]*>.*?</iframe>', re.IGNORECASE | re.DOTALL),
    re.compile(r'<object[^>]*>.*?</object>', re.IGNORECASE | re.DOTALL),
    re.compile(r'<embed[^>]*>', re.IGNORECASE),
    re.compile(r'javascript:', re.IGNORECASE),
    re.compile(r'vbscript:', re.IGNORECASE),
    re.compile(r'on\w+\s*=', re.IGNORECASE),  # onclick, onload, etc.
    re.compile(r'data:', re.IGNORECASE),  # data: URLs can be dangerous
]


def sanitize_html(html_content: str) -> str:
    """
    Sanitize HTML content to prevent XSS attacks.
    
    This is a simple implementation. For production, consider using
    the 'bleach' library for more robust sanitization.
    
    Args:
        html_content: Raw HTML content
        
    Returns:
        Sanitized HTML content
    """
    if not html_content:
        return ""
    
    result = html_content
    
    # Remove dangerous patterns
    for pattern in DANGEROUS_PATTERNS:
        result = pattern.sub('', result)
    
    return result


def sanitize_url(url: str) -> str:
    """
    Sanitize a URL to prevent XSS.
    
    Args:
        url: Raw URL
        
    Returns:
        Sanitized URL or empty string if dangerous
    """
    if not url:
        return ""
    
    url = url.strip()
    url_lower = url.lower()
    
    # Block dangerous protocols
    dangerous_protocols = ['javascript:', 'vbscript:', 'data:']
    for proto in dangerous_protocols:
        if url_lower.startswith(proto):
            return ""
    
    # Allow http, https, and relative URLs
    if url_lower.startswith(('http://', 'https://', '/', '#', '?')):
        return url
    
    # Block other protocols
    if ':' in url.split('/')[0]:
        return ""
    
    return url


def strip_html_tags(html_content: str) -> str:
    """
    Strip all HTML tags from content.
    
    Args:
        html_content: HTML content
        
    Returns:
        Plain text content
    """
    if not html_content:
        return ""
    
    # Remove HTML tags
    result = re.sub(r'<[^>]+>', '', html_content)
    
    # Decode common HTML entities
    result = result.replace('&nbsp;', ' ')
    result = result.replace('&lt;', '<')
    result = result.replace('&gt;', '>')
    result = result.replace('&amp;', '&')
    result = result.replace('&quot;', '"')
    result = result.replace('&#39;', "'")
    
    # Normalize whitespace
    result = re.sub(r'\s+', ' ', result).strip()
    
    return result
