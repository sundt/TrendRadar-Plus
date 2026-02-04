# 实现任务

## 任务 1：数据库表创建

- [x] 1.1 创建 topic_configs 表
  - 在 `hotnews/hotnews/storage/` 目录下创建 `topic_storage.py`
  - 实现 `init_topic_tables()` 函数创建 topic_configs 表
  - 字段：id, user_id, name, icon, keywords (JSON), enabled, sort_order, created_at, updated_at
  - 创建索引：user_id, enabled

- [x] 1.2 创建 topic_rss_sources 表
  - 在 `topic_storage.py` 中添加 topic_rss_sources 表创建
  - 字段：id, topic_id, rss_source_id, created_at
  - 创建外键约束和唯一索引

- [x] 1.3 集成数据库初始化
  - 在应用启动时调用 `init_topic_tables()`
  - 确保表在首次运行时自动创建

## 任务 2：主题配置 CRUD API

- [x] 2.1 创建主题 API 路由文件
  - 创建 `hotnews/hotnews/web/api/topic_api.py`
  - 注册蓝图到 FastAPI 应用

- [x] 2.2 实现 GET /api/topics
  - 获取当前用户的所有主题配置
  - 包含关联的 RSS 源列表
  - 需要用户认证

- [x] 2.3 实现 POST /api/topics
  - 创建新主题配置
  - 验证必填字段（name, keywords）
  - 处理 RSS 源关联
  - 返回创建的主题对象

- [x] 2.4 实现 PUT /api/topics/{id}
  - 更新主题配置
  - 验证用户权限（只能更新自己的主题）
  - 支持更新 name, icon, keywords, enabled, rss_sources

- [x] 2.5 实现 DELETE /api/topics/{id}
  - 删除主题配置
  - 级联删除关联的 RSS 源记录
  - 验证用户权限

## 任务 3：AI 关键词与数据源推荐 API

- [x] 3.1 实现 POST /api/topics/generate-keywords
  - 接收主题名称参数
  - 调用 DashScope API 生成 emoji、关键词和推荐数据源
  - 启用 DashScope 联网搜索（enable_search）获取真实数据源
  - 返回 emoji 图标、关键词列表（8-12个）和推荐数据源列表

- [x] 3.2 实现 AI 生成 prompt
  - 设计 prompt 模板，要求生成：
    - 一个合适的 emoji 图标
    - 与主题相关的搜索关键词（8-12个）
  - 包含中英文关键词
  - 包含产品名、公司名、人名等

- [x] 3.3 实现联网搜索数据源推荐
  - 使用 DashScope enable_search 参数启用联网搜索
  - 设计 prompt 模板，要求搜索与主题相关的 RSS 源和公众号
  - 返回数据源名称、类型（rss/wechat_mp）、URL 或微信号、简介
  - 推荐 4-6 个真实可用的外部数据源

## 任务 4：主题新闻聚合 API

- [x] 4.1 实现 GET /api/topics/{id}/news
  - 获取主题相关新闻
  - 搜索 rss_entries 和 news_items 表
  - 支持按单个关键词或全部关键词查询

- [x] 4.2 实现关键词分组聚合
  - 为每个关键词单独调用搜索
  - 返回按关键词分组的新闻列表
  - 每个关键词返回 limit 条新闻（默认 50）

## 任务 5：前端 - 新建主题弹窗

- [x] 5.1 创建前端文件
  - 创建 `hotnews/hotnews/web/static/js/topic-tracker.js`
  - 创建 `hotnews/hotnews/web/static/css/topic-tracker.css`

- [x] 5.2 实现新建主题弹窗 HTML
  - 主题名称输入框
  - AI 生成关键词和推荐源按钮
  - 关键词标签编辑区域（支持添加/删除）
  - 推荐数据源列表（支持勾选/全选/取消全选）
  - 取消/确认按钮

- [x] 5.3 实现弹窗交互逻辑
  - 打开/关闭弹窗
  - 调用 AI 生成关键词和推荐源 API
  - 显示加载状态
  - 关键词标签的添加/删除
  - 推荐数据源的勾选/全选/取消全选
  - 表单验证

- [x] 5.4 实现主题创建提交
  - 收集表单数据
  - 调用 POST /api/topics
  - 成功后关闭弹窗并刷新主题列表
  - 错误处理和提示

## 任务 6：前端 - 主题栏目区域

- [x] 6.1 实现主题栏目区域渲染
  - 创建 Topic_Section 容器
  - 显示主题名称和图标
  - 添加配置、刷新、删除按钮

- [x] 6.2 实现关键词卡片渲染
  - 复用 platform-card 样式
  - 显示关键词名称
  - 显示新闻列表（默认 50 条）
  - 支持刷新单个卡片

- [x] 6.3 实现新闻列表渲染
  - 显示新闻标题、来源、时间
  - 点击标题在新标签页打开
  - 复用现有新闻列表样式

- [ ] 6.4 实现卡片右键菜单
  - 复用现有卡片右键菜单机制
  - 支持：置顶、置底、隐藏卡片、编辑顺序、取消关注
  - 与其他栏目下的卡片保持一致

- [x] 6.5 实现主题配置弹窗
  - 编辑主题名称
  - 编辑关键词列表
  - 保存更改

## 任务 7：前端 - 集成到 viewer.html

- [x] 7.1 添加新建主题按钮
  - 在"我的关注"Tab 区域添加"+ 新建主题"按钮
  - 点击打开新建主题弹窗

- [x] 7.2 加载并显示用户主题
  - 页面加载时获取用户主题列表
  - 在"我的关注"Tab 中渲染主题栏目区域
  - 主题区域显示在用户关注的标签卡片之前

- [x] 7.3 引入 JS 和 CSS 文件
  - 在 viewer.html 中引入 topic-tracker.js
  - 在 viewer.html 中引入 topic-tracker.css

## 任务 8：测试与优化

- [ ] 8.1 功能测试
  - 测试主题创建流程
  - 测试关键词生成（含联网搜索）
  - 测试新闻聚合显示
  - 测试主题编辑和删除
  - 测试卡片右键菜单功能

- [x] 8.2 错误处理
  - AI 生成失败的处理（降级为手动输入）
  - AI 生成超时处理（30秒超时）
  - 网络错误的处理
  - 用户未登录的处理

- [ ] 8.3 性能优化
  - 关键词卡片懒加载
  - 新闻列表分页加载
  - 缓存优化

- [ ] 8.4 边界情况测试
  - 主题名称为空/过长
  - 关键词数量边界（1-20个）
  - 无搜索结果时的显示

## 待完成任务

### 高优先级
1. **卡片右键菜单集成** (任务 6.4)
   - 需要研究现有右键菜单机制
   - 为主题关键词卡片添加右键菜单支持

### 中优先级
2. **RSS 源验证和创建**
   - 用户选择推荐的 RSS 源时，验证 URL 是否可访问
   - 将用户添加的 RSS 源写入 rss_sources 表（source_type='user'）

3. **功能测试** (任务 8.1)
   - 完整测试主题创建、编辑、删除流程
   - 测试 AI 生成功能

### 低优先级
4. **性能优化** (任务 8.3)
   - 关键词卡片懒加载
   - 新闻列表分页
