"""
AIBase AI新闻 - HTML 解析示例
来源: custom_sources.id = 'custom_m466v62'
成功条目: 24+
特点: BeautifulSoup 解析、Regex 提取时间、去重处理
"""

def fetch(config, context):
    # 沙箱环境中预导入: requests, re, bs4, json
    
    url = "https://news.aibase.cn/news"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }
    
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        return []
    html = resp.text
    
    # 1. 使用 BeautifulSoup 解析 HTML
    soup = bs4.BeautifulSoup(html, "html.parser")
    items = []
    
    # 2. 从 Nuxt 数据中提取 OID -> 时间 映射
    # 使用正则表达式在 HTML 中查找匹配的 ID 和日期
    time_map = {}
    time_matches = re.findall(r'(\d{4,})\s*,\s*"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"', html)
    for oid, t_str in time_matches:
        time_map[oid] = t_str
        
    # 3. 查找文章链接
    links = soup.find_all("a", href=re.compile(r"/news/\d+"))
    
    seen_oids = set()
    
    for link in links:
        href = link.get("href")
        if not href:
            continue
            
        # 从 URL 中提取 OID
        match = re.search(r"/news/(\d+)", href)
        if not match:
            continue
        oid = match.group(1)
        
        # 去重
        if oid in seen_oids:
            continue
        seen_oids.add(oid)
        
        # 获取标题
        title_div = link.find("div", attrs={"title": True})
        if title_div:
            title = title_div["title"]
        else:
            title = link.get_text(strip=True)
            
        # 从映射中获取时间
        time_str = time_map.get(oid, "")
        
        # 过滤：只保留有标题和时间的有效条目
        if title and time_str:
            full_url = href
            if not full_url.startswith("http"):
                full_url = "https://news.aibase.cn" + full_url
                
            items.append({
                "title": title,
                "url": full_url,
                "time": time_str
            })
            
    return items
