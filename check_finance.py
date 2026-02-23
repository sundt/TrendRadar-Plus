#!/usr/bin/env python3
import sqlite3

conn = sqlite3.connect('/app/output/online.db')

# 1. Enabled finance sources count
cur = conn.execute("SELECT COUNT(*) FROM rss_sources WHERE category='finance' AND enabled=1")
print('Enabled finance sources:', cur.fetchone()[0])

# 2. Per-source article counts
cur = conn.execute('''
    SELECT s.name, s.id, COUNT(e.id) as cnt
    FROM rss_sources s
    LEFT JOIN rss_entries e ON e.source_id = s.id AND e.published_at > 0 AND e.title IS NOT NULL AND e.title != ''
    WHERE s.category = 'finance' AND s.enabled = 1
    GROUP BY s.id
    ORDER BY cnt DESC
''')
rows = cur.fetchall()
total = 0
for r in rows:
    print(f'  {r[0]} ({r[1]}): {r[2]} articles')
    total += r[2]
print(f'Total finance articles: {total}')
print(f'Total finance sources: {len(rows)}')

# 3. Check what the API would return with nofilter=1, limit=5000
cur = conn.execute('''
    SELECT COUNT(DISTINCT e.source_id) as src_count, COUNT(*) as total
    FROM rss_entries e
    JOIN rss_sources s ON s.id = e.source_id
    WHERE s.category = 'finance'
      AND s.enabled = 1
      AND e.published_at > 0
      AND e.title IS NOT NULL AND e.title != ''
      AND e.url IS NOT NULL AND e.url != ''
''')
r = cur.fetchone()
print(f'\nAPI nofilter query: {r[0]} distinct sources, {r[1]} total articles')

# 4. Check dedup impact - how many unique URLs vs total
cur = conn.execute('''
    SELECT COUNT(*) as total, COUNT(DISTINCT e.url) as unique_urls, COUNT(DISTINCT LOWER(e.title)) as unique_titles
    FROM rss_entries e
    JOIN rss_sources s ON s.id = e.source_id
    WHERE s.category = 'finance'
      AND s.enabled = 1
      AND e.published_at > 0
      AND e.title IS NOT NULL AND e.title != ''
      AND e.url IS NOT NULL AND e.url != ''
''')
r = cur.fetchone()
print(f'Dedup: {r[0]} total, {r[1]} unique URLs, {r[2]} unique titles')

# 5. Simulate the actual API logic with limit=5000
cur = conn.execute('''
    SELECT e.source_id, e.title, e.url, e.created_at, e.published_at,
           COALESCE(s.name, e.source_id) as source_name
    FROM rss_entries e
    JOIN rss_sources s ON s.id = e.source_id
    WHERE s.category = 'finance'
      AND s.enabled = 1
      AND e.published_at > 0
      AND e.title IS NOT NULL AND e.title != ''
      AND e.url IS NOT NULL AND e.url != ''
    ORDER BY e.published_at DESC
    LIMIT 5200
''')
rows = cur.fetchall()

seen_urls = set()
seen_titles = set()
items = []
source_counts = {}

for r in rows:
    sid = str(r[0] or '').strip()
    title = str(r[1] or '').strip()
    url = str(r[2] or '').strip()
    sname = str(r[5] or '').strip()

    if not url or url in seen_urls:
        continue
    tk = title.lower()
    if tk and tk in seen_titles:
        continue
    seen_urls.add(url)
    if tk:
        seen_titles.add(tk)
    items.append((sid, sname, title))
    source_counts[sname] = source_counts.get(sname, 0) + 1

print(f'\nAfter dedup (limit 5200 fetch -> 5000 slice):')
print(f'  Total unique items: {len(items)}')
print(f'  Unique sources: {len(source_counts)}')
print(f'\n  Per-source breakdown:')
for name, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
    print(f'    {name}: {cnt}')
