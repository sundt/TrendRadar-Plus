## ADDED Requirements

### Requirement: 支持真实 NBA 数据源
系统 MUST 支持抓取真实 NBA **当日赛程 + 比分（scoreboard）** 数据，并将其映射为统一新闻条目结构（title/url/timestamp/rank）。

#### Scenario: NBA 数据抓取成功
- **WHEN** 定时任务触发一次抓取
- **THEN** 系统返回 NBA 平台的 N 条条目（N > 0），每条包含可点击 URL、比赛时间与当前比分/状态信息

#### Scenario: NBA Provider 失败降级
- **WHEN** NBA Provider 请求失败（超时/限流/解析失败）
- **THEN** 系统仅标记 NBA 平台失败，不影响其他平台抓取与入库

### Requirement: 支持真实游戏排行数据源
系统 MUST 支持抓取 Steam **New & Trending（新作热度）** 榜单，并映射为统一新闻条目结构（title/url/timestamp/rank）。

#### Scenario: 游戏排行抓取成功
- **WHEN** 定时任务触发一次抓取
- **THEN** 系统返回 Steam New & Trending 的 N 条条目（N > 0），rank 反映榜单顺序

#### Scenario: 游戏 Provider 失败降级
- **WHEN** 游戏 Provider 请求失败（超时/限流/解析失败）
- **THEN** 系统仅标记游戏平台失败，不影响其他平台抓取与入库

### Requirement: Provider 配置化
系统 MUST 支持通过配置选择具体 Provider 与参数（包括但不限于 API base URL、区域/语言、API Key）。

#### Scenario: 禁用某 Provider
- **WHEN** 用户在配置中禁用 NBA 或游戏 provider
- **THEN** 系统不再请求该 provider，但其他平台仍正常抓取
