def fetch(config, context):
    # This script runs in a restricted sandbox where imports are not allowed.
    # The following libraries are pre-imported and available in the global scope:
    # requests, re, bs4, json
    
    url = "https://news.aibase.cn/news"
    # Use User-Agent to avoid blocks
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36"
    }
    
    # Use the pre-imported 'requests' library
    resp = requests.get(url, headers=headers)
    if resp.status_code != 200:
        return []

    html = resp.text
    
    # 1. Parse HTML for Titles and URLs using pre-imported 'bs4'
    soup = bs4.BeautifulSoup(html, "html.parser")
    items = []
    
    # 2. Extract OID -> Time mapping from Nuxt data in HTML
    # Data Pattern in Nuxt JSON string: ..., OID, "YYYY-MM-DD HH:mm:ss", ...
    # We use regex to find these pairs in the raw HTML string
    time_map = {}
    
    # Regex: Look for IDs (4+ digits) followed by a comma and a date string
    time_matches = re.findall(r'(\d{4,})\s*,\s*"(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})"', html)
    for oid, t_str in time_matches:
        time_map[oid] = t_str
        
    # 3. Find article links
    links = soup.find_all("a", href=re.compile(r"/news/\d+"))
    
    seen_oids = set()
    
    for link in links:
        href = link.get("href")
        if not href:
            continue
            
        # Extract OID from URL
        match = re.search(r"/news/(\d+)", href)
        if not match:
            continue
        oid = match.group(1)
        
        # Deduplicate
        if oid in seen_oids:
            continue
        seen_oids.add(oid)
        
        # Get Title
        title_div = link.find("div", attrs={"title": True})
        if title_div:
            title = title_div["title"]
        else:
            title = link.get_text(strip=True)
            
        # Get Time from our map
        time_str = time_map.get(oid, "")
        
        # Filter: Only valid news items with titles and times
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
