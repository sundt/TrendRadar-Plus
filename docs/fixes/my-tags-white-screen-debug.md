# "我的标签"白屏问题调试指南

## 问题描述

用户报告"我的标签"栏目有时会显示白屏，什么都不显示。

## 问题分析

### 加载机制对比

我们对比了三个动态加载栏目的实现：

| 栏目 | API 端点 | 加载策略 | 滚动机制 |
|------|---------|---------|---------|
| 每日AI早报 (knowledge) | `/api/rss/brief/timeline` | 初始加载10卡片(500条)，无限滚动 | 垂直滚动 + IntersectionObserver |
| 深入探索 (explore) | `/api/rss-sources/explore-cards` | 初始加载6卡片，横向滚动加载更多 | 横向滚动 + scroll事件 |
| 我的标签 (my-tags) | `/api/user/preferences/followed-news` | 一次性加载50条，前端+后端双层缓存 | 无滚动加载 |

### 可能的原因

1. **API 返回空数据**
   - 用户未关注任何标签
   - 关注的标签没有匹配的新闻
   - 后端查询出错

2. **JavaScript 错误**
   - 渲染逻辑中的异常
   - 日期格式化错误
   - DOM 操作失败

3. **CSS 显示问题**
   - 内容被隐藏
   - z-index 层级问题
   - 容器高度为0

4. **缓存问题**
   - localStorage 缓存损坏
   - 后端缓存返回错误数据

5. **认证问题**
   - 用户登录状态失效
   - API 返回 401 但前端未正确处理

## 已实施的修复

### 1. 增强日志输出

在 `my-tags.js` 的关键函数中添加了详细的 console.log：

```javascript
// loadMyTags() 函数
console.log('[MyTags] loadMyTags called, force:', force);
console.log('[MyTags] Container found, starting load...');
console.log('[MyTags] Checking auth...');
console.log('[MyTags] User authenticated:', user);
console.log('[MyTags] API response:', result);
console.log('[MyTags] Got tags from API:', tags.length, 'tags');
console.log('[MyTags] Rendering tags...');
console.log('[MyTags] Load complete!');

// renderTagsNews() 函数
console.log('[MyTags] renderTagsNews called, container:', container, 'tagsData:', tagsData);
console.log('[MyTags] Rendering', tagsData.length, 'tags');
console.log('[MyTags] Generated HTML length:', cardsHtml.length);
console.log('[MyTags] HTML inserted into container');
```

### 2. 错误处理改进

- 在每个关键步骤添加了错误日志
- 改进了空状态和错误状态的渲染
- 添加了重试按钮

## 调试步骤

### 1. 打开浏览器开发者工具

1. 访问网站
2. 按 F12 或右键 → 检查
3. 切换到 Console 标签

### 2. 切换到"我的标签"栏目

点击"我的标签"标签，观察控制台输出：

**正常情况应该看到：**
```
[MyTags] Module initialized
[MyTags] loadMyTags called, force: false, loading: false, loaded: false
[MyTags] Container found, starting load...
[MyTags] Checking auth...
[MyTags] User authenticated: {username: "xxx", ...}
[MyTags] Fetching followed news from API...
[MyTags] API response: {ok: true, tags: [...], cached: false}
[MyTags] Got tags from API: 3 tags
[MyTags] Loaded fresh data from database
[MyTags] Rendering tags...
[MyTags] renderTagsNews called, container: div#myTagsGrid, tagsData: [...]
[MyTags] Rendering 3 tags
[MyTags] Generated HTML length: 12345
[MyTags] HTML inserted into container
[MyTags] Load complete!
```

**如果看到错误：**

#### 错误1: Container not found
```
[MyTags] Container #myTagsGrid not found!
```
**原因**: HTML 模板中缺少容器元素
**解决**: 检查 `viewer.html` 中是否有 `<div id="myTagsGrid">`

#### 错误2: User not authenticated
```
[MyTags] User not authenticated
```
**原因**: 用户未登录或登录已过期
**解决**: 重新登录

#### 错误3: API error
```
[MyTags] API returned error: xxx
```
**原因**: 后端 API 出错
**解决**: 检查后端日志，查看 `/api/user/preferences/followed-news` 端点

#### 错误4: No tags
```
[MyTags] Got tags from API: 0 tags
[MyTags] No tags data, showing empty state
```
**原因**: 用户未关注任何标签，或关注的标签没有新闻
**解决**: 这是正常情况，应该显示空状态提示

### 3. 检查网络请求

1. 切换到 Network 标签
2. 刷新页面或切换到"我的标签"
3. 查找 `followed-news` 请求
4. 检查：
   - Status Code (应该是 200)
   - Response (查看返回的数据)
   - Timing (查看请求耗时)

### 4. 检查 DOM 结构

1. 切换到 Elements 标签
2. 找到 `<div id="myTagsGrid">`
3. 检查：
   - 是否有子元素
   - 子元素的样式是否正确
   - 是否有 `display: none` 等隐藏样式

### 5. 检查缓存

在 Console 中执行：

```javascript
// 查看前端缓存
localStorage.getItem('hotnews_my_tags_cache')

// 清除前端缓存
localStorage.removeItem('hotnews_my_tags_cache')

// 强制重新加载
window.HotNews.myTags.load(true)
```

## 常见问题解决方案

### 问题1: 白屏但控制台无错误

**可能原因**: CSS 问题或内容被隐藏

**解决方案**:
1. 检查 `#myTagsGrid` 的样式
2. 检查是否有 `overflow: hidden` 或 `height: 0`
3. 检查父容器的样式

### 问题2: 加载很慢

**可能原因**: 
- 网络慢
- 后端查询慢
- 数据量大

**解决方案**:
1. 检查 Network 标签中的请求耗时
2. 检查后端日志
3. 考虑减少 limit 参数（当前是50）

### 问题3: 显示旧数据

**可能原因**: 缓存未更新

**解决方案**:
```javascript
// 清除前端缓存
window.HotNews.myTags.clearCache()

// 强制重新加载
window.HotNews.myTags.load(true)
```

### 问题4: 日期显示为时间戳

**已修复**: 现在使用 `formatNewsDate()` 函数格式化日期

如果仍然出现，检查：
1. `core.js` 中的 `formatNewsDate` 函数是否正确导入
2. 后端返回的 `published_at` 字段格式

## 后续优化建议

### 1. 添加加载状态指示器

类似 morning-brief 的加载动画：

```javascript
container.innerHTML = `
    <div class="my-tags-loading">
        <div class="spinner"></div>
        <div>加载中...</div>
    </div>
`;
```

### 2. 添加下拉刷新

允许用户手动刷新数据：

```javascript
<button onclick="window.HotNews.myTags.load(true)">
    🔄 刷新
</button>
```

### 3. 添加分页或无限滚动

当标签很多时，一次性加载50条可能不够：

```javascript
// 类似 explore 的横向滚动加载
function _attachScrollListener() {
    const grid = document.getElementById('myTagsGrid');
    grid.addEventListener('scroll', () => {
        // 检测滚动到底部，加载更多
    });
}
```

### 4. 添加骨架屏

在加载时显示占位内容，提升用户体验：

```html
<div class="skeleton-card">
    <div class="skeleton-header"></div>
    <div class="skeleton-line"></div>
    <div class="skeleton-line"></div>
</div>
```

### 5. 错误重试机制

自动重试失败的请求：

```javascript
async function fetchWithRetry(url, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await fetch(url);
            if (res.ok) return res;
        } catch (e) {
            if (i === maxRetries - 1) throw e;
            await new Promise(r => setTimeout(r, 1000 * (i + 1)));
        }
    }
}
```

## 相关文件

- `hotnews/web/static/js/src/my-tags.js` - 前端加载逻辑
- `hotnews/kernel/user/preferences_api.py` - 后端 API
- `hotnews/web/templates/viewer.html` - HTML 模板
- `hotnews/web/timeline_cache.py` - 后端缓存
- `docs/guides/my-tags-cache.md` - 缓存机制文档

## 更新日志

- 2026-01-19: 添加详细日志输出，改进错误处理
- 2026-01-19: 修复日期显示为时间戳的问题
- 2026-01-19: 实现双层缓存机制
