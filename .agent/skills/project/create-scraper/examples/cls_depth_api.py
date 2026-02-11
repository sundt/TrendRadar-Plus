"""
财联社深度/热门 - JSON API + 签名示例
适用: 深度文章、热门文章
特点: 需要签名（参数排序 → SHA-1 → MD5），替代 ScraperAPI 渲染方案
验证: 2026-02-11，全部成功

API 发现方法（签名破解流程）:
  1. 直接请求返回 "签名错误"，说明有签名机制
  2. 从页面 JS 找到 webpack chunk 文件
  3. 搜索 "sign" 关键字，定位到签名函数 p = r("W2Yj")
  4. 找到 W2Yj 模块：参数排序拼接 → SHA-1(r("KjvB")) → MD5(r("aCH8"))
  5. 固定参数: app=CailianpressWeb, os=web, sv=8.4.6
  6. 深度文章 API 从 depth.js 中找到: /v3/depth/home/assembled/{id}
"""

def fetch(config, context):
    import requests
    import hashlib

    def cls_sign(params):
        """财联社签名: 参数排序拼接 → SHA-1 → MD5"""
        sorted_keys = sorted(params.keys(), key=lambda x: x.upper())
        parts = [f"{k}={params[k]}" for k in sorted_keys if params[k] is not None]
        query = "&".join(parts)
        sha1 = hashlib.sha1(query.encode()).hexdigest()
        return hashlib.md5(sha1.encode()).hexdigest()

    source = config.get("source", "depth")  # depth / hot
    params = {"app": "CailianpressWeb", "os": "web", "sv": "8.4.6"}
    params["sign"] = cls_sign(params)

    try:
        if source == "depth":
            depth_id = config.get("depth_id", "1000")
            resp = requests.get(
                f"https://www.cls.cn/v3/depth/home/assembled/{depth_id}",
                params=params,
                headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.cls.cn/"},
                timeout=15
            )
            data = resp.json()
            items = data.get("data", {}).get("depth_list", [])
        else:  # hot
            resp = requests.get(
                "https://www.cls.cn/v2/article/hot/list",
                params=params,
                headers={"User-Agent": "Mozilla/5.0", "Referer": "https://www.cls.cn/"},
                timeout=15
            )
            data = resp.json()
            items = data.get("data", [])
    except Exception as e:
        print(f"财联社获取失败: {e}")
        return []

    results = []
    for idx, item in enumerate(items, 1):
        title = item.get("title", "")
        if not title:
            continue
        aid = item.get("id", "")
        results.append({
            "title": title,
            "url": f"https://www.cls.cn/detail/{aid}" if aid else "",
            "rank": idx,
            "published_at": int(item.get("ctime", 0)),
            "content": item.get("brief", "")[:200],
        })

    return results
