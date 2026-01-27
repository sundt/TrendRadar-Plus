# hotnews 前端内存优化方案

## 问题诊断

用户反馈：Win系统，Chrome，切换栏目有点卡，占用太多内存

## 根本原因

1. **DOM 节点累积** - 切换栏目时旧 DOM 未清理
2. **内联事件处理器** - 每个新闻项的 onclick 创建新函数
3. **IntersectionObserver 重复绑定** - 懒加载观察器可能重复创建
4. **大量数据渲染** - 一次性渲染过多新闻项

## 已实施的优化

### 1. LRU 栏目 DOM 清理 ✅

在 `tabs.js` 中实现了 LRU（最近最少使用）策略的 DOM 清理：

- 只保留最近访问的 3 个栏目的 DOM 内容
- 切换栏目时，超出限制的旧栏目会被清理
- 清理时保留卡片结构，只移除新闻列表内容
- 特殊栏目（explore、knowledge、my-tags、rsscol-rss）不会被清理

```javascript
// tabs.js 中的关键代码
const MAX_CACHED_TABS = 3;
let _recentTabs = [];

function _cleanupInactiveTabs(currentTabId) {
    // LRU 策略清理旧栏目 DOM
}
```

### 2. 内存调试工具 ✅

在 `core.js` 中添加了 `TR.cleanup` 工具：

```javascript
// 获取内存统计（Chrome DevTools 中可用）
TR.cleanup.getMemoryStats()

// 统计 DOM 节点数量
TR.cleanup.countDOMNodes()
```

## 待实施的优化

### 3. 移除内联事件处理器（中优先级）

当前问题：每个新闻项的 `onclick="handleTitleClickV2(this, event)"` 会创建新的函数引用。

**注意**：`link.js` 已经有事件委托，但 `data.js` 中仍然使用内联 onclick。可以考虑完全移除内联处理器。

### 4. IntersectionObserver 优化（中优先级）

```javascript
// data.js - 确保只创建一个观察器实例
let _lazyPlatformObserver = null;

function _attachLazyPlatformObservers() {
    // 先断开旧的观察器
    if (_lazyPlatformObserver) {
        _lazyPlatformObserver.disconnect();
    }
    
    // 创建新的观察器
    _lazyPlatformObserver = new IntersectionObserver(...);
    
    // 只观察当前活动栏目的卡片
    const activePane = document.querySelector('.tab-pane.active');
    if (activePane) {
        activePane.querySelectorAll('.platform-card[data-lazy="1"]').forEach(card => {
            _lazyPlatformObserver.observe(card);
        });
    }
}
```

### 5. 减少初始渲染量（低优先级）

```javascript
// data.js - 减少初始渲染的新闻数量
const INITIAL_ITEMS_PER_CARD = 10; // 从 20 减少到 10
const BUFFER_RANGE = 2; // 从 3 减少到 2
```

## 实施优先级

1. ✅ **已完成** - LRU 栏目 DOM 清理（效果最明显）
2. ✅ **已完成** - 内存调试工具
3. **短期** - 优化 IntersectionObserver 管理
4. **中期** - 移除内联事件处理器
5. **长期** - 考虑虚拟滚动方案

## 预期效果

- 内存占用减少 40-60%
- 栏目切换更流畅
- 长时间使用不会出现明显卡顿

## 测试方法

在 Chrome DevTools Console 中运行：

```javascript
// 查看当前 DOM 节点数量
TR.cleanup.countDOMNodes()

// 查看内存使用（需要启用 Chrome 的 performance.memory）
TR.cleanup.getMemoryStats()
```

## 部署

修改的文件：
- `hotnews/hotnews/web/static/js/src/tabs.js` - LRU DOM 清理
- `hotnews/hotnews/web/static/js/src/core.js` - 内存调试工具

部署命令：
```bash
cd hotnews
./deploy-fast.sh
```
