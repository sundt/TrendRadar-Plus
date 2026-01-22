# 微信登录快速开始

## 🚀 5 分钟快速配置

### 1️⃣ 获取微信开放平台凭证

访问 https://open.weixin.qq.com/ 并创建网站应用，获取：
- AppID
- AppSecret

### 2️⃣ 设置环境变量

```bash
export WECHAT_OAUTH_APP_ID="wx1234567890abcdef"
export WECHAT_OAUTH_APP_SECRET="your_secret_here"
export HOTNEWS_BASE_URL="http://localhost:8090"
```

### 3️⃣ 配置回调域

在微信开放平台设置授权回调域：
```
localhost:8090
```

### 4️⃣ 重启服务器

```bash
python -m hotnews.web.server --host 0.0.0.0 --port 8090
```

### 5️⃣ 测试

访问 `http://localhost:8090/api/auth/page`，点击"微信登录"

---

## ⚠️ 本地开发注意事项

微信不支持 localhost 直接测试，需要：

**选项 A: 使用 ngrok**
```bash
ngrok http 8090
# 使用 ngrok 提供的域名配置微信回调域
```

**选项 B: 生产环境测试**
- 部署到真实服务器
- 使用真实域名

---

## 📖 完整文档

详细配置请查看：`WECHAT_OAUTH_SETUP.md`
