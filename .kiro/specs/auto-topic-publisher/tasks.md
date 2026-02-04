# 实现任务

## 任务 1：数据库表创建 ✅

- [x] 1.1 创建 topic_configs 表
- [x] 1.2 创建 topic_rss_sources 表
- [x] 1.3 集成数据库初始化

## 任务 2：主题配置 CRUD API ✅

- [x] 2.1 创建主题 API 路由文件 (`hotnews/web/api/topic_api.py`)
- [x] 2.2 实现 GET /api/topics
- [x] 2.3 实现 POST /api/topics
- [x] 2.4 实现 PUT /api/topics/{id}
- [x] 2.5 实现 DELETE /api/topics/{id}

## 任务 3：AI 关键词与数据源推荐 API ✅

- [x] 3.1 实现 POST /api/topics/generate-keywords
- [x] 3.2 实现 AI 生成 prompt（emoji + 关键词）
- [x] 3.3 实现联网搜索数据源推荐（DashScope enable_search）

## 任务 4：主题新闻聚合 API ✅

- [x] 4.1 实现 GET /api/topics/{id}/news
- [x] 4.2 实现关键词分组聚合（搜索 rss_entries 表）

## 任务 5：前端 - 新建主题弹窗 ✅

- [x] 5.1 创建前端文件 (`topic-tracker.js`, `topic-tracker.css`)
- [x] 5.2 实现新建主题弹窗 HTML
- [x] 5.3 实现弹窗交互逻辑
- [x] 5.4 实现主题创建提交

## 任务 6：前端 - 主题栏目显示 ✅

- [x] 6.1 主题作为独立 Tab 显示在顶部栏目栏
- [x] 6.2 实现关键词卡片渲染（复用 platform-card 样式）
- [x] 6.3 实现新闻列表渲染
- [x] 6.4 实现右键菜单（集成到现有栏目右键菜单）
  - 刷新、编辑主题、删除主题
- [x] 6.5 实现主题编辑弹窗

## 任务 7：前端 - 集成到 viewer.html ✅

- [x] 7.1 添加"新建主题"按钮到 Tab 栏
- [x] 7.2 加载并显示用户主题
- [x] 7.3 引入 JS 和 CSS 文件

## 任务 8：测试与优化

- [ ] 8.1 功能测试
- [x] 8.2 错误处理（AI 生成失败降级、超时处理）
- [ ] 8.3 性能优化（懒加载、缓存）

---

## 已完成功能

1. **新建主题**：点击 Tab 栏的"➕ 新建主题"按钮
2. **AI 生成**：输入主题名称后，AI 自动生成 emoji 图标和关键词
3. **主题显示**：每个主题作为独立 Tab 显示，点击后显示关键词卡片
4. **右键菜单**：右键主题 Tab 可刷新、编辑、删除
5. **新闻聚合**：从 rss_entries 表搜索匹配关键词的新闻

## 待完成

1. RSS 源验证和创建（用户选择推荐源时写入 rss_sources 表）
2. 性能优化（关键词卡片懒加载）
