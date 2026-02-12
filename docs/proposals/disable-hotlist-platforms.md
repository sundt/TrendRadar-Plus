# 热榜平台禁用方案

## 目标

在不修改任何代码的前提下，通过数据库和配置操作，完全停止热榜数据的抓取和展示。此方案零风险、完全可逆，作为后续代码删除方案的前置步骤。

## 执行记录

| 步骤 | 状态 | 执行时间 |
|---|---|---|
| 步骤 1：禁用 31 个热榜平台（数据库） | ✅ 已完成 | 2026-02-12 |
| 步骤 2：禁用 general/social 栏目 | ✅ 已完成 | 2026-02-12 |
| 步骤 3：重启服务清缓存 | ✅ 已完成 | 2026-02-12 |
| 步骤 4：清空 config.yaml platforms 列表 | ⏳ 待部署 | 本地已改，等下次部署 |

## 禁用前状态

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

## 已执行的操作

### 步骤 1：禁用全部 31 个热榜平台（已完成）

```sql
UPDATE newsnow_platforms SET enabled = 0, updated_at = datetime('now') WHERE enabled = 1;
```

验证结果：`SELECT COUNT(*) FROM newsnow_platforms WHERE enabled = 1;` → 0

### 步骤 2：禁用 general/social 栏目（已完成）

```sql
UPDATE platform_categories SET enabled = 0, updated_at = datetime('now') WHERE id IN ('general', 'social');
```

### 步骤 3：重启服务清缓存（已完成）

```bash
docker restart hotnews
```

### 步骤 4：清空 config.yaml platforms 列表（待部署）

本地 `config/config.yaml` 已将 31 个平台列表替换为：

```yaml
platforms: []
```

此改动需要下次部署时同步到服务器。部署前，服务器上的 `fetch_news_data()` 仍会从旧 config 读取平台列表并抓取，但数据不会被前端展示。

## 两层禁用的区别

| 层面 | 操作 | 影响范围 |
|---|---|---|
| 数据库层（步骤 1-2） | `newsnow_platforms.enabled = 0` | 前端不展示热榜内容，general/social 栏目隐藏 |
| 配置层（步骤 4） | `config.yaml platforms: []` | 停止定时抓取，不再调用 NewsNow API，不再生成每日目录和 news.db |

数据库禁用只管展示，配置清空才管抓取。两层都做才能完全停止热榜。

## 每日目录与 news.db

### 数据流

```
fetch_news_data() → config.yaml 读取 platforms
  → DataFetcher.crawl_websites() 调用 NewsNow API
  → StorageManager.save_news_data()
  → LocalStorageBackend._get_db_path() → mkdir 创建日期目录
  → sqlite3.connect() 创建 news.db
  → _init_tables() 从 schema.sql 建表
  → INSERT 写入数据
```

### news.db 表结构（全部为热榜服务）

| 表 | 用途 |
|---|---|
| `platforms` | 热榜平台 ID/名称 |
| `news_items` | 热榜新闻条目（标题、排名、URL 等） |
| `rank_history` | 排名变化历史 |
| `title_changes` | 标题变更记录 |
| `crawl_records` | 抓取时间记录 |
| `crawl_source_status` | 各平台抓取成功/失败状态 |
| `custom_sources` | 建表时创建的空表（自定义源数据实际存在 online.db） |
| `push_records` | 推送记录 |

### config.yaml 部署后的效果

- `fetch_news_data()` 读到空平台列表 → 打印 `⚠️ 未配置任何平台` → 直接 return
- 不会调用 `save_news_data()`，不会创建新的日期目录和 news.db
- 历史目录（output/2025-12-26 ~ 2026-02-12，共 49 个，约 1.7GB）保留不动

### 不受影响的部分

- RSS 抓取：由 `rss_scheduler` 独立调度，数据存 `online.db` 的 `rss_entries` 表
- 自定义源：由 `rss_scheduler` 统一调度，数据存 `online.db` 的 `rss_entries` 表
- 公众号抓取：由 `wechat_scheduler` 独立调度，完全独立模块
- 以上三者均不写入每日 news.db，不受 `platforms: []` 影响

## 回滚方案

如需恢复，执行反向操作：

```sql
-- 恢复之前启用的 12 个平台
UPDATE newsnow_platforms SET enabled = 1, updated_at = datetime('now')
WHERE id IN (
  'toutiao', 'baidu', 'thepaper', 'ifeng', 'cankaoxiaoxi', 'zaobao', 'tencent-hot',
  'weibo', 'douyin', 'bilibili-hot-search', 'zhihu', 'tieba'
);

-- 恢复栏目
UPDATE platform_categories SET enabled = 1, updated_at = datetime('now') WHERE id IN ('general', 'social');
```

config.yaml 恢复原始 platforms 列表（备份在服务器 `config.yaml.bak.20260212180949`）。

然后 `docker restart hotnews` 清缓存即可。

## 与删除方案的关系

本方案是 [热榜平台删除方案](./remove-hotlist-platforms.md) 的 Phase 1。

1. ✅ Phase 1：禁用热榜（本方案，已完成）
2. ⏳ 观察 3-7 天，确认无用户反馈
3. Phase 2-4：代码清理 → 数据库清理 → 栏目清理
