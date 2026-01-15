"""
Mercury Chong Blogspot 爬虫 (极简稳定版)
依赖: 后端已修复 HTTPS 协议，直接调用 scraperapi_get 即可
"""
def fetch(config, context):
    import requests
    from bs4 import BeautifulSoup
    
    url = "https://mercurychong.blogspot.com/"
    use_scraperapi = context.get("use_scraperapi", False)
    
    print(f"🚀 开始抓取: {url}")
    
    try:
        if use_scraperapi:
            print("⏳ 通过 ScraperAPI (HTTPS) 请求...")
            # scraperapi_get 是后端注入的全局函数
            # render=true 确保 JS 渲染，country_code=us 避免 GDPR 弹窗
            resp = scraperapi_get(url, use_scraperapi=True, scraperapi_params={"render": "true", "country_code": "us"}, timeout=60)
        else:
            print("🔧 直连模式 (如失败请开启 ScraperAPI)...")
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    except NameError:
        print("⚠️ 本地环境: 未找到 scraperapi_get，尝试直连...")
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
    except Exception as e:
        print(f"💥 请求异常: {e}")
        return []

    if resp.status_code != 200:
        print(f"❌ 请求失败: {resp.status_code}")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")
    items = []
    
    # Blogspot 标准结构
    posts = soup.select(".post") 
    if not posts: posts = soup.select(".entry")
    
    print(f"✅ 找到 {len(posts)} 篇文章")
    
    for post in posts:
        title_tag = post.select_one(".post-title a, .entry-title a")
        if not title_tag: continue
        
        time_tag = post.select_one(".published")
        time_str = time_tag["title"] if (time_tag and time_tag.has_attr("title")) else ""
            
        items.append({
            "title": title_tag.get_text(strip=True),
            "url": title_tag.get("href"),
            "time": time_str
        })
        
    return items
