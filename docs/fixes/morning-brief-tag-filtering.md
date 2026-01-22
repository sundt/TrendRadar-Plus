# 每日AI早报改用标签系统筛选

## 问题描述

用户反馈："每日AI早报"中看到很多非 AI 内容，例如娱乐新闻、体育新闻等。

## 原因分析

### 旧的分类系统

之前"每日AI早报"使用 `category_whitelist` 来筛选内容：

```python
category_whitelist = ["explore", "tech_news", "ainews", "developer", "ai"]
```

**问题**：
1. `"explore"` 分类包含大量非 AI 内容（4294条）
2. `"ainews"` 分类在数据库中不存在
3. 分类粒度太粗，无法精确筛选 AI 内容

### 数据统计

```sql
-- AI 标记的内容按分类统计
SELECT s.category, COUNT(*) as count 
FROM rss_entry_ai_labels l 
JOIN rss_sources s ON l.source_id = s.id 
WHERE l.action = 'include' AND l.score >= 75 AND l.confidence >= 0.70 
GROUP BY s.category 
ORDER BY count DESC;

explore     | 4294  ← 包含大量非AI内容
tech_news   | 2062
developer   | 1432
general     | 382
finance     | 311
social      | 217
ai          | 207
```

## 解决方案

### 新的标签系统

改用 `tag_whitelist` 来筛选内容，使用新的标签系统：

```python
tag_whitelist_enabled = True
tag_whitelist = ["ai_ml"]  # AI/机器学习 标签
```

### 标签数据

```sql
-- AI 相关标签统计
SELECT t.name, COUNT(DISTINCT et.dedup_key) as news_count 
FROM tags t 
JOIN rss_entry_tags et ON t.id = et.tag_id 
WHERE t.lifecycle = 'active' AND t.id = 'ai_ml'
GROUP BY t.id;

AI/机器学习 | 349  ← 精确的AI内容
```

### 实现细节

#### 1. 添加标签白名单配置

在 `_mb_default_rules()` 中添加：

```python
{
    # ... 其他配置
    "tag_whitelist_enabled": True,
    "tag_whitelist": ["ai_ml"],  # AI/机器学习 tag
}
```

#### 2. 修改数据库查询

添加 `rss_entry_tags` 表的 JOIN：

```sql
SELECT DISTINCT e.source_id, e.dedup_key, e.title, e.url, 
       e.created_at, e.published_at, 
       COALESCE(s.name, ''), COALESCE(s.category, ''),
       GROUP_CONCAT(DISTINCT t.tag_id) as tag_ids  -- 新增
FROM rss_entries e
JOIN rss_entry_ai_labels l ON l.source_id = e.source_id AND l.dedup_key = e.dedup_key
LEFT JOIN rss_sources s ON s.id = e.source_id
LEFT JOIN rss_entry_tags t ON t.source_id = e.source_id AND t.dedup_key = e.dedup_key  -- 新增
WHERE e.published_at > 0
  AND l.action = 'include'
  AND l.score >= 75
  AND l.confidence >= 0.70
GROUP BY e.source_id, e.dedup_key
ORDER BY e.published_at DESC
```

#### 3. 添加标签过滤逻辑

```python
# Parse tag_ids from GROUP_CONCAT result
tag_ids = set()
if tag_ids_str:
    tag_ids = set(t.strip().lower() for t in tag_ids_str.split(',') if t.strip())

# Tag whitelist filtering (new system - takes priority)
if tag_whitelist_enabled and tag_whitelist:
    # Check if any of the news tags match the whitelist
    if not tag_ids or not tag_ids.intersection(tag_whitelist):
        continue  # Skip this news item
# Category whitelist filtering (fallback for untagged content)
elif category_whitelist_enabled and category_whitelist:
    if scategory not in category_whitelist:
        continue
```

**优先级**：
1. **标签白名单**（优先）：如果启用，只显示包含白名单标签的新闻
2. **分类白名单**（后备）：如果标签白名单未启用或新闻没有标签，使用分类白名单

#### 4. 更新缓存配置

```python
cache_config = {
    "drop_zero": drop_zero,
    "ai_mode": ai_mode,
    "rules_hash": hash(str(sorted(rules.items()))),
    "category_whitelist": tuple(sorted(category_whitelist)),
    "tag_whitelist": tuple(sorted(tag_whitelist)),  # 新增
}
```

#### 5. 更新 API 响应

```json
{
    "offset": 0,
    "limit": 5,
    "ai_enabled": true,
    "category_whitelist_enabled": true,
    "category_whitelist": ["explore", "tech_news", "ai", "developer"],
    "tag_whitelist_enabled": true,
    "tag_whitelist": ["ai_ml"],
    "items": [...],
    "total_candidates": 341
}
```

## 效果对比

### 修改前

- **候选内容**：~9635 条（所有 AI 标记的内容）
- **问题**：包含大量非 AI 内容（来自 explore 分类）
- **示例**：娱乐新闻、体育新闻、金融新闻等

### 修改后

- **候选内容**：341 条（只包含 ai_ml 标签的内容）
- **效果**：内容精确，都是 AI 相关
- **示例**：
  1. OpenAI高管：首款硬件设备有望于2026年下半年亮相
  2. 小鹏NGP辅助驾驶救其一命
  3. 英矽智能：与衡泰生物达成超过5亿港元的全球战略合作
  4. 工人日报：谁来管管AI魔改
  5. OpenAI首席财务官：2025年年化营收突破200亿美元
  6. 调查：五分之四的员工认为AI将影响工作岗位
  7. 雷军：Turbo 5 Max的实力 强得有点离谱
  8. 人形机器人可完成多语言逼真唇形动作

## 配置管理

### 查看当前配置

```bash
ssh -p 52222 root@120.77.222.205 "sqlite3 ~/hotnews/output/online.db \"SELECT value FROM admin_kv WHERE key = 'morning_brief_rules_v1'\""
```

### 自定义标签白名单

如果需要添加更多 AI 相关标签，可以在数据库中更新配置：

```sql
-- 查看所有 AI 相关标签
SELECT t.id, t.name, t.type, COUNT(DISTINCT et.dedup_key) as news_count 
FROM tags t 
JOIN rss_entry_tags et ON t.id = et.tag_id 
WHERE t.lifecycle = 'active' 
  AND (t.name LIKE '%AI%' OR t.name LIKE '%人工智能%' OR t.name LIKE '%机器学习%')
GROUP BY t.id 
ORDER BY news_count DESC;

-- 更新配置（示例）
INSERT OR REPLACE INTO admin_kv (key, value, updated_at) 
VALUES (
    'morning_brief_rules_v1',
    '{"tag_whitelist_enabled": true, "tag_whitelist": ["ai_ml", "deep_learning", "llm"]}',
    strftime('%s', 'now')
);
```

### 禁用标签过滤

如果需要恢复到分类过滤：

```sql
INSERT OR REPLACE INTO admin_kv (key, value, updated_at) 
VALUES (
    'morning_brief_rules_v1',
    '{"tag_whitelist_enabled": false, "category_whitelist_enabled": true, "category_whitelist": ["ai", "tech_news"]}',
    strftime('%s', 'now')
);
```

## 测试验证

### 1. 检查 API 响应

```bash
curl -s 'http://120.77.222.205:8090/api/rss/brief/timeline?limit=10' | python3 -m json.tool | head -50
```

应该看到：
```json
{
    "tag_whitelist_enabled": true,
    "tag_whitelist": ["ai_ml"],
    "total_candidates": 341
}
```

### 2. 验证内容质量

查看前 10 条新闻的标题，确认都是 AI 相关：

```bash
curl -s 'http://120.77.222.205:8090/api/rss/brief/timeline?limit=10' | python3 -m json.tool | grep '"title"'
```

### 3. 检查标签覆盖率

```sql
-- 查看有多少 AI 标记的内容有 ai_ml 标签
SELECT 
    COUNT(DISTINCT CASE WHEN et.tag_id = 'ai_ml' THEN l.dedup_key END) as with_tag,
    COUNT(DISTINCT l.dedup_key) as total,
    ROUND(100.0 * COUNT(DISTINCT CASE WHEN et.tag_id = 'ai_ml' THEN l.dedup_key END) / COUNT(DISTINCT l.dedup_key), 2) as coverage_pct
FROM rss_entry_ai_labels l
LEFT JOIN rss_entry_tags et ON l.source_id = et.source_id AND l.dedup_key = et.dedup_key
WHERE l.action = 'include' AND l.score >= 75 AND l.confidence >= 0.70;
```

## 后续优化

### 1. 添加更多 AI 标签

可以添加更细分的 AI 标签：
- `llm` - 大语言模型
- `computer_vision` - 计算机视觉
- `nlp` - 自然语言处理
- `robotics` - 机器人
- `autonomous_driving` - 自动驾驶

### 2. 标签权重

可以为不同标签设置权重，优先显示某些类型的 AI 新闻。

### 3. 动态标签发现

利用 AI 自动发现新的 AI 相关标签，并添加到白名单。

### 4. 用户自定义

允许用户自定义"每日AI早报"的标签白名单，个性化内容。

## 相关文件

- `hotnews/web/server.py` - API 实现
- `hotnews/web/timeline_cache.py` - 缓存实现
- `docs/fixes/QUICK_REFERENCE.md` - 快速参考

## 更新日志

- 2026-01-19: 实现标签白名单筛选，默认使用 ai_ml 标签
- 2026-01-19: 添加标签过滤逻辑，优先于分类过滤
- 2026-01-19: 更新数据库查询，JOIN rss_entry_tags 表
