## 1. Research & Decision
- [ ] 1.1 明确 NBA 数据需求：当日赛程 + 比分（scoreboard）与展示格式（对阵/比分/状态/开赛时间）
- [ ] 1.2 明确游戏排行需求：Steam New & Trending（新作热度）与展示格式（游戏名/链接/排名）
- [ ] 1.3 评估并确定 NBA Provider（BallDontLie vs TheSportsDB），并确认是否需要 API Key 与免费额度
- [ ] 1.4 评估并确定 Steam Provider（featuredcategories vs search/results json），并确认地区/语言参数策略

## 2. Implementation
- [ ] 2.1 新增 NBA scoreboard provider fetcher（按日期拉取 games + scores；含超时、重试、限流、错误降级）
- [ ] 2.2 新增 Steam New & Trending provider fetcher（从 Steam Store JSON 抓取；含超时、重试、限流、错误降级）
- [ ] 2.3 将两类结果统一映射为 NewsData（title/url/timestamp/rank），并入库
- [ ] 2.4 `config/config.yaml` 增加 provider 选择与参数（NBA API base_url/key；Steam cc/l 参数）
- [ ] 2.5 将新源纳入 viewer 的 auto_fetch / 手动 fetch 流程（失败不影响现有平台）

## 3. Verification
- [ ] 3.1 本地跑一次 fetch：NBA scoreboard + Steam New & Trending 均能返回 N 条
- [ ] 3.2 viewer 能展示新平台卡片，点击 title 可跳转
- [ ] 3.3 失败场景：provider 超时/限流时不会影响其他平台抓取
