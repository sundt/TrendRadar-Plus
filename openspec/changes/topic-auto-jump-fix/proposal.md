# 我的主题自动跳转问题修复

## 问题描述

用户反馈：点开"我的主题"，然后切换到其他栏目（如"新发现"），会自动跳转回"我的主题"。

## 根本原因分析

问题出在 `data.js` 的 `refreshViewerData` 函数中：

1. 用户点击"我的主题" tab → localStorage 保存 `topic-xxx`
2. `refreshViewerData` 被触发（可能由 `init.js` 初始化刷新、explore 栏目添加 RSS 后的刷新等）
3. `snapshotViewerState()` 读取 localStorage 中的 `topic-xxx` 并保存到 `state.activeTab`
4. 发起 `/api/news` API 请求（异步，可能需要几秒钟）
5. **用户在等待期间切换到其他栏目**（如"新发现"），localStorage 被更新为 `discovery`
6. API 请求完成，`renderViewerFromData` 被调用
7. **问题**：`renderViewerFromData` 使用的是步骤 3 中保存的旧 `state.activeTab`（`topic-xxx`），而不是当前 localStorage 中的值（`discovery`）
8. 结果：用户被"跳回"到主题 tab

## 修复方案

在 `renderViewerFromData` 中，重新从 localStorage 读取当前的 `activeTab`，而不是使用 `state.activeTab`：

```javascript
// 修复前
const desiredTab = (state && typeof state.activeTab === 'string') ? state.activeTab : null;

// 修复后
const currentStoredTab = storage.getRaw(TAB_STORAGE_KEY);
const desiredTab = currentStoredTab || (state && typeof state.activeTab === 'string' ? state.activeTab : null);
```

这样，即使用户在 API 请求期间切换了 tab，渲染完成后也会恢复到用户最新选择的 tab。

## 修改的文件

- `hotnews/hotnews/web/static/js/src/data.js` - `renderViewerFromData` 函数中的 tab 恢复逻辑

## 测试验证

1. 点击"我的主题" tab
2. 快速切换到其他栏目（如"新发现"）
3. 等待几秒钟
4. 验证不会自动跳回"我的主题"
