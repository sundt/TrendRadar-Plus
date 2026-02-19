#!/usr/bin/env python3
import sys, os, json
sys.path.insert(0, "/app")

print("=" * 60)
print("Step 1: parse_feed_content 解析验证")
print("=" * 60)

from hotnews.web.rss_proxy import parse_feed_content

# RSS 2.0 with content:encoded
rss_xml = b'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel><title>Test</title>
<item>
  <title>Test Article</title>
  <link>https://example.com/1</link>
  <description>This is summary</description>
  <content:encoded><![CDATA[<p>Full article with <img src="https://example.com/img.jpg"/></p>]]></content:encoded>
</item>
<item>
  <title>No Content</title>
  <link>https://example.com/2</link>
  <description>Only desc</description>
</item>
</channel></rss>'''
r = parse_feed_content("application/xml", rss_xml)
entries = r.get("entries", [])
e1 = entries[0] if entries else {}
e2 = entries[1] if len(entries) > 1 else {}

ok = True
if e1.get("summary") == "This is summary":
    print("  [PASS] RSS item1 summary")
else:
    print(f"  [FAIL] RSS item1 summary: {e1.get('summary')}")
    ok = False

if "Full article" in e1.get("content", ""):
    print("  [PASS] RSS item1 content:encoded")
else:
    print(f"  [FAIL] RSS item1 content: {e1.get('content', '')[:80]}")
    ok = False

if e2.get("content", "") == "":
    print("  [PASS] RSS item2 no content (expected)")
else:
    print(f"  [FAIL] RSS item2 should have empty content")
    ok = False

# Atom
atom_xml = b'''<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"><title>T</title>
<entry><title>Atom Art</title><link href="https://example.com/a" rel="alternate"/>
<summary>Atom sum</summary><content type="html">&lt;p&gt;Full atom content&lt;/p&gt;</content>
<published>2026-01-01T00:00:00Z</published></entry></feed>'''
r2 = parse_feed_content("application/atom+xml", atom_xml)
e_a = r2.get("entries", [{}])[0]
if e_a.get("summary") == "Atom sum":
    print("  [PASS] Atom summary")
else:
    print(f"  [FAIL] Atom summary: {e_a.get('summary')}")
    ok = False
if "Full atom" in e_a.get("content", ""):
    print("  [PASS] Atom content")
else:
    print(f"  [FAIL] Atom content: {e_a.get('content', '')[:80]}")
    ok = False

# JSON Feed
jf = json.dumps({"version":"1","title":"J","items":[
    {"title":"JA","url":"https://example.com/j","summary":"J sum","content_html":"<p>J full</p>"}
]}).encode()
r3 = parse_feed_content("application/json", jf)
e_j = r3.get("entries", [{}])[0]
if e_j.get("summary") == "J sum":
    print("  [PASS] JSON Feed summary")
else:
    print(f"  [FAIL] JSON Feed summary: {e_j.get('summary')}")
    ok = False
if "J full" in e_j.get("content", ""):
    print("  [PASS] JSON Feed content_html")
else:
    print(f"  [FAIL] JSON Feed content: {e_j.get('content', '')[:80]}")
    ok = False

print()
print("=" * 60)
print("Step 2: DB content 列检查")
print("=" * 60)
import sqlite3
db_found = False
for f in ["/app/output/online.db", "/app/data/online.db"]:
    if os.path.exists(f):
        db_found = True
        conn = sqlite3.connect(f)
        cols = {r[1] for r in conn.execute("PRAGMA table_info(rss_entries)").fetchall()}
        has_col = "content" in cols
        print(f"  DB: {f}")
        print(f"  content column: {'[PASS]' if has_col else '[FAIL]'}")
        if not has_col:
            ok = False
        try:
            total = conn.execute("SELECT COUNT(*) FROM rss_entries").fetchone()[0]
            cnt = conn.execute("SELECT COUNT(*) FROM rss_entries WHERE content IS NOT NULL AND content != ''").fetchone()[0]
            print(f"  total entries: {total}, with content: {cnt}")
            if cnt > 0:
                for row in conn.execute("SELECT title, length(description), length(content) FROM rss_entries WHERE content IS NOT NULL AND content != '' LIMIT 3"):
                    print(f"    - {str(row[0])[:40]}  desc={row[1]}chars  content={row[2]}chars")
        except Exception as ex:
            print(f"  query error: {ex}")
        conn.close()
        break
if not db_found:
    print("  DB not found (skipped)")

print()
print("=" * 60)
print("Step 3: API 返回检查")
print("=" * 60)
import urllib.request
try:
    port = os.environ.get("VIEWER_PORT", "8090")
    url = f"http://127.0.0.1:{port}/api/rss/explore/timeline?limit=5"
    resp = urllib.request.urlopen(url, timeout=10)
    data = json.loads(resp.read())
    items = data.get("items", [])
    with_c = [i for i in items if i.get("content")]
    print(f"  returned {len(items)} items, {len(with_c)} with content")
    if with_c:
        s = with_c[0]
        print(f"  sample: {s.get('title', '-')[:50]}")
        print(f"  content[:80]: {s['content'][:80]}")
    elif items:
        print("  items returned but none have content yet (wait for next fetch cycle)")
except Exception as ex:
    print(f"  API check skipped: {ex}")

print()
print("=" * 60)
if ok:
    print("ALL PARSE TESTS PASSED")
else:
    print("SOME TESTS FAILED")
print("=" * 60)
