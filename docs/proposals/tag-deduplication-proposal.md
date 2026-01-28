# 标签去重与合并方案

## 问题描述

当前 AI 发现的标签存在重复/相似问题：
- "腾讯元宝" vs "元宝" - 同一产品的不同称呼
- "DeepSeek" vs "深度求索" - 中英文名称
- "Kimi K2.5" vs "Kimi" - 版本号差异

这导致：
1. 用户看到重复内容
2. 标签数据分散，统计不准确
3. 关注体验差（需要关注多个相似标签）

## 解决方案

### 方案一：标签别名系统（推荐）

在数据库层面建立标签别名关系，将相似标签指向同一个主标签。

#### 数据库设计

```sql
-- 标签别名表
CREATE TABLE tag_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alias_id TEXT NOT NULL,           -- 别名标签 ID (如 "元宝")
    canonical_id TEXT NOT NULL,       -- 主标签 ID (如 "腾讯元宝")
    alias_type TEXT DEFAULT 'synonym', -- synonym/abbreviation/translation/version
    confidence REAL DEFAULT 1.0,      -- 置信度
    source TEXT DEFAULT 'manual',     -- manual/ai/merge
    created_at INTEGER,
    UNIQUE(alias_id)
);

-- 在 tags 表添加字段
ALTER TABLE tags ADD COLUMN merged_into TEXT;  -- 被合并到哪个标签
ALTER TABLE tags ADD COLUMN alias_count INTEGER DEFAULT 0;  -- 别名数量
```

#### 工作流程

1. **发现阶段**：AI 提取标签时，检查是否已有相似标签
2. **合并阶段**：管理员或 AI 定期合并相似标签
3. **查询阶段**：查询时自动展开别名

#### API 设计

```python
# 查询标签时自动包含别名
def get_tag_with_aliases(tag_id: str) -> List[str]:
    """返回标签及其所有别名 ID"""
    aliases = db.execute(
        "SELECT alias_id FROM tag_aliases WHERE canonical_id = ?",
        (tag_id,)
    ).fetchall()
    return [tag_id] + [a[0] for a in aliases]

# 合并标签
def merge_tags(source_id: str, target_id: str):
    """将 source 标签合并到 target"""
    # 1. 创建别名关系
    # 2. 迁移 rss_entry_tags 关联
    # 3. 合并统计数据
    # 4. 标记 source 为已合并
```

### 方案二：AI 辅助去重

在标签发现时，让 AI 判断是否与现有标签重复。

#### Prompt 设计

```
已有标签列表：
- 腾讯元宝 (tencent_yuanbao)
- DeepSeek (deepseek)
- Kimi (kimi)

新发现标签：元宝

请判断：
1. 是否与已有标签重复？是 -> 返回已有标签 ID
2. 是否是已有标签的别名？是 -> 返回 {alias_of: "tencent_yuanbao"}
3. 是全新标签？是 -> 返回新标签信息
```

#### 优点
- 自动化程度高
- 能处理语义相似（如 "AI 大模型" vs "人工智能模型"）

#### 缺点
- 增加 AI 调用成本
- 可能误判

### 方案三：规则 + 人工审核

#### 自动规则

```python
MERGE_RULES = [
    # 包含关系：短名是长名的子串
    {"type": "contains", "example": "元宝 -> 腾讯元宝"},
    
    # 版本号：去掉版本号后相同
    {"type": "version", "pattern": r"(.+)\s*[vV]?\d+(\.\d+)*", "example": "Kimi K2.5 -> Kimi"},
    
    # 中英文对照表
    {"type": "translation", "mappings": {
        "deepseek": "深度求索",
        "openai": "OpenAI",
    }},
]
```

#### 人工审核队列

在管理后台添加"待合并标签"队列，展示可能重复的标签对，管理员一键确认合并。

## 推荐实施路径

### Phase 1: 短期（1-2天）
- 在 discovery-news API 中添加简单的去重逻辑
- 基于名称包含关系过滤（如 "元宝" 被 "腾讯元宝" 包含则跳过）

### Phase 2: 中期（1周）
- 实现 tag_aliases 表
- 添加管理后台的标签合并功能
- 查询时自动展开别名

### Phase 3: 长期（2-4周）
- AI 辅助去重（在标签发现时）
- 自动合并建议
- 用户反馈机制（"这两个标签是同一个"）

## Phase 1 快速实现

在当前 discovery-news API 中添加去重逻辑：

```python
def _should_skip_similar_tag(new_tag: dict, existing_tags: list) -> bool:
    """检查新标签是否与已有标签相似"""
    new_name = new_tag.get("name", "")
    new_id = new_tag.get("id", "")
    
    for existing in existing_tags:
        existing_name = existing.get("name", "")
        existing_id = existing.get("id", "")
        
        # 规则1: 名称包含关系
        if new_name in existing_name or existing_name in new_name:
            # 保留更长的名称
            if len(existing_name) >= len(new_name):
                return True
        
        # 规则2: ID 包含关系
        if new_id in existing_id or existing_id in new_id:
            if len(existing_id) >= len(new_id):
                return True
        
        # 规则3: 去掉版本号后相同
        import re
        new_base = re.sub(r'\s*[vV]?\d+(\.\d+)*$', '', new_name)
        existing_base = re.sub(r'\s*[vV]?\d+(\.\d+)*$', '', existing_name)
        if new_base == existing_base:
            return True
    
    return False
```

## 总结

| 方案 | 复杂度 | 准确度 | 自动化 | 推荐场景 |
|------|--------|--------|--------|----------|
| 别名系统 | 中 | 高 | 中 | 长期方案 |
| AI 辅助 | 高 | 高 | 高 | 有 AI 预算时 |
| 规则+人工 | 低 | 中 | 低 | 快速上线 |

建议先实现 Phase 1 的简单去重，然后逐步迭代到完整的别名系统。
