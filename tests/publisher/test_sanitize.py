# coding=utf-8
"""
Tests for HTML sanitization module.
"""

import pytest
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from hotnews.web.api.publisher.sanitize import sanitize_html, sanitize_url, strip_html_tags


class TestSanitizeHtml:
    """Tests for sanitize_html function."""
    
    def test_empty_input(self):
        """Empty input should return empty string."""
        assert sanitize_html("") == ""
        assert sanitize_html(None) == ""
    
    def test_plain_text(self):
        """Plain text should pass through unchanged."""
        text = "Hello, world!"
        assert sanitize_html(text) == text
    
    def test_safe_html(self):
        """Safe HTML should pass through."""
        html = "<p>Hello <strong>world</strong>!</p>"
        result = sanitize_html(html)
        assert "<p>" in result
        assert "<strong>" in result
    
    def test_remove_script_tag(self):
        """Script tags should be removed."""
        html = '<p>Hello</p><script>alert("xss")</script><p>World</p>'
        result = sanitize_html(html)
        assert "<script>" not in result
        assert "alert" not in result
        assert "<p>Hello</p>" in result
        assert "<p>World</p>" in result
    
    def test_remove_script_tag_multiline(self):
        """Multiline script tags should be removed."""
        html = '''<p>Hello</p>
        <script>
            var x = 1;
            alert(x);
        </script>
        <p>World</p>'''
        result = sanitize_html(html)
        assert "<script>" not in result
        assert "alert" not in result
    
    def test_remove_style_tag(self):
        """Style tags should be removed."""
        html = '<p>Hello</p><style>body { display: none; }</style>'
        result = sanitize_html(html)
        assert "<style>" not in result
        assert "display: none" not in result
    
    def test_remove_iframe(self):
        """Iframe tags should be removed."""
        html = '<p>Hello</p><iframe src="http://evil.com"></iframe>'
        result = sanitize_html(html)
        assert "<iframe>" not in result
        assert "evil.com" not in result
    
    def test_remove_onclick(self):
        """onclick attributes should be removed."""
        html = '<p onclick="alert(1)">Click me</p>'
        result = sanitize_html(html)
        assert "onclick" not in result
    
    def test_remove_onload(self):
        """onload attributes should be removed."""
        html = '<img src="x" onload="alert(1)">'
        result = sanitize_html(html)
        assert "onload" not in result
    
    def test_remove_onerror(self):
        """onerror attributes should be removed."""
        html = '<img src="x" onerror="alert(1)">'
        result = sanitize_html(html)
        assert "onerror" not in result
    
    def test_remove_javascript_url(self):
        """javascript: URLs should be removed."""
        html = '<a href="javascript:alert(1)">Click</a>'
        result = sanitize_html(html)
        assert "javascript:" not in result
    
    def test_remove_vbscript_url(self):
        """vbscript: URLs should be removed."""
        html = '<a href="vbscript:msgbox(1)">Click</a>'
        result = sanitize_html(html)
        assert "vbscript:" not in result
    
    def test_remove_data_url(self):
        """data: URLs should be removed."""
        html = '<img src="data:text/html,<script>alert(1)</script>">'
        result = sanitize_html(html)
        assert "data:" not in result


class TestSanitizeUrl:
    """Tests for sanitize_url function."""
    
    def test_empty_input(self):
        """Empty input should return empty string."""
        assert sanitize_url("") == ""
        assert sanitize_url(None) == ""
    
    def test_http_url(self):
        """HTTP URLs should pass through."""
        url = "http://example.com/page"
        assert sanitize_url(url) == url
    
    def test_https_url(self):
        """HTTPS URLs should pass through."""
        url = "https://example.com/page"
        assert sanitize_url(url) == url
    
    def test_relative_url(self):
        """Relative URLs should pass through."""
        assert sanitize_url("/page") == "/page"
        assert sanitize_url("#section") == "#section"
        assert sanitize_url("?query=1") == "?query=1"
    
    def test_block_javascript(self):
        """javascript: URLs should be blocked."""
        assert sanitize_url("javascript:alert(1)") == ""
        assert sanitize_url("JAVASCRIPT:alert(1)") == ""
        assert sanitize_url("  javascript:alert(1)  ") == ""
    
    def test_block_vbscript(self):
        """vbscript: URLs should be blocked."""
        assert sanitize_url("vbscript:msgbox(1)") == ""
    
    def test_block_data(self):
        """data: URLs should be blocked."""
        assert sanitize_url("data:text/html,<script>") == ""
    
    def test_block_unknown_protocol(self):
        """Unknown protocols should be blocked."""
        assert sanitize_url("file:///etc/passwd") == ""
        assert sanitize_url("ftp://example.com") == ""


class TestStripHtmlTags:
    """Tests for strip_html_tags function."""
    
    def test_empty_input(self):
        """Empty input should return empty string."""
        assert strip_html_tags("") == ""
        assert strip_html_tags(None) == ""
    
    def test_plain_text(self):
        """Plain text should pass through unchanged."""
        text = "Hello, world!"
        assert strip_html_tags(text) == text
    
    def test_strip_simple_tags(self):
        """Simple tags should be stripped."""
        html = "<p>Hello <strong>world</strong>!</p>"
        assert strip_html_tags(html) == "Hello world!"
    
    def test_strip_nested_tags(self):
        """Nested tags should be stripped."""
        html = "<div><p>Hello <span>world</span></p></div>"
        assert strip_html_tags(html) == "Hello world"
    
    def test_decode_entities(self):
        """HTML entities should be decoded."""
        html = "Hello &amp; world &lt;3"
        assert strip_html_tags(html) == "Hello & world <3"
    
    def test_normalize_whitespace(self):
        """Whitespace should be normalized."""
        html = "<p>Hello</p>   <p>World</p>"
        result = strip_html_tags(html)
        assert "  " not in result  # No double spaces
