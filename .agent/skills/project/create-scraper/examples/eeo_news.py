"""
经济观察网 - JSON API 示例
来源: https://www.eeo.com.cn/
API: https://app.eeo.com.cn/?app=article&controller=synPage&action=index_news
适用: 经济观察网全站新闻、频道新闻、快讯
特点:
  - 完全开放的 JSON API，无需签名/认证
  - 两套 API：首页综合 (synPage) 和频道分类 (getMoreArticle)
  - 返回 title、url、publishedDate、catname、description、pv 等完整字段
  - 频道 API 使用 UUID 作为 channelId
验证: 2026-02-13

API 模式:
  首页综合:
    GET https://app.eeo.com.cn/?app=article&controller=synPage&action=index_news
        &page=0&size=30
    返回: { code: 200, data: [{ title, url, publishedDate, catname, description, pv, ... }] }

  频道分类:
    GET https://app.eeo.com.cn/?app=article&controller=index&action=getMoreArticle
        &uuid={channelId}&page=1&pageSize=20
    返回: { code: 200, data: [{ title, url, published, catname, description, pv, author, ... }] }

  快讯 (catid 模式):
    GET https://app.eeo.com.cn/?app=article&controller=index&action=getMoreArticle
        &catid=3690&page=1&pageSize=20

频道 UUID 映射:
  金融:    9cdd41e11a114e5d8cbb8be12474aadd
  科技:    6d25131016de4200bf28724e31924406
  观察家:  e71afa970ed44f3d9ded2bdccaf9ba78
  ESG:     eeca2a456f074ab7a2267abc354a9f61
  出海:    c6e61ee8fb9f41d9ba0d6a2f241b54e6
"""

def fetch(config, context):
    source = config.get("source", "latest")
    limit = int(config.get("limit", 30))

    # 频道 UUID 映射
    channel_map = {
        "finance":    "9cdd41e11a114e5d8cbb8be12474aadd",
        "tech":       "6d25131016de4200bf28724e31924406",
        "observer":   "e71afa970ed44f3d9ded2bdccaf9ba78",
        "esg":        "eeca2a456f074ab7a2267abc354a9f61",
        "overseas":   "c6e61ee8fb9f41d9ba0d6a2f241b54e6",
    }

    base = "https://app.eeo.com.cn/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Referer": "https://www.eeo.com.cn/",
    }

    if source == "latest":
        # 首页综合 API
        url = base + "?app=article&controller=synPage&action=index_news"
        params = {"page": 0, "size": limit}
        time_key = "publishedDate"
    elif source == "flash":
        # 快讯 API (catid 模式)
        url = base + "?app=article&controller=index&action=getMoreArticle"
        params = {"catid": 3690, "page": 1, "pageSize": limit}
        time_key = "published"
    elif source in channel_map:
        # 频道 API (uuid 模式)
        url = base + "?app=article&controller=index&action=getMoreArticle"
        params = {"uuid": channel_map[source], "page": 1, "pageSize": limit}
        time_key = "published"
    else:
        print(f"未知 source: {source}，可选: latest, flash, {', '.join(channel_map.keys())}")
        return []

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f"经济观察网获取失败: {e}")
        return []

    if data.get("code") != 200:
        print(f"API 返回错误: {data}")
        return []

    items = data.get("data", [])
    results = []

    for item in items:
        title = item.get("title", "").strip()
        article_url = item.get("url", "").strip()

        if not title or not article_url:
            continue

        # 统一 http -> https
        if article_url.startswith("http://"):
            article_url = "https://" + article_url[7:]

        entry = {
            "title": title,
            "url": article_url,
            "rank": len(results) + 1,
        }

        # 时间
        time_str = item.get(time_key, "")
        if time_str:
            entry["time"] = time_str

        # 摘要 + 分类 + 阅读数
        catname = item.get("catname", "")
        desc = item.get("description", "").strip()
        pv = item.get("pv", "")
        content_parts = []
        if catname:
            content_parts.append(f"[{catname}]")
        if desc:
            content_parts.append(desc[:120])
        if pv and int(pv) > 0:
            content_parts.append(f"({pv}阅读)")
        if content_parts:
            entry["content"] = " ".join(content_parts)

        results.append(entry)

    return results
