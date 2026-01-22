# 微信扫码登录配置指南

## 📋 前提条件

要使用微信扫码登录，你需要：

1. **微信开放平台账号**
   - 访问：https://open.weixin.qq.com/
   - 注册并完成开发者资质认证（需要企业资质）

2. **创建网站应用**
   - 在微信开放平台创建"网站应用"
   - 填写网站信息和授权回调域
   - 等待审核通过（通常需要1-3个工作日）

## 🔧 配置步骤

### 1. 获取 AppID 和 AppSecret

在微信开放平台的网站应用详情页面，你可以找到：
- **AppID**: 应用唯一标识
- **AppSecret**: 应用密钥（注意保密）

### 2. 配置授权回调域

在微信开放平台设置授权回调域：

**开发环境**:
```
localhost:8090
```

**生产环境**:
```
yourdomain.com
```

⚠️ **重要**: 
- 不要包含 `http://` 或 `https://`
- 不要包含端口号（生产环境）
- 不要包含路径

### 3. 设置环境变量

在服务器启动前设置以下环境变量：

```bash
# 微信开放平台配置
export WECHAT_OAUTH_APP_ID="your_wechat_app_id"
export WECHAT_OAUTH_APP_SECRET="your_wechat_app_secret"

# 应用基础 URL（用于 OAuth 回调）
export HOTNEWS_BASE_URL="http://localhost:8090"  # 开发环境
# export HOTNEWS_BASE_URL="https://yourdomain.com"  # 生产环境
```

或者在 `.env` 文件中配置：

```env
WECHAT_OAUTH_APP_ID=your_wechat_app_id
WECHAT_OAUTH_APP_SECRET=your_wechat_app_secret
HOTNEWS_BASE_URL=http://localhost:8090
```

### 4. 重启服务器

```bash
python -m hotnews.web.server --host 0.0.0.0 --port 8090
```

## 🎨 登录页面

访问 `http://localhost:8090/api/auth/page`，你会看到三个登录选项：

1. **微信登录** - 绿色按钮，微信图标
2. **GitHub** - 黑色按钮，GitHub 图标
3. **Google** - 彩色按钮，Google 图标

## 🔄 登录流程

### 用户视角

1. 用户点击"微信登录"按钮
2. 跳转到微信扫码页面
3. 用户使用微信扫描二维码
4. 在手机上确认授权
5. 自动跳转回网站并完成登录

### 技术流程

```
用户点击登录
    ↓
GET /api/auth/oauth/wechat
    ↓
重定向到微信授权页面
https://open.weixin.qq.com/connect/qrconnect?appid=...
    ↓
用户扫码授权
    ↓
微信回调
GET /api/auth/oauth/wechat/callback?code=...
    ↓
后端用 code 换取 access_token
POST https://api.weixin.qq.com/sns/oauth2/access_token
    ↓
获取用户信息
GET https://api.weixin.qq.com/sns/userinfo
    ↓
创建/更新用户记录
    ↓
设置 session cookie
    ↓
重定向到首页
```

## 📊 数据库存储

用户信息存储在 `users` 表中：

- **auth_type**: `"wechat"`
- **auth_id**: 微信的 `unionid`（如果有）或 `openid`
- **nickname**: 微信昵称
- **avatar_url**: 微信头像 URL
- **email**: `NULL`（微信不提供邮箱）

## 🔐 UnionID vs OpenID

### OpenID
- 用户在**单个应用**下的唯一标识
- 不同应用下，同一用户的 OpenID 不同

### UnionID
- 用户在**同一开放平台账号下所有应用**的唯一标识
- 需要开发者账号绑定多个应用才会返回
- 推荐使用 UnionID 作为用户唯一标识

代码中的处理：
```python
# 优先使用 unionid，如果没有则使用 openid
auth_id = unionid if unionid else openid
```

## 🐛 常见问题

### 1. 提示"WeChat OAuth not configured"

**原因**: 环境变量未设置

**解决**:
```bash
export WECHAT_OAUTH_APP_ID="your_app_id"
export WECHAT_OAUTH_APP_SECRET="your_app_secret"
```

### 2. 回调时提示"redirect_uri 参数错误"

**原因**: 回调域名未在微信开放平台配置

**解决**:
1. 登录微信开放平台
2. 进入网站应用详情
3. 修改授权回调域
4. 确保域名与 `HOTNEWS_BASE_URL` 一致

### 3. 获取用户信息失败

**原因**: access_token 过期或无效

**解决**:
- 检查服务器日志中的详细错误信息
- 确认 AppSecret 正确
- 确认应用已审核通过

### 4. 本地开发无法使用微信登录

**原因**: 微信要求使用真实域名，不支持 localhost

**解决方案**:

**方案 A: 使用内网穿透**
```bash
# 使用 ngrok
ngrok http 8090

# 或使用 frp、localtunnel 等工具
```

然后在微信开放平台配置 ngrok 提供的域名。

**方案 B: 修改 hosts 文件**
```bash
# /etc/hosts (Linux/Mac) 或 C:\Windows\System32\drivers\etc\hosts (Windows)
127.0.0.1 dev.yourdomain.com
```

然后访问 `http://dev.yourdomain.com:8090`

## 📱 测试建议

### 开发环境测试

1. 使用内网穿透工具（如 ngrok）
2. 在微信开放平台配置临时域名
3. 使用微信扫码测试

### 生产环境部署

1. 确保使用 HTTPS（微信强烈推荐）
2. 配置正确的域名
3. 设置正确的 `HOTNEWS_BASE_URL`

## 🔗 相关文档

- [微信开放平台](https://open.weixin.qq.com/)
- [网站应用微信登录开发指南](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Wechat_Login.html)
- [授权后接口调用（UnionID）](https://developers.weixin.qq.com/doc/oplatform/Website_App/WeChat_Login/Authorized_Interface_Calling_UnionID.html)

## ✅ 验证配置

运行以下命令验证配置：

```bash
# 检查环境变量
echo $WECHAT_OAUTH_APP_ID
echo $WECHAT_OAUTH_APP_SECRET
echo $HOTNEWS_BASE_URL

# 测试 OAuth 启动端点
curl http://localhost:8090/api/auth/oauth/wechat

# 应该返回 302 重定向到微信授权页面
```

## 🎯 下一步

配置完成后：

1. 重启服务器
2. 访问 `http://localhost:8090/api/auth/page`
3. 点击"微信登录"按钮
4. 扫码测试登录流程

---

**最后更新**: 2026-01-19
**状态**: ✅ 代码已完成，等待配置测试
