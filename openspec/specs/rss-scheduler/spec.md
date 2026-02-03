# RSS Smart Scheduler Specification

## Purpose
基于历史更新模式的自适应智能调度器，为 RSS 源和自定义源提供智能抓取调度。

## Requirements

### Requirement: Source Statistics Storage
系统必须持久化存储每个源的调度统计数据。

#### Scenario: First fetch creates stats
- **WHEN** 系统首次抓取某个源
- **THEN** 在 source_stats 表中创建统计记录
- **AND** 包含 source_id、source_type、frequency_type、cadence 等字段

### Requirement: Frequency Classification
系统必须根据历史条目自动分类更新频率。

#### Scenario: Realtime frequency
- **WHEN** 平均间隔小于 6 小时或每日发布 5 条以上
- **THEN** 分类为 "realtime"，节奏 P0

#### Scenario: High frequency
- **WHEN** 平均间隔在 6-18 小时之间
- **THEN** 分类为 "high"，节奏 P1

#### Scenario: Daily frequency
- **WHEN** 平均间隔在 18-36 小时之间
- **THEN** 分类为 "daily"，节奏 P2

#### Scenario: Weekly frequency
- **WHEN** 平均间隔在 72-168 小时之间
- **THEN** 分类为 "weekly"，节奏 P4

#### Scenario: Insufficient history
- **WHEN** 历史条目少于 3 条
- **THEN** 默认使用 "daily" 频率和 P2 节奏

### Requirement: Publish Time Prediction
系统必须预测源的发布时间以优化抓取时机。

#### Scenario: Calculate publish time stats
- **WHEN** 分析源的历史条目
- **THEN** 计算最近 30 条条目的平均发布小时
- **AND** 计算发布小时的标准差（限制在 1.0-6.0 小时）

#### Scenario: Use prediction for scheduling
- **WHEN** 计算下次检查时间
- **THEN** 使用平均发布时间加一个标准差作为检查时间点

### Requirement: Hit Rate Tracking
系统必须追踪每个源的命中率。

#### Scenario: Track check count
- **WHEN** 每次抓取源后
- **THEN** 递增 check_count 计数

#### Scenario: Track hit count
- **WHEN** 抓取到新内容
- **THEN** 递增 hit_count 计数

### Requirement: Automatic Cadence Adjustment
系统必须根据实际更新频率自动调整抓取节奏。

#### Scenario: Periodic reanalysis
- **WHEN** 每 10 次检查后
- **THEN** 重新分析源的更新频率

#### Scenario: Early reanalysis on first hit
- **WHEN** 首次命中新内容且检查次数 ≤ 3
- **THEN** 立即重新分析更新频率

### Requirement: Failure Backoff
系统必须在抓取失败时进行智能退避。

#### Scenario: Rate limit error
- **WHEN** 遇到 429 或包含 "rate"/"频繁" 的错误
- **THEN** 退避 6 小时

#### Scenario: Forbidden error
- **WHEN** 遇到 403 或包含 "forbidden" 的错误
- **THEN** 退避 12 小时

#### Scenario: Success resets backoff
- **WHEN** 抓取成功
- **THEN** 重置失败计数和退避时间
