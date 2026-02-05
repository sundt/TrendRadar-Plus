# 主题卡片加载优化方案

## 状态：✅ 已实现

## 问题描述

主题下的卡片容易出现一直在加载的情况，用户体验不佳。

## 问题分析

### 当前主题卡片加载流程

```
用户点击主题 Tab
    ↓
topic-tracker.js: loadTopicNewsIfNeeded()
    ↓
检查是否有 .news-placeholder（判断是否已加载）
    ↓
调用 /api/topics/{topicId}/news API
    ↓
渲染 renderTopicNews()
```

### 对比"我的关注"(my-tags)的实现

| 特性 | 主题卡片 (topic-tracker.js) | 我的关注 (my-tags.js) |
|------|---------------------------|---------------------|
| 加载状态管理 | 仅用 placeholder 判断 | `myTagsLoading` + `myTagsLoaded` 双标志 |
| 重复加载防护 | 无 | 有（检查 loading/loaded 状态） |
| 超时处理 | 无 | 有（3秒超时） |
| 错误状态渲染 | 无 | 有（renderError + 重试按钮） |
| **后端缓存** | ❌ 无 | ✅ 有（UserTimelineCache，10分钟 TTL） |
| **前端缓存** | ❌ 无 | ❌ 已禁用（兼容性问题） |
| 认证状态等待 | 无 | 有（waitForAuthWithTimeout） |
| Tab 激活监听 | 仅 click 事件 | click + touchstart + MutationObserver |
| 空状态处理 | 有 | 有 |

### 缓存机制详细对比

#### "我的关注"的缓存实现

**后端缓存** (`hotnews/hotnews/web/timeline_cache.py`):
```python
# 使用 UserTimelineCache（按用户缓存）
my_tags_cache = UserTimelineCache()  # TTL=600秒(10分钟), max_items=500/用户

# API 中使用
cached_result = my_tags_cache.get(config={"user_id": user_id})
if cached_result is not None:
    return {"ok": True, "tags": cached_result, "cached": True, "cache_age": age}

# 数据变更时清除
my_tags_cache.invalidate(user_id=user_id)
```

**前端缓存** (已禁用):
```javascript
// my-tags.js 中前端缓存已禁用，原因是微信浏览器兼容性问题
function getCachedData() {
    return null;  // Disable frontend cache
}
```

#### 主题卡片的缓存现状

**后端**: 无缓存，每次请求都直接查询数据库
**前端**: 无缓存

### 问题根因

1. **缺少加载状态锁**：没有 `loading` 标志，可能导致重复请求
2. **无超时机制**：API 请求无超时，网络慢时会一直等待
3. **无错误恢复**：请求失败后没有重试机制
4. **Tab 切换监听不完善**：仅依赖 click 事件，在微信浏览器等环境可能失效
5. **认证状态未同步**：未等待 authState 初始化完成就发起请求
6. **无后端缓存**：每次请求都查询数据库，响应慢时容易卡住

## 改进方案

### 方案一：前端加载优化（必须）

将 topic-tracker.js 的加载逻辑重构为与 my-tags.js 一致的模式：

#### 1. 添加加载状态管理

```javascript
// 每个主题独立的加载状态
const topicLoadingState = new Map(); // topicId -> { loading: boolean, loaded: boolean }

function getTopicState(topicId) {
    if (!topicLoadingState.has(topicId)) {
        topicLoadingState.set(topicId, { loading: false, loaded: false });
    }
    return topicLoadingState.get(topicId);
}
```

#### 2. 添加超时和错误处理

```javascript
async function loadTopicNews(topicId, force = false) {
    const state = getTopicState(topicId);
    
    // 防止重复加载
    if (state.loading) {
        console.log(`[TopicTracker] Topic ${topicId} already loading, skipping`);
        return;
    }
    if (state.loaded && !force) {
        console.log(`[TopicTracker] Topic ${topicId} already loaded, skipping`);
        return;
    }
    
    state.loading = true;
    const container = document.getElementById(`topicCards-${topicId}`);
    
    try {
        // 等待认证状态（带超时）
        await waitForAuthWithTimeout(3000);
        
        // 显示加载状态
        showLoadingState(container);
        
        // 带超时的 API 请求
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时
        
        const response = await fetch(`/api/topics/${topicId}/news?limit=50`, {
            credentials: 'include',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.ok && data.keywords_news) {
            renderTopicNews(topicId, data.keywords_news);
            state.loaded = true;
        } else {
            throw new Error(data.error || '加载失败');
        }
    } catch (e) {
        console.error(`[TopicTracker] Load topic ${topicId} failed:`, e);
        renderError(container, e.name === 'AbortError' ? '请求超时' : e.message, topicId);
    } finally {
        state.loading = false;
    }
}
```

#### 3. 添加错误状态渲染

```javascript
function renderError(container, message, topicId) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;">
            <div style="font-size:48px;margin-bottom:16px;">😕</div>
            <div style="font-size:16px;">加载失败: ${message || '未知错误'}</div>
            <button onclick="TopicTracker.loadTopicNews('${topicId}', true)" 
                    style="margin-top:16px;padding:8px 16px;background:#22c55e;color:white;border:none;border-radius:6px;cursor:pointer;">
                重试
            </button>
        </div>
    `;
}
```

#### 4. 增强 Tab 切换监听

```javascript
function setupTopicTabListeners() {
    document.querySelectorAll('.category-tab[data-category^="topic-"]').forEach(tab => {
        const topicId = tab.dataset.category.replace('topic-', '');
        
        // Click 事件
        tab.addEventListener('click', () => {
            setTimeout(() => loadTopicNewsIfNeeded(topicId), 100);
        });
        
        // Touch 事件（移动端/微信浏览器）
        tab.addEventListener('touchstart', () => {
            setTimeout(() => loadTopicNewsIfNeeded(topicId), 100);
        }, { passive: true });
    });
    
    // MutationObserver 监听 Tab 激活
    document.querySelectorAll('.tab-pane[id^="tab-topic-"]').forEach(pane => {
        const topicId = pane.id.replace('tab-topic-', '');
        
        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    if (pane.classList.contains('active')) {
                        loadTopicNewsIfNeeded(topicId);
                    }
                }
            }
        });
        
        observer.observe(pane, { attributes: true, attributeFilter: ['class'] });
    });
}
```

### 方案二：后端缓存（推荐）

参考 my-tags 的 `UserTimelineCache`，为主题新闻添加按用户+主题的缓存：

#### 1. 创建缓存实例

```python
# hotnews/hotnews/web/timeline_cache.py

# 添加主题新闻缓存（按用户+主题ID）
class TopicNewsCache:
    """Per-user per-topic cache for topic news."""
    
    def __init__(self, ttl_seconds=DEFAULT_CACHE_TTL, max_topics_per_user=20):
        self._ttl = ttl_seconds
        self._max_topics = max_topics_per_user
        # Dict of user_id -> {topic_id -> {keywords_news, created_at}}
        self._cache: Dict[int, Dict[str, Dict]] = {}
    
    def get(self, user_id: int, topic_id: str) -> Optional[Dict]:
        user_cache = self._cache.get(user_id)
        if not user_cache:
            return None
        entry = user_cache.get(topic_id)
        if not entry:
            return None
        if (time.time() - entry["created_at"]) >= self._ttl:
            return None
        return entry["keywords_news"]
    
    def set(self, user_id: int, topic_id: str, keywords_news: Dict):
        if user_id not in self._cache:
            self._cache[user_id] = {}
        # LRU eviction
        if len(self._cache[user_id]) >= self._max_topics:
            oldest = min(self._cache[user_id].items(), key=lambda x: x[1]["created_at"])
            del self._cache[user_id][oldest[0]]
        self._cache[user_id][topic_id] = {
            "keywords_news": keywords_news,
            "created_at": time.time()
        }
    
    def invalidate(self, user_id: int = None, topic_id: str = None):
        if user_id is None:
            self._cache.clear()
        elif topic_id is None:
            self._cache.pop(user_id, None)
        else:
            if user_id in self._cache:
                self._cache[user_id].pop(topic_id, None)

topic_news_cache = TopicNewsCache()
```

#### 2. 在 API 中使用缓存

```python
# hotnews/hotnews/web/api/topic_api.py

from hotnews.web.timeline_cache import topic_news_cache

@router.get("/{topic_id}/news")
async def get_topic_news(request: Request, topic_id: str, ...):
    user = _get_current_user(request)
    user_id = user["id"]
    
    # 检查缓存
    cached = topic_news_cache.get(user_id, topic_id)
    if cached is not None:
        return {"ok": True, "keywords_news": cached, "cached": True}
    
    # 获取数据
    keywords_news = {}
    for kw in keywords:
        news = _search_news_by_keyword(conn, kw, topic["rss_sources"], limit)
        keywords_news[kw] = news
    
    # 存入缓存
    topic_news_cache.set(user_id, topic_id, keywords_news)
    
    return {"ok": True, "keywords_news": keywords_news, "cached": False}
```

#### 3. 主题变更时清除缓存

```python
# 在 update_topic / delete_topic 中
topic_news_cache.invalidate(user_id=user_id, topic_id=topic_id)
```

## 实施计划

### ✅ 阶段一：前端加载优化（已完成）

1. ✅ 添加加载状态管理（loading/loaded 标志）
2. ✅ 添加请求超时机制（15秒）
3. ✅ 添加错误状态渲染和重试按钮
4. ✅ 增强 Tab 切换监听（click + touchstart + MutationObserver）

### ✅ 阶段二：后端缓存（已完成）

1. ✅ 在 `timeline_cache.py` 添加 `TopicNewsCache` 类
2. ✅ 在 `topic_api.py` 集成缓存逻辑
3. ✅ 在主题变更时清除缓存
4. ✅ 添加缓存状态到 `get_cache_status()`

## 预期效果

- 消除"一直加载"的问题（前端超时+重试）
- 网络超时时显示明确的错误提示和重试按钮
- 微信浏览器等特殊环境下也能正常加载
- 减少重复请求，提升性能
- 后端缓存减少数据库查询，加快响应速度

## 相关文件

- `hotnews/hotnews/web/static/js/topic-tracker.js` - 主题卡片前端逻辑
- `hotnews/hotnews/web/static/js/src/my-tags.js` - 参考实现
- `hotnews/hotnews/web/api/topic_api.py` - 主题 API
- `hotnews/hotnews/web/timeline_cache.py` - 缓存服务（需添加主题缓存）
