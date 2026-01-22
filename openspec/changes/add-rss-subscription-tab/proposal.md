# 我的设置 - 标签与订阅源统一管理方案

## 一、功能概述

在"我的设置"页面中，用户可以通过两种方式添加关注内容：
1. **标签** - 从标签库中选择感兴趣的标签
2. **订阅源** - 从 RSS 源/自定义源中选择

两者都会统一显示在"已关注"列表中，用户可以拖动排序、点击取消关注。

**访问限制**: 仅登录用户可使用，未登录用户跳转到登录页面。

## 二、UI 设计

### 2.1 设置页面整体布局

```
┌─────────────────────────────────────────────────────┐
│  ← 返回首页                                          │
│  我的设置                              [用户头像] 退出│
├─────────────────────────────────────────────────────┤
│  📊 我的偏好统计                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │   8    │ │   5    │ │  120   │                   │
│  │ 关注标签│ │ 订阅源 │ │ 总点击 │                   │
│  └────────┘ └────────┘ └────────┘                   │
├─────────────────────────────────────────────────────┤
│  💚 已关注 （拖动调整顺序，点击取消关注）              │
│                                                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │
│  │ 🏷️ 科技     │ │ 📰 36氪     │ │ 🏷️ AI      │   │
│  └─────────────┘ └─────────────┘ └─────────────┘   │
│  ┌─────────────┐ ┌─────────────┐                    │
│  │ 📰 界面新闻 │ │ 🏷️ 财经    │                    │
│  └─────────────┘ └─────────────┘                    │
│                                                       │
├─────────────────────────────────────────────────────┤
│  ➕ 添加关注                                          │
│  [🏷️ 标签]  [📡 订阅源]                    ← Tab 切换│
├─────────────────────────────────────────────────────┤
│                                                       │
│  Tab 内容区域（标签选择器 或 订阅源选择器）            │
│                                                       │
└─────────────────────────────────────────────────────┘
```

### 2.2 订阅源 Tab 内容

```
┌─────────────────────────────────────────────────────┐
│  📊 我的订阅统计                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐                   │
│  │   5    │ │  120   │ │ 界面新闻│                   │
│  │ 订阅源 │ │ 本周文章│ │ 最活跃 │                   │
│  └────────┘ └────────┘ └────────┘                   │
├─────────────────────────────────────────────────────┤
│  💚 已订阅的源 （拖动调整顺序，点击取消订阅）          │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ ☰ 📰 界面新闻: 新闻  ×                        │   │
│  └──────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────┐   │
│  │ ☰ 📰 36氪                ×                    │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
├─────────────────────────────────────────────────────┤
│  🔍 搜索并添加订阅源                                  │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🔍 搜索 RSS 源或自定义源...                    │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  [全部] [RSS源] [自定义源] [热门]                     │
│                                                       │
│  搜索结果:                                            │
│  ┌──────────────────────────────────────────────┐   │
│  │ 📰 界面新闻: 财经                              │   │
│  │    jiemian.com              [+ 订阅]          │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
├─────────────────────────────────────────────────────┤
│  预览面板 (点击源后显示)                               │
│                                                       │
│  ┌──────────────────────────────────────────────┐   │
│  │ 界面新闻: 新闻                                  │   │
│  │ jiemian.com                    [已订阅 ✓]      │   │
│  │                                                │   │
│  │ 最新文章:                                       │   │
│  │ • 20岁小伙疑被卖至柬埔寨？警方通报...            │   │
│  │ • 湖北天门通报"菜商违规使用含毒农药"...          │   │
│  │                                                │   │
│  │ 📊 174 订阅者    68 篇/周                       │   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 三、技术实现方案

### 3.1 数据库设计

#### 新增表: `user_rss_subscriptions`

```sql
CREATE TABLE IF NOT EXISTS user_rss_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_type TEXT NOT NULL,  -- 'rss' 或 'custom'
    source_id INTEGER NOT NULL,  -- rss_sources.id 或 custom_sources.id
    subscribed_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, source_type, source_id)
);

CREATE INDEX idx_user_rss_subs_user ON user_rss_subscriptions(user_id);
CREATE INDEX idx_user_rss_subs_source ON user_rss_subscriptions(source_type, source_id);
```

### 3.2 后端 API 设计

#### 3.2.1 搜索源 API

**端点**: `GET /api/sources/search`

**参数**:
- `q`: 搜索关键词
- `type`: 源类型 (all/rss/custom)
- `limit`: 返回数量 (默认 20)

**响应**:
```json
{
  "ok": true,
  "sources": [
    {
      "id": 123,
      "type": "rss",
      "name": "界面新闻: 新闻",
      "url": "https://www.jiemian.com/feed",
      "domain": "jiemian.com",
      "category": "新闻",
      "description": "界面新闻是中国具有影响力的原创财经新媒体",
      "is_subscribed": false,
      "subscriber_count": 174,
      "article_count_per_week": 68,
      "latest_articles": [
        {
          "title": "20岁小伙疑被卖至柬埔寨？警方通报...",
          "url": "https://...",
          "published_at": 1737360000
        }
      ]
    }
  ]
}
```

#### 3.2.2 获取用户订阅列表 API

**端点**: `GET /api/sources/subscriptions`

**响应**:
```json
{
  "ok": true,
  "subscriptions": [
    {
      "id": 123,
      "type": "rss",
      "name": "界面新闻: 新闻",
      "url": "https://www.jiemian.com/feed",
      "subscribed_at": 1737360000,
      "unread_count": 15
    }
  ]
}
```

#### 3.2.3 订阅源 API

**端点**: `POST /api/sources/subscribe`

**请求体**:
```json
{
  "source_type": "rss",
  "source_id": 123
}
```

**响应**:
```json
{
  "ok": true,
  "message": "订阅成功"
}
```

#### 3.2.4 取消订阅 API

**端点**: `POST /api/sources/unsubscribe`

**请求体**:
```json
{
  "source_type": "rss",
  "source_id": 123
}
```

#### 3.2.5 获取源详情和预览 API

**端点**: `GET /api/sources/preview`

**参数**:
- `type`: rss/custom
- `id`: 源 ID
- `limit`: 预览文章数量 (默认 10)

**响应**:
```json
{
  "ok": true,
  "source": {
    "id": 123,
    "type": "rss",
    "name": "界面新闻: 新闻",
    "url": "https://www.jiemian.com/feed",
    "domain": "jiemian.com",
    "description": "...",
    "is_subscribed": true,
    "subscriber_count": 174,
    "article_count_per_week": 68
  },
  "articles": [
    {
      "title": "20岁小伙疑被卖至柬埔寨？警方通报...",
      "url": "https://...",
      "published_at": 1737360000,
      "summary": "..."
    }
  ]
}
```

### 3.3 前端实现

#### 3.3.1 新增文件

1. `hotnews/web/static/js/src/rss-subscription.js` - 订阅源页签主逻辑
2. `hotnews/web/static/css/rss-subscription.css` - 样式文件

#### 3.3.2 核心功能模块

```javascript
// rss-subscription.js 结构

const RSSSubscription = {
    // 状态管理
    state: {
        searchQuery: '',
        searchResults: [],
        subscriptions: [],
        selectedSource: null,
        previewArticles: [],
        isLoading: false
    },
    
    // 初始化
    init() {
        this.bindEvents();
        this.loadSubscriptions();
    },
    
    // 搜索源
    async searchSources(query) {
        // 调用 /api/sources/search
    },
    
    // 加载用户订阅
    async loadSubscriptions() {
        // 调用 /api/sources/subscriptions
    },
    
    // 订阅源
    async subscribe(sourceType, sourceId) {
        // 调用 /api/sources/subscribe
    },
    
    // 取消订阅
    async unsubscribe(sourceType, sourceId) {
        // 调用 /api/sources/unsubscribe
    },
    
    // 预览源
    async previewSource(sourceType, sourceId) {
        // 调用 /api/sources/preview
    },
    
    // 渲染搜索结果
    renderSearchResults() {},
    
    // 渲染订阅列表
    renderSubscriptions() {},
    
    // 渲染预览面板
    renderPreview() {}
};
```

### 3.4 与现有系统集成

#### 3.4.1 在主页面添加订阅源页签

修改 `hotnews/web/templates/viewer.html`:

```html
<div class="tabs">
    <button class="tab-btn active" data-tab="all">全部</button>
    <button class="tab-btn" data-tab="my-tags">我的标签</button>
    <button class="tab-btn" data-tab="rss-subscription">订阅源</button>
    <button class="tab-btn" data-tab="morning-brief">早报</button>
</div>

<div id="rss-subscription-tab" class="tab-content" style="display: none;">
    <!-- 订阅源页签内容 -->
</div>
```

#### 3.4.2 内容过滤

当用户在"订阅源"页签时，新闻列表只显示用户订阅的源的内容：

```python
# hotnews/web/news_viewer.py

def get_user_subscribed_news(user_id, limit=100):
    """获取用户订阅源的新闻"""
    conn = get_user_db_conn()
    
    # 获取用户订阅的源
    subscriptions = conn.execute("""
        SELECT source_type, source_id 
        FROM user_rss_subscriptions 
        WHERE user_id = ?
    """, (user_id,)).fetchall()
    
    # 根据订阅源过滤新闻
    # ...
```

## 四、实现步骤

### Phase 1: 数据库和后端 API (2-3天)
1. ✅ 创建 `user_rss_subscriptions` 表
2. ✅ 实现搜索 API
3. ✅ 实现订阅/取消订阅 API
4. ✅ 实现预览 API
5. ✅ 实现订阅列表 API

### Phase 2: 前端 UI (2-3天)
1. ✅ 创建订阅源页签 HTML 结构
2. ✅ 实现搜索功能
3. ✅ 实现订阅列表展示
4. ✅ 实现预览面板
5. ✅ 实现订阅/取消订阅交互

### Phase 3: 内容过滤和集成 (1-2天)
1. ✅ 实现基于订阅的内容过滤
2. ✅ 集成到主页面
3. ✅ 添加未读计数功能
4. ✅ 优化性能和缓存

### Phase 4: 测试和优化 (1天)
1. ✅ 功能测试
2. ✅ 性能优化
3. ✅ UI/UX 调整

## 五、高级功能 (可选)

### 5.1 分类浏览
- 按类别展示源 (科技、财经、新闻等)
- 热门源推荐

### 5.2 智能推荐
- 基于用户阅读历史推荐相似源
- 基于标签偏好推荐源

### 5.3 源管理
- 批量订阅/取消订阅
- 导入/导出 OPML 文件
- 自定义源分组

### 5.4 统计信息
- 每个源的文章发布频率
- 订阅者数量
- 阅读量统计

## 六、注意事项

1. **权限控制**: 只有登录用户才能订阅源
2. **性能优化**: 
   - 搜索结果缓存
   - 预览内容缓存
   - 分页加载
3. **用户体验**:
   - 实时搜索 (debounce)
   - 加载状态提示
   - 错误处理
4. **数据一致性**:
   - 源被删除时自动清理订阅关系
   - 定期更新统计信息

## 七、参考界面

参考 Feedly、Inoreader 等 RSS 阅读器的订阅管理界面设计。

## 八、预期效果

- 用户可以轻松发现和订阅感兴趣的内容源
- 个性化的内容流，只看自己订阅的源
- 提升用户粘性和活跃度
- 为后续的个性化推荐打下基础
