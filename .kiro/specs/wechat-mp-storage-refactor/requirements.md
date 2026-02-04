# 公众号存储架构重构

## 背景

当前公众号数据分散在三个表中，职责重叠，管理混乱：

| 表名 | 数据库 | 当前用途 |
|------|--------|----------|
| `featured_wechat_mps` | 在线库 | 管理员精选公众号 |
| `wechat_mp_subscriptions` | 用户库 | 用户订阅的公众号 |
| `rss_sources` (category='wechat_mp') | 在线库 | 主题追踪 AI 推荐的公众号 |

### 问题

1. 同一个公众号可能存在于多个表中，数据冗余
2. 主题追踪推荐的公众号写入 `rss_sources`，但调度器用 `featured_wechat_mps`，导致推荐的公众号无法被抓取
3. 用户订阅公众号和订阅 RSS 是两套逻辑，增加维护成本
4. "订阅源" tab 需要手动过滤 `category='wechat_mp'`，容易遗漏

## 目标

统一公众号存储架构，实现：
- 公众号数据单一来源
- 简化订阅逻辑
- 确保所有公众号都能被调度器抓取

---

## User Stories

### US-1: 统一公众号主表

**作为** 系统管理员  
**我希望** 所有公众号数据存储在统一的表中  
**以便** 简化数据管理和调度逻辑

#### 接受标准

- [ ] 1.1 `featured_wechat_mps` 作为公众号唯一主表
- [ ] 1.2 新增 `source` 字段区分来源：`admin`（管理员添加）、`ai_recommend`（AI推荐）、`user`（用户添加）
- [ ] 1.3 新增 `added_by_user_id` 字段记录添加者（用户添加时）
- [ ] 1.4 从 `rss_sources` 中移除 `category='wechat_mp'` 的数据

### US-2: 主题追踪公众号推荐

**作为** 用户  
**我希望** 主题追踪推荐的公众号能被系统抓取  
**以便** 获取相关公众号的最新文章

#### 接受标准

- [ ] 2.1 主题追踪 AI 推荐公众号时，写入 `featured_wechat_mps` 表（source='ai_recommend'）
- [ ] 2.2 推荐的公众号自动启用（enabled=1），可被调度器抓取
- [ ] 2.3 如果公众号已存在，不重复创建

### US-3: 用户手动添加公众号

**作为** 用户  
**我希望** 在快速订阅中手动添加公众号  
**以便** 订阅系统中没有的公众号

#### 接受标准

- [ ] 3.1 用户添加的公众号写入 `featured_wechat_mps`（source='user'）
- [ ] 3.2 记录添加者 user_id
- [ ] 3.3 添加后自动订阅该公众号

### US-4: 订阅源与公众号分离

**作为** 用户  
**我希望** "订阅源" tab 只显示 RSS 源，"公众号" tab 只显示公众号  
**以便** 清晰区分两种内容来源

#### 接受标准

- [ ] 4.1 `/api/sources/all` 不返回公众号数据
- [ ] 4.2 `rss_sources` 表不再存储公众号
- [ ] 4.3 公众号相关 API 只查询 `featured_wechat_mps` 和 `wechat_mp_subscriptions`

### US-5: 数据迁移

**作为** 系统管理员  
**我希望** 现有数据平滑迁移  
**以便** 不影响现有功能

#### 接受标准

- [ ] 5.1 迁移脚本将 `rss_sources` 中 `category='wechat_mp'` 的数据迁移到 `featured_wechat_mps`
- [ ] 5.2 迁移后删除 `rss_sources` 中的公众号数据
- [ ] 5.3 迁移过程记录日志，支持回滚

---

## 技术方案概要

### 表结构变更

```sql
-- featured_wechat_mps 新增字段
ALTER TABLE featured_wechat_mps ADD COLUMN source TEXT DEFAULT 'admin';
-- 'admin': 管理员添加
-- 'ai_recommend': AI推荐
-- 'user': 用户添加

ALTER TABLE featured_wechat_mps ADD COLUMN added_by_user_id INTEGER;
```

### 影响范围

1. **主题追踪** (`topic_api.py`)
   - `_create_wechat_mp_source()` 改为写入 `featured_wechat_mps`

2. **订阅源 API** (`source_subscription_api.py`)
   - 已完成：过滤 `category='wechat_mp'`

3. **公众号 API** (`wechat_admin.py`)
   - 查询时包含所有 source 类型

4. **调度器** (`wechat_scheduler.py`)
   - 无需修改，已使用 `featured_wechat_mps`

### 迁移步骤

1. 添加新字段到 `featured_wechat_mps`
2. 运行迁移脚本
3. 更新主题追踪代码
4. 清理 `rss_sources` 中的公众号数据
