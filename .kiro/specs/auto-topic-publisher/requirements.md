# 需求文档

## 简介

主题自动追踪系统，实现特定主题（如苹果公司、特斯拉等）新闻的自动追踪和聚合展示。用户输入主题名称后，系统使用 AI 自动生成相关关键词，用户确认后自动加载相关新闻。系统 100% 复用 hotnews 现有数据源（news_items、rss_entries、tags）和搜索 API。

**范围：** 主题配置 + AI 关键词生成 + 新闻聚合展示

## 术语表

- **Topic_Config**: 主题配置，包含主题名称、追踪关键词、关联数据源等设置
- **Topic_Tracker**: 主题追踪系统，负责关键词生成、数据源管理和新闻聚合的核心服务
- **Search_API**: 现有的新闻搜索接口 `/api/search`，支持关键词和标签搜索
- **Keyword_Generator**: 关键词生成服务，基于 AIModelManager 为主题自动生成相关关键词
- **Topic_RSS_Source**: 主题关联的 RSS 数据源，用户可为特定主题添加专属 RSS 源
- **Topic_Section**: 主题栏目区域，一个主题对应一个大区域，包含多个关键词卡片
- **Keyword_Card**: 关键词卡片，显示单个关键词匹配的新闻列表

## 需求

### 需求 1：主题创建与关键词生成

**用户故事：** 作为用户，我希望输入主题名称后系统能自动生成相关关键词，以便快速配置追踪规则。

#### 验收标准

1. WHEN 用户输入主题名称（如"苹果公司"） THEN Keyword_Generator SHALL 调用 AIModelManager 自动生成 emoji 图标和相关关键词列表
2. WHEN AI 生成完成 THEN Topic_Tracker SHALL 通过联网搜索（DashScope enable_search）获取真实可用的推荐数据源
3. WHEN AI 生成完成 THEN Topic_Tracker SHALL 显示生成的 emoji 图标、关键词和推荐数据源供用户确认和编辑
3. WHEN 用户手动添加关键词 THEN Topic_Tracker SHALL 将新关键词追加到关键词列表
4. WHEN 用户删除某个关键词 THEN Topic_Tracker SHALL 从关键词列表中移除该关键词
5. WHEN 用户确认关键词配置 THEN Topic_Tracker SHALL 创建 Topic_Config 记录并保存到数据库
6. IF AI 关键词生成失败 THEN Keyword_Generator SHALL 返回错误信息并允许用户手动输入关键词
7. THE Topic_Config SHALL 支持存储以下字段：id、name、icon（AI 自动生成的 emoji）、keywords（关键词列表）、enabled、sort_order、created_at、updated_at

### 需求 2：AI 数据源推荐与一键添加

**用户故事：** 作为用户，我希望 AI 能推荐与主题相关的外部数据源（RSS 地址、公众号），并支持一键添加到系统，以便我不需要自己去查找 RSS 地址。

#### 验收标准

1. WHEN 用户输入主题名称并生成关键词 THEN Keyword_Generator SHALL 同时推荐相关的外部数据源（RSS URL、公众号微信号）
2. WHEN AI 推荐数据源 THEN Topic_Tracker SHALL 显示推荐列表，包含数据源名称、类型（RSS/公众号）、地址、简介
3. WHEN 用户点击推荐数据源的"添加"按钮 THEN Topic_Tracker SHALL 将该外部源添加到 rss_sources 表（source_type='user'）并关联到当前主题
4. WHEN 用户批量选择多个推荐数据源 THEN Topic_Tracker SHALL 支持一键批量添加
5. WHEN 添加 RSS 源时 THEN Topic_Tracker SHALL 验证 URL 是否能正常抓取，验证失败则提示用户
6. WHEN 添加新 RSS 源且验证通过 THEN Topic_Tracker SHALL 插入 rss_sources 表并同时添加到 user_rss_subscriptions（用户订阅）
7. WHEN 添加公众号时 THEN Topic_Tracker SHALL 根据微信号创建公众号订阅记录
8. WHEN 用户手动输入 RSS 源 URL THEN Topic_Tracker SHALL 验证 URL 格式并添加到系统
9. WHEN 用户删除主题关联的数据源 THEN Topic_Tracker SHALL 解除 topic_rss_sources 关联关系
10. WHEN 聚合新闻时 THEN Topic_Tracker SHALL 优先从主题关联的数据源（通过 topic_rss_sources）获取数据
11. THE 用户添加的数据源 SHALL 在 admin 后台的 RSS 管理中可见（source_type='user'）

### 需求 3：主题配置管理

**用户故事：** 作为用户，我希望能够管理已创建的主题，以便维护我的追踪列表。

#### 验收标准

1. WHEN 用户查看主题列表 THEN Topic_Tracker SHALL 显示所有已创建的主题及其关键词
2. WHEN 用户修改主题关键词 THEN Topic_Tracker SHALL 更新对应的 Topic_Config 记录
3. WHEN 用户删除主题 THEN Topic_Tracker SHALL 删除对应的 Topic_Config 记录
4. WHEN 用户暂停主题追踪 THEN Topic_Tracker SHALL 将 Topic_Config 的 enabled 字段设为 0
5. WHEN 用户恢复主题追踪 THEN Topic_Tracker SHALL 将 Topic_Config 的 enabled 字段设为 1

### 需求 4：新闻聚合与展示

**用户故事：** 作为用户，我希望确认主题配置后系统能自动加载相关新闻，以便我快速浏览感兴趣的内容。

#### 验收标准

1. WHEN 用户确认主题配置 THEN Topic_Tracker SHALL 创建一个主题栏目区域（Topic_Section）
2. WHEN 显示主题栏目 THEN Topic_Tracker SHALL 为每个关键词创建一个独立的 Keyword_Card
3. WHEN 显示 Keyword_Card THEN Topic_Tracker SHALL 显示该关键词匹配的新闻列表，默认 50 条
4. WHEN 主题有关联的 RSS 源 THEN Topic_Tracker SHALL 优先从关联源获取数据，再补充其他数据源
5. WHEN 聚合新闻时 THEN Topic_Tracker SHALL 从 news_items、rss_entries、tags 三个数据源获取数据
6. WHEN 显示新闻列表 THEN Topic_Tracker SHALL 按发布时间倒序排列，并显示标题、来源、发布时间
7. WHEN 用户点击卡片刷新按钮 THEN Topic_Tracker SHALL 重新调用 Search_API 获取该关键词的最新新闻
8. WHEN 用户点击新闻标题 THEN Topic_Tracker SHALL 在新标签页打开原文链接
9. WHEN 搜索关键词时 THEN Topic_Tracker SHALL 在新闻标题中进行 LIKE 匹配（中英文关键词分别搜索，各自独立卡片）
10. THE 每个关键词卡片 SHALL 独立显示该关键词匹配的新闻，不与其他关键词合并

### 需求 5：前端页面与卡片管理

**用户故事：** 作为用户，我希望有一个直观的操作界面，并能像管理其他卡片一样管理主题卡片。

#### 验收标准

1. THE Topic_Tracker SHALL 在 viewer.html 页面的"我的关注"Tab 下添加"+ 新建主题"按钮
2. WHEN 用户创建主题 THEN Topic_Tracker SHALL 在"我的关注"Tab 中添加一个主题栏目区域（Topic_Section）
3. WHEN 显示主题栏目 THEN Topic_Tracker SHALL 显示主题名称作为区域标题，包含配置按钮和刷新按钮
4. WHEN 显示主题栏目 THEN Topic_Tracker SHALL 在区域内显示多个 Keyword_Card（每个关键词一个卡片）
5. WHEN 显示 Keyword_Card THEN Topic_Tracker SHALL 复用 viewer.html 的 platform-card 样式
6. THE Topic_Tracker SHALL 将主题栏目区域和原有栏目卡片混合显示
7. THE Topic_Tracker SHALL 提供新建主题弹窗，包含主题名称输入框、关键词编辑区域、RSS 源添加区域
8. WHEN AI 生成关键词时 THEN Topic_Tracker SHALL 显示加载状态
9. WHEN 操作成功或失败 THEN Topic_Tracker SHALL 显示相应的提示信息
10. WHEN 用户右键点击 Keyword_Card THEN Topic_Tracker SHALL 显示上下文菜单：置顶、置底、隐藏卡片、编辑顺序、取消关注
11. THE Keyword_Card 的排序和管理机制 SHALL 与其他栏目下的卡片保持一致

### 需求 6：登录与权限

**用户故事：** 作为用户，我希望我的主题配置是私有的，只有我能看到和管理。

#### 验收标准

1. WHEN 用户未登录 THEN Topic_Tracker SHALL 隐藏"+ 新建主题"按钮或点击时提示登录
2. WHEN 用户未登录访问主题 API THEN Topic_Tracker SHALL 返回 401 未授权错误
3. WHEN 用户登录后 THEN Topic_Tracker SHALL 只显示该用户创建的主题
4. WHEN 用户尝试访问其他用户的主题 THEN Topic_Tracker SHALL 返回 403 禁止访问错误
5. THE 主题配置 SHALL 与用户账号绑定，用户在不同设备登录后能看到相同的主题
