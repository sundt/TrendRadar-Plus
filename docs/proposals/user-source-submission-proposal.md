# 用户投稿 URL 功能设计文档

**版本：** v1.0  
**日期：** 2026-03-05  
**状态：** 草案（待评审）

---

## 一、背景与目标

### 背景

目前 HotNews 数据源由管理员通过后台手动维护。用户发现优质内容源后无法自助提交，增加了管理员工作量，也降低了社区参与度。

### 目标

在网站前端提供一个聊天式投稿入口：用户粘贴 URL，系统自动完成安全检测 + RSS 发现，进入待审队列。管理员一键批准即可入库。

### 非目标

- 不允许用户绕过审核直接写入数据库
- 不支持自定义爬虫脚本的用户投稿（仅 RSS/Atom）
- 暂不支持批量投稿

---

## 二、完整用户交互流程

### 2.1 入口位置

- **PC 端**：右下角悬浮按钮「💡 推荐网站」，点击展开聊天面板
- **移动端**：底部导航栏新增「推荐」Tab，点击弹出半屏抽屉

### 2.2 聊天窗口交互详情

#### Step 1：引导状态（初始打开）

```
┌─────────────────────────────────┐
│  💡 推荐新内容源                  │
│                                  │
│  把你发现的好网站分享给大家吧。    │
│  支持任何有 RSS 的新闻/博客网站。  │
│                                  │
│  ┌────────────────────────────┐  │
│  │ 粘贴网站地址，如            │  │
│  │ https://example.com        │  │
│  └────────────────────────────┘  │
│                      [提交]       │
└─────────────────────────────────┘
```

#### Step 2：用户输入 URL，点击提交

系统立即显示进度，分步播报（每步完成后更新，无需用户等待）：

```
你：https://www.macrumors.com

🤖 正在检测…
   ✅ 地址格式正确
   ✅ 安全检测通过
   🔍 正在查找订阅源…
```

#### Step 3A：成功找到 RSS

```
🤖 发现了！

   📡 MacRumors - All Stories
      https://feeds.macrumors.com/MacRumors-All
      最近更新：2 分钟前 · 包含 20+ 条内容

   已提交审核 ✓
   管理员确认后将收录到平台，感谢你的贡献！

   [再推荐一个] [关闭]
```

#### Step 3B：未找到 RSS（不支持）

```
🤖 抱歉，这个网站暂时无法收录。

   ❌ 未找到 RSS/Atom 订阅源
      我们目前仅支持有 RSS 的网站。

   如果你认为该网站应该有 RSS，可以去网站找找
   "/feed" 或 "/rss" 路径，把具体地址发给我。

   [换一个试试] [关闭]
```

#### Step 3C：已收录

```
🤖 这个网站已经在我们的收录列表中了 🎉

   📡 MacRumors（已收录）
      上次更新：5 分钟前

   [换一个试试] [关闭]
```

#### Step 3D：安全检测失败

```
🤖 这个网站无法提交。

   ❌ [具体原因，见下表]

   [换一个试试] [关闭]
```

**安全拒绝原因对照表：**

| 拒绝原因 | 显示文案 |
|---------|---------|
| 非法 URL 格式 | 地址格式不正确，请检查后重试 |
| 内网/本地 IP | 不支持内网地址 |
| HTTP（非 HTTPS）| 请使用 HTTPS 地址 |
| 黑名单域名 | 该网站不在支持范围内 |
| 重复提交（近 24h）| 你已经提交过这个网站，请等待审核 |

#### Step 3E：网络异常 / 超时

```
🤖 检测超时了 😅

   网站响应较慢，请稍后再试。
   如果你确认这个网站有 RSS，可以直接把 RSS 地址发给我。

   [重试] [关闭]
```

---

## 三、系统架构

### 3.1 整体数据流

```
[前端聊天组件]
      │ POST /api/submit/url
      ▼
[submit_api.py]
  ├─ 1. URL 安全校验（本地逻辑，<1ms）
  ├─ 2. 重复检查（查 DB，<5ms）
  ├─ 3. RSS 发现（web_fetch，2-5s）
  │      └─ 探测多个路径，对比条目数，选最优
  ├─ 4. 服务器可达性测试（curl via asyncio，2-5s）
  │      └─ 推断 use_socks_proxy
  └─ 5. 写入 pending_sources 表
         └─ 返回结果给前端

[管理后台 /admin/rss]
  └─ 待审 Tab
       ├─ 批准 → 写入 rss_sources（自动带 use_socks_proxy）
       └─ 拒绝 → 更新 status='rejected' + 记录原因
```

### 3.2 后端新增文件

```
hotnews/web/
└── submit_api.py          # 新增：用户投稿 API
```

新增路由注册到 `server.py`：
```python
from hotnews.web.submit_api import router as _submit_router
app.include_router(_submit_router)
```

---

## 四、数据库设计

### 4.1 新增表：`pending_sources`

```sql
CREATE TABLE IF NOT EXISTS pending_sources (
    id              TEXT PRIMARY KEY,
    submitted_url   TEXT NOT NULL,           -- 用户原始提交的 URL
    detected_rss    TEXT DEFAULT '',         -- 发现的最优 RSS 地址
    feed_title      TEXT DEFAULT '',         -- RSS Feed 标题
    host            TEXT DEFAULT '',         -- 主域名，如 macrumors.com
    item_count      INTEGER DEFAULT 0,       -- 最新一次检测的条目数
    use_socks_proxy INTEGER DEFAULT 0,       -- 服务器是否需要代理
    status          TEXT DEFAULT 'pending',  -- pending / approved / rejected
    reject_reason   TEXT DEFAULT '',         -- 拒绝原因（admin 填写）
    submitter_ip    TEXT DEFAULT '',         -- 提交者 IP（脱敏存储）
    submitted_at    INTEGER NOT NULL,        -- 提交时间戳
    reviewed_at     INTEGER DEFAULT 0,       -- 审核时间戳
    approved_source_id TEXT DEFAULT ''       -- 批准后对应的 rss_sources.id
);

CREATE INDEX IF NOT EXISTS idx_pending_sources_status ON pending_sources(status);
CREATE INDEX IF NOT EXISTS idx_pending_sources_host ON pending_sources(host);
```

### 4.2 Migration 脚本

`scripts/migrate_add_pending_sources.py`

---

## 五、API 设计

### 5.1 用户提交接口

**POST `/api/submit/url`**

Request:
```json
{
  "url": "https://www.macrumors.com"
}
```

Response（成功找到 RSS）:
```json
{
  "ok": true,
  "status": "submitted",
  "result": {
    "feed_url": "https://feeds.macrumors.com/MacRumors-All",
    "feed_title": "MacRumors - All Stories",
    "host": "macrumors.com",
    "item_count": 20,
    "needs_proxy": true
  },
  "message": "已提交审核，感谢你的贡献！"
}
```

Response（已收录）:
```json
{
  "ok": false,
  "status": "already_exists",
  "message": "这个网站已经在收录列表中了"
}
```

Response（无 RSS）:
```json
{
  "ok": false,
  "status": "no_rss",
  "message": "未找到 RSS/Atom 订阅源"
}
```

Response（安全拒绝）:
```json
{
  "ok": false,
  "status": "rejected",
  "reason": "blacklisted",
  "message": "该网站不在支持范围内"
}
```

**限流：** 同一 IP，每小时最多 10 次提交；每个 host 同一 IP 24 小时内只能提交 1 次。

### 5.2 管理员待审接口

**GET `/api/admin/pending-sources`**（需 Admin Auth）

Response:
```json
{
  "ok": true,
  "total": 5,
  "items": [
    {
      "id": "pending_abc123",
      "submitted_url": "https://www.macrumors.com",
      "detected_rss": "https://feeds.macrumors.com/MacRumors-All",
      "feed_title": "MacRumors - All Stories",
      "host": "macrumors.com",
      "item_count": 20,
      "use_socks_proxy": 1,
      "status": "pending",
      "submitted_at": 1741234567
    }
  ]
}
```

**POST `/api/admin/pending-sources/{id}/approve`**（需 Admin Auth）

Request（可选覆盖字段）:
```json
{
  "name": "MacRumors",
  "category": "tech_news",
  "language": "en",
  "country": "US"
}
```

Response:
```json
{
  "ok": true,
  "source_id": "rss_145f36d0",
  "message": "已收录"
}
```

**POST `/api/admin/pending-sources/{id}/reject`**（需 Admin Auth）

Request:
```json
{
  "reason": "内容质量不符合要求"
}
```

---

## 六、前端组件设计

### 6.1 组件结构

```
src/
└── source-submit-chat.js   # 聊天窗口组件（新增）
```

### 6.2 状态机

```
IDLE → VALIDATING → DETECTING → SUCCESS / NO_RSS / DUPLICATE / ERROR
  ↑___________________________________|
```

### 6.3 UI 交互细节

- **输入框**：自动识别粘贴事件，粘贴后自动 trim；支持 Enter 提交
- **进度展示**：逐步追加消息气泡，不覆盖（让用户看到每一步）
- **超时处理**：检测阶段 10 秒无响应，前端主动提示「检测超时」
- **错误重试**：所有失败状态均提供「重试」按钮
- **无障碍**：聊天区域有 `aria-live="polite"`，进度更新可被屏幕阅读器读出

---

## 七、管理后台改动

在现有 `admin_rss_sources.html` 的 Tab 栏新增「待审投稿」Tab，显示 `pending_sources` 队列：

```
[RSS 源] [自定义爬虫] [待审投稿 (3)]
                       ^^^^^^^^^^^
                       数字徽标，有新投稿时高亮
```

每条待审记录展示：
- 用户提交的原始 URL
- 检测到的 RSS 地址（可编辑）
- 条目数 / 是否需要代理
- 提交时间
- 操作：[批准] [拒绝]

批准时弹出小表单，可补填 `name` / `category` / `language`，其余字段自动从检测结果填入。

---

## 八、安全设计

### 8.1 SSRF 防护

提交 URL 在后端解析时，需检查解析后的 IP 是否为内网地址：

```python
BLOCKED_NETWORKS = [
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("::1/128"),
]
```

### 8.2 限流

- IP 级别：每小时 10 次（超出返回 429）
- Host 级别：同一 host 同一 IP 24 小时内只能提交 1 次
- 全局：单次检测并发上限 3（防止被利用做端口扫描）

### 8.3 数据存储安全

- 提交者 IP 截取前 3 段（如 `192.168.1.*`），不存完整 IP
- `pending_sources` 不对外公开，仅管理员可查

---

## 九、开发工作量估算

| 模块 | 工作量 | 备注 |
|------|-------|------|
| DB migration | 0.5h | 新增 `pending_sources` 表 |
| `submit_api.py` | 3h | URL 校验 + RSS 发现 + 可达性检测 + 写库 |
| 管理后台 Tab | 2h | 待审列表 + 批准/拒绝操作 |
| 前端聊天组件 | 4h | 输入 + 进度气泡 + 状态机 |
| 联调测试 | 2h | |
| **合计** | **~12h** | |

---

## 十、开放问题（待决策）

1. **是否要求登录才能提交？** 匿名提交门槛低但垃圾多；登录提交质量高但减少参与。建议先匿名，上线后观察垃圾率再决定是否加登录墙。

2. **重复 host 的处理策略？** 同一 host 已有多个 RSS 源时（如 `macrumors.com` 已有 `-Front` 和 `-All`），新投稿是直接拒绝「已收录」还是允许提交让管理员判断？

3. **通知机制？** 投稿审核通过/拒绝后是否需要通知用户（如果没有账号系统则无法通知）？

---

*文档由 HotNews Dev Agent 生成，基于 2026-03-05 代码库分析。*
