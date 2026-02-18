# DCDN 动态请求优化方案

## 问题

API 接口没有 `Cache-Control` 头，CDN 每次都回源，产生大量动态请求费用。

```
优化前：用户请求 → CDN → 无缓存头 → 回源 → 动态请求 +1（每次都收费）
优化后：用户请求 → CDN → 有缓存头 → 命中缓存 → 直接返回（不收费）
```

## 优化前状态

```python
# server.py - 只有静态资源有缓存头
@app.middleware("http")
async def add_cache_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/"):
        response.headers["Cache-Control"] = "public, max-age=3600"
    # API 接口没有缓存头 → CDN 每次回源
    return response
```

## 缓存策略

| API 路径 | 缓存时间 | 说明 | 预期命中率 |
|---------|---------|------|-----------|
| `/api/news` | 5 分钟 | 新闻数据 | 85% |
| `/api/rss/brief/timeline` | 5 分钟 | 早报时间线 | 85% |
| `/api/rss/explore/timeline` | 5 分钟 | 精选博客时间线 | 85% |
| `/api/category/*` | 15 分钟 | 分类数据 | 90% |
| `/api/rss/proxy` | 30 分钟 | RSS 代理 | 95% |
| `/api/search` | 2 分钟 | 搜索结果 | 70% |
| `/api/discovery/*` | 10 分钟 | 发现页 | 85% |
| `/api/featured-mps/*` | 10 分钟 | 精选公众号 | 85% |
| `/api/me/*`, `/api/auth/*` | 不缓存 | 用户私有数据 | - |
| `/api/admin/*` | 不缓存 | 管理后台 | - |
| HTML 页面 | 1 分钟 | 页面内容 | 60% |

## 优化后代码

```python
@app.middleware("http")
async def add_cache_headers(request, call_next):
    response = await call_next(request)
    path = request.url.path

    # 静态资源
    if path.startswith("/static/"):
        if "?v=" in str(request.url):
            response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
        else:
            response.headers["Cache-Control"] = "public, max-age=3600"
        return response

    # 新闻数据 API - 5分钟
    if path in ["/api/news", "/api/rss/brief/timeline", "/api/rss/explore/timeline"]:
        response.headers["Cache-Control"] = "public, max-age=300, s-maxage=300"
        response.headers["Vary"] = "Cookie"
        return response

    # 分类数据 - 15分钟
    if path.startswith("/api/category/"):
        response.headers["Cache-Control"] = "public, max-age=900, s-maxage=900"
        return response

    # RSS 代理 - 30分钟
    if path.startswith("/api/rss/proxy"):
        response.headers["Cache-Control"] = "public, max-age=1800, s-maxage=1800"
        return response

    # 搜索 - 2分钟
    if path.startswith("/api/search"):
        response.headers["Cache-Control"] = "public, max-age=120, s-maxage=120"
        response.headers["Vary"] = "Cookie"
        return response

    # 发现页/精选公众号 - 10分钟
    if path.startswith("/api/discovery/") or path.startswith("/api/featured-mps/"):
        response.headers["Cache-Control"] = "public, max-age=600, s-maxage=600"
        return response

    # 用户数据 - 不缓存
    if path.startswith("/api/me/") or path.startswith("/api/auth/"):
        response.headers["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        return response

    # 管理后台 - 不缓存
    if path.startswith("/api/admin/"):
        response.headers["Cache-Control"] = "private, no-cache, no-store, must-revalidate"
        return response

    # HTML 页面 - 1分钟
    if response.headers.get("content-type", "").startswith("text/html"):
        response.headers["Cache-Control"] = "public, max-age=60, s-maxage=60"
        return response

    return response
```

## Cache-Control 参数速查

| 参数 | 说明 |
|------|------|
| `public` | 允许 CDN 和浏览器缓存 |
| `private` | 只允许浏览器缓存 |
| `max-age=N` | 浏览器缓存 N 秒 |
| `s-maxage=N` | CDN 缓存 N 秒（优先于 max-age） |
| `no-cache` | 每次使用前必须验证 |
| `no-store` | 完全不缓存 |
| `immutable` | 内容永不变，不需重新验证 |

## 费用对比

以日均 10 万 PV、API 请求占 60% 为例：

| 项目 | 优化前 | 优化后 | 节省 |
|------|--------|--------|------|
| 日均动态请求 | 60,000 | ~18,000 | 42,000 |
| 月度费用 | 18 元 | 5.4 元 | 12.6 元 (70%) |

## 验证

```bash
# 测试缓存头
curl -I http://localhost:8090/api/news
# 应看到: Cache-Control: public, max-age=300, s-maxage=300

# 确认用户数据不缓存
curl -I http://localhost:8090/api/me/profile
# 应看到: Cache-Control: private, no-cache, no-store, must-revalidate

# 缓存统计
curl http://localhost:8090/api/cache/stats

# 自动化测试
python3 scripts/test_cache_headers.py http://localhost:8090
```

## 阿里云 DCDN 控制台配置

代码层面设置缓存头后，还需在 CDN 控制台配置对应规则：

| 路径 | 缓存时间 | 是否缓存 |
|------|---------|---------|
| `/static/*` | 1 小时 | 是 |
| `/api/news` | 5 分钟 | 是 |
| `/api/rss/proxy` | 30 分钟 | 是 |
| `/api/me/*` | 0 | 否 |
| `/api/admin/*` | 0 | 否 |

建议同时开启 Gzip/Brotli 压缩和 HTTP/2。

## 修改的文件

- `hotnews/web/server.py` — 修改 `add_cache_headers` 中间件
- `hotnews/web/cache_stats_routes.py` — 新增缓存统计 API
- `scripts/test_cache_headers.py` — 测试脚本
- `scripts/check_traffic.sh` — 流量监控脚本
