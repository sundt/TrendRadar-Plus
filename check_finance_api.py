#!/usr/bin/env python3
import sys, json

data = json.load(sys.stdin)
cat = data.get('category', {})
platforms = cat.get('platforms', {})
name = cat.get('name', '?')
print(f'Category: {name}')
print(f'Platform count: {len(platforms)}')
for pid, pdata in platforms.items():
    news = pdata.get('news', [])
    pname = pdata.get('name', pid)
    print(f'  {pname} ({pid}): {len(news)} items')
