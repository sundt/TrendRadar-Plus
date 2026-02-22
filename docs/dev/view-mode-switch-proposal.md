# 栏目视图模式切换 - 设计方案

> 日期: 2026-02-22

## 需求

用户可以为每个栏目独立设置视图模式：
- **时间线模式 (timeline)**: 所有文章按时间倒序排列，每卡片50条，横向滚动无限加载（1-50, 51-100, 101-150...）
- **卡片模式 (card)**: 每个数据源一张卡片，各自展示最新内容（现有默认模式）

## 现状

| 栏目 | 当前模式 | 备注 |
|------|---------|------|
| 每日AI早报 (knowledge) | 时间线 | morning-brief.js 独立实现 |
| 精选公众号 (featured-mps) | 时间线 | featured-mps.js |
| 财经投资 (finance) | 时间线 | finance-timeline.js |
| 主题 (topic-*) | 卡片 | topic-tracker.js |
| 我的关注 (my-tags) | 卡片 | my-tags.js |
| 新发现 (discovery) | 卡片 | discovery.js |
| 探索 (explore) | 特殊 | explore-timeline.js |
| 普通分类 (tech_news, ainews 等) | 卡片 | SSR + infinite-scroll.js |

## 设计方案

### 1. 存储

```
localStorage key: hotnews_view_mode_v1
value: JSON object { "tech_news": "timeline", "ainews": "card", ... }
```

未设置的栏目使用默认值：
- `explore`, `featured-mps`, `finance` → 默认 `timeline`（保持现状），可切换为 `card`
- `my-tags` → 默认 `card`，可切换为 `timeline`
- `topic-*` → 默认 `card`，可切换为 `timeline`
- 普通分类 (tech_news, ainews, social, general 等) → 默认 `card`，可切换为 `timeline`

### 2. UI - 栏目 Tab 右键菜单

在现有的栏目 tab 右键菜单（`category-tab-reorder.js` 中的 `_showCategoryContextMenu`）中增加视图模式切换选项：

```
右键点击普通栏目 tab（当前卡片模式）：
┌──────────────────────┐
│ 📋 切换为时间线模式   │   ← 新增
│ ──────────────────── │
│ 👁️‍🗨️ 隐藏栏目        │
│ ⚙️ 栏目设置          │
└──────────────────────┘

右键点击普通栏目 tab（当前时间线模式）：
┌──────────────────────┐
│ 🗂️ 切换为卡片模式    │   ← 新增
│ ──────────────────── │
│ 👁️‍🗨️ 隐藏栏目        │
│ ⚙️ 栏目设置          │
└──────────────────────┘

右键点击主题 tab（当前卡片模式）：
┌──────────────────────┐
│ 📋 切换为时间线模式   │   ← 新增
│ ──────────────────── │
│ 🔄 刷新              │
│ ⚙️ 编辑主题          │
│ 🗑️ 删除主题          │
└──────────────────────┘
```

不可切换的栏目（knowledge, discovery, rsscol-rss）不显示此选项。

交互：点击后立即切换，无需确认。切换结果存入 localStorage。

### 3. 前端模块

#### 3a. 新建 `view-mode.js` — 通用视图模式管理

职责：
- 读写 localStorage 中的视图模式偏好
- 渲染切换按钮 UI
- 切换时触发 `events.emit('viewMode:changed', { categoryId, mode })`
- 提供 `getViewMode(categoryId)` API

```js
// 核心 API
export const viewMode = {
  get(categoryId): 'timeline' | 'card',
  set(categoryId, mode): void,
  isFixed(categoryId): boolean,   // explore/my-tags/discovery 等不可切换
  renderToggle(categoryId, container): void,
};
```

#### 3b. 新建 `category-timeline.js` — 通用分类时间线渲染器

将 `featured-mps.js` 和 `finance-timeline.js` 中重复的时间线逻辑抽成通用模块：

```js
// 核心 API
export function createTimelineRenderer(config) {
  // config: { categoryId, apiUrl, getPane, itemsPerCard, maxCards }
  return {
    load(force): Promise<void>,
    resetState(): void,
    getStatus(): object,
  };
}
```

普通分类的时间线 API URL 统一为: `GET /api/rss/category/{category_id}/timeline?limit=50&offset=0`

#### 3c. 修改 `tabs.js` — switchTab 中集成视图模式

```js
// switchTab 中增加逻辑：
const mode = viewMode.get(categoryId);
if (mode === 'timeline') {
  // 使用 category-timeline 渲染器
} else {
  // 使用现有卡片模式逻辑
}
```

### 4. 后端 API

新增一个通用的分类时间线端点：

```
GET /api/rss/category/{category_id}/timeline?limit=50&offset=0
```

逻辑：
- 查询 `rss_entries` JOIN `rss_sources` WHERE `s.category = :category_id`
- 按 `published_at DESC` 排序
- 去重（URL + 标题）
- 返回格式与现有 featured-mps/finance timeline 一致

`featured-mps` 和 `finance` 保留各自的专用端点（有特殊过滤逻辑），其他普通分类走通用端点。

### 5. 实现步骤

| 步骤 | 内容 | 文件 |
|------|------|------|
| 1 | 后端：通用分类时间线 API | `category_timeline_routes.py` |
| 2 | 前端：`view-mode.js` 视图模式管理 + UI | 新建 |
| 3 | 前端：`category-timeline.js` 通用时间线渲染器 | 新建 |
| 4 | 前端：重构 `featured-mps.js` 和 `finance-timeline.js` 使用通用渲染器 | 修改 |
| 5 | 前端：`tabs.js` 集成视图模式切换 | 修改 |
| 6 | CSS：切换按钮样式 | `viewer.css` |
| 7 | 构建 + 部署 + 测试 | - |

### 6. 不可切换的栏目

以下栏目固定模式，不显示切换按钮：
- `knowledge` — 每日AI早报，AI 筛选+排序的精选内容，时间线是最合理的展示方式
- `discovery` — 新发现，算法推荐内容，没有"按源分组"的概念
- `rsscol-rss` — 精选博客，RSS 阅读器模式，有独立交互

### 8. 附带优化：主题卡片右键菜单

将"🗑️ 删除主题"从卡片标题右键菜单中移除，只保留在栏目 tab 右键菜单中。

卡片标题右键菜单（修改后）：
```
关键词卡片：
┌──────────────────────┐
│ 🗑️ 删除此关键词      │
│ ✏️ 编辑主题          │
└──────────────────────┘

数据源卡片：
┌──────────────────────┐
│ 🗑️ 删除此数据源      │
│ ✏️ 编辑主题          │
└──────────────────────┘
```

理由：删除整个主题是重操作，放在栏目级别更安全，避免误触。

### 9. 数据流

```
用户右键栏目 tab → 点击"切换为时间线模式"
  → viewMode.set(categoryId, 'timeline')
  → localStorage 持久化
  → events.emit('viewMode:changed')
  → 清空当前 pane 内容
  → 根据新模式重新渲染：
      timeline → categoryTimeline.load(categoryId)
      card → 恢复 SSR 卡片 或 触发 infiniteScroll 加载
```