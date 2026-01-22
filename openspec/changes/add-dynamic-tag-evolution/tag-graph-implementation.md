# 标签图谱系统实施方案

## 🎯 目标

构建一个灵活、可扩展的标签图谱系统，支持：
- 多层级标签（3+ 层）
- 标签关系（is_a, related_to, has_attribute 等）
- 实体标签（公司、产品、人物）
- 智能推荐和发现

## 📊 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    应用层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 标签选择器   │  │ 标签推荐     │  │ 标签搜索     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    服务层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ TagService   │  │ RelationSvc  │  │ GraphSvc     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                    数据层                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ tags         │  │ tag_relations│  │ tag_graph    │  │
│  │ (SQLite)     │  │ (SQLite)     │  │ (内存)       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 🗄️ 数据模型

### 1. tags 表（扩展）

```sql
CREATE TABLE tags (
    -- 基础字段
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    name_en TEXT,
    
    -- 类型和层级
    type TEXT NOT NULL,              -- category/topic/subtopic/entity/attribute
    level INTEGER DEFAULT 2,         -- 层级：1=category, 2=topic, 3+=dynamic
    parent_id TEXT,                  -- 直接父标签（树形结构）
    
    -- 视觉
    icon TEXT,
    color TEXT,
    description TEXT,
    
    -- 动态标签
    is_dynamic INTEGER DEFAULT 0,    -- 是否为动态标签
    is_entity INTEGER DEFAULT 0,     -- 是否为实体标签
    entity_type TEXT,                -- 实体类型：company/product/person/event
    
    -- 统计
    usage_count INTEGER DEFAULT 0,
    last_used_at INTEGER,
    quality_score REAL DEFAULT 0.0,
    
    -- 生命周期
    lifecycle TEXT DEFAULT 'active', -- active/deprecated/archived
    promoted_from TEXT,
    
    -- 元数据
    sort_order INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    
    FOREIGN KEY (parent_id) REFERENCES tags(id)
);

-- 索引
CREATE INDEX idx_tags_type ON tags(type);
CREATE INDEX idx_tags_level ON tags(level);
CREATE INDEX idx_tags_parent ON tags(parent_id);
CREATE INDEX idx_tags_entity ON tags(is_entity, entity_type);
CREATE INDEX idx_tags_usage ON tags(usage_count DESC);
```

### 2. tag_relations 表（新增）


```sql
CREATE TABLE tag_relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source_tag_id TEXT NOT NULL,
    target_tag_id TEXT NOT NULL,
    relation_type TEXT NOT NULL,     -- 关系类型
    weight REAL DEFAULT 1.0,         -- 关系权重（0-1）
    confidence REAL DEFAULT 1.0,     -- 置信度（0-1）
    
    -- 元数据
    source TEXT DEFAULT 'ai',        -- 来源：ai/manual/auto
    created_at INTEGER,
    updated_at INTEGER,
    last_verified_at INTEGER,        -- 最后验证时间
    
    UNIQUE(source_tag_id, target_tag_id, relation_type)
);

CREATE INDEX idx_tag_relations_source ON tag_relations(source_tag_id);
CREATE INDEX idx_tag_relations_target ON tag_relations(target_tag_id);
CREATE INDEX idx_tag_relations_type ON tag_relations(relation_type);
CREATE INDEX idx_tag_relations_weight ON tag_relations(weight DESC);
```

**关系类型定义**：

```python
RELATION_TYPES = {
    # 层级关系
    "is_a": {
        "name": "属于",
        "description": "A 是 B 的一种",
        "example": "GPT-4 is_a 大语言模型",
        "symmetric": False,
        "transitive": True
    },
    "part_of": {
        "name": "部分",
        "description": "A 是 B 的组成部分",
        "example": "Transformer part_of 大语言模型",
        "symmetric": False,
        "transitive": True
    },
    
    # 关联关系
    "related_to": {
        "name": "相关",
        "description": "A 与 B 相关",
        "example": "大语言模型 related_to 算力",
        "symmetric": True,
        "transitive": False
    },
    "similar_to": {
        "name": "相似",
        "description": "A 与 B 相似",
        "example": "GPT-4 similar_to Claude",
        "symmetric": True,
        "transitive": False
    },
    
    # 竞争关系
    "competes_with": {
        "name": "竞争",
        "description": "A 与 B 竞争",
        "example": "OpenAI competes_with Anthropic",
        "symmetric": True,
        "transitive": False
    },
    "alternative_to": {
        "name": "替代",
        "description": "A 可以替代 B",
        "example": "开源模型 alternative_to 商业模型",
        "symmetric": False,
        "transitive": False
    },
    
    # 依赖关系
    "requires": {
        "name": "需要",
        "description": "A 需要 B",
        "example": "大模型训练 requires GPU",
        "symmetric": False,
        "transitive": True
    },
    "enables": {
        "name": "使能",
        "description": "A 使 B 成为可能",
        "example": "Transformer enables ChatGPT",
        "symmetric": False,
        "transitive": False
    },
    
    # 属性关系
    "has_attribute": {
        "name": "具有属性",
        "description": "A 具有属性 B",
        "example": "GPT-4 has_attribute 多模态",
        "symmetric": False,
        "transitive": False
    },
    
    # 实体关系
    "developed_by": {
        "name": "开发者",
        "description": "A 由 B 开发",
        "example": "GPT-4 developed_by OpenAI",
        "symmetric": False,
        "transitive": False
    },
    "successor_of": {
        "name": "继任者",
        "description": "A 是 B 的继任者",
        "example": "GPT-4 successor_of GPT-3.5",
        "symmetric": False,
        "transitive": False
    },
}
```

### 3. tag_cooccurrence 表（新增）

```sql
CREATE TABLE tag_cooccurrence (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tag1_id TEXT NOT NULL,
    tag2_id TEXT NOT NULL,
    cooccurrence_count INTEGER DEFAULT 0,
    last_cooccurred_at INTEGER,
    
    UNIQUE(tag1_id, tag2_id),
    CHECK(tag1_id < tag2_id)  -- 确保 tag1 < tag2，避免重复
);

CREATE INDEX idx_tag_cooccurrence_count ON tag_cooccurrence(cooccurrence_count DESC);
CREATE INDEX idx_tag_cooccurrence_tag1 ON tag_cooccurrence(tag1_id);
CREATE INDEX idx_tag_cooccurrence_tag2 ON tag_cooccurrence(tag2_id);
```

## 🔧 核心服务实现

### 1. TagGraphService（标签图谱服务）

```python
# hotnews/kernel/services/tag_graph_service.py

import networkx as nx
from typing import List, Dict, Set, Optional
from hotnews.core.logger import get_logger

logger = get_logger(__name__)

class TagGraphService:
    """标签图谱服务"""
    
    def __init__(self, db_conn):
        self.db = db_conn
        self.graph = nx.DiGraph()  # 有向图
        self.loaded = False
    
    def load_graph(self):
        """从数据库加载标签图谱到内存"""
        logger.info("开始加载标签图谱...")
        
        # 加载标签节点
        tags = self.db.execute(
            "SELECT * FROM tags WHERE enabled = 1"
        ).fetchall()
        
        for tag in tags:
            self.graph.add_node(
                tag['id'],
                name=tag['name'],
                type=tag['type'],
                level=tag['level'],
                parent_id=tag['parent_id'],
                is_entity=tag['is_entity'],
                usage_count=tag['usage_count']
            )
        
        # 加载关系边
        relations = self.db.execute(
            "SELECT * FROM tag_relations WHERE confidence >= 0.5"
        ).fetchall()
        
        for rel in relations:
            self.graph.add_edge(
                rel['source_tag_id'],
                rel['target_tag_id'],
                relation_type=rel['relation_type'],
                weight=rel['weight'],
                confidence=rel['confidence']
            )
        
        self.loaded = True
        logger.info(f"标签图谱加载完成：{self.graph.number_of_nodes()} 个节点，"
                   f"{self.graph.number_of_edges()} 条边")
    
    def get_ancestors(self, tag_id: str, max_depth: int = 10) -> List[str]:
        """获取标签的所有祖先（向上遍历）"""
        ancestors = []
        current = tag_id
        depth = 0
        
        while current and depth < max_depth:
            node = self.graph.nodes.get(current)
            if not node or not node.get('parent_id'):
                break
            
            parent_id = node['parent_id']
            ancestors.append(parent_id)
            current = parent_id
            depth += 1
        
        return ancestors
    
    def get_descendants(self, tag_id: str, max_depth: int = 3) -> List[str]:
        """获取标签的所有后代（向下遍历）"""
        if not self.graph.has_node(tag_id):
            return []
        
        descendants = []
        
        # BFS 遍历
        from collections import deque
        queue = deque([(tag_id, 0)])
        visited = {tag_id}
        
        while queue:
            current, depth = queue.popleft()
            
            if depth >= max_depth:
                continue
            
            # 查找所有子节点（parent_id = current）
            for node_id, node_data in self.graph.nodes(data=True):
                if node_data.get('parent_id') == current and node_id not in visited:
                    descendants.append(node_id)
                    visited.add(node_id)
                    queue.append((node_id, depth + 1))
        
        return descendants
    
    def get_related_tags(
        self,
        tag_id: str,
        relation_types: Optional[List[str]] = None,
        max_results: int = 20
    ) -> List[Dict]:
        """获取相关标签"""
        if not self.graph.has_node(tag_id):
            return []
        
        related = []
        
        # 出边（source -> target）
        for _, target, edge_data in self.graph.out_edges(tag_id, data=True):
            if relation_types and edge_data['relation_type'] not in relation_types:
                continue
            
            related.append({
                'tag_id': target,
                'relation_type': edge_data['relation_type'],
                'weight': edge_data['weight'],
                'confidence': edge_data['confidence'],
                'direction': 'outgoing'
            })
        
        # 入边（source <- target）
        for source, _, edge_data in self.graph.in_edges(tag_id, data=True):
            if relation_types and edge_data['relation_type'] not in relation_types:
                continue
            
            related.append({
                'tag_id': source,
                'relation_type': edge_data['relation_type'],
                'weight': edge_data['weight'],
                'confidence': edge_data['confidence'],
                'direction': 'incoming'
            })
        
        # 按权重排序
        related.sort(key=lambda x: x['weight'] * x['confidence'], reverse=True)
        return related[:max_results]
    
    def find_path(self, source_tag: str, target_tag: str) -> Optional[List[str]]:
        """查找两个标签之间的最短路径"""
        try:
            # 使用无向图查找路径
            undirected = self.graph.to_undirected()
            path = nx.shortest_path(undirected, source_tag, target_tag)
            return path
        except nx.NetworkXNoPath:
            return None
    
    def recommend_tags(
        self,
        user_tags: List[str],
        top_k: int = 10,
        exclude_tags: Optional[Set[str]] = None
    ) -> List[Dict]:
        """基于用户已选标签推荐新标签"""
        if not user_tags:
            return []
        
        exclude_tags = exclude_tags or set()
        exclude_tags.update(user_tags)
        
        # 使用 PageRank 算法
        personalization = {tag: 1.0 for tag in user_tags if self.graph.has_node(tag)}
        
        if not personalization:
            return []
        
        scores = nx.pagerank(
            self.graph,
            personalization=personalization,
            alpha=0.85
        )
        
        # 过滤和排序
        recommendations = [
            {'tag_id': tag_id, 'score': score}
            for tag_id, score in scores.items()
            if tag_id not in exclude_tags
        ]
        
        recommendations.sort(key=lambda x: x['score'], reverse=True)
        return recommendations[:top_k]
    
    def find_communities(self, min_size: int = 3) -> List[Set[str]]:
        """发现标签社区（聚类）"""
        undirected = self.graph.to_undirected()
        communities = nx.community.greedy_modularity_communities(undirected)
        
        # 过滤小社区
        return [c for c in communities if len(c) >= min_size]
    
    def calculate_centrality(self) -> Dict[str, float]:
        """计算标签中心性（重要性）"""
        return nx.pagerank(self.graph)
    
    def add_relation(
        self,
        source_tag: str,
        target_tag: str,
        relation_type: str,
        weight: float = 1.0,
        confidence: float = 1.0
    ):
        """添加标签关系"""
        # 添加到图
        self.graph.add_edge(
            source_tag,
            target_tag,
            relation_type=relation_type,
            weight=weight,
            confidence=confidence
        )
        
        # 持久化到数据库
        self.db.execute(
            """
            INSERT OR REPLACE INTO tag_relations
            (source_tag_id, target_tag_id, relation_type, weight, confidence, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (source_tag, target_tag, relation_type, weight, confidence,
             int(time.time()), int(time.time()))
        )
        self.db.commit()
```

### 2. TagRelationService（标签关系服务）

```python
# hotnews/kernel/services/tag_relation_service.py

import time
from typing import List, Dict, Optional
from hotnews.core.logger import get_logger

logger = get_logger(__name__)

class TagRelationService:
    """标签关系管理服务"""
    
    def __init__(self, db_conn, graph_service):
        self.db = db_conn
        self.graph = graph_service
    
    def discover_relations_from_ai(self, ai_response: Dict):
        """从 AI 响应中发现新关系"""
        relations = ai_response.get("relations", [])
        
        for rel in relations:
            self.add_or_update_relation(
                source=rel["source"],
                target=rel["target"],
                relation_type=rel["type"],
                confidence=rel.get("confidence", 0.8),
                source="ai"
            )
    
    def infer_relations_from_cooccurrence(self, min_count: int = 10):
        """从共现数据推断隐含关系"""
        # 查询高频共现的标签对
        cooccurrences = self.db.execute(
            """
            SELECT tag1_id, tag2_id, cooccurrence_count
            FROM tag_cooccurrence
            WHERE cooccurrence_count >= ?
            ORDER BY cooccurrence_count DESC
            LIMIT 100
            """,
            (min_count,)
        ).fetchall()
        
        for row in cooccurrences:
            tag1, tag2, count = row['tag1_id'], row['tag2_id'], row['cooccurrence_count']
            
            # 检查是否已存在关系
            if self.relation_exists(tag1, tag2):
                continue
            
            # 计算置信度（基于共现次数）
            confidence = min(0.5 + (count - min_count) * 0.05, 0.95)
            
            # 添加 related_to 关系
            self.add_or_update_relation(
                source=tag1,
                target=tag2,
                relation_type="related_to",
                confidence=confidence,
                source="auto"
            )
            
            logger.info(f"推断关系：{tag1} related_to {tag2} (confidence={confidence:.2f})")
    
    def add_or_update_relation(
        self,
        source: str,
        target: str,
        relation_type: str,
        weight: float = 1.0,
        confidence: float = 1.0,
        source: str = "manual"
    ):
        """添加或更新关系"""
        now = int(time.time())
        
        self.db.execute(
            """
            INSERT INTO tag_relations
            (source_tag_id, target_tag_id, relation_type, weight, confidence, source, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(source_tag_id, target_tag_id, relation_type)
            DO UPDATE SET
                weight = excluded.weight,
                confidence = excluded.confidence,
                updated_at = excluded.updated_at
            """,
            (source, target, relation_type, weight, confidence, source, now, now)
        )
        self.db.commit()
        
        # 更新图
        self.graph.add_relation(source, target, relation_type, weight, confidence)
    
    def relation_exists(self, tag1: str, tag2: str) -> bool:
        """检查关系是否存在"""
        result = self.db.execute(
            """
            SELECT COUNT(*) as count
            FROM tag_relations
            WHERE (source_tag_id = ? AND target_tag_id = ?)
               OR (source_tag_id = ? AND target_tag_id = ?)
            """,
            (tag1, tag2, tag2, tag1)
        ).fetchone()
        
        return result['count'] > 0
    
    def validate_relations(self):
        """验证和清理关系"""
        # 1. 删除低置信度关系
        deleted = self.db.execute(
            "DELETE FROM tag_relations WHERE confidence < 0.3"
        ).rowcount
        
        if deleted > 0:
            logger.info(f"删除 {deleted} 个低置信度关系")
        
        # 2. 检测矛盾关系（如 A is_a B 且 B is_a A）
        contradictions = self.db.execute(
            """
            SELECT r1.source_tag_id, r1.target_tag_id
            FROM tag_relations r1
            JOIN tag_relations r2
                ON r1.source_tag_id = r2.target_tag_id
                AND r1.target_tag_id = r2.source_tag_id
            WHERE r1.relation_type = 'is_a'
              AND r2.relation_type = 'is_a'
            """
        ).fetchall()
        
        for row in contradictions:
            logger.warning(f"发现矛盾关系：{row['source_tag_id']} <-> {row['target_tag_id']}")
            # 保留使用次数更多的方向
            # TODO: 实现保留逻辑
        
        self.db.commit()
    
    def update_cooccurrence(self, tag_ids: List[str]):
        """更新标签共现统计"""
        if len(tag_ids) < 2:
            return
        
        now = int(time.time())
        
        # 对所有标签对更新共现计数
        for i in range(len(tag_ids)):
            for j in range(i + 1, len(tag_ids)):
                tag1, tag2 = sorted([tag_ids[i], tag_ids[j]])
                
                self.db.execute(
                    """
                    INSERT INTO tag_cooccurrence (tag1_id, tag2_id, cooccurrence_count, last_cooccurred_at)
                    VALUES (?, ?, 1, ?)
                    ON CONFLICT(tag1_id, tag2_id)
                    DO UPDATE SET
                        cooccurrence_count = cooccurrence_count + 1,
                        last_cooccurred_at = excluded.last_cooccurred_at
                    """,
                    (tag1, tag2, now)
                )
        
        self.db.commit()
```

### 3. 集成到 AI 标注流程

```python
# 在 hotnews/kernel/scheduler/rss_scheduler.py 中

async def _mb_ai_store_labels_with_relations(entries, ai_results):
    """存储 AI 标注结果（包含关系）"""
    
    graph_service = TagGraphService(db_conn)
    relation_service = TagRelationService(db_conn, graph_service)
    
    for entry, result in zip(entries, ai_results):
        # 1. 存储标签（现有逻辑）
        tag_ids = []
        tag_ids.append(result.get("category"))
        tag_ids.extend(result.get("topics", []))
        tag_ids.extend(result.get("attributes", []))
        
        for tag_id in tag_ids:
            save_entry_tag(entry, tag_id, result.get("confidence", 0.8))
        
        # 2. 发现和存储新标签（动态标签演化）
        new_tags = result.get("new_tags", [])
        for new_tag in new_tags:
            tag_discovery_service.save_candidate(new_tag)
            tag_ids.append(new_tag["id"])
        
        # 3. 发现和存储标签关系
        relations = result.get("relations", [])
        relation_service.discover_relations_from_ai({"relations": relations})
        
        # 4. 更新标签共现统计
        relation_service.update_cooccurrence(tag_ids)
```

## 📱 用户界面实现

### 1. 多层级标签选择器（React 组件）

```javascript
// hotnews/web/static/js/src/components/TagSelector.jsx

import React, { useState, useEffect } from 'react';

const TagSelector = ({ onTagsChange, initialTags = [] }) => {
    const [tags, setTags] = useState([]);
    const [selectedTags, setSelectedTags] = useState(initialTags);
    const [expandedNodes, setExpandedNodes] = useState(new Set());
    
    useEffect(() => {
        // 加载标签树
        fetch('/api/tags/tree')
            .then(res => res.json())
            .then(data => setTags(data.tags));
    }, []);
    
    const toggleNode = (tagId) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(tagId)) {
            newExpanded.delete(tagId);
        } else {
            newExpanded.add(tagId);
        }
        setExpandedNodes(newExpanded);
    };
    
    const selectTag = (tagId) => {
        const newSelected = selectedTags.includes(tagId)
            ? selectedTags.filter(id => id !== tagId)
            : [...selectedTags, tagId];
        
        setSelectedTags(newSelected);
        onTagsChange(newSelected);
    };
    
    const renderTag = (tag, level = 0) => {
        const hasChildren = tag.children && tag.children.length > 0;
        const isExpanded = expandedNodes.has(tag.id);
        const isSelected = selectedTags.includes(tag.id);
        
        return (
            <div key={tag.id} style={{ marginLeft: `${level * 20}px` }}>
                <div className="tag-item">
                    {hasChildren && (
                        <span
                            className="expand-icon"
                            onClick={() => toggleNode(tag.id)}
                        >
                            {isExpanded ? '▼' : '▶'}
                        </span>
                    )}
                    
                    <span className="tag-icon">{tag.icon}</span>
                    
                    <label>
                        <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => selectTag(tag.id)}
                        />
                        {tag.name}
                    </label>
                    
                    <span className="tag-count">({tag.usage_count})</span>
                </div>
                
                {hasChildren && isExpanded && (
                    <div className="tag-children">
                        {tag.children.map(child => renderTag(child, level + 1))}
                    </div>
                )}
            </div>
        );
    };
    
    return (
        <div className="tag-selector">
            <div className="tag-tree">
                {tags.map(tag => renderTag(tag))}
            </div>
            
            <div className="selected-tags">
                <h4>已选择的标签：</h4>
                {selectedTags.map(tagId => (
                    <span key={tagId} className="tag-badge">
                        {tagId}
                        <button onClick={() => selectTag(tagId)}>×</button>
                    </span>
                ))}
            </div>
        </div>
    );
};

export default TagSelector;
```

### 2. 标签推荐组件

```javascript
// hotnews/web/static/js/src/components/TagRecommendations.jsx

import React, { useState, useEffect } from 'react';

const TagRecommendations = ({ userTags, onTagSelect }) => {
    const [recommendations, setRecommendations] = useState([]);
    const [loading, setLoading] = useState(false);
    
    useEffect(() => {
        if (userTags.length === 0) return;
        
        setLoading(true);
        fetch('/api/tags/recommend', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tags: userTags, top_k: 10 })
        })
            .then(res => res.json())
            .then(data => {
                setRecommendations(data.recommendations);
                setLoading(false);
            });
    }, [userTags]);
    
    if (loading) return <div>加载推荐...</div>;
    if (recommendations.length === 0) return null;
    
    return (
        <div className="tag-recommendations">
            <h4>🔥 你可能感兴趣的标签</h4>
            <div className="recommendation-list">
                {recommendations.map(rec => (
                    <div key={rec.tag_id} className="recommendation-item">
                        <span className="tag-name">{rec.tag_name}</span>
                        <span className="tag-reason">{rec.reason}</span>
                        <button onClick={() => onTagSelect(rec.tag_id)}>
                            订阅
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TagRecommendations;
```

## 🔄 定时任务

```python
# hotnews/kernel/scheduler/tag_graph_scheduler.py

import asyncio
from hotnews.kernel.services.tag_graph_service import TagGraphService
from hotnews.kernel.services.tag_relation_service import TagRelationService

async def tag_graph_maintenance_loop():
    """标签图谱维护任务"""
    
    graph_service = TagGraphService(db_conn)
    relation_service = TagRelationService(db_conn, graph_service)
    
    while True:
        try:
            # 每小时执行一次
            await asyncio.sleep(3600)
            
            # 1. 重新加载图谱（反映最新变化）
            graph_service.load_graph()
            
            # 2. 从共现推断新关系（每天一次）
            if datetime.now().hour == 3:
                relation_service.infer_relations_from_cooccurrence(min_count=10)
                relation_service.validate_relations()
            
            # 3. 计算标签中心性（每周一次）
            if datetime.now().weekday() == 0 and datetime.now().hour == 3:
                centrality = graph_service.calculate_centrality()
                # 更新标签质量分数
                for tag_id, score in centrality.items():
                    update_tag_quality_score(tag_id, score)
            
        except Exception as e:
            logger.error(f"标签图谱维护任务失败: {e}", exc_info=True)
            await asyncio.sleep(300)
```

---

**文档版本**: v1.0  
**创建时间**: 2026-01-19  
**预计实施时间**: 2-3 周
