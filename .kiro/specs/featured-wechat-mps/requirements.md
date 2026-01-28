# Requirements Document: 精选公众号功能

## Introduction

本功能在 Admin 后台新增「公众号订阅」页签，管理员可以管理精选公众号列表。前端新增「精选公众号」栏目，展示管理员精选的公众号及其最新文章。

与现有的用户自助订阅功能不同，精选公众号由管理员统一管理，面向所有用户展示，无需用户自行配置微信认证。

## Glossary

- **Admin_Page**: 管理后台页面，位于 `/admin`
- **Featured_MP_Tab**: Admin 后台中的「公众号订阅」页签
- **Featured_MP**: 精选公众号，由管理员添加的推荐公众号
- **Batch_Import**: 批量导入功能，通过 CSV 文件批量添加公众号
- **Preview_Result**: 批量导入预览结果，显示匹配状态
- **Shared_Credentials**: 共享凭证池，用于调用微信 API
- **Category_Tab**: 首页栏目标签，如「热点」「科技」等
- **Platform_Card**: 首页的平台卡片，显示某个来源的新闻列表

## Requirements

### Requirement 1: Admin 精选公众号管理页面

**User Story:** 作为管理员，我希望有一个专门的页面管理精选公众号，以便统一维护推荐给用户的公众号列表。

#### Acceptance Criteria

1. WHEN 管理员访问 Admin_Page, THE Admin_Page SHALL 显示「公众号订阅」页签
2. WHEN 管理员点击「公众号订阅」页签, THE Featured_MP_Tab SHALL 显示精选公众号列表
3. THE Featured_MP_Tab SHALL 显示每个公众号的头像、名称、分类、状态和操作按钮
4. THE Featured_MP_Tab SHALL 支持按分类和状态筛选公众号列表
5. THE Featured_MP_Tab SHALL 显示「批量导入」「单个添加」「下载模板」三个操作按钮
6. WHEN 列表为空时, THE Featured_MP_Tab SHALL 显示引导提示

### Requirement 2: 批量导入公众号

**User Story:** 作为管理员，我希望能够通过 CSV 文件批量导入公众号，以便快速建立精选列表。

#### Acceptance Criteria

1. WHEN 管理员点击「批量导入」按钮, THE Featured_MP_Tab SHALL 显示导入弹窗
2. THE 导入弹窗 SHALL 支持拖拽上传 CSV 文件或直接粘贴公众号名称列表
3. THE CSV 格式 SHALL 支持：仅名称、名称+分类、带表头三种格式
4. WHEN 管理员提交导入内容, THE 系统 SHALL 自动搜索匹配公众号信息
5. THE Preview_Result SHALL 显示每行的匹配状态：found/not_found/duplicate/exists
6. THE Preview_Result SHALL 允许管理员勾选要导入的公众号
7. WHEN 管理员确认导入, THE 系统 SHALL 将选中的公众号添加到精选列表
8. IF 导入过程中出错, THEN THE 系统 SHALL 显示错误信息并支持重试
9. THE 系统 SHALL 提供 CSV 模板下载功能

### Requirement 3: 单个添加公众号

**User Story:** 作为管理员，我希望能够搜索并单个添加公众号，以便灵活管理精选列表。

#### Acceptance Criteria

1. WHEN 管理员点击「单个添加」按钮, THE Featured_MP_Tab SHALL 显示搜索弹窗
2. WHEN 管理员输入关键词, THE 系统 SHALL 调用微信搜索 API 查询公众号
3. THE 搜索结果 SHALL 显示公众号头像、名称、简介和添加按钮
4. WHEN 管理员点击添加按钮, THE 系统 SHALL 将公众号添加到精选列表
5. IF 公众号已在精选列表中, THEN THE 系统 SHALL 显示「已添加」状态

### Requirement 4: 精选公众号编辑与删除

**User Story:** 作为管理员，我希望能够编辑和删除精选公众号，以便维护列表质量。

#### Acceptance Criteria

1. WHEN 管理员点击「编辑」按钮, THE Featured_MP_Tab SHALL 显示编辑弹窗
2. THE 编辑弹窗 SHALL 允许修改分类、排序权重、启用状态
3. WHEN 管理员点击「删除」按钮, THE 系统 SHALL 显示确认对话框
4. WHEN 管理员确认删除, THE 系统 SHALL 从精选列表中移除该公众号
5. THE Featured_MP_Tab SHALL 支持拖拽排序功能
6. THE Featured_MP_Tab SHALL 支持批量启用/禁用/删除操作

### Requirement 5: 精选公众号数据导出

**User Story:** 作为管理员，我希望能够导出精选公众号列表，以便备份和迁移。

#### Acceptance Criteria

1. THE Featured_MP_Tab SHALL 提供「导出」功能
2. WHEN 管理员点击导出, THE 系统 SHALL 生成 CSV 文件下载
3. THE 导出文件 SHALL 包含公众号名称、fakeid、分类、状态、排序、添加时间

### Requirement 6: 前端精选公众号栏目

**User Story:** 作为用户，我希望在首页看到精选公众号栏目，以便发现优质内容来源。

#### Acceptance Criteria

1. THE 首页 SHALL 显示「精选公众号」栏目，位于「每日AI早报」后面
2. THE 栏目 SHALL 以 Platform_Card 形式展示每个精选公众号
3. EACH Platform_Card SHALL 显示公众号名称、头像和最新 50 篇文章
4. THE 文章列表 SHALL 按发布时间倒序排列
5. WHEN 用户点击文章, THE 系统 SHALL 在新标签页打开微信文章原文
6. THE 栏目 SHALL 只显示启用状态的精选公众号
7. THE 栏目 SHALL 按 sort_order 排序显示公众号卡片

### Requirement 7: 文章抓取集成

**User Story:** 作为系统，我需要定期抓取精选公众号的文章，以便用户能看到最新内容。

#### Acceptance Criteria

1. THE 系统 SHALL 复用现有的公众号抓取机制抓取精选公众号文章
2. THE 系统 SHALL 优先使用共享凭证池进行抓取
3. THE 文章 SHALL 存储在现有的 wechat_mp_articles 表中
4. THE 系统 SHALL 自动清理超过 30 天的旧文章
5. IF 抓取失败, THEN THE 系统 SHALL 记录日志并在下次重试
6. THE 系统 SHALL 控制请求间隔（文章列表 ≥ 2秒）

### Requirement 8: 数据维护

**User Story:** 作为系统，我需要定期维护精选公众号数据，确保数据准确性。

#### Acceptance Criteria

1. THE 系统 SHALL 每天同步一次公众号信息（名称、头像、简介可能变更）
2. THE 系统 SHALL 定期检测文章 URL 有效性，失效文章标记为不可用
3. THE 系统 SHALL 检测公众号活跃度，30天无更新的标记为"疑似停更"
4. THE Admin 列表 SHALL 显示停更警告标识
5. THE 前端查询 SHALL 过滤失效文章

### Requirement 9: 数据持久化

**User Story:** 作为系统管理员，我希望精选公众号数据能够安全持久化存储。

#### Acceptance Criteria

1. THE Featured_MP SHALL 存储在 featured_wechat_mps 表中
2. THE 表 SHALL 包含 fakeid、nickname、round_head_img、signature、category、sort_order、enabled 等字段
3. THE fakeid SHALL 作为唯一标识，不允许重复添加
4. THE 系统 SHALL 记录每个公众号的添加时间和更新时间

### Requirement 10: 缓存策略

**User Story:** 作为系统，我需要合理的缓存策略以提高性能。

#### Acceptance Criteria

1. THE 精选公众号列表 SHALL 缓存 5 分钟
2. THE 公众号文章 SHALL 缓存 30 分钟
3. WHEN Admin 修改精选公众号, THE 系统 SHALL 自动清除相关缓存
4. THE 搜索结果 SHALL NOT 缓存（实时搜索）
5. THE 批量导入预览 SHALL 缓存 10 分钟（preview_id 有效期）

### Requirement 11: 错误处理

**User Story:** 作为管理员，我希望系统能够妥善处理各种错误情况。

#### Acceptance Criteria

1. IF 微信搜索 API 不可用, THEN THE 系统 SHALL 显示友好的错误提示
2. IF 共享凭证池为空或全部过期, THEN THE 系统 SHALL 提示管理员配置凭证
3. IF 批量导入中断, THEN THE 系统 SHALL 支持断点续传，已匹配的不丢失
4. IF 请求被限流, THEN THE 系统 SHALL 自动延迟重试
5. THE 系统 SHALL 记录所有操作日志用于问题排查
6. THE 搜索接口 SHALL 控制间隔 ≥ 3秒
7. THE 文章列表接口 SHALL 控制间隔 ≥ 2秒
