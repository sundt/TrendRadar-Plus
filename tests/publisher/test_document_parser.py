# coding=utf-8
"""
Tests for document_parser module.

Tests parsing of Markdown, PDF, and Word documents.
"""

import pytest
from hotnews.web.api.publisher.document_parser import (
    parse_markdown,
    parse_document,
    get_supported_formats,
    DocumentParseError,
    SUPPORTED_FORMATS,
)


class TestParseMarkdown:
    """Tests for Markdown parsing."""
    
    def test_basic_markdown(self):
        """Test basic markdown conversion."""
        content = b"# Hello World\n\nThis is a test paragraph."
        title, digest, html = parse_markdown(content, "test.md")
        
        assert title == "Hello World"
        assert "test paragraph" in digest
        assert "<h1>" in html or "Hello World" in html
        assert "<p>" in html
    
    def test_markdown_without_title(self):
        """Test markdown without H1 heading uses filename."""
        content = b"Just some text without a heading."
        title, digest, html = parse_markdown(content, "my-document.md")
        
        assert title == "my-document"
        assert "Just some text" in digest
    
    def test_markdown_with_formatting(self):
        """Test markdown with bold/italic formatting."""
        content = b"# Title\n\n**Bold** and *italic* text."
        title, digest, html = parse_markdown(content, "test.md")
        
        assert title == "Title"
        # Digest should have formatting stripped
        assert "Bold" in digest
        assert "**" not in digest
    
    def test_markdown_with_code_blocks(self):
        """Test markdown with code blocks."""
        content = b"# Code Example\n\n```python\nprint('hello')\n```"
        title, digest, html = parse_markdown(content, "test.md")
        
        assert title == "Code Example"
        assert "print" in html
    
    def test_markdown_with_links(self):
        """Test markdown with links."""
        content = b"# Links\n\nCheck out [this link](https://example.com)."
        title, digest, html = parse_markdown(content, "test.md")
        
        # Digest should have link text but not URL
        assert "this link" in digest
        assert "https://example.com" not in digest
    
    def test_empty_markdown(self):
        """Test empty markdown file."""
        content = b""
        title, digest, html = parse_markdown(content, "empty.md")
        
        assert title == "empty"
        assert digest == ""
    
    def test_utf8_encoding(self):
        """Test UTF-8 encoded markdown."""
        content = "# 中文标题\n\n这是中文内容。".encode('utf-8')
        title, digest, html = parse_markdown(content, "chinese.md")
        
        assert title == "中文标题"
        assert "中文内容" in digest
    
    def test_gbk_encoding(self):
        """Test GBK encoded markdown (fallback)."""
        content = "# 中文标题\n\n这是中文内容。".encode('gbk')
        title, digest, html = parse_markdown(content, "chinese.md")
        
        assert title == "中文标题"
        assert "中文内容" in digest


class TestParseDocument:
    """Tests for the unified parse_document function."""
    
    def test_markdown_extension(self):
        """Test .md extension is recognized."""
        content = b"# Test\n\nContent"
        title, digest, html = parse_document(content, "test.md")
        assert title == "Test"
    
    def test_markdown_long_extension(self):
        """Test .markdown extension is recognized."""
        content = b"# Test\n\nContent"
        title, digest, html = parse_document(content, "test.markdown")
        assert title == "Test"
    
    def test_unsupported_format(self):
        """Test unsupported format raises error."""
        with pytest.raises(DocumentParseError) as exc_info:
            parse_document(b"content", "test.txt")
        
        assert "不支持的文件格式" in str(exc_info.value)
        assert ".txt" in str(exc_info.value)
    
    def test_case_insensitive_extension(self):
        """Test extension matching is case-insensitive."""
        content = b"# Test\n\nContent"
        title, _, _ = parse_document(content, "test.MD")
        assert title == "Test"


class TestGetSupportedFormats:
    """Tests for get_supported_formats function."""
    
    def test_returns_list(self):
        """Test returns a list of formats."""
        formats = get_supported_formats()
        assert isinstance(formats, list)
        assert len(formats) > 0
    
    def test_format_structure(self):
        """Test each format has required fields."""
        formats = get_supported_formats()
        for fmt in formats:
            assert 'extension' in fmt
            assert 'name' in fmt
            assert fmt['extension'].startswith('.')
    
    def test_includes_markdown(self):
        """Test Markdown is in supported formats."""
        formats = get_supported_formats()
        extensions = [f['extension'] for f in formats]
        assert '.md' in extensions
    
    def test_includes_pdf(self):
        """Test PDF is in supported formats."""
        formats = get_supported_formats()
        extensions = [f['extension'] for f in formats]
        assert '.pdf' in extensions
    
    def test_includes_docx(self):
        """Test Word is in supported formats."""
        formats = get_supported_formats()
        extensions = [f['extension'] for f in formats]
        assert '.docx' in extensions


class TestTitleAndDigestExtraction:
    """Tests for title and digest extraction."""
    
    def test_title_max_length(self):
        """Test title is truncated to 64 chars."""
        long_title = "A" * 100
        content = f"# {long_title}\n\nContent".encode('utf-8')
        title, _, _ = parse_markdown(content, "test.md")
        
        assert len(title) <= 64
    
    def test_digest_max_length(self):
        """Test digest is truncated to 200 chars."""
        long_para = "B" * 300
        content = f"# Title\n\n{long_para}".encode('utf-8')
        _, digest, _ = parse_markdown(content, "test.md")
        
        assert len(digest) <= 200
    
    def test_digest_skips_headings(self):
        """Test digest extraction skips headings."""
        content = b"# Title\n\n## Subtitle\n\nActual content here."
        _, digest, _ = parse_markdown(content, "test.md")
        
        assert "Actual content" in digest
        assert "Subtitle" not in digest
    
    def test_digest_skips_code_blocks(self):
        """Test digest extraction skips code blocks."""
        content = b"# Title\n\n```\ncode here\n```\n\nReal paragraph."
        _, digest, _ = parse_markdown(content, "test.md")
        
        assert "Real paragraph" in digest
        assert "code here" not in digest


class TestErrorHandling:
    """Tests for error handling."""
    
    def test_invalid_encoding(self):
        """Test handling of invalid encoding."""
        # Create bytes that are invalid in both UTF-8 and GBK
        content = bytes([0x80, 0x81, 0x82, 0x83])
        
        with pytest.raises(DocumentParseError) as exc_info:
            parse_markdown(content, "test.md")
        
        assert "无法解码" in str(exc_info.value)
