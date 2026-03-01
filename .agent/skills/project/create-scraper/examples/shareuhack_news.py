"""
Shareuhack 中文版 - Next.js SSR 内嵌 JSON 示例
来源: https://www.shareuhack.com/zh-TW/
数据: __NEXT_DATA__ 内嵌 JSON
适用: Shareuhack 中文版全站文章
特点:
  - Next.js SSR 应用，数据内嵌在 <script id="__NEXT_DATA__"> 中
  - 文章数据嵌套在 pageProps 深层结构中
  - 包含标题、slug、摘要、发布时间、工具标签等完整信息
  - 发布时间为 ISO 8601 格式（含时区）
验证: 2026-02-28

数据结构 (posts 数组中每个对象):
  title:        标题
  slug:         文章 slug（用于构建 URL）
  excerpt:      摘要
  publishedAt:  发布时间 ISO 格式 "2026-02-27T12:00:00+08:00"
  updatedAt:    更新时间
  tools:        使用的工具列表 ["ChatGPT", "Midjourney", ...]
  concepts:     相关概念标签
  coverImage:   封面图（可能为 null）

提取方法:
  1. 请求首页 HTML
  2. 正则匹配 <script id="__NEXT_DATA__">...</script> 提取 JSON
  3. json.loads 解析
  4. 递归查找包含文章的数组（通常在 pageProps 深层）
  5. 构建完整 URL: https://www.shareuhack.com/zh-TW/{slug}
"""

import re
import json
from datetime import datetime


def fetch(config, context):
    """
    抓取 Shareuhack 中文版文章

    Args:
        config: 平台配置
          - limit: 返回文章数量限制（默认 30）
        context: 上下文对象

    Returns:
        list: 文章列表 [{"title": "...", "url": "...", "time": "..."}]
    """
    limit = int(config.get("limit", 30))

    url = "https://www.shareuhack.com/zh-TW/"
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
    }

    try:
        resp = requests.get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        html = resp.text
    except Exception as e:
        print("Shareuhack 页面获取失败: %s" % e)
        return []

    # 提取 __NEXT_DATA__ 中的 JSON 数据
    match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.+?)</script>', html)
    if not match:
        print("未找到 __NEXT_DATA__ 数据")
        return []

    try:
        data = json.loads(match.group(1))
    except json.JSONDecodeError as e:
        print("JSON 解析失败: %s" % e)
        return []

    # 递归查找文章数组
    posts = _find_posts(data)
    if not posts:
        print("未找到文章数据")
        return []

    # 转换为标准格式
    items = []
    for idx, post in enumerate(posts[:limit], start=1):
        title = post.get('title', '').strip()
        slug = post.get('slug', '').strip()

        if not title or not slug:
            continue

        # 构建完整 URL
        post_url = "https://www.shareuhack.com/zh-TW/%s" % slug

        # 提取发布时间
        published_at = post.get('publishedAt', '')
        time_str = ''
        if published_at:
            try:
                # 解析 ISO 8601 格式时间（移除时区信息）
                dt_str = published_at.replace('+08:00', '').replace('+00:00', '')
                dt = datetime.fromisoformat(dt_str)
                time_str = dt.strftime('%Y-%m-%d %H:%M')
            except:
                pass

        items.append({
            'title': title,
            'url': post_url,
            'time': time_str,
            'rank': idx
        })

    return items


def _find_posts(obj, depth=0):
    """
    递归查找包含文章的数组

    Args:
        obj: 要搜索的对象（dict 或 list）
        depth: 当前递归深度（防止无限递归）

    Returns:
        list: 文章数组，未找到返回 None
    """
    if depth > 10:
        return None

    if isinstance(obj, dict):
        for key, value in obj.items():
            # 查找可能包含文章的键名
            if key in ['posts', 'articles', 'items', 'data'] and isinstance(value, list) and len(value) > 0:
                # 检查是否是文章数组（包含 title 和 slug）
                if isinstance(value[0], dict) and 'title' in value[0] and 'slug' in value[0]:
                    return value
            # 递归搜索
            result = _find_posts(value, depth + 1)
            if result:
                return result
    elif isinstance(obj, list):
        for item in obj:
            result = _find_posts(item, depth + 1)
            if result:
                return result

    return None
