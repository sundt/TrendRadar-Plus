# AI 总结按钮行为优化方案

## 背景

当前 AI 总结按钮在不同场景下的行为不够统一，特别是：
- 移动端对于 blocked URL 直接打开新窗口，体验不佳
- PC 端安装了侧边栏插件时，没有自动利用插件能力

## 目标

优化 AI 总结按钮的点击行为，根据设备类型和插件安装情况提供最佳体验。

## 行为矩阵（已确认 - 修订版）

| 设备 | 侧边栏插件 | URL 状态 | 行为 |
|------|-----------|----------|------|
| 移动端 | - | blocked/无法总结 | 弹出模态框：提示 + 阅读原文 + Todo + 收藏 |
| 移动端 | - | 可总结 | 弹出模态框，正常总结流程 |
| PC端 | ✅ 已安装 | blocked/无法总结 | 弹出模态框：提示 + 阅读原文 + **「打开后自动总结」提示** |
| PC端 | ✅ 已安装 | 可总结 | 弹出模态框，正常总结流程 |
| PC端 | ❌ 未安装 | blocked/无法总结 | 弹出模态框：提示 + 阅读原文 + **插件安装引导** |
| PC端 | ❌ 未安装 | 可总结 | 弹出模态框，正常总结流程 |

> **修订说明**：
> - 所有情况都走模态框流程，不再直接打开侧边栏
> - blocked URL 时根据插件安装状态显示不同提示
> - 有插件：提示用户打开原文后会自动总结
> - 无插件：引导用户安装插件

## 详细流程

```
用户点击 AI 总结按钮
│
├─ 检测设备类型
│
├─【移动端】
│   └─ 始终弹出模态框
│       ├─ blocked URL → 显示"该网站暂不支持总结"提示
│       │                 + 📖 阅读原文按钮
│       │                 + 📋 加入 Todo 按钮 ✅
│       │                 + ⭐ 收藏按钮 ✅
│       │
│       └─ 可总结 URL → 正常总结流程（加载动画 → 流式输出）
│
└─【PC端】
    ├─ 检测侧边栏插件是否安装
    │
    ├─【有插件】
    │   └─ 自动打开侧边栏，传递 url/title/newsId
    │      （无论 blocked 还是可总结，统一由插件处理）
    │
    └─【无插件】
        ├─ blocked URL → 直接 window.open() 打开原文
        └─ 可总结 URL → 弹出模态框，正常总结流程
```

## 现有实现状态

### ✅ 已实现
- 移动端 blocked 模态框（`summary-blocked` class）已包含 Todo/收藏按钮
- 移动端访问错误模态框（`summary-access-error` class）已包含 Todo/收藏按钮
- `addCurrentToTodo()` 和 `addCurrentToFavorites()` 函数已实现

### 🔧 待实现
1. **设备检测逻辑** - 在 `handleSummaryClick` 入口添加
2. **插件检测** - 检测 `data-hotnews-extension` 属性
3. **触发侧边栏事件** - dispatch `hotnews-open-sidepanel` 事件
4. **扩展端监听** - content.js 注入标记 + 监听事件

## 技术实现

### 1. 设备检测（改进版）

```javascript
/**
 * 检测是否为移动设备
 * 优先使用 UA 检测，避免 PC 端窗口缩小被误判
 */
function isMobile() {
    // 优先检测 UA
    const uaIsMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    if (uaIsMobile) return true;
    
    // 补充检测：触摸设备 + 小屏幕（排除带触摸屏的笔记本）
    const hasTouchScreen = navigator.maxTouchPoints > 0;
    const isSmallScreen = window.innerWidth <= 768;
    
    // 只有同时满足触摸 + 小屏才认为是移动端
    return hasTouchScreen && isSmallScreen;
}
```

### 2. 侧边栏插件检测（改进版）

```javascript
// ========== 扩展端 content.js ==========
// 使用 document_start 时机注入，确保在页面 JS 执行前完成
// manifest.json 中配置: "run_at": "document_start"

// 立即注入标记（不等待 DOM）
document.documentElement.setAttribute('data-hotnews-summarizer', 'installed');
document.documentElement.setAttribute('data-hotnews-summarizer-version', chrome.runtime.getManifest().version);

// ========== 网站端 summary-modal.js ==========
/**
 * 检测侧边栏插件是否安装
 * 使用更具体的属性名避免冲突
 */
function hasExtension() {
    return document.documentElement.getAttribute('data-hotnews-summarizer') === 'installed';
}

/**
 * 获取插件版本（可选，用于兼容性检查）
 */
function getExtensionVersion() {
    return document.documentElement.getAttribute('data-hotnews-summarizer-version') || null;
}
```

### 3. 触发侧边栏（带超时兜底）

```javascript
// ========== 网站端 summary-modal.js ==========

// 侧边栏打开确认标记
let sidepanelAckReceived = false;

/**
 * 触发侧边栏打开，带超时兜底
 */
function openSidepanel(url, title, newsId, sourceId, sourceName) {
    sidepanelAckReceived = false;
    
    // 发送事件给扩展
    window.dispatchEvent(new CustomEvent('hotnews-summarizer-open-sidepanel', {
        detail: { url, title, newsId }
    }));
    
    // 超时兜底：500ms 内没收到确认就 fallback 到模态框
    setTimeout(() => {
        if (!sidepanelAckReceived) {
            console.log('[Summary] Sidepanel timeout, fallback to modal');
            openSummaryModal(newsId, title, url, sourceId, sourceName);
        }
    }, 500);
}

// 监听扩展的确认回复
window.addEventListener('hotnews-summarizer-sidepanel-ack', () => {
    sidepanelAckReceived = true;
});

// ========== 扩展端 content.js ==========

// 监听网站的打开请求
window.addEventListener('hotnews-summarizer-open-sidepanel', (e) => {
    const { url, title, newsId } = e.detail || {};
    
    // 立即发送确认（在实际打开之前）
    window.dispatchEvent(new CustomEvent('hotnews-summarizer-sidepanel-ack'));
    
    // 发送消息给 background 打开侧边栏
    chrome.runtime.sendMessage({ 
        type: 'OPEN_SIDEPANEL_DIRECT', 
        url: url,
        title: title,
        newsId: newsId
    });
});
```

### 4. 修改后的入口逻辑（完整版）

```javascript
/**
 * AI 总结按钮点击处理
 * 根据设备类型和插件安装情况选择最佳体验
 */
function handleSummaryClick(event, newsId, title, url, sourceId, sourceName) {
    event.preventDefault();
    event.stopPropagation();
    
    // 移动端：始终走模态框
    if (isMobile()) {
        openSummaryModal(newsId, title, url, sourceId, sourceName);
        return;
    }
    
    // PC 端 + 有插件：尝试打开侧边栏（带兜底）
    if (hasExtension()) {
        try {
            openSidepanel(url, title, newsId, sourceId, sourceName);
        } catch (e) {
            console.error('[Summary] openSidepanel error:', e);
            // 出错时 fallback 到模态框
            openSummaryModal(newsId, title, url, sourceId, sourceName);
        }
        return;
    }
    
    // PC 端 + 无插件：走模态框
    openSummaryModal(newsId, title, url, sourceId, sourceName);
}
```

### 5. manifest.json 配置（扩展端）

```json
{
  "content_scripts": [
    {
      "matches": ["https://hotnews.example.com/*"],
      "js": ["content.js"],
      "run_at": "document_start"
    }
  ]
}
```

> **注意**：`document_start` 时机注入可以确保标记在页面 JS 执行前就存在，避免时序问题。

## 修改文件清单

| 文件 | 修改内容 |
|------|----------|
| `summary-modal.js` | 添加 `isMobile()`, `hasExtension()`, `openSidepanel()`，修改 `handleSummaryClick`，添加超时兜底逻辑 |
| `hotnews-summarizer/content.js` | 注入 `data-hotnews-summarizer` 标记（document_start），监听事件并回复确认 |
| `hotnews-summarizer/manifest.json` | 配置 content_scripts 的 `run_at: document_start` |

## 相关文件

- 当前总结模态框逻辑：`hotnews/hotnews/web/static/js/src/summary-modal.js`
- Chrome 扩展 content script：`hotnews-summarizer/content.js`
- Chrome 扩展 background：`hotnews-summarizer/background.js`
- Chrome 扩展配置：`hotnews-summarizer/manifest.json`

## 边界情况处理

### 1. 插件检测时机问题
- **问题**：content script 可能在页面 JS 之后执行，导致检测失败
- **方案**：使用 `run_at: document_start` 配置，在 DOM 解析前注入标记

### 2. 侧边栏打开失败兜底
- **问题**：插件可能被禁用、崩溃或无响应
- **方案**：
  - 扩展收到请求后立即发送 `hotnews-summarizer-sidepanel-ack` 确认事件
  - 网站端设置 500ms 超时，未收到确认则 fallback 到模态框
  - 使用 try-catch 包裹 `openSidepanel` 调用

### 3. 移动端检测误判
- **问题**：PC 端窗口缩小时 `innerWidth <= 768` 会误判为移动端
- **方案**：
  - 优先使用 UA 检测
  - 仅当 UA 不匹配时，才用 `maxTouchPoints + innerWidth` 组合判断
  - 必须同时满足「有触摸屏」且「小屏幕」才认为是移动端

### 4. 事件命名冲突
- **问题**：通用事件名可能与其他扩展冲突
- **方案**：使用更具体的前缀 `hotnews-summarizer-*`

### 5. 扩展上下文失效
- **问题**：扩展更新或重载后，content script 的 `chrome.runtime` 可能失效
- **方案**：content.js 中已有 `extensionContextInvalidated` 检测机制，复用即可

## 测试用例

| 场景 | 预期行为 |
|------|----------|
| 移动端 + blocked URL | 弹出模态框，显示提示 + 阅读原文 + Todo + 收藏 |
| 移动端 + 可总结 URL | 弹出模态框，正常总结流程 |
| PC + 有插件 + 任意 URL | 打开侧边栏 |
| PC + 有插件 + 插件无响应 | 500ms 后 fallback 到模态框 |
| PC + 无插件 + blocked URL | 直接打开原文 |
| PC + 无插件 + 可总结 URL | 弹出模态框，正常总结流程 |
| PC + 窗口缩小到 768px 以下 | 仍走 PC 逻辑（不误判为移动端） |


---

## 实现 Todo

### Phase 1: 扩展端准备（hotnews-summarizer）

- [x] **1.1 修改 manifest.json**
  - 将 content_scripts 的 `run_at` 改为 `document_start`
  - 确保 matches 包含 hotnews 网站域名

- [x] **1.2 修改 content.js - 注入标记**
  - 在文件顶部（IIFE 内最开始）添加标记注入代码
  - 使用 `data-hotnews-summarizer` 和 `data-hotnews-summarizer-version` 属性

- [x] **1.3 修改 content.js - 监听事件**
  - 添加 `hotnews-summarizer-open-sidepanel` 事件监听
  - 收到请求后立即发送 `hotnews-summarizer-sidepanel-ack` 确认
  - 调用现有的 `chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL_DIRECT', ... })`

### Phase 2: 网站端实现（hotnews）

- [x] **2.1 修改 summary-modal.js - 添加工具函数**
  - 添加 `isMobile()` 函数（改进版，优先 UA）
  - 添加 `hasExtension()` 函数
  - 添加 `getExtensionVersion()` 函数（可选）

- [x] **2.2 修改 summary-modal.js - 添加侧边栏触发逻辑**
  - 添加 `sidepanelAckReceived` 状态变量
  - 添加 `openSidepanel()` 函数（带 500ms 超时兜底）
  - 添加 `hotnews-summarizer-sidepanel-ack` 事件监听

- [x] **2.3 修改 summary-modal.js - 修改入口函数**
  - ~~修改 `handleSummaryClick()` 函数按设备类型和插件状态分流~~
  - **已调整**：`handleSummaryClick()` 始终走模态框流程
  - 在 blocked URL 模态框中根据插件状态显示不同提示

- [x] **2.4 修改 blocked URL 模态框**
  - 检测插件安装状态
  - 有插件：显示「打开后自动总结」提示
  - 无插件：显示插件安装引导

- [x] **2.5 添加 CSS 样式**
  - 添加 `.summary-extension-hint` 相关样式

- [x] **2.6 创建插件安装引导页**
  - 创建 `/static/extension-install.html` 安装指南页面
  - 添加 `/extension/install` 路由重定向
  - 复制 ZIP 文件到 `/static/downloads/` 目录

### Phase 3: 测试验证

- [ ] **3.1 PC 端测试**
  - 有插件 + blocked URL：显示「打开后自动总结」提示
  - 无插件 + blocked URL：显示插件安装引导
  - 可总结 URL：正常弹出模态框总结

- [ ] **3.2 移动端测试**
  - blocked URL → 模态框显示提示 + Todo/收藏按钮（无插件提示）
  - 可总结 URL → 模态框正常总结

- [ ] **3.3 插件安装页测试**
  - 访问 `/extension/install` 能正确显示安装指南
  - ZIP 文件能正常下载

---

## 实现过程中的问题与解决

### 问题 1：前端 JS 缓存未更新

**现象**：修改了 `summary-modal.js` 后部署到服务器，但浏览器仍然加载旧版本代码。

**原因**：
- 前端使用 esbuild 打包，`summary-modal.js` 是通过 `index.js` 导入的模块
- `asset_rev` 是基于 `index.js` 和 `viewer.css` 的 MD5 哈希生成的
- 修改模块文件后，`index.js` 的哈希不会自动变化

**解决方案**：
- 修改前端代码后，需要运行 `npm run build:js` 重新构建
- 构建会生成新的 chunk 文件名（带哈希），从而触发浏览器重新加载

### 问题 2：Chrome 侧边栏无法自动打开

**现象**：从 hotnews 网站点击「阅读原文」跳转到新页面后，插件无法自动打开侧边栏。

**原因**：
- Chrome 的安全限制：`chrome.sidePanel.open()` 必须在用户手势（user gesture）的回调中调用
- 页面加载时自动调用 `sidePanel.open()` 会被 Chrome 拒绝

**解决方案**：
- 在 URL 中添加参数 `?hotnews_auto_summarize=1` 标记需要自动总结
- 插件检测到该参数后，显示一个提示框引导用户点击
- 用户点击「立即总结」按钮后，在点击事件回调中调用 `sidePanel.open()`

### 问题 3：微信登录提示「未配置」

**现象**：微信扫码登录显示「微信登录未配置」。

**原因**：
- Docker 容器重启后，环境变量 `WECHAT_MP_APP_ID` 和 `WECHAT_MP_APP_SECRET` 未正确传入
- 需要 `--force-recreate` 重建容器才能获取新的环境变量

**解决方案**：
- 使用 `docker compose up -d --force-recreate hotnews-viewer` 重建容器

---

## 变更日志

| 日期 | 变更内容 |
|------|----------|
| 2026-01-27 | 初始方案设计 |
| 2026-01-27 | 补充边界情况处理：插件检测时机、超时兜底、移动端检测改进、事件命名 |
| 2026-01-27 | 添加实现 Todo 清单 |
| 2026-01-27 | 完成 Phase 1 & 2 实现 |
| 2026-01-27 | 修订方案：改为模态框流程 + 插件提示，而非直接打开侧边栏 |
| 2026-01-27 | 实现自动总结提示功能（绕过 Chrome user gesture 限制） |
| 2026-01-27 | 创建插件安装引导页 `/extension/install` |
