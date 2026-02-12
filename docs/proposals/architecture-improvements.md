# Hotnews 架构改进方案

> 版本: v2.0 | 初版: 2026-02-12 | 更新: 2026-02-12

## 一、现状概览（改进后）

| 层级 | 改进前 | 改进后 | 说明 |
|------|--------|--------|------|
| 后端主文件 | `server.py` 3,766 行 | `server.py` 2,531 行 | 提取 4 个路由模块，减少 32.8% |
| 前端事件系统 | 6 层猴子补丁链 | `events.js` 事件总线 | 发布-订阅替代运行时包装 |
| 前端大文件 | `data.js` 1,366 行 | `data.js` 1,114 行 + `templates/` 4 文件 | HTML 模板分离 |
| 独立脚本 | `topic-tracker.js` 体系外 | 纳入 esbuild bundle | 异步 import，代码分割 |
| 类型系统 | 无 | `jsconfig.json` + 核心模块 JSDoc | core.js, events.js, scroll.js |
| 数据库 | SQLite | SQLite（不变） | 当前规模无需迁移 |

## 二、各阶段完成情况

### 阶段 1: 前端事件系统替换猴子补丁链 ✅ 完成

创建 `src/events.js` 轻量级事件总线，迁移全部 15 个猴子补丁消费者到 `TR.events.on()` 模式。

标准事件清单：

| 事件名 | 触发时机 | 参数 |
|--------|----------|------|
| `viewer:rendered` | renderViewerFromData 完成后 | `(data, state)` |
| `viewer:ready` | DOM 完全就绪 | 无 |
| `tab:switched` | 标签页切换 | `(tabId, prevTabId)` |
| `tab:activated` | 标签页首次激活 | `(tabId)` |
| `data:refreshed` | 数据刷新完成 | `(data)` |

**收益**: 消除隐式依赖链，模块间解耦，滚动恢复时序竞争问题不再出现。

---

### 阶段 2: server.py 路由拆分 ⚠️ 部分完成

已提取 4 个模块：

| 模块 | 行数 | 端点数 |
|------|------|--------|
| `deps.py` | 137 | — |
| `morning_brief_routes.py` | 845 | 8 |
| `explore_timeline_routes.py` | 128 | 1 |
| `admin_ai_routes.py` | 135 | 5 |
| **合计** | **1,245** | **14** |

server.py: 3,766 → 2,531 行（-32.8%）

**未提取（暂不继续）**:
- Viewer/Page 路由 — 深度依赖 `_render_viewer_page()`、`templates`、`_inject_rss_subscription_news_into_data()`
- News API 路由 — 深度依赖 `get_services()`、`_get_online_db_conn()`

这两组路由与 server.py 内部状态耦合较深，提取需要先重构共享依赖，工程量大但日常改动频率低，投入产出比不高。已提取的 4 个模块覆盖了最常改动的功能区域，当前状态可维护性已显著改善。如后续有需要可再继续。

---

### 阶段 3: data.js 模板分离 ✅ 完成

创建 `src/templates/` 目录，包含 4 个模板模块：

```
src/templates/
├── index.js            → 统一导出
├── news-item.js        → renderNewsItemHtml()
├── platform-card.js    → renderPlatformCardHtml(), renderPlatformHeaderButtonsHtml(), renderSkeletonNewsItemsHtml()
└── tab-panes.js        → renderRssColPane(), renderExplorePane(), renderMyTagsPane(), renderTopicDynamicPane(),
                          renderFeaturedMpsPane(), renderDiscoveryPane(), renderKnowledgePane()
```

data.js: 1,280 → 1,114 行（-166 行），HTML 模板生成逻辑全部移至 templates 模块。

---

### 阶段 4: topic-tracker.js 纳入构建体系 ✅ 完成

- 迁移到 `src/topic-tracker.js`，改为 ES module
- `index.js` 中通过 `import('./topic-tracker.js')` 异步加载
- esbuild 自动代码分割，生成独立 chunk
- `window.TopicTracker` 保留（HTML 模板中 onclick 引用）

---

### 阶段 5: JSDoc 类型注解 ⚠️ 初始完成

已完成：
- 创建 `jsconfig.json`（checkJs: true, ES2020, bundler moduleResolution）
- `core.js`: ready, escapeHtml, formatUpdatedAt, formatNewsDate, toast API, renderNewsItemHtml
- `events.js`: on, off, emit, listeners（完整 JSDoc）
- `scroll.js`: 全部公共方法 + `PlatformGridScrollEntry`、`NavigationState` 类型定义

其余模块（data.js, tabs.js, storage.js 等）采用随改随加策略，不做专项批量添加。

---

### 阶段 6: 数据库迁移评估 ⏸️ 按需

当前 SQLite + WAL 模式运行良好，暂不迁移。触发条件：并发用户 >50、频繁锁等待、需多实例部署。

## 三、总结

6 个阶段中，4 个完成，2 个部分完成并达到合理停止点。主要收益：
- 猴子补丁链彻底消除，前端模块间通过事件总线解耦
- server.py 减少 1/3 代码量，高频改动区域已独立为模块
- HTML 模板从业务逻辑中分离，UI 修改更安全
- topic-tracker 纳入统一构建，享受代码分割
- 核心模块有 JSDoc 类型注解，IDE 提示可用
