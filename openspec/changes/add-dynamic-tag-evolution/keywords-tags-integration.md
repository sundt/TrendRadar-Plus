# 关键词与标签协同系统

## 🎯 核心理念

**标签**和**关键词**是两个互补的系统：

- **标签**：结构化、层级化、由系统管理
  - 适合：大类分类、主题归类、内容属性
  - 优点：标准化、易于浏览、支持层级
  - 例子：科技 > AI/机器学习 > 大语言模型

- **关键词**：灵活、个性化、由用户管理
  - 适合：特定实体、细粒度话题、个人兴趣
  - 优点：灵活、即时、个性化
  - 例子：DeepSeek、马斯克、量子计算

## 🔄 协同工作流程

### 1. 用户添加关键词 → 系统推荐标签

```
用户输入："DeepSeek"
    ↓
系统搜索相关标签
    ↓
推荐：
  - 科技 (category)
  - AI/机器学习 (topic)
  - 大语言模型 (subtopic)
  - 国产大模型 (subtopic)
    ↓
用户选择订阅这些标签
```

**实现**：
```python
def suggest_tags_for_keyword(keyword: str) -> List[Dict]:
    """为关键词推荐相关标签"""
    # 1. 在标签名称中搜索
    name_matches = db.execute(
        """
        SELECT id, name, type, level
        FROM tags
        WHERE enabled = 1
          AND (name LIKE ? OR name_en LIKE ?)
        """,
        (f"%{keyword}%", f"%{keyword}%")
    ).fetchall()
    
    # 2. 在标签描述中搜索
    desc_matches = db.execute(
        """
        SELECT id, name, type, level
        FROM tags
        WHERE enabled = 1
          AND description LIKE ?
        """,
        (f"%{keyword}%",)
    ).fetchall()
    
    # 3. 使用 AI 语义匹配
    semantic_matches = ai_match_keyword_to_tags(keyword)
    
    # 合并去重
    all_matches = merge_and_rank(name_matches, desc_matches, semantic_matches)
    
    return all_matches[:5]  # 返回前 5 个
```

### 2. 关键词热度 → 自动创建标签

```
关键词："DeepSeek"
    ↓
匹配次数：100+ 次
持续时间：7 天
用户数量：50+ 人
    ↓
系统判断：这是一个热门话题
    ↓
自动创建候选标签：
  - id: deepseek
  - name: DeepSeek
  - type: subtopic
  - parent_id: llm
    ↓
验证通过后晋升为正式标签
```

**实现**：
```python
async def promote_hot_keywords_to_tags():
    """将热门关键词晋升为标签"""
    
    # 查询热门关键词
    hot_keywords = db.execute(
        """
        SELECT
            keyword,
            COUNT(DISTINCT user_id) as user_count,
            SUM(match_count) as total_matches,
            MIN(created_at) as first_seen
        FROM user_keywords
        WHERE enabled = 1
          AND created_at > ?  -- 最近 30 天
        GROUP BY keyword
        HAVING user_count >= 10  -- 至少 10 个用户
          AND total_matches >= 50  -- 至少 50 次匹配
        ORDER BY user_count DESC, total_matches DESC
        """,
        (int(time.time()) - 30 * 86400,)
    ).fetchall()
    
    for kw in hot_keywords:
        # 检查是否已存在标签
        if tag_exists(kw['keyword']):
            continue
        
        # 使用 AI 确定标签属性
        tag_info = await ai_analyze_keyword_for_tag(kw['keyword'])
        
        # 创建候选标签
        create_tag_candidate(
            tag_id=normalize_tag_id(kw['keyword']),
            name=kw['keyword'],
            type=tag_info['type'],
            parent_id=tag_info['parent_id'],
            description=tag_info['description'],
            source='keyword_promotion'
        )
        
        logger.info(f"热门关键词 '{kw['keyword']}' 已创建为候选标签")
```

### 3. 标签 + 关键词组合查询

用户可以同时使用标签和关键词进行精准筛选：

```
标签：科技 > AI/机器学习 > 大语言模型
关键词：DeepSeek, 开源
    ↓
查询逻辑：
  (标签包含 "大语言模型")
  AND
  (标题或内容包含 "DeepSeek" OR "开源")
```

**实现**：
```python
def search_with_tags_and_keywords(
    tag_ids: List[str],
    keywords: List[str],
    user_id: str
) -> List[Dict]:
    """组合标签和关键词搜索"""
    
    # 构建查询
    query = """
        SELECT DISTINCT e.*
        FROM rss_entries e
    """
    
    conditions = []
    params = []
    
    # 标签条件
    if tag_ids:
        query += """
            JOIN rss_entry_tags et ON et.entry_id = e.id
        """
        placeholders = ','.join('?' * len(tag_ids))
        conditions.append(f"et.tag_id IN ({placeholders})")
        params.extend(tag_ids)
    
    # 关键词条件
    if keywords:
        keyword_service = UserKeywordService(db)
        user_keywords = keyword_service.get_user_keywords(user_id)
        
        # 获取关键词配置
        keyword_configs = {
            kw['keyword']: kw
            for kw in user_keywords
            if kw['keyword'] in keywords
        }
        
        # 构建关键词匹配条件
        keyword_conditions = []
        for keyword in keywords:
            config = keyword_configs.get(keyword, {})
            if config.get('case_sensitive'):
                keyword_conditions.append("(e.title LIKE ? OR e.description LIKE ?)")
                params.extend([f"%{keyword}%", f"%{keyword}%"])
            else:
                keyword_conditions.append(
                    "(LOWER(e.title) LIKE ? OR LOWER(e.description) LIKE ?)"
                )
                params.extend([f"%{keyword.lower()}%", f"%{keyword.lower()}%"])
        
        if keyword_conditions:
            conditions.append(f"({' OR '.join(keyword_conditions)})")
    
    # 组合条件
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    
    query += " ORDER BY e.published_at DESC LIMIT 100"
    
    results = db.execute(query, params).fetchall()
    return [dict(row) for row in results]
```

### 4. 智能关键词扩展

系统可以基于标签关系自动扩展关键词：

```
用户关键词："GPT-4"
    ↓
查找相关标签：
  - GPT-4 (entity)
  - GPT系列 (subtopic)
  - 大语言模型 (topic)
    ↓
从标签关系获取相关实体：
  - GPT-4 Turbo (successor_of GPT-4)
  - GPT-4 Vision (variant_of GPT-4)
    ↓
自动扩展关键词：
  - GPT-4
  - GPT-4 Turbo
  - GPT-4 Vision
  - GPT4 (同义词)
```

**实现**：
```python
def expand_keyword_with_tags(keyword: str) -> List[str]:
    """基于标签关系扩展关键词"""
    expansions = set([keyword])
    
    # 1. 查找包含该关键词的标签
    matching_tags = db.execute(
        """
        SELECT id FROM tags
        WHERE enabled = 1
          AND (name LIKE ? OR name_en LIKE ?)
        """,
        (f"%{keyword}%", f"%{keyword}%")
    ).fetchall()
    
    if not matching_tags:
        return list(expansions)
    
    # 2. 查找相关标签
    for tag in matching_tags:
        related = db.execute(
            """
            SELECT t.name, t.name_en, r.relation_type
            FROM tag_relations r
            JOIN tags t ON t.id = r.target_tag_id
            WHERE r.source_tag_id = ?
              AND r.relation_type IN ('successor_of', 'variant_of', 'similar_to')
              AND r.confidence >= 0.7
            """,
            (tag['id'],)
        ).fetchall()
        
        for rel in related:
            expansions.add(rel['name'])
            if rel['name_en']:
                expansions.add(rel['name_en'])
    
    return list(expansions)
```

## 📊 用户界面设计

### 统一的订阅管理界面

```
┌─────────────────────────────────────────────────────────┐
│  我的订阅                                        [设置]  │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  📑 标签订阅 (12)                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 💻 科技 > 🤖 AI/机器学习 > 🧠 大语言模型          │ │
│  │ 💰 财经 > 📈 股票 > A股                           │ │
│  │ 🏢 商业 > 🚀 创业/融资                            │ │
│  │ ...                                                │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  🔍 关键词订阅 (8)                                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │ DeepSeek        匹配 45 次  [相关标签: 大语言模型] │ │
│  │ 量子计算        匹配 12 次  [相关标签: 科学]       │ │
│  │ 马斯克          匹配 89 次  [相关标签: 商业, 科技] │ │
│  │ ...                                                │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  💡 智能推荐                                             │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 基于你的订阅，推荐：                                │ │
│  │ • Claude (关键词) - 与 GPT-4 相关                  │ │
│  │ • 开源模型 (标签) - 与大语言模型相关               │ │
│  │ • AI 算力 (标签) - 与你的兴趣相关                 │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [+ 添加标签]  [+ 添加关键词]                           │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

### 搜索界面

```
┌─────────────────────────────────────────────────────────┐
│  🔍 [搜索新闻...]                                        │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  筛选条件：                                              │
│                                                          │
│  标签：                                                  │
│  [💻 科技] [🤖 AI/机器学习] [🧠 大语言模型] [×]         │
│                                                          │
│  关键词：                                                │
│  [DeepSeek] [开源] [×]                                  │
│                                                          │
│  时间：[最近 7 天 ▼]                                    │
│                                                          │
│  排序：[相关度 ▼]                                       │
│                                                          │
│  ─────────────────────────────────────────────────────  │
│                                                          │
│  找到 23 条结果                                          │
│                                                          │
│  📰 DeepSeek 开源大模型引发关注                         │
│     标签: 科技, AI/机器学习, 大语言模型, 开源           │
│     匹配: DeepSeek (关键词), 开源 (关键词)              │
│     2026-01-18                                          │
│                                                          │
│  📰 国产大模型 DeepSeek 性能测评                        │
│     标签: 科技, AI/机器学习, 大语言模型                 │
│     匹配: DeepSeek (关键词)                             │
│     2026-01-17                                          │
│                                                          │
│  ...                                                     │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## 🎯 最佳实践

### 1. 何时使用标签

- ✅ 浏览大类内容（如"所有科技新闻"）
- ✅ 发现新话题（通过标签层级探索）
- ✅ 订阅长期兴趣（如"AI/机器学习"）
- ✅ 获取结构化推荐

### 2. 何时使用关键词

- ✅ 追踪特定实体（如"DeepSeek"、"马斯克"）
- ✅ 关注短期热点（如"CES 2026"）
- ✅ 精准匹配（如"免费 API"）
- ✅ 个性化需求（如"Python 教程"）

### 3. 组合使用

**场景 1：追踪特定公司的融资新闻**
```
标签：商业 > 创业/融资
关键词：OpenAI, Anthropic, DeepSeek
```

**场景 2：关注免费的 AI 工具**
```
标签：科技 > AI/机器学习
标签属性：免费/优惠
关键词：免费, 开源, API
```

**场景 3：追踪某个人物的动态**
```
关键词：马斯克, Elon Musk
标签：商业, 科技
```

## 🔄 数据流

```
新闻抓取
    │
    ├─→ AI 标注 ─→ 标签匹配 ─→ 推送给订阅该标签的用户
    │
    └─→ 关键词匹配 ─→ 推送给订阅该关键词的用户
                │
                └─→ 统计关键词热度 ─→ 热门关键词晋升为标签
```

## 📈 预期效果

1. **覆盖率提升**
   - 标签：覆盖 85% 的结构化内容
   - 关键词：覆盖 95% 的个性化需求
   - 组合：接近 100% 的用户需求

2. **用户满意度**
   - 标签：适合浏览和发现
   - 关键词：适合精准追踪
   - 组合：最佳用户体验

3. **系统演化**
   - 热门关键词自动成为标签
   - 标签关系帮助扩展关键词
   - 形成良性循环

---

**文档版本**: v1.0  
**创建时间**: 2026-01-19
