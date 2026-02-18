# DCDN 动态请求费用优化方案

## 问题

阿里云 DCDN 全站加速的动态请求费用过高。动态请求 = CDN 节点无法缓存、需要回源的请求。

## 当前请求分析

### 一、持续轮询请求（最大的费用来源）

每个用户只要打开页面不关闭，就会持续产生以下请求：

| 请求 | 方法 | 频率 | 缓存状态 | 每用户每小时 |
|------|------|------|---------|-------------|
| `/api/online/ping` | POST | 每 15 秒 | POST 不可缓存 | **240 次** |
| `/api/online` | GET | 每 10 秒 | 无缓存头 | **360 次** |
| `/api/comments/batch-counts` | POST | 每 60 秒 | POST 不可缓存 | **60 次** |
| `/api/news/check-updates` | GET | 每 5 分钟 | 无缓存头 | **12 次** |

**合计：每用户每小时 672 次动态请求**

假设平均 5 个用户同时在线、每天在线 12 小时：
- 日均：5 × 672 × 12 = **40,320 次/天**
- 月均：40,320 × 30 = **120.96 万次/月**
- 费用：1,209,600 ÷ 1,000 × 0.01 = **12.1 元/月**（仅轮询）

其中 `/api/online/ping` + `/api/online` 占 89%（每用户每小时 600 次）。

### 二、页面加载请求（一次性）

用户每次打开或刷新页面：

| 请求 | 方法 | 缓存状态 | 说明 |
|------|------|---------|------|
| HTML 页面 `/` | GET | max-age=60 ✅ | 1 分钟后可缓存 |
| 6 个 CSS 文件 | GET | max-age=3600 ✅ | 已缓存 |
| 2 个 JS 文件 | GET | immutable ✅ | 已缓存 |
| `/api/news` | GET | max-age=300 ⚠️ | 有 Vary:Cookie，见下文 |
| `/api/auth/me` | GET | private, no-cache | 必须动态（用户认证） |
| `/api/rss/explore/timeline` | GET | max-age=300 ✅ | 可缓存 |
| `/api/rss/brief/timeline` | GET | max-age=300 ✅ | 可缓存 |
| `/api/discovery/*` | GET | max-age=600 ✅ | 可缓存 |
| `/api/featured-mps/*` | GET | max-age=600 ✅ | 可缓存 |
| `/api/user/preferences/followed-news` | GET | 无缓存头 | 用户数据，应 private |
| `/api/topics` | GET | 无缓存头 | 用户数据，应 private |
| `/api/summary/tags?urls=...` | GET | 无缓存头 | 可缓存 |
| `/api/news/click` | POST | POST 不可缓存 | 用户行为，必须动态 |

每次页面加载约 5-8 个动态请求（不可缓存的）。

### 三、`/api/news` 的 Vary:Cookie 问题

当前设置：`Cache-Control: public, max-age=300` + `Vary: Cookie`

问题：
- `Vary: Cookie` 意味着每个不同 Cookie 的用户是独立缓存条目
- 100 个用户 = CDN 上 100 份缓存，命中率极低
- 而且 `/api/news` 注入了用户个性化数据（标签、订阅、话题），public 缓存有数据串用户风险
- **结论：这个接口不应该用 public 缓存**

## 优化方案

### 第一优先级：降低轮询频率（效果最大，零风险）

| 改动 | 当前 | 建议 | 减少请求 |
|------|------|------|---------|
| `/api/online/ping` 频率 | 15 秒 | 60 秒 | -75% |
| `/api/online` 频率 | 10 秒 | 60 秒 | -83% |
| `/api/comments/batch-counts` 频率 | 60 秒 | 保持 | 0% |
| `/api/news/check-updates` 频率 | 5 分钟 | 保持 | 0% |

改动后每用户每小时：240→60 + 360→60 + 60 + 12 = **192 次**（减少 71%）

体验影响：在线人数更新从 10 秒延迟变为 60 秒延迟，用户几乎无感知。

### 第二优先级：给 GET 轮询加短缓存

| 改动 | 缓存时间 | 效果 |
|------|---------|------|
| `/api/online` | `public, max-age=10, s-maxage=10` | 10 秒内多用户共享，减少 ~80% 回源 |
| `/api/news/check-updates` | `public, max-age=60, s-maxage=60` | 1 分钟内共享 |
| `/api/summary/tags` | `public, max-age=600, s-maxage=600` | 标签数据变化慢 |

### 第三优先级：修正 `/api/news` 缓存策略

当前 `public + Vary:Cookie` 既不安全又没效果，改为：
```
/api/news → private, no-cache（包含用户个性化数据，不应 CDN 缓存）
```

这不会增加费用（因为 Vary:Cookie 本来命中率就极低），但消除了数据串用户的风险。

### 第四优先级：补全遗漏路径的缓存头

| 路径 | 建议 |
|------|------|
| `/api/user/*` | `private, no-cache`（用户数据） |
| `/api/topics` | `private, no-cache`（用户数据） |
| `/api/wechat/*` | `private, no-cache`（用户数据） |
| `/api/comments` GET | `public, max-age=60`（评论数据） |
| `/api/nba-today` | `public, max-age=300`（体育数据） |
| `/api/categories` | `public, max-age=300`（分类元数据） |
| `/api/rss-sources/*` | `public, max-age=300`（源列表） |
| `/api/news/page` | `public, max-age=120`（分页数据，无用户数据） |

标记 `private` 的路径虽然仍是动态请求，但明确告诉 CDN 不要缓存，避免意外行为。

### 不建议做的事

- **不要**给 POST 请求加缓存（HTTP 规范不允许）
- **不要**给包含用户数据的接口用 `public` 缓存
- **不要**用 `Vary: Cookie` 来区分用户缓存（命中率极低，等于没缓存）

## 预期效果

### 轮询优化（第一 + 第二优先级）

| 场景 | 优化前 | 优化后 | 减少 |
|------|--------|--------|------|
| 每用户每小时轮询 | 672 次 | ~120 次 | 82% |
| 5 用户 × 12 小时/天 | 40,320 次/天 | ~7,200 次/天 | 82% |
| 月度轮询请求 | 120.96 万次 | ~21.6 万次 | 82% |
| 月度轮询费用 | 12.1 元 | 2.2 元 | 82% |

### 整体效果

轮询是动态请求的主要来源。页面加载请求（已有缓存的接口）影响较小。
整体动态请求预计减少 60-70%。

## 实施顺序

1. 修改 `online.js`：ping 和 stats 频率从 15s/10s 改为 60s/60s
2. 修改 `server.py` 缓存中间件：修正 `/api/news`，补全遗漏路径
3. 构建部署，观察 DCDN 控制台动态请求数变化
4. 根据实际数据微调

## 附注：cache_stats_routes.py 是死代码

`record_cache_access()` 函数从未被调用，`/api/cache/stats` 永远返回空数据。
建议删除此文件，或者在中间件中实际调用它。
