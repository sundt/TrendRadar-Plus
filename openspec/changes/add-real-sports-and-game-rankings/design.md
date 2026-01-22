## Context
现有抓取以 NewsNow 聚合 API 为主，缺少 NBA/游戏这类“结构化/榜单型”真实数据源。需要新增 provider 适配层，避免把特定数据源逻辑硬编码进现有 NewsNow fetcher。

## Goals / Non-Goals
- Goals:
  - 支持真实 NBA 排名/赛程 与 Steam 游戏榜单
  - 可配置、可替换 provider，失败不影响现有抓取
  - 输出结构统一（title/url/timestamp/rank）
- Non-Goals:
  - 不做全量历史数据回填
  - 不做复杂的实时比分推送

## Decisions (Draft)
- Decision: 引入 provider 适配层（`providers/sports/*`, `providers/games/*`）并通过配置选择具体实现。
- Decision: 优先选择“无需反爬”的结构化 API（如 BallDontLie / TheSportsDB），避免首版依赖 `stats.nba.com`。
- Decision: Steam 优先采用 Store 的榜单/分类接口；必要时再加 HTML 解析作为 fallback。

## Risks / Trade-offs
- 风险：第三方 API 需要 Key/限额 → Mitigation：配置化 + fallback + 缓存
- 风险：Steam 非官方接口变更 → Mitigation：抽象 provider、加监控与快速回滚

## Migration Plan
- 增量引入：新平台作为额外“平台源”加入，不影响已有平台。
- 回滚：配置关闭新 provider 或从平台列表移除。

## Open Questions
- 最终 NBA/游戏榜单的“权威定义”与展示粒度（球队/比赛/球员；热销/在线/新作）。
