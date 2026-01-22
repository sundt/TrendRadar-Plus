# OAuth 用户统计查询指南

## 快速查询命令

### 查询总体统计

```bash
docker exec hotnews-viewer python -c "
import sqlite3
conn = sqlite3.connect('/app/output/user.db')

print('=== 用户统计 ===')
print(f'总用户数: {conn.execute(\"SELECT COUNT(*) FROM users\").fetchone()[0]}')
print(f'OAuth 用户: {conn.execute(\"SELECT COUNT(DISTINCT user_id) FROM user_auth_methods\").fetchone()[0]}')
print(f'匿名用户: {conn.execute(\"SELECT COUNT(DISTINCT user_id) FROM user_identities WHERE identity_type = \\\"anon_cookie\\\"\").fetchone()[0]}')
print(f'RSS 订阅用户: {conn.execute(\"SELECT COUNT(DISTINCT user_id) FROM user_rss_subscriptions\").fetchone()[0]}')
"
```

### 查询 OAuth 认证方式分布

```bash
docker exec hotnews-viewer python -c "
import sqlite3
conn = sqlite3.connect('/app/output/user.db')

print('=== OAuth 认证方式 ===')
cur = conn.execute('SELECT auth_type, COUNT(DISTINCT user_id) as cnt FROM user_auth_methods GROUP BY auth_type ORDER BY cnt DESC')
for row in cur.fetchall():
    print(f'{row[0]}: {row[1]} 人')
"
```

### 查询最近登录的 OAuth 用户

```bash
docker exec hotnews-viewer python -c "
import sqlite3
from datetime import datetime
conn = sqlite3.connect('/app/output/user.db')

print('=== 最近 OAuth 登录 ===')
cur = conn.execute('''
    SELECT u.id, u.email, u.nickname, a.auth_type, a.last_used_at
    FROM users u
    JOIN user_auth_methods a ON u.id = a.user_id
    ORDER BY a.last_used_at DESC
    LIMIT 10
''')
for row in cur.fetchall():
    ts = datetime.fromtimestamp(row[4]).strftime('%Y-%m-%d %H:%M:%S')
    print(f'User {row[0]}: {row[1] or row[2]} ({row[3]}) - {ts}')
"
```

### 查询活跃 Session

```bash
docker exec hotnews-viewer python -c "
import sqlite3
import time
conn = sqlite3.connect('/app/output/user.db')

now = int(time.time())
cur = conn.execute('SELECT COUNT(*) FROM user_sessions WHERE expires_at > ?', (now,))
print(f'当前活跃 Session: {cur.fetchone()[0]}')
"
```

## 数据库表结构

### users 表
- `id`: 用户 ID（主键）
- `email`: 邮箱
- `nickname`: 昵称
- `avatar_url`: 头像 URL
- `email_verified`: 邮箱是否验证
- `created_at`: 创建时间
- `last_seen_at`: 最后活跃时间

### user_auth_methods 表
- `user_id`: 用户 ID
- `auth_type`: 认证类型（github, google, wechat, email）
- `auth_id`: OAuth 提供商的用户 ID
- `auth_data`: 认证数据（JSON）
- `created_at`: 创建时间
- `last_used_at`: 最后使用时间

### user_identities 表
- `user_id`: 用户 ID
- `identity_type`: 身份类型（anon_cookie）
- `identity_key`: 身份标识（cookie hash）
- `created_at`: 创建时间
- `last_seen_at`: 最后活跃时间

### user_sessions 表
- `id`: Session Token
- `user_id`: 用户 ID
- `device_info`: 设备信息
- `ip_address`: IP 地址
- `created_at`: 创建时间
- `expires_at`: 过期时间
- `last_active_at`: 最后活跃时间

## 常见问题

### Q: 为什么 OAuth 用户数为 0？

A: 可能的原因：
1. OAuth 功能刚修复，还没有用户登录
2. 用户更倾向于匿名浏览
3. OAuth 登录入口不够明显

### Q: 如何区分真实用户和测试用户？

A: 查看 email 和 nickname 字段，测试用户通常包含 "test" 关键词。

### Q: 如何清理过期的 Session？

```bash
docker exec hotnews-viewer python -c "
from hotnews.web.user_db import get_user_db_conn
from hotnews.kernel.auth.auth_service import cleanup_expired_sessions
from pathlib import Path

conn = get_user_db_conn(Path('/app'))
count = cleanup_expired_sessions(conn)
print(f'清理了 {count} 个过期 Session')
"
```

## 监控建议

1. **每日统计**: 定期查询 OAuth 用户增长趋势
2. **活跃度**: 监控 `last_seen_at` 和 `last_active_at`
3. **认证方式**: 跟踪各 OAuth 提供商的使用情况
4. **Session 管理**: 定期清理过期 Session

## 相关文档

- [OAuth 功能修复记录](../fixes/oauth-bcrypt-fix.md)
- [用户认证 API](../../hotnews/kernel/auth/auth_api.py)
- [用户数据库管理](../../hotnews/web/user_db.py)
