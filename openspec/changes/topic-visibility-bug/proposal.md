# 主题可见性 Bug 全面分析报告

## 问题描述

**严重程度**: 🔴 P0 - 严重安全/隐私问题

**现象**: 其他用户登录后，能看到你创建的主题栏目

---

## 代码流程分析

### 1. 主题注入流程 (`page_rendering.py`)

```
用户请求 / → render_viewer_page()
    ↓
_inject_user_topics_as_categories(data, request)
    ↓
1. _get_session_token(request) → 从 Cookie 获取 session token
2. validate_session(conn, token) → 验证 session，返回 user_info
3. storage.get_topics_by_user(str(user_id)) → 按 user_id 查询主题
4. 将主题注入到 categories 中
```

### 2. Session 验证流程 (`auth_service.py`)

```python
def validate_session(conn, session_token: str) -> Tuple[bool, Optional[Dict]]:
    # 查询 session 表，JOIN users 表
    cur = conn.execute("""
        SELECT s.user_id, s.expires_at, u.email, u.nickname, ...
        FROM user_sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.id = ?
    """, (session_token,))
    
    # 返回 user_info，包含 user_id
    return True, {"id": user_id, "email": email, ...}
```

### 3. 主题查询流程 (`topic_storage.py`)

```python
def get_topics_by_user(self, user_id: str) -> List[Dict]:
    cur = self.conn.execute("""
        SELECT id, user_id, name, icon, keywords, ...
        FROM topic_configs
        WHERE user_id = ?
        ORDER BY sort_order ASC, created_at DESC
    """, (user_id,))
```

---

## 可能的问题点

### 假设 1: 页面缓存问题 ⭐ 最可能

**问题**: CDN 或浏览器缓存了包含主题的 HTML 页面

**验证方法**:
```bash
# 检查响应头
curl -I https://hot.uihash.com/ | grep -i cache
```

**当前状态**: 已添加 `Cache-Control: no-store, no-cache` 响应头

**但可能的遗漏**:
1. CDN 可能忽略 `Cache-Control` 头
2. 需要在 CDN 层面配置不缓存
3. 旧的缓存可能还没过期

### 假设 2: Session Token 共享问题

**问题**: 不同用户使用了相同的 session token

**可能原因**:
- Cookie 被意外共享（同一设备不同浏览器 profile）
- Session token 生成有问题（极不可能，使用 `secrets.token_urlsafe(32)`）

**验证方法**:
```sql
-- 检查 session 表中是否有重复的 token
SELECT id, COUNT(*) as cnt FROM user_sessions GROUP BY id HAVING cnt > 1;
```

### 假设 3: user_id 类型不匹配

**问题**: `user_id` 在不同地方使用了不同类型（int vs str）

**代码分析**:
```python
# auth_service.py 返回的是 int
user_info = {"id": user_id, ...}  # user_id 是 int

# page_rendering.py 转换为 str
topics = storage.get_topics_by_user(str(user_id))

# topic_storage.py 使用 str 查询
WHERE user_id = ?  # 参数是 str
```

**潜在问题**: 如果数据库中 `user_id` 存储的是 int，而查询用 str，SQLite 会自动转换，应该没问题。

### 假设 4: 数据库中 user_id 存储错误

**问题**: 创建主题时，存储了错误的 user_id

**验证方法**:
```sql
-- 检查 topic_configs 表中的 user_id 分布
SELECT user_id, COUNT(*) as topic_count, GROUP_CONCAT(name) as topics
FROM topic_configs 
GROUP BY user_id;
```

---

## 诊断步骤

### 步骤 1: 检查服务器响应头

```bash
ssh -p 52222 root@120.77.222.205

# 检查响应头
curl -I http://localhost:8000/ | grep -i cache
```

### 步骤 2: 检查数据库中的主题归属

```bash
cd /root/hotnews

# 进入 Python 环境
python3 -c "
import sqlite3
conn = sqlite3.connect('data/user.db')
cur = conn.execute('''
    SELECT tc.user_id, u.email, u.nickname, COUNT(*) as topic_count, GROUP_CONCAT(tc.name) as topics
    FROM topic_configs tc
    LEFT JOIN users u ON u.id = tc.user_id
    GROUP BY tc.user_id
''')
for row in cur.fetchall():
    print(f'user_id={row[0]}, email={row[1]}, nickname={row[2]}, topics={row[4]}')
"
```

### 步骤 3: 检查 CDN 配置

如果使用了 CDN（如 Cloudflare），需要：
1. 检查 CDN 缓存规则
2. 清除 CDN 缓存
3. 配置 CDN 不缓存动态页面

### 步骤 4: 添加调试日志

在 `page_rendering.py` 中添加更详细的日志：

```python
logger.info(f"Session token: {token[:10]}... for request")
logger.info(f"Validated user: id={user_id}, email={user_info.get('email')}")
logger.info(f"Found {len(topics)} topics for user {user_id}: {[t['name'] for t in topics]}")
```

---

## 修复方案

### 方案 1: 确保页面不被缓存（已实施）

```python
# page_rendering.py - render_viewer_page()
resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private, max-age=0"
resp.headers["Pragma"] = "no-cache"
resp.headers["Expires"] = "0"
resp.headers["Vary"] = "Cookie"
```

### 方案 2: 清除 CDN 缓存

如果使用 Cloudflare 或其他 CDN：
```bash
# Cloudflare API 清除缓存
curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
     -H "Authorization: Bearer {api_token}" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'
```

### 方案 3: 在 Nginx 层面禁用缓存

```nginx
location / {
    # 禁用缓存
    add_header Cache-Control "no-store, no-cache, must-revalidate, private, max-age=0";
    add_header Pragma "no-cache";
    add_header Expires "0";
    
    proxy_pass http://localhost:8000;
    proxy_no_cache 1;
    proxy_cache_bypass 1;
}
```

### 方案 4: 前端验证 user_id

在前端 JS 中添加额外的验证：

```javascript
// 在 topic-tracker.js 中
async function validateTopicOwnership() {
    const response = await fetch('/api/auth/me', { credentials: 'include' });
    const data = await response.json();
    
    if (!data.ok || !data.user) {
        // 未登录，隐藏所有主题栏目
        document.querySelectorAll('[data-category^="topic-"]').forEach(el => {
            el.style.display = 'none';
        });
    }
}
```

---

## 下一步行动

1. **立即**: SSH 到服务器，检查数据库中的主题归属
2. **立即**: 检查 Nginx 配置，确保没有缓存
3. **立即**: 清除所有可能的缓存（CDN、浏览器）
4. **验证**: 让其他用户清除浏览器缓存后重新访问

---

## 验证清单

- [ ] 服务器响应头包含 `Cache-Control: no-store`
- [ ] Nginx 配置禁用缓存
- [ ] CDN 缓存已清除（如果使用）
- [ ] 数据库中主题的 user_id 正确
- [ ] 不同用户登录后看到的主题不同
