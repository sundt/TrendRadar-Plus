## ADDED Requirements

### Requirement: Viewer 读取后台落库结果
新闻 Viewer MUST 以“读取后台定时抓取并落库的结果”为主提供数据展示与 API 输出。

#### Scenario: 页面刷新不触发实时抓取
- **WHEN** 用户刷新页面或触发 AJAX 刷新（`/api/news`）
- **THEN** 系统仅返回已落库的最新数据快照，不在请求路径内执行外部抓取

#### Scenario: 抓取失败不影响页面可用性
- **WHEN** 某个 Provider 最近一次抓取失败
- **THEN** viewer 仍可返回其他平台的落库结果，并在对应平台记录失败状态（metrics）

### Requirement: 支持 RSS/HTML 站点类平台（标题+链接）
系统 MUST 支持接入 RSS/HTML 列表型数据源平台，并映射为统一新闻条目结构（title/url/timestamp/rank）。

#### Scenario: 财新平台抓取成功
- **WHEN** 定时任务触发一次财新平台抓取（RSS 优先，HTML fallback）
- **THEN** 系统落库 N 条新闻条目（N > 0），每条包含标题与可点击链接
