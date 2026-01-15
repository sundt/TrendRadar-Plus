"""
财联社深度 - ScraperAPI 渲染 JS 示例
来源: custom_sources.id = 'custom_1jkdiz5'
成功条目: 30+
特点: 
  - 使用 ScraperAPI 渲染 JavaScript 动态内容
  - render=true 参数确保 JS 执行
  - 去重和过滤干扰词
  - 需要在 Admin 后台开启 "使用 ScraperAPI"
"""

def fetch(config, context):
    import re
    from bs4 import BeautifulSoup
    
    use_scraperapi = context.get("use_scraperapi", False)
    
    # 强制使用 'render=true' 参数来运行 JS
    # 这只有在 use_scraperapi=True 时才有效
    scraperapi_params = {"render": "true", "country_code": "us"}
    
    url = "https://www.cls.cn/depth?id=1000"
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }
    
    try:
        # 使用全局函数 scraperapi_get，传入 scraperapi_params
        # timeout 设置长一点，因为渲染需要时间
        resp = scraperapi_get(url, use_scraperapi, scraperapi_params=scraperapi_params, headers=headers, timeout=60)
            
        if resp.status_code != 200:
            print(f"Request failed: {resp.status_code}")
            return []
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        results = []
        seen_titles = set()
        
        # 查找所有指向详情页的链接 (/detail/xxxx)
        links = soup.find_all('a', href=re.compile(r'^/detail/\d+$'))
        
        for link in links:
            title = link.get_text(strip=True)
            # 过滤短标题和干扰词
            if not title or len(title) < 5: continue
            if title in ['点击查看', '阅读全文', '详情', '评论', '分享', '收藏']: continue
            if title in seen_titles: continue
            
            href = link.get('href')
            full_url = f"https://www.cls.cn{href}"
            
            seen_titles.add(title)
            results.append({
                "title": title,
                "url": full_url,
                "rank": len(results) + 1,
                "published_at": 0 
            })
            
            if len(results) >= 20: break
        
        print(f"成功抓取 {len(results)} 条数据")
        return results
    except Exception as e:
        print(f"Error: {e}")
        return []
