"""
掘金热榜 - 开放 API 示例
适用: 文章热榜（按 hot_index 排序）
特点: POST JSON API，完全开放无需认证，国内直连
验证: 2026-02-11，30 条约 1s

API:
  - recommend_api/v1/article/recommend_all_feed
    sort_type=3 返回近期热门文章，按 hot_index 降序即为热榜
    无需签名、无需登录
"""

def fetch(config, context):
    import json

    limit = config.get("limit", 30)

    url = "https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed"
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    }
    body = json.dumps({"id_type": 2, "sort_type": 3, "count": limit, "cursor": "0"}).encode()

    try:
        import urllib.request
        req = urllib.request.Request(url, data=body, headers=headers, method="POST")
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        print(f"掘金热榜获取失败: {e}")
        return []

    items = data.get("data", [])
    if not items:
        return []

    # 提取文章信息并按 hot_index 排序
    articles = []
    for item in items:
        info = item.get("item_info", item)
        ai = info.get("article_info", {})
        title = ai.get("title", "").strip()
        if not title:
            continue
        articles.append({
            "title": title,
            "article_id": ai.get("article_id", ""),
            "hot_index": ai.get("hot_index", 0),
            "digg_count": ai.get("digg_count", 0),
            "view_count": ai.get("view_count", 0),
            "comment_count": ai.get("comment_count", 0),
            "ctime": int(ai.get("ctime", "0")),
        })

    articles.sort(key=lambda x: x["hot_index"], reverse=True)

    results = []
    for idx, a in enumerate(articles[:limit], 1):
        results.append({
            "title": a["title"],
            "url": f"https://juejin.cn/post/{a['article_id']}",
            "rank": idx,
            "published_at": a["ctime"],
            "content": f"{a['hot_index']}热度 | {a['digg_count']}赞 | {a['view_count']}阅读 | {a['comment_count']}评论",
        })

    return results
