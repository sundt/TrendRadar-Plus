# 用户偏好设置云同步方案

## 背景

目前用户的一些偏好设置存储在浏览器 localStorage 中，导致：
- 换设备/浏览器后设置丢失
- 清除浏览器数据后设置丢失
- 无法跨设备同步

## 需要同步的设置

| 设置项 | 当前存储 | 优先级 |
|--------|----------|--------|
| 栏目顺序 | localStorage (`hotnews_category_config`) | 高 |
| 栏目显示/隐藏 | localStorage (`hotnews_category_config`) | 高 |
| 主题偏好（深色/浅色） | localStorage (`hotnews_theme`) | 中 |
| 收藏侧边栏宽度 | localStorage | 低 |
| 待办侧边栏宽度 | localStorage | 低 |

## 方案设计

### 1. 数据库表设计

在 `user.db` 中新增表：

```sql
CREATE TABLE user_preferences (
    user_id INTEGER PRIMARY KEY,
    category_order TEXT DEFAULT '[]',      -- JSON: 栏目顺序 ["social", "finance", ...]
    hidden_categories TEXT DEFAULT '[]',   -- JSON: 隐藏的栏目 ["sports", ...]
    theme TEXT DEFAULT 'light',            -- 主题: light/dark/auto
    sidebar_widths TEXT DEFAULT '{}',      -- JSON: 各侧边栏宽度 {"favorites": 400, "todo": 320}
    updated_at INTEGER NOT NULL
);
```

### 2. API 设计

```
GET  /api/user/preferences     - 获取用户偏好设置
PUT  /api/user/preferences     - 更新用户偏好设置（全量）
PATCH /api/user/preferences    - 部分更新（只更新传入的字段）
```

### 3. 前端逻辑

#### 读取设置
```
1. 检查用户是否登录
2. 如果已登录：
   - 从服务器获取设置
   - 缓存到 localStorage（作为离线备份）
3. 如果未登录：
   - 从 localStorage 读取
```

#### 保存设置
```
1. 检查用户是否登录
2. 如果已登录：
   - 保存到服务器
   - 同时更新 localStorage 缓存
3. 如果未登录：
   - 只保存到 localStorage
```

#### 登录时同步
```
1. 用户登录成功后
2. 获取服务器设置
3. 如果服务器有设置：使用服务器设置
4. 如果服务器无设置：将本地设置上传到服务器
```

### 4. 实现步骤

#### Phase 1: 后端 API（1-2小时）
- [ ] 创建 `user_preferences` 表
- [ ] 实现 GET/PUT/PATCH API
- [ ] 添加到 server.py 路由

#### Phase 2: 前端封装（2-3小时）
- [ ] 创建 `preferences.js` 模块
- [ ] 封装读写逻辑（自动判断登录状态）
- [ ] 实现登录时同步逻辑

#### Phase 3: 迁移现有代码（2-3小时）
- [ ] 迁移栏目配置（`settings.js`, `user_settings.js`）
- [ ] 迁移主题设置（`theme.js`）
- [ ] 迁移侧边栏宽度（`favorites.js`, `todo.js`）

#### Phase 4: 测试（1小时）
- [ ] 测试登录/未登录场景
- [ ] 测试跨设备同步
- [ ] 测试离线场景

### 5. 兼容性考虑

- 老用户首次登录时，自动将 localStorage 设置迁移到服务器
- 保留 localStorage 作为缓存，提升加载速度
- 未登录用户体验不变

## 预计工时

总计：6-9 小时

## 是否需要创建 Spec？

这个功能相对独立，可以：
1. 直接实现（如果你想快速完成）
2. 创建 Spec 文档（如果想要更规范的流程）

你选择哪种方式？
