# 参考文件清单

## 推荐参考：we-mp-rss（开源完整方案）

we-mp-rss 是目前最完善的开源微信公众号 RSS 订阅方案，支持全文抓取、多种 RSS 格式、Web 管理界面。

### 1. 核心模块

| 文件 | 说明 | 参考要点 |
|------|------|----------|
| `we-mp-rss/core/wx/wx.py` | 微信 API 调用 | 搜索公众号、获取文章列表 |
| `we-mp-rss/core/wx/base.py` | 采集基类 | 内容抓取、反爬处理、Cookie 管理 |
| `we-mp-rss/core/rss.py` | RSS 生成 | RSS/Atom/JSON 格式生成 |
| `we-mp-rss/apis/rss.py` | RSS API 接口 | 订阅地址、缓存机制 |

### 2. 关键代码片段

**搜索公众号：**
```python
# we-mp-rss/core/wx/base.py
def search_Biz(self, kw: str = "", limit=10, offset=0):
    url = "https://mp.weixin.qq.com/cgi-bin/searchbiz"
    params = {
        "action": "search_biz",
        "begin": offset,
        "count": limit,
        "query": kw,
        "token": self.token,
        "lang": "zh_CN",
        "f": "json",
        "ajax": "1"
    }
    headers = self.fix_header(url)
    response = requests.get(url, params=params, headers=headers)
    msg = response.json()
    
    if msg['base_resp']['ret'] == 200013:
        self.Error("频率限制")
    if msg['base_resp']['ret'] != 0:
        self.Error("Invalid Session")
    return msg
```

**获取文章列表：**
```python
# we-mp-rss/core/wx/wx.py
def get_Articles(faker_id: str):
    url = "https://mp.weixin.qq.com/cgi-bin/appmsgpublish"
    params = {
        "sub": "list",
        "sub_action": "list_ex",
        "begin": 0,
        "count": cfg.get("count"),
        "fakeid": faker_id,
        "token": wx_cfg.get("token"),
        "lang": "zh_CN",
        "f": "json",
        "ajax": 1
    }
    headers = {
        "Cookie": wx_cfg.get("cookie"),
        "User-Agent": wx_cfg.get("user_agent")
    }
    response = requests.get(url, params=params, headers=headers)
    data = response.json()
    data['publish_page'] = json.loads(data['publish_page'])
    return data
```

**内容抓取（全文）：**
```python
# we-mp-rss/core/wx/wx.py
def content_extract(url):
    """提取文章全文内容"""
    r = requests.get(url, headers=headers)
    if r.status_code == 200:
        soup = BeautifulSoup(r.text, 'html.parser')
        js_content_div = soup.find('div', {'id': 'js_content'})
        # 移除 visibility: hidden
        js_content_div.attrs.pop('style', None)
        # 处理图片 data-src -> src
        for img_tag in js_content_div.find_all('img'):
            if 'data-src' in img_tag.attrs:
                img_tag['src'] = img_tag['data-src']
                del img_tag['data-src']
        return js_content_div.prettify()
```

**RSS 生成：**
```python
# we-mp-rss/core/rss.py
def generate_rss(self, rss_list, title, link, description, language="zh-CN"):
    rss = ET.Element("rss", version="2.0")
    rss.attrib["xmlns:content"] = "http://purl.org/rss/1.0/modules/content/"
    channel = ET.SubElement(rss, "channel")
    ET.SubElement(channel, "title").text = title
    ET.SubElement(channel, "link").text = link
    
    for rss_item in rss_list:
        item = ET.SubElement(channel, "item")
        ET.SubElement(item, "title").text = rss_item["title"]
        ET.SubElement(item, "link").text = rss_item["link"]
        ET.SubElement(item, "pubDate").text = self.datetime_to_rfc822(rss_item["updated"])
        # 全文内容
        ET.SubElement(item, "content:encoded").text = rss_item['content']
    
    return ET.tostring(rss, encoding="utf-8").decode("utf-8")
```

### 3. RSS 接口设计

```python
# we-mp-rss/apis/rss.py

# 获取单个公众号的 RSS
@feed_router.get("/{feed_id}.{ext}")
async def rss(feed_id: str, ext: str, limit: int = 50):
    # ext 支持: xml, atom, json, md
    return await get_mp_articles_source(feed_id=feed_id, ext=ext, limit=limit)

# 获取所有订阅的 RSS
@router.get("")
async def get_rss_feeds(limit: int = 10, offset: int = 0):
    # 返回所有订阅公众号的聚合 RSS
    pass

# 按标签获取 RSS
@feed_router.get("/tag/{tag_id}.{ext}")
async def rss_by_tag(tag_id: str, ext: str):
    # 返回指定标签下所有公众号的聚合 RSS
    pass
```

### 4. 配置参考

```yaml
# we-mp-rss config.yaml
RSS_FULL_CONTEXT: True      # 是否显示全文
RSS_ADD_COVER: True         # 是否添加封面图片
RSS_PAGE_SIZE: 30           # RSS 分页大小
RSS_CDATA: False            # 是否启用 CDATA
GATHER.CONTENT: True        # 是否采集内容
GATHER.MODEL: app           # 采集模式 (app/web)
SPAN_INTERVAL: 10           # 定时任务间隔（秒）
MAX_PAGE: 5                 # 最大采集页数
```

---

## 核心参考：wechat-article-exporter

这是功能最完整的微信公众号文章导出工具，主要参考其 API 调用逻辑。

### 1. 微信 API 调用

| 文件 | 说明 | 参考要点 |
|------|------|----------|
| `wechat-article-exporter/server/api/web/mp/searchbiz.get.ts` | 搜索公众号 | 请求参数、响应解析 |
| `wechat-article-exporter/server/api/web/mp/appmsgpublish.get.ts` | 获取文章列表 | 请求参数、分页逻辑 |
| `wechat-article-exporter/apis/index.ts` | 前端 API 封装 | 错误处理、session 过期检测 |

### 2. 认证管理

| 文件 | 说明 | 参考要点 |
|------|------|----------|
| `wechat-article-exporter/server/utils/CookieStore.ts` | Cookie 存储管理 | Cookie 解析、过期检测 |
| `wechat-article-exporter/server/utils/proxy-request.ts` | 代理请求封装 | 请求头设置、响应处理 |
| `wechat-article-exporter/server/api/web/login/bizlogin.post.ts` | 登录流程 | Token 提取逻辑 |

### 3. 关键代码片段

**搜索公众号请求参数：**
```typescript
// searchbiz.get.ts
const params = {
  action: 'search_biz',
  begin: begin,
  count: size,
  query: keyword,
  token: token,
  lang: 'zh_CN',
  f: 'json',
  ajax: '1',
};
// endpoint: https://mp.weixin.qq.com/cgi-bin/searchbiz
```

**获取文章列表请求参数：**
```typescript
// appmsgpublish.get.ts
const params = {
  sub: isSearching ? 'search' : 'list',
  search_field: isSearching ? '7' : 'null',
  begin: begin,
  count: size,
  query: keyword,
  fakeid: id,
  type: '101_1',
  free_publish_type: 1,
  sub_action: 'list_ex',
  token: token,
  lang: 'zh_CN',
  f: 'json',
  ajax: 1,
};
// endpoint: https://mp.weixin.qq.com/cgi-bin/appmsgpublish
```

**请求头设置：**
```typescript
// proxy-request.ts
const headers = new Headers({
  Referer: 'https://mp.weixin.qq.com/',
  Origin: 'https://mp.weixin.qq.com',
  'User-Agent': USER_AGENT,
  'Accept-Encoding': 'identity',
});
headers.set('Cookie', cookie);
```

---

## 简化参考：wechat-crawler

这是一个精简的 Python 实现，代码量少，适合快速理解核心逻辑。

| 文件 | 说明 |
|------|------|
| `wechat-crawler/wechat_crawler.py` | 完整的 Python 实现（~300行） |

### 关键代码

```python
class WeChatCrawler:
    def __init__(self, cookie: str, token: str):
        self.cookie = cookie
        self.token = token
        self.headers = {
            "Cookie": cookie,
            "User-Agent": "Mozilla/5.0 ..."
        }
    
    def search_mp(self, keyword: str, limit: int = 10) -> list:
        url = "https://mp.weixin.qq.com/cgi-bin/searchbiz"
        params = {
            "action": "search_biz",
            "query": keyword,
            "count": limit,
            "token": self.token,
            "lang": "zh_CN",
            "f": "json",
            "ajax": "1"
        }
        resp = requests.get(url, params=params, headers=self.headers)
        data = resp.json()
        
        ret = data.get("base_resp", {}).get("ret", -1)
        if ret == 200003:
            raise Exception("Cookie/Token 已过期")
        if ret != 0:
            raise Exception(f"搜索失败: {data.get('base_resp', {}).get('err_msg')}")
        
        return data.get("list", [])
    
    def get_articles(self, faker_id: str, count: int = 20) -> list:
        url = "https://mp.weixin.qq.com/cgi-bin/appmsgpublish"
        params = {
            "sub": "list",
            "sub_action": "list_ex",
            "begin": 0,
            "count": count,
            "fakeid": faker_id,
            "token": self.token,
            "lang": "zh_CN",
            "f": "json",
            "ajax": 1
        }
        resp = requests.get(url, params=params, headers=self.headers)
        data = resp.json()
        
        # 解析 publish_page -> publish_list -> publish_info -> appmsgex
        articles = []
        publish_page = json.loads(data.get("publish_page", "{}"))
        for item in publish_page.get("publish_list", []):
            publish_info = json.loads(item.get("publish_info", "{}"))
            for art in publish_info.get("appmsgex", []):
                articles.append({
                    "title": art.get("title"),
                    "url": art.get("link"),
                    "publish_time": art.get("update_time"),
                })
        return articles
```

---

## Hotnews 现有架构参考

### 1. Provider 架构

| 文件 | 说明 |
|------|------|
| `hotnews/kernel/providers/` | Provider 目录结构 |
| `hotnews/kernel/providers/runner.py` | Provider 运行器 |

### 2. 自定义源管理

| 文件 | 说明 |
|------|------|
| `hotnews/kernel/admin/custom_source_admin.py` | 自定义源 CRUD API |
| `hotnews/web/db_online.py` | 数据库连接管理 |

### 3. 订阅功能 UI

| 文件 | 说明 |
|------|------|
| `hotnews/openspec/changes/add-rss-subscription-tab/proposal.md` | RSS 订阅 UI 设计参考 |
| `hotnews/web/static/js/src/` | 前端 JS 结构 |
| `hotnews/web/templates/` | 页面模板 |

### 4. 用户认证

| 文件 | 说明 |
|------|------|
| `hotnews/kernel/auth/` | 用户认证模块 |
| `hotnews/web/user_db.py` | 用户数据库操作 |

---

## 响应数据结构

### 搜索公众号响应

```json
{
  "base_resp": { "ret": 0, "err_msg": "ok" },
  "total": 5,
  "list": [
    {
      "fakeid": "MzI2NDk5NzA0Mw==",
      "nickname": "36氪",
      "round_head_img": "https://...",
      "signature": "36氪是中国领先的科技新媒体...",
      "service_type": 0
    }
  ]
}
```

### 获取文章列表响应

```json
{
  "base_resp": { "ret": 0, "err_msg": "ok" },
  "publish_page": "{\"publish_list\":[...],\"total_count\":1234}"
}
```

**publish_page 解析后：**
```json
{
  "publish_list": [
    {
      "publish_info": "{\"appmsgex\":[...]}"
    }
  ],
  "total_count": 1234
}
```

**appmsgex 结构：**
```json
{
  "aid": "2651234567_1",
  "title": "文章标题",
  "link": "https://mp.weixin.qq.com/s?__biz=...",
  "digest": "文章摘要...",
  "cover": "https://mmbiz.qpic.cn/...",
  "update_time": 1737360000,
  "create_time": 1737350000,
  "author_name": "作者名"
}
```

---

## 错误码

| 错误码 | 含义 | 处理方式 |
|--------|------|----------|
| 0 | 成功 | - |
| 200003 | Cookie/Token 过期 | 提示用户重新认证 |
| 200013 | 请求过于频繁 | 等待后重试 |
| -1 | 其他错误 | 显示错误信息 |
