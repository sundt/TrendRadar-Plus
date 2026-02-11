"""
GitHub Trending - HTML 解析示例
适用: GitHub 每日/每周/每月热门仓库
特点: 静态 HTML 解析，无 API，需走代理（GitHub 国内被墙）
验证: 2026-02-11

URL 模式:
  - /trending           每日热门（默认）
  - /trending?since=weekly   每周热门
  - /trending?since=monthly  每月热门
  - /trending/python     按语言筛选
"""

def fetch(config, context):
    import re
    import html as html_mod

    source = config.get("source", "daily")
    language = config.get("language", "")
    use_socks = context.get("use_socks_proxy", False)

    since_map = {"daily": "daily", "weekly": "weekly", "monthly": "monthly"}
    since = since_map.get(source, "daily")

    base = "https://github.com/trending"
    if language:
        base += f"/{language}"
    url = f"{base}?since={since}"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
    }

    try:
        resp = scraperapi_get(url, use_socks_proxy=use_socks, headers=headers, timeout=20)
        resp.raise_for_status()
        raw = resp.text
    except Exception as e:
        print(f"GitHub Trending 获取失败: {e}")
        return []

    articles = re.findall(r'<article class="Box-row">(.*?)</article>', raw, re.DOTALL)
    if not articles:
        print(f"未找到 article 标签，HTML 长度: {len(raw)}")
        return []

    results = []
    for idx, art in enumerate(articles, 1):
        # 仓库路径: h2 > a href
        h2 = re.search(r'<h2[^>]*>.*?<a[^>]*href="([^"]+)"', art, re.DOTALL)
        if not h2:
            continue
        href = h2.group(1).strip()
        if "return_to" in href:
            rt = re.search(r'return_to=([^&"]+)', href)
            if rt:
                from urllib.parse import unquote
                repo_path = unquote(rt.group(1))
            else:
                continue
        else:
            repo_path = href

        repo_path = repo_path.strip("/")
        if "/" not in repo_path:
            continue

        # 描述
        desc_m = re.search(r'<p class="col-9[^"]*">(.*?)</p>', art, re.DOTALL)
        desc = html_mod.unescape(desc_m.group(1).strip()) if desc_m else ""

        # 今日 stars
        stars_m = re.search(r'([\d,]+)\s+stars\s+(?:today|this week|this month)', art)
        stars_delta = stars_m.group(1).replace(",", "") if stars_m else "0"

        # 语言
        lang_m = re.search(r'itemprop="programmingLanguage">(.*?)<', art)
        lang = lang_m.group(1).strip() if lang_m else ""

        # 总 stars
        total_m = re.search(r'href="[^"]*stargazers"[^>]*>\s*(?:<[^>]+>\s*)*\s*([\d,]+)', art)
        total_stars = total_m.group(1).replace(",", "") if total_m else "0"

        title = f"{repo_path}"
        if lang:
            title += f" [{lang}]"

        results.append({
            "title": title,
            "url": f"https://github.com/{repo_path}",
            "rank": idx,
            "content": f"⭐{total_stars} (+{stars_delta}) {desc[:150]}",
        })

    return results
