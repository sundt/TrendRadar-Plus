# 标签分类系统使用指南

## 📊 标签系统概述

HotNews 使用多标签分类系统，支持对新闻内容进行精细化分类和标注。

### 标签类型

系统定义了三种标签类型：

1. **Category（大类）** - 互斥分类
   - 每条新闻只能属于一个大类
   - 例如：科技、财经、商业、娱乐等
   - 共 12 个预设大类

2. **Topic（主题）** - 细分主题
   - 每条新闻可以有多个主题标签
   - 与大类关联（parent_id）
   - 例如：AI/机器学习、大语言模型、开发工具等
   - 共 50+ 个预设主题

3. **Attribute（属性）** - 内容属性
   - 描述新闻的特征和类型
   - 例如：免费/优惠、教程/实践、深度分析等
   - 共 10 个预设属性

## 🎯 预设标签统计

### Categories（大类）- 12 个
```
💻 科技 (tech)
💰 财经 (finance)
🏢 商业 (business)
🏛️ 政治 (politics)
🌍 国际 (world)
🎬 娱乐 (entertainment)
⚽ 体育 (sports)
🏥 健康 (health)
🔬 科学 (science)
🏠 生活 (lifestyle)
📚 教育 (education)
📰 其他 (other)
```

### Topics（主题）- 按大类分组

**科技类（15 个）**
- 🤖 AI/机器学习 (ai_ml)
- 🧠 大语言模型 (llm)
- 🛠️ 开发工具 (dev_tools)
- 💻 编程语言 (programming)
- 🗄️ 数据库 (database)
- ☁️ 云计算 (cloud)
- 🔒 网络安全 (cybersecurity)
- 🔧 硬件/芯片 (hardware)
- 📱 移动开发 (mobile)
- ⛓️ Web3/区块链 (web3)
- 🎮 游戏 (gaming)
- 🦾 机器人 (robotics)
- 📡 物联网 (iot)
- 🥽 VR/AR (vr_ar)
- 🌐 开源项目 (opensource)

**财经类（7 个）**
- 📈 股票 (stock)
- ₿ 加密货币 (crypto)
- 🌐 宏观经济 (macro)
- 🏦 银行 (banking)
- 🛡️ 保险 (insurance)
- 🏘️ 房地产 (real_estate)
- 💳 个人理财 (personal_fin)

**商业类（5 个）**
- 🚀 创业/融资 (startup)
- 🛒 电商 (ecommerce)
- 📣 营销 (marketing)
- 👥 人力资源 (hr)
- 📊 企业管理 (management)

**生活类（7 个）**
- 🍜 美食 (food)
- ✈️ 旅行 (travel)
- 👗 时尚 (fashion)
- 🏡 家居 (home)
- 👶 育儿 (parenting)
- 🐾 宠物 (pets)
- 🚗 汽车 (automotive)

**娱乐类（6 个）**
- 🎬 电影 (movies)
- 🎵 音乐 (music)
- 📺 电视剧 (tv_shows)
- ⭐ 明星 (celebrity)
- 🎌 动漫 (anime)
- 📖 书籍 (books)

### Attributes（属性）- 10 个
```
🆓 免费/优惠 (free_deal) - 薅羊毛、免费资源、折扣活动
📝 教程/实践 (tutorial) - 动手教程、代码实战
🔍 深度分析 (deep_dive) - 长文、研报、深度解读
⚡ 快讯/速报 (breaking) - 突发新闻、即时消息
📢 官方发布 (official) - 官方公告、新品发布
💭 观点/评论 (opinion) - 专栏、评论文章
🎤 访谈 (interview) - 人物访谈、对话
🧰 工具推荐 (tool_rec) - 软件、服务推荐
💼 职业/求职 (career) - 求职、招聘、职业发展
🎪 活动/会议 (event) - 大会、展会、活动
```

## 🔧 服务器状态检查

### 当前状态
```bash
# 服务器: YOUR_SERVER_IP:YOUR_SSH_PORT
# 数据库: ~/hotnews/output/online.db
# 标签表: tags (已创建但为空)
```

**检查结果**：
- ✅ 数据库表已创建
- ❌ 标签数据未初始化（表为空）

## 🚀 初始化标签数据

### 方法 1: 通过 Admin API（推荐）

1. **访问 Admin 后台**
   ```
   http://YOUR_SERVER_IP/admin/login
   ```

2. **登录后调用初始化 API**
   ```bash
   curl -X POST http://YOUR_SERVER_IP/api/admin/tags/init \
     -H "Cookie: your_admin_session_cookie"
   ```

### 方法 2: 直接在服务器执行

```bash
# SSH 到服务器
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP

# 进入项目目录
cd ~/hotnews

# 运行初始化脚本
python -c "
from pathlib import Path
from hotnews.kernel.admin.tag_init import init_tags
init_tags(Path.cwd())
"
```

### 方法 3: 通过 Docker 容器

```bash
# SSH 到服务器
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP

# 进入容器
docker exec -it hotnews bash

# 运行初始化
python -c "
from pathlib import Path
from hotnews.kernel.admin.tag_init import init_tags
init_tags(Path('/app'))
"
```

## 📱 Admin 管理界面

### 访问地址

**登录页面**：
```
http://YOUR_SERVER_IP/admin/login
```

**RSS 源管理**：
```
http://YOUR_SERVER_IP/admin/rss-sources
```

### 标签管理 API

**列出所有标签**：
```bash
GET /api/admin/tags
GET /api/admin/tags?type=category
GET /api/admin/tags?type=topic
GET /api/admin/tags?type=attribute
```

**获取标签类型统计**：
```bash
GET /api/admin/tags/types
```

**获取单个标签**：
```bash
GET /api/admin/tags/{tag_id}
```

**创建标签**：
```bash
POST /api/admin/tags
Content-Type: application/json

{
  "id": "new_tag",
  "name": "新标签",
  "type": "topic",
  "parent_id": "tech",
  "icon": "🔥",
  "color": "#FF5733"
}
```

**更新标签**：
```bash
PUT /api/admin/tags/{tag_id}
Content-Type: application/json

{
  "name": "更新后的名称",
  "enabled": true
}
```

**删除标签**：
```bash
DELETE /api/admin/tags/{tag_id}
```

**初始化预设标签**：
```bash
POST /api/admin/tags/init
```

**标签使用统计**：
```bash
GET /api/admin/tags/stats/usage
```

### 公开 API（无需认证）

**获取所有启用的标签**：
```bash
GET /api/admin/tags/public/all
```

返回格式：
```json
{
  "ok": true,
  "categories": [...],
  "topics": [...],
  "attributes": [...],
  "total": 77
}
```

## 🔍 验证标签数据

### 检查标签数量

```bash
# 在服务器上执行
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP "cd ~/hotnews && sqlite3 output/online.db 'SELECT type, COUNT(*) FROM tags WHERE enabled = 1 GROUP BY type'"
```

预期输出：
```
attribute|10
category|12
topic|55
```

### 查看具体标签

```bash
# 查看所有科技类主题
ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP "cd ~/hotnews && sqlite3 output/online.db \"SELECT id, name, icon FROM tags WHERE type='topic' AND parent_id='tech' ORDER BY sort_order\""
```

### 通过 API 查看

```bash
# 获取所有标签
curl http://YOUR_SERVER_IP/api/admin/tags/public/all | jq .

# 获取标签类型统计
curl http://YOUR_SERVER_IP/api/admin/tags/types | jq .
```

## 📝 使用场景

### 1. RSS 源分类
- 为 RSS 源配置默认标签
- 自动为抓取的新闻打标签

### 2. AI 自动分类
- 使用 AI 模型自动识别新闻类别和主题
- 存储在 `rss_entry_tags` 表中

### 3. 用户订阅
- 用户可以订阅特定标签
- 个性化推荐基于标签偏好

### 4. 内容过滤
- 按标签筛选新闻
- 多标签组合查询

## 🎯 下一步操作

1. **初始化标签数据**
   ```bash
   ssh -p YOUR_SSH_PORT root@YOUR_SERVER_IP
   cd ~/hotnews
   python -c "from pathlib import Path; from hotnews.kernel.admin.tag_init import init_tags; init_tags(Path.cwd())"
   ```

2. **验证初始化结果**
   ```bash
   sqlite3 output/online.db "SELECT type, COUNT(*) FROM tags GROUP BY type"
   ```

3. **访问 Admin 界面**
   - 打开浏览器访问 http://YOUR_SERVER_IP/admin/login
   - 登录后可以管理标签

4. **测试 API**
   ```bash
   curl http://YOUR_SERVER_IP/api/admin/tags/public/all
   ```

---

**文档创建时间**: 2026-01-19  
**服务器**: YOUR_SERVER_IP:YOUR_SSH_PORT  
**数据库**: ~/hotnews/output/online.db  
**当前状态**: 标签表已创建，等待初始化数据
