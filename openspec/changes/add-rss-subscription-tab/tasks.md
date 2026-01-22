# RSS 订阅源页签 - 开发任务清单

> **状态更新**: 2025-01-20
> 基础功能已实现，以下为更新后的任务清单

## ✅ Phase 1: 数据库和基础 API (已完成)

### Task 1.1: 数据库迁移 ✅
- [x] 创建 `user_rss_subscriptions` 表
- [x] 创建 `user_rss_subscription_adds` 表
- [x] 数据库操作函数 (`hotnews/web/user_db.py`)

### Task 1.2: 后端 API - 搜索功能 ✅
- [x] 创建 `hotnews/kernel/user/source_subscription_api.py`
- [x] 实现 `GET /api/sources/search` 端点
- [x] 支持搜索 RSS 源和自定义源
- [x] 支持模糊匹配（名称、URL）
- [x] 返回订阅状态（已登录用户）

### Task 1.3: 后端 API - 订阅管理 ✅
- [x] 实现 `GET /api/sources/subscriptions` 端点
- [x] 实现 `POST /api/sources/subscribe` 端点
- [x] 实现 `POST /api/sources/unsubscribe` 端点
- [x] 添加认证检查
- [x] 添加重复订阅处理 (INSERT OR REPLACE)

### Task 1.5: 注册路由 ✅
- [x] 在 `hotnews/web/server.py` 中注册新路由

## ✅ Phase 2: 前端 UI 基础 (已完成)

### Task 2.1: HTML 结构 ✅
- [x] 在 `viewer.html` 中添加"订阅"页签
- [x] 创建搜索框
- [x] 创建源列表容器
- [x] "我的订阅" / "发现更多" 视图切换

### Task 2.3: JavaScript 核心逻辑 ✅
- [x] 创建 `source-subscription.js`
- [x] 实现状态管理
- [x] 实现搜索功能（带 debounce）
- [x] 实现订阅/取消订阅
- [x] 与 authState 集成

### Task 2.4: 数据渲染 ✅
- [x] 实现搜索结果渲染
- [x] 实现订阅列表渲染
- [x] 添加空状态提示

### Task 2.5: 交互优化 ✅
- [x] 添加加载状态提示
- [x] 添加 Toast 提示
- [x] 实现乐观更新（订阅按钮）

---

## 🔄 Phase 3: 预览面板 (待实现 - 优先级高)

### Task 3.1: 后端 API - 预览功能
- [ ] 实现 `GET /api/sources/preview` 端点
- [ ] 从 online.db 获取源的最新文章（10条）
- [ ] 计算源统计信息（订阅数、文章频率）
- [ ] 添加缓存机制（10分钟）

**API 设计**:
```
GET /api/sources/preview?type=rss&id=123&limit=10

Response:
{
  "ok": true,
  "source": {
    "id": "123",
    "type": "rss",
    "name": "界面新闻",
    "url": "https://...",
    "subscriber_count": 174,
    "article_count_per_week": 68
  },
  "articles": [
    {"title": "...", "url": "...", "published_at": 1737360000}
  ]
}
```

### Task 3.2: 前端预览面板
- [ ] 创建预览面板 HTML 结构
- [ ] 点击源卡片展开预览
- [ ] 显示最新文章列表
- [ ] 显示源统计信息
- [ ] 预览面板展开/收起动画

### Task 3.3: 预览面板样式
- [ ] 参考 Feedly 设计预览面板样式
- [ ] 文章列表样式
- [ ] 统计信息样式
- [ ] 移动端适配

## 🔄 Phase 4: 内容过滤集成 (待实现)

### Task 4.1: 后端内容过滤
- [ ] 修改 `news_viewer.py` 添加订阅源过滤
- [ ] 实现 `get_user_subscribed_news()` 函数
- [ ] 优化查询性能

### Task 4.2: 前端内容过滤
- [ ] 在"订阅"页签激活时应用过滤
- [ ] 显示过滤状态提示
- [ ] 添加"查看全部"切换按钮

## 🔄 Phase 5: UI/UX 优化 (待实现)

### Task 5.1: 源卡片样式优化
- [ ] 参考 mockup 优化源卡片样式
- [ ] 添加源图标/favicon
- [ ] 优化订阅按钮样式

### Task 5.2: CSS 样式完善
- [ ] 创建独立的 `rss-subscription.css`
- [ ] 统一样式变量
- [ ] 暗色模式支持

### Task 5.3: 响应式优化
- [ ] 移动端布局优化
- [ ] 触摸交互优化

## 📋 Phase 6: 高级功能 (可选)

### Task 6.1: 分类浏览
- [ ] 实现 `GET /api/sources/categories` 端点
- [ ] 添加分类过滤 UI
- [ ] 实现分类切换

### Task 6.2: 热门推荐
- [ ] 实现 `GET /api/sources/popular` 端点
- [ ] 添加"热门源"推荐区域
- [ ] 基于订阅数排序

### Task 6.3: 未读计数
- [ ] 实现未读文章计数逻辑
- [ ] 在订阅列表显示未读数
- [ ] 实现标记已读功能

---

## 📊 进度总结

| Phase | 状态 | 预计时间 |
|-------|------|---------|
| Phase 1: 数据库和 API | ✅ 已完成 | - |
| Phase 2: 前端 UI 基础 | ✅ 已完成 | - |
| Phase 3: 预览面板 | 🔄 待实现 | 1-2 天 |
| Phase 4: 内容过滤 | 🔄 待实现 | 1 天 |
| Phase 5: UI/UX 优化 | 🔄 待实现 | 1 天 |
| Phase 6: 高级功能 | 📋 可选 | 2-3 天 |

**剩余工作预计时间**: 3-4 天（核心功能）

## 🎯 下一步行动

1. **立即开始**: Task 3.1 - 实现预览 API
2. **然后**: Task 3.2 - 前端预览面板
3. **最后**: Task 4.x - 内容过滤集成
