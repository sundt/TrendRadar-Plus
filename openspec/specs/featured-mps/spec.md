# Featured WeChat MPs Specification

## Purpose
Admin 后台管理精选公众号列表，前端展示精选公众号及其最新文章。

## Requirements

### Requirement: Admin Management Page
管理员必须能在后台管理精选公众号。

#### Scenario: Access admin tab
- **WHEN** 管理员访问 Admin 页面
- **THEN** 显示「公众号订阅」页签

#### Scenario: Display MP list
- **WHEN** 管理员点击「公众号订阅」页签
- **THEN** 显示精选公众号列表
- **AND** 每项显示头像、名称、分类、状态、操作按钮

#### Scenario: Filter list
- **WHEN** 管理员选择筛选条件
- **THEN** 按分类和状态筛选列表

### Requirement: Batch Import
管理员必须能通过 CSV 批量导入公众号。

#### Scenario: Upload CSV
- **WHEN** 管理员点击「批量导入」
- **THEN** 显示导入弹窗
- **AND** 支持拖拽上传或粘贴名称列表

#### Scenario: Preview import
- **WHEN** 管理员提交导入内容
- **THEN** 自动搜索匹配公众号信息
- **AND** 显示匹配状态（found/not_found/duplicate/exists）

#### Scenario: Confirm import
- **WHEN** 管理员确认导入
- **THEN** 将选中的公众号添加到精选列表

### Requirement: Single Add
管理员必须能搜索并单个添加公众号。

#### Scenario: Search MP
- **WHEN** 管理员输入关键词
- **THEN** 调用微信搜索 API 查询公众号
- **AND** 显示头像、名称、简介、添加按钮

#### Scenario: Add MP
- **WHEN** 管理员点击添加按钮
- **THEN** 将公众号添加到精选列表

### Requirement: Edit and Delete
管理员必须能编辑和删除精选公众号。

#### Scenario: Edit MP
- **WHEN** 管理员点击「编辑」
- **THEN** 显示编辑弹窗
- **AND** 允许修改分类、排序权重、启用状态

#### Scenario: Delete MP
- **WHEN** 管理员确认删除
- **THEN** 从精选列表中移除该公众号

### Requirement: Frontend Display
前端必须展示精选公众号栏目。

#### Scenario: Display category
- **WHEN** 用户访问首页
- **THEN** 显示「精选公众号」栏目
- **AND** 位于「每日AI早报」后面

#### Scenario: Display MP cards
- **WHEN** 栏目加载
- **THEN** 以卡片形式展示每个精选公众号
- **AND** 显示名称、头像、最新 50 篇文章
- **AND** 只显示启用状态的公众号
- **AND** 按 sort_order 排序

#### Scenario: Click article
- **WHEN** 用户点击文章
- **THEN** 在新标签页打开微信文章原文

### Requirement: Article Fetching
系统必须定期抓取精选公众号的文章。

#### Scenario: Scheduled fetch
- **WHEN** 定时任务触发
- **THEN** 复用现有公众号抓取机制
- **AND** 优先使用共享凭证池
- **AND** 控制请求间隔（≥ 2秒）

#### Scenario: Cleanup old articles
- **WHEN** 文章超过 30 天
- **THEN** 自动清理旧文章
