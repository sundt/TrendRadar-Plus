# Change: 添加微信公众号订阅源支持

## Why

用户希望在 Hotnews 中订阅微信公众号，获取公众号文章更新。微信公众号是中文互联网重要的内容来源，但没有官方 RSS 支持，需要通过特殊方式获取文章列表。

## 现有方案对比

| 项目 | 数据来源 | 全文支持 | 开源 | 自建难度 | 认证方式 |
|------|----------|----------|------|----------|----------|
| **Wechat2RSS** | 微信读书 API | ✅ | ❌ 付费闭源 | 无法自建 | 微信读书登录 |
| **we-mp-rss** | 公众号后台 API | ✅ | ✅ MIT | ⭐⭐ 中等 | 扫码/Cookie |
| **wechat-article-exporter** | 公众号后台 API | ✅ 代理 | ✅ | ⭐⭐⭐ 较难 | Cookie |
| **wechat-crawler** | 公众号后台 API | ❌ | ✅ | ⭐ 简单 | Cookie |

### 推荐方案：we-mp-rss

**we-mp-rss** 是目前最完善的开源微信公众号 RSS 订阅方案：
- 完整的 Web 管理界面（Vue 3 + FastAPI）
- 支持扫码授权和 Cookie 两种认证方式
- 支持全文内容抓取
- 支持多种 RSS 格式（RSS/Atom/JSON）
- 支持定时自动更新
- 支持导出 md/docx/pdf/json
- Docker 一键部署

```bash
# 快速部署
docker run -d --name we-mp-rss -p 8001:8001 -v ./data:/app/data ghcr.io/rachelos/we-mp-rss:latest
```

### 核心原理

所有方案（除 Wechat2RSS）都是利用微信公众号后台的两个接口：
- `https://mp.weixin.qq.com/cgi-bin/searchbiz` - 搜索公众号
- `https://mp.weixin.qq.com/cgi-bin/appmsgpublish` - 获取文章列表

**前提条件**：用户需要有一个微信公众号（订阅号/服务号都可以），用于登录公众号后台获取 Cookie 和 Token。

## 授权模式：用户自助授权

每个用户使用自己的公众号账号扫码授权，优点：
- 风险分散，不会因单一账号被风控影响所有用户
- 每个用户独立管理自己的订阅
- 符合微信的使用规范

## What Changes

在设置页面新增"公众号"Tab，用户可以：
1. 扫码授权自己的公众号（获取 Cookie/Token）
2. 搜索并添加想要订阅的公众号
3. 系统用用户的 Token 定时抓取文章列表
4. 订阅的公众号文章显示在"我的关注"中

### 核心原理

利用微信公众号后台的两个接口：
- `https://mp.weixin.qq.com/cgi-bin/searchbiz` - 搜索公众号
- `https://mp.weixin.qq.com/cgi-bin/appmsgpublish` - 获取文章列表

**前提条件**：用户需要有一个微信公众号（订阅号/服务号都可以），用于登录公众号后台获取 Cookie 和 Token。

## Impact

- Affected specs:
  - `specs/custom-source/spec.md`（新增 wechat provider 类型）
  - `specs/settings/spec.md`（设置页面新增微信配置入口）

- Affected code:
  - `hotnews/kernel/providers/` - 新增 wechat_provider.py
  - `hotnews/kernel/admin/` - 新增 wechat_admin.py
  - `hotnews/web/server.py` - 注册新路由
  - `hotnews/web/static/` - 前端 UI
  - `hotnews/web/templates/` - 设置页面模板

## Scope

### 第一阶段（MVP）
- 手动配置 Cookie/Token（用户从浏览器复制）
- 搜索公众号并添加订阅
- 定时抓取文章列表（仅标题+链接+时间）
- 在前端展示订阅的公众号文章

### 第二阶段（可选）
- 扫码登录（参考 wechat-article-exporter）
- 自动刷新 Token
- 抓取阅读量/评论数据

## Technical Design

### 数据库设计

```sql
-- 微信公众号认证信息（每个用户一份）
CREATE TABLE IF NOT EXISTS wechat_mp_auth (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    cookie TEXT NOT NULL,
    token TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER,  -- Cookie 过期时间（约 2-4 小时）
    status TEXT DEFAULT 'active',  -- active/expired/invalid
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 用户订阅的公众号
CREATE TABLE IF NOT EXISTS wechat_mp_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    fakeid TEXT NOT NULL,  -- 公众号唯一标识
    nickname TEXT NOT NULL,  -- 公众号名称
    round_head_img TEXT,  -- 头像
    signature TEXT,  -- 简介
    subscribed_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, fakeid)
);

-- 公众号文章缓存
CREATE TABLE IF NOT EXISTS wechat_mp_articles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fakeid TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    publish_time INTEGER NOT NULL,
    digest TEXT,  -- 摘要
    cover_url TEXT,  -- 封面图
    fetched_at INTEGER NOT NULL,
    INDEX idx_fakeid_time (fakeid, publish_time DESC)
);
```

### API 设计

```
# 认证管理
POST /api/wechat/auth          - 保存 Cookie/Token
GET  /api/wechat/auth/status   - 检查认证状态
POST /api/wechat/auth/test     - 测试认证是否有效

# 公众号搜索与订阅
GET  /api/wechat/search        - 搜索公众号
POST /api/wechat/subscribe     - 订阅公众号
POST /api/wechat/unsubscribe   - 取消订阅
GET  /api/wechat/subscriptions - 获取订阅列表

# 文章获取
GET  /api/wechat/articles      - 获取订阅的文章列表
POST /api/wechat/refresh       - 手动刷新文章
```

### Provider 实现

```python
# hotnews/kernel/providers/wechat_provider.py

class WeChatMPProvider:
    """微信公众号 Provider"""
    
    def __init__(self, cookie: str, token: str):
        self.cookie = cookie
        self.token = token
        self.headers = {
            "Cookie": cookie,
            "User-Agent": "Mozilla/5.0 ..."
        }
    
    def search_mp(self, keyword: str, limit: int = 10) -> List[Dict]:
        """搜索公众号"""
        url = "https://mp.weixin.qq.com/cgi-bin/searchbiz"
        params = {
            "action": "search_biz",
            "query": keyword,
            "count": limit,
            "token": self.token,
            "lang": "zh_CN",
            "f": "json",
            "ajax": "1"
        }
        # ...
    
    def get_articles(self, fakeid: str, count: int = 20) -> List[Dict]:
        """获取公众号文章列表"""
        url = "https://mp.weixin.qq.com/cgi-bin/appmsgpublish"
        params = {
            "sub": "list",
            "sub_action": "list_ex",
            "begin": 0,
            "count": count,
            "fakeid": fakeid,
            "token": self.token,
            "lang": "zh_CN",
            "f": "json",
            "ajax": 1
        }
        # ...
```

### 前端 UI

在设置页面新增"微信公众号"Tab：

```
┌─────────────────────────────────────────────────────┐
│  我的设置                                            │
├─────────────────────────────────────────────────────┤
│  [标签] [订阅源] [微信公众号]              ← Tab 切换 │
├─────────────────────────────────────────────────────┤
│                                                       │
│  📱 微信公众号认证                                    │
│  ┌──────────────────────────────────────────────┐   │
│  │ 状态: ✅ 已认证 (剩余 2 小时)                  │   │
│  │                              [更新认证]       │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  💚 已订阅的公众号                                    │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🔵 36氪                           ×          │   │
│  │ 🔵 虎嗅                           ×          │   │
│  │ 🔵 少数派                         ×          │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  🔍 搜索公众号                                        │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🔍 输入公众号名称...                          │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
│  搜索结果:                                            │
│  ┌──────────────────────────────────────────────┐   │
│  │ 🔵 36氪                                       │   │
│  │    科技创业媒体              [+ 订阅]         │   │
│  └──────────────────────────────────────────────┘   │
│                                                       │
└─────────────────────────────────────────────────────┘
```

## Open Questions

1. **Cookie 过期处理**：Cookie 有效期约 2-4 小时，如何提醒用户更新？
   - 方案 A：前端定时检查，过期时弹窗提醒
   - 方案 B：后台检测到过期时发送通知

2. **请求频率限制**：微信有反爬机制，如何控制请求频率？
   - 建议：每个公众号每 30 分钟抓取一次，单次请求间隔 2 秒

3. **多用户共享**：是否支持多用户共享同一个公众号的文章缓存？
   - 建议：是，文章按 fakeid 缓存，多用户订阅同一公众号时复用缓存

## 参考项目

| 项目 | 参考内容 | 文件路径 |
|------|----------|----------|
| **we-mp-rss** | 完整的 RSS 订阅方案 | `we-mp-rss/` |
| we-mp-rss | 微信 API 调用 | `we-mp-rss/core/wx/wx.py` |
| we-mp-rss | RSS 生成 | `we-mp-rss/core/rss.py` |
| we-mp-rss | 文章内容抓取 | `we-mp-rss/core/wx/base.py` |
| we-mp-rss | API 接口设计 | `we-mp-rss/apis/rss.py` |
| wechat-article-exporter | 核心 API 调用逻辑 | `wechat-article-exporter/server/api/web/mp/` |
| wechat-article-exporter | Cookie 管理 | `wechat-article-exporter/server/utils/CookieStore.ts` |
| wechat-crawler | 简化版 Python 实现 | `wechat-crawler/wechat_crawler.py` |
| hotnews | Provider 架构 | `hotnews/kernel/providers/` |

## 实现方案选择

### 方案 A：集成 we-mp-rss（推荐）

直接部署 we-mp-rss 作为独立服务，Hotnews 通过 RSS 订阅其输出：

```
用户 → Hotnews → we-mp-rss RSS 接口 → 文章列表
```

**优点**：
- 无需重复开发，功能完善
- 独立部署，不影响 Hotnews 主服务
- 支持全文内容

**缺点**：
- 需要额外部署一个服务
- 用户需要在 we-mp-rss 中管理订阅

### 方案 B：内置微信 Provider

在 Hotnews 中内置微信公众号 Provider，参考 we-mp-rss 的实现：

```
用户 → Hotnews 设置页 → 微信 Provider → 公众号后台 API
```

**优点**：
- 统一管理，用户体验更好
- 无需额外部署

**缺点**：
- 开发工作量大
- 需要维护微信 API 的兼容性 |

## 风险与限制

1. **依赖用户公众号**：用户必须有一个微信公众号才能使用此功能
2. **Cookie 频繁过期**：需要用户定期更新认证信息（约 2-4 小时）
3. **微信风控**：请求过于频繁可能触发限制
4. **仅获取列表**：直接调用 API 只能获取文章标题和链接，全文需要额外抓取

## 附录：we-mp-rss 关键配置

```yaml
# we-mp-rss config.yaml 关键配置
RSS_FULL_CONTEXT: True      # 是否显示全文
RSS_ADD_COVER: True         # 是否添加封面图片
RSS_PAGE_SIZE: 30           # RSS 分页大小
GATHER.CONTENT: True        # 是否采集内容
SPAN_INTERVAL: 10           # 定时任务执行间隔（秒）
MAX_PAGE: 5                 # 最大采集页数
```

## 附录：we-mp-rss RSS 接口

```
# RSS 订阅地址格式
GET /feed/{feed_id}.xml     # RSS 2.0 格式
GET /feed/{feed_id}.atom    # Atom 格式
GET /feed/{feed_id}.json    # JSON 格式

# 示例
http://localhost:8001/feed/abc123.xml
```
