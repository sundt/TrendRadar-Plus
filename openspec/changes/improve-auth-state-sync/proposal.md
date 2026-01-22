# 登录/退出状态同步改进方案

## 问题描述

### 当前问题

用户在登录或退出后，UI 状态无法正确同步，需要手动强制刷新（Ctrl+F5）才能看到正确的登录/退出状态。

### 具体表现

1. **退出登录后**：
   - 点击"退出登录"
   - 页面刷新，但仍显示已登录状态（头像或"我的设置"按钮）
   - 需要强制刷新才能看到"登录 / 注册"按钮

2. **登录后**：
   - 从登录页返回主页
   - 可能仍显示"登录 / 注册"按钮
   - 需要刷新才能看到用户头像

3. **OAuth 登录后**：
   - GitHub/Google/微信登录成功后重定向回主页
   - URL 带有 `?login=timestamp` 参数
   - 但 UI 可能不更新

## 根本原因分析

### 1. 多个独立的状态管理点

当前系统有**三个独立的**登录状态显示位置，互不同步：

#### A. HTML 模板中的按钮（`viewer.html`）
```html
<button class="icon-btn auth-btn" id="authBtn" onclick="handleAuthClick()">
    👤
</button>
```
- 页面加载时调用 `updateAuthButton()` 更新状态
- 只更新按钮的 `title` 和 `class`
- **问题**：退出后不会自动更新

#### B. Auth 模块的用户菜单（`auth.js`）
```javascript
export async function renderUserMenu() {
    // 动态创建用户菜单（头像或登录按钮）
}
```
- 只在页面初始化时调用一次
- **问题**：被注释掉了，从未真正使用

#### C. 退出登录逻辑（`auth.js`）
```javascript
export async function logoutUser() {
    // 调用 API
    // 清除缓存
    // window.location.href = window.location.pathname
}
```
- 使用 `window.location.href` 强制刷新
- **问题**：浏览器可能使用缓存的 HTML，导致状态不更新

### 2. 浏览器缓存问题

```javascript
window.location.href = window.location.pathname;
```

这种刷新方式可能触发：
- **HTTP 缓存**：浏览器使用缓存的 HTML（包含旧的登录状态）
- **Service Worker 缓存**：如果有 SW，可能返回缓存的响应
- **Back/Forward Cache (bfcache)**：浏览器的往返缓存

### 3. Cookie 清除时机问题

```python
# auth_api.py
@router.post("/logout")
async def logout(request: Request):
    logout_session(conn, session_token)
    response = Response(...)
    _clear_session_cookie(response, request)  # 清除 cookie
    return response
```

前端代码：
```javascript
await fetch('/api/auth/logout', { method: 'POST' });
window.location.href = window.location.pathname;  // 立即刷新
```

**时序问题**：
1. 前端调用 `/api/auth/logout`
2. 后端清除 session cookie
3. 前端立即刷新页面
4. **但浏览器可能还没有处理完 Set-Cookie 响应头**
5. 刷新后的请求仍然带着旧的 session cookie
6. 服务器认为用户仍然登录

### 4. 状态检查的竞态条件

```javascript
// viewer.html
async function updateAuthButton() {
    const res = await fetch('/api/auth/me');
    // 更新按钮状态
}

// 页面加载时调用
updateAuthButton();
```

**竞态问题**：
- 退出登录后刷新页面
- `updateAuthButton()` 立即调用 `/api/auth/me`
- 如果 cookie 还没清除，API 返回"已登录"
- 按钮显示错误状态

### 5. HTTPS Cookie Secure 标志问题 ✅ 已修复

> **注意**：此问题已于 2026-01-20 修复，记录于此作为排查参考。

#### 问题描述

在 HTTPS 站点上（如 `https://hot.uihash.com`），如果 session cookie 没有设置 `secure=True`，浏览器会拒绝接受或发送该 cookie，导致登录状态无法持久化。

#### 原始代码问题

```python
# 问题代码
def _set_session_cookie(response, session_token):
    response.set_cookie(
        key="hotnews_session",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=False,  # ❌ HTTPS 站点需要 secure=True
    )
```

#### 修复后代码

```python
def _set_session_cookie(response, session_token, request=None):
    # 根据 X-Forwarded-Proto 头自动检测 HTTPS
    is_secure = os.environ.get("HOTNEWS_SECURE_COOKIES", "0") == "1"
    if request:
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "").lower()
        if forwarded_proto == "https":
            is_secure = True
    
    response.set_cookie(
        key="hotnews_session",
        value=session_token,
        httponly=True,
        samesite="lax",
        secure=is_secure,  # ✅ 自动检测
    )
```

#### Cookie 删除时同样需要匹配属性

```python
def _clear_session_cookie(response, request=None):
    # 删除 cookie 时也必须指定相同的 secure/samesite 属性!
    is_secure = ...  # 同上检测逻辑
    response.delete_cookie(
        key="hotnews_session",
        samesite="lax",
        secure=is_secure,
    )
```

### 6. Nginx 反向代理配置

确保 nginx 正确传递 HTTPS 标志：

```nginx
# /etc/nginx/conf.d/hot.uihash.com.conf
location / {
    proxy_pass http://127.0.0.1:8090;
    proxy_set_header X-Forwarded-Proto $scheme;  # 关键！
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header Host $host;
}
```

## 解决方案

### 方案 A：客户端状态管理（推荐）

**核心思想**：不依赖页面刷新，完全在客户端更新 UI

#### 1. 统一的状态管理器

```javascript
// auth-state.js
class AuthStateManager {
    constructor() {
        this.currentUser = null;
        this.listeners = [];
    }

    // 获取当前用户
    async fetchUser() {
        const res = await fetch('/api/auth/me');
        const data = await res.json();
        this.currentUser = data.ok && data.user ? data.user : null;
        this.notifyListeners();
        return this.currentUser;
    }

    // 订阅状态变化
    subscribe(callback) {
        this.listeners.push(callback);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    // 通知所有监听器
    notifyListeners() {
        this.listeners.forEach(cb => cb(this.currentUser));
    }

    // 退出登录
    async logout() {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.currentUser = null;
        this.notifyListeners();
        
        // 清除缓存
        this.clearUserCaches();
    }

    // 清除用户相关缓存
    clearUserCaches() {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('user') || key.includes('my_tags'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
    }
}

export const authState = new AuthStateManager();
```

#### 2. UI 组件自动更新

```javascript
// auth-ui.js
export class AuthButton {
    constructor(buttonElement) {
        this.button = buttonElement;
        this.unsubscribe = authState.subscribe(user => this.render(user));
    }

    render(user) {
        if (user) {
            // 显示用户头像/菜单
            this.button.innerHTML = `
                <div class="user-avatar" onclick="toggleUserDropdown()">
                    ${user.nickname?.[0]?.toUpperCase() || '?'}
                </div>
                <div class="user-dropdown" id="userDropdown">
                    <div class="dropdown-item user-info-item">${user.nickname || user.email}</div>
                    <div class="dropdown-divider"></div>
                    <a href="/api/user/preferences/page" class="dropdown-item">⚙️ 我的设置</a>
                    <div class="dropdown-item" onclick="handleLogout()">🚪 退出登录</div>
                </div>
            `;
        } else {
            // 显示登录按钮
            this.button.innerHTML = `
                <a href="/api/auth/page" class="login-btn">登录 / 注册</a>
            `;
        }
    }

    destroy() {
        this.unsubscribe();
    }
}
```

#### 3. 退出登录流程

```javascript
// auth-actions.js
export async function handleLogout() {
    // 1. 显示加载状态
    showLoadingOverlay('正在退出...');

    try {
        // 2. 调用退出 API（带超时）
        await Promise.race([
            authState.logout(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout')), 5000)
            )
        ]);

        // 3. 等待一小段时间确保 cookie 清除
        await new Promise(resolve => setTimeout(resolve, 100));

        // 4. UI 已经通过 authState 自动更新
        hideLoadingOverlay();

        // 5. 显示成功提示
        showToast('已退出登录', 'success');

        // 6. 如果在需要登录的页面，跳转到首页
        if (window.location.pathname.includes('/preferences')) {
            window.location.href = '/';
        }

    } catch (error) {
        hideLoadingOverlay();
        showToast('退出失败，请重试', 'error');
        console.error('[Auth] Logout failed:', error);
    }
}
```

#### 4. 登录后的状态同步

```javascript
// 检测 OAuth 登录回调
if (window.location.search.includes('login=')) {
    // 强制刷新用户状态
    await authState.fetchUser();
    
    // 清除 URL 参数
    const url = new URL(window.location);
    url.searchParams.delete('login');
    window.history.replaceState({}, '', url);
}
```

### 方案 B：服务端强制刷新（备选）

如果方案 A 实现复杂，可以使用更激进的刷新策略：

#### 1. 退出后强制无缓存刷新

```javascript
export async function logoutUser() {
    await fetch('/api/auth/logout', { method: 'POST' });
    
    // 清除缓存
    clearUserCaches();
    
    // 等待 cookie 清除
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 强制无缓存刷新
    window.location.href = window.location.pathname + '?_t=' + Date.now();
}
```

#### 2. 服务端设置 Cache-Control

```python
# server.py
@app.get("/")
async def viewer(...):
    response = templates.TemplateResponse(...)
    
    # 禁用缓存
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    return response
```

#### 3. 退出后清除所有缓存

```javascript
// 使用 Cache API 清除所有缓存
if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
}

// 强制刷新
window.location.reload(true); // 已废弃，但某些浏览器仍支持
```

### 方案 C：混合方案（最佳实践）

结合方案 A 和 B 的优点：

1. **正常情况**：使用客户端状态管理（方案 A）
2. **降级处理**：如果状态同步失败，使用强制刷新（方案 B）

```javascript
export async function handleLogout() {
    try {
        // 尝试客户端状态管理
        await authState.logout();
        
        // 验证状态是否正确
        const checkRes = await fetch('/api/auth/me');
        const checkData = await checkRes.json();
        
        if (checkData.ok && checkData.user) {
            // 状态同步失败，降级到强制刷新
            console.warn('[Auth] State sync failed, forcing reload');
            window.location.href = window.location.pathname + '?_t=' + Date.now();
        } else {
            // 状态同步成功
            showToast('已退出登录', 'success');
        }
    } catch (error) {
        // 出错时强制刷新
        window.location.href = window.location.pathname + '?_t=' + Date.now();
    }
}
```

## 实现计划

### Phase 0: 基础设施修复 ✅ 已完成

| 任务 | 时间 | 状态 |
|------|------|------|
| 修复 HTTPS cookie secure 标志 | 0.5h | ✅ 已完成 |
| 修复 logout cookie 删除属性匹配 | 0.5h | ✅ 已完成 |
| 添加 cache-busting 登录/退出参数 | 0.5h | ✅ 已完成 |
| 验证 nginx X-Forwarded-Proto 配置 | 0.5h | 待验证 |

### Phase 1: 核心状态管理（1-2 天）

1. **创建 `auth-state.js`**
   - 实现 `AuthStateManager` 类
   - 提供状态订阅机制
   - 处理登录/退出逻辑

2. **重构 `auth.js`**
   - 使用 `AuthStateManager`
   - 移除直接的 DOM 操作
   - 改为响应式更新

3. **更新 `viewer.html`**
   - 移除内联的 `updateAuthButton()`
   - 使用新的状态管理器

### Phase 2: UI 组件化（1 天）

1. **创建 `AuthButton` 组件**
   - 自动订阅状态变化
   - 响应式渲染

2. **添加加载状态**
   - 退出时显示 loading overlay
   - 防止用户重复点击

3. **添加 Toast 提示**
   - 成功/失败提示
   - 改善用户体验

### Phase 3: 降级处理（0.5 天）

1. **添加状态验证**
   - 退出后验证状态
   - 失败时强制刷新

2. **添加超时处理**
   - API 调用超时
   - 自动降级

### Phase 4: 测试与优化（1 天）

1. **功能测试**
   - 登录/退出流程
   - 多标签页同步
   - 移动端测试

2. **性能优化**
   - 减少不必要的 API 调用
   - 优化状态更新频率

## 用户体验改进

### 改进前

```
用户点击"退出登录"
  ↓
页面刷新
  ↓
仍显示已登录状态 ❌
  ↓
用户困惑，手动强制刷新
  ↓
显示正确状态 ✓
```

### 改进后

```
用户点击"退出登录"
  ↓
显示 "正在退出..." loading
  ↓
调用 API（200ms）
  ↓
UI 自动更新为未登录状态 ✓
  ↓
显示 "已退出登录" 提示
  ↓
完成（无需刷新）
```

## 技术优势

### 方案 A（客户端状态管理）

**优点**：
- ✅ 无需页面刷新，体验流畅
- ✅ 状态更新即时
- ✅ 支持多组件同步
- ✅ 易于测试和维护

**缺点**：
- ⚠️ 实现复杂度较高
- ⚠️ 需要重构现有代码

### 方案 B（强制刷新）

**优点**：
- ✅ 实现简单
- ✅ 兼容性好
- ✅ 状态一定正确

**缺点**：
- ❌ 用户体验差（页面闪烁）
- ❌ 可能仍有缓存问题
- ❌ 加载时间长

### 方案 C（混合方案）

**优点**：
- ✅ 结合两者优点
- ✅ 有降级方案
- ✅ 可靠性高

**缺点**：
- ⚠️ 代码复杂度最高

## 推荐方案

**推荐使用方案 C（混合方案）**，理由：

1. **用户体验最佳**：正常情况下无需刷新
2. **可靠性最高**：有降级方案保底
3. **渐进式实现**：可以先实现方案 A，再添加降级逻辑
4. **易于调试**：有详细的日志和状态验证

## 成功指标

1. **功能指标**
   - ✅ 退出登录后，UI 立即更新（< 500ms）
   - ✅ 无需手动刷新
   - ✅ 状态同步成功率 > 99%

2. **用户体验指标**
   - ✅ 无页面闪烁
   - ✅ 有明确的加载提示
   - ✅ 有成功/失败反馈

3. **技术指标**
   - ✅ 代码可维护性提升
   - ✅ 测试覆盖率 > 80%
   - ✅ 无明显性能下降

## 风险与缓解

### 风险 1：浏览器兼容性

**风险**：某些旧浏览器可能不支持新的 API
**缓解**：添加 polyfill，降级到方案 B

### 风险 2：多标签页同步

**风险**：用户在多个标签页打开网站，退出后其他标签页状态不同步
**缓解**：使用 `BroadcastChannel` 或 `localStorage` 事件同步状态

**具体实现**：

```javascript
// auth-state.js
const authChannel = new BroadcastChannel('hotnews_auth');

authChannel.onmessage = (event) => {
    if (event.data.type === 'logout') {
        authState.currentUser = null;
        authState.notifyListeners();
    } else if (event.data.type === 'login') {
        authState.fetchUser();  // 重新获取用户信息
    }
};

// 退出时广播到其他标签页
async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    authChannel.postMessage({ type: 'logout' });
    // ...
}
```

### 风险 3：实现复杂度

**风险**：方案 C 实现复杂，可能引入新 bug
**缓解**：
- 充分测试
- 分阶段实施
- 保留回滚方案

## 下一步

1. **评审方案**：团队讨论选择最终方案
2. **创建 Spec**：详细设计文档和任务分解
3. **原型开发**：先实现核心功能验证可行性
4. **完整实现**：按 Phase 逐步实施
5. **测试部署**：充分测试后上线

## 参考资料

- [MDN: BroadcastChannel API](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)
- [MDN: Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache)
- [HTTP Caching Best Practices](https://web.dev/http-cache/)
