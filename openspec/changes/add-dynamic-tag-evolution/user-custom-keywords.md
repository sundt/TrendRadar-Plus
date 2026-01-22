# 用户自定义关键词系统

## 🎯 核心需求

用户可以：
1. 输入自己感兴趣的关键词（如"DeepSeek"、"量子计算"、"马斯克"）
2. 系统自动匹配包含这些关键词的新闻
3. 支持关键词组合（AND/OR/NOT）
4. 智能推荐相关关键词
5. 关键词可以转化为正式标签

## 📊 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                  用户输入层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 关键词输入   │  │ 关键词管理   │  │ 关键词推荐   │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  匹配引擎层                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 全文搜索     │  │ 模糊匹配     │  │ 语义匹配     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│                  智能层                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ 关键词扩展   │  │ 同义词识别   │  │ 标签转化     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## 🗄️ 数据模型

### 1. user_keywords 表（新增）

```sql
CREATE TABLE user_keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,           -- 用户 ID
    keyword TEXT NOT NULL,            -- 关键词
    keyword_type TEXT DEFAULT 'exact', -- 匹配类型：exact/fuzzy/semantic
    
    -- 匹配选项
    case_sensitive INTEGER DEFAULT 0, -- 是否区分大小写
    match_whole_word INTEGER DEFAULT 0, -- 是否全词匹配
    
    -- 优先级和过滤
    priority INTEGER DEFAULT 0,       -- 优先级（-10 到 10）
    is_exclude INTEGER DEFAULT 0,     -- 是否为排除关键词
    
    -- 统计
    match_count INTEGER DEFAULT 0,    -- 匹配次数
    last_matched_at INTEGER,          -- 最后匹配时间
    
    -- 智能功能
    auto_expand INTEGER DEFAULT 1,    -- 是否自动扩展同义词
    related_tags TEXT,                -- 关联的标签（JSON）
    
    -- 元数据
    enabled INTEGER DEFAULT 1,
    created_at INTEGER,
    updated_at INTEGER,
    
    UNIQUE(user_id, keyword)
);

CREATE INDEX idx_user_keywords_user ON user_keywords(user_id);
CREATE INDEX idx_user_keywords_enabled ON user_keywords(enabled);
CREATE INDEX idx_user_keywords_priority ON user_keywords(priority DESC);
```

### 2. keyword_synonyms 表（新增）

```sql
CREATE TABLE keyword_synonyms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    keyword TEXT NOT NULL,            -- 主关键词
    synonym TEXT NOT NULL,            -- 同义词
    similarity REAL DEFAULT 1.0,      -- 相似度（0-1）
    source TEXT DEFAULT 'manual',     -- 来源：manual/ai/auto
    created_at INTEGER,
    
    UNIQUE(keyword, synonym)
);

CREATE INDEX idx_keyword_synonyms_keyword ON keyword_synonyms(keyword);
CREATE INDEX idx_keyword_synonyms_synonym ON keyword_synonyms(synonym);
```

### 3. keyword_matches 表（新增）

```sql
CREATE TABLE keyword_matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    keyword_id INTEGER NOT NULL,
    entry_id TEXT NOT NULL,           -- 新闻条目 ID
    match_type TEXT,                  -- 匹配类型：exact/fuzzy/semantic/synonym
    match_score REAL DEFAULT 1.0,     -- 匹配分数
    matched_at INTEGER,
    
    UNIQUE(user_id, keyword_id, entry_id),
    FOREIGN KEY (keyword_id) REFERENCES user_keywords(id)
);

CREATE INDEX idx_keyword_matches_user ON keyword_matches(user_id);
CREATE INDEX idx_keyword_matches_entry ON keyword_matches(entry_id);
CREATE INDEX idx_keyword_matches_time ON keyword_matches(matched_at DESC);
```

## 🔧 核心功能实现

### 1. 关键词匹配引擎


```python
# hotnews/kernel/services/keyword_matcher.py

import re
from typing import List, Dict, Set
from hotnews.core.logger import get_logger

logger = get_logger(__name__)

class KeywordMatcher:
    """关键词匹配引擎"""
    
    def __init__(self, db_conn):
        self.db = db_conn
        self.synonym_cache = {}  # 同义词缓存
    
    def match_entry(self, entry: Dict, user_keywords: List[Dict]) -> List[Dict]:
        """匹配新闻条目与用户关键词"""
        matches = []
        text = f"{entry.get('title', '')} {entry.get('description', '')}"
        
        for keyword_config in user_keywords:
            if not keyword_config['enabled']:
                continue
            
            keyword = keyword_config['keyword']
            match_result = None
            
            # 1. 精确匹配
            if keyword_config['keyword_type'] == 'exact':
                match_result = self._exact_match(text, keyword, keyword_config)
            
            # 2. 模糊匹配
            elif keyword_config['keyword_type'] == 'fuzzy':
                match_result = self._fuzzy_match(text, keyword, keyword_config)
            
            # 3. 语义匹配（使用 AI）
            elif keyword_config['keyword_type'] == 'semantic':
                match_result = self._semantic_match(text, keyword, keyword_config)
            
            if match_result:
                matches.append({
                    'keyword_id': keyword_config['id'],
                    'keyword': keyword,
                    'match_type': match_result['type'],
                    'match_score': match_result['score'],
                    'priority': keyword_config['priority']
                })
        
        return matches
    
    def _exact_match(self, text: str, keyword: str, config: Dict) -> Dict:
        """精确匹配"""
        # 处理大小写
        if not config['case_sensitive']:
            text = text.lower()
            keyword = keyword.lower()
        
        # 全词匹配
        if config['match_whole_word']:
            pattern = r'\b' + re.escape(keyword) + r'\b'
            if re.search(pattern, text):
                return {'type': 'exact', 'score': 1.0}
        else:
            if keyword in text:
                return {'type': 'exact', 'score': 1.0}
        
        # 同义词匹配
        if config['auto_expand']:
            synonyms = self._get_synonyms(keyword)
            for syn, similarity in synonyms:
                if not config['case_sensitive']:
                    syn = syn.lower()
                
                if syn in text:
                    return {'type': 'synonym', 'score': similarity}
        
        return None
    
    def _fuzzy_match(self, text: str, keyword: str, config: Dict) -> Dict:
        """模糊匹配（支持拼写错误、部分匹配）"""
        from difflib import SequenceMatcher
        
        if not config['case_sensitive']:
            text = text.lower()
            keyword = keyword.lower()
        
        # 分词
        words = re.findall(r'\w+', text)
        
        best_score = 0.0
        for word in words:
            similarity = SequenceMatcher(None, keyword, word).ratio()
            if similarity > best_score:
                best_score = similarity
        
        # 阈值：相似度 > 0.8 才算匹配
        if best_score > 0.8:
            return {'type': 'fuzzy', 'score': best_score}
        
        return None
    
    def _semantic_match(self, text: str, keyword: str, config: Dict) -> Dict:
        """语义匹配（使用 AI 理解语义）"""
        # TODO: 集成 AI 模型进行语义匹配
        # 可以使用 sentence-transformers 计算语义相似度
        pass
    
    def _get_synonyms(self, keyword: str) -> List[tuple]:
        """获取关键词的同义词"""
        if keyword in self.synonym_cache:
            return self.synonym_cache[keyword]
        
        synonyms = self.db.execute(
            """
            SELECT synonym, similarity
            FROM keyword_synonyms
            WHERE keyword = ?
            ORDER BY similarity DESC
            LIMIT 10
            """,
            (keyword,)
        ).fetchall()
        
        result = [(row['synonym'], row['similarity']) for row in synonyms]
        self.synonym_cache[keyword] = result
        return result
    
    def add_synonym(self, keyword: str, synonym: str, similarity: float = 1.0):
        """添加同义词"""
        self.db.execute(
            """
            INSERT OR REPLACE INTO keyword_synonyms
            (keyword, synonym, similarity, source, created_at)
            VALUES (?, ?, ?, 'manual', ?)
            """,
            (keyword, synonym, similarity, int(time.time()))
        )
        self.db.commit()
        
        # 清除缓存
        self.synonym_cache.pop(keyword, None)
```

### 2. 用户关键词服务

```python
# hotnews/kernel/services/user_keyword_service.py

import time
from typing import List, Dict, Optional
from hotnews.core.logger import get_logger

logger = get_logger(__name__)

class UserKeywordService:
    """用户关键词管理服务"""
    
    def __init__(self, db_conn):
        self.db = db_conn
        self.matcher = KeywordMatcher(db_conn)
    
    def add_keyword(
        self,
        user_id: str,
        keyword: str,
        keyword_type: str = 'exact',
        priority: int = 0,
        **options
    ) -> int:
        """添加用户关键词"""
        now = int(time.time())
        
        cursor = self.db.execute(
            """
            INSERT INTO user_keywords
            (user_id, keyword, keyword_type, priority, case_sensitive, 
             match_whole_word, is_exclude, auto_expand, enabled, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
            """,
            (
                user_id, keyword, keyword_type, priority,
                options.get('case_sensitive', 0),
                options.get('match_whole_word', 0),
                options.get('is_exclude', 0),
                options.get('auto_expand', 1),
                now, now
            )
        )
        self.db.commit()
        
        keyword_id = cursor.lastrowid
        logger.info(f"用户 {user_id} 添加关键词: {keyword} (ID={keyword_id})")
        
        # 智能推荐相关标签
        self._suggest_related_tags(user_id, keyword_id, keyword)
        
        return keyword_id
    
    def get_user_keywords(self, user_id: str, enabled_only: bool = True) -> List[Dict]:
        """获取用户的所有关键词"""
        query = """
            SELECT * FROM user_keywords
            WHERE user_id = ?
        """
        params = [user_id]
        
        if enabled_only:
            query += " AND enabled = 1"
        
        query += " ORDER BY priority DESC, created_at DESC"
        
        rows = self.db.execute(query, params).fetchall()
        return [dict(row) for row in rows]
    
    def update_keyword(self, keyword_id: int, **updates):
        """更新关键词配置"""
        allowed_fields = [
            'keyword', 'keyword_type', 'priority', 'case_sensitive',
            'match_whole_word', 'is_exclude', 'auto_expand', 'enabled'
        ]
        
        set_clause = []
        values = []
        
        for field, value in updates.items():
            if field in allowed_fields:
                set_clause.append(f"{field} = ?")
                values.append(value)
        
        if not set_clause:
            return
        
        set_clause.append("updated_at = ?")
        values.append(int(time.time()))
        values.append(keyword_id)
        
        self.db.execute(
            f"UPDATE user_keywords SET {', '.join(set_clause)} WHERE id = ?",
            values
        )
        self.db.commit()
    
    def delete_keyword(self, keyword_id: int):
        """删除关键词"""
        self.db.execute("DELETE FROM user_keywords WHERE id = ?", (keyword_id,))
        self.db.execute("DELETE FROM keyword_matches WHERE keyword_id = ?", (keyword_id,))
        self.db.commit()
    
    def match_and_save(self, user_id: str, entry: Dict):
        """匹配新闻并保存结果"""
        user_keywords = self.get_user_keywords(user_id)
        matches = self.matcher.match_entry(entry, user_keywords)
        
        if not matches:
            return
        
        now = int(time.time())
        
        for match in matches:
            # 保存匹配记录
            self.db.execute(
                """
                INSERT OR IGNORE INTO keyword_matches
                (user_id, keyword_id, entry_id, match_type, match_score, matched_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    user_id,
                    match['keyword_id'],
                    entry['id'],
                    match['match_type'],
                    match['match_score'],
                    now
                )
            )
            
            # 更新关键词统计
            self.db.execute(
                """
                UPDATE user_keywords
                SET match_count = match_count + 1,
                    last_matched_at = ?
                WHERE id = ?
                """,
                (now, match['keyword_id'])
            )
        
        self.db.commit()
    
    def _suggest_related_tags(self, user_id: str, keyword_id: int, keyword: str):
        """智能推荐相关标签"""
        # 在标签库中搜索相关标签
        related_tags = self.db.execute(
            """
            SELECT id, name, type
            FROM tags
            WHERE enabled = 1
              AND (name LIKE ? OR name_en LIKE ? OR description LIKE ?)
            LIMIT 5
            """,
            (f"%{keyword}%", f"%{keyword}%", f"%{keyword}%")
        ).fetchall()
        
        if related_tags:
            tag_ids = [tag['id'] for tag in related_tags]
            self.db.execute(
                """
                UPDATE user_keywords
                SET related_tags = ?
                WHERE id = ?
                """,
                (json.dumps(tag_ids), keyword_id)
            )
            self.db.commit()
            
            logger.info(f"为关键词 '{keyword}' 推荐标签: {tag_ids}")
    
    def get_keyword_stats(self, user_id: str) -> Dict:
        """获取用户关键词统计"""
        stats = self.db.execute(
            """
            SELECT
                COUNT(*) as total_keywords,
                SUM(match_count) as total_matches,
                COUNT(CASE WHEN match_count > 0 THEN 1 END) as active_keywords
            FROM user_keywords
            WHERE user_id = ? AND enabled = 1
            """,
            (user_id,)
        ).fetchone()
        
        # 获取热门关键词
        top_keywords = self.db.execute(
            """
            SELECT keyword, match_count, last_matched_at
            FROM user_keywords
            WHERE user_id = ? AND enabled = 1
            ORDER BY match_count DESC
            LIMIT 10
            """,
            (user_id,)
        ).fetchall()
        
        return {
            'total_keywords': stats['total_keywords'],
            'total_matches': stats['total_matches'],
            'active_keywords': stats['active_keywords'],
            'top_keywords': [dict(row) for row in top_keywords]
        }
```

### 3. 智能关键词扩展

```python
# hotnews/kernel/services/keyword_expander.py

class KeywordExpander:
    """关键词智能扩展服务"""
    
    def __init__(self, db_conn):
        self.db = db_conn
    
    def expand_keyword(self, keyword: str) -> List[str]:
        """扩展关键词（同义词、相关词）"""
        expansions = set([keyword])
        
        # 1. 从同义词表获取
        synonyms = self.db.execute(
            "SELECT synonym FROM keyword_synonyms WHERE keyword = ?",
            (keyword,)
        ).fetchall()
        expansions.update(row['synonym'] for row in synonyms)
        
        # 2. 使用 AI 生成同义词
        ai_synonyms = self._ai_generate_synonyms(keyword)
        expansions.update(ai_synonyms)
        
        # 3. 从标签关系推断
        related_from_tags = self._get_related_from_tags(keyword)
        expansions.update(related_from_tags)
        
        return list(expansions)
    
    def _ai_generate_synonyms(self, keyword: str) -> List[str]:
        """使用 AI 生成同义词"""
        # TODO: 调用 AI API
        # Prompt: "请列出'{keyword}'的同义词和相关词，用逗号分隔"
        pass
    
    def _get_related_from_tags(self, keyword: str) -> List[str]:
        """从标签关系推断相关词"""
        # 查找包含该关键词的标签
        tags = self.db.execute(
            """
            SELECT id FROM tags
            WHERE name LIKE ? OR name_en LIKE ?
            """,
            (f"%{keyword}%", f"%{keyword}%")
        ).fetchall()
        
        if not tags:
            return []
        
        # 查找相关标签
        related_tags = []
        for tag in tags:
            related = self.db.execute(
                """
                SELECT t.name, t.name_en
                FROM tag_relations r
                JOIN tags t ON t.id = r.target_tag_id
                WHERE r.source_tag_id = ?
                  AND r.relation_type IN ('related_to', 'similar_to')
                """,
                (tag['id'],)
            ).fetchall()
            
            related_tags.extend(row['name'] for row in related)
            related_tags.extend(row['name_en'] for row in related if row['name_en'])
        
        return related_tags
```

## 📱 用户界面设计

### 1. 关键词管理界面

```javascript
// hotnews/web/static/js/src/components/KeywordManager.jsx

import React, { useState, useEffect } from 'react';

const KeywordManager = ({ userId }) => {
    const [keywords, setKeywords] = useState([]);
    const [newKeyword, setNewKeyword] = useState('');
    const [showAdvanced, setShowAdvanced] = useState(false);
    
    useEffect(() => {
        loadKeywords();
    }, []);
    
    const loadKeywords = async () => {
        const res = await fetch(`/api/user/keywords?user_id=${userId}`);
        const data = await res.json();
        setKeywords(data.keywords);
    };
    
    const addKeyword = async () => {
        if (!newKeyword.trim()) return;
        
        await fetch('/api/user/keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                keyword: newKeyword,
                keyword_type: 'exact',
                priority: 0
            })
        });
        
        setNewKeyword('');
        loadKeywords();
    };
    
    const deleteKeyword = async (keywordId) => {
        await fetch(`/api/user/keywords/${keywordId}`, {
            method: 'DELETE'
        });
        loadKeywords();
    };
    
    return (
        <div className="keyword-manager">
            <h3>🔍 我的关键词</h3>
            
            {/* 添加关键词 */}
            <div className="keyword-input">
                <input
                    type="text"
                    placeholder="输入关键词，如：DeepSeek、量子计算、马斯克..."
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addKeyword()}
                />
                <button onClick={addKeyword}>添加</button>
                <button onClick={() => setShowAdvanced(!showAdvanced)}>
                    高级选项
                </button>
            </div>
            
            {/* 关键词列表 */}
            <div className="keyword-list">
                {keywords.map(kw => (
                    <div key={kw.id} className="keyword-item">
                        <span className="keyword-text">{kw.keyword}</span>
                        <span className="keyword-stats">
                            匹配 {kw.match_count} 次
                        </span>
                        {kw.related_tags && (
                            <span className="keyword-tags">
                                相关标签: {JSON.parse(kw.related_tags).join(', ')}
                            </span>
                        )}
                        <button onClick={() => deleteKeyword(kw.id)}>删除</button>
                    </div>
                ))}
            </div>
            
            {/* 智能推荐 */}
            <div className="keyword-suggestions">
                <h4>💡 推荐关键词</h4>
                <p>基于你的阅读历史，可能感兴趣：</p>
                {/* TODO: 显示推荐关键词 */}
            </div>
        </div>
    );
};

export default KeywordManager;
```

### 2. 关键词高级选项

```javascript
const KeywordAdvancedOptions = ({ keyword, onSave }) => {
    const [options, setOptions] = useState({
        keyword_type: 'exact',
        case_sensitive: false,
        match_whole_word: false,
        auto_expand: true,
        priority: 0
    });
    
    return (
        <div className="keyword-advanced">
            <h4>高级选项</h4>
            
            <label>
                匹配类型：
                <select
                    value={options.keyword_type}
                    onChange={(e) => setOptions({...options, keyword_type: e.target.value})}
                >
                    <option value="exact">精确匹配</option>
                    <option value="fuzzy">模糊匹配</option>
                    <option value="semantic">语义匹配</option>
                </select>
            </label>
            
            <label>
                <input
                    type="checkbox"
                    checked={options.case_sensitive}
                    onChange={(e) => setOptions({...options, case_sensitive: e.target.checked})}
                />
                区分大小写
            </label>
            
            <label>
                <input
                    type="checkbox"
                    checked={options.match_whole_word}
                    onChange={(e) => setOptions({...options, match_whole_word: e.target.checked})}
                />
                全词匹配
            </label>
            
            <label>
                <input
                    type="checkbox"
                    checked={options.auto_expand}
                    onChange={(e) => setOptions({...options, auto_expand: e.target.checked})}
                />
                自动扩展同义词
            </label>
            
            <label>
                优先级：
                <input
                    type="range"
                    min="-10"
                    max="10"
                    value={options.priority}
                    onChange={(e) => setOptions({...options, priority: parseInt(e.target.value)})}
                />
                {options.priority}
            </label>
            
            <button onClick={() => onSave(options)}>保存</button>
        </div>
    );
};
```

## 🔄 集成到现有系统

### 1. 在新闻抓取时匹配关键词

```python
# 在 hotnews/kernel/scheduler/rss_scheduler.py 中

async def process_new_entries(entries):
    """处理新抓取的新闻"""
    
    keyword_service = UserKeywordService(db_conn)
    
    # 获取所有活跃用户
    active_users = get_active_users()
    
    for entry in entries:
        # 1. AI 标注（现有流程）
        ai_tags = await ai_label_entry(entry)
        
        # 2. 匹配用户关键词（新增）
        for user_id in active_users:
            keyword_service.match_and_save(user_id, entry)
```

### 2. API 端点

```python
# hotnews/kernel/user/keyword_api.py

from flask import Blueprint, request, jsonify

keyword_bp = Blueprint('keyword', __name__)

@keyword_bp.route('/api/user/keywords', methods=['GET'])
def get_user_keywords():
    """获取用户关键词"""
    user_id = request.args.get('user_id')
    service = UserKeywordService(db_conn)
    keywords = service.get_user_keywords(user_id)
    return jsonify({'keywords': keywords})

@keyword_bp.route('/api/user/keywords', methods=['POST'])
def add_keyword():
    """添加关键词"""
    data = request.json
    service = UserKeywordService(db_conn)
    keyword_id = service.add_keyword(
        user_id=data['user_id'],
        keyword=data['keyword'],
        keyword_type=data.get('keyword_type', 'exact'),
        priority=data.get('priority', 0)
    )
    return jsonify({'keyword_id': keyword_id})

@keyword_bp.route('/api/user/keywords/<int:keyword_id>', methods=['DELETE'])
def delete_keyword(keyword_id):
    """删除关键词"""
    service = UserKeywordService(db_conn)
    service.delete_keyword(keyword_id)
    return jsonify({'success': True})

@keyword_bp.route('/api/user/keywords/stats', methods=['GET'])
def get_keyword_stats():
    """获取关键词统计"""
    user_id = request.args.get('user_id')
    service = UserKeywordService(db_conn)
    stats = service.get_keyword_stats(user_id)
    return jsonify(stats)

@keyword_bp.route('/api/user/keywords/matches', methods=['GET'])
def get_keyword_matches():
    """获取关键词匹配的新闻"""
    user_id = request.args.get('user_id')
    keyword_id = request.args.get('keyword_id')
    
    query = """
        SELECT e.*, km.match_type, km.match_score
        FROM keyword_matches km
        JOIN rss_entries e ON e.id = km.entry_id
        WHERE km.user_id = ?
    """
    params = [user_id]
    
    if keyword_id:
        query += " AND km.keyword_id = ?"
        params.append(keyword_id)
    
    query += " ORDER BY km.matched_at DESC LIMIT 50"
    
    matches = db_conn.execute(query, params).fetchall()
    return jsonify({'matches': [dict(row) for row in matches]})
```

---

**文档版本**: v1.0  
**创建时间**: 2026-01-19
