# 标签系统改进方案

> 目标：将现有标签体系规范化，支持「按标签分栏目」的新前端架构（类似每日AI早报，每个栏目 = 一个标签/标签组，按时间排序）

## 一、现状审计

### 1.1 数据规模
| 指标 | 数量 |
|------|------|
| 总文章数 | 138,736 |
| 已标注文章 | 117,468 (84.7%) |
| 标签关联记录 | 282,064 |
| 使用中的 tag_id | 2,601 |
| tags 表中定义的标签 | 182 (12 category + 20 preset topic + 140 dynamic topic + 10 attribute) |
| 孤儿标签（有使用但无定义） | 2,426 个 |
| 待审核候选标签 | 17,725 个 |
| 7天 include 率 | 44.5% (4135/9283) |

### 1.2 发现的问题

#### 问题 1：孤儿标签严重（2426 个）
AI 模型输出的 tag_id 直接写入 `rss_entry_tags`，但大部分没有在 `tags` 表中注册。
例如 `energy`(604次)、`space`(588次)、`agriculture`(510次) 等高频标签都是孤儿。

**影响**：如果按标签做栏目，这些标签没有中文名、没有分类层级，前端无法展示。

#### 问题 2：重复标签
| 重复组 | 标签 A | 标签 B | 合计使用量 |
|--------|--------|--------|-----------|
| GLM-5 | `glm5` (267) | `glm_5` (326) | 593 |
| Kimi K2.5 | `kimi_k2.5` | `kimi_k2_5` | — |
| Seedance 2.0 | `seedance_2.0` (358) | `seedance_2_0` (542) | 900 |

**原因**：AI 模型对命名不一致（点号 vs 下划线），`normalize_tag_id` 没有统一处理。

#### 问题 3：动态标签粒度过细
大量产品版本号级别的标签：`claude_opus_4_6`、`gpt_5_2`、`gpt_5_3_codex`、`deepseek_v4`、`gemini_3`、`gemini_3_1_pro`、`qwen3`、`qwen3_5`、`doubao_2.0` 等。

这些标签有短期价值（用户确实想看某个新版本的新闻），但不适合作为长期栏目。需要一个机制让它们自动归属到产品级标签下。

#### 问题 4：parent_id 归属不合理
很多 AI 相关的动态标签 parent 设为 `tech` 而非 `ai_ml`：
- `openai`(1504)、`anthropic`(615)、`deepseek`(328)、`claude`(759) → 应该归到 `ai_ml`
- `humanoid_robot`(424)、`autonomous_driving`(221) → 应该归到 `robotics`
- `semiconductor`(694) → 应该归到 `hardware`

#### 问题 5：category 和 topic 边界模糊
`rss_entry_ai_labels.category` 存的是 AI 模型输出的大类（tech/finance/...），同时 `tags` 表也有 type=category 的记录。
而 `rss_sources.category` 又是另一套（explore/tech_news/developer/...），三套分类体系并存。

---

## 二、标签体系重新设计

### 2.1 三层标签架构

```
Layer 1: 大类 (category)     → 对应栏目分组/Tab
Layer 2: 主题 (topic)        → 对应具体栏目
Layer 3: 实体 (entity)       → 产品/公司/事件，用于聚合但不直接作为栏目
```

### 2.2 推荐的栏目标签（Layer 2 topics）

基于实际使用量和长期价值，建议保留以下标签作为可选栏目：

#### 科技 (tech)
| 标签 ID | 中文名 | 说明 | 当前使用量 |
|---------|--------|------|-----------|
| `ai_ml` | AI / 机器学习 | 核心 AI 栏目（现有"每日AI早报"） | 14,150 |
| `llm` | 大语言模型 | GPT/Claude/Qwen 等 | 3,737 |
| `robotics` | 机器人 | 含人形机器人、具身智能 | 1,985 |
| `dev_tools` | 开发工具 | IDE、CI/CD、效率工具 | 3,129 |
| `hardware` | 硬件 / 芯片 | GPU、半导体、HBM | 4,660 |
| `opensource` | 开源项目 | GitHub trending 等 | 2,098 |
| `cybersecurity` | 网络安全 | 漏洞、攻防、隐私 | 1,483 |
| `cloud` | 云计算 | AWS/Azure/阿里云 | 1,250 |
| `mobile` | 移动设备 | 手机、平板、穿戴 | 2,949 |
| `autonomous_driving` | 自动驾驶 | FSD、Robotaxi | 221+ |
| `quantum_computing` | 量子计算 | 新兴领域 | 少量 |

#### 财经 (finance)
| 标签 ID | 中文名 | 使用量 |
|---------|--------|--------|
| `stock` | 股票 | 9,791 |
| `macro` | 宏观经济 | 10,536 |
| `crypto` | 加密货币 | 1,681 |
| `real_estate` | 房地产 | 934 |

#### 商业 (business)
| 标签 ID | 中文名 | 使用量 |
|---------|--------|--------|
| `startup` | 创业 / 融资 | 8,788 |
| `ecommerce` | 电商 | 5,531 |

#### 生活 (lifestyle)
| 标签 ID | 中文名 | 使用量 |
|---------|--------|--------|
| `gaming` | 游戏 | 3,299 |
| `automotive` | 汽车 | 996 |

### 2.3 产品标签与版本标签的处理方案（Layer 3）

AI 模型迭代快，版本号标签有短期价值（用户想看"GPT-5.3 相关新闻"），不应直接禁用。
方案是建立**自动父子归属**，让版本标签挂到产品标签下，产品标签再挂到主题标签下：

```
ai_ml (栏目级 topic, Layer 2)
  ├── openai (产品级 entity)
  │     ├── gpt_5_2 (版本级 entity)
  │     └── gpt_5_3_codex (版本级 entity)
  ├── anthropic (产品级 entity)
  │     ├── claude (产品级 entity)
  │     ├── claude_opus_4_6 (版本级 entity)
  │     └── claude_code (产品级 entity)
  └── deepseek (产品级 entity)
        └── deepseek_v4 (版本级 entity)
```

**查询逻辑**：查 `ai_ml` 栏目时，自动包含所有子标签（递归）的文章。
用户想看细分的，可以在栏目内按产品/版本筛选。

#### 具体实现：自动版本归属

在 `tag_discovery.py` 的 `TAG_NORMALIZATION` 中新增**产品前缀映射表**：

```python
# 产品前缀 → 产品标签 ID 的映射
# 用于自动将版本号标签归属到产品标签
PRODUCT_PREFIX_MAP = {
    "claude": {"product": "claude", "topic": "ai_ml"},
    "gpt": {"product": "gpt", "topic": "ai_ml"},
    "deepseek": {"product": "deepseek", "topic": "ai_ml"},
    "gemini": {"product": "gemini", "topic": "ai_ml"},
    "qwen": {"product": "qwen", "topic": "ai_ml"},
    "glm": {"product": "glm", "topic": "ai_ml"},
    "kimi": {"product": "kimi", "topic": "ai_ml"},
    "doubao": {"product": "doubao", "topic": "ai_ml"},
    "seedance": {"product": "seedance", "topic": "ai_ml"},
    "minimax": {"product": "minimax", "topic": "ai_ml"},
    "grok": {"product": "grok", "topic": "ai_ml"},
    "iphone": {"product": "iphone", "topic": "mobile"},
    "xiaomi_su": {"product": "xiaomi", "topic": "automotive"},
    "tesla": {"product": "tesla", "topic": "autonomous_driving"},
}
```

在 `save_candidate()` 和 `promote_candidate()` 中自动匹配：

```python
def _auto_resolve_parent(self, tag_id: str, ai_parent_id: str) -> str:
    """自动推断 parent_id：版本标签 → 产品标签 → 主题标签"""
    for prefix, mapping in PRODUCT_PREFIX_MAP.items():
        if tag_id.startswith(prefix) and tag_id != mapping["product"]:
            # 这是一个版本标签，parent 指向产品标签
            return mapping["product"]
        if tag_id == mapping["product"]:
            # 这是产品标签本身，parent 指向主题标签
            return mapping["topic"]
    # 没匹配到，用 AI 给的 parent_id
    return ai_parent_id or "tech"
```

#### 具体实现：栏目查询时递归包含子标签

```python
def get_tag_family(conn, tag_id: str, max_depth: int = 3) -> set:
    """获取一个标签及其所有子标签 ID（递归）"""
    family = {tag_id}
    current_level = {tag_id}
    for _ in range(max_depth):
        if not current_level:
            break
        placeholders = ",".join(["?"] * len(current_level))
        cur = conn.execute(
            f"SELECT id FROM tags WHERE parent_id IN ({placeholders}) AND enabled=1",
            tuple(current_level)
        )
        children = {row[0] for row in cur.fetchall()}
        new_children = children - family
        family.update(new_children)
        current_level = new_children
    return family
```

查询 `ai_ml` 栏目时：
```sql
-- 先获取 tag family: {ai_ml, openai, claude, deepseek, gpt, ..., claude_opus_4_6, ...}
SELECT e.* FROM rss_entries e
JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
WHERE t.tag_id IN (?, ?, ?, ...)  -- tag family
ORDER BY e.published_at DESC
```

#### 具体实现：合并重复标签的 SQL 脚本

```python
# 重复标签合并（在 rss_entry_tags 中将旧 ID 更新为新 ID）
MERGE_MAP = {
    "glm_5": "glm",           # glm_5 + glm5 → glm（产品级）
    "glm5": "glm",
    "kimi_k2_5": "kimi",      # 版本 → 产品
    "kimi_k2.5": "kimi",
    "seedance_2_0": "seedance",
    "seedance_2.0": "seedance",
    "doubao_2.0": "doubao",
    "embodied_intelligence": "embodied_ai",  # 同义词合并
}

for old_id, new_id in MERGE_MAP.items():
    conn.execute(
        "UPDATE OR IGNORE rss_entry_tags SET tag_id = ? WHERE tag_id = ?",
        (new_id, old_id)
    )
    # 删除因 UNIQUE 约束冲突而未更新的旧记录
    conn.execute("DELETE FROM rss_entry_tags WHERE tag_id = ?", (old_id,))
    # tags 表中禁用旧标签
    conn.execute("UPDATE tags SET enabled = 0 WHERE id = ?", (old_id,))
```

#### 具体实现：注册高频孤儿标签

```python
# 需要注册到 tags 表的高频孤儿标签
ORPHAN_REGISTRATIONS = [
    # (id, name, type, parent_id)
    ("energy", "能源", "topic", "science"),
    ("space", "航天", "topic", "science"),
    ("agriculture", "农业", "topic", "science"),
    ("biotech", "生物科技", "topic", "science"),
    ("telecom", "通信", "topic", "tech"),
    ("regulation", "监管政策", "topic", "business"),
    ("policy", "政策", "topic", "business"),
    ("infrastructure", "基础设施", "topic", "business"),
    ("manufacturing", "制造业", "topic", "business"),
    ("transportation", "交通", "topic", "lifestyle"),
    ("retail", "零售", "topic", "business"),
    ("pharma", "医药", "topic", "health"),
    ("logistics", "物流", "topic", "business"),
    ("social_media", "社交媒体", "topic", "tech"),
    ("public_health", "公共卫生", "topic", "health"),
    ("culture", "文化", "topic", "lifestyle"),
]

now = int(time.time())
for tag_id, name, tag_type, parent_id in ORPHAN_REGISTRATIONS:
    conn.execute(
        """INSERT OR IGNORE INTO tags 
           (id, name, name_en, type, parent_id, enabled, sort_order, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)""",
        (tag_id, name, tag_id, tag_type, parent_id, now, now)
    )
```

#### 具体实现：修正 parent_id

```python
# AI 公司/产品标签 → parent 改为 ai_ml
AI_ENTITIES = [
    "openai", "anthropic", "deepseek", "claude", "gemini", "xai",
    "zhipu", "minimax", "kimi", "qwen", "doubao", "grok", "codex",
    "stepfun", "tencent_yuanbao", "yuanbao",
]
for tag_id in AI_ENTITIES:
    conn.execute("UPDATE tags SET parent_id = 'ai_ml' WHERE id = ?", (tag_id,))

# 机器人相关 → parent 改为 robotics
ROBOTICS_ENTITIES = ["humanoid_robot", "embodied_ai", "embodied_intelligence", "unitree", "optimus"]
for tag_id in ROBOTICS_ENTITIES:
    conn.execute("UPDATE tags SET parent_id = 'robotics' WHERE id = ?", (tag_id,))

# 芯片相关 → parent 改为 hardware
HARDWARE_ENTITIES = ["semiconductor", "nvidia", "hbm4"]
for tag_id in HARDWARE_ENTITIES:
    conn.execute("UPDATE tags SET parent_id = 'hardware' WHERE id = ?", (tag_id,))

# 自动驾驶相关 → parent 改为 autonomous_driving
AUTO_ENTITIES = ["robotaxi", "tesla_fsd", "cybercab"]
for tag_id in AUTO_ENTITIES:
    conn.execute("UPDATE tags SET parent_id = 'autonomous_driving' WHERE id = ?", (tag_id,))
```

---

## 三、实施步骤

### Phase 1：数据清洗（可立即执行）

执行上面 2.3 节中的 SQL 脚本，按顺序：
1. 合并重复标签（MERGE_MAP）
2. 注册高频孤儿标签（ORPHAN_REGISTRATIONS）
3. 修正 parent_id（AI_ENTITIES / ROBOTICS_ENTITIES / HARDWARE_ENTITIES / AUTO_ENTITIES）

可以合并成一个 Python 脚本，通过 `docker exec` 在服务器上执行。

### Phase 2：代码改造（防止未来产生脏数据）

#### 2a. 增强 `normalize_tag_id()`

在 `tag_discovery.py` 的 `TAG_NORMALIZATION["synonyms"]` 中增加版本号→产品的映射：

```python
# 新增版本号剥离逻辑
VERSION_STRIP_PATTERNS = [
    # claude_opus_4_6 → claude
    (r"^(claude)_(?:opus|sonnet|haiku)_[\d_]+$", r"\1"),
    # gpt_5_2, gpt_5_3_codex → gpt
    (r"^(gpt)_[\d_]+(?:_\w+)?$", r"\1"),
    # deepseek_v4, deepseek_ocr2 → deepseek
    (r"^(deepseek)_(?:v\d+|ocr\d+)$", r"\1"),
    # gemini_3, gemini_3_1_pro → gemini
    (r"^(gemini)_[\d_]+(?:_\w+)?$", r"\1"),
    # qwen3, qwen3_5, qwen3_max_thinking → qwen
    (r"^(qwen)\d+(?:_[\w]+)?$", r"\1"),
    # glm5, glm_5, glm_ocr → glm
    (r"^(glm)[\d_]+(?:_\w+)?$", r"\1"),
    # kimi_k2_5, kimi_k2.5 → kimi
    (r"^(kimi)_k[\d_.]+$", r"\1"),
    # doubao_2.0, doubao_2_0 → doubao
    (r"^(doubao)_[\d_.]+$", r"\1"),
    # seedance_2.0, seedance_2_0 → seedance
    (r"^(seedance)_[\d_.]+$", r"\1"),
    # minimax_m2_5 → minimax
    (r"^(minimax)_m[\d_]+$", r"\1"),
]

def strip_version(tag_id: str) -> str:
    """将版本号标签归约到产品级标签"""
    for pattern, replacement in VERSION_STRIP_PATTERNS:
        result = re.sub(pattern, replacement, tag_id)
        if result != tag_id:
            return result
    return tag_id
```

在 `normalize_tag_id()` 末尾调用 `strip_version()`，这样 AI 输出 `claude_opus_4_6` 时自动归约为 `claude`。

**但同时保留原始版本标签**：在 `_mb_ai_store_labels()` 中，同时写入产品级和版本级两条 tag 记录：

```python
# 在 _mb_ai_store_labels 的 suggested_tags 处理中：
raw_tag_id = st.get("id", "")
normalized = discovery_service.normalize_tag_id(raw_tag_id)
if normalized and normalized != raw_tag_id:
    # 写入产品级标签（用于栏目查询）
    tag_rows.append((sid, dk, normalized, confidence, "ai", labeled_at))
    # 也写入原始版本标签（用于精确搜索）
    tag_rows.append((sid, dk, raw_tag_id, confidence, "ai_version", labeled_at))
```

#### 2b. 在 `save_candidate()` 中自动设置 parent_id

```python
def save_candidate(self, tag_id, name, tag_type="topic", parent_id=None, ...):
    # 自动推断 parent
    resolved_parent = self._auto_resolve_parent(tag_id, parent_id)
    # ... 后续逻辑用 resolved_parent 替代 parent_id
```

#### 2c. Prompt 微调

在 `_mb_ai_prompt_text()` 的 `suggested_tags` 说明中加一条规则：

```
• 产品版本标签请用产品名（如 deepseek），不要带版本号（如 deepseek_v4）
• 版本信息放在 keywords 中：{"id":"deepseek","keywords":["DeepSeek V4","深度求索V4"]}
```

#### 2d. ID 匹配替代顺序匹配

`_mb_ai_call_qwen` 返回结果改用 `id` 字段匹配：

```python
# 当前（有错配风险）：
for ent, out in zip(entries, outputs):
    ...

# 改为：
output_map = {}
for out in outs:
    oid = str(out.get("id") or "").strip()
    if oid:
        output_map[oid] = out

for ent in entries:
    sid = str(ent.get("source_id") or "")
    dk = str(ent.get("dedup_key") or "")
    key = f"{sid}::{dk}"
    out = output_map.get(key)
    if out is None:
        # AI 跳过了这条，标记为 error
        out = {"action": "exclude", "score": 0, "confidence": 0, "reason": "ai_skipped"}
    norm = _mb_ai_normalize_row(out)
    ...
```

#### 2e. 抽取公共过滤逻辑

将 `morning_brief_routes.py` 和 `cache_warmup.py` 中重复的 tag/category 白名单过滤抽到 `deps.py`：

```python
# hotnews/web/deps.py
def filter_by_tag_whitelist(
    tag_ids: set, source_category: str,
    tag_whitelist: set, tag_whitelist_enabled: bool,
    category_whitelist: set, category_whitelist_enabled: bool,
    ai_categories: set = {"AI_MODEL", "DEV_INFRA", "HARDWARE_PRO"},
) -> bool:
    """返回 True 表示通过过滤"""
    if tag_whitelist_enabled and tag_whitelist:
        return bool(tag_ids.intersection(tag_whitelist)) or source_category in ai_categories
    if category_whitelist_enabled and category_whitelist:
        return source_category in category_whitelist or source_category in ai_categories
    return True
```

### Phase 3：新增 API（支持按标签分栏目）

#### `GET /api/tags/columns`

返回可作为栏目的标签列表：

```python
@router.get("/api/tags/columns")
async def api_tag_columns(hours: int = Query(72, ge=1, le=168)):
    """返回可用栏目标签，附带最近文章数"""
    conn = get_online_db()
    cutoff = int(time.time()) - hours * 3600
    
    # 获取所有 enabled 的 topic 标签
    cur = conn.execute(
        "SELECT id, name, name_en, parent_id, icon, sort_order "
        "FROM tags WHERE type='topic' AND enabled=1 ORDER BY sort_order, id"
    )
    topics = [dict(zip(["id","name","name_en","parent_id","icon","sort_order"], r)) for r in cur]
    
    # 统计每个标签最近的文章数（含子标签）
    for topic in topics:
        family = get_tag_family(conn, topic["id"])
        placeholders = ",".join(["?"] * len(family))
        cur = conn.execute(
            f"SELECT COUNT(DISTINCT source_id || dedup_key) FROM rss_entry_tags "
            f"WHERE tag_id IN ({placeholders}) AND created_at >= ?",
            (*family, cutoff)
        )
        topic["recent_count"] = cur.fetchone()[0] or 0
    
    return UnicodeJSONResponse(content={"columns": topics})
```

#### `GET /api/tags/{tag_id}/timeline`

返回某个标签下的文章时间线（递归包含子标签）：

```python
@router.get("/api/tags/{tag_id}/timeline")
async def api_tag_timeline(
    tag_id: str,
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    quality_filter: int = Query(1, ge=0, le=1),
):
    """按标签查询文章时间线，自动包含子标签"""
    conn = get_online_db()
    family = get_tag_family(conn, tag_id)
    
    placeholders = ",".join(["?"] * len(family))
    quality_join = ""
    quality_where = ""
    if quality_filter:
        quality_join = (
            "JOIN rss_entry_ai_labels l "
            "ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key"
        )
        quality_where = "AND l.action = 'include' AND l.score >= 75 AND l.confidence >= 0.70"
    
    cur = conn.execute(
        f"""
        SELECT DISTINCT e.source_id, e.dedup_key, e.title, e.url,
               e.created_at, e.published_at, COALESCE(s.name, '')
        FROM rss_entries e
        JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key
        {quality_join}
        LEFT JOIN rss_sources s ON s.id = e.source_id
        WHERE t.tag_id IN ({placeholders})
          AND e.published_at > 0
          {quality_where}
        GROUP BY e.source_id, e.dedup_key
        ORDER BY e.published_at DESC
        LIMIT ? OFFSET ?
        """,
        (*family, limit, offset)
    )
    # ... 转换为 items 返回
```

### Phase 4：前端改造

#### 4.0 现有前端架构分析

当前前端是 Jinja2 SSR + Vanilla JS 模块化架构：
- 顶部 Tab 栏（`.category-tabs`）：按 `data.categories` 渲染，支持拖拽排序
- 内容区（`.tab-content-area`）：每个 Tab 对应一个 `.tab-pane`
- 每个 Tab 内是 `.platform-grid`（横向滚动的卡片网格），每个数据源一张卡片
- JS 模块化：`src/` 下 50+ 模块，esbuild 打包，code splitting
- 已有的标签相关模块：`my-tags.js`（我的关注标签）、`morning-brief.js`（AI早报时间线）

关键发现：**`my-tags.js` 已经实现了按标签展示新闻卡片的完整模式**（`createTagCard` 函数），`morning-brief.js` 已经实现了时间线无限滚动。这两个模块是改造的基础。

#### 4.1 方案选择：渐进式改造 vs 全量重写

推荐**渐进式改造**（在现有 Tab 体系中新增标签栏目），而非全量重写。原因：
- 现有 Tab 系统已经很成熟（拖拽排序、懒加载、滚动恢复、缓存）
- `my-tags` 和 `morning-brief` 已经验证了标签+时间线的模式
- 用户可以同时保留旧的「订阅源卡片」栏目和新的「标签栏目」
- 风险低，可以逐步迁移

#### 4.2 具体改造方案

##### Step 1：新增 `tag-columns.js` 模块

复用 `morning-brief.js` 的时间线模式 + `my-tags.js` 的卡片渲染：

```javascript
// src/tag-columns.js
// 通用的标签栏目模块，每个标签栏目 = 一个 Tab，内容是时间线

const TAG_COLUMN_PREFIX = 'tag-col-';  // Tab ID 前缀，如 tag-col-ai_ml

// 从 API 获取可用栏目
async function fetchColumns() {
    const resp = await fetch('/api/tags/columns?hours=72');
    const data = await resp.json();
    return data.columns || [];
}

// 获取某个标签的时间线
async function fetchTagTimeline(tagId, limit = 50, offset = 0) {
    const url = `/api/tags/${tagId}/timeline?limit=${limit}&offset=${offset}`;
    const resp = await fetch(url);
    const data = await resp.json();
    return data.items || [];
}

// 渲染标签栏目内容（时间线模式，类似 morning-brief）
function renderTagTimeline(container, items, tagId, cardIndex = 0) {
    // 复用 morning-brief 的 _buildNewsItemsHtml 和 _appendCard 模式
    // 每 N 条一张卡片，横向滚动，IntersectionObserver 无限加载
}

// 初始化：在 Tab 栏中注入标签栏目
async function initTagColumns() {
    const columns = await fetchColumns();
    const userPrefs = loadUserColumnPrefs();  // localStorage
    
    for (const col of columns) {
        if (userPrefs.hidden?.includes(col.id)) continue;
        injectTab(col);      // 在 .category-tabs 中插入 Tab
        injectPane(col);     // 在 .tab-content-area 中插入空 Pane
    }
}
```

##### Step 2：Tab 注入方式

不改 Jinja2 模板，而是在 JS 初始化时动态注入标签 Tab：

```javascript
function injectTab(column) {
    const tabsContainer = document.querySelector('.category-tabs');
    const tabId = TAG_COLUMN_PREFIX + column.id;
    
    // 避免重复注入
    if (document.querySelector(`.category-tab[data-category="${tabId}"]`)) return;
    
    const tab = document.createElement('div');
    tab.className = 'category-tab tag-column-tab';
    tab.dataset.category = tabId;
    tab.dataset.tagId = column.id;
    tab.onclick = () => switchTab(tabId);
    tab.innerHTML = `
        <div class="category-tab-icon">${column.icon || '🏷️'}</div>
        <div class="category-tab-name">${column.name}</div>
        <div class="category-tab-count">${column.recent_count || ''}</div>
    `;
    
    // 插入到指定位置（在 explore 之后，或按用户排序）
    const refTab = tabsContainer.querySelector('[data-category="explore"]');
    if (refTab?.nextSibling) {
        tabsContainer.insertBefore(tab, refTab.nextSibling);
    } else {
        tabsContainer.appendChild(tab);
    }
}
```

##### Step 3：懒加载 + 无限滚动

标签栏目的内容只在用户切换到该 Tab 时才加载（复用现有 lazy-load 机制）：

```javascript
// 在 switchTab 中增加标签栏目的处理
function handleTagColumnSwitch(tabId) {
    const tagId = tabId.replace(TAG_COLUMN_PREFIX, '');
    const grid = document.querySelector(`#tab-${tabId} .platform-grid`);
    
    if (grid.dataset.loaded === '1') return;  // 已加载
    grid.dataset.loaded = '1';
    
    // 初始加载 + 设置 IntersectionObserver 无限滚动
    loadTagTimeline(tagId, grid);
}
```

##### Step 4：用户偏好存储

```javascript
// localStorage 存储用户的栏目偏好
const PREFS_KEY = 'hotnews_tag_columns_prefs';

function loadUserColumnPrefs() {
    try {
        return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}');
    } catch { return {}; }
}

// 偏好结构：
// {
//   hidden: ['stock', 'crypto'],     // 隐藏的栏目
//   order: ['ai_ml', 'llm', ...],    // 自定义排序
//   pinned: ['ai_ml'],               // 置顶栏目
// }
```

#### 4.3 UI 布局建议

两种布局模式，用户可切换：

**模式 A：时间线模式（推荐默认）**
- 类似现有 AI 早报，每个标签栏目是一个 Tab
- Tab 内是按时间排序的新闻列表，横向分卡片
- 适合快速浏览、信息密度高
- 已有 `morning-brief.js` 可直接复用

**模式 B：卡片模式**
- 类似现有 `my-tags`，一个 Tab 内同时展示多个子标签的卡片
- 比如点击「科技」Tab，同时看到 AI、硬件、开源 等子标签的卡片
- 适合概览、发现不同领域的内容
- 已有 `my-tags.js` 的 `createTagCard` 可复用

```
┌─────────────────────────────────────────────────┐
│  🏷️ AI   📱 硬件   🔓 安全   💰 财经   🎮 游戏  │  ← 标签 Tab 栏
├─────────────────────────────────────────────────┤
│                                                 │
│  模式 A（时间线）：                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 最新 1-50 │ │ 51-100   │ │ 101-150  │ →      │
│  │ ───────── │ │ ──────── │ │ ──────── │        │
│  │ 1. GPT-5  │ │ 51. xxx  │ │ 101. xxx │        │
│  │ 2. Claude │ │ 52. xxx  │ │ 102. xxx │        │
│  │ 3. ...    │ │ ...      │ │ ...      │        │
│  └──────────┘ └──────────┘ └──────────┘        │
│                                                 │
│  模式 B（子标签卡片）：                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐        │
│  │ 🤖 LLM   │ │ 🔧 开发工具│ │ 🤖 机器人 │        │
│  │ ───────── │ │ ──────── │ │ ──────── │        │
│  │ 1. GPT-5  │ │ 1. Kiro  │ │ 1. 人形  │        │
│  │ 2. Claude │ │ 2. Codex │ │ 2. 具身  │        │
│  └──────────┘ └──────────┘ └──────────┘        │
└─────────────────────────────────────────────────┘
```

#### 4.4 与现有栏目的共存策略

不需要一次性替换所有栏目，建议分步：

1. **第一步**：在现有 Tab 栏中新增 2-3 个标签栏目（如 AI、硬件、财经），与旧栏目并存
2. **第二步**：观察用户使用数据（点击率、停留时间），确认标签栏目效果
3. **第三步**：逐步将旧的「订阅源分类」栏目替换为标签栏目
4. **最终**：旧栏目可以保留为「经典模式」，标签栏目作为默认

#### 4.5 移动端适配

现有 CSS 已经有完善的响应式断点（640px/1024px），标签栏目自动适配：
- 桌面：3 列卡片横向滚动
- 平板：2 列
- 手机：1 列全宽，Tab 栏横向滚动

额外建议：移动端 Tab 栏标签多时，可以加一个「更多」按钮展开完整列表。

#### 4.6 前端工作量估算

| 任务 | 工作量 | 依赖 |
|------|--------|------|
| `tag-columns.js` 核心模块 | 2-3h | Phase 3 API |
| Tab 注入 + 懒加载 | 1h | 核心模块 |
| 用户偏好存储 | 30min | 无 |
| 模式 B 子标签卡片 | 1-2h | 核心模块 |
| 移动端适配调优 | 1h | 核心模块 |
| 总计 | 5-7h | |

---

## 四、优先级与工作量

| 优先级 | 任务 | 工作量 | 影响 |
|--------|------|--------|------|
| P0 | Phase 1 数据清洗脚本 | 30min | 立即改善数据质量 |
| P0 | Phase 2a-2b 版本归约 + 自动 parent | 1-2h | 防止未来脏数据 |
| P0 | Phase 3 新增 API | 2h | 前端改造的前置依赖 |
| P1 | Phase 2c Prompt 微调 | 30min | 减少版本号标签产生 |
| P1 | Phase 2d-2e ID 匹配 + 公共过滤 | 1h | 提升数据准确性 |
| P1 | Phase 4 Step 1-3 前端核心模块 | 3-4h | 标签栏目可用 |
| P2 | Phase 4 Step 4 用户偏好 + 模式切换 | 2-3h | 用户体验优化 |
| P2 | Phase 4 移动端适配 | 1h | 移动端体验 |
