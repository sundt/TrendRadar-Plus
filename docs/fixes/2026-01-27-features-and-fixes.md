# 2026-01-27 新增功能与修复记录

## 新增功能

### 1. 我的关注卡片右键菜单
**文件**: `hotnews/web/static/js/src/platform-reorder.js`

在"我的关注"页面，右键点击卡片标题显示完整菜单：
- ⬆️ 置顶
- ⬇️ 置底
- ⚙️ 编辑顺序
- 🚫 取消关注（红色，仅 my-tags 页面显示）

点击"取消关注"后：
- 调用 `/api/user/preferences/tag-settings` API
- 卡片淡出动画消失
- 清除本地缓存
- 显示 toast 提示

### 2. 动态标签快速通过机制
**文件**: `hotnews/kernel/services/tag_discovery.py`

为热门话题添加快速通过条件：

| 时间窗口 | 最少出现次数 | 最低置信度 |
|---------|------------|-----------|
| 4 小时   | 8 次       | 0.9       |
| 12 小时  | 15 次      | 0.9       |
| 24 小时  | 20 次      | 0.8       |
| 3 天+    | 10 次      | 0.7 (原有) |

### 3. NEW 标签推荐列表优化
**文件**: `hotnews/kernel/user/preferences_api.py`, `hotnews/web/static/js/src/subscribe-sidebar.js`

- 从只显示 5 个改为最多显示 20 个
- 使用与晋升相同的标准筛选候选标签
- 显示格式改为：`标签名 NEW 发现于MM-DD`

### 4. 快速订阅侧边栏优化
**文件**: `hotnews/web/static/js/src/subscribe-sidebar.js`, `hotnews/web/static/css/viewer.css`

- Tab 顺序调整: 🔥热门 → 💬公众号 → 📡订阅源 → 🏷️标签 → 🔍关键词
- 新标签优先显示（new_tags 排在 hot_tags 前面）
- 添加标签标记: NEW（紫色渐变）、🔥（橙红渐变）、相关（蓝色）
- 顶部 ➕ 按钮改为 NEW 文字标记，且始终显示

---

## Bug 修复

### 1. 每日AI栏目白屏问题
**文件**: `hotnews/web/static/js/src/morning-brief.js`

**问题**: 每日AI（knowledge）栏目有时会出现白屏，刷新后还是白屏

**修复**:
- 添加重试机制 - 当 DOM 元素未就绪时，自动重试最多 3 次
- 在 `renderViewerFromData` patch hook 中重置所有状态变量
- 异步操作后验证 DOM 元素是否仍然存在
- 断开旧的 IntersectionObserver 避免内存泄漏

### 2. 标签晋升 API 参数解析问题
**文件**: `hotnews/kernel/admin/tag_candidate_admin.py`

**问题**: 前端发送 JSON 对象 `{"icon": "🏷️"}`，但 API 使用 `Body("🏷️")` 期望纯字符串

**修复**: 改用 Pydantic 模型解析请求体：
```python
class ApproveRequest(BaseModel):
    icon: str = "🏷️"
```

### 3. Admin 标签发现通过按钮报错
**文件**: `hotnews/kernel/admin/tag_candidate_admin.py`

**问题**: 点击标签发现的"通过"按钮报错，`_require_admin` 函数未定义

**修复**: 添加 `_require_admin` 函数定义

### 4. Chrome 扩展 "message port closed" 错误
**文件**: `hotnews-summarizer/sidepanel.js`, `hotnews-summarizer/content.js`

**问题**: 侧边栏提示 `The message port closed before a response was received`

**修复**: 消息监听器明确返回 `false`，switch 语句添加 `default` case

### 5. 移动端 AI 总结阻止页面样式
**文件**: `hotnews/web/static/js/src/summary-modal.js`

**问题**: 移动端"该网站暂不支持 AI 总结"界面样式简陋

**修复**: 使用和 PC 端一样的 v2 风格

---

## 犯过的错误

### 错误 1: 自定义筛选阈值
**问题**: 自己定义了 NEW 标签的筛选阈值（出现≥3次，置信度≥0.8），没有使用项目中已定义的晋升标准。

**正确做法**: 先查看 `tag_discovery.py` 中的 `PROMOTION_CRITERIA` 和 `FAST_TRACK_CRITERIA`，使用已有的标准。

### 错误 2: 没有先查看服务器日志
**问题**: 用户反馈"晋升失败"时，先修改代码添加错误信息，而不是先查看服务器日志定位问题。

**正确做法**: 先通过 SSH 查看服务器日志，快速定位问题根因。

### 错误 3: FastAPI Body 参数用法错误
**问题**: `Body("default")` 期望的是纯字符串 body，而不是 JSON 对象中的字段。

**正确做法**: 
- 如果前端发送 JSON 对象，应使用 Pydantic 模型
- 或使用 `Body(..., embed=True)` 让单个参数嵌入 JSON 对象中

### 错误 4: 忘记将新模块添加到构建入口
**问题**: 创建了 `context-menu.js` 模块但忘记在 `index.js` 中导入它，导致模块没有被构建到最终的 bundle 中。

**正确做法**: 
- 创建新的 JS 模块后，必须在 `index.js` 中添加导入
- 构建后检查功能是否包含在 bundle 中

### 错误 5: 右键菜单逻辑错误
**问题**: 在 `platform-reorder.js` 中排除了 `my-tags` 分类，但在 `context-menu.js` 中只实现了"取消关注"，没有实现置顶/置底/编辑顺序，导致 my-tags 页面没有任何右键菜单。

**正确做法**: 
- 在 `platform-reorder.js` 中统一处理所有右键菜单
- 为 `my-tags` 分类添加额外的"取消关注"选项，而不是完全排除

### 错误 6: Emoji 显示为问号
**现象**: 关键词 Tab 的 🔑 emoji 显示为 `?`

**原因**: 文件编码问题，emoji 被转换为 UTF-8 replacement character

**解决**: 使用 `sed` 命令替换为正确的 emoji

### 错误 7: 部署命令使用错误
**问题**: 使用 `docker compose restart` 而不是 `deploy-rebuild.sh` 脚本，导致容器内文件没有更新。

**正确做法**: 使用 `./deploy-rebuild.sh` 脚本进行完整的构建和部署。

---

## 相关文件清单
- `hotnews/kernel/admin/tag_candidate_admin.py` - 标签候选管理 API
- `hotnews/kernel/services/tag_discovery.py` - 标签发现服务
- `hotnews/kernel/user/preferences_api.py` - 用户偏好 API
- `hotnews/web/static/js/src/subscribe-sidebar.js` - 订阅侧边栏
- `hotnews/web/static/js/src/context-menu.js` - 右键菜单
- `hotnews/web/static/js/src/platform-reorder.js` - 平台卡片排序和右键菜单
- `hotnews/web/static/js/src/morning-brief.js` - 每日AI早报
- `hotnews/web/static/js/src/summary-modal.js` - AI 总结弹窗
- `hotnews/web/static/js/src/index.js` - JS 模块入口
- `hotnews/web/static/css/viewer.css` - 样式文件
