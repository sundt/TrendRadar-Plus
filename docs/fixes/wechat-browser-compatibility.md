# 微信浏览器兼容性修复

## 问题描述

在微信内置浏览器中，"我的关注"和"新发现"栏目显示空白，而其他栏目正常。

### 症状
- 服务重启后首次加载正常
- 刷新页面后变成空白
- 切换到其他栏目再切回来也是空白
- 普通浏览器（Chrome、Safari）无此问题

## 问题根源

### 1. localStorage 缓存兼容性问题
`discovery.js` 使用 localStorage 缓存数据，但在微信浏览器中：
- 数据写入缓存成功
- 从缓存读取数据成功
- 但 `renderDiscoveryNews()` 渲染时失败，且没有抛出异常
- 导致 `discoveryLoaded = true` 被设置，后续加载被跳过

### 2. ES6 模块加载时序问题
- `tabs.js` 在 `discovery.js` 之前导入
- `tabs.restoreActiveTab()` 可能在 `discovery.js` 的事件监听器注册之前执行
- 导致 `tr_tab_switched` 事件被错过

### 3. authState 初始化阻塞
- `my-tags.js` 依赖 `authState.init()` 完成
- 在微信浏览器中，`/api/auth/me` 请求可能延迟或失败
- 导致加载流程卡住

## 修复方案

### 1. 禁用所有特殊栏目的前端缓存

前端 localStorage 缓存收益有限（后端已有缓存），但会带来兼容性风险：
- 代码更新后缓存格式不兼容导致空白
- 微信等特殊浏览器的 localStorage 行为不一致
- 调试困难

**已禁用前端缓存的模块：**
- `discovery.js` - 新发现
- `my-tags.js` - 我的关注
- `featured-mps.js` - 精选公众号

```javascript
// 禁用前端缓存，每次都从 API 获取
function getCachedData() {
    return null;
}

function setCachedData(data) {
    return;
}
```

后端 API 有 5-10 分钟缓存，不会影响性能。

### 2. 添加 authState 超时机制

**文件**: `hotnews/hotnews/web/static/js/src/my-tags.js`

```javascript
async function waitForAuthWithTimeout(timeoutMs = 3000) {
    if (authState.initialized) {
        return authState.getUser();
    }
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('[MyTags] authState init timeout');
            resolve(null);
        }, timeoutMs);
        
        authState.init().then(() => {
            clearTimeout(timeout);
            resolve(authState.getUser());
        }).catch((e) => {
            clearTimeout(timeout);
            resolve(null);
        });
    });
}
```

### 3. 添加备用加载脚本

**文件**: `hotnews/hotnews/web/templates/viewer.html`

在页面底部添加内联脚本，作为 ES6 模块加载失败时的兜底：

```javascript
// 备用加载函数
async function fallbackLoadMyTags() { ... }
async function fallbackLoadDiscovery() { ... }

// 多时间点检查
setTimeout(checkAndTriggerLoad, 500);
setTimeout(checkAndTriggerLoad, 1000);
setTimeout(checkAndTriggerLoad, 2000);
setTimeout(checkAndTriggerLoad, 4000);

// 监听 tab 切换
window.addEventListener('tr_tab_switched', ...);

// 重写 switchTab 添加 fallback
var originalSwitchTab = window.switchTab;
window.switchTab = function(categoryId) { ... };

// 事件委托监听点击
tabsContainer.addEventListener('click', ...);
tabsContainer.addEventListener('touchend', ...);
```

### 4. discovery.js 初始化增强

添加多次检查确保加载：

```javascript
function init() {
    // 立即检查
    checkAndLoadIfActive();
    
    // 延迟检查（处理时序问题）
    setTimeout(checkAndLoadIfActive, 100);
    setTimeout(checkAndLoadIfActive, 500);
    setTimeout(checkAndLoadIfActive, 1000);
}
```

## 栏目分类

### 特殊栏目（JS 动态加载）
| 栏目 | 模块 | 前端缓存 | 后端缓存 |
|------|------|----------|----------|
| my-tags | my-tags.js | ❌ 已禁用 | ✅ 10分钟 |
| discovery | discovery.js | ❌ 已禁用 | ✅ 10分钟 |
| explore | explore-timeline.js | ❌ 无 | ✅ 10分钟 |
| knowledge | morning-brief.js | ❌ 无 | ✅ 10分钟 |
| featured-mps | featured-mps.js | ❌ 已禁用 | ✅ 10分钟 |

### 普通栏目（服务端渲染）
- ai、finance、tech_news、developer、social、general
- 内容在 HTML 中直接渲染或通过 `/api/category/{id}` 懒加载
- 无前端 localStorage 缓存，后端有 10 分钟缓存

## 修改的文件

1. `hotnews/hotnews/web/static/js/src/discovery.js`
   - 禁用 localStorage 缓存
   - 增强初始化逻辑
   - 添加安全超时

2. `hotnews/hotnews/web/static/js/src/my-tags.js`
   - 禁用 localStorage 缓存
   - 添加 authState 超时机制

3. `hotnews/hotnews/web/static/js/src/featured-mps.js`
   - 禁用 localStorage 缓存

4. `hotnews/hotnews/web/templates/viewer.html`
   - 添加备用加载脚本
   - 事件委托监听
   - 多时间点检查

## 测试验证

1. 在微信浏览器中打开网站
2. 点击"新发现"栏目，应正常显示
3. 切换到其他栏目
4. 再切回"新发现"，应仍然正常
5. 刷新页面，应仍然正常
6. 测试"我的关注"栏目，同样应正常

## 后续建议

所有特殊栏目的前端 localStorage 缓存已统一禁用，架构更简洁：
- 前端：每次从 API 获取数据
- 后端：统一使用内存缓存（10分钟 TTL）
- 避免了缓存格式不兼容、浏览器兼容性等问题

## 新增栏目指南

当新增特殊栏目时，请遵循以下规范：

### 后端缓存
1. 在 `timeline_cache.py` 中创建缓存实例，使用默认配置：
   ```python
   from hotnews.web.timeline_cache import TimelineCache, DEFAULT_CACHE_TTL
   
   # 使用默认 TTL，不要硬编码
   new_category_cache = TimelineCache(max_items=1000)
   ```
2. 将新缓存添加到 `clear_all_timeline_caches()` 和 `get_cache_status()`

### 前端 JS 模块
1. **不要实现 localStorage 缓存**
2. 每次从 API 获取数据
3. 参考 `discovery.js` 的实现模式
4. **必须使用标准新闻项渲染**（见下方）

### 新闻项渲染规范

所有栏目的新闻项必须包含以下元素，以确保 AI 总结按钮正常工作：

```javascript
import { formatNewsDate, escapeHtml, renderNewsItemHtml } from './core.js';

// 方式 1：使用通用函数（推荐）
const newsHtml = renderNewsItemHtml(item, idx, { id: sourceId, name: sourceName });

// 方式 2：手动构建（需要包含所有元素）
const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${item.id}" onclick="..."></span>`;
const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${item.id}" data-title="..." data-url="..." data-source-id="..." data-source-name="..." onclick="..."></button>`;
const actionsHtml = `<div class="news-actions">${dateHtml}${summaryBtnHtml}</div>`;
```

**必须包含的元素：**
- `news-ai-indicator` - AI 指示点（显示是否已总结）
- `news-summary-btn` - 总结按钮（鼠标悬停时显示）
- `news-actions` - 操作容器（包含日期和按钮）

**data 属性要求：**
- `data-news-id` - 新闻唯一 ID
- `data-title` - 新闻标题（HTML 转义）
- `data-url` - 新闻 URL
- `data-source-id` - 来源 ID（如 tag_id, mp-fakeid）
- `data-source-name` - 来源显示名称

### 缓存配置常量
所有缓存配置集中在 `timeline_cache.py`：
```python
DEFAULT_CACHE_TTL = 600  # 10 分钟
DEFAULT_MAX_ITEMS = 1000
DEFAULT_MAX_ITEMS_PER_USER = 500
DEFAULT_MAX_USERS = 100
```

---

# 标签去重优化

## 问题描述

1. **标签卡片重复标题**：同一条新闻被多个平台转载，在标签卡片中显示多次
2. **标签计数重复**：AI 识别标签时，相同标题的新闻会被多次计算 `occurrence_count`

## 修复方案

### 1. 后端标签计数去重

**文件**: `hotnews/hotnews/kernel/services/tag_discovery.py`

在 `_update_candidate_stats()` 方法中添加标题相似度检查：

```python
def _is_similar_title(self, t1: str, t2: str, threshold: float = 0.85) -> bool:
    """Check if two titles are similar using character overlap."""
    # ... 相似度计算逻辑

def _update_candidate_stats(self, tag_id, confidence, sample_title, now):
    # 检查是否与已有 sample_titles 相似
    is_duplicate_title = False
    if sample_title:
        for existing_title in sample_titles:
            if self._is_similar_title(sample_title, existing_title):
                is_duplicate_title = True
                break
    
    if is_duplicate_title:
        # 只更新 last_seen_at，不增加 occurrence_count
        return
    
    # 不是重复 - 正常增加计数
    occurrence_count = row[0] + 1
    # ...
```

**效果**：
- 同一条新闻被多个平台转载时，只计算一次
- 避免热门新闻的标签被过度放大
- 更准确反映标签的真实热度

### 2. 前端显示去重阈值优化

**文件**: `hotnews/hotnews/kernel/user/preferences_api.py`

将 `_is_similar_title()` 的阈值从 0.9 降到 0.85：

```python
def _is_similar_title(t1: str, t2: str, threshold: float = 0.85) -> bool:
    """Check if two titles are similar using character overlap.
    
    Uses 0.85 threshold to catch more duplicates from different platforms
    (e.g., same news with slightly different wording).
    """
```

**效果**：
- 更积极地过滤相似标题
- 减少用户看到的重复内容

## 去重逻辑说明

### 相似度计算
```python
def _is_similar_title(t1, t2, threshold=0.85):
    # 1. 标准化：移除标点、空格，转小写
    n1 = normalize(t1)
    n2 = normalize(t2)
    
    # 2. 快速精确匹配
    if n1 == n2:
        return True
    
    # 3. 长度差异检查（差异 > 20% 则不相似）
    if abs(len(n1) - len(n2)) > max(len(n1), len(n2)) * 0.2:
        return False
    
    # 4. 字符重叠率计算
    shorter, longer = sorted([n1, n2], key=len)
    matches = sum(1 for c in shorter if c in longer)
    return matches / len(shorter) >= threshold
```

### 应用场景
| 场景 | 阈值 | 说明 |
|------|------|------|
| 标签计数去重 | 0.85 | 避免重复计数 |
| 前端显示去重 | 0.85 | 减少重复内容 |

## 修改的文件

1. `hotnews/hotnews/kernel/services/tag_discovery.py`
   - 添加 `_normalize_title_for_dedup()` 方法
   - 添加 `_is_similar_title()` 方法
   - 修改 `_update_candidate_stats()` 添加去重逻辑

2. `hotnews/hotnews/kernel/user/preferences_api.py`
   - 将 `_is_similar_title()` 阈值从 0.9 改为 0.85
