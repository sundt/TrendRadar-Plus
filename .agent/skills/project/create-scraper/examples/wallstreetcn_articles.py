"""
华尔街见闻文章 - JSON API 分类示例
适用: 全球新闻、TMT科技、热门文章
特点: 同一 API 不同参数覆盖多个板块，无需签名
验证: 2026-02-11，全部成功

API 发现方法:
  1. 已有快讯案例用 api-one.wallstcn.com，猜测文章也在同域
  2. curl 验证 /apiv1/content/articles?category=global 返回 200
  3. 注意: 页面路径 /news/tmt 对应 API 参数是 category=technology（不是 tmt）
  4. 热门文章用 /content/articles/hot?period=day，数据在 day_items 而非 items
"""

def fetch(config, context):
    import requests

    source = config.get("source", "global")  # global / technology / hot
    limit = config.get("limit", 30)

    if source == "hot":
        url = f"https://api-one.wallstcn.com/apiv1/content/articles/hot?period=day"
        data_path = "day_items"
    else:
        url = f"https://api-one.wallstcn.com/apiv1/content/articles?category={source}&limit={limit}"
        data_path = "items"

    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
        data = resp.json()
        items = data.get("data", {}).get(data_path, [])
    except Exception as e:
        print(f"华尔街见闻获取失败: {e}")
        return []

    results = []
    for idx, item in enumerate(items, 1):
        title = item.get("title", "")
        if not title:
            continue
        results.append({
            "title": title,
            "url": item.get("uri", ""),
            "rank": idx,
            "published_at": int(item.get("display_time", 0)),
            "content": item.get("content_short", "")[:200],
        })

    return results
