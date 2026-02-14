"""
每日经济新闻 金融频道 - HTML 解析 + Rails AJAX 分页示例
来源: https://finance.nbd.com.cn/
适用: 每经网金融频道新闻（监管、机构、市场、深度、动态、金融早参、保通社等）
特点:
  - 服务端渲染 HTML，无独立 JSON API
  - Rails UJS 风格 AJAX 分页（data-remote="true"）
  - 多频道 source 分支（finance/economy/industry/tmt 等）
  - 正则提取标题、链接、分类、时间、阅读数
验证: 2026-02-13

频道 column_id 映射:
  finance.nbd.com.cn:
    119  - 金融首页（默认）
    415  - 监管
    327  - 机构
    326  - 市场
    2128 - 深度
    2129 - 动态
    2081 - 金融早参
    2271 - 保通社
    556  - 首页头条
  economy.nbd.com.cn:
    129  - 宏观首页
  industry.nbd.com.cn:
    310  - 公司首页
  tmt.nbd.com.cn:
    338  - 未来商业首页
"""

def fetch(config, context):
    import re
    import html as html_mod

    source = config.get("source", "finance")

    # 频道映射: source -> (subdomain, column_id)
    source_map = {
        "finance":    ("finance",  "119"),
        "regulation": ("finance",  "415"),
        "institution":("finance",  "327"),
        "market":     ("finance",  "326"),
        "depth":      ("finance",  "2128"),
        "trend":      ("finance",  "2129"),
        "morning":    ("finance",  "2081"),
        "insurance":  ("finance",  "2271"),
        "economy":    ("economy",  "129"),
        "industry":   ("industry", "310"),
        "tmt":        ("tmt",      "338"),
    }

    if source not in source_map:
        print(f"未知 source: {source}，可选: {list(source_map.keys())}")
        return []

    subdomain, column_id = source_map[source]
    url = f"https://{subdomain}.nbd.com.cn/columns/{column_id}/"

    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
    }

    try:
        resp = scraperapi_get(url, headers=headers, timeout=15)
        resp.raise_for_status()
        raw = resp.text
    except Exception as e:
        print(f"每经网获取失败: {e}")
        return []

    return _parse_articles(raw)


def _parse_articles(html_text):
    """从 HTML 中提取文章列表"""
    import re
    import html as html_mod

    # 匹配每个 <li> 中的文章信息
    # 模式: <a href="URL" class="f-title" ...>标题</a>
    #        <a href="..." class="tag">分类</a>
    #        <span>时间</span>
    #        <span>阅读数</span>

    results = []
    seen_ids = set()

    # 提取所有文章块: 从 article-id 到下一个 article-id 或结束
    # 方案: 用 f-title 链接提取核心信息
    title_pattern = re.compile(
        r'<a\s+href="(https://www\.nbd\.com\.cn/articles/[^"]+)"'
        r'\s+class="f-title"[^>]*>(.*?)</a>',
        re.DOTALL
    )

    # 提取 article-id -> 用于去重
    id_pattern = re.compile(r'article-id="(\d+)"')

    # 提取时间和阅读数: <p class="f-source"> 内的 <span>
    source_pattern = re.compile(
        r'<p\s+class="f-source">(.*?)</p>',
        re.DOTALL
    )

    # 提取分类标签
    tag_pattern = re.compile(
        r'<a[^>]*class="tag"[^>]*>(.*?)</a>'
    )

    # 提取摘要
    desc_pattern = re.compile(
        r'<a\s+href="#"\s+class="f-text">\s*(.*?)\s*</a>',
        re.DOTALL
    )

    # 按 <li> 分割
    li_blocks = re.split(r'<li\b[^>]*>', html_text)

    for block in li_blocks:
        # 提取标题和链接
        title_m = title_pattern.search(block)
        if not title_m:
            continue

        article_url = title_m.group(1).strip()
        title = html_mod.unescape(title_m.group(2).strip())
        title = re.sub(r'<[^>]+>', '', title).strip()

        if not title:
            continue

        # 提取 article-id 去重
        id_m = id_pattern.search(block)
        if id_m:
            aid = id_m.group(1)
            if aid in seen_ids:
                continue
            seen_ids.add(aid)

        # 提取分类
        tag_m = tag_pattern.search(block)
        tag = html_mod.unescape(tag_m.group(1).strip()) if tag_m else ""

        # 提取时间和阅读数
        time_str = ""
        read_count = ""
        source_m = source_pattern.search(block)
        if source_m:
            spans = re.findall(r'<span[^>]*>(.*?)</span>', source_m.group(1))
            for s in spans:
                s = s.strip()
                if re.match(r'\d{4}-\d{2}-\d{2}', s):
                    time_str = s.strip()
                elif '阅读' in s:
                    read_count = re.sub(r'[^\d]', '', s)

        # 提取摘要
        desc = ""
        desc_m = desc_pattern.search(block)
        if desc_m:
            desc = html_mod.unescape(desc_m.group(1).strip())
            desc = re.sub(r'<[^>]+>', '', desc).strip()

        item = {
            "title": title,
            "url": article_url,
            "rank": len(results) + 1,
        }
        if time_str:
            item["time"] = time_str
        if tag:
            item["content"] = f"[{tag}] {desc[:120]}" if desc else f"[{tag}]"
        elif desc:
            item["content"] = desc[:150]
        if read_count:
            item["content"] = (item.get("content", "") + f" ({read_count}阅读)").strip()

        results.append(item)

    return results
