# 登录/注册功能设置总结

## ✅ 已完成的修改

### 1. 前端登录按钮显示
- **文件**: `hotnews/web/static/js/src/auth.js`
- **修改**: 
  - 添加了 `renderUserMenu()` 函数来渲染登录按钮
  - 添加了错误处理，当 API 返回 404/500 时优雅降级
  - 已集成到 `index.js` 并在页面加载时自动调用

### 2. 后端 API 修复
- **文件**: `hotnews/kernel/auth/auth_api.py`
- **修改**:
  - 修改 `/api/auth/me` 端点，未登录时返回 `{"ok": false, "user": null}` 而不是 401 错误
  - 添加了异常处理，防止服务器崩溃

### 3. 隐藏邮箱注册方式
- **文件**: `hotnews/kernel/templates/auth.html`
- **修改**:
  - 隐藏了邮箱登录/注册表单
  - 只保留第三方登录（GitHub 和 Google）
  - 更新了页面标题为"使用第三方账号登录"
  - 所有邮箱相关代码已注释，方便将来启用

### 4. 依赖安装
- **安装**: `aiohttp-socks` 包
- **原因**: 解决 kernel 模块导入失败的问题

## 🔧 需要的操作

### 重启服务器（重要！）
```bash
# 停止当前服务器
# 然后重新启动
python -m hotnews.web.server --host 0.0.0.0 --port 8090
```

### 清除浏览器缓存
1. 访问 `http://localhost:8090/`
2. 按 `Ctrl+Shift+R` (Windows/Linux) 或 `Cmd+Shift+R` (Mac) 强制刷新
3. 或者按 F12 打开开发者工具，右键刷新按钮，选择"清空缓存并硬性重新加载"

## 📋 功能说明

### 登录按钮
- **位置**: 页面右上角，搜索按钮旁边
- **样式**: 蓝色按钮，文字"登录 / 注册"
- **点击**: 跳转到 `/api/auth/page` 登录页面

### 登录页面
- **URL**: `http://localhost:8090/api/auth/page`
- **功能**: 
  - ✅ 微信扫码登录（新增）
  - ✅ GitHub OAuth 登录
  - ✅ Google OAuth 登录
  - ❌ 邮箱登录（已隐藏）
  - ❌ 邮箱注册（已隐藏）

### 用户菜单（登录后）
- 显示用户头像（首字母）
- 点击显示下拉菜单：
  - 用户信息
  - 我的设置
  - 退出登录

## 🔐 OAuth 配置

要启用第三方登录，需要设置环境变量：

### 微信 OAuth（新增）
```bash
export WECHAT_OAUTH_APP_ID="your_wechat_app_id"
export WECHAT_OAUTH_APP_SECRET="your_wechat_app_secret"
export HOTNEWS_BASE_URL="http://localhost:8090"  # 或你的域名
```

**详细配置**: 请查看 `WECHAT_OAUTH_SETUP.md`

### GitHub OAuth
```bash
export GITHUB_OAUTH_CLIENT_ID="your_client_id"
export GITHUB_OAUTH_CLIENT_SECRET="your_client_secret"
export HOTNEWS_BASE_URL="http://localhost:8090"  # 或你的域名
```

### Google OAuth
```bash
export GOOGLE_OAUTH_CLIENT_ID="your_client_id"
export GOOGLE_OAUTH_CLIENT_SECRET="your_client_secret"
export HOTNEWS_BASE_URL="http://localhost:8090"  # 或你的域名
```

### 中国服务器（需要代理访问 Google）
```bash
export HOTNEWS_OAUTH_PROXY="http://your-proxy:port"
```

## 🔄 如何重新启用邮箱登录

如果将来需要启用邮箱登录/注册：

1. 编辑 `hotnews/kernel/templates/auth.html`
2. 取消 HTML 中的注释（搜索 `<!-- 邮箱登录/注册已隐藏`）
3. 取消 JavaScript 中的注释（搜索 `// 邮箱登录/注册功能已禁用`）
4. 重启服务器

## 🐛 故障排查

### 问题：登录按钮不显示
1. 检查浏览器控制台（F12）是否有错误
2. 确认 `/api/auth/me` 返回正常（不是 500 错误）
3. 确认服务器已重启
4. 清除浏览器缓存并强制刷新

### 问题：API 返回 500 错误
1. 检查服务器日志
2. 确认 `aiohttp-socks` 已安装
3. 确认 `request.app.state.project_root` 已设置
4. 重启服务器

### 问题：OAuth 登录失败
1. 检查环境变量是否正确设置
2. 检查 OAuth 应用的回调 URL 配置
3. 检查服务器日志中的详细错误信息

## 📝 文件清单

### 修改的文件
- `hotnews/web/static/js/src/auth.js` - 前端登录按钮逻辑
- `hotnews/kernel/auth/auth_api.py` - 后端 API（添加微信 OAuth）
- `hotnews/kernel/templates/auth.html` - 登录页面（隐藏邮箱登录，添加微信登录）

### 构建的文件
- `hotnews/web/static/js/index.js` - 已重新构建（包含 auth.js）

### 需要重启
- Web 服务器（端口 8090）

## ✨ 测试步骤

1. 重启服务器
2. 访问 `http://localhost:8090/`
3. 查看右上角是否有"登录 / 注册"按钮
4. 点击按钮，应该跳转到登录页面
5. 登录页面应该显示三个登录选项：
   - 微信登录（绿色，微信图标）
   - GitHub（黑色，GitHub 图标）
   - Google（彩色，Google 图标）
6. （可选）配置 OAuth 并测试登录流程

---

**最后更新**: 2026-01-19
**状态**: ✅ 完成（已添加微信登录），等待服务器重启测试
