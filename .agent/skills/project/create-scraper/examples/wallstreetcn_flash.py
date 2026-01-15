"""
华尔街见闻快讯 - JSON API 多频道示例
来源: custom_sources.id = 'custom_jf5897a'
成功条目: 167+
特点: 多频道轮询、去重、按时间排序
"""

def fetch(config, context):
    import requests
    from datetime import datetime
    
    # 所有频道列表
    channels = [
        "global-channel",      # 7x24 全球快讯
        "a-stock-channel",     # A股
        "us-stock-channel",    # 美股
        "hk-stock-channel",    # 港股
        "forex-channel",       # 外汇
        "commodity-channel",   # 商品
        "bond-channel",        # 债券
    ]
    
    # 可配置：使用单个频道或全部
    selected_channel = config.get("channel", "")  # 留空则获取所有
    limit = config.get("limit", 30)  # 每个频道获取条数
    
    if selected_channel:
        channels = [selected_channel]
    
    all_items = []
    seen_ids = set()
    
    for channel in channels:
        url = f"https://api-one.wallstcn.com/apiv1/content/lives?channel={channel}&limit={limit}"
        
        try:
            resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
            data = resp.json()
            items = data.get("data", {}).get("items", [])
            
            for item in items:
                item_id = item.get("id")
                if item_id in seen_ids:  # 去重（不同频道可能有重复）
                    continue
                seen_ids.add(item_id)
                all_items.append(item)
                
        except Exception as e:
            print(f"华尔街见闻 {channel} 获取失败: {e}")
            continue
    
    # 按发布时间排序（最新的在前）
    all_items.sort(key=lambda x: x.get("display_time", 0), reverse=True)
    
    results = []
    for item in all_items:
        title = item.get("title", "") or item.get("content_text", "")[:80]
        if not title:
            continue
            
        news_url = item.get("uri", "")
        display_time = item.get("display_time", 0)
        published_at = int(display_time) if display_time else 0
        
        results.append({
            "title": title,
            "url": news_url,
            "rank": len(results) + 1,
            "published_at": published_at
        })
    
    return results
