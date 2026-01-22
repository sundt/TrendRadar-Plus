# 设计文档：AI 动态标签演化系统

## 1. 系统架构

### 1.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│                      新闻抓取层                               │
│                   (RSS Scheduler)                            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    AI 标签分析层                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  固定标签分类 (现有)    │  动态标签发现 (新增)      │   │
│  │  - 从预设标签选择       │  - 提取新标签            │   │
│  │  - 返回标签 ID          │  - 返回标签定义          │   │
│  └──────────────────────────────────────────────────────┘   │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  标签存储与管理层                             │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  rss_entry_tags  │  │ tag_candidates   │                 │
│  │  (标签关联)      │  │ (候选标签池)     │                 │
│  └──────────────────┘  └──────────────────┘                 │
│  ┌──────────────────┐  ┌──────────────────┐                 │
│  │  tags            │  │ tag_evolution_log│                 │
│  │  (正式标签)      │  │ (演化日志)       │                 │
│  └──────────────────┘  └──────────────────┘                 │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  标签演化引擎                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  1. 候选标签验证  →  2. 标签晋升                     │   │
│  │  3. 标签演化      →  4. 标签淘汰                     │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 核心组件


#### 组件 1: TagDiscoveryService（标签发现服务）

**职责**：从 AI 响应中提取和规范化新标签

**核心方法**：
```python
class TagDiscoveryService:
    def extract_new_tags(self, ai_response: dict) -> List[TagCandidate]:
        """从 AI 响应提取新标签"""
        
    def normalize_tag_id(self, tag_id: str) -> str:
        """规范化标签 ID（小写、下划线、去特殊字符）"""
        
    def detect_duplicates(self, tag_id: str) -> Optional[str]:
        """检测重复标签（同义词、相似标签）"""
        
    def save_candidate(self, tag: TagCandidate) -> bool:
        """保存到候选标签池"""
```

#### 组件 2: TagValidationService（标签验证服务）

**职责**：验证候选标签是否满足晋升条件

**核心方法**：
```python
class TagValidationService:
    def get_qualified_candidates(self) -> List[TagCandidate]:
        """获取满足晋升条件的候选标签"""
        
    def calculate_tag_quality(self, tag_id: str) -> float:
        """计算标签质量分数（0-1）"""
        
    def promote_to_official(self, tag_id: str) -> bool:
        """晋升为正式标签"""
```

#### 组件 3: TagEvolutionService（标签演化服务）

**职责**：管理标签的合并、分裂、升级、降级

**核心方法**：
```python
class TagEvolutionService:
    def merge_similar_tags(self, similarity_threshold: float = 0.85):
        """合并相似标签"""
        
    def split_hot_tag(self, tag_id: str, subtags: List[str]):
        """分裂热门标签"""
        
    def upgrade_tag(self, tag_id: str, new_type: str):
        """升级标签类型（topic → category）"""
        
    def downgrade_tag(self, tag_id: str, new_type: str):
        """降级标签类型（category → topic）"""
```

#### 组件 4: TagRetirementService（标签淘汰服务）

**职责**：识别和归档过时标签

**核心方法**：
```python
class TagRetirementService:
    def get_obsolete_tags(self) -> List[str]:
        """获取过时标签列表"""
        
    def archive_tag(self, tag_id: str):
        """归档标签（保留历史数据）"""
        
    def calculate_tag_health(self, tag_id: str) -> dict:
        """计算标签健康度指标"""
```

## 2. 数据模型

### 2.1 数据库表设计

#### tags 表（扩展）

```sql
CREATE TABLE tags (
    -- 原有字段
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    type TEXT NOT NULL,
    parent_id TEXT,
    icon TEXT,
    color TEXT,
    description TEXT,
    sort_order INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    
    -- 新增字段
    is_dynamic INTEGER DEFAULT 0,        -- 是否为动态标签（0=预设，1=AI生成）
    lifecycle TEXT DEFAULT 'active',     -- 生命周期：active/deprecated/archived
    usage_count INTEGER DEFAULT 0,       -- 累计使用次数
    last_used_at INTEGER,                -- 最后使用时间
    promoted_from TEXT,                  -- 从哪个候选标签晋升
    quality_score REAL DEFAULT 0.0,      -- 质量分数（0-1）
    
    FOREIGN KEY (parent_id) REFERENCES tags(id)
);

CREATE INDEX idx_tags_lifecycle ON tags(lifecycle);
CREATE INDEX idx_tags_usage ON tags(usage_count DESC);
CREATE INDEX idx_tags_dynamic ON tags(is_dynamic);
```

#### tag_candidates 表（新增）

```sql
CREATE TABLE tag_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id TEXT NOT NULL UNIQUE,         -- 候选标签 ID
    name TEXT NOT NULL,                  -- 标签名称（中文）
    name_en TEXT,                        -- 英文名称
    type TEXT NOT NULL,                  -- 类型：topic/attribute
    parent_id TEXT,                      -- 父标签 ID
    icon TEXT,                           -- 图标 emoji
    color TEXT,                          -- 颜色代码
    description TEXT,                    -- 描述
    
    -- 统计信息
    occurrence_count INTEGER DEFAULT 0,  -- 出现次数
    first_seen_at INTEGER,               -- 首次出现时间
    last_seen_at INTEGER,                -- 最后出现时间
    avg_confidence REAL DEFAULT 0.0,     -- 平均置信度
    total_confidence REAL DEFAULT 0.0,   -- 总置信度（用于计算平均值）
    
    -- 质量指标
    daily_occurrence TEXT,               -- 每日出现次数（JSON）
    related_entries TEXT,                -- 关联的新闻条目（JSON，最多保留 20 条）
    
    -- 状态
    status TEXT DEFAULT 'pending',       -- pending/approved/rejected/archived
    promoted_at INTEGER,                 -- 晋升时间
    rejected_reason TEXT,                -- 拒绝原因
    
    -- 元数据
    source TEXT DEFAULT 'ai',            -- 来源：ai/manual
    created_at INTEGER,
    updated_at INTEGER
);

CREATE INDEX idx_tag_candidates_status ON tag_candidates(status);
CREATE INDEX idx_tag_candidates_count ON tag_candidates(occurrence_count DESC);
CREATE INDEX idx_tag_candidates_confidence ON tag_candidates(avg_confidence DESC);
```

#### tag_evolution_log 表（新增）

```sql
CREATE TABLE tag_evolution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id TEXT NOT NULL,                -- 标签 ID
    action TEXT NOT NULL,                -- 动作类型
    old_value TEXT,                      -- 旧值（JSON）
    new_value TEXT,                      -- 新值（JSON）
    reason TEXT,                         -- 原因说明
    metadata TEXT,                       -- 额外元数据（JSON）
    created_at INTEGER,                  -- 创建时间
    created_by TEXT DEFAULT 'system'     -- 创建者：system/admin
);

CREATE INDEX idx_tag_evolution_tag ON tag_evolution_log(tag_id);
CREATE INDEX idx_tag_evolution_action ON tag_evolution_log(action);
CREATE INDEX idx_tag_evolution_time ON tag_evolution_log(created_at DESC);
```

**action 类型定义**：
- `discover`: 发现新候选标签
- `promote`: 候选标签晋升为正式标签
- `reject`: 拒绝候选标签
- `merge`: 合并标签
- `split`: 分裂标签
- `upgrade`: 升级标签类型
- `downgrade`: 降级标签类型
- `deprecate`: 标记为过时
- `archive`: 归档标签
- `restore`: 恢复标签

### 2.2 数据流

```
新闻标题
    │
    ▼
AI 分析
    │
    ├─→ 固定标签 ─→ rss_entry_tags
    │
    └─→ 新标签 ─→ tag_candidates
                      │
                      ▼
                  验证（频次、置信度、时间跨度）
                      │
                      ├─→ 合格 ─→ 晋升到 tags
                      │              │
                      │              └─→ 记录到 tag_evolution_log
                      │
                      └─→ 不合格 ─→ 继续观察或拒绝
```

## 3. AI Prompt 设计

### 3.1 双模式 Prompt

```python
PROMPT_TEMPLATE = """
任务：对新闻进行多维度分类打标签。

## 模式 1：固定标签分类（必须）

从以下预设标签中选择：

### Category（大类，必选1个）
{category_list}

### Topics（主题，可选最多3个）
{topic_list}

### Attributes（属性，可选最多2个）
{attribute_list}

## 模式 2：动态标签发现（可选）

如果发现新的重要话题或概念，可以提取新标签：

### 新标签要求
1. 命名规则：英文小写 + 下划线（如：deepseek, quantum_computing）
2. 必须提供：中文名称、类型（topic/attribute）、父类别、描述
3. 置信度：0.0-1.0，建议 >= 0.8
4. 适用场景：
   - 新兴技术/产品（如：Sora, Claude Opus）
   - 热点事件（如：CES 2026, OpenAI Spring Update）
   - 细分领域（如：量子计算、合成生物学）
   - 重要会议/活动（如：WWDC 2026）

### 新标签示例
```json
{
  "id": "deepseek",
  "name": "DeepSeek",
  "type": "topic",
  "parent_id": "tech",
  "description": "DeepSeek AI 公司及其大模型产品",
  "confidence": 0.95
}
```

## 输出格式（严格 JSON）

```json
[
  {
    "id": "...",
    "category": "tech",
    "topics": ["ai_ml", "llm"],
    "attributes": ["official"],
    "new_tags": [
      {
        "id": "deepseek",
        "name": "DeepSeek",
        "type": "topic",
        "parent_id": "tech",
        "description": "DeepSeek AI 公司及其产品",
        "confidence": 0.95
      }
    ],
    "action": "include",
    "score": 85,
    "confidence": 0.9,
    "reason": "AI新品发布"
  }
]
```

## 新闻列表

{news_list}
"""
```

### 3.2 标签规范化规则

```python
TAG_NORMALIZATION_RULES = {
    # 命名规则
    "naming": {
        "pattern": r"^[a-z][a-z0-9_]*$",  # 小写字母开头，可包含数字和下划线
        "max_length": 30,
        "min_length": 2,
    },
    
    # 同义词映射（自动合并）
    "synonyms": {
        "deep_seek": "deepseek",
        "deep-seek": "deepseek",
        "chatgpt": "gpt",
        "chat_gpt": "gpt",
    },
    
    # 禁用词（不允许作为标签）
    "blacklist": [
        "test", "demo", "example", "temp",
        "unknown", "misc", "other",
    ],
    
    # 类型限制
    "type_constraints": {
        "topic": {
            "must_have_parent": True,  # topic 必须有父类别
            "allowed_parents": ["tech", "finance", "business", "lifestyle", "entertainment"],
        },
        "attribute": {
            "must_have_parent": False,
            "max_count": 20,  # 最多 20 个属性标签
        },
    },
}
```

## 4. 标签生命周期管理

### 4.1 晋升条件

```python
PROMOTION_CRITERIA = {
    # 基础条件（必须全部满足）
    "basic": {
        "min_occurrence": 10,          # 至少出现 10 次
        "min_confidence": 0.7,         # 平均置信度 >= 0.7
        "min_time_span_days": 3,       # 至少持续 3 天
    },
    
    # 质量条件（满足其一即可）
    "quality": {
        "high_frequency": {
            "min_daily_occurrence": 5,  # 每天至少 5 次
            "min_days": 2,              # 持续 2 天
        },
        "high_confidence": {
            "min_confidence": 0.9,      # 置信度 >= 0.9
            "min_occurrence": 5,        # 至少 5 次
        },
        "manual_approval": {
            "approved_by_admin": True,  # 管理员手动批准
        },
    },
}
```

### 4.2 演化规则

```python
EVOLUTION_RULES = {
    # 合并规则
    "merge": {
        "similarity_threshold": 0.85,   # 相似度阈值
        "min_usage_diff": 3,            # 使用次数差异 >= 3 倍才合并
        "keep_higher_usage": True,      # 保留使用次数更多的标签
    },
    
    # 分裂规则
    "split": {
        "min_usage": 100,               # 使用次数 >= 100
        "max_subtags": 5,               # 最多分裂为 5 个子标签
        "min_subtag_usage": 10,         # 子标签至少使用 10 次
    },
    
    # 升级规则（topic → category）
    "upgrade": {
        "min_usage": 500,               # 使用次数 >= 500
        "min_subtopics": 3,             # 至少有 3 个子主题
        "admin_approval": True,         # 需要管理员批准
    },
    
    # 降级规则（category → topic）
    "downgrade": {
        "max_usage": 50,                # 使用次数 <= 50
        "max_recent_usage": 5,          # 最近 30 天使用 <= 5 次
        "admin_approval": True,         # 需要管理员批准
    },
}
```

### 4.3 淘汰规则

```python
RETIREMENT_RULES = {
    # 过时标签（自动归档）
    "obsolete": {
        "max_recent_usage": 5,          # 最近 30 天使用 <= 5 次
        "min_inactive_days": 30,        # 至少 30 天未使用
        "is_dynamic": True,             # 只淘汰动态标签
    },
    
    # 低质量标签（自动拒绝）
    "low_quality": {
        "max_occurrence": 3,            # 总共只出现 3 次
        "min_age_days": 7,              # 创建 7 天后仍未达标
        "max_confidence": 0.6,          # 平均置信度 <= 0.6
    },
    
    # 重复标签（自动合并）
    "duplicate": {
        "similarity_threshold": 0.95,   # 相似度 >= 0.95
        "auto_merge": True,             # 自动合并
    },
}
```

## 5. API 设计

### 5.1 候选标签管理 API

```python
# 获取候选标签列表
GET /api/admin/tags/candidates
Query Parameters:
  - status: pending/approved/rejected/archived
  - sort: occurrence_count/avg_confidence/created_at
  - limit: 20
  - offset: 0

# 获取单个候选标签详情
GET /api/admin/tags/candidates/{tag_id}

# 批准候选标签（晋升为正式标签）
POST /api/admin/tags/candidates/{tag_id}/approve
Body: {
  "icon": "🔥",
  "color": "#FF5733",
  "sort_order": 10
}

# 拒绝候选标签
POST /api/admin/tags/candidates/{tag_id}/reject
Body: {
  "reason": "重复标签"
}

# 手动创建候选标签
POST /api/admin/tags/candidates
Body: {
  "tag_id": "new_tag",
  "name": "新标签",
  "type": "topic",
  "parent_id": "tech",
  "description": "描述"
}
```

### 5.2 标签演化 API

```python
# 获取标签演化日志
GET /api/admin/tags/evolution/logs
Query Parameters:
  - tag_id: 标签 ID
  - action: discover/promote/merge/split/...
  - limit: 50
  - offset: 0

# 手动合并标签
POST /api/admin/tags/evolution/merge
Body: {
  "source_tag_id": "tag1",
  "target_tag_id": "tag2",
  "reason": "同义词"
}

# 手动分裂标签
POST /api/admin/tags/evolution/split
Body: {
  "tag_id": "ai_ml",
  "subtags": [
    {"id": "computer_vision", "name": "计算机视觉"},
    {"id": "nlp", "name": "自然语言处理"}
  ]
}

# 手动升级/降级标签
POST /api/admin/tags/evolution/change-type
Body: {
  "tag_id": "ai_ml",
  "new_type": "category",
  "reason": "使用频率高"
}
```

### 5.3 标签统计 API

```python
# 获取标签健康度报告
GET /api/admin/tags/health
Response: {
  "total_tags": 120,
  "active_tags": 95,
  "deprecated_tags": 15,
  "archived_tags": 10,
  "dynamic_tags": 58,
  "preset_tags": 62,
  "avg_quality_score": 0.78,
  "top_tags": [...],
  "bottom_tags": [...],
  "trending_tags": [...]
}

# 获取标签趋势
GET /api/admin/tags/trends
Query Parameters:
  - days: 7/30/90
  - limit: 20
Response: {
  "rising": [...],  # 上升趋势
  "falling": [...], # 下降趋势
  "stable": [...]   # 稳定
}
```

## 6. 定时任务设计

```python
# 在 hotnews/kernel/scheduler/tag_evolution_scheduler.py

import asyncio
from datetime import datetime, timedelta
from hotnews.core.logger import get_logger

logger = get_logger(__name__)

class TagEvolutionScheduler:
    """标签演化定时任务调度器"""
    
    def __init__(self):
        self.discovery_service = TagDiscoveryService()
        self.validation_service = TagValidationService()
        self.evolution_service = TagEvolutionService()
        self.retirement_service = TagRetirementService()
    
    async def run(self):
        """主循环"""
        while True:
            try:
                await self.hourly_tasks()
                
                if self.is_daily_time():
                    await self.daily_tasks()
                
                if self.is_weekly_time():
                    await self.weekly_tasks()
                
                # 每小时执行一次
                await asyncio.sleep(3600)
                
            except Exception as e:
                logger.error(f"标签演化任务失败: {e}", exc_info=True)
                await asyncio.sleep(300)  # 失败后等待 5 分钟
    
    async def hourly_tasks(self):
        """每小时任务"""
        logger.info("开始执行标签演化每小时任务")
        
        # 1. 晋升合格的候选标签
        promoted = await self.validation_service.promote_qualified_candidates()
        if promoted:
            logger.info(f"晋升 {len(promoted)} 个候选标签: {promoted}")
        
        # 2. 更新标签使用统计
        await self.update_tag_usage_stats()
    
    async def daily_tasks(self):
        """每日任务（凌晨 3 点）"""
        logger.info("开始执行标签演化每日任务")
        
        # 1. 标签演化（合并、分裂）
        await self.evolution_service.merge_similar_tags()
        await self.evolution_service.split_hot_tags()
        
        # 2. 清理低质量候选标签
        rejected = await self.validation_service.reject_low_quality_candidates()
        if rejected:
            logger.info(f"拒绝 {len(rejected)} 个低质量候选标签")
    
    async def weekly_tasks(self):
        """每周任务（周一凌晨 3 点）"""
        logger.info("开始执行标签演化每周任务")
        
        # 1. 淘汰过时标签
        archived = await self.retirement_service.archive_obsolete_tags()
        if archived:
            logger.info(f"归档 {len(archived)} 个过时标签")
        
        # 2. 生成标签健康度报告
        await self.generate_health_report()
    
    def is_daily_time(self) -> bool:
        """是否到了每日任务时间（凌晨 3 点）"""
        return datetime.now().hour == 3
    
    def is_weekly_time(self) -> bool:
        """是否到了每周任务时间（周一凌晨 3 点）"""
        return datetime.now().weekday() == 0 and datetime.now().hour == 3
```

---

**文档版本**: v1.0  
**创建时间**: 2026-01-19  
**最后更新**: 2026-01-19
