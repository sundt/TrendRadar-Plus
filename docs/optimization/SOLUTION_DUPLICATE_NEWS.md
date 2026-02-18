# 智能去重方案：处理标题修改导致的重复

## 问题描述
对方发布了一个标题，过段时间发现错了修改了标题，导致我们抓取了两条：一条错误标题，一条正确标题。

## 现有机制
系统已经有良好的基础：
- ✅ 使用 `URL + platform_id` 作为唯一标识
- ✅ `title_changes` 表记录标题变更历史
- ✅ 更新时自动检测标题变化

## 智能去重方案

### 方案1：基于 URL 的自动合并（推荐）
**原理**：同一 URL 的新闻只保留最新标题，旧标题记录到历史表

**优点**：
- 用户只看到最新正确的标题
- 保留完整的标题变更历史
- 无需额外配置

**实现**：现有代码已实现（`local.py` 第 200-230 行）

### 方案2：基于相似度的智能去重
**原理**：检测标题相似度，自动合并高度相似的新闻

**适用场景**：
- 同一新闻在不同平台有不同标题
- 标题有轻微修改（错别字、标点符号）

**实现步骤**：

1. **添加标题相似度计算**：
```python
# hotnews/hotnews/utils/text_similarity.py
from difflib import SequenceMatcher

def title_similarity(title1: str, title2: str) -> float:
    """计算两个标题的相似度 (0-1)"""
    # 归一化：去除空格、标点，转小写
    def normalize(s):
        import re
        s = s.lower().strip()
        s = re.sub(r'[^\w\u4e00-\u9fff]', '', s)
        return s
    
    t1 = normalize(title1)
    t2 = normalize(title2)
    
    if not t1 or not t2:
        return 0.0
    
    return SequenceMatcher(None, t1, t2).ratio()
```

2. **在保存时检测相似标题**：
```python
# hotnews/hotnews/storage/local.py (修改 save_news_data 方法)

# 在插入新记录前，检查是否有相似标题
if item.url:
    # 现有逻辑：检查完全相同的 URL
    cursor.execute("""
        SELECT id, title FROM news_items
        WHERE url = ? AND platform_id = ?
    """, (item.url, source_id))
    existing = cursor.fetchone()
    
    if existing:
        # 已存在，更新（现有逻辑）
        ...
    else:
        # 新增：检查同平台是否有相似标题（可能是修改后的重复）
        cursor.execute("""
            SELECT id, title, url FROM news_items
            WHERE platform_id = ? 
            AND last_crawl_time >= ?
            ORDER BY last_crawl_time DESC
            LIMIT 50
        """, (source_id, data.crawl_time - 3600))  # 只检查最近1小时
        
        recent_items = cursor.fetchall()
        for rid, rtitle, rurl in recent_items:
            similarity = title_similarity(item.title, rtitle)
            if similarity > 0.85:  # 85% 相似度阈值
                # 发现高度相似的标题，记录为可能的重复
                cursor.execute("""
                    INSERT INTO title_changes
                    (news_item_id, old_title, new_title, changed_at)
                    VALUES (?, ?, ?, ?)
                """, (rid, rtitle, item.title, now_str))
                
                # 更新为新标题（如果 URL 不同，也更新 URL）
                if rurl != item.url:
                    cursor.execute("""
                        UPDATE news_items SET
                            title = ?,
                            url = ?,
                            rank = ?,
                            last_crawl_time = ?,
                            crawl_count = crawl_count + 1,
                            updated_at = ?
                        WHERE id = ?
                    """, (item.title, item.url, item.rank, 
                          data.crawl_time, now_str, rid))
                
                # 跳过插入新记录
                updated_count += 1
                break
        else:
            # 没有相似标题，插入新记录（现有逻辑）
            ...
```

### 方案3：前端展示优化
**原理**：后端保留所有版本，前端只显示最新版本

**实现**：
```python
# hotnews/hotnews/web/news_viewer.py (修改 get_news_data 方法)

# 在返回数据前，过滤掉已被更新的旧标题
def _filter_outdated_titles(news_items):
    """过滤掉有更新版本的旧标题"""
    # 按 URL 分组
    url_groups = {}
    for item in news_items:
        url = item.get('url')
        if url:
            if url not in url_groups:
                url_groups[url] = []
            url_groups[url].append(item)
    
    # 每个 URL 只保留最新的一条
    filtered = []
    for url, items in url_groups.items():
        # 按 last_crawl_time 排序，取最新的
        latest = max(items, key=lambda x: x.get('last_crawl_time', ''))
        filtered.append(latest)
    
    return filtered
```

## 推荐方案
**组合使用方案1 + 方案3**：
1. 后端：基于 URL 自动合并（已实现）
2. 前端：按 URL 去重，只显示最新版本
3. 可选：添加"查看标题历史"功能，让用户看到标题变更记录

## 数据库查询示例

### 查看标题变更历史
```sql
SELECT 
    n.title as current_title,
    tc.old_title,
    tc.new_title,
    tc.changed_at,
    n.url
FROM news_items n
JOIN title_changes tc ON n.id = tc.news_item_id
WHERE n.platform_id = 'your_platform_id'
ORDER BY tc.changed_at DESC
LIMIT 20;
```

### 查找可能的重复（相似标题）
```sql
SELECT 
    n1.title as title1,
    n2.title as title2,
    n1.url as url1,
    n2.url as url2,
    n1.platform_id
FROM news_items n1
JOIN news_items n2 ON n1.platform_id = n2.platform_id
WHERE n1.id < n2.id
AND n1.last_crawl_time >= datetime('now', '-1 day')
AND n2.last_crawl_time >= datetime('now', '-1 day')
-- 需要在应用层计算相似度
```

## 监控和维护

### 定期清理任务
```python
# hotnews/hotnews/tools/cleanup_duplicates.py
def cleanup_duplicate_titles():
    """清理重复标题（保留最新版本）"""
    conn = get_connection()
    
    # 查找同一 URL 有多个标题的情况
    cursor = conn.execute("""
        SELECT url, platform_id, COUNT(*) as cnt
        FROM news_items
        WHERE url != ''
        GROUP BY url, platform_id
        HAVING cnt > 1
    """)
    
    duplicates = cursor.fetchall()
    deleted_count = 0
    
    for url, platform_id, cnt in duplicates:
        # 保留最新的，删除旧的
        cursor.execute("""
            DELETE FROM news_items
            WHERE id IN (
                SELECT id FROM news_items
                WHERE url = ? AND platform_id = ?
                ORDER BY last_crawl_time DESC
                LIMIT -1 OFFSET 1
            )
        """, (url, platform_id))
        deleted_count += cursor.rowcount
    
    conn.commit()
    return deleted_count
```

## 总结
- **短期**：现有机制已经能处理大部分情况（基于 URL 去重）
- **中期**：添加前端过滤，确保用户只看到最新标题
- **长期**：可选添加相似度检测，处理 URL 变化的情况
