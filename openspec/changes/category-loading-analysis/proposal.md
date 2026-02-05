# 栏目加载问题全面分析报告

## 问题概述

| 栏目 | 状态 | 数据来源 | 加载方式 |
|------|------|----------|----------|
| 我的关注 (my-tags) | ✅ 正常 | API: `/api/user/preferences/followed-news` | JS 动态加载 |
| 精选博客 (explore) | ✅ 正常 | 服务端预渲染 | SSR |
| 每日AI早报 (knowledge) | ✅ 正常 | 服务端预渲染 + JS 加载 | 混合 |
| 精选公众号 (featured-mps) | ✅ 正常 | API: `/api/featured-mps` | JS 动态加载 |
| 财经投资 (finance) | ✅ 正常 | 服务端预渲染 | SSR |
| **新发现 (discovery)** | ❌ 空白 | API: `/api/user/preferences/discovery-news` | JS 动态加载 |
| **主题 (topic-xxx)** | ❌ 异常 | 服务端预渲染 + API | 混合 |

---

## 问题一：新发现栏目空白

### 现象
- 切换到"新发现"栏目时显示空白
- API `/api/user/preferences/discovery-news` 在服务器上测试返回正常数据

### 根本原因分析

**对比正常栏目（我的关注）的加载流程：**

```
my-tags 加载流程:
1. Tab 切换 → tr_tab_switched 事件
2. my-tags.js 监听事件 → loadMyTags()
3. 检查 authState → 已登录则请求 API
4. API 返回数据 → 渲染到 #myTagsGrid
```

```
discovery 加载流程:
1. Tab 切换 → tr_tab_switched 事件
2. discovery.js 监听事件 → loadDiscovery()
3. 直接请求 API（无需登录）
4. API 返回数据 → 渲染到 #discoveryGrid
```

**关键差异：**

| 对比项 | my-tags | discovery | 影响 |
|--------|---------|-----------|------|
| 需要登录 | 是 | 否 | discovery 应该更简单 |
| authState 依赖 | 是 | 否 | discovery 不依赖 auth |
| 备用加载机制 | 有 | 有 | 两者都有 fallback |
| Tab 按钮监听 | click + touchstart | click + touchstart | 相同 |
| MutationObserver | 有 | 有 | 相同 |

**可能的问题点：**

1. **JS 模块初始化顺序问题**
   - discovery.js 在 index.js 中的导入顺序可能导致初始化时机问题
   - 模块可能在 DOM 完全就绪前就尝试绑定事件

2. **Tab 切换事件未触发**
   - `tr_tab_switched` 事件可能未正确派发
   - 微信浏览器中事件可能被吞掉

3. **容器 ID 问题**
   - `#discoveryGrid` 容器可能在某些情况下不存在

### 解决方案

```javascript
// discovery.js 需要增强的部分：

// 1. 增加更多的初始化检查点
function init() {
    // 立即检查是否已激活
    checkAndLoadIfActive();
    
    // 多次延迟检查（兼容微信浏览器）
    [100, 300, 500, 1000, 2000].forEach(delay => {
        setTimeout(checkAndLoadIfActive, delay);
    });
}

// 2. 增加全局暴露，供 fallback 调用
window._loadDiscovery = loadDiscovery;
```

---

## 问题二：主题栏目异常

### 现象
1. 前3个主题正常显示，第4个及之后一直加载中
2. 从其他栏目切换到主题栏目时，整个页面变空白
3. **其他用户能看到你创建的主题**（严重 Bug）

### 根本原因分析

#### 问题 2.1：第4个主题后加载失败

**当前实现：**
```python
# page_rendering.py - 服务端预渲染
def _inject_user_topics_as_categories(data, request):
    # 获取用户 session
    token = _get_session_token(request)
    # 验证 session
    is_valid, user_info = validate_session(user_db_conn, token)
    # 获取用户的主题
    topics = storage.get_topics_by_user(str(user_id))
    # 为每个主题预加载新闻
    for topic in topics:
        platforms = _build_topic_platforms(...)  # 数据库查询
```

**问题：**
- 每个主题都需要执行数据库查询
- 主题数量多时，页面渲染时间过长
- 可能导致超时或部分数据丢失

**对比正常栏目：**
- 财经投资等普通栏目：数据在 `viewer_service.get_categorized_news()` 中一次性加载
- 主题栏目：每个主题单独查询，N 个主题 = N 次查询

#### 问题 2.2：切换到主题栏目时页面空白

**当前 viewer.html 模板：**
```html
{% elif category.is_topic %}
<div class="platform-grid" id="topicCards-{{ category.topic_id }}">
    {% if category.platforms %}
    {% for platform_id, platform in category.platforms.items() %}
    <!-- 渲染预加载的数据 -->
    {% endfor %}
    {% else %}
    <!-- 显示空状态 -->
    {% endif %}
</div>
```

**问题：**
- 如果 `category.platforms` 为空或 None，会显示空状态
- 如果服务端预加载失败，前端没有 fallback 机制
- topic-tracker.js 的 `loadTopicNewsIfNeeded` 检测到预渲染内容后直接跳过加载

#### 问题 2.3：其他用户能看到你的主题（严重 Bug）

**根本原因：**

```python
# page_rendering.py 第 24-48 行
def _inject_user_topics_as_categories(data, request):
    token = _get_session_token(request)
    if not token:
        return data  # 未登录用户不注入主题 ✓
    
    is_valid, user_info = validate_session(user_db_conn, token)
    if not is_valid or not user_info:
        return data  # 无效 session 不注入主题 ✓
    
    user_id = user_info["id"]
    topics = storage.get_topics_by_user(str(user_id))  # 按 user_id 查询 ✓
```

**代码逻辑看起来正确**，但问题可能出在：

1. **Session 验证问题**
   - `validate_session` 可能返回了错误的 user_id
   - 或者 session token 被多个用户共享

2. **数据库查询问题**
   - `get_topics_by_user` 的 SQL 查询可能有问题
   - 检查 `WHERE user_id = ?` 是否正确执行

3. **缓存问题**
   - 页面可能被 CDN 或浏览器缓存
   - 不同用户访问到了相同的缓存页面

**验证方法：**
```sql
-- 检查 topic_configs 表中的 user_id 分布
SELECT user_id, COUNT(*) as topic_count 
FROM topic_configs 
GROUP BY user_id;
```

---

## 对比表：正常栏目 vs 异常栏目

| 特性 | 我的关注 | 精选公众号 | 新发现 | 主题 |
|------|----------|------------|--------|------|
| **数据来源** | API | API | API | 服务端预渲染 |
| **需要登录** | 是 | 否 | 否 | 是 |
| **加载时机** | Tab 激活时 | Tab 激活时 | Tab 激活时 | 页面加载时 |
| **容器 ID** | myTagsGrid | featuredMpsGrid | discoveryGrid | topicCards-{id} |
| **JS 模块** | my-tags.js | featured-mps.js | discovery.js | topic-tracker.js |
| **Fallback 机制** | 有 | 有 | 有 | 无 |
| **状态管理** | loaded/loading | loaded/loading | loaded/loading | Map per topic |
| **缓存策略** | 后端 5min | 后端缓存 | 后端 10min | 无 |

**关键差异：**

1. **主题栏目没有 Fallback 机制**
   - 其他动态栏目都有 viewer.html 中的备用加载函数
   - 主题栏目依赖服务端预渲染，失败后无法恢复

2. **主题栏目的加载逻辑复杂**
   - 需要判断是否有预渲染内容
   - 预渲染内容和 API 加载的数据格式可能不一致

3. **新发现栏目的 JS 初始化可能有问题**
   - 需要检查 discovery.js 的初始化时机

---

## 修复方案

### 方案一：新发现栏目修复

1. **增强 discovery.js 的初始化逻辑**
2. **在 viewer.html 中增加更强的 fallback**
3. **添加错误日志上报**

### 方案二：主题栏目修复

1. **移除服务端预渲染，改为纯 API 加载**
   - 简化逻辑，与其他动态栏目保持一致
   - 避免页面渲染超时

2. **或者：优化服务端预渲染**
   - 限制预渲染的主题数量（如最多3个）
   - 其余主题使用 API 懒加载

3. **添加 Fallback 机制**
   - 在 viewer.html 中为主题栏目添加备用加载函数

### 方案三：修复主题可见性 Bug

1. **检查 session 验证逻辑**
2. **添加页面级别的 no-cache 头**
3. **在前端添加 user_id 校验**

---

## 优先级

| 问题 | 严重程度 | 优先级 |
|------|----------|--------|
| 其他用户能看到你的主题 | 🔴 严重 | P0 |
| 主题栏目切换后空白 | 🟠 高 | P1 |
| 新发现栏目空白 | 🟠 高 | P1 |
| 第4个主题后加载失败 | 🟡 中 | P2 |

---

## 下一步行动

1. **立即**：检查 session 验证和页面缓存，修复主题可见性 Bug
2. **今天**：简化主题栏目的加载逻辑，改为纯 API 加载
3. **今天**：增强 discovery.js 的初始化和 fallback 机制
