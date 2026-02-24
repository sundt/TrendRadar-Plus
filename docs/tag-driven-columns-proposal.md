# 标签驱动栏目系统方案（V4）

## 一、现状分析

### 1.1 当前栏目问题

现有 6 个栏目存在严重重叠：

| 栏目 | 数据来源 | 问题 |
|------|---------|------|
| 每日AI早报 | rss_entry_ai_labels (action=include, score≥75) | 全品类精选，不只是 AI；每天 400-1000 篇太多 |
| 精选公众号 | featured_wechat_mps (admin, 36个号) | 36个号全是 AI/科技类，80% 内容与早报重叠 |
| 财经投资 | rss_sources.category='finance' + AI 过滤 | 独立，无重叠问题 |
| 精选博客 | rss_sources.category='explore' | 独立，无重叠问题 |
| 我的关注 | user_tag_settings + rss_entry_tags | 个人订阅，无重叠问题 |
| 新发现 | tags 热度推荐（个性化） | 独立，无重叠问题 |

**核心问题**：每日AI早报（全品类精选）和精选公众号（AI科技号）高度重叠（80%），且两者都没有细分，用户无法按兴趣筛选。新增任何主题栏目都需要改 3-4 个文件，维护成本高。

### 1.2 数据基础（已验证）

- 文章总量：83,324 篇（rss: 50,501 / mp: 32,845）
- rss_entry_tags：276,177 行，覆盖率 ~96%
- 复合索引 `(tag_id, created_at DESC)` 已在生产创建，查询 <1ms ✅
- rss_entry_ai_labels：100,196 行，每天持续更新

**近7天高频 Topic tags：**

| tag_id | 名称 | 近7天文章数 | 归属一级 |
|--------|------|------------|---------|
| ai_ml | AI/机器学习 | 4,187 | AI |
| macro | 宏观经济 | 2,470 | 财经 |
| startup | 创业/融资 | 1,946 | 商业 |
| stock | 股票 | 1,274 | 财经 |
| ecommerce | 电商 | 1,233 | 商业 |
| hardware | 硬件/芯片 | 1,169 | AI |
| llm | 大语言模型 | 1,156 | AI |
| dev_tools | 开发工具 | 1,130 | 开发者 |
| gaming | 游戏 | 878 | 生活 |
| mobile | 移动开发 | 829 | 开发者 |
| opensource | 开源项目 | 766 | 开发者 |
| programming | 编程语言 | 688 | 开发者 |
| real_estate | 房地产 | 672 | 商业 |
| robotics | 机器人 | 637 | AI |
| cybersecurity | 网络安全 | 584 | 开发者 |
| crypto | 加密货币 | 465 | 财经 |
| ai_agent | AI Agent | 454 | AI |
| web3 | Web3/区块链 | 448 | 财经 |
| cloud | 云计算 | 338 | 开发者 |
| automotive | 汽车 | 278 | 商业 |
| semiconductor | 半导体 | 176 | AI |
| biotech | 生物科技 | 142 | 科学健康 |
| space | 航天 | 164 | 科学健康 |
| film | 电影 | 131 | 生活 |
| banking | 银行 | 130 | 财经 |
| pharma | 医药 | 113 | 科学健康 |
| travel | 旅行 | 158 | 生活 |
| culture | 文化 | 176 | 生活 |

---

## 二、新栏目结构设计

### 2.1 核心思路

- **合并**：每日AI早报 + 精选公众号 → 废弃，内容分散到按主题细分的新栏目
- **两级导航**：一级栏目（主 tab）+ 二级栏目（子 tab）
- **数据来源统一**：所有新主题栏目用 `rss_entry_tags` 的 topic tag 组合查询
- **精选博客、我的关注、新发现**：保持现有逻辑不变

### 2.2 一级栏目顺序

```
我的关注 | 新发现 | 精选博客 | AI | 开发者 | 商业 | 财经 | 科学健康 | 生活
```

**登录逻辑：**
- 我的关注、精选博客 — tab 所有人可见，点击时未登录弹登录提示（需登录）
- 新发现、AI、开发者、商业、财经、科学健康、生活 — 所有人可见可用，无需登录

**我的主题：** 代码保留，入口暂时隐藏，后续规划后再开放。

### 2.3 完整栏目树

```
我的关注          （需登录，保持现有逻辑）
  └── 全部        （唯一子分类，内容 = 现有我的关注）

新发现            （无需登录，保持现有逻辑）
  └── 全部        （唯一子分类，内容 = 现有新发现）

精选博客          （需登录，保持现有逻辑）
  └── 全部        （唯一子分类，内容 = 现有精选博客）

AI               （所有人可用）
  ├── 全部        tag: ai_ml（顶层分类 tag，覆盖所有 AI 相关内容）
  ├── 大模型      tag: llm + openai + claude + chatgpt + gemini + deepseek + grok + qwen + kimi + doubao + glm + anthropic + minimax + zhipu
  ├── AI 编程     tag: claude_code + vibe_coding + agentic_coding
  ├── AI Agent    tag: ai_agent + agentic_ai + mcp
  └── 硬件芯片    tag: hardware + semiconductor + robotics + humanoid_robot

开发者            （所有人可用）
  ├── 全部        tag: tech（顶层分类 tag）
  ├── 开发工具    tag: dev_tools + opensource + programming
  ├── 云与基础设施 tag: cloud + database + infrastructure
  ├── 移动开发    tag: mobile + ios_26 + os
  └── 网络安全    tag: cybersecurity

商业              （所有人可用）
  ├── 全部        tag: business（顶层分类 tag）
  ├── 创业融资    tag: startup
  ├── 电商零售    tag: ecommerce + retail
  └── 出行汽车    tag: automotive + fsd + autonomous_driving

财经              （所有人可用）
  ├── 全部        tag: finance（顶层分类 tag）
  ├── 宏观经济    tag: macro + trade + policy
  ├── 股票市场    tag: stock
  ├── 加密货币    tag: crypto + web3
  └── 大宗商品    tag: commodity + energy + banking

科学健康          （所有人可用）
  ├── 全部        tag: science + health（两个顶层 tag 并用）
  ├── 生物医药    tag: biotech + pharma + healthcare + public_health
  ├── 航天能源    tag: space + energy + fusion_energy
  └── 量子通信    tag: quantum_computing + telecom + 6g

生活              （所有人可用）
  ├── 全部        tag: lifestyle + entertainment（两个顶层 tag 并用）
  ├── 游戏        tag: gaming
  ├── 影视娱乐    tag: film + music + celebrity
  └── 旅行文化    tag: travel + tourism + culture + food
```

### 2.4 视图切换（时间线 / 卡片）

- **视图切换绑定二级分类**，每个二级分类独立存储视图偏好
- 用户偏好存 localStorage，key 为二级分类 id（如 `ai-llm`）
- 切换方式：长按二级 tab → context menu → "切换视图"
- `column_config` 表的 `default_view` 字段控制默认视图（timeline / card）

**两种模式的数据来源相同，渲染方式不同：**

| 模式 | 渲染方式 | API 调用 |
|------|---------|---------|
| 时间线 | 该二级分类所有 tag 合并，按时间倒序横向滚动 | `/api/timeline?tags=llm,openai,claude,...` |
| 卡片 | 该二级分类的每个 tag 独立一张卡片并排展示 | 每张卡片各自调用 `/api/timeline?tags={single_tag}&limit=20` |

**卡片模式示例（AI > 大模型）：**
```
[OpenAI]          [Claude]          [DeepSeek]        [Gemini]          [Qwen] ...
tag: openai       tag: claude       tag: deepseek     tag: gemini       tag: qwen
1. GPT-5 发布     1. Claude 4...    1. R2 发布...     1. 2.0 Ultra...   1. ...
2. ...            2. ...            2. ...            2. ...            2. ...
```

**卡片模式示例（AI > 硬件芯片）：**
```
[硬件]            [半导体]          [机器人]          [人形机器人]
tag: hardware     tag: semiconductor tag: robotics    tag: humanoid_robot
1. ...            1. ...            1. ...            1. ...
```

实现上复用现有 platform-card DOM 结构，`data-platform` 设为 tag id（如 `openai`），卡片标题 = tag 显示名。

### 2.5 栏目配置表设计

`column_config` 表放 **`online.db`**（全局配置，非用户数据）。未来如需用户级别的个性化（隐藏/排序），单独建 `user_column_prefs` 表放 `user.db`。

```sql
CREATE TABLE column_config (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '',
    parent_id TEXT DEFAULT NULL,        -- 父栏目 ID，NULL 表示一级栏目
    tag_ids TEXT NOT NULL DEFAULT '[]', -- 关联 topic tag IDs（JSON 数组）
    source_type TEXT DEFAULT 'tag',     -- tag / source_category / custom
    source_filter TEXT DEFAULT '{}',    -- 额外过滤条件（JSON）
    default_view TEXT DEFAULT 'timeline', -- timeline / card
    ai_filter INTEGER DEFAULT 0,        -- 是否启用 AI 质量过滤
    sort_order INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER
);
```

### 2.6 统一时间线 API

```
GET /api/timeline?tags=llm,openai,claude&limit=50&offset=0
```

两步查询（利用已有复合索引 `(tag_id, created_at DESC)`）：
1. `SELECT DISTINCT dedup_key FROM rss_entry_tags WHERE tag_id IN (?) ORDER BY created_at DESC LIMIT N`
2. 批量从 `rss_entries` 按 dedup_key 取详情

响应时间 <50ms（已验证）。

### 2.7 /api/columns 响应格式

```
GET /api/columns
```

返回完整栏目树，前端据此动态渲染一级 tab 和二级 tab：

```json
{
  "columns": [
    {
      "id": "my-tags",
      "name": "我的关注",
      "icon": "",
      "require_login": true,
      "fixed_view": null,
      "default_view": "timeline",
      "sort_order": 0,
      "children": []
    },
    {
      "id": "discovery",
      "name": "新发现",
      "icon": "",
      "require_login": false,
      "fixed_view": "card",
      "default_view": "card",
      "sort_order": 1,
      "children": []
    },
    {
      "id": "explore",
      "name": "精选博客",
      "icon": "",
      "require_login": true,
      "fixed_view": "timeline",
      "default_view": "timeline",
      "sort_order": 2,
      "children": []
    },
    {
      "id": "ai",
      "name": "AI",
      "icon": "",
      "require_login": false,
      "fixed_view": null,
      "default_view": "timeline",
      "sort_order": 3,
      "children": [
        {
          "id": "ai-all",
          "name": "全部",
          "tag_ids": ["ai_ml"],
          "sort_order": 0
        },
        {
          "id": "ai-llm",
          "name": "大模型",
          "tag_ids": ["llm", "openai", "claude", "chatgpt", "gemini", "deepseek", "grok", "qwen", "kimi", "doubao", "glm", "anthropic", "minimax", "zhipu"],
          "sort_order": 1
        },
        {
          "id": "ai-coding",
          "name": "AI 编程",
          "tag_ids": ["claude_code", "vibe_coding", "agentic_coding"],
          "sort_order": 2
        },
        {
          "id": "ai-agent",
          "name": "AI Agent",
          "tag_ids": ["ai_agent", "agentic_ai", "mcp"],
          "sort_order": 3
        },
        {
          "id": "ai-hardware",
          "name": "硬件芯片",
          "tag_ids": ["hardware", "semiconductor", "robotics", "humanoid_robot"],
          "sort_order": 4
        }
      ]
    }
    // ... 其余一级栏目结构相同，子分类 id 遵循 {parent}-{sub_key} 规则（见 2.8 节）
  ]
}
```

**字段说明：**

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 栏目唯一 id，用作 tab `data-category`、localStorage key、scroll-restore key |
| `require_login` | bool | `true` 时前端点击拦截，未登录弹登录提示 |
| `fixed_view` | string\|null | 非 null 时视图不可切换（`"timeline"` 或 `"card"`） |
| `default_view` | string | 用户无偏好时的默认视图 |
| `children` | array | 二级分类列表，一级栏目专属字段（`my-tags`/`discovery`/`explore` 无二级） |
| `tag_ids` | array | 二级分类专属，查询 `/api/timeline?tags=...` 时使用 |

**前端使用逻辑：**
```js
// 渲染时
columns.forEach(col => {
    renderTab(col);                          // 渲染一级 tab
    if (col.children?.length) {
        renderSubTabs(col.id, col.children); // 渲染二级 tab 行
    }
});

// 点击一级 tab 时
function onTabClick(col) {
    if (col.require_login && !isLoggedIn()) {
        openLoginModal();
        return;
    }
    switchTab(col.id);
}

// 获取视图模式时（传一级栏目 id）
const mode = col.fixed_view ?? viewMode.get(col.id);
```

### 2.8 二级分类 Tab ID 命名规则

格式：`{parent_id}-{sub_key}`，连字符分隔。

**完整 id 对照表：**

| 一级 id | 二级 id | 名称 |
|---------|---------|------|
| `my-tags` | `my-tags-all` | 全部 |
| `discovery` | `discovery-all` | 全部 |
| `explore` | `explore-all` | 全部 |
| `ai` | `ai-all` | 全部 |
| `ai` | `ai-llm` | 大模型 |
| `ai` | `ai-coding` | AI 编程 |
| `ai` | `ai-agent` | AI Agent |
| `ai` | `ai-hardware` | 硬件芯片 |
| `developer` | `dev-all` | 全部 |
| `developer` | `dev-tools` | 开发工具 |
| `developer` | `dev-cloud` | 云与基础设施 |
| `developer` | `dev-mobile` | 移动开发 |
| `developer` | `dev-security` | 网络安全 |
| `business` | `biz-all` | 全部 |
| `business` | `biz-startup` | 创业融资 |
| `business` | `biz-ecom` | 电商零售 |
| `business` | `biz-auto` | 出行汽车 |
| `finance` | `fin-all` | 全部 |
| `finance` | `fin-macro` | 宏观经济 |
| `finance` | `fin-stock` | 股票市场 |
| `finance` | `fin-crypto` | 加密货币 |
| `finance` | `fin-commodity` | 大宗商品 |
| `science` | `sci-all` | 全部 |
| `science` | `sci-biotech` | 生物医药 |
| `science` | `sci-space` | 航天能源 |
| `science` | `sci-quantum` | 量子通信 |
| `lifestyle` | `life-all` | 全部 |
| `lifestyle` | `life-gaming` | 游戏 |
| `lifestyle` | `life-film` | 影视娱乐 |
| `lifestyle` | `life-travel` | 旅行文化 |

**好处：**
- `[data-category^="ai-"]` 可批量选中所有 AI 子分类
- localStorage / scroll-restore key 自然隔离（`scroll_ai-llm` vs `scroll_dev-tools`）
- 看 id 即知归属，调试友好

### 2.9 二级分类默认激活规则

进入一级栏目时，默认激活**上次访问的二级分类**，无记录时回退到"全部"（`{parent}-all`）。

存储 key：`hotnews_active_subtab_{parentId}`，存在 localStorage。

```js
// 进入 'ai' 时
const lastSub = storage.getRaw('hotnews_active_subtab_ai') || 'ai-all';
switchSubTab(lastSub);

// 切换二级分类时保存
storage.setRaw('hotnews_active_subtab_ai', 'ai-llm');
```

### 2.10 二级 tab 行布局规则

**所有一级栏目都有二级 tab 行**，布局永远稳定，不需要动态显示/隐藏：

- "我的关注"、"新发现"、"精选博客" — 只有一个"全部"子 tab，内容 = 该栏目现有逻辑
- 主题栏目（AI、开发者等）— 有多个子 tab

好处：
- 二级 tab 行始终存在，无跳动/动画问题
- 视觉结构统一，用户操作模式一致
- 未来给精选博客等加子分类，结构天然支持

对应 id：`my-tags-all`、`discovery-all`、`explore-all`，`/api/columns` 的 `children` 数组里各有一个"全部"条目。

---

## 三、移动端适配

### 3.1 现有移动端机制

- 左下角"分类"图标 → 弹出 CategoryPanel（底部滑出面板）→ 选择分类
- 内容区左右滑动（BoundarySwipe）切换分类
- 一级 tab 和二级 tab 均支持横向滚动
- 长按 tab → context menu → 切换时间线/卡片视图

### 3.2 加入二级分类后的适配

**CategoryPanel 改为两级分组：**
```
[我的关注] [新发现] [精选博客]

AI ▶                              ← 点击"AI"文字直接跳转到 ai-all，点击"▶"展开二级
  [全部] [大模型] [AI编程] [AI Agent] [硬件芯片]

[开发者] [商业] [财经] [科学健康] [生活]
```

**CategoryPanel 点击交互规则：**
- 单击一级栏目名 → 直接跳转到该栏目的"全部"子分类（`{parent}-all`），关闭面板
- 单击展开箭头（▶）→ 展开/收起二级列表，不跳转、不关闭面板
- 单击二级分类 → 直接跳转，关闭面板

好处：一次点击即可进入内容，展开二级是可选操作，不强迫用户两次点击。

**BoundarySwipe：**
- 在某一级栏目内，左右滑动在该栏目的二级分类间切换
- 滑到边界时切换到相邻一级栏目的"全部"子分类（`{parent}-all`），不恢复上次记录的二级分类
- 二级分类内左右滑动切换同级其他二级分类

**二级 tab 横向滚动：**
- 桌面端和移动端一致，选中一级后下方出现二级 tab 横向滚动条
- 移动端二级 tab 字体略小，间距收紧，适配窄屏

**视图切换：**
- 长按一级 tab → context menu → 切换时间线/卡片
- 切换状态绑定一级栏目，二级分类继承

---

## 四、迁移策略

### 4.1 保留 vs 废弃

| 栏目 | 处理方式 |
|------|---------|
| 每日AI早报 | 废弃，内容分散到"AI"一级栏目的各二级分类 |
| 精选公众号 | 废弃，36个AI公众号的文章自然出现在"AI"栏目里 |
| 财经投资 | 升级为"财经"一级栏目，加二级分类，**直接复用 `finance` id**，后端数据源从 `rss_sources.category='finance'` 切换到 tag 查询，用户 localStorage 偏好自动继承 |
| 精选博客 | 保留不变 |
| 我的关注 | 保留不变 |
| 新发现 | 保留不变 |
| 我的主题 | 代码保留，入口隐藏，后续规划 |

### 4.2 渐进式实施

1. 先加新栏目（AI 一级 + 二级），旧栏目暂时保留
2. 验证新栏目数据质量和用户反馈
3. 确认稳定后再下线旧栏目（每日AI早报、精选公众号）

---

## 五、实施步骤

### Phase 1：后端基础设施（1天）
1. 创建 `column_config` 表（含 parent_id、default_view 字段）
2. 预置一级 + 二级栏目数据（SQL 脚本）
3. 新增 `/api/columns` — 返回栏目树形结构
4. 新增 `/api/timeline?tags=xxx` — 通用时间线 API

### Phase 2：前端适配（1-2天）
1. `data.js` 初始化时并行请求现有数据和 `/api/columns`，在 `renderViewerFromData` 里统一渲染所有栏目（新旧合并，单一渲染入口）
2. 二级 tab 行渲染逻辑：所有一级栏目都有二级 tab 行，`my-tags`/`discovery`/`explore` 只有"全部"一个子 tab
3. `view-mode.js` 清理旧栏目、新增新栏目配置（见下方详细说明）
4. `tabs.js` 更新 `SELF_MANAGED_TIMELINE` 列表
5. 测试切换、滚动恢复、加载状态

### Phase 3：移动端适配（1天）
1. `mobile-enhance.js` CategoryPanel 改为两级分组渲染
2. BoundarySwipe 适配二级分类切换逻辑
3. 移动端二级 tab 样式调整（窄屏适配）

### Phase 4：上线验证（0.5天）
1. 部署，新旧栏目并存
2. 验证各二级分类的内容质量和数据量
3. 收集反馈

### Phase 5：下线旧栏目（0.5天）
1. 下线每日AI早报、精选公众号
2. 清理相关前端代码（morning-brief.js、featured-mps 内联逻辑）
3. 清理相关后端路由（morning_brief_routes.py、featured-mps timeline）

---

## 六、风险与应对

| 风险 | 影响 | 应对 |
|------|------|------|
| 新栏目内容量不足 | 用户体验差 | 每个二级栏目近7天至少 50 篇才上线 |
| tag 覆盖不全 | 部分文章漏掉 | 保持 rss_entry_ai_labels 双写，可随时回退 |
| 前端两级 tab 交互复杂 | 切换 bug | 复用已有 header-nav-redesign 的两级导航基础设施 |
| 用户找不到原来的栏目 | 流失 | 渐进迁移，新旧并存一段时间 |
| 移动端 CategoryPanel 层级过深 | 操作繁琐 | 一级展开/收起设计，最多两次点击到达目标分类 |


---

## 七、实施细节补充

### 7.1 view-mode.js 变更

**清理旧栏目（`FIXED_CATEGORIES`）：**
```js
// 删除
'knowledge': 'timeline',   // 每日AI早报 — 废弃
'featured-mps': ...        // 精选公众号 — 废弃（同时从 DEFAULT_TIMELINE 移除）

// 保留
'discovery': 'card',       // 新发现 — 固定卡片
'rsscol-rss': 'card',      // RSS 阅读器 — 固定
'explore': 'timeline',     // 精选博客 — 固定时间线（需登录）
```

**新增二级分类到 `DEFAULT_TIMELINE`：**
```js
// 二级分类默认时间线，用户切换后偏好存 localStorage，key 为二级分类 id
const DEFAULT_TIMELINE = new Set([
    'ai-all', 'ai-llm', 'ai-coding', 'ai-agent', 'ai-hardware',
    'dev-all', 'dev-tools', 'dev-cloud', 'dev-mobile', 'dev-security',
    'biz-all', 'biz-startup', 'biz-ecom', 'biz-auto',
    'fin-all', 'fin-macro', 'fin-stock', 'fin-crypto', 'fin-commodity',
    'sci-all', 'sci-biotech', 'sci-space', 'sci-quantum',
    'life-all', 'life-gaming', 'life-film', 'life-travel',
]);
```

### 7.2 二级分类的视图模式

视图切换绑定**二级分类 id**，不继承一级栏目：

```js
// 当前激活二级分类 'ai-llm'，直接用自己的 id
const mode = viewMode.get('ai-llm'); // 读取该二级分类的偏好

// 切换时
viewMode.set('ai-llm', 'card'); // 只影响 ai-llm，其他二级分类不变
```

卡片模式下，`category-timeline.js` 的 `loadCardMode` 需扩展：根据二级分类的 `tag_ids` 列表，每个 tag 渲染一张 platform-card，调用 `/api/timeline?tags={tag}&limit=20`。

### 7.3 tabs.js — SELF_MANAGED_TIMELINE 更新

当前值（需删除废弃栏目）：
```js
// 旧
const SELF_MANAGED_TIMELINE = ['knowledge', 'explore', 'featured-mps', 'finance'];

// 新（knowledge / featured-mps 废弃后移除）
const SELF_MANAGED_TIMELINE = ['explore', 'my-tags', 'discovery'];
```

新主题栏目（ai、developer、business、finance、science、lifestyle）均走通用 `categoryTimeline` 渲染器，不需要加入 `SELF_MANAGED_TIMELINE`。

> 注意：`tabs.js` 中有两处 `SELF_MANAGED_TIMELINE` 定义（约第 382 行和第 693 行），两处都需要同步更新。

### 7.4 DEFAULT_TAB_GUEST 更新

`tabs.js` 里未登录用户默认 tab 需从 `explore` 改为 `ai`：

```js
// 旧
const DEFAULT_TAB_GUEST = 'explore';  // 精选博客现在需要登录，不适合作为游客默认页

// 新
const DEFAULT_TAB_GUEST = 'ai';       // AI 栏目无需登录，内容丰富，适合引流
```

### 7.5 _cleanupInactiveTabs 豁免列表更新

`tabs.js` 的内存清理豁免列表需要更新：

```js
// 旧
['explore', 'knowledge', 'my-tags', 'discovery', 'rsscol-rss', 'featured-mps', 'finance']

// 新
['explore', 'my-tags', 'discovery', 'rsscol-rss']
```

变更说明：
- `knowledge`、`featured-mps` — 废弃，直接移除
- `finance` — 新方案改走通用 `categoryTimeline`，不再需要豁免
- 新主题栏目（`ai`、`developer` 等）— 不加豁免，被清理后重新调用 `/api/timeline` 即可（<50ms），反而节省内存

此改动只影响内存清理策略，不影响功能正确性。

旧的预热逻辑针对 `/api/rss/featured-mps/timeline`、`/api/morning-brief` 等接口。新方案需改为预热 `/api/timeline?tags=xxx`：

```python
# 预热示例（每个一级栏目的"全部"子分类）
WARMUP_URLS = [
    '/api/timeline?tags=ai_ml&limit=50',
    '/api/timeline?tags=tech&limit=50',
    '/api/timeline?tags=business&limit=50',
    '/api/timeline?tags=finance&limit=50',
    '/api/timeline?tags=science,health&limit=50',
    '/api/timeline?tags=lifestyle,entertainment&limit=50',
]
```

同时废弃旧的预热 URL（`/api/rss/featured-mps/timeline`、`/api/morning-brief/timeline`）。

### 7.5 滚动恢复（scroll-restore）策略

**决策：二级分类按一级栏目 id 共享滚动位置。**

理由：
- 用户在"AI > 大模型"和"AI > AI Agent"之间切换时，通常期望回到同一个阅读位置（都是 AI 内容）
- 独立存储会导致每次切换二级分类都从头开始，体验割裂
- 现有 `scroll-restore.js` 的 key 格式为 `scroll_{categoryId}`，只需传一级栏目 id 即可复用

实现：
```js
// 保存时
scrollRestore.save(parentColumnId, scrollY);

// 恢复时
scrollRestore.restore(parentColumnId);
```

如果未来需要二级独立恢复，可扩展 key 为 `scroll_{parentId}_{subId}`，但当前阶段不做。

### 7.6 登录检查实现

**决策：我的关注 + 精选博客需要登录，其余栏目无需登录。**

查看现有代码，`tabs.js` 的 `switchTab` 里没有登录拦截逻辑。登录检查应在 **tab 点击的 `onclick` 层面**统一处理，而不是在 `switchTab` 内部，这样移动端 CategoryPanel 点击也能复用同一套逻辑。

实现方式：`data.js` 渲染 tab 时，对 `require_login: true` 的栏目生成带拦截的 onclick：

```js
// data.js 渲染 tab 时
const onclick = col.require_login
    ? `handleTabClickWithAuth('${catId}')`
    : `switchTab('${catId}')`;

// 全局函数
window.handleTabClickWithAuth = function(categoryId) {
    if (!TR.auth?.isLoggedIn?.()) {
        window.openLoginModal?.();
        return;
    }
    switchTab(categoryId);
};
```

移动端 CategoryPanel（`mobile-enhance.js`）点击分类时同样检查 `require_login`，从 `/api/columns` 缓存的栏目数据里读取该字段。
