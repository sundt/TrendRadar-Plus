"""
MIT Technology Review China (麻省理工科技评论中文网) - JSON API 示例
来源: https://www.mittrchina.com/news
API: https://apii.web.mittrchina.com/information/index
成功条目: 20+
特点: 
  - 简单 JSON API，无需 ScraperAPI
  - 返回标题、摘要、作者、时间等完整信息
  - start_time 为 Unix 时间戳
"""

def fetch(config, context):
    import requests
    from datetime import datetime
    
    url = "https://apii.web.mittrchina.com/information/index"
    params = {
        "page": 1,
        "limit": 30
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Origin": "https://www.mittrchina.com",
        "Referer": "https://www.mittrchina.com/news"
    }
    
    try:
        resp = requests.get(url, params=params, headers=headers, timeout=15)
        
        if resp.status_code != 200:
            print(f"Request failed: {resp.status_code}")
            return []
            
        data = resp.json()
        
        if data.get("code") != 10000:
            print(f"API error: {data.get('message')}")
            return []
            
        items = data.get("data", {}).get("items", [])
        results = []
        
        for item in items:
            article_id = item.get("id")
            title = item.get("name", "").strip()
            
            if not title or not article_id:
                continue
            
            # 构建文章 URL
            # 优先使用 article_url，否则构建默认 URL
            article_url = item.get("article_url")
            if not article_url:
                article_url = f"https://www.mittrchina.com/news/{article_id}"
            
            # 获取时间戳
            start_time = item.get("start_time", 0)
            time_str = ""
            if start_time:
                try:
                    time_str = datetime.fromtimestamp(start_time).strftime("%Y-%m-%d %H:%M:%S")
                except:
                    pass
            
            results.append({
                "title": title,
                "url": article_url,
                "time": time_str,
                "published_at": start_time,
                "rank": len(results) + 1
            })
        
        print(f"成功抓取 {len(results)} 条数据")
        return results
        
    except Exception as e:
        import traceback
        print(f"❌ 抓取失败: {e}")
        print(traceback.format_exc())
        return []
