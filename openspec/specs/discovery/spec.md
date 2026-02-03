# Discovery Tab Specification

## Purpose
"新发现"栏目展示 AI 发现的热门标签及其新闻，位于"我的关注"右侧，无需登录即可查看。

## Requirements

### Requirement: Tab Display
新发现栏目必须正确显示在导航中。

#### Scenario: Tab position
- **WHEN** 用户访问首页
- **THEN** "✨ 新发现"栏目显示在"我的关注"右侧
- **AND** 无需登录即可查看内容

### Requirement: Tag Card Display
展示最多 30 个符合晋升标准的 NEW 动态标签。

#### Scenario: Display tag cards
- **WHEN** 新发现栏目激活
- **THEN** 最多显示 30 个标签卡片
- **AND** 每个卡片显示标签名称、图标、NEW 徽章
- **AND** 显示发现日期（格式：发现于 MM-DD）
- **AND** 按热度（occurrence_count）降序排列

#### Scenario: Empty state
- **WHEN** 没有符合标准的 NEW 标签
- **THEN** 显示空状态提示

### Requirement: News List
每个标签卡片显示最多 50 条相关新闻。

#### Scenario: Display news
- **WHEN** 用户查看标签卡片
- **THEN** 显示最多 50 条新闻
- **AND** 每条显示序号、标题、发布日期
- **AND** 按发布时间降序排列

#### Scenario: Click news
- **WHEN** 用户点击新闻标题
- **THEN** 在新标签页打开原文链接

### Requirement: One-Click Follow
用户可以快速关注感兴趣的标签。

#### Scenario: Follow tag (logged in)
- **WHEN** 已登录用户右键点击标签卡片
- **THEN** 显示上下文菜单包含"➕ 一键关注"
- **AND** 点击后调用 API 关注该标签
- **AND** 显示 Toast 提示"已关注"
- **AND** 清除"我的关注"前端缓存

#### Scenario: Follow tag (not logged in)
- **WHEN** 未登录用户点击"一键关注"
- **THEN** 弹出登录框

### Requirement: Tag Promotion Criteria
标签必须符合晋升标准才能显示。

#### Scenario: Fast track 4h
- **WHEN** 标签首次发现 ≥ 4小时前
- **AND** 出现次数 ≥ 8
- **AND** 置信度 ≥ 0.9
- **THEN** 标签符合显示条件

#### Scenario: Standard track
- **WHEN** 标签首次发现 ≤ 3天前
- **AND** 出现次数 ≥ 10
- **AND** 置信度 ≥ 0.7
- **THEN** 标签符合显示条件
