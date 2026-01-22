# 浏览器缓存清除指南

## 问题描述

更新网站后，某些浏览器仍然显示旧版本的页面或功能不正常（如"我的标签"白屏）。

## 原因

浏览器缓存了旧版本的 JavaScript 和 CSS 文件，即使服务器已更新，浏览器仍在使用缓存的旧文件。

## 解决方案

### 方案1：强制刷新（最简单）

在问题浏览器中按以下快捷键：

| 操作系统 | 快捷键 |
|---------|--------|
| **Windows** | `Ctrl + F5` 或 `Ctrl + Shift + R` |
| **Mac** | `Cmd + Shift + R` |
| **Linux** | `Ctrl + F5` 或 `Ctrl + Shift + R` |

这会绕过缓存，直接从服务器加载最新文件。

### 方案2：清除浏览器缓存

#### Chrome / Edge

1. 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
2. 或者：菜单 → 更多工具 → 清除浏览数据
3. 选择时间范围：**全部时间**
4. 勾选：
   - ✅ 缓存的图片和文件
   - ✅ Cookie 和其他网站数据（可选，会退出登录）
5. 点击"清除数据"

#### Firefox

1. 按 `Ctrl+Shift+Delete` (Windows) 或 `Cmd+Shift+Delete` (Mac)
2. 或者：菜单 → 历史记录 → 清除最近的历史记录
3. 选择时间范围：**全部**
4. 勾选：
   - ✅ 缓存
   - ✅ Cookie（可选，会退出登录）
5. 点击"立即清除"

#### Safari (Mac)

1. 菜单 → Safari → 偏好设置 → 高级
2. 勾选"在菜单栏中显示开发菜单"
3. 开发 → 清空缓存
4. 或者：`Cmd + Option + E`

#### 移动端浏览器

**iOS Safari:**
1. 设置 → Safari → 清除历史记录与网站数据
2. 确认清除

**Android Chrome:**
1. 菜单 → 设置 → 隐私和安全 → 清除浏览数据
2. 选择"缓存的图片和文件"
3. 点击"清除数据"

### 方案3：使用隐私/无痕模式

在隐私模式下打开网站，不会使用缓存：

| 浏览器 | 快捷键 |
|--------|--------|
| **Chrome/Edge** | `Ctrl+Shift+N` (Windows) 或 `Cmd+Shift+N` (Mac) |
| **Firefox** | `Ctrl+Shift+P` (Windows) 或 `Cmd+Shift+P` (Mac) |
| **Safari** | `Cmd+Shift+N` |

### 方案4：禁用缓存（开发者工具）

适合开发和测试：

1. 按 `F12` 打开开发者工具
2. 切换到 **Network** 标签
3. 勾选 **Disable cache**
4. 保持开发者工具打开状态
5. 刷新页面

## 技术解决方案（已实施）

### 自动版本控制

网站已实现自动版本控制，每次更新 JS/CSS 后，URL 会自动添加版本号：

```html
<!-- 旧版本 -->
<script src="/static/js/index.js?v=abc123"></script>

<!-- 新版本（自动更新） -->
<script src="/static/js/index.js?v=def456"></script>
```

### 实现原理

在 `page_rendering.py` 中：

```python
def _get_asset_rev(project_root) -> str:
    """生成资源版本号（基于文件内容的 MD5）"""
    css_path = project_root / "hotnews" / "web" / "static" / "css" / "viewer.css"
    js_path = project_root / "hotnews" / "web" / "static" / "js" / "index.js"
    
    h = hashlib.md5()
    for p in (css_path, js_path):
        if p.exists():
            h.update(p.read_bytes())
    
    return h.hexdigest()  # 返回 MD5 哈希作为版本号
```

**优点**：
- ✅ 文件内容变化时，版本号自动变化
- ✅ 浏览器会自动加载新版本
- ✅ 不需要手动管理版本号

### 验证版本号

查看页面源代码（右键 → 查看网页源代码），找到：

```html
<script type="module" src="/static/js/index.js?v=5806da3abc"></script>
```

如果版本号（`v=` 后面的值）与之前不同，说明已更新。

## 常见问题

### Q1: 为什么强制刷新后还是旧版本？

**A**: 可能是以下原因：
1. **CDN 缓存**：如果使用了 CDN，需要等待 CDN 缓存过期
2. **Service Worker**：某些网站使用 Service Worker 缓存，需要清除
3. **浏览器扩展**：某些扩展可能缓存资源

**解决**：
- 清除浏览器缓存（方案2）
- 使用隐私模式测试（方案3）
- 禁用浏览器扩展后测试

### Q2: 清除缓存后会退出登录吗？

**A**: 取决于清除选项：
- 只清除"缓存的图片和文件"：**不会**退出登录
- 同时清除"Cookie"：**会**退出登录

建议只清除缓存，不清除 Cookie。

### Q3: 为什么其他浏览器正常，只有一个浏览器有问题？

**A**: 每个浏览器有独立的缓存：
- Chrome 和 Edge 虽然都是 Chromium 内核，但缓存是独立的
- 可能是问题浏览器在更新前访问过网站，缓存了旧版本
- 其他浏览器是更新后首次访问，直接加载了新版本

### Q4: 移动端微信浏览器如何清除缓存？

**A**: 微信内置浏览器的缓存清除：
1. **方法1**：退出微信重新登录
2. **方法2**：微信 → 我 → 设置 → 通用 → 存储空间 → 清理缓存
3. **方法3**：卸载重装微信（极端情况）

### Q5: 如何确认已加载最新版本？

**A**: 打开浏览器控制台（F12），查看：

```javascript
// 在 Console 中输入
console.log('[MyTags] Module initialized');
```

如果看到这条日志，说明已加载最新版本的 my-tags.js。

## 预防措施

### 开发者

1. **使用版本号**：所有静态资源都添加版本号参数
2. **设置缓存策略**：
   ```nginx
   # 静态资源短期缓存
   location /static/ {
       expires 1h;
       add_header Cache-Control "public, must-revalidate";
   }
   ```
3. **使用 Service Worker**：实现更精细的缓存控制

### 用户

1. **定期清理**：每月清理一次浏览器缓存
2. **使用最新浏览器**：及时更新浏览器版本
3. **遇到问题先刷新**：看到异常时，先尝试强制刷新

## 相关文件

- `hotnews/web/page_rendering.py` - 版本号生成逻辑
- `hotnews/web/templates/viewer.html` - 资源加载模板
- `docs/fixes/my-tags-white-screen-debug.md` - 白屏问题调试

## 更新日志

- 2026-01-19: 修复 asset_rev 使用错误的 JS 文件路径
- 2026-01-19: 创建浏览器缓存清除指南
