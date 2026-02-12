# 微信浏览器返回导航滚动位置恢复

## 问题背景

在移动端微信浏览器中，用户点击新闻链接后按返回键，页面无法恢复到之前的栏目和滚动位置。这是因为微信浏览器不支持 bfcache，返回时会触发完整的页面重载。

## 系统架构

页面包含多种栏目类型，加载机制各不相同：

| 栏目类型 | 示例 | 加载方式 |
|---------|------|---------|
| 普通栏目 | 财经投资、AI等 | 服务端 `/api/news` 返回数据，由 `renderViewerFromData` 渲染 |
| 动态栏目 | 我的关注、新发现、精选公众号 | 切换到对应 tab 后通过独立 API 异步加载 |
| 知识库 | 每日AI早报 | `morning-brief.js` 异步加载，支持无限滚动 |
| 精选博客 | explore | `explore-timeline.js` 异步加载，支持无限滚动 |
| 主题栏目 | topic-xxx | `topic-tracker.js`（独立脚本，未打包）异步加载 |

## 页面重载流程

```
页面加载
  → 各模块 ready() 回调按 index.js 导入顺序执行
  → 动态模块开始异步加载内容
  → init.js ready() 最后执行
    → 检查用户配置
    → 有自定义配置：调用 refreshViewerData() → fetch /api/news → renderViewerFromData() 重建 DOM
    → 无自定义配置：设置 window._trNoRebuildExpected = true，使用服务端渲染的 DOM
```

## 核心问题：竞态条件

动态模块在 `ready()` 阶段就开始加载内容并消费 nav state。随后 `renderViewerFromData()` 重建整个 DOM，内容重新加载但 nav state 已被消费，导致无法恢复滚动位置。

## 解决方案

### 1. 导航状态持久化（scroll.js）

- 使用 localStorage（key: `hotnews_nav_state_v2`）保存导航状态，因为微信浏览器可能在新 webview 中打开链接，sessionStorage 会丢失
- `saveNavigationState()` 在 `visibilitychange`（hidden）和 `beforeunload` 时触发
- 保存内容：`scrollY`、`activeTab`、`anchorPlatformId`（锚点卡片 ID）、`anchorOffsetX`（卡片内偏移）、`gridScrollLeft`（原始像素值）
- `restoreNavGridScroll()` 优先使用锚点卡片定位，回退到像素值

### 2. Generation Counter 模式

每个动态模块维护一个 generation 计数器（初始为 0）：

```javascript
let _exploreGeneration = 0;
```

- `renderViewerFromData` 的 patch hook 中递增 generation
- 模块只在 `generation > 0 || window._trNoRebuildExpected` 时消费 nav state 并恢复滚动
- `generation === 0` 表示初始加载（DOM 可能即将被重建），不应消费 nav state
- `window._trNoRebuildExpected === true` 表示不会调用 `renderViewerFromData`，可以安全消费

### 3. 动态栏目延迟恢复（data.js + init.js）

在 `refreshViewerData()` 和 `init.js` 的无配置路径中，动态栏目不立即消费 nav state：

```javascript
const isDynamicTab = ['my-tags', 'discovery', 'featured-mps', 'knowledge', 'explore'].includes(navActiveTab);
if (isTopicTab || isDynamicTab) {
    // 不消费 nav state，留给对应模块在内容加载完成后处理
}
```

### 4. renderViewerFromData Patch 链

多个模块通过 patch 链包装 `renderViewerFromData`，每个模块在原始函数执行后执行自己的逻辑：

```
调用链：my-tags patch → discovery patch → featured-mps patch → explore-timeline patch → morning-brief patch → 原始 renderViewerFromData
```

每个 patch 在 `orig.call()` 之后：
- 递增 generation 计数器
- 重置模块状态（loaded、loading、offset 等）
- 触发内容重新加载
- 内容加载完成后检查 nav state 并恢复滚动

## 修复的具体问题

### 问题 1：explore 栏目被强制切走

`renderViewerFromData` 中有逻辑阻止 `explore` 成为 active tab：

```javascript
// 修复前
if (activeTabId === 'explore') {
    activeTabId = tabIds.find((id) => id !== 'explore') || activeTabId;
}

// 修复后：仅在非用户指定时切走
if (activeTabId === 'explore' && activeTabId !== preferredActiveTab) {
    activeTabId = tabIds.find((id) => id !== 'explore') || activeTabId;
}
```

### 问题 2：动态卡片缺少 data-platform 属性

`saveNavigationState` 通过 `card.dataset.platform` 记录锚点卡片。以下模块的卡片缺少该属性，导致只能保存原始像素值，无法精确定位：

- 我的关注（my-tags.js）：`data-tag-id` → 增加 `data-platform`
- 新发现（discovery.js）：`data-tag-id` → 增加 `data-platform`
- 精选公众号（featured-mps.js）：`data-mp-fakeid` → 增加 `data-platform`

### 问题 3：无限滚动栏目预加载不足

精选博客和知识库使用无限滚动，初始只加载少量卡片（3-10个）。用户可能滑到了第9个卡片（451-500），但恢复时只有3个卡片，无法滚动到目标位置。

修复：在 `_loadTimeline()` 中根据 nav state 的 anchor 信息计算需要预加载的卡片数：

```javascript
let neededCards = INITIAL_CARDS;
if (_exploreGeneration > 0 || window._trNoRebuildExpected) {
    const navState = TR.scroll?.peekNavigationState?.();
    if (navState?.anchorPlatformId) {
        const m = String(navState.anchorPlatformId).match(/explore-slice-(\d+)/);
        if (m) {
            const anchorIdx = parseInt(m[1], 10);
            neededCards = Math.max(neededCards, anchorIdx + 2);
            neededCards = Math.min(neededCards, MAX_CARDS);
        }
    }
}
const initialLimit = limit * neededCards;
```

### 问题 4：缓存路径跳过滚动恢复

`my-tags.js` 的 `loadMyTags()` 在走缓存路径时直接 return，跳过了底部的滚动恢复代码。修复：在缓存路径中也加入滚动恢复逻辑。

### 问题 5：主题栏目消失

`topic-tracker.js` 中 `loadAndRenderTopicTabs()` 在检查登录状态前未等待 `authState` 初始化完成。`hotnews_session` cookie 是 HttpOnly 的，JS 无法直接读取，必须通过 `authState.init()`（调用 `/api/auth/me`）获取登录状态。

修复：在检查登录前 `await window.authState.init()`。

## 涉及文件

| 文件 | 说明 |
|------|------|
| `web/static/js/src/scroll.js` | 导航状态保存/恢复核心逻辑 |
| `web/static/js/src/data.js` | `renderViewerFromData`、`refreshViewerData`、动态栏目延迟恢复 |
| `web/static/js/src/init.js` | 初始化入口、无配置路径的导航恢复 |
| `web/static/js/src/explore-timeline.js` | 精选博客：generation counter、预加载、滚动恢复 |
| `web/static/js/src/morning-brief.js` | 知识库：generation counter、预加载、滚动恢复 |
| `web/static/js/src/my-tags.js` | 我的关注：generation counter、data-platform、缓存路径滚动恢复 |
| `web/static/js/src/discovery.js` | 新发现：generation counter、data-platform |
| `web/static/js/src/featured-mps.js` | 精选公众号：generation counter、data-platform |
| `web/static/js/topic-tracker.js` | 主题栏目：generation counter、authState 等待（独立脚本，未打包） |

## 构建与部署

```bash
# 构建 JS（从 hotnews/ 目录）
npm run build:js

# 部署
./deploy-fast.sh
```

注意：`topic-tracker.js` 是独立 `<script>` 标签加载的，不经过 esbuild 打包。其他 `src/*.js` 文件通过 esbuild 打包。
