#!/usr/bin/env python3
"""
验证 RSS content 字段的端到端测试脚本。
用法：
  1. docker exec -it <container_name> python /app/test_content_field.py
  2. 或者在服务器上直接: python test_content_field.py
"""
import sys
import os

# ========== Step 1: 验证解析层 ==========
print("=" * 60)
print("Step 1: 验证 parse_feed_content 能提取 content 字段")
print("=" * 60)

try:
    from hotnews.web.rss_proxy import parse_feed_content
except ImportError:
    # 如果直接运行，尝试添加路径
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    from hotnews.web.rss_proxy import parse_feed_content

import xml.etree.ElementTree as ET

# 模拟一个带 content:encoded 的 RSS 2.0 feed
rss_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
  <title>Test Feed</title>
  <item>
    <title>Test Article</title>
    <link>https://example.com/article1</link>
    <description>This is the summary</description>
    <content:encoded><![CDATA[<p>This is the <b>full article</b> with <img src="https://example.com/photo.jpg" /> image.</p>]]></content:encoded>
    <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
  </item>
  <item>
    <title>No Content Article</title>
    <link>https://example.com/article2</link>
    <description>Only summary here</description>
    <pubDate>Thu, 01 Jan 2026 00:00:00 GMT</pubDate>
  </item>
</channel>
</rss>"""

result = parse_feed_content("application/xml", rss_xml)
entries = result.get("entries", [])

ok1 = True
e1 = entries[0] if len(entries) > 0 else {}
e2 = entries[1] if len(entries) > 1 else {}

if e1.get("summary") == "This is the summary":
    print("  ✅ RSS item 1: summary 正确提取")
else:
    print(f"  ❌ RSS item 1: summary 期望 'This is the summary', 实际 '{e1.get('summary')}'")
    ok1 = False

if "full article" in e1.get("content", ""):
    print("  ✅ RSS item 1: content:encoded 正确提取")
else:
    print(f"  ❌ RSS item 1: content 期望包含 'full article', 实际 '{e1.get('content', '')[:80]}'")
    ok1 = False

if e2.get("summary") == "Only summary here":
    print("  ✅ RSS item 2: summary 正确（无 content）")
else:
    print(f"  ❌ RSS item 2: summary 期望 'Only summary here', 实际 '{e2.get('summary')}'")
    ok1 = False

if e2.get("content", "") == "":
    print("  ✅ RSS item 2: content 为空（符合预期）")
else:
    print(f"  ❌ RSS item 2: content 应为空, 实际 '{e2.get('content', '')[:80]}'")
    ok1 = False

# 模拟 Atom feed
atom_xml = b"""<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Test</title>
  <entry>
    <title>Atom Article</title>
    <link href="https://example.com/atom1" rel="alternate"/>
    <summary>Atom summary text</summary>
    <content type="html">&lt;p&gt;Full atom content here&lt;/p&gt;</content>
    <published>2026-01-01T00:00:00Z</published>
  </entry>
</feed>"""

result2 = parse_feed_content("application/atom+xml", atom_xml)
ae = result2.get("entries", [])
a1 = ae[0] if ae else {}

if a1.get("summary") == "Atom summary text":
    print("  ✅ Atom entry: summary 正确提取")
else:
    print(f"  ❌ Atom entry: summary 期望 'Atom summary text', 实际 '{a1.get('summary')}'")
    ok1 = False

if "Full atom content" in a1.get("content", ""):
    print("  ✅ Atom entry: content 正确提取")
else:
    print(f"  ❌ Atom entry: content 期望包含 'Full atom content', 实际 '{a1.get('content', '')[:80]}'")
    ok1 = False

# JSON Feed
import json
json_feed = json.dumps({
    "version": "https://jsonfeed.org/version/1",
    "title": "JSON Test",
    "items": [{
        "title": "JSON Article",
        "url": "https://example.com/json1",
        "summary": "JSON summary",
        "content_html": "<p>Full JSON content</p>",
        "date_published": "2026-01-01T00:00:00Z"
    }]
}).encode()

result3 = parse_feed_content("application/json", json_feed)
je = result3.get("entries", [])
j1 = je[0] if je else {}

if j1.get("summary") == "JSON summary":
    print("  ✅ JSON Feed: summary 正确提取")
else:
    print(f"  ❌ JSON Feed: summary 期望 'JSON summary', 实际 '{j1.get('summary')}'")
    ok1 = False

if "Full JSON content" in j1.get("content", ""):
    print("  ✅ JSON Feed: content_html 正确提取")
else:
    print(f"  ❌ JSON Feed: content 期望包含 'Full JSON content', 实际 '{j1.get('content', '')[:80]}'")
    ok1 = False

print()

# ========== Step 2: 验证数据库 content 列 ==========
print("=" * 60)
print("Step 2: 验证数据库 rss_entries 表有 content 列")
print("=" * 60)

ok2 = True
try:
    import sqlite3
    # 尝试常见的数据库路径
    db_paths = [
        "data/online.db",
        "/app/data/online.db",
        os.path.join(os.path.dirname(__file__), "data", "online.db"),
    ]
    db_path = None
    for p in db_paths:
        if os.path.exists(p):
            db_path = p
            break

    if db_path:
        conn = sqlite3.connect(db_path)
        cur = conn.execute("PRAGMA table_info(rss_entries)")
        columns = {row[1] for row in cur.fetchall()}
        if "content" in columns:
            print(f"  ✅ rss_entries 表已有 content 列 (db: {db_path})")
        else:
            print(f"  ❌ rss_entries 表缺少 content 列 (db: {db_path})")
            print(f"     现有列: {sorted(columns)}")
            ok2 = False

        # 检查是否有数据
        cur2 = conn.execute("SELECT COUNT(*) FROM rss_entries WHERE content != '' AND content IS NOT NULL")
        cnt = cur2.fetchone()[0]
        print(f"  📊 已有 {cnt} 条记录包含 content 数据")
        if cnt > 0:
            cur3 = conn.execute("SELECT title, length(description), length(content) FROM rss_entries WHERE content != '' LIMIT 3")
            for row in cur3.fetchall():
                print(f"     - {row[0][:40]}  desc={row[1]}字符  content={row[2]}字符")

        conn.close()
    else:
        print(f"  ⚠️  未找到数据库文件，跳过（尝试过: {db_paths}）")
        print("     提示: content 列会在服务启动时自动创建")
except Exception as ex:
    print(f"  ⚠️  数据库检查出错: {ex}")

print()

# ========== Step 3: 验证 API 返回 content 字段 ==========
print("=" * 60)
print("Step 3: 验证 API 返回 content 字段")
print("=" * 60)

ok3 = True
try:
    import urllib.request
    port = os.environ.get("PORT", "8000")
    url = f"http://localhost:{port}/api/rss/explore/timeline?limit=5"
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    resp = urllib.request.urlopen(req, timeout=10)
    data = json.loads(resp.read())
    items = data.get("items", [])
    with_content = [i for i in items if i.get("content")]
    print(f"  📊 返回 {len(items)} 条, 其中 {len(with_content)} 条有 content 字段")
    if with_content:
        sample = with_content[0]
        print(f"  ✅ 示例: {sample.get('title', '')[:40]}")
        print(f"     content 前100字: {sample['content'][:100]}")
    elif items:
        print(f"  ⚠️  返回了数据但都没有 content（可能还没有新抓取的数据）")
    else:
        print(f"  ⚠️  API 返回空数据")
except Exception as ex:
    print(f"  ⚠️  API 检查跳过（服务可能未运行）: {ex}")

print()

# ========== 总结 ==========
print("=" * 60)
if ok1:
    print("✅ 解析层验证通过 — RSS/Atom/JSON 三种格式的 content 都能正确提取")
else:
    print("❌ 解析层有问题，请检查 rss_proxy.py 的 parse_feed_content")
print("=" * 60)
