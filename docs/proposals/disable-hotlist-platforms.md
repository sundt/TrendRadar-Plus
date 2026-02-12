# 热榜平台禁用方案

## 目标

在不修改任何代码的前提下，通过数据库和配置操作，完全停止热榜数据的抓取和展示。此方案零风险、完全可逆，作为后续代码删除方案的前置步骤。

## 当前状态

| 项目 | 数量 |
|---|---|
| 热榜平台总数 | 31 |
| 已禁用 | 19 |
| 仍启用 | 12 |

仍启用的 12 个平台（均为综合新闻 + 社交娱乐类）：

| ID | 名称 | 栏目 |
|---|---|---|
| toutiao | 今日头条 | 综合新闻 |
| baidu | 百度热搜 | 综合新闻 |
| thepaper | 澎湃新闻 | 综合新闻 |
| ifeng | 凤凰网 | 综合新闻 |
| cankaoxiaoxi | 参考消息 | 综合新闻 |
| zaobao | 联合早报 | 综合新闻 |
| tencent-hot | 腾讯新闻 | 综合新闻 |
| weibo | 微博 | 社交娱乐 |
| douyin | 抖音 | 社交娱乐 |
| bilibili-hot-search | B站热搜 | 社交娱乐 |
| zhihu | 知乎 | 社交娱乐 |
| tieba | 贴吧 | 社交娱乐 |

## 禁用操作

### 步骤 1：禁用剩余 12 个热榜平台

在服务器上执行一条 SQL：

```bash
ssh -p 52222 root@120.77.222.205
```

```bash
sqlite3 ~/hotnews/output/online.db
```

```sql
-- 禁用所有仍启用的热榜平台
UPDATE newsnow_platforms SET enabled = 0, updated_at = datetime('now') WHERE enabled = 1;

-- 验证：应返回 0
SELECT COUNT(*) FROM newsnow_platforms WHERE enabled = 1;
```

### 步骤 2：禁用纯热榜栏目（可选）

general（综合新闻）和 social（社交娱乐）在禁用所有热榜平台后将变成空栏目。可以在 admin 后台禁用，或执行 SQL：

```sql
-- 软禁用 general 和 social 栏目
UPDATE platform_categories SET enabled = 0, updated_at = datetime('now') WHERE id IN ('general', 'social');

-- 验证
SELECT id, name, enabled FROM platform_categories;
```

> sports 栏目如果之前已经标记 deleted 则无需处理。

### 步骤 3：清除缓存使生效

禁用后需要清除服务端缓存，有两种方式：

方式 A — 调用 admin API（推荐，无需重启）：
```bash
curl -X POST "https://你的域名/api/admin/reload-cache" \
  -H "Authorization: Bearer <admin_token>"
```

方式 B — 重启服务：
```bash
docker restart hotnews
```

## 生效机制

禁用后系统行为变化：

| 环节 | 禁用前 | 禁用后 |
|---|---|---|
| 定时抓取（`fetch_news_data`） | 从 `config.yaml` 读取 31 个平台，调用 NewsNow API | 仍会读取 config 并抓取，但数据不会被展示 |
| 前端展示（`_reload_platform_config`） | 查询 `enabled=1` 的平台，分配到栏目 | 查询结果为空，general/social 栏目无热榜内容 |
| 栏目显示 | general/social 显示热榜内容 | general/social 为空（或被禁用后不显示） |
| RSS/Custom Sources | 正常 | 不受影响 |
| Admin 后台 | 显示 31 个平台，12 个启用 | 显示 31 个平台，0 个启用 |

### 注意：抓取仍在运行

禁用数据库中的平台只影响前端展示，`fetch_news_data()` 函数从 `config.yaml` 读取平台列表，不查询数据库的 `enabled` 字段。所以抓取任务仍会执行，只是抓取的数据不会被展示给用户。

如果想同时停止抓取以节省资源，需要额外操作：

```yaml
# config/config.yaml — 清空 platforms 列表
platforms: []
```

或者将 `auto_fetch` 设为 `false`（但这会同时停止 RSS 抓取调度器的触发，不推荐）。

> 建议：先只做数据库禁用（步骤 1-3），观察几天确认无问题后，再清空 config.yaml 中的 platforms 列表停止无用抓取。

## 回滚方案

如需恢复，执行反向 SQL 即可：

```sql
-- 恢复之前启用的 12 个平台
UPDATE newsnow_platforms SET enabled = 1, updated_at = datetime('now')
WHERE id IN (
  'toutiao', 'baidu', 'thepaper', 'ifeng', 'cankaoxiaoxi', 'zaobao', 'tencent-hot',
  'weibo', 'douyin', 'bilibili-hot-search', 'zhihu', 'tieba'
);

-- 恢复栏目（如果执行了步骤 2）
UPDATE platform_categories SET enabled = 1, updated_at = datetime('now') WHERE id IN ('general', 'social');
```

然后清除缓存即可恢复。

## 与删除方案的关系

本方案是 [热榜平台删除方案](./remove-hotlist-platforms.md) 的 Phase 1。执行顺序：

1. ✅ 本方案：禁用热榜（零风险，可逆）
2. 观察 3-7 天，确认无用户反馈
3. 执行删除方案 Phase 2-4：代码清理 → 数据库清理 → 栏目清理
