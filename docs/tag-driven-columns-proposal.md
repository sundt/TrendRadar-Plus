# 标签驱动栏目系统方案（V2）

## 一、现状分析

### 1.1 当前架构问题

**两套分类系统并存，互不关联：**
- `rss_entry_ai_labels.category`：AI 打标的文章分类（tech, AI_MODEL, DEV_INFRA 等），30+ 种，大小写混乱
- `tags` 表 + `rss_entry_tags`：三层标签体系（category 12 / topic 216 / attribute 10），覆盖率 96%
- 前端栏目：6 个硬编码栏目，每个用完全不同的数据获取逻辑

**每个栏目的数据来源各不相同：**

| 栏目 | 数据来源 | API | 前端模块 |
|------|---------|-----|---------|
| 我的关注 | user_tag_settings + rss_entry_tags | /api/user/my-tags/news | my-tags.js |
| 新发现 | tags 热度推荐 | /api/rss/discovery/timeline | discovery 内联 |
| 精选博客 | rss_sources.category='explore' | /api/rss/explore/timeline | explore-timeline.js |
| 每日AI早报 | rss_entry_ai_labels (AI_MODEL/DEV_INFRA/HARDWARE_PRO) | /api/rss/brief/timeline | morning-brief.js |
| 精选公众号 | 微信公众号源 | /api/rss/featured-mps/timeline | featured-mps 内联 |
| 财经投资 | rss_sources.category='finance' + AI 过滤 | /api/rss/finance/timeline | finance 内联 |

**新增栏目需要改代码**：每加一个栏目要写新的 API 路由、前端模块、缓存逻辑。

### 1.2 数据规模
- RSS 源：419 个活跃
- 文章总量：83,080 篇
- rss_entry_tags：275,010 行（一篇文章可有多个 tag）
- 日均新增：~800-1200 篇

### 1.3 性能基线（已验证）
- `rss_entry_tags` 按 tag_id 查询：0.027s（COUNT）
- 按 tag_id + ORDER BY created_at DESC LIMIT 50：**8s**（无复合索引时）
- 加 `(tag_id, created_at DESC)` 复合索引后：**<1ms** ✅（已在生产创建）
- 按 PK 批量取 entries 详情（50条）：0.028s

---

## 二、方案设计

### 2.1 核心思路

**用 `tags` 表的 category 标签驱动栏目**，一个 category tag（或一组 tags）= 一个栏目。

### 2.2 统一分类标签

将现有 12 个 category 标签重新规划，重点拆分 `tech`（21,195 条，太泛）：

| tag_id | 名称 | 说明 | 映射自 |
|--------|------|------|--------|
| `ai_model` | AI 模型 | 大模型发布、评测、论文、训练 | AI_MODEL + 部分 tech |
| `ai_app` | AI 应用 | AI 工具、产品、使用场景 | 部分 tech + CONSUMER |
| `ai_coding` | AI 编程 | Cursor/Copilot/Codex/Agent/IDE | 部分 DEV_INFRA + tech |
| `dev_infra` | 开发者 | 框架、云服务、DevOps、数据库 | DEV_INFRA（非 AI 部分）|
| `hardware` | 硬件芯片 | GPU/NPU/芯片/机器人/IoT | HARDWARE_PRO |
| `finance` | 财经投资 | 股市、基金、投资、经济 | finance + FINANCE |
| `business` | 商业 | 企业动态、融资、收购、创业 | business + BUSINESS + MARKETING |
| `entertainment` | 娱乐 | 影视、游戏、社交媒体 | entertainment + gaming |
| `science` | 科学 | 学术研究、太空、生物 | science |
| `lifestyle` | 生活 | 健康、教育、旅行、美食 | lifestyle + health + education |
| `world` | 国际 | 国际政治、外交、全球事件 | politics + international |
| `other` | 其他 | 不属于以上分类 | OTHER + other + 长尾 |

### 2.3 栏目配置表

```sql
CREATE TABLE column_config (
    id TEXT PRIMARY KEY,            -- 栏目ID
    name TEXT NOT NULL,             -- 显示名称
    icon TEXT DEFAULT '',           -- emoji 图标
    tag_ids TEXT NOT NULL DEFAULT '[]', -- 关联的 tag IDs（JSON 数组）
    source_type TEXT DEFAULT 'tag', -- 数据源类型：tag / source_category / custom
    source_filter TEXT DEFAULT '{}',-- 额外过滤条件（JSON）
    sort_order INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    visible_to TEXT DEFAULT 'all',  -- all / logged_in
    created_at INTEGER,
    updated_at INTEGER
);
```

预置数据：

| id | name | tag_ids | source_type | sort_order |
|----|------|---------|-------------|------------|
| my-tags | 我的关注 | [] | custom | 0 |
| discovery | 新发现 | [] | custom | 1 |
| ai_model | AI 模型 | ["ai_model"] | tag | 2 |
| ai_app | AI 应用 | ["ai_app"] | tag | 3 |
| ai_coding | AI 编程 | ["ai_coding"] | tag | 4 |
| explore | 精选博客 | [] | source_category | 5 |
| knowledge | 每日AI早报 | ["ai_model","ai_coding","hardware"] | tag | 6 |
| finance | 财经投资 | ["finance"] | tag | 7 |
| featured-mps | 精选公众号 | [] | custom | 8 |

### 2.4 统一时间线 API

```
GET /api/timeline?tags=ai_model&limit=50&offset=0
```

两步查询（避免慢 JOIN）：
1. 从 `rss_entry_tags` 按 tag_id + created_at DESC 取 dedup_key 列表
2. 批量从 `rss_entries` 按 PK 取详情

预计响应时间：< 50ms（已验证）

### 2.5 AI 分类 Prompt 改造

修改 AI 打标 prompt，直接输出新的 category tag_id，写入 `rss_entry_tags`。

---

## 三、对现有硬编码的影响分析

### 3.1 需要改动的部分

**后端（Python）：**

| 文件 | 改动 | 风险 |
|------|------|------|
| `page_rendering.py` | `/api/news` 从 `column_config` 读栏目列表，替代硬编码 | 中 — 是首页渲染入口 |
| `rss_scheduler.py` | AI 分类 prompt 改为输出新 tag_id | 低 — 只影响新文章 |
| `morning_brief_routes.py` | 改为从 `rss_entry_tags` 查询，替代 `rss_entry_ai_labels` | 中 — 每日AI早报核心 |
| `category_timeline_routes.py` | finance 改为 tag 查询；新增通用 `/api/timeline` | 中 |
| `cache_warmup.py` | 缓存预热逻辑适配新查询 | 低 |
| `deps.py` | `passes_tag_whitelist` 简化或废弃 | 低 |

**前端（JS）：**

| 文件 | 改动 | 风险 |
|------|------|------|
| `data.js` → `renderViewerFromData` | 从 API 动态渲染栏目 tab（已有此能力，改动小） | 低 |
| `morning-brief.js` | 改 API 地址为 `/api/timeline?tags=...` | 低 |
| `explore-timeline.js` | 不变（精选博客保持 source_category 模式） | 无 |
| `category-timeline.js` | tag 驱动的栏目统一用此模块 | 低 |
| `tabs.js` | `SELF_MANAGED_TIMELINE` 列表需更新 | 低 |
| `settings.js` | 栏目设置相关代码可大幅简化 | 低 |

### 3.2 不需要改动的部分（保持现有逻辑）

- **我的关注**（my-tags.js）：已经是 tag 驱动，完全兼容
- **新发现**（discovery）：基于 tag 热度推荐，不受影响
- **精选博客**（explore-timeline.js）：按 source_category 筛选，保持不变
- **精选公众号**（featured-mps）：微信源特殊逻辑，保持不变
- **主题系统**（topic-tracker.js）：独立的用户自建主题，不受影响
- **收藏、评论、AI 摘要**：与栏目无关
- **滚动恢复、标签页切换**：与数据源无关

### 3.3 兼容性策略

- **渐进式迁移**：先加新 API + 新栏目，旧栏目保持不变，验证稳定后再切换
- **历史数据**：写迁移脚本将 `rss_entry_ai_labels.category` 映射到新 tag，写入 `rss_entry_tags`
- **双写过渡期**：AI 打标同时写 `rss_entry_ai_labels`（旧）和 `rss_entry_tags`（新），确保回滚能力
- **`rss_entry_ai_labels` 表不删**：保留作为 AI 打标的审计日志（score、confidence、reason 等元数据仍有价值）

---

## 四、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| AI 分类 prompt 改后准确率下降 | 新文章分类错误 | 先用小批量测试，对比新旧 prompt 的分类结果 |
| 历史数据迁移不完整 | 旧文章在新栏目中缺失 | tech → ai_model/ai_app/ai_coding 的映射需要 AI 重新分类，不能简单映射 |
| `rss_entry_tags` 表膨胀 | 查询变慢 | 已加复合索引；定期清理 >90 天的低频 tag 关联 |
| 前端 `renderViewerFromData` 改动引入 bug | 首页白屏 | 保留旧逻辑作为 fallback，新逻辑用 feature flag 控制 |
| 缓存失效策略变化 | 用户看到过期数据 | 统一用 timeline_cache，按 tag 组合做 cache key |

### 4.1 历史数据迁移的难点

最大的挑战是 `tech`（21,195 条）的拆分。不能简单地把所有 tech 映射到 ai_model，需要：
1. 对 tech 标签的文章重新跑 AI 分类（用新 prompt）
2. 或者基于已有的 topic tags 做规则映射（如有 `chatgpt`/`claude` topic → ai_model）
3. 无法映射的暂时归入 `other`，后续新文章会用新分类

---

## 五、实施步骤

### Phase 1：基础设施（1天）
1. ✅ 创建 `(tag_id, created_at DESC)` 复合索引（已完成）
2. 在 `tags` 表中创建新的 category 标签（ai_model, ai_app, ai_coding 等）
3. 创建 `column_config` 表，预置栏目数据
4. 新增 `/api/timeline?tags=xxx` 通用 API

### Phase 2：AI 分类改造（1-2天）
1. 修改 AI 分类 prompt，输出新 tag_id
2. 小批量测试分类准确率
3. 启用双写（同时写 rss_entry_ai_labels + rss_entry_tags）
4. 写历史数据迁移脚本（tech 拆分）

### Phase 3：后端栏目配置化（1天）
1. `/api/news` 从 `column_config` 读取栏目列表
2. 每日AI早报改为从 `rss_entry_tags` 查询
3. 财经投资改为 tag 查询
4. 缓存预热适配

### Phase 4：前端适配（1天）
1. tag 驱动的栏目统一使用 `categoryTimeline` 模块
2. 更新 `tabs.js` 的 `SELF_MANAGED_TIMELINE` 列表
3. 测试所有栏目的加载、滚动、切换

### Phase 5：清理（0.5天）
1. 移除前端硬编码的栏目逻辑
2. 简化 settings.js
3. 废弃 `passes_tag_whitelist` 等旧过滤逻辑
