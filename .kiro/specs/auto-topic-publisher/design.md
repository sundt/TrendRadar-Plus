# 主题追踪功能 - 技术设计

## 概述

允许用户创建自定义主题，AI 自动生成关键词，系统聚合相关新闻显示在独立的栏目 Tab 中。

## 架构

```
┌─────────────────────────────────────────────────────────────┐
│                      前端 (viewer.html)                      │
├─────────────────────────────────────────────────────────────┤
│  topic-tracker.js    │  category-tab-reorder.js (右键菜单)   │
│  topic-tracker.css   │                                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      后端 API                                │
├─────────────────────────────────────────────────────────────┤
│  /api/topics                    - CRUD 操作                  │
│  /api/topics/generate-keywords  - AI 生成关键词              │
│  /api/topics/{id}/news          - 获取主题新闻               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据存储                                │
├─────────────────────────────────────────────────────────────┤
│  user.db:                                                    │
│    - topic_configs (主题配置)                                │
│    - topic_rss_sources (主题关联的 RSS 源)                   │
│                                                              │
│  online.db:                                                  │
│    - rss_entries (新闻数据，用于关键词搜索)                  │
└─────────────────────────────────────────────────────────────┘
```

## 数据库表

### topic_configs
```sql
CREATE TABLE topic_configs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🏷️',
    keywords TEXT NOT NULL,  -- JSON array
    enabled INTEGER DEFAULT 1,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
```

### topic_rss_sources
```sql
CREATE TABLE topic_rss_sources (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_id TEXT NOT NULL,
    rss_source_id TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (topic_id) REFERENCES topic_configs(id) ON DELETE CASCADE,
    UNIQUE(topic_id, rss_source_id)
);
```

## API 端点

### GET /api/topics
获取当前用户的所有主题配置。

### POST /api/topics
创建新主题。
```json
{
    "name": "苹果公司",
    "icon": "🍎",
    "keywords": ["苹果", "Apple", "iPhone", "Mac"],
    "rss_source_ids": []
}
```

### PUT /api/topics/{id}
更新主题配置。

### DELETE /api/topics/{id}
删除主题。

### POST /api/topics/generate-keywords
AI 生成关键词和推荐数据源。
```json
// Request
{ "topic_name": "苹果公司" }

// Response
{
    "ok": true,
    "icon": "🍎",
    "keywords": ["苹果公司", "Apple Inc.", "iPhone", "Mac", ...],
    "recommended_sources": [
        {"name": "36氪", "type": "rss", "url": "https://..."},
        {"name": "机器之心", "type": "wechat_mp", "wechat_id": "..."}
    ]
}
```

### GET /api/topics/{id}/news
获取主题相关新闻，按关键词分组。
```json
{
    "ok": true,
    "keywords_news": {
        "苹果公司": [{ "id": "...", "title": "...", "url": "..." }, ...],
        "iPhone": [...]
    }
}
```

## 前端交互

1. **新建主题按钮**：位于 Tab 栏最左侧
2. **主题 Tab**：每个主题显示为独立 Tab，绿色渐变背景
3. **关键词卡片**：复用 platform-card 样式，每个关键词一个卡片
4. **右键菜单**：集成到现有栏目右键菜单
   - 主题 Tab：刷新、编辑主题、删除主题
   - 普通栏目：隐藏栏目、栏目设置

## 文件清单

- `hotnews/storage/topic_storage.py` - 数据库操作
- `hotnews/web/api/topic_api.py` - API 端点
- `hotnews/web/static/js/topic-tracker.js` - 前端逻辑
- `hotnews/web/static/css/topic-tracker.css` - 样式
- `hotnews/web/static/js/src/category-tab-reorder.js` - 右键菜单（已修改）
