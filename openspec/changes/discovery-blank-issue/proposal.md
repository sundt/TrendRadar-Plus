# 新发现栏目空白问题分析报告

## 问题描述

**现象**:
1. 登录后，新发现栏目能正常显示
2. 点击切换到其他栏目后，会自动跳回新发现栏目
3. 跳回后新发现栏目变成空白

---

## 问题分析

### 1. 自动跳转问题

**可能原因**: `localStorage` 中保存的 `hotnews_active_tab` 值为 `discovery`

**代码流程**:
```javascript
// tabs.js - restoreActiveTab()
restoreActiveTab() {
    const savedTab = storage.getRaw(TAB_STORAGE_KEY);  // 'hotnews_active_tab'
    if (savedTab) {
        const tabEl = document.querySelector(`.category-tab[data-category="${savedTab}"]`);
        if (tabEl) {
            this.switchTab(savedTab);  // 自动切换到保存的 tab
            return;
        }
    }
}
```

**触发时机**:
- 页面加载时
- 登录后 `preferences.syncOnLogin()` 可能触发重新渲染
- 某些 JS 模块初始化时调用 `restoreActiveTab()`

### 2. 空白问题

**可能原因**:

1. **discoveryLoaded 状态问题**
   - `discovery.js` 中有 `discoveryLoaded = true` 标记
   - 第一次加载成功后设置为 true
   - 第二次切换时，因为 `discoveryLoaded = true`，跳过加载
   - 但 DOM 内容可能已被清理（内存优化）

2. **内存优化清理**
   - `tabs.js` 中有 `_cleanupInactiveTabs()` 函数
   - 切换到其他栏目后，discovery 的内容可能被清理
   - 但 `discoveryLoaded` 状态没有重置

3. **DOM 容器问题**
   - `#discoveryGrid` 容器可能在某些情况下被替换或清空
   - 但 `discoveryLoaded` 仍为 true

---

## 代码审查

### discovery.js 关键代码

```javascript
let discoveryLoaded = false;
let discoveryLoading = false;

async function loadDiscovery(force = false) {
    if (discoveryLoading) return;  // 防止重复加载
    if (discoveryLoaded && !force) return;  // ⚠️ 问题：已加载则跳过
    
    const container = document.getElementById('discoveryGrid');
    if (!container) return;  // 容器不存在则跳过
    
    // ... 加载逻辑
    discoveryLoaded = true;  // 标记为已加载
}
```

### tabs.js 内存优化代码

```javascript
function _cleanupInactiveTabs(currentTabId) {
    // Skip special tabs that shouldn't be cleaned
    if (['explore', 'knowledge', 'my-tags', 'discovery', ...].includes(tabId)) return;
    // ...
}
```

**注意**: discovery 在跳过清理的列表中，所以内存优化不是问题。

---

## 根本原因

经过分析，最可能的原因是：

1. **页面重新渲染**：登录后，页面可能触发了重新渲染（如 `preferences.syncOnLogin()` 后应用新配置）
2. **DOM 被替换**：重新渲染时，`#discoveryGrid` 容器被新的空容器替换
3. **状态不同步**：`discoveryLoaded = true` 但实际 DOM 内容已丢失
4. **自动切换**：`restoreActiveTab()` 切换到 discovery，但因为 `discoveryLoaded = true`，不会重新加载

---

## 修复方案

### 方案 1: 检查 DOM 内容而非状态标记（推荐）

修改 `discovery.js` 的 `loadDiscovery` 函数：

```javascript
async function loadDiscovery(force = false) {
    if (discoveryLoading) return;
    
    const container = document.getElementById('discoveryGrid');
    if (!container) return;
    
    // 检查是否真的有内容，而不是只看状态标记
    const hasContent = container.querySelector('.platform-card');
    if (hasContent && !force) {
        console.log('[Discovery] Already has content, skipping');
        return;
    }
    
    // 重置状态
    discoveryLoaded = false;
    
    // ... 继续加载逻辑
}
```

### 方案 2: 在 Tab 切换时重置状态

修改 `discovery.js` 的 `handleTabSwitch` 函数：

```javascript
function handleTabSwitch(categoryId) {
    if (categoryId === DISCOVERY_CATEGORY_ID) {
        // 检查容器是否有内容
        const container = document.getElementById('discoveryGrid');
        const hasContent = container?.querySelector('.platform-card');
        
        if (!hasContent) {
            // 重置状态，强制重新加载
            discoveryLoaded = false;
        }
        
        loadDiscovery();
    }
}
```

### 方案 3: 监听 DOM 变化

使用 MutationObserver 监听 `#discoveryGrid` 的变化，当内容被清空时重置状态。

---

## 推荐修复

采用**方案 1**，修改 `loadDiscovery` 函数，检查实际 DOM 内容而非状态标记。

这是最简单且最可靠的修复方式。

---

## 下一步

1. 修改 `hotnews/hotnews/web/static/js/src/discovery.js`
2. 重新构建 JS（如果使用 esbuild）
3. 部署并测试
