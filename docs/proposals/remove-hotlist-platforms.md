# 热榜平台删除方案

## 背景

系统目前有 31 个热榜平台（NewsNow），通过第三方 API `newsnow.busiyi.world` 抓取各平台热搜数据。其中 19 个已在 admin 后台禁用，剩余 12 个仍在启用（综合新闻 + 社交娱乐类）。

数据分析结论：
- 默认隐藏后零用户主动开启过 general/social 栏目
- 7 天 DAU 约 10 人（排除开发者本人后个位数）
- 热榜内容同质化严重，无差异化价值
- finance/tech_news/developer 栏目已有 custom_sources + RSS 覆盖

## 删除范围

### 数据库
| 表 | 操作 | 说明 |
|---|---|---|
| `newsnow_platforms` | DROP TABLE | 31 条记录，热榜平台定义 |
| `platform_categories` | 删除 general/social/sports 行 | 已标记 deleted 的 sports 也一并清理 |
| `platform_category_rules` | 删除 general/social/sports 相关规则 | 5 条默认规则中的 3 条 |
| `news_clicks` | 保留 | 117 条点击记录，不影响功能 |
| `rss_entries` | 无需处理 | 热榜数据不存储在此表 |

### 后端 Python 文件
| 文件 | 操作 | 说明 |
|---|---|---|
| `hotnews/crawler/fetcher.py` | 删除文件 | DataFetcher 类，调用 NewsNow API |
| `hotnews/crawler/__init__.py` | 移除 DataFetcher 导出 | |
| `hotnews/kernel/admin/newsnow_admin.py` | 删除文件 | 热榜 admin API（CRUD + migrate） |
| `hotnews/kernel/admin/category_rules.py` | 移除 general/social/sports 默认规则 | `init_default_rules()` 中的 3 条 |
| `hotnews/kernel/admin/platform_admin.py` | 移除 newsnow 类型处理 | `list_all_platforms()`、批量分类/启禁用中的 newsnow 分支 |
| `hotnews/kernel/admin/featured_mp_admin.py` | 移除 newsnow 名称冲突检查 | AI 推荐去重时查 newsnow_platforms 的逻辑 |
| `hotnews/web/server.py` | 多处改动（见下方详细） | |
| `hotnews/web/news_viewer.py` | 移除 PLATFORM_CATEGORIES 中的 general/social/sports 定义 + newsnow 平台加载逻辑 | |
| `hotnews/web/db_online.py` | 移除 newsnow_platforms 建表语句 + category_override 列迁移 | |
| `hotnews/web/page_rendering.py` | 移除 general/social 的 fallback 分类定义 | |
| `hotnews/__main__.py` | 移除 `_load_enabled_newsnow_platforms()` + 爬虫调用链 | |
| `hotnews/context.py` | 移除 `platforms` 属性 | |
| `hotnews/core/loader.py` | 移除 `config["PLATFORMS"]` 加载 | |
| `mcp_server/tools/system.py` | 移除 DataFetcher 导入和爬取逻辑 | |
| `mcp_server/utils/validators.py` | 移除平台 ID 校验（或改为只校验 custom_sources） | |
| `mcp_server/services/data_service.py` | 移除 platforms 配置读取 + NewsNow 相关注释 | |
| `mcp_server/server.py` | 移除 platforms 参数说明中的热榜引用 | |

### server.py 详细改动
| 位置 | 操作 |
|---|---|
| `from hotnews.crawler import DataFetcher` | 删除导入 |
| `_newsnow_router` 变量 + router 注册 | 删除 |
| `_init_newsnow_platforms_if_empty()` | 删除整个函数 |
| `app.state.init_newsnow_platforms_if_empty` | 删除 |
| 启动时调用 `_init_newsnow_platforms_if_empty()` | 删除 |
| 定时抓取任务中的 DataFetcher 调用 | 删除（auto_fetch 中的热榜抓取部分） |
| `category_map` 中的 general/social 映射 | 删除 |

### 前端文件
| 文件 | 操作 |
|---|---|
| `kernel/static/js/admin_rss_newsnow.js` | 删除文件 |
| `kernel/static/js/admin_rss_unified.js` | 移除 `newsnow` 类型判断和热榜 badge |
| `kernel/templates/admin_rss_sources.html` | 移除"热榜源"tab + modal + script 引用 |
| `web/static/js/src/settings.js` | 移除 hiddenDefaultCategories 中的 general/social/developer/tech_news（如果这些栏目不再有热榜内容） |
| `kernel/static/js/user_settings.js` | 同上 |

### 配置文件
| 文件 | 操作 |
|---|---|
| `config/config.yaml` | 删除整个 `platforms:` 列表（31 个平台定义） |

### 测试文件
| 文件 | 操作 |
|---|---|
| `tests/e2e/platform-reorder.spec.ts` | 移除 social/general 相关测试数据 |
| `tests/e2e/explore-embedded.spec.ts` | 移除 general 相关 mock |
| `tests/e2e/morning-brief.spec.ts` | 移除 social 相关 mock |
| `tests/e2e/rss-catalog-preview.spec.ts` | 移除 general 相关 mock |

## 不受影响的部分

- `rss_sources` 表和 RSS 抓取调度器（rss_scheduler）— 完全独立
- `custom_sources` 表和 Python 脚本源 — 完全独立
- explore/knowledge/my-tags/discovery/featured-mps 栏目 — 不依赖热榜
- finance/tech_news/developer 栏目 — 去掉热榜后仍有 RSS + custom 源
- AI 早报、标签系统、收藏、关键词 — 不依赖热榜
- 用户认证、支付、微信公众号 — 不依赖热榜

## 需要注意的风险点

1. **MCP Server 兼容性**：`mcp_server` 的多个工具接受 `platforms` 参数，删除后需要确保这些工具不会因为找不到平台配置而报错。建议改为返回空列表或移除 platforms 参数。

2. **用户偏好数据**：`user_preferences.category_config` 中有用户保存的 `categoryOrder` 包含 general/social，前端需要能容忍这些 ID 对应的栏目不存在（目前前端已经有这个容错能力）。

3. **定时抓取任务**：`server.py` 中的 `auto_fetch` 定时任务同时抓取热榜和 RSS。删除热榜后需要确保 RSS 抓取部分不受影响。

4. **历史数据**：热榜抓取的数据存储在 `output/index.html`（157KB 的静态报告）中，删除后不再更新，但不影响系统运行。

## 执行顺序建议

1. **Phase 1 — 立即禁用**：在 admin 后台把剩余 12 个热榜平台全部禁用（零风险，可逆）
2. **Phase 2 — 代码清理**：按上述方案删除代码，提交 PR
3. **Phase 3 — 数据库清理**：部署后在服务器上执行 SQL 清理 newsnow_platforms 表
4. **Phase 4 — 栏目清理**：在 admin 后台禁用/删除 general、social 栏目（platform_categories 表）
