"""
V2EX - 官方公开 API + Socks5 代理示例
适用: 热门话题、最新话题
特点: 官方提供 JSON API，国内 DNS 污染需勾选 Socks5 代理
验证: 2026-02-11，通过代理成功

API 发现方法:
  1. V2EX 有公开文档的 API: /api/topics/hot.json 和 /api/topics/latest.json
  2. 国内服务器 DNS 被污染（解析到 Facebook IP），直连超时
  3. 需在 Admin 后台勾选"使用 Socks5 代理"
"""

def fetch(config, context):
    source = config.get("source", "hot")  # hot / latest
    url = f"https://www.v2ex.com/api/topics/{source}.json"

    use_socks = context.get("use_socks_proxy", False)

    try:
        resp = scraperapi_get(url, use_socks_proxy=use_socks, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        resp.raise_for_status()
        items = resp.json()
    except Exception as e:
        print(f"V2EX获取失败: {e}")
        return []

    results = []
    for idx, item in enumerate(items, 1):
        title = item.get("title", "")
        if not title:
            continue
        results.append({
            "title": title,
            "url": item.get("url", ""),
            "rank": idx,
            "published_at": int(item.get("created", 0)),
            "content": item.get("content", "")[:200],
        })

    return results
