# WeChat MP Subscription Specification

## Purpose
用户可以通过微信公众号账号授权，搜索并订阅公众号，系统定时抓取文章并展示在"我的关注"中。

## Requirements

### Requirement: Auth Info Management
用户必须能够配置微信公众号认证信息。

#### Scenario: No auth configured
- **WHEN** 用户访问公众号 Tab 且未配置认证
- **THEN** 显示"未认证"状态和"配置认证"按钮

#### Scenario: Auth valid
- **WHEN** 用户已配置认证且有效
- **THEN** 显示"已认证"状态和预估剩余有效时间

#### Scenario: Auth expired
- **WHEN** 用户认证已过期
- **THEN** 显示"已过期"状态和"更新认证"按钮

#### Scenario: Configure auth
- **WHEN** 用户点击配置认证按钮
- **THEN** 显示认证配置弹窗
- **AND** 展示获取 Cookie/Token 的操作指南

### Requirement: MP Search
用户必须能够搜索公众号。

#### Scenario: Search with valid auth
- **WHEN** 用户输入至少 2 个字符的搜索关键词
- **AND** 认证有效
- **THEN** 调用微信搜索 API 查询公众号
- **AND** 显示公众号列表（头像、名称、简介）

#### Scenario: Search without auth
- **WHEN** 用户未配置有效认证
- **THEN** 禁用搜索功能并提示需要先配置认证

#### Scenario: Rate limited
- **WHEN** 搜索触发频率限制
- **THEN** 显示"请求过于频繁，请稍后再试"

### Requirement: Subscription Management
用户必须能够订阅和取消订阅公众号。

#### Scenario: Subscribe
- **WHEN** 用户点击"订阅"按钮
- **THEN** 立即更新 UI（乐观更新）
- **AND** 调用订阅 API
- **AND** 保存 fakeid、名称、头像、简介到数据库

#### Scenario: Unsubscribe
- **WHEN** 用户点击取消订阅按钮
- **THEN** 立即更新 UI
- **AND** 调用取消订阅 API

### Requirement: Article Fetching
系统必须自动获取订阅公众号的文章。

#### Scenario: Scheduled fetch
- **WHEN** 定时任务触发
- **THEN** 抓取所有用户订阅的公众号文章
- **AND** 每个公众号每 30 分钟一次
- **AND** 请求间隔至少 2 秒

#### Scenario: Auth expired during fetch
- **WHEN** 用户认证已过期
- **THEN** 跳过该用户的抓取任务并记录日志

#### Scenario: Shared articles
- **WHEN** 多个用户订阅同一公众号
- **THEN** 共享文章数据，避免重复抓取

### Requirement: Auth Expiry Reminder
系统必须在认证即将过期时提醒用户。

#### Scenario: Expiring soon
- **WHEN** 认证剩余有效时间少于 30 分钟
- **THEN** 在公众号 Tab 显示警告提示

#### Scenario: Already expired
- **WHEN** 认证已过期
- **THEN** 显示醒目的过期提示
- **AND** 包含快捷链接跳转到认证配置页面
