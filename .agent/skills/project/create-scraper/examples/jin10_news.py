"""
金十数据 - CDN 静态 JSON 示例
适用: 最新文章、热门排行
特点: 数据直接放在 CDN 静态 JSON 文件上，最轻量方案，无需任何签名或 header
验证: 2026-02-11，全部成功

API 发现方法:
  1. 页面是 Nuxt.js，从 JS chunk 中搜索 cdn.jin10.com/json
  2. 发现 latest_news.json 和 hits_rank.json 等静态文件
  3. 直接 curl 即可获取，完全公开
  4. reference-api.jin10.com 需要 x-app-id header 且部分接口 502
  5. CDN JSON 是最稳定可靠的方案
"""

def fetch(config, context):
    import requests

    source = config.get("source", "latest")

    if source == "latest":
        url = "https://cdn.jin10.com/json/index/latest_news.json"
        try:
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            data = resp.json()
            items = data.get("list", [])
        except Exception as e:
            print(f"金十最新文章获取失败: {e}")
            return []

    elif source == "hot":
        url = "https://cdn.jin10.com/json/index/hits_rank.json"
        try:
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            data = resp.json()
            items = data.get("all", {}).get("daily", {}).get("news", [])
        except Exception as e:
            print(f"金十热门获取失败: {e}")
            return []
    else:
        return []

    results = []
    for idx, item in enumerate(items, 1):
        title = item.get("title", "")
        if not title:
            continue
        aid = item.get("id", "")
        results.append({
            "title": title,
            "url": f"https://xnews.jin10.com/details/{aid}" if aid else "",
            "rank": idx,
            "content": item.get("introduction", "")[:200],
        })

    return results
