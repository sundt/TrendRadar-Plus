# 基于总结内容的标签反哺机制

## 背景

当前标签生成流程：
1. RSS 抓取新闻 → 仅用**标题**调用 AI 生成标签
2. 标签存入 `rss_entry_tags` 表
3. 用户在"我的关注"中按标签筛选新闻

问题：仅用标题生成的标签准确度有限，容易出现误判。

## 设计原则

**用户完全无感** - 整个标签优化过程在后台静默完成：
- 用户正常使用总结功能，不知道标签在被更新
- 唯一的感知是"我的关注"内容越来越精准
- 无需任何额外操作或确认

## 方案概述

当用户请求 AI 总结时，利用**全文内容**生成更准确的标签，静默反哺到标签系统。

```
用户请求总结 → 抓取全文 → AI 生成总结 + 标签 → 存储总结 → 静默更新标签
                                    ↓                    (用户无感)
                            rss_entry_tags 表
```

## 实现方案

### 1. 修改总结 Prompt，同时输出标签

在 `prompts.py` 中修改总结模板，要求 AI 同时返回标签：

```python
SUMMARY_WITH_TAGS_TEMPLATE = """
请分析以下文章内容，完成两个任务：

## 任务1：生成总结
{原有总结模板}

## 任务2：生成标签
请从以下预定义标签中选择 1-3 个最相关的标签：
{tag_list}

如果文章内容不属于任何预定义标签，可以建议 1-2 个新标签（英文小写，下划线分隔）。

---
请以 JSON 格式返回：
{
  "summary": "总结内容...",
  "tags": ["tag1", "tag2"],
  "suggested_new_tags": ["new_tag1"]  // 可选
}
"""
```

### 2. 数据库变更

在 `article_summaries` 表添加标签字段：

```sql
ALTER TABLE article_summaries ADD COLUMN tags TEXT DEFAULT '';
-- 存储 JSON 数组，如 '["ai_ml", "tech"]'
```

### 3. 标签更新逻辑（覆盖更新）

总结生成的标签直接覆盖原有 AI 标签，保留未覆盖的标签：

```python
async def update_entry_tags_from_summary(
    online_conn, 
    url: str, 
    tags: List[str],
    confidence: float = 0.95
):
    """
    用总结生成的标签更新 rss_entry_tags（静默执行，失败不影响主流程）
    
    覆盖策略：
    - 已存在的标签：更新 source='summary', confidence 提高
    - 新标签：直接插入
    - 原有但总结未生成的标签：保留不动
    """
    import time
    
    # 从 url 反查 source_id 和 dedup_key
    cur = online_conn.execute(
        "SELECT source_id, dedup_key FROM rss_entries WHERE url = ? LIMIT 1",
        (url,)
    )
    row = cur.fetchone()
    if not row:
        return  # 无法关联到 entry，静默退出
    
    source_id, dedup_key = row
    now = int(time.time())
    
    # 覆盖更新标签
    for tag_id in tags:
        online_conn.execute(
            """
            INSERT INTO rss_entry_tags(source_id, dedup_key, tag_id, confidence, source, created_at)
            VALUES (?, ?, ?, ?, 'summary', ?)
            ON CONFLICT(source_id, dedup_key, tag_id) DO UPDATE SET
                confidence = MAX(excluded.confidence, confidence),
                source = 'summary',
                created_at = excluded.created_at
            """,
            (source_id, dedup_key, tag_id, confidence, now)
        )
    
    online_conn.commit()
```

**覆盖逻辑说明：**
- `ON CONFLICT ... DO UPDATE`：如果标签已存在则更新
- `source = 'summary'`：标记为总结来源（优先级最高）
- `confidence = MAX(...)`：取更高的置信度
- 原有标签如果总结没生成，保留不动（不删除）

### 4. source 字段值说明

| source | 说明 | 置信度 | 优先级 |
|--------|------|--------|--------|
| `summary` | 基于全文总结生成 | 0.95 | 最高 |
| `ai` | 基于标题 AI 生成 | 0.5-0.9 | 中 |
| `manual` | 人工标注 | 1.0 | 保留 |

查询时无需特殊处理，`summary` 来源的标签自然更准确。

### 5. 新标签发现

当 AI 建议新标签时，存入 `tag_candidates` 表待审核：

```python
if suggested_new_tags:
    for tag in suggested_new_tags:
        online_conn.execute(
            """
            INSERT OR IGNORE INTO tag_candidates(
                tag_id, name, source, confidence, created_at
            ) VALUES (?, ?, 'summary', 0.8, ?)
            """,
            (tag, tag.replace('_', ' ').title(), int(time.time()))
        )
```

## 优势

1. **用户无感**：后台静默完成，零学习成本
2. **更准确**：全文内容比标题信息量大得多
3. **渐进优化**：用得越多，标签越准
4. **零额外成本**：复用总结请求，不额外调用 AI
5. **可追溯**：通过 `source` 字段区分标签来源

## 实现步骤

### Phase 1: 核心功能
1. [ ] 修改 `prompts.py`，在总结模板末尾添加标签输出要求（JSON 格式）
2. [ ] 修改 `article_summary.py`，解析响应中的标签（容错处理）
3. [ ] 实现 `update_entry_tags_from_summary()` 函数
4. [ ] 在 `summary_api.py` 中静默调用标签更新（try-except 包裹，不影响响应）

### Phase 2: 数据记录
5. [ ] 添加 `article_summaries.tags` 字段（JSON 格式，记录生成的标签）
6. [ ] 记录标签更新日志（可选，用于分析）

### Phase 3: 新标签发现
7. [ ] 调用现有 `TagDiscoveryService` 处理 suggested_new_tags
8. [ ] 复用现有审核流程

## 注意事项

- **静默失败**：标签更新出错不影响总结返回
- **容错解析**：AI 返回格式可能不标准，需要多种解析策略
- **标签白名单**：只接受预定义标签，新标签走发现流程
- **异步可选**：可以用 `asyncio.create_task()` 异步更新，不阻塞响应

## 可选增强

1. **批量回填**：对已有总结的文章批量生成标签
2. **标签权重**：根据 confidence 和 source 计算综合权重
3. **数据统计**：后台统计标签准确度提升情况
