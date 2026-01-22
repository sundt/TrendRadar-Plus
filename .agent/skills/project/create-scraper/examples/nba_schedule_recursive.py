"""
NBA 未来比赛 - 递归 JSON 解析 + 日期过滤示例
来源: custom_sources.id = 'custom_g9la8ui'
成功条目: 311+
特点:
  - 递归遍历复杂嵌套 JSON 结构
  - 日期范围过滤（获取未来 7 天）
  - datetime 时间处理和格式化
  - 自动提取深层数据
"""

def fetch(config, context):
    # --- Imports 必须在函数内部 ---
    import requests
    from datetime import date, datetime, timedelta
    
    # --- 辅助函数 ---
    def parse_start_time(raw):
        s = (raw or "").strip()
        if not s: return None
        try:
            return datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
        except:
            return None
    
    def format_match_time(raw):
        dt = parse_start_time(raw)
        return dt.strftime("%m-%d %H:%M") if dt else ""
    
    # --- 主逻辑 ---
    # 获取未来 7 天的比赛（不包含今天）
    future_days = 7
    
    today = date.today()
    start_date = today + timedelta(days=1)  # 从明天开始
    end_date = start_date + timedelta(days=future_days - 1) # 到未来第 7 天
    
    start_str = start_date.strftime("%Y-%m-%d")
    end_str = end_date.strftime("%Y-%m-%d")
    
    url = f"https://matchweb.sports.qq.com/kbs/list?columnId=100000&startTime={start_str}&endTime={end_str}"
    
    matches = []
    try:
        resp = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=10)
        data = resp.json()
        
        # 递归遍历嵌套的 JSON 结构，查找所有比赛对象
        stack = [data]
        seen = set()
        
        while stack:
            cur = stack.pop()
            if isinstance(cur, dict):
                # 判断是否为比赛对象（包含 mid 和 leftName）
                if "mid" in cur and "leftName" in cur:
                    mid = cur.get("mid")
                    if mid and mid not in seen:
                        seen.add(mid)
                        matches.append(cur)
                else:
                    # 继续递归遍历字典的值
                    stack.extend(cur.values())
            elif isinstance(cur, list):
                # 递归遍历列表
                stack.extend(cur)
                
    except Exception as e:
        print(f"NBA fetch error: {e}")
        return []
    
    results = []
    # 按时间正序排序（最早的在前面）
    matches.sort(key=lambda x: x.get("startTime") or "")
    
    for m in matches:
        left = m.get("leftName", "")
        right = m.get("rightName", "")
        l_goal = m.get("leftGoal") or "-"
        r_goal = m.get("rightGoal") or "-"
        
        time_str = format_match_time(m.get("startTime"))
        desc = m.get("matchDesc", "")
        
        title = f"[{time_str}] {left} vs {right} {l_goal}:{r_goal} {desc}"
        web_url = m.get("webUrl") or f"https://kbs.sports.qq.com/m/#/match/{m.get('mid')}/detail"
        
        results.append({
            "title": title,
            "url": web_url,
            "rank": len(results) + 1
        })
        
    return results
