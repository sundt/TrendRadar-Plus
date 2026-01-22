# 我的标签缓存机制

## 概述

为了提升"我的标签"栏目的加载速度，我们实现了双层缓存机制：
1. **前端缓存**：使用 localStorage 存储数据，TTL 5分钟
2. **后端缓存**：使用内存缓存存储数据，TTL 5分钟

## 缓存架构

```
用户访问标签栏目
    ↓
检查前端缓存 (localStorage)
    ↓
    有效？ → 是 → 立即显示 + 后台更新
    ↓ 否
请求后端 API
    ↓
检查后端缓存 (my_tags_cache)
    ↓
    有效？ → 是 → 返回缓存数据
    ↓ 否
查询数据库
    ↓
存入后端缓存
    ↓
返回数据 → 存入前端缓存 → 显示
```

## 前端缓存实现

### 位置
`hotnews/web/static/js/src/my-tags.js`

### 关键功能

#### 1. 缓存读取
```javascript
function getCachedData() {
    const cached = localStorage.getItem(MY_TAGS_CACHE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const now = Date.now();
    
    // 检查是否过期（5分钟）
    if ((now - data.timestamp) > MY_TAGS_CACHE_TTL) {
        localStorage.removeItem(MY_TAGS_CACHE_KEY);
        return null;
    }
    
    return data.tags;
}
```

#### 2. 缓存写入
```javascript
function setCachedData(tags) {
    const data = {
        tags: tags,
        timestamp: Date.now(),
    };
    localStorage.setItem(MY_TAGS_CACHE_KEY, JSON.stringify(data));
}
```

#### 3. 智能加载策略
- 首次加载：检查前端缓存 → 有效则立即显示 + 后台更新
- 强制刷新：跳过前端缓存，直接请求后端
- 后台更新：用户看到缓存数据的同时，异步获取最新数据更新缓存

### 配置
```javascript
const MY_TAGS_CACHE_KEY = 'hotnews_my_tags_cache';
const MY_TAGS_CACHE_TTL = 5 * 60 * 1000; // 5分钟
```

## 后端缓存实现

### 位置
- 缓存类：`hotnews/web/timeline_cache.py`
- API集成：`hotnews/kernel/user/preferences_api.py`

### 关键功能

#### 1. 缓存实例
```python
# 全局缓存实例
my_tags_cache = TimelineCache(ttl_seconds=300, max_items=500)
```

#### 2. API 缓存逻辑
```python
@router.get("/followed-news")
async def get_followed_news(request: Request, limit: int = Query(50)):
    # 创建缓存键
    cache_key_data = {
        "user_id": user["id"],
        "followed_tags": sorted(followed_tag_ids),
        "limit": limit,
    }
    
    # 尝试从缓存获取
    cached_result = my_tags_cache.get(config=cache_key_data)
    if cached_result is not None:
        return {
            "ok": True,
            "tags": cached_result,
            "cached": True,
            "cache_age": round(my_tags_cache.age_seconds, 1),
        }
    
    # 缓存未命中，查询数据库
    result = fetch_from_database()
    
    # 存入缓存
    my_tags_cache.set(result, config=cache_key_data)
    
    return {"ok": True, "tags": result, "cached": False}
```

#### 3. 缓存失效策略
当用户修改标签设置时，自动清除缓存：
```python
@router.post("/tag-settings")
async def set_tag_setting(...):
    # 更新设置
    conn.execute(...)
    conn.commit()
    
    # 清除缓存
    my_tags_cache.invalidate()
    
    return {"ok": True}
```

### 配置
```python
ttl_seconds = 300      # 5分钟过期
max_items = 500        # 最多缓存500条数据
```

## 缓存失效触发

### 自动失效
1. **时间过期**：5分钟后自动失效
2. **配置变化**：用户关注的标签列表变化时失效

### 手动失效
1. **用户操作**：
   - 关注/取消关注标签
   - 批量设置标签
   - 修改标签顺序

2. **管理员操作**：
   - 调用 `clear_all_timeline_caches()` 清除所有缓存

## 性能优势

### 加载速度对比

| 场景 | 无缓存 | 仅后端缓存 | 双层缓存 |
|------|--------|-----------|---------|
| 首次加载 | ~500ms | ~500ms | ~500ms |
| 再次加载 | ~500ms | ~100ms | ~10ms |
| 切换回来 | ~500ms | ~100ms | ~10ms |

### 优势说明
1. **前端缓存**：几乎瞬时加载（~10ms）
2. **后端缓存**：减少数据库查询（~100ms）
3. **后台更新**：用户无感知的数据刷新

## 监控和调试

### 查看缓存状态
```python
from hotnews.web.timeline_cache import get_cache_status

status = get_cache_status()
print(status["my_tags"])
# {
#     "valid": True,
#     "item_count": 150,
#     "age_seconds": 45.2
# }
```

### 清除缓存
```python
from hotnews.web.timeline_cache import my_tags_cache

# 清除标签缓存
my_tags_cache.invalidate()

# 清除所有缓存
from hotnews.web.timeline_cache import clear_all_timeline_caches
clear_all_timeline_caches()
```

### 前端调试
```javascript
// 查看缓存
console.log(localStorage.getItem('hotnews_my_tags_cache'));

// 清除缓存
window.HotNews.myTags.clearCache();

// 强制刷新
window.HotNews.myTags.load(true);
```

## 测试

运行测试：
```bash
pytest tests/test_my_tags_cache.py -v
```

测试覆盖：
- ✅ 缓存初始化
- ✅ 缓存读写
- ✅ 缓存过期
- ✅ 配置变化失效
- ✅ 最大条目限制
- ✅ 缓存状态报告
- ✅ 集成测试

## 最佳实践

1. **用户体验优先**：优先显示缓存数据，后台更新
2. **及时失效**：用户修改设置后立即清除缓存
3. **合理TTL**：5分钟平衡新鲜度和性能
4. **容量控制**：限制缓存大小避免内存问题
5. **降级策略**：缓存失败时正常查询数据库

## 未来优化

1. **智能预加载**：用户登录时预加载标签数据
2. **增量更新**：只更新变化的标签数据
3. **Redis缓存**：多实例部署时使用共享缓存
4. **缓存预热**：系统启动时预加载热门数据
5. **个性化TTL**：根据用户活跃度调整缓存时间
