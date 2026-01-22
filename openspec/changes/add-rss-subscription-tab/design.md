# RSS 订阅源页签 - 详细设计

## 一、数据库 Schema

### 1.1 用户订阅表

```sql
CREATE TABLE IF NOT EXISTS user_rss_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    source_type TEXT NOT NULL CHECK(source_type IN ('rss', 'custom')),
    source_id INTEGER NOT NULL,
    subscribed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_read_at INTEGER,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE(user_id, source_type, source_id)
);

CREATE INDEX idx_user_rss_subs_user ON user_rss_subscriptions(user_id);
CREATE INDEX idx_user_rss_subs_source ON user_rss_subscriptions(source_type, source_id);
```

### 1.2 源统计表 (可选，用于缓存)

```sql
CREATE TABLE IF NOT EXISTS source_statistics (
    source_type TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    subscriber_count INTEGER DEFAULT 0,
    article_count_7d INTEGER DEFAULT 0,
    last_updated INTEGER NOT NULL,
    PRIMARY KEY (source_type, source_id)
);
```

## 二、API 路由设计

### 2.1 路由文件结构

新建文件: `hotnews/kernel/user/rss_subscription_api.py`

```python
from fastapi import APIRouter, Request, HTTPException, Depends
from typing import Optional, List

router = APIRouter(prefix="/api/sources", tags=["rss-subscription"])
```

### 2.2 API 端点列表

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/api/sources/search` | 搜索源 | 可选 |
| GET | `/api/sources/subscriptions` | 获取用户订阅 | 必需 |
| POST | `/api/sources/subscribe` | 订阅源 | 必需 |
| POST | `/api/sources/unsubscribe` | 取消订阅 | 必需 |
| GET | `/api/sources/preview` | 预览源内容 | 可选 |
| GET | `/api/sources/categories` | 获取源分类 | 否 |
| GET | `/api/sources/popular` | 热门源推荐 | 否 |

## 三、前端组件设计

### 3.1 文件结构

```
hotnews/web/static/
├── js/src/
│   └── rss-subscription.js    # 主逻辑
├── css/
│   └── rss-subscription.css   # 样式
```

### 3.2 组件状态管理

```javascript
const RSSSubscriptionState = {
    view: 'my-subscriptions',  // 'my-subscriptions' | 'discover'
    searchQuery: '',
    searchResults: [],
    subscriptions: [],
    selectedSource: null,
    previewData: null,
    loading: false,
    error: null
};
```

## 四、UI 交互流程

### 4.1 搜索流程
1. 用户输入搜索关键词
2. Debounce 300ms 后发起搜索请求
3. 显示加载状态
4. 渲染搜索结果列表
5. 标记已订阅的源

### 4.2 订阅流程
1. 用户点击"订阅"按钮
2. 发送订阅请求
3. 更新 UI 状态（按钮变为"已订阅"）
4. 刷新订阅列表
5. 显示成功提示

### 4.3 预览流程
1. 用户点击源卡片
2. 展开预览面板
3. 加载最新文章列表
4. 显示源统计信息

## 五、性能优化策略

### 5.1 缓存策略
- 搜索结果缓存 5 分钟
- 预览内容缓存 10 分钟
- 订阅列表缓存 1 分钟

### 5.2 分页加载
- 搜索结果每页 20 条
- 预览文章每页 10 条
- 滚动加载更多

### 5.3 防抖节流
- 搜索输入 debounce 300ms
- 订阅按钮 throttle 1s

## 六、错误处理

### 6.1 常见错误
- 未登录用户尝试订阅 → 跳转登录
- 源不存在 → 提示错误
- 网络错误 → 重试机制
- 重复订阅 → 友好提示

### 6.2 错误提示
使用 Toast 通知显示错误信息
