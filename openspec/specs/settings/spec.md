# Settings Unified Following Specification

## Purpose
统一的"已关注"设置页面，显示用户关注的标签和订阅的 RSS 源。

## Requirements

### Requirement: Unified Following List
用户必须能在单一列表中看到所有关注的标签和订阅的源。

#### Scenario: Display unified list
- **WHEN** 设置页面加载
- **THEN** 显示关注的标签和订阅的源在同一容器中
- **AND** 使用图标区分类型（🏷️ 标签、📰 RSS、🔗 自定义源）

#### Scenario: Empty state
- **WHEN** 列表为空
- **THEN** 显示空状态提示信息

#### Scenario: Unfollow tag
- **WHEN** 用户点击已关注的标签
- **THEN** 取消关注该标签

#### Scenario: Unsubscribe source
- **WHEN** 用户点击已订阅的源
- **THEN** 取消订阅该源

### Requirement: Drag-to-Reorder
用户必须能够拖拽重新排序关注列表。

#### Scenario: Drag item
- **WHEN** 用户拖拽项目到新位置
- **THEN** 立即更新视觉顺序（乐观更新）
- **AND** 持久化新顺序到后端

#### Scenario: Reorder fails
- **WHEN** 顺序持久化失败
- **THEN** 回滚到之前的顺序
- **AND** 显示错误信息

### Requirement: Tab-Based Selector
用户必须能通过标签页切换标签选择器和源选择器。

#### Scenario: Switch tabs
- **WHEN** 用户点击"🏷️ 标签"或"📡 订阅源"标签
- **THEN** 切换到对应的选择器
- **AND** 无需页面刷新

### Requirement: Source Search
用户必须能搜索 RSS 和自定义源。

#### Scenario: Search sources
- **WHEN** 用户输入至少 2 个字符
- **THEN** 查询匹配的源
- **AND** 防抖 300ms

#### Scenario: Display search results
- **WHEN** 搜索返回结果
- **THEN** 显示源名称、类型图标、订阅状态

### Requirement: Subscription Actions
用户必须能在源选择器中直接订阅/取消订阅。

#### Scenario: Subscribe to source
- **WHEN** 用户点击"订阅"按钮
- **THEN** 乐观更新 UI
- **AND** 调用订阅 API
- **AND** 更新关注列表

#### Scenario: Subscription fails
- **WHEN** 订阅 API 调用失败
- **THEN** 回滚 UI 状态
- **AND** 显示错误信息

### Requirement: Statistics Display
设置页面必须显示准确的统计数据。

#### Scenario: Display counts
- **WHEN** 设置页面加载
- **THEN** 显示"关注标签"数量
- **AND** 显示"订阅源"数量

#### Scenario: Update counts
- **WHEN** 用户关注/取消关注
- **THEN** 立即更新对应计数
