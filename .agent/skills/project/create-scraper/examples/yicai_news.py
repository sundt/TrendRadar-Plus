"""
第一财经 - SSR 内嵌 JSON 示例
来源: https://www.yicai.com/
数据: 首页 HTML 内嵌 var headList=[...] (300条)
适用: 第一财经全站新闻、按频道筛选
特点:
  - 无独立 JSON API，数据以 JS 变量形式内嵌在首页 HTML 中
  - var headList=[...] 包含约 300 条文章，字段丰富
  - var breakNews=[...] 包含 5 条焦点图文章
  - 可按 ChannelName 筛选频道（A股/产经/科技/金融 等）
  - NewsType=10 为文章，NewsType=12 为视频
验证: 2026-02-13

数据结构 (headList 中每个对象):
  NewsID:       文章 ID
  NewsTitle:    标题
  NewsNotes:    摘要
  ChannelName:  频道名 (A股/产经/科技/金融/大政/全球/海外市场/区域/地产/汽车/此刻/评论/一财号 等)
  ChannelID:    频道 ID (54=A股, 57=产经, 58=科技, 53=金融, 49=大政, 52=全球, 56=海外市场, 51=区域, 59=地产, 201=汽车, 451=此刻, 200=评论, 100000801=一财号)
  CreateDate:   发布时间 ISO 格式 "2026-02-13T18:31:06"
  NewsAuthor:   作者
  NewsSource:   来源
  NewsHot:      热度
  CommentCount: 评论数
  NewsType:     10=文章, 12=视频
  url:          相对路径 "/news/103052695.html"

提取方法:
  1. 请求首页 HTML
  2. 正则匹配 headList=[...]; 提取 JSON 数组
  3. json.loads 解析
  4. 按 ChannelName / NewsType 筛选
"""

import re
import json
import datetime


def fetch(config, context):
    source = config.get("source", "latest")
    limit = int(config.get("limit", 30))

    # 频道映射: source -> ChannelName
    channel_map = {
        "a_stock":   "A股",
        "industry":  "产经",
        "tech":      "科技",
        "finance":   "金融",
        "policy":    "大政",
        "global":    "全球",
        "overseas":  "海外市场",
        "region":    "区域",
        "property":  "地产",
        "auto":      "汽车",
        "now":       "此刻",
        "comment":   "评论",
        "yicaihao":  "一财号",
    }

    url = "https://www.yicai.com/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    }

    try:
        resp = requests.get(url, headers=headers, timeout=20)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        print("第一财经首页获取失败: %s" % e)
        return []

    # 提取 headList JSON 数组
    items = _extract_json_var(html, "headList")
    if not items:
        print("未找到 headList 数据")
        return []

    # 过滤视频 (NewsType=12)
    items = [i for i in items if i.get("NewsType") != 12]

    # 按频道筛选
    if source != "latest" and source in channel_map:
        target = channel_map[source]
        items = [i for i in items if i.get("ChannelName") == target]
    elif source != "latest" and source not in channel_map:
        print("未知 source: %s，可选: latest, %s" % (source, ", ".join(channel_map.keys())))
        return []

    results = []
    for item in items[:limit]:
        title = (item.get("NewsTitle") or "").strip()
        rel_url = (item.get("url") or "").strip()

        if not title or not rel_url:
            continue

        article_url = "https://www.yicai.com" + rel_url if rel_url.startswith("/") else rel_url

        entry = {
            "title": title,
            "url": article_url,
            "rank": len(results) + 1,
        }

        # 时间: ISO 格式 "2026-02-13T18:31:06"
        create_date = item.get("CreateDate", "")
        if create_date:
            try:
                dt = datetime.datetime.fromisoformat(create_date)
                entry["time"] = dt.strftime("%Y-%m-%d %H:%M")
                entry["published_at"] = int(dt.timestamp())
            except Exception:
                entry["time"] = create_date

        # 摘要 + 频道 + 热度
        channel = item.get("ChannelName", "")
        notes = (item.get("NewsNotes") or "").strip()
        hot = item.get("NewsHot", 0)
        parts = []
        if channel:
            parts.append("[%s]" % channel)
        if notes:
            parts.append(notes[:120])
        if hot and int(hot) > 0:
            parts.append("(热度%s)" % hot)
        if parts:
            entry["content"] = " ".join(parts)

        results.append(entry)

    return results


def _extract_json_var(html, var_name):
    """从 HTML 中提取内嵌的 JS 变量 JSON 数组"""
    # 匹配 var headList=[...] 或 headList=[...]
    pattern = r'(?:var\s+)?%s\s*=\s*\[' % re.escape(var_name)
    m = re.search(pattern, html)
    if not m:
        return []

    start = html.index('[', m.start())
    depth = 0
    for i in range(start, min(start + 800000, len(html))):
        c = html[i]
        if c == '[':
            depth += 1
        elif c == ']':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(html[start:i + 1])
                except Exception as e:
                    print("JSON 解析失败: %s" % e)
                    return []
    return []
