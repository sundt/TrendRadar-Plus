import requests
import time
from bs4 import BeautifulSoup
import re
import json

def scraperapi_get(url, use_scraperapi=False, scraperapi_params=None, headers=None, timeout=30):
    if use_scraperapi:
        api_key = "fa863d5645c8707943ab81c5e7375c42" # updated from server .env
        payload = {'api_key': api_key, 'url': url}
        if scraperapi_params:
            payload.update(scraperapi_params)
        print(f"DEBUG: Calling ScraperAPI with params: {payload}")
        return requests.get('http://api.scraperapi.com', params=payload, headers=headers, timeout=timeout)
    else:
        print(f"DEBUG: Calling Direct URL: {url}")
        return requests.get(url, headers=headers, timeout=timeout)

def fetch_test():
    # Simulate the context we saw in the DB
    context = {"use_scraperapi": True} 
    
    use_scraperapi = context.get("use_scraperapi", False)
    scraperapi_params = {"render": "true", "country_code": "us"}
    url = "https://www.cls.cn/depth?id=1000"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }
    
    print("--- START FETCH ---")
    try:
        resp = scraperapi_get(url, use_scraperapi, scraperapi_params=scraperapi_params, headers=headers, timeout=60)
        print(f"Status Code: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"Request failed: {resp.text[:500]}")
            return []
            
        soup = BeautifulSoup(resp.text, 'html.parser')
        
        # DEBUG: Print some stats about the page content
        links = soup.find_all('a', href=re.compile(r'^/detail/\d+$'))
        print(f"Found {len(links)} detailed links")
        
        results = []
        seen_titles = set()
        
        for link in links:
            title = link.get_text(strip=True)
            if not title or len(title) < 5: 
                # print(f"Skipping short title: {title}")
                continue
            if title in ['点击查看', '阅读全文', '详情', '评论', '分享', '收藏']: 
                continue
            if title in seen_titles: 
                continue
            
            href = link.get('href')
            full_url = f"https://www.cls.cn{href}"
            
            seen_titles.add(title)
            results.append({
                "title": title,
                "url": full_url,
                "rank": len(results) + 1,
                "published_at": 0 
            })
            print(f"Found: {title}")
            
            if len(results) >= 20: break
        
        print(f"成功抓取 {len(results)} 条数据")
        return results
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
        return []

if __name__ == "__main__":
    fetch_test()
