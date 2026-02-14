# 成功爬虫案例库

本目录包含**16个生产环境验证的成功爬虫脚本**，作为创建新爬虫时的参考。

## 📊 案例概览

| 脚本 | 类型 | 关键技术 | 难度 |
|------|------|----------|------|
| [v2ex_topics.py](./v2ex_topics.py) | 官方公开 API + 代理 | Socks5 代理（DNS 污染） | ⭐ |
| [jin10_news.py](./jin10_news.py) | CDN 静态 JSON | 无需认证，最轻量 | ⭐ |
| [sina_tech_roll.py](./sina_tech_roll.py) | JSON API | 带参数请求、时间戳转换 | ⭐ |
| [eeo_news.py](./eeo_news.py) | 开放 JSON API 多套接口 | 首页/频道/快讯三套 API | ⭐ |
| [yicai_news.py](./yicai_news.py) | SSR 内嵌 JSON | 首页 HTML 内嵌 JSON、频道筛选 | ⭐ |
| [gelonghui_hot.py](./gelonghui_hot.py) | 开放 JSON API | 多板块分支、完全开放 | ⭐⭐ |
| [wallstreetcn_articles.py](./wallstreetcn_articles.py) | JSON API 多分类 | 同域猜测、data_path 差异 | ⭐⭐ |
| [wallstreetcn_flash.py](./wallstreetcn_flash.py) | JSON API 多频道 | 多频道轮询、去重、排序 | ⭐⭐ |
| [aibase_news.py](./aibase_news.py) | HTML 解析 | BeautifulSoup + Regex | ⭐⭐ |
| [nbd_finance.py](./nbd_finance.py) | SSR HTML + AJAX 分页 | Rails UJS、正则解析、多频道 | ⭐⭐ |
| [github_trending.py](./github_trending.py) | SSR HTML + 正则 | GitHub 静态 HTML、代理 | ⭐⭐ |
| [nba_schedule_recursive.py](./nba_schedule_recursive.py) | 嵌套 JSON | 递归遍历、日期过滤 | ⭐⭐⭐ |
| [cls_depth_api.py](./cls_depth_api.py) | 签名 JSON API | SHA-1 → MD5 签名破解 | ⭐⭐⭐ |
| [hackernews_stories.py](./hackernews_stories.py) | 官方 API + 并发 + 代理 | Firebase API、concurrent.futures | ⭐⭐ |
| [juejin_hot.py](./juejin_hot.py) | POST JSON API 热榜 | sort_type + hot_index 排序 | ⭐ |
| [cls_depth_scraperapi.py](./cls_depth_scraperapi.py) | ⚠️ 动态渲染（已替代） | ScraperAPI JS 渲染 | ⭐⭐⭐ |

> 💡 `cls_depth_api.py` 通过签名破解直接调用 API，已替代需要 ScraperAPI 的 `cls_depth_scraperapi.py`。

## 🎯 使用指南

### 1. 选择合适的模板

根据目标网站的数据源类型选择：

```
有官方公开 API 文档？
├─ 简单直连 → v2ex_topics.py
└─ 需并发 + 代理 → hackernews_stories.py

数据在 CDN 静态 JSON 文件上？
└─ jin10_news.py

数据来源是 JSON API？
├─ 需要签名 → cls_depth_api.py
├─ 简单平铺结构 → sina_tech_roll.py
├─ 多个频道/分类 → wallstreetcn_articles.py
├─ 开放 API 多板块 → gelonghui_hot.py
├─ 开放 API 多套接口 → eeo_news.py
├─ POST JSON + 热度排序 → juejin_hot.py
└─ 深度嵌套结构 → nba_schedule_recursive.py

数据内嵌在 HTML 页面的 JS 变量中？
└─ var xxx=[{...}] 形式 → yicai_news.py

数据来源是 HTML 页面？
├─ 静态 HTML（Nuxt SSR） → aibase_news.py
├─ Rails SSR + AJAX 分页 → nbd_finance.py
├─ GitHub 风格静态 HTML → github_trending.py
└─ JavaScript 动态渲染 → cls_depth_scraperapi.py（最后手段）
```

### 2. 复制并修改

1. 复制最接近的案例脚本
2. 修改 URL 和请求参数
3. 调整数据提取逻辑（JSON 路径等）
4. 在 Admin 后台测试运行

### 3. 各案例要点

#### ⭐ 官方公开 API + 代理（v2ex_topics.py）

官方 API 最简单，但国内 DNS 污染需走代理。使用 `scraperapi_get` + `use_socks_proxy`：
```python
use_socks = context.get("use_socks_proxy", False)
resp = scraperapi_get(url, use_socks_proxy=use_socks,
                      headers={"User-Agent": "Mozilla/5.0"}, timeout=15)
items = resp.json()  # 直接就是列表
```
需在 Admin 后台勾选"Socks5 代理"，并确保 `HOTNEWS_SOCKS_PROXY` 环境变量已注入容器。

#### ⭐ CDN 静态 JSON（jin10_news.py）

数据直接放在 CDN 上的静态 JSON 文件，最稳定：
```python
url = "https://cdn.jin10.com/json/index/latest_news.json"
resp = requests.get(url, timeout=15)
items = resp.json().get("list", [])
```

#### ⭐⭐ 官方 API + 并发 + 代理（hackernews_stories.py）

Firebase 官方 API 返回 ID 列表（精确排名），再并发请求详情。Google 服务需走代理：
```python
use_socks = context.get("use_socks_proxy", False)
resp = scraperapi_get(f"{base}/{source}.json", use_socks_proxy=use_socks, timeout=10)
ids = resp.json()[:limit]

with concurrent.futures.ThreadPoolExecutor(max_workers=10) as ex:
    raw_items = list(ex.map(get_item, ids))
```
10 线程并发，30 条约 3 秒。需勾选 Socks5 代理。

#### ⭐ POST JSON API 热榜（juejin_hot.py）

掘金热榜用 POST JSON 请求，`sort_type=3` 返回热门文章，按 `hot_index` 排序即为热榜：
```python
body = json.dumps({"id_type": 2, "sort_type": 3, "count": limit, "cursor": "0"}).encode()
req = urllib.request.Request(url, data=body, headers=headers, method="POST")
# 按 hot_index 降序排列
articles.sort(key=lambda x: x["hot_index"], reverse=True)
```
国内直连，无需代理，无需签名。

#### ⭐⭐ 开放 API 多板块（gelonghui_hot.py）

API 完全开放，用 config source 参数支持多个板块：
```python
source = config.get("source", "hot_article")
if source == "hot_article":
    url = f"https://www.gelonghui.com/api/tags/articles?value={tag}"
elif source == "hot_topic":
    url = "https://www.gelonghui.com/api/hot/topic/list/v1"
```

#### ⭐⭐ 多分类 API（wallstreetcn_articles.py）

同一域名不同参数覆盖多个板块，注意 data_path 差异：
```python
if source == "hot":
    url = "https://api-one.wallstcn.com/apiv1/content/articles/hot?period=day"
    data_path = "day_items"  # 热门用 day_items
else:
    url = f"https://api-one.wallstcn.com/apiv1/content/articles?category={source}"
    data_path = "items"      # 普通分类用 items
```

#### ⭐⭐⭐ 签名 API（cls_depth_api.py）

需要逆向 JS 签名算法，核心是参数排序 → SHA-1 → MD5：
```python
def cls_sign(params):
    sorted_keys = sorted(params.keys(), key=lambda x: x.upper())
    parts = [f"{k}={params[k]}" for k in sorted_keys if params[k] is not None]
    query = "&".join(parts)
    sha1 = hashlib.sha1(query.encode()).hexdigest()
    return hashlib.md5(sha1.encode()).hexdigest()
```

#### ⚠️ ScraperAPI 动态渲染（cls_depth_scraperapi.py）

**已被 cls_depth_api.py 替代。** 仅当确实无法找到直接 API 时使用：
```python
scraperapi_params = {"render": "true", "country_code": "us"}
resp = scraperapi_get(url, use_scraperapi, scraperapi_params=scraperapi_params, timeout=60)
```

前提条件：Admin 后台开启 ScraperAPI + 设置 `SCRAPERAPI_KEY` 环境变量。

#### ⭐ 开放 JSON API 多套接口（eeo_news.py）

经济观察网（eeo.com.cn）在页面 JS 中暴露了完整的 JSON API，完全开放无需认证。
同站有三套 API 模式：首页综合用 `synPage` action，频道用 UUID，快讯用 catid：
```python
if source == "latest":
    url = base + "?app=article&controller=synPage&action=index_news"
    params = {"page": 0, "size": 30}
elif source == "flash":
    url = base + "?app=article&controller=index&action=getMoreArticle"
    params = {"catid": 3690, "page": 1, "pageSize": 20}
elif source in channel_map:
    url = base + "?app=article&controller=index&action=getMoreArticle"
    params = {"uuid": channel_map[source], "page": 1, "pageSize": 20}
```
API 发现方法：在首页 JS 中搜索 `$.getJSON`，找到 `app.eeo.com.cn/?app=article&...` 模式。

#### ⭐ SSR 内嵌 JSON（yicai_news.py）

第一财经（yicai.com）首页 HTML 约 1MB，其中内嵌了 `var headList=[...]` 包含约 300 条完整文章 JSON。
无需额外 API 请求，直接从 HTML 中正则提取 JSON 数组，按 ChannelName 筛选频道：
```python
# 正则匹配内嵌 JSON 变量（兼容 var xxx=[] 和 xxx=[] 两种写法）
pattern = r'(?:var\s+)?headList\s*=\s*\['
m = re.search(pattern, html)
start = html.index('[', m.start())
# 括号匹配提取完整数组
depth = 0
for i in range(start, start + 800000):
    if html[i] == '[': depth += 1
    elif html[i] == ']':
        depth -= 1
        if depth == 0:
            data = json.loads(html[start:i+1])
            break
# 过滤视频 (NewsType=12)，按频道筛选
items = [d for d in data if d["NewsType"] != 12]
if source in channel_map:
    items = [d for d in items if d["ChannelName"] == channel_map[source]]
```
频道映射：A股(54)、产经(57)、科技(58)、金融(53)、大政(49)、全球(52)、海外市场(56)、区域(51)、地产(59)、汽车(201)、此刻(451)、评论(200)、一财号(100000801)。

#### ⭐⭐ SSR HTML + AJAX 分页（nbd_finance.py）

每经网（nbd.com.cn）是传统 Rails 站点，无 JSON API，需直接解析服务端渲染的 HTML。
多频道通过子域名 + column_id 区分，用正则提取 `f-title` 链接和 `f-source` 中的时间/阅读数：
```python
source_map = {
    "finance":    ("finance",  "119"),
    "regulation": ("finance",  "415"),
    "economy":    ("economy",  "129"),
}
subdomain, column_id = source_map[source]
url = f"https://{subdomain}.nbd.com.cn/columns/{column_id}/"

# 正则提取文章
title_pattern = re.compile(
    r'<a\s+href="(https://www\.nbd\.com\.cn/articles/[^"]+)"'
    r'\s+class="f-title"[^>]*>(.*?)</a>', re.DOTALL
)
```
AJAX 分页使用 Rails UJS 模式：`?last_article={id}&version_column=v5`，需设 `X-Requested-With: XMLHttpRequest`。

#### ⭐⭐ SSR HTML + 正则（github_trending.py）

GitHub Trending 页面是纯静态 HTML，无 API。按 `<article class="Box-row">` 分割，
正则提取仓库路径、描述、stars、语言等信息。国内需走代理：
```python
articles = re.findall(r'<article class="Box-row">(.*?)</article>', raw, re.DOTALL)
for art in articles:
    h2 = re.search(r'<h2[^>]*>.*?<a[^>]*href="([^"]+)"', art, re.DOTALL)
```

## 📝 DynamicPyProvider 接口规范

所有脚本必须实现 `fetch(config, context)` 函数：

```python
def fetch(config, context):
    # config: 配置参数（dict）
    # context: 上下文信息（包含 use_scraperapi 等）
    
    return [
        {
            "title": "标题",
            "url": "链接",
            "time": "2026-01-15 10:00",  # 可选
            "rank": 1,                    # 可选
            "published_at": 1705284000    # 可选，Unix时间戳
        }
    ]
```

## 🛠️ 沙箱环境可用模块

以下模块已预导入，可直接使用：
- `requests` - HTTP 请求
- `bs4` (BeautifulSoup) - HTML 解析
- `re` - 正则表达式
- `json` - JSON 处理
- `datetime` - 时间处理
- `time` - 时间工具
- `hashlib` - 哈希计算（签名破解必备）
- `base64` - Base64 编解码

## 💡 常见技巧

### 时间格式转换

```python
import time
time_str = time.strftime("%Y-%m-%d %H:%M", time.localtime(timestamp))
```

### 去重处理

```python
seen = set()
for item in items:
    if item_id in seen:
        continue
    seen.add(item_id)
```

### 错误容错

```python
try:
    resp = requests.get(url, timeout=10)
except Exception as e:
    print(f"Error: {e}")
    return []
```
