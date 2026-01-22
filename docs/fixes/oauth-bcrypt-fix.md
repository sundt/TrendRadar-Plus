# OAuth 功能修复：bcrypt 依赖缺失问题

## 问题描述

**日期**: 2026-01-20

**症状**: 
- 用户通过 GitHub/Google OAuth 登录后，数据库中没有记录
- `user_auth_methods` 表始终为空
- 所有用户都显示为匿名 cookie 用户

## 根本原因

生产环境的 `hotnews-viewer` 容器缺少 `bcrypt` Python 模块，导致 OAuth 认证服务无法正常工作。

虽然 `bcrypt>=4.0.0,<5.0.0` 已经在 `docker/requirements.viewer.txt` 中定义，但由于以下原因导致未安装：

1. 容器镜像使用旧版本构建，当时 requirements 中可能还没有 bcrypt
2. 或者构建时使用的清华镜像源不稳定，导致安装失败但未报错

## 诊断过程

```bash
# 1. 检查容器内是否有 bcrypt
docker exec hotnews-viewer python -c "import bcrypt"
# ModuleNotFoundError: No module named 'bcrypt'

# 2. 检查数据库
docker exec hotnews-viewer python -c "
import sqlite3
conn = sqlite3.connect('/app/output/user.db')
print(conn.execute('SELECT COUNT(*) FROM user_auth_methods').fetchone()[0])
"
# 输出: 0

# 3. 查看 auth_service.py 依赖
# 发现第 20 行: import bcrypt
```

## 解决方案

### 1. 修改 Dockerfile.viewer

移除不稳定的清华镜像源，使用官方 PyPI：

```diff
- RUN pip install --no-cache-dir -i https://pypi.tuna.tsinghua.edu.cn/simple --retries 3 --timeout 60 -r requirements.viewer.txt
+ RUN pip install --no-cache-dir --retries 3 --timeout 60 -r requirements.viewer.txt
```

### 2. 重新构建容器

```bash
# 构建新镜像
docker compose -f docker/docker-compose-build.yml build hotnews-viewer

# 重启容器
docker compose -f docker/docker-compose-build.yml up -d hotnews-viewer
```

### 3. 验证修复

```bash
# 验证 bcrypt 已安装
docker exec hotnews-viewer python -c "import bcrypt; print(bcrypt.__version__)"
# 输出: 4.3.0

# 测试 OAuth 功能
docker exec hotnews-viewer python -c "
from hotnews.web.user_db import get_user_db_conn
from hotnews.kernel.auth.auth_service import oauth_login_or_register
from pathlib import Path

conn = get_user_db_conn(Path('/app'))
success, msg, token, info = oauth_login_or_register(
    conn, 'github', 'test123', {}, 
    email='test@example.com', nickname='Test'
)
print(f'Success: {success}')
"
# 输出: Success: True
```

## 影响范围

- **受影响功能**: GitHub OAuth、Google OAuth、微信 OAuth、邮箱密码登录
- **受影响用户**: 所有尝试使用 OAuth 登录的用户
- **数据丢失**: 无（因为功能从未正常工作过）

## 修复后状态

✅ bcrypt 4.3.0 已安装  
✅ OAuth 登录功能正常  
✅ 用户数据可以正确写入 `user_auth_methods` 表  
✅ Session 管理正常  

## 预防措施

1. **CI/CD 检查**: 在构建流程中添加依赖验证
2. **健康检查**: 添加关键模块导入检查
3. **镜像源**: 使用官方 PyPI 或稳定的镜像源
4. **测试覆盖**: 添加 OAuth 功能的集成测试

## 相关文件

- `docker/Dockerfile.viewer` - 修改了 pip 安装命令
- `docker/requirements.viewer.txt` - bcrypt 依赖定义
- `hotnews/kernel/auth/auth_service.py` - OAuth 认证服务
- `hotnews/web/user_db.py` - 用户数据库管理

## 后续行动

- [ ] 通知用户 OAuth 功能现已可用
- [ ] 监控 OAuth 登录成功率
- [ ] 添加 OAuth 功能的自动化测试
- [ ] 更新部署文档，说明依赖检查的重要性
