"""
格隆汇热文 - 开放 JSON API 示例
适用: 热文（推荐/股票/基金/新股/研报）、热门话题
特点: API 完全开放，无需签名、无需 token
验证: 2026-02-11，全部成功

API 发现方法:
  1. 页面是 Nuxt.js SSR，HTML 里有 __NUXT__ 数据但格式是 JS 函数不好解析
  2. 下载 JS chunk 文件，用正则搜索 /api/ 路径
  3. 在最大的 chunk (f767358.js, 870KB) 中找到大量 API 路径
  4. 逐个 curl 验证，发现全部不需要签名
  5. /api/tags/articles?value=d 就是首页"热文"板块
"""

def fetch(config, context):
    import requests

    source = config.get("source", "hot_article")

    if source == "hot_article":
        # 热文: d=推荐, fund=基金, new_stock=新股, research=研报
        tag = config.get("tag", "d")
        page_size = config.get("limit", 20)
        url = f"https://www.gelonghui.com/api/tags/articles?value={tag}&pageSize={page_size}&page=1"

        try:
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            data = resp.json()
            items = data.get("result", [])
        except Exception as e:
            print(f"格隆汇热文获取失败: {e}")
            return []

        results = []
        for idx, item in enumerate(items, 1):
            title = item.get("articleTitle", "")
            if not title:
                continue
            pid = item.get("postId", "")
            results.append({
                "title": title,
                "url": f"https://www.gelonghui.com/p/{pid}" if pid else "",
                "rank": idx,
                "published_at": int(item.get("publishTime", 0)),
                "content": item.get("articleSummary", "")[:200],
            })
        return results

    elif source == "hot_topic":
        url = "https://www.gelonghui.com/api/hot/topic/list/v1"
        try:
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
            data = resp.json()
            items = data.get("result", [])
        except Exception as e:
            print(f"格隆汇热门话题获取失败: {e}")
            return []

        results = []
        for idx, item in enumerate(items, 1):
            name = item.get("topicName", "")
            if not name:
                continue
            results.append({
                "title": name,
                "url": item.get("link", ""),
                "rank": idx,
                "content": item.get("summary", "")[:200],
            })
        return results

    return []
