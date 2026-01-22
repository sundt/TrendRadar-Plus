## MODIFIED Requirements

### Requirement: 支持真实 NBA 数据源
系统 MUST 支持抓取真实 NBA **当日赛程 + 比分（scoreboard）** 数据，并将其映射为统一新闻条目结构（title/url/timestamp/rank）。

#### Scenario: NBA 数据抓取成功（Provider 模式）
- **WHEN** 定时任务触发一次 NBA Provider 抓取
- **THEN** 系统产出 NBA 平台的 N 条条目（N > 0），每条包含可点击 URL、比赛时间与当前比分/状态信息

#### Scenario: NBA Provider 失败降级（Provider 模式）
- **WHEN** NBA Provider 请求失败（超时/限流/解析失败）
- **THEN** 系统仅标记 NBA 平台失败，不影响其他平台抓取与入库

#### Scenario: Viewer 读取落库结果（非请求触发）
- **WHEN** 用户访问 `/viewer` 或 `/api/news`
- **THEN** 系统从落库结果读取 NBA 平台条目，而不是在请求中直接抓取外部接口
