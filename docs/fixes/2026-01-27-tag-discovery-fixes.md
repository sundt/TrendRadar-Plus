# 2026-01-27 动态标签发现功能修复

## 修改内容

### 1. 修复标签晋升 API 参数解析问题
**文件**: `hotnews/kernel/admin/tag_candidate_admin.py`

**问题**: 前端发送 JSON 对象 `{"icon": "🏷️"}`，但 API 使用 `Body("🏷️")` 期望纯字符串，导致参数解析失败。

**修复**: 改用 Pydantic 模型解析请求体：
```python
class ApproveRequest(BaseModel):
    icon: str = "🏷️"

class RejectRequest(BaseModel):
    reason: str = ""

@router.post("/{tag_id}/approve")
async def approve_candidate(request: Request, tag_id: str, body: ApproveRequest = Body(default=ApproveRequest())):
    ...
```

### 2. 改进晋升失败的错误信息
**文件**: `hotnews/kernel/services/tag_discovery.py`

**修改**: `promote_candidate` 方法返回详细错误信息：
- 候选标签不存在
- 候选标签状态不是 pending（显示实际状态）
- 标签已存在于正式标签表
- 数据库缺少必要的列
- 数据库操作失败的具体错误

### 3. 优化 NEW 标签推荐列表
**文件**: `hotnews/kernel/user/preferences_api.py`

**修改**:
- 从只显示 5 个改为最多显示 20 个
- 使用与晋升相同的标准筛选候选标签：
  - 4小时内：出现 ≥8 次，置信度 ≥0.9
  - 12小时内：出现 ≥15 次，置信度 ≥0.9
  - 24小时内：出现 ≥20 次，置信度 ≥0.8
  - 标准（3天以上）：出现 ≥10 次，置信度 ≥0.7
- 显示格式改为：`标签名 NEW 发现于MM-DD`

### 4. 前端显示优化
**文件**: `hotnews/web/static/js/src/subscribe-sidebar.js`, `hotnews/web/static/css/viewer.css`

**修改**: 
- NEW 标签后显示首次发现日期
- 添加 `.subscribe-item-date` 样式

### 5. 我的关注卡片右键取消关注
**文件**: 
- `hotnews/web/static/js/src/context-menu.js`
- `hotnews/web/static/js/src/index.js`
- `hotnews/web/static/js/src/platform-reorder.js`

**新增功能**:
- 在"我的关注"页面，右键点击卡片标题显示"不再关注"选项
- 点击后调用 API 取消关注，卡片淡出消失
- 清除本地缓存，显示 toast 提示

**修改**:
- `platform-reorder.js`: 排除 `my-tags` 分类，不显示置顶/置底菜单
- `index.js`: 添加 `context-menu.js` 导入，确保模块被构建

---

## 犯过的错误

### 错误 1: 自定义筛选阈值
**问题**: 我自己定义了 NEW 标签的筛选阈值（出现≥3次，置信度≥0.8），没有使用项目中已定义的晋升标准。

**正确做法**: 应该先查看 `tag_discovery.py` 中的 `PROMOTION_CRITERIA` 和 `FAST_TRACK_CRITERIA`，使用已有的标准。

### 错误 2: 没有先查看服务器日志
**问题**: 用户反馈"晋升失败"时，我先修改代码添加错误信息，而不是先查看服务器日志定位问题。

**正确做法**: 应该先通过 SSH 查看服务器日志，快速定位问题根因。

### 错误 3: FastAPI Body 参数用法错误
**问题**: 不熟悉 FastAPI 的 `Body` 参数行为。`Body("default")` 期望的是纯字符串 body，而不是 JSON 对象中的字段。

**正确做法**: 
- 如果前端发送 JSON 对象，应使用 Pydantic 模型
- 或使用 `Body(..., embed=True)` 让单个参数嵌入 JSON 对象中

### 错误 4: 忘记将新模块添加到构建入口
**问题**: 创建了 `context-menu.js` 模块实现取消关注功能，但忘记在 `index.js` 中导入它，导致模块没有被构建到最终的 bundle 中。

**正确做法**: 
- 创建新的 JS 模块后，必须在 `index.js` 中添加导入
- 构建后检查功能是否包含在 bundle 中（如 `grep '关键字' index.js`）

---

## 相关文件
- `hotnews/kernel/admin/tag_candidate_admin.py` - 标签候选管理 API
- `hotnews/kernel/services/tag_discovery.py` - 标签发现服务
- `hotnews/kernel/user/preferences_api.py` - 用户偏好 API
- `hotnews/web/static/js/src/subscribe-sidebar.js` - 订阅侧边栏
- `hotnews/web/static/js/src/context-menu.js` - 右键菜单（取消关注功能）
- `hotnews/web/static/js/src/platform-reorder.js` - 平台卡片排序（置顶/置底菜单）
- `hotnews/web/static/js/src/index.js` - JS 模块入口
- `hotnews/kernel/templates/admin_rss_sources.html` - 管理后台模板
