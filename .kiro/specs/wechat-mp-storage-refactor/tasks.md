# Implementation Plan: 公众号存储架构重构

## Overview

将公众号数据从分散的三个表统一到 `featured_wechat_mps` 作为主表，新增 `source` 和 `added_by_user_id` 字段区分来源，修改主题追踪 API 写入主表，并迁移现有数据。

## Tasks

- [x] 1. 数据库表结构变更
  - [x] 1.1 在 `db_online.py` 中为 `featured_wechat_mps` 表添加 `source` 字段
    - 添加 `_ensure_column("featured_wechat_mps", "source", "TEXT DEFAULT 'admin'")`
    - _Requirements: 1.2_
  - [x] 1.2 在 `db_online.py` 中为 `featured_wechat_mps` 表添加 `added_by_user_id` 字段
    - 添加 `_ensure_column("featured_wechat_mps", "added_by_user_id", "INTEGER")`
    - _Requirements: 1.3_

- [x] 2. 创建公众号服务模块
  - [x] 2.1 创建 `hotnews/hotnews/kernel/services/mp_service.py`
    - 实现 `MPService` 类
    - 实现 `get_or_create_mp()` 方法：获取或创建公众号，支持 source 和 added_by_user_id 参数
    - 实现 `get_mp_by_fakeid()` 方法：根据 fakeid 查询公众号
    - 实现 `get_mp_by_nickname()` 方法：根据昵称查询公众号（用于 AI 推荐时查重）
    - _Requirements: 1.1, 2.3_
  - [ ]* 2.2 编写 `mp_service.py` 单元测试
    - 测试 `get_or_create_mp()` 创建新公众号
    - 测试 `get_or_create_mp()` 获取已存在公众号（幂等性）
    - 测试 source 字段正确设置
    - 测试 added_by_user_id 数据完整性
    - _Requirements: 1.2, 1.3, 2.3_
  - [ ]* 2.3 编写属性测试验证公众号创建
    - **Property 1: 公众号创建统一写入主表**
    - **Property 2: source 字段正确标记来源**
    - **Property 3: added_by_user_id 数据完整性**
    - **Property 4: 公众号不重复创建（幂等性）**
    - **Validates: Requirements 1.1, 1.2, 1.3, 2.3**

- [x] 3. Checkpoint - 确保服务模块测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 4. 修改主题追踪 API
  - [x] 4.1 修改 `topic_api.py` 中的 `_create_wechat_mp_source()` 函数
    - 改为调用 `MPService.get_or_create_mp()` 写入 `featured_wechat_mps`
    - 设置 `source='ai_recommend'`
    - 返回格式保持兼容：`{"id": "mp-{fakeid}", "name": ..., "type": "wechat_mp", ...}`
    - _Requirements: 2.1, 2.2_
  - [x] 4.2 修改 `topic_api.py` 中的 `get_source_info()` 和 `get_sources_batch()` 函数
    - 支持从 `featured_wechat_mps` 查询公众号信息
    - 保持对旧数据（rss_sources 中的公众号）的兼容
    - _Requirements: 2.1_
  - [ ]* 4.3 编写主题追踪 API 测试
    - 测试 AI 推荐公众号写入 featured_wechat_mps
    - 测试推荐的公众号 enabled=1
    - **Property 5: AI 推荐公众号默认启用**
    - **Validates: Requirements 2.1, 2.2**

- [x] 5. 修改用户订阅逻辑（可选优化）
  - [x] 5.1 修改 `wechat_admin.py` 中的 `subscribe()` 函数
    - 订阅时调用 `MPService.get_or_create_mp()` 确保公众号在主表中存在
    - 设置 `source='user'` 和 `added_by_user_id`
    - _Requirements: 3.1, 3.2_
  - [ ]* 5.2 编写用户订阅测试
    - 测试用户添加公众号写入 featured_wechat_mps
    - 测试 added_by_user_id 正确记录
    - **Property 6: 用户添加后自动订阅**
    - **Validates: Requirements 3.1, 3.2, 3.3**

- [x] 6. Checkpoint - 确保 API 修改测试通过
  - 确保所有测试通过，如有问题请询问用户

- [x] 7. 创建数据迁移脚本
  - [x] 7.1 创建 `hotnews/scripts/migrate_wechat_mp_sources.py`
    - 实现 `migrate_wechat_mp_from_rss_sources()` 函数
    - 查询 `rss_sources WHERE category='wechat_mp'`
    - 解析 `url` (wechat://mp/{wechat_id}) 获取 wechat_id
    - 插入 `featured_wechat_mps` (source='ai_recommend')
    - 处理重复记录（跳过已存在的 fakeid）
    - 记录迁移日志
    - _Requirements: 5.1_
  - [x] 7.2 实现迁移后清理功能
    - 删除 `rss_sources` 中 `category='wechat_mp'` 的数据
    - _Requirements: 1.4, 5.2_
  - [x] 7.3 实现回滚功能
    - 根据迁移日志恢复数据
    - _Requirements: 5.3_
  - [ ]* 7.4 编写迁移脚本测试
    - 测试迁移数据完整性
    - 测试重复记录处理
    - 测试回滚功能
    - **Property 7: 迁移数据完整性（Round-trip）**
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [x] 8. 验证订阅源 API 过滤
  - [x] 8.1 确认 `source_subscription_api.py` 已过滤公众号
    - 检查 `/api/sources/all` 查询条件包含 `category != 'wechat_mp'`
    - 检查 `/api/sources/search` 查询条件包含 `category != 'wechat_mp'`
    - _Requirements: 4.1, 4.2_

- [x] 9. Final Checkpoint - 完整功能验证
  - 确保所有测试通过
  - 验证主题追踪推荐公众号能被调度器抓取
  - 如有问题请询问用户

- [x] 10. 清理测试数据和冗余代码
  - [x] 10.1 删除 `rss_sources` 中 `category='wechat_mp'` 的测试数据
    - 运行迁移脚本后自动清理
    - _Requirements: 1.4, 4.2_
  - [x] 10.2 清理 `topic_api.py` 中不再使用的旧代码
    - 移除写入 `rss_sources` 的旧逻辑（如果有残留）
    - _Requirements: 2.1_

## Notes

- 任务标记 `*` 为可选测试任务，可跳过以加快 MVP 进度
- 每个任务引用具体的需求编号以便追溯
- 迁移脚本需要在生产环境手动执行，建议先在测试环境验证
- 属性测试验证通用正确性属性，单元测试验证具体示例和边界情况
