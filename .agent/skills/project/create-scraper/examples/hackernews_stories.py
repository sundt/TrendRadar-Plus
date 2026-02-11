"""
Hacker News - Firebase 官方 API 示例
适用: 首页热门（精确排名）、最新、Best、Ask HN、Show HN
特点: 官方 API 保证排名与网站一致，并发请求加速，需走代理
验证: 2026-02-11，走代理 30 条约 3s

API:
  - topstories.json: 首页排名（对应 news.ycombinator.com 首页）
  - newstories.json: 最新
  - beststories.json: 最佳
  - askstories.json: Ask HN
  - showstories.json: Show HN
  每个返回 ID 列表（按排名排序），再逐个请求 /item/{id}.json 获取详情
  需走代理访问 Firebase (Google 服务)，用 concurrent.futures 并发提速
"""

def fetch(config, context):
    import concurrent.futures

    source = config.get("source", "topstories")
    limit = config.get("limit", 30)
    use_socks = context.get("use_socks_proxy", False)

    base = "https://hacker-news.firebaseio.com/v0"

    try:
        resp = scraperapi_get(f"{base}/{source}.json", use_socks_proxy=use_socks, timeout=10)
        resp.raise_for_status()
        ids = resp.json()[:limit]
    except Exception as e:
        print(f"HN获取ID列表失败: {e}")
        return []

    def get_item(aid):
        try:
            return scraperapi_get(f"{base}/item/{aid}.json", use_socks_proxy=use_socks, timeout=10).json()
        except Exception:
            return None

    # 并发请求详情（10 线程）
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
        raw_items = list(ex.map(get_item, ids))

    results = []
    for idx, item in enumerate(raw_items, 1):
        if not item:
            continue
        title = item.get("title", "")
        if not title:
            continue

        url = item.get("url", "")
        if not url:
            url = f"https://news.ycombinator.com/item?id={item.get('id', '')}"

        results.append({
            "title": title,
            "url": url,
            "rank": idx,
            "published_at": int(item.get("time", 0)),
            "content": f"{item.get('score', 0)} points | {item.get('descendants', 0)} comments",
        })

    return results
