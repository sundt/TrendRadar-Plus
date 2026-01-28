# 需求文档：新发现栏目

## 简介

"新发现"栏目是一个展示 AI 发现的热门标签及其新闻的公开栏目。该栏目位于"我的关注"右侧，无需登录即可查看，支持一键关注标签。栏目展示最多 30 个符合晋升标准的 NEW 动态标签，每个标签卡片显示最新 50 条相关新闻。

## 术语表

- **Discovery_Tab**: 新发现栏目，展示 AI 发现的热门标签
- **NEW_Tag**: 符合晋升标准的动态标签候选，带有 NEW 徽章
- **Tag_Card**: 标签卡片，显示标签名称和相关新闻列表
- **One_Click_Follow**: 一键关注功能，通过右键菜单关注标签
- **My_Tags_Tab**: 我的关注栏目，显示用户已关注的标签新闻

## 需求

### 需求 1：栏目显示与位置

**用户故事：** 作为用户，我希望在"我的关注"右侧看到"新发现"栏目，这样我可以发现 AI 识别的热门话题。

#### 验收标准

1. THE Discovery_Tab SHALL 显示在 My_Tags_Tab 的右侧位置
2. THE Discovery_Tab SHALL 使用名称"✨ 新发现"
3. WHEN 用户未登录时 THEN Discovery_Tab SHALL 正常显示内容（无需登录）
4. WHEN 用户已登录时 THEN Discovery_Tab SHALL 保持在 My_Tags_Tab 右侧位置
5. THE Discovery_Tab SHALL 在栏目列表中固定位置，不受用户自定义排序影响

### 需求 2：标签卡片展示

**用户故事：** 作为用户，我希望看到热门标签的卡片，每个卡片显示标签名称和相关新闻，这样我可以快速了解热点话题。

#### 验收标准

1. THE Discovery_Tab SHALL 最多显示 30 个 Tag_Card
2. EACH Tag_Card SHALL 显示标签名称、图标和 NEW 徽章
3. EACH Tag_Card SHALL 显示标签的发现日期（格式：发现于 MM-DD）
4. EACH Tag_Card SHALL 显示最多 50 条相关新闻
5. THE Tag_Card 列表 SHALL 按热度（occurrence_count）降序排列
6. WHEN 没有符合标准的 NEW 标签时 THEN System SHALL 显示空状态提示

### 需求 3：新闻列表展示

**用户故事：** 作为用户，我希望在每个标签卡片中看到相关新闻列表，这样我可以了解该话题的最新动态。

#### 验收标准

1. EACH 新闻项 SHALL 显示序号、标题、发布日期
2. WHEN 用户点击新闻标题 THEN System SHALL 在新标签页打开原文链接
3. THE 新闻列表 SHALL 按发布时间降序排列（最新在前）
4. EACH 新闻项 SHALL 支持 AI 总结功能（与其他栏目一致）
5. THE 新闻列表 SHALL 支持已读状态标记

### 需求 4：一键关注功能

**用户故事：** 作为用户，我希望能快速关注感兴趣的标签，这样该标签的新闻会出现在"我的关注"中。

#### 验收标准

1. WHEN 用户右键点击 Tag_Card THEN System SHALL 显示上下文菜单
2. THE 上下文菜单 SHALL 包含"➕ 一键关注"选项
3. WHEN 用户未登录并点击"一键关注" THEN System SHALL 弹出登录框
4. WHEN 用户已登录并点击"一键关注" THEN System SHALL 调用 API 关注该标签
5. WHEN 关注成功后 THEN System SHALL 显示 Toast 提示"已关注"
6. WHEN 关注成功后 THEN System SHALL 清除 My_Tags_Tab 的前端缓存

### 需求 5：数据加载与缓存

**用户故事：** 作为用户，我希望栏目能快速加载，这样我可以流畅地浏览内容。

#### 验收标准

1. WHEN Discovery_Tab 激活时 THEN System SHALL 检查前端缓存（localStorage）
2. IF 前端缓存有效（10分钟内） THEN System SHALL 直接使用缓存数据渲染
3. IF 前端缓存无效 THEN System SHALL 调用 API 获取数据
4. THE 后端 API SHALL 使用全局缓存（10分钟 TTL）
5. WHEN 数据加载中 THEN System SHALL 显示加载状态
6. WHEN 数据加载失败 THEN System SHALL 显示错误状态和重试按钮

### 需求 6：标签晋升标准

**用户故事：** 作为系统，我需要根据标准筛选符合条件的 NEW 标签，确保展示的标签具有足够的热度和可信度。

#### 验收标准

1. THE System SHALL 显示符合以下任一条件的标签候选：
   - 快速通道 4h: 首次发现 ≥ 4小时前，出现次数 ≥ 8，置信度 ≥ 0.9
   - 快速通道 12h: 首次发现 ≥ 12小时前，出现次数 ≥ 15，置信度 ≥ 0.9
   - 快速通道 24h: 首次发现 ≥ 24小时前，出现次数 ≥ 20，置信度 ≥ 0.8
   - 标准通道: 首次发现 ≤ 3天前，出现次数 ≥ 10，置信度 ≥ 0.7
2. WHEN 标签被晋升为正式标签后 THEN System SHALL 从 Discovery_Tab 中移除
3. WHEN 标签热度下降不再符合标准 THEN System SHALL 从 Discovery_Tab 中移除

### 需求 7：动态更新机制

**用户故事：** 作为用户，我希望看到最新的热门标签和新闻，这样我不会错过重要话题。

#### 验收标准

1. THE Tag_Card 列表 SHALL 随着新标签的发现动态增加
2. THE Tag_Card 列表 SHALL 随着标签晋升或热度下降动态减少
3. EACH Tag_Card 的新闻列表 SHALL 随着新新闻的发布动态更新
4. THE 缓存 SHALL 每 10 分钟自动失效，触发数据刷新
