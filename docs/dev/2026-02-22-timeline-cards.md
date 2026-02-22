# 精选公众号 & 财经投资 时间线卡片改造

> 日期：2026-02-22
> 目标：将「精选公众号」和「财经投资」两个栏目从原来的每个数据源一张卡片，改为跟「每日AI早报」一样的时间线模式（每卡片50条，1-50、51-100、101-150 横向滚动无限加载）

## 一、新增后端 API

### 文件：`hotnews/web/category_timeline_routes.py`（新建）

#### `GET /api/rss/featured-mps/timeline`
- 精选公众号时间线，所有 admin 添加的精选公众号文章按发布时间倒序
- 数据来源：`rss_entries` 表 JOIN `featured_wechat_mps`（`source IS NULL OR source = 'admin'`）
- 支持 `limit` / `offset` 分页

#### `GET /api/rss/finance/timeline`
- 财经投资时间线，finance 分类下所有数据源文章按发布时间倒序
- 加入了财经内容过滤（类似每日AI早报的标签过滤）：
  - 被 AI 标为 exclude 且无财经标签 → 过滤掉
  - 被 AI 标为 include 但既无财经标签也不是 finance/business 类别 → 过滤掉
  - 未被 AI 标注的文章 → 保留（来源本身是财经源）
- 财经标签白名单：`finance, stock, macro, crypto, real_estate, ecommerce, startup, business, commodity, ipo, gold_price, insurance, banking`
- 当前过滤效果：过滤掉约 14%（336/2356）非财经内容（娱乐、体育、政治等）

### 路由注册：`hotnews/web/server.py`
- 导入并注册 `category_timeline_routes.router`
- 添加 Cache-Control：finance 5分钟，featured-mps 10分钟

## 二、前端改造

### `hotnews/web/static/js/src/featured-mps.js`（重写）
- 从原来的「每个公众号一张卡片」改为时间线模式
- 调用 `/api/rss/featured-mps/timeline` 获取数据
- 每卡片50条，IntersectionObserver 无限滚动加载，最多20张卡片
- 卡片标题格式：`📱 最新 1-50`

### `hotnews/web/static/js/src/finance-timeline.js`（新建）
- 财经投资时间线模块，模式与精选公众号完全一致
- 调用 `/api/rss/finance/timeline` 获取数据
- 卡片标题格式：`💰 最新 1-50`

### `hotnews/web/static/js/src/index.js`
- 新增 `import './finance-timeline.js'`

### `hotnews/web/static/js/src/tabs.js`
- `_cleanupInactiveTabs` 跳过列表新增 `finance`

## 三、模板 & 配置改动

### `hotnews/web/templates/viewer.html`
- `special_cats` 新增 `finance`
- 新增 `finance` 专用 pane：`<div class="platform-grid" id="financeGrid"></div>`

### `hotnews/web/page_rendering.py`
- `PROTECTED_CATEGORIES` 新增 `finance`（不被服务端过滤）

### `hotnews/web/server.py`
- `_DEDICATED_TAB_IDS` 新增 `finance`（不通过 /api/news 加载平台数据）

## 四、数据配置

### AI 分类白名单更新
- 在服务器 `admin_kv.morning_brief_rules_v1` 中将 `finance` 加入 `category_whitelist`
- 当前白名单：`explore, tech_news, ainews, developer, finance`
- 未加入：`user`（用户自定义）、`social`（游戏媒体为主）、`general`（综合新闻）— 暂不需要

## 五、部署记录

- 3 次部署，均通过 health check
- `deploy: 2026-02-22 21:39:55` — 初始版本（前后端 + 路由注册）
- `deploy: 2026-02-22 21:47:01` — 财经过滤逻辑 + finance 加入 AI 白名单
- `deploy: 2026-02-22 21:50:27` — 修复精选公众号数据源（从 wechat_mp_articles 改为 rss_entries + featured_wechat_mps admin 过滤）
