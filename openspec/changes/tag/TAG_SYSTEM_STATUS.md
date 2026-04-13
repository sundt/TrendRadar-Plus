# 标签系统状态报告

## ✅ 初始化完成

**时间**: 2026-01-19  
**服务器**: YOUR_SERVER_IP:YOUR_SSH_PORT  
**数据库**: ~/hotnews/output/online.db

## 📊 标签数据统计

### 总览
```
✅ 成功初始化 62 个标签
```

### 按类型分布

| 类型 | 数量 | 说明 |
|------|------|------|
| **Category（大类）** | 12 | 互斥分类，每条新闻只能属于一个 |
| **Topic（主题）** | 40 | 细分主题，可多选 |
| **Attribute（属性）** | 10 | 内容属性标签 |
| **总计** | **62** | |

## 🏷️ 具体标签列表

### Categories（大类）- 12 个

| ID | 名称 | 图标 |
|----|------|------|
| tech | 科技 | 💻 |
| finance | 财经 | 💰 |
| business | 商业 | 🏢 |
| politics | 政治 | 🏛️ |
| world | 国际 | 🌍 |
| entertainment | 娱乐 | 🎬 |
| sports | 体育 | ⚽ |
| health | 健康 | 🏥 |
| science | 科学 | 🔬 |
| lifestyle | 生活 | 🏠 |
| education | 教育 | 📚 |
| other | 其他 | 📰 |

### Topics（主题）- 科技类示例（前 10 个）

| ID | 名称 | 图标 | 父类 |
|----|------|------|------|
| ai_ml | AI/机器学习 | 🤖 | tech |
| llm | 大语言模型 | 🧠 | tech |
| dev_tools | 开发工具 | 🛠️ | tech |
| programming | 编程语言 | 💻 | tech |
| database | 数据库 | 🗄️ | tech |
| cloud | 云计算 | ☁️ | tech |
| cybersecurity | 网络安全 | 🔒 | tech |
| hardware | 硬件/芯片 | 🔧 | tech |
| mobile | 移动开发 | 📱 | tech |
| web3 | Web3/区块链 | ⛓️ | tech |

### Attributes（属性）- 10 个

| ID | 名称 | 图标 | 说明 |
|----|------|------|------|
| free_deal | 免费/优惠 | 🆓 | 薅羊毛、免费资源、折扣活动 |
| tutorial | 教程/实践 | 📝 | 动手教程、代码实战 |
| deep_dive | 深度分析 | 🔍 | 长文、研报、深度解读 |
| breaking | 快讯/速报 | ⚡ | 突发新闻、即时消息 |
| official | 官方发布 | 📢 | 官方公告、新品发布 |
| opinion | 观点/评论 | 💭 | 专栏、评论文章 |
| interview | 访谈 | 🎤 | 人物访谈、对话 |
| tool_rec | 工具推荐 | 🧰 | 软件、服务推荐 |
| career | 职业/求职 | 💼 | 求职、招聘、职业发展 |
| event | 活动/会议 | 🎪 | 大会、展会、活动 |

## 🔍 在 Admin 中查看

### 访问方式

1. **登录 Admin 后台**
   ```
   http://YOUR_SERVER_IP/admin/login
   ```

2. **查看标签管理**（需要先重启服务）
   - 标签 API 端点：`/api/admin/tags`
   - 公开 API：`/api/admin/tags/public/all`

### 验证命令

```bash
# SSH 到服务器
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP

# 查看标签统计
cd ~/hotnews
sqlite3 output/online.db "SELECT type, COUNT(*) FROM tags WHERE enabled = 1 GROUP BY type"

# 查看所有大类
sqlite3 output/online.db "SELECT id, name, icon FROM tags WHERE type='category' ORDER BY sort_order"

# 查看科技类主题
sqlite3 output/online.db "SELECT id, name, icon FROM tags WHERE type='topic' AND parent_id='tech' ORDER BY sort_order"

# 查看所有属性
sqlite3 output/online.db "SELECT id, name, icon, description FROM tags WHERE type='attribute' ORDER BY sort_order"
```

## 📱 Admin 界面功能

### 当前可用功能

1. **标签列表查询**
   - `GET /api/admin/tags` - 列出所有标签
   - `GET /api/admin/tags?type=category` - 按类型筛选
   - `GET /api/admin/tags?enabled_only=true` - 只显示启用的

2. **标签详情**
   - `GET /api/admin/tags/{tag_id}` - 获取单个标签

3. **标签管理**
   - `POST /api/admin/tags` - 创建新标签
   - `PUT /api/admin/tags/{tag_id}` - 更新标签
   - `DELETE /api/admin/tags/{tag_id}` - 删除标签

4. **统计信息**
   - `GET /api/admin/tags/types` - 标签类型统计
   - `GET /api/admin/tags/stats/usage` - 使用统计

5. **公开 API**
   - `GET /api/admin/tags/public/all` - 获取所有启用标签（无需认证）

### 需要重启服务

⚠️ **注意**：标签 API 可能需要重启服务才能正常访问。

```bash
# 在服务器上重启
cd ~/hotnews/docker
docker compose restart
```

## 🎯 使用场景

### 1. RSS 源自动分类
- 为 RSS 源配置默认标签
- 新抓取的文章自动继承标签

### 2. AI 智能标注
- 使用 AI 模型分析文章内容
- 自动打上合适的标签
- 存储在 `rss_entry_tags` 表

### 3. 用户个性化订阅
- 用户选择感兴趣的标签
- 基于标签推荐内容

### 4. 内容筛选和搜索
- 按标签过滤新闻
- 多标签组合查询
- 标签聚合统计

## 📝 数据库表结构

### tags 表
```sql
CREATE TABLE tags (
    id TEXT PRIMARY KEY,           -- 标签 ID（英文）
    name TEXT NOT NULL,            -- 标签名称（中文）
    name_en TEXT,                  -- 英文名称
    type TEXT NOT NULL,            -- 类型：category/topic/attribute
    parent_id TEXT,                -- 父标签 ID（用于 topic）
    icon TEXT,                     -- 图标 emoji
    color TEXT,                    -- 颜色代码
    description TEXT,              -- 描述
    sort_order INTEGER DEFAULT 0,  -- 排序
    enabled INTEGER DEFAULT 1,     -- 是否启用
    created_at INTEGER,            -- 创建时间
    updated_at INTEGER             -- 更新时间
);
```

### rss_entry_tags 表（关联表）
```sql
CREATE TABLE rss_entry_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entry_id TEXT NOT NULL,        -- RSS 条目 ID
    tag_id TEXT NOT NULL,          -- 标签 ID
    confidence REAL,               -- 置信度（AI 标注）
    source TEXT,                   -- 来源：manual/ai/auto
    created_at INTEGER,
    UNIQUE(entry_id, tag_id)
);
```

## 🔄 下一步

1. **重启服务**（可选，如需使用 API）
   ```bash
   ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP
   cd ~/hotnews/docker
   docker compose restart
   ```

2. **测试 API**
   ```bash
   curl http://YOUR_SERVER_IP/api/admin/tags/public/all
   ```

3. **在 Admin 界面管理标签**
   - 访问 http://YOUR_SERVER_IP/admin/login
   - 登录后可以查看和管理标签

4. **配置 RSS 源标签**
   - 为现有 RSS 源添加默认标签
   - 新文章自动继承标签

---

**状态**: ✅ 标签数据已成功初始化  
**总数**: 62 个标签（12 大类 + 40 主题 + 10 属性）  
**位置**: 服务器 YOUR_SERVER_IP 的 ~/hotnews/output/online.db  
**下一步**: 可以在 Admin 后台查看和管理标签
