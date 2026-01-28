# ✨ 新发现栏目实现方案

## 概述

在"我的关注"栏目右边新增"新发现"栏目，展示 AI 发现的 NEW 标签及其最新新闻，无需登录即可查看。

## 功能定位

| 特性 | 我的关注 | 新发现 |
|------|---------|--------|
| 数据来源 | 用户关注的标签 | NEW 动态标签候选 |
| 登录要求 | 需要 | 不需要 |
| 右键操作 | 取消关注 | 一键关注 |
| 卡片标记 | 无 | NEW 标记 |
| 缓存时间 | 5分钟 | 10分钟 |
| 卡片数量 | 按用户关注 | 最多30个 |
| 每卡新闻数 | 50条 | 50条 |

## 栏目位置

登录后栏目顺序：`我的关注` → `新发现` → `深入探索` → ...

## 技术方案

### 1. 后端 API

#### 1.1 新增接口 `GET /api/discovery-news`

**文件**: `hotnews/hotnews/kernel/user/preferences_api.py`

```python
@router.get("/discovery-news")
async def get_discovery_news(
    request: Request,
    news_limit: int = Query(50, ge=1, le=100),  # 每个标签的新闻数量
    tag_limit: int = Query(30, ge=1, le=50),    # 最多返回的标签数量
):
    """获取新发现标签及其新闻（公开接口，无需登录）
    
    返回符合晋升标准的 NEW 动态标签候选，每个标签附带最新新闻。
    数据来源：复用 recommended-tags 中的 new_tags 逻辑。
    """
```

**返回数据结构**:
```json
{
    "ok": true,
    "tags": [
        {
            "tag": {
                "id": "deepseek",
                "name": "DeepSeek",
                "icon": "🏷️",
                "badge": "new",
                "first_seen_date": "01-25",
                "occurrence_count": 15,
                "confidence": 0.92
            },
            "news": [
                {
                    "id": "xxx",
                    "title": "DeepSeek发布新模型...",
                    "url": "https://...",
                    "published_at": 1706428800,
                    "source_name": "36氪"
                }
            ],
            "count": 50
        }
    ],
    "cached": true,
    "cache_age": 120.5
}
```

#### 1.2 缓存策略

- 使用独立的缓存 key: `discovery_news`
- TTL: 10 分钟（600秒）
- 缓存粒度：全局缓存（所有用户共享）

### 2. 前端模块

#### 2.1 新建 `discovery.js`

**文件**: `hotnews/hotnews/web/static/js/src/discovery.js`

```javascript
/**
 * Discovery Module - 新发现栏目
 * 展示 AI 发现的热门标签及其新闻
 * 无需登录即可查看，支持一键关注
 */

const DISCOVERY_CATEGORY_ID = 'discovery';
const DISCOVERY_CACHE_KEY = 'hotnews_discovery_cache';
const DISCOVERY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// 主要功能：
// 1. loadDiscovery() - 加载新发现数据
// 2. renderDiscoveryNews() - 渲染标签卡片
// 3. handleFollowTag() - 一键关注功能
// 4. 右键菜单集成
```

#### 2.2 卡片渲染

每个标签卡片包含：
- 标签名称 + NEW 徽章
- 发现日期
- 最新 50 条新闻列表
- 右键菜单：一键关注

```html
<div class="platform-card discovery-card" data-tag-id="deepseek">
    <div class="platform-header">
        <div class="platform-name">
            🏷️ DeepSeek
            <span class="discovery-badge">NEW</span>
            <span class="discovery-date">发现于 01-25</span>
        </div>
    </div>
    <ul class="news-list">
        <!-- 50条新闻列表 -->
    </ul>
</div>
```

### 3. 栏目注册

#### 3.1 添加栏目配置

**文件**: `hotnews/hotnews/web/news_viewer.py`

```python
# 特殊栏目（固定位置）
SPECIAL_CATEGORIES = ['explore', 'my-tags', 'discovery', 'knowledge']
```

#### 3.2 Tab 渲染

**文件**: `hotnews/hotnews/web/static/js/src/tabs.js`

```javascript
// 添加 discovery 的特殊处理
if (categoryId === 'discovery') {
    return `
        <div class="tab-pane${activeClass}" id="tab-${escapeHtml(categoryId)}">
            <div class="platform-grid" id="discoveryGrid">
                <div class="discovery-loading">加载中...</div>
            </div>
        </div>
    `;
}
```

### 4. 右键菜单集成

**文件**: `hotnews/hotnews/web/static/js/src/platform-reorder.js`

```javascript
// 为 discovery 栏目的卡片添加"一键关注"选项
if (categoryId === 'discovery') {
    menuHtml = `
        <div class="tr-ctx-item" data-action="follow">➕ 一键关注</div>
    `;
}
```

### 5. 样式定义

```css
/* NEW 徽章样式 */
.discovery-badge {
    display: inline-block;
    padding: 2px 6px;
    background: linear-gradient(135deg, #10b981, #059669);
    color: white;
    font-size: 10px;
    font-weight: 600;
    border-radius: 4px;
    margin-left: 8px;
    animation: pulse 2s infinite;
}

/* 发现日期 */
.discovery-date {
    font-size: 11px;
    color: #9ca3af;
    margin-left: 8px;
}

/* 卡片悬停效果 */
.discovery-card:hover {
    border-color: #10b981;
    box-shadow: 0 4px 12px rgba(16, 185, 129, 0.15);
}
```

## 实现步骤

### Phase 1: 后端 API（预计 2 小时）

1. [ ] 在 `preferences_api.py` 添加 `/api/discovery-news` 接口
2. [ ] 复用 `recommended-tags` 中的 new_tags 查询逻辑
3. [ ] 添加新闻查询（通过 rss_entry_tags 关联）
4. [ ] 实现全局缓存（10分钟 TTL）

### Phase 2: 前端模块（预计 3 小时）

1. [ ] 创建 `discovery.js` 模块
2. [ ] 实现数据加载和前端缓存
3. [ ] 实现卡片渲染（复用 my-tags 的卡片结构）
4. [ ] 添加 NEW 徽章和发现日期显示
5. [ ] 集成到 index.js 打包

### Phase 3: 栏目集成（预计 2 小时）

1. [ ] 在 `tabs.js` 添加 discovery 的 Tab 渲染
2. [ ] 在 `news_viewer.py` 添加栏目配置
3. [ ] 确保栏目排序：我的关注 → 新发现 → 深入探索
4. [ ] 添加 Tab 切换事件监听

### Phase 4: 交互功能（预计 2 小时）

1. [ ] 实现右键菜单"一键关注"
2. [ ] 关注后刷新"我的关注"缓存
3. [ ] 添加关注成功 Toast 提示
4. [ ] 处理未登录时的关注流程（弹出登录框）

## 数据流

```
┌─────────────────────────────────────────────────────────────┐
│                        用户访问                              │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    前端 discovery.js                         │
│  1. 检查 localStorage 缓存（10分钟）                          │
│  2. 缓存命中 → 直接渲染                                       │
│  3. 缓存未命中 → 调用 API                                     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              GET /api/discovery-news                         │
│  1. 检查服务端缓存（10分钟）                                   │
│  2. 缓存命中 → 返回缓存数据                                    │
│  3. 缓存未命中 → 查询数据库                                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      数据库查询                               │
│  1. 从 tag_candidates 获取符合标准的 NEW 标签（最多30个）       │
│  2. 从 rss_entry_tags + rss_entries 获取每个标签的新闻（50条） │
│  3. 按热度（occurrence_count）排序                            │
└─────────────────────────────────────────────────────────────┘
```

## 动态变化机制

### 卡片增加
- AI 发现新热点标签 → 达到展示标准 → 自动出现在栏目中

### 卡片消失
- 标签被自动晋升（每天一次）→ 从 NEW 变成正式标签 → 消失
- 标签被管理员手动通过 → 消失
- 标签热度下降，不再符合标准 → 消失

### 卡片内容更新
- 每个标签卡片显示的新闻会随时更新（最新的相关新闻）
- 缓存 10 分钟后自动刷新

## 晋升标准（复用现有逻辑）

符合以下任一条件的候选标签会显示：

1. **快速通道 4h**: 首次发现 ≥ 4小时前，出现次数 ≥ 8，置信度 ≥ 0.9
2. **快速通道 12h**: 首次发现 ≥ 12小时前，出现次数 ≥ 15，置信度 ≥ 0.9
3. **快速通道 24h**: 首次发现 ≥ 24小时前，出现次数 ≥ 20，置信度 ≥ 0.8
4. **标准通道**: 首次发现 ≤ 3天前，出现次数 ≥ 10，置信度 ≥ 0.7

## 注意事项

1. **无需登录**: 这是公开数据，任何用户都可以查看
2. **关注需登录**: 点击"一键关注"时，如果未登录则弹出登录框
3. **缓存一致性**: 关注标签后需要清除 my-tags 的前端缓存
4. **性能考虑**: 最多显示 30 个标签，每个标签最多 50 条新闻
5. **排序规则**: 按热度（occurrence_count）降序排列
6. **栏目位置**: 登录后固定在"我的关注"右边
