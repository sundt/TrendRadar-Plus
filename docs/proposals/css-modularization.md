# CSS 模块化拆分方案

## 背景

`viewer.css` 当前有 **6716 行**，包含了整个应用的所有样式，维护困难、加载效率低。

## 拆分方案

将 viewer.css 拆分为以下模块：

```
static/css/
├── viewer.css              # 主入口，@import 其他模块
├── base/
│   ├── variables.css       # CSS 变量、主题色 (~50行)
│   └── reset.css           # 基础重置、body、html (~100行)
├── layout/
│   ├── header.css          # 头部卡片、统计行 (~200行)
│   ├── tabs.css            # 栏目 Tab 导航 (~300行)
│   └── grid.css            # 平台卡片网格布局 (~400行)
├── components/
│   ├── platform-card.css   # 平台卡片样式 (~400行)
│   ├── news-item.css       # 新闻条目样式 (~300行)
│   ├── buttons.css         # 按钮统一样式 (~200行)
│   └── skeleton.css        # 骨架屏加载 (~50行)
├── features/
│   ├── summary-modal.css   # AI 摘要弹窗 (~600行)
│   ├── payment-modal.css   # 支付弹窗 (~400行)
│   ├── login-modal.css     # 登录弹窗 (~400行)
│   ├── favorites.css       # 收藏面板 (~350行)
│   ├── todo.css            # 待办侧边栏 (~450行)
│   ├── subscribe.css       # 订阅侧边栏 (~600行)
│   ├── settings-modal.css  # 栏目设置弹窗 (~500行)
│   ├── article-tags.css    # 文章标签 (~150行)
│   └── rss.css             # RSS 阅读模式 (~300行)
├── themes/
│   └── eye-protection.css  # 护眼模式 (~400行)
└── responsive/
    └── mobile.css          # 移动端适配 (~300行)
```

## 模块划分依据

| 模块 | 行数估算 | 说明 |
|------|---------|------|
| variables.css | ~50 | `:root` 变量定义 |
| reset.css | ~100 | body, html, scrollbar |
| header.css | ~200 | `.header-card`, `.stats-row`, `.stat-card` |
| tabs.css | ~300 | `.category-tabs`, `.category-tab`, 拖拽 |
| grid.css | ~400 | `.platform-grid`, 响应式列数 |
| platform-card.css | ~400 | `.platform-card`, `.platform-header` |
| news-item.css | ~300 | `.news-item`, `.news-title`, `.news-index` |
| buttons.css | ~200 | `.icon-btn`, `.fetch-btn`, 通用按钮 |
| skeleton.css | ~50 | `.tr-news-skeleton` |
| summary-modal.css | ~600 | `.summary-modal`, `.summary-content` |
| payment-modal.css | ~400 | `.payment-modal`, `.payment-plan-card` |
| login-modal.css | ~400 | `.login-modal`, QR 登录 |
| favorites.css | ~350 | `.favorites-panel`, `.favorite-item` |
| todo.css | ~450 | `.todo-sidebar`, `.todo-group` |
| subscribe.css | ~600 | `.subscribe-sidebar`, 各 tab 样式 |
| settings-modal.css | ~500 | `.settings-modal`, `.category-item` |
| article-tags.css | ~150 | `.article-tag-suffix` |
| rss.css | ~300 | `#tab-rsscol-rss`, RSS 专属样式 |
| eye-protection.css | ~400 | `body.eye-protection-mode` 所有覆盖 |
| mobile.css | ~300 | `@media (max-width: 640px)` 集中 |

## 主入口文件

```css
/* viewer.css - 主入口 */
@import './base/variables.css';
@import './base/reset.css';

@import './layout/header.css';
@import './layout/tabs.css';
@import './layout/grid.css';

@import './components/platform-card.css';
@import './components/news-item.css';
@import './components/buttons.css';
@import './components/skeleton.css';

@import './features/summary-modal.css';
@import './features/payment-modal.css';
@import './features/login-modal.css';
@import './features/favorites.css';
@import './features/todo.css';
@import './features/subscribe.css';
@import './features/settings-modal.css';
@import './features/article-tags.css';
@import './features/rss.css';

@import './themes/eye-protection.css';
@import './responsive/mobile.css';
```

## 实施步骤

1. **创建目录结构** - 建立 base/, layout/, components/, features/, themes/, responsive/ 目录
2. **提取 variables.css** - 先提取 `:root` 变量
3. **逐模块拆分** - 按功能模块逐个提取，每次提取后验证页面正常
4. **整合响应式** - 将分散的 `@media` 查询按模块整合或集中到 mobile.css
5. **整合护眼模式** - 将 `body.eye-protection-mode` 相关样式集中
6. **构建优化** - 生产环境合并压缩

## 优先级建议

高优先级（独立性强，易拆分）：
- `variables.css` - 无依赖
- `payment-modal.css` - 完全独立
- `login-modal.css` - 完全独立
- `todo.css` - 完全独立
- `subscribe.css` - 完全独立

中优先级：
- `summary-modal.css`
- `favorites.css`
- `settings-modal.css`
- `article-tags.css`

低优先级（耦合较多）：
- `news-item.css` - 与多处有关联
- `platform-card.css` - 核心组件
- `eye-protection.css` - 需覆盖所有模块

## 注意事项

1. **CSS 变量作用域** - 确保 `:root` 变量在最前加载
2. **选择器优先级** - 拆分后注意选择器权重不变
3. **@import 顺序** - 后加载的可覆盖前面的
4. **构建工具** - 生产环境需合并减少 HTTP 请求
5. **渐进式迁移** - 可先拆分独立模块，逐步完成

## 预期收益

- **可维护性** ↑ - 按功能定位文件
- **协作效率** ↑ - 减少合并冲突
- **加载性能** ↑ - 按需加载（配合构建工具）
- **代码复用** ↑ - 组件样式可独立引用
