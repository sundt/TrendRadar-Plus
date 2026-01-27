# 2026-01-27 修复记录

## 1. 每日AI栏目白屏问题修复

**问题**: 每日AI（knowledge）栏目有时会出现白屏，刷新后还是白屏，需要重新登录才正常

**根因分析**:
- `morning-brief.js` 中的 `_getPane()` 和 `_ensureLayout()` 在 DOM 元素不存在时静默失败
- 当 `renderViewerFromData` 重新渲染 DOM 后，旧的状态变量（`_mbInFlight`）没有重置，导致新的加载请求被跳过
- 异步操作后没有验证 DOM 元素是否仍然存在

**修复方案**:
1. 添加重试机制 - 当 DOM 元素未就绪时，自动重试最多 3 次
2. 在 `renderViewerFromData` patch hook 中重置所有状态变量
3. 异步操作后验证 DOM 元素是否仍然存在
4. 断开旧的 IntersectionObserver 避免内存泄漏
5. 添加调试日志和 `TR.morningBrief.getStatus()` 方法

**文件**: `hotnews/hotnews/web/static/js/src/morning-brief.js`

---

## 2. Chrome 扩展 "message port closed" 错误修复

**问题**: 侧边栏提示 `Unchecked runtime.lastError: The message port closed before a response was received`

**根因**: 消息监听器没有正确返回值，Chrome 认为消息处理是同步的但实际有异步操作

**修复方案**:
- `sidepanel.js`: 消息监听器明确返回 `false`
- `content.js`: 两个消息监听器都添加正确的返回值，switch 语句添加 `default` case

**文件**: 
- `hotnews-summarizer/sidepanel.js`
- `hotnews-summarizer/content.js`

---

## 3. Admin 标签发现通过按钮报错修复

**问题**: 点击标签发现的"通过"按钮报错

**根因**: `tag_candidate_admin.py` 中使用了 `_require_admin` 函数但没有定义

**修复方案**: 添加 `_require_admin` 函数定义，并为 approve/reject 端点添加权限检查

**文件**: `hotnews/hotnews/kernel/admin/tag_candidate_admin.py`

---

## 4. 动态标签快速通过机制

**新增功能**: 为热门话题添加快速通过条件

**规则**:
| 时间窗口 | 最少出现次数 | 最低置信度 |
|---------|------------|-----------|
| 4 小时   | 8 次       | 0.9       |
| 12 小时  | 15 次      | 0.9       |
| 24 小时  | 20 次      | 0.8       |
| 3 天+    | 10 次      | 0.7 (原有) |

**文件**: `hotnews/hotnews/kernel/services/tag_discovery.py`

---

## 5. 快速订阅侧边栏优化

**改进内容**:
1. Tab 顺序调整: 🔥热门 → 💬公众号 → 📡订阅源 → 🏷️标签 → 🔍关键词
2. 新标签优先显示（new_tags 排在 hot_tags 前面）
3. 添加标签标记: NEW（紫色渐变）、🔥（橙红渐变）、相关（蓝色）
4. 顶部 ➕ 按钮改为 NEW 文字标记，且始终显示

**文件**: 
- `hotnews/hotnews/web/static/js/src/subscribe-sidebar.js`
- `hotnews/hotnews/web/static/css/viewer.css`
- `hotnews/hotnews/web/templates/viewer.html`
- `hotnews/hotnews/web/static/js/src/init.js`
- `hotnews/hotnews/web/static/js/src/settings.js`

---

## 6. 移动端 AI 总结阻止页面样式优化

**问题**: 移动端"该网站暂不支持 AI 总结"界面样式简陋

**修复**: 使用和 PC 端一样的 v2 风格，包括居中锁图标、更好的布局和统一的按钮样式

**文件**: `hotnews/hotnews/web/static/js/src/summary-modal.js`

---

## 遇到的错误记录

### 错误 1: Emoji 显示为问号
- **现象**: 关键词 Tab 的 🔑 emoji 显示为 `?`
- **原因**: 文件编码问题，emoji 被转换为 `\xef\xbf\xbd`（UTF-8 replacement character）
- **解决**: 使用 `sed` 命令替换为正确的 emoji 🔍

### 错误 2: strReplace 匹配失败
- **现象**: 多次 strReplace 因为字符串不匹配而失败
- **原因**: 
  1. 文件中的 emoji 已经损坏，与预期字符串不匹配
  2. 空格/缩进不一致
- **解决**: 使用 `xxd` 查看实际字节内容，然后用 `sed` 修复

### 错误 3: localStorage 隐藏逻辑
- **现象**: NEW 标记刷新后消失
- **原因**: `init.js` 中有 localStorage 检查会隐藏标记
- **解决**: 移除 localStorage 检查和点击时的隐藏逻辑
