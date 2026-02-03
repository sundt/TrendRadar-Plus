# Auth State Sync Specification

## Purpose
登录/登出状态同步系统，提供即时 UI 更新，无需手动刷新页面。

## Requirements

### Requirement: Logout State Sync
用户点击"退出登录"后，UI 必须在 500ms 内更新为登出状态。

#### Scenario: User clicks logout
- **WHEN** 用户点击"退出登录"按钮
- **THEN** 显示加载指示器
- **AND** UI 在 500ms 内更新为登出状态
- **AND** 显示成功 Toast 通知
- **AND** 清除用户相关缓存

#### Scenario: Logout sync fails
- **WHEN** 状态同步失败
- **THEN** 自动触发页面刷新作为回退机制

### Requirement: Login State Sync
用户登录后，UI 必须立即显示用户头像/菜单。

#### Scenario: Email login success
- **WHEN** 用户通过邮箱密码登录成功
- **THEN** UI 立即更新显示用户头像
- **AND** "我的设置"链接变为可访问

#### Scenario: OAuth login redirect
- **WHEN** OAuth 登录重定向回来
- **THEN** 检测 `?login=timestamp` URL 参数
- **AND** 触发状态刷新
- **AND** 清理 URL 参数

### Requirement: Multi-Tab Synchronization
多标签页间的登录状态必须同步。

#### Scenario: Logout in one tab
- **WHEN** 用户在一个标签页登出
- **THEN** 所有其他标签页在 1 秒内更新状态
- **AND** 不产生重复 API 调用

### Requirement: Error Handling
认证操作失败时必须提供清晰反馈。

#### Scenario: Network error
- **WHEN** 网络错误发生
- **THEN** 显示错误 Toast 并提供重试选项

#### Scenario: Timeout error
- **WHEN** 操作超时（> 5秒）
- **THEN** 触发回退刷新机制
