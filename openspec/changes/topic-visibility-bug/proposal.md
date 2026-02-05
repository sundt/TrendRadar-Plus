# 主题可见性 Bug 全面分析报告

## 问题描述

**严重程度**: 🔴 P0 - 严重安全/隐私问题

**现象**: 其他用户登录后，能看到你创建的主题栏目

---

## 🔴 根本原因已确认

**Nginx 缓存配置问题**

```nginx
# /etc/nginx/conf.d/hot.uihash.com.conf
location = / {
    proxy_cache app_cache;
    proxy_cache_valid 200 30s;
    proxy_ignore_headers Cache-Control;  # ⚠️ 这是问题所在！
}
```

**问题**: `proxy_ignore_headers Cache-Control` 导致 Nginx 忽略后端返回的 `Cache-Control: no-store` 头，仍然缓存页面 30 秒。

**结果**: 用户 A 访问页面 → Nginx 缓存包含用户 A 主题的页面 → 用户 B 在 30 秒内访问 → 看到用户 A 的主题

---

## 数据库验证

主题归属是正确的：
- user_id=8394 (微信用户) → 1 个主题 "苹果公司"
- user_id=8434 (chenjk9527@gmail.com) → 2 个主题 "苹果公司"

问题不在数据库，而在 Nginx 缓存。

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

## 修复状态

### ✅ 已完成

1. **Nginx 缓存已禁用** - 首页、/viewer、/index.html 的缓存已注释掉
2. **Nginx 已重载** - 配置生效
3. **后端响应头正确** - 返回 `Cache-Control: no-store, no-cache`

### ⚠️ 待处理

**阿里云 CDN 缓存**

响应头显示有 CDN 层：
```
via: cache28.l2eu95-4[255,0], kunlun10.cn9041[281,0]
```

需要在阿里云 CDN 控制台配置：
1. 登录阿里云 CDN 控制台
2. 找到 hot.uihash.com 域名
3. 配置缓存规则：对 `/` 和 `/viewer` 路径设置"不缓存"
4. 或者配置"遵循源站 Cache-Control 头"

---

## 修复方案

### ✅ 方案 1: 修改 Nginx 配置（推荐）

修改 `/etc/nginx/conf.d/hot.uihash.com.conf`，为首页添加基于 Cookie 的缓存键：

```nginx
# 首页 - 按用户 Cookie 分别缓存
location = / {
    proxy_pass http://127.0.0.1:8090/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 按 Cookie 分别缓存（不同用户不同缓存）
    proxy_cache app_cache;
    proxy_cache_key "$scheme$request_method$host$request_uri$cookie_hotnews_session";
    proxy_cache_valid 200 30s;
    proxy_cache_use_stale error timeout updating http_500 http_502 http_503 http_504;
    proxy_cache_background_update on;
    proxy_cache_lock on;
    # 移除 proxy_ignore_headers，尊重后端的 Cache-Control
    # proxy_ignore_headers Cache-Control;  # 删除这行
    add_header X-Cache-Status $upstream_cache_status;
}
```

**或者完全禁用首页缓存**（更安全）：

```nginx
location = / {
    proxy_pass http://127.0.0.1:8090/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # 禁用缓存
    proxy_no_cache 1;
    proxy_cache_bypass 1;
    add_header X-Cache-Status "BYPASS";
}
```

### 执行命令

```bash
# SSH 到服务器
ssh -p 52222 root@120.77.222.205

# 备份配置
cp /etc/nginx/conf.d/hot.uihash.com.conf /etc/nginx/conf.d/hot.uihash.com.conf.bak.$(date +%Y%m%d%H%M%S)

# 编辑配置
vim /etc/nginx/conf.d/hot.uihash.com.conf

# 测试配置
nginx -t

# 重载 Nginx
systemctl reload nginx

# 清除缓存（如果有）
rm -rf /var/cache/nginx/*
```

---

## 下一步行动

1. **立即**: 修改 Nginx 配置，禁用首页缓存或按 Cookie 分别缓存
2. **立即**: 重载 Nginx 配置
3. **验证**: 不同用户登录后检查是否只能看到自己的主题

---

## 验证清单

- [x] Nginx 配置已修改（禁用首页缓存）
- [x] Nginx 配置测试通过 (`nginx -t`)
- [x] Nginx 已重载 (`systemctl reload nginx`)
- [x] 后端返回正确的 Cache-Control 头
- [ ] 阿里云 CDN 配置不缓存首页（需要手动配置）
- [ ] 用户 A 登录后只能看到自己的主题
- [ ] 用户 B 登录后只能看到自己的主题
- [ ] 未登录用户看不到任何主题
