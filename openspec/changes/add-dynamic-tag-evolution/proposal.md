# 提案：AI 动态标签演化系统

## 📋 提案概述

**提案名称**: AI 动态标签演化系统  
**提案类型**: 功能增强  
**优先级**: 中  
**预计工作量**: 3-5 天  
**创建时间**: 2026-01-19

## 🎯 问题陈述

### 当前状态

目前 AI 标签系统使用**固定标签集**进行分类：
- 12 个预设大类（Category）
- 40+ 个预设主题（Topic）
- 10 个预设属性（Attribute）

AI 模型只能从这些预设标签中选择，无法创建新标签。

### 存在的问题

1. **标签滞后性**
   - 新兴话题无法及时反映（如突然爆火的新技术、新事件）
   - 需要人工更新标签定义才能跟上热点变化
   - 例如：DeepSeek 突然爆火，但没有对应的标签

2. **标签覆盖不足**
   - 预设标签无法覆盖所有细分领域
   - 长尾话题被归类到"其他"，失去分类价值
   - 例如：量子计算、合成生物学等新兴领域

3. **标签粒度固定**
   - 无法根据内容热度动态调整标签粒度
   - 热门话题需要更细的分类，冷门话题可以粗粒度
   - 例如：AI 话题很热，但只有 `ai_ml` 和 `llm` 两个标签

4. **缺乏时效性**
   - 无法识别短期热点事件（如某个会议、某个产品发布）
   - 事件过后标签仍然存在，造成标签污染

## 💡 解决方案

### 核心思路

实现 **AI 驱动的动态标签演化系统**，让标签能够：
1. **自动发现**：AI 从新闻内容中自动提取新标签
2. **自动验证**：通过频次和质量阈值验证标签价值
3. **自动演化**：标签可以合并、分裂、升级、降级
4. **自动淘汰**：过时或低价值标签自动归档

### 系统架构

```
┌─────────────────────────────────────────────────────────────┐
│                    AI 标签演化系统                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. 标签发现层 (Tag Discovery)                               │
│     ├─ AI 提取候选标签                                        │
│     ├─ 标签规范化（去重、合并同义词）                         │
│     └─ 存入候选池                                             │
│                                                               │
│  2. 标签验证层 (Tag Validation)                              │
│     ├─ 频次统计（出现次数、时间分布）                         │
│     ├─ 质量评估（置信度、相关性）                             │
│     └─ 晋升为正式标签                                         │
│                                                               │
│  3. 标签演化层 (Tag Evolution)                               │
│     ├─ 标签合并（同义词、相似标签）                           │
│     ├─ 标签分裂（热门标签细分）                               │
│     ├─ 标签升级（Topic → Category）                          │
│     └─ 标签降级（Category → Topic）                          │
│                                                               │
│  4. 标签淘汰层 (Tag Retirement)                              │
│     ├─ 识别过时标签（使用频次下降）                           │
│     ├─ 识别低价值标签（覆盖率低、区分度低）                   │
│     └─ 归档或删除                                             │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

## 🔧 技术实现

### 1. 数据库设计

#### 新增表：tag_candidates（候选标签）

```sql
CREATE TABLE tag_candidates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id TEXT NOT NULL,              -- 候选标签 ID
    name TEXT NOT NULL,                -- 标签名称
    name_en TEXT,                      -- 英文名称
    type TEXT NOT NULL,                -- 类型：category/topic/attribute
    parent_id TEXT,                    -- 父标签
    icon TEXT,                         -- 图标
    color TEXT,                        -- 颜色
    description TEXT,                  -- 描述
    
    -- 统计信息
    occurrence_count INTEGER DEFAULT 0, -- 出现次数
    first_seen_at INTEGER,             -- 首次出现时间
    last_seen_at INTEGER,              -- 最后出现时间
    avg_confidence REAL,               -- 平均置信度
    
    -- 状态
    status TEXT DEFAULT 'pending',     -- pending/approved/rejected/archived
    promoted_at INTEGER,               -- 晋升为正式标签的时间
    
    -- 元数据
    source TEXT DEFAULT 'ai',          -- 来源：ai/manual
    created_at INTEGER,
    updated_at INTEGER,
    
    UNIQUE(tag_id)
);

CREATE INDEX idx_tag_candidates_status ON tag_candidates(status);
CREATE INDEX idx_tag_candidates_count ON tag_candidates(occurrence_count DESC);
```

#### 扩展表：tags（正式标签）

```sql
-- 添加新字段
ALTER TABLE tags ADD COLUMN is_dynamic INTEGER DEFAULT 0;  -- 是否为动态标签
ALTER TABLE tags ADD COLUMN lifecycle TEXT DEFAULT 'active'; -- active/deprecated/archived
ALTER TABLE tags ADD COLUMN usage_count INTEGER DEFAULT 0;   -- 使用次数
ALTER TABLE tags ADD COLUMN last_used_at INTEGER;           -- 最后使用时间
ALTER TABLE tags ADD COLUMN promoted_from TEXT;             -- 从哪个候选标签晋升
```

#### 新增表：tag_evolution_log（标签演化日志）

```sql
CREATE TABLE tag_evolution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag_id TEXT NOT NULL,              -- 标签 ID
    action TEXT NOT NULL,              -- 动作：create/merge/split/upgrade/downgrade/archive
    old_value TEXT,                    -- 旧值（JSON）
    new_value TEXT,                    -- 新值（JSON）
    reason TEXT,                       -- 原因
    created_at INTEGER
);

CREATE INDEX idx_tag_evolution_tag ON tag_evolution_log(tag_id);
CREATE INDEX idx_tag_evolution_action ON tag_evolution_log(action);
```

### 2. AI Prompt 设计

#### 双模式标签提取

**模式 1：固定标签分类（现有模式）**
```
从预设标签中选择：
- category: tech, finance, business, ...
- topics: ai_ml, llm, dev_tools, ...
- attributes: free_deal, tutorial, deep_dive, ...
```

**模式 2：动态标签发现（新增模式）**
```
除了预设标签，还可以提取新标签：
- 识别新兴话题（如：deepseek, sora, claude_opus）
- 识别热点事件（如：ces_2026, openai_spring_update）
- 识别细分领域（如：quantum_computing, synthetic_biology）

新标签要求：
1. 使用英文小写 + 下划线命名
2. 提供中文名称和简短描述
3. 指定类型（topic/attribute）和父类别
4. 给出置信度（0.0-1.0）

输出格式：
{
  "preset_tags": ["tech", "ai_ml", "official"],
  "new_tags": [
    {
      "id": "deepseek",
      "name": "DeepSeek",
      "type": "topic",
      "parent_id": "tech",
      "description": "DeepSeek AI 公司及其产品",
      "confidence": 0.95
    }
  ]
}
```

### 3. 标签生命周期管理

#### 阶段 1：候选标签（Candidate）

```python
def discover_new_tags(ai_response):
    """从 AI 响应中提取新标签"""
    for new_tag in ai_response.get("new_tags", []):
        # 检查是否已存在
        if tag_exists(new_tag["id"]):
            update_tag_stats(new_tag["id"])
            continue
        
        # 添加到候选池
        insert_tag_candidate(
            tag_id=new_tag["id"],
            name=new_tag["name"],
            type=new_tag["type"],
            parent_id=new_tag.get("parent_id"),
            description=new_tag.get("description"),
            occurrence_count=1,
            avg_confidence=new_tag["confidence"]
        )
```

#### 阶段 2：验证与晋升（Validation & Promotion）

```python
def promote_qualified_candidates():
    """晋升合格的候选标签为正式标签"""
    
    # 晋升条件
    PROMOTION_CRITERIA = {
        "min_occurrence": 10,        # 至少出现 10 次
        "min_confidence": 0.7,       # 平均置信度 >= 0.7
        "time_span_days": 3,         # 至少持续 3 天
        "min_daily_occurrence": 2    # 每天至少 2 次
    }
    
    candidates = get_qualified_candidates(PROMOTION_CRITERIA)
    
    for candidate in candidates:
        # 晋升为正式标签
        promote_to_official_tag(candidate)
        
        # 记录演化日志
        log_tag_evolution(
            tag_id=candidate["tag_id"],
            action="promote",
            reason=f"达到晋升条件：{candidate['occurrence_count']}次出现"
        )
```

#### 阶段 3：演化（Evolution）

```python
def evolve_tags():
    """标签演化：合并、分裂、升级、降级"""
    
    # 1. 合并同义词标签
    merge_similar_tags(similarity_threshold=0.85)
    
    # 2. 分裂热门标签
    split_hot_tags(min_usage=100, max_subtags=5)
    
    # 3. 升级高频 Topic 为 Category
    upgrade_topics_to_categories(min_usage=500)
    
    # 4. 降级低频 Category 为 Topic
    downgrade_categories_to_topics(max_usage=50)
```

#### 阶段 4：淘汰（Retirement）

```python
def retire_obsolete_tags():
    """淘汰过时标签"""
    
    # 淘汰条件
    RETIREMENT_CRITERIA = {
        "max_recent_usage": 5,       # 最近 30 天使用少于 5 次
        "min_inactive_days": 30,     # 至少 30 天未使用
        "is_dynamic": True           # 只淘汰动态标签
    }
    
    obsolete_tags = get_obsolete_tags(RETIREMENT_CRITERIA)
    
    for tag in obsolete_tags:
        # 归档标签（不删除，保留历史数据）
        archive_tag(tag["id"])
        
        # 记录演化日志
        log_tag_evolution(
            tag_id=tag["id"],
            action="archive",
            reason=f"过时标签：最后使用于 {tag['last_used_at']}"
        )
```

### 4. 定时任务

```python
# 在 rss_scheduler.py 中添加

async def tag_evolution_loop():
    """标签演化定时任务"""
    while True:
        try:
            # 每小时执行一次
            await asyncio.sleep(3600)
            
            # 1. 晋升合格的候选标签
            promoted = promote_qualified_candidates()
            logger.info(f"晋升 {promoted} 个候选标签")
            
            # 2. 标签演化（每天执行一次）
            if datetime.now().hour == 3:  # 凌晨 3 点
                evolve_tags()
                logger.info("标签演化完成")
            
            # 3. 淘汰过时标签（每周执行一次）
            if datetime.now().weekday() == 0 and datetime.now().hour == 3:
                retired = retire_obsolete_tags()
                logger.info(f"归档 {retired} 个过时标签")
                
        except Exception as e:
            logger.error(f"标签演化任务失败: {e}")
```

## 📊 预期效果

### 1. 标签覆盖率提升

- **现状**：62 个固定标签，覆盖率约 70%
- **预期**：动态标签 + 固定标签，覆盖率提升至 90%+

### 2. 标签时效性提升

- **现状**：新话题需要人工添加标签，延迟 1-7 天
- **预期**：AI 自动发现新话题，延迟 < 1 天

### 3. 标签质量提升

- **现状**：部分标签使用率低，造成标签污染
- **预期**：自动淘汰低价值标签，保持标签库清洁

### 4. 用户体验提升

- **现状**：标签粗粒度，难以精准筛选
- **预期**：标签细粒度，支持精准筛选和个性化推荐

## 🎯 实施计划

### Phase 1: 基础设施（1-2 天）

- [ ] 创建数据库表（tag_candidates, tag_evolution_log）
- [ ] 扩展 tags 表字段
- [ ] 实现候选标签 CRUD API

### Phase 2: AI 集成（1-2 天）

- [ ] 更新 AI Prompt，支持动态标签提取
- [ ] 实现标签发现逻辑
- [ ] 实现标签规范化（去重、同义词合并）

### Phase 3: 生命周期管理（1-2 天）

- [ ] 实现标签验证与晋升逻辑
- [ ] 实现标签演化逻辑（合并、分裂、升级、降级）
- [ ] 实现标签淘汰逻辑

### Phase 4: 监控与优化（1 天）

- [ ] 添加标签演化日志
- [ ] 实现 Admin 界面查看候选标签
- [ ] 实现标签统计和可视化

## 🔍 风险与挑战

### 风险 1：标签爆炸

**问题**：AI 可能提取过多低质量标签，造成标签污染

**缓解措施**：
- 设置严格的晋升条件（频次、置信度、时间跨度）
- 定期淘汰低价值标签
- 人工审核机制（Admin 可以手动拒绝候选标签）

### 风险 2：标签不一致

**问题**：同一概念可能有多个标签（如 deepseek, deep_seek, deep-seek）

**缓解措施**：
- 标签规范化（统一命名规则）
- 同义词检测与合并
- AI 提取时提供标准化建议

### 风险 3：性能影响

**问题**：标签演化任务可能影响系统性能

**缓解措施**：
- 异步执行，避免阻塞主流程
- 分批处理，避免一次性处理大量数据
- 设置执行频率限制（每小时/每天）

## 📈 成功指标

1. **标签覆盖率**：从 70% 提升至 90%+
2. **标签时效性**：新话题标签延迟 < 1 天
3. **标签质量**：活跃标签占比 > 80%
4. **用户满意度**：标签筛选准确率 > 85%

## 🔄 后续优化

1. **标签关系图谱**：构建标签之间的关系网络
2. **标签推荐**：基于用户行为推荐相关标签
3. **标签趋势分析**：识别标签热度变化趋势
4. **多语言支持**：支持中英文标签互译

---

**提案状态**: 待审批  
**提案作者**: AI Assistant  
**创建时间**: 2026-01-19  
**最后更新**: 2026-01-19
