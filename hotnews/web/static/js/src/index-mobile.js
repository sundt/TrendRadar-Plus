/**
 * Hotnews Viewer - 移动端入口
 * 排除 PC 端专用模块（拖拽排序、右键菜单、hover 预览等），减少 bundle 体积
 */

// 核心模块（必须最先导入）
import './core.js';
import './storage.js';
import './events.js';

// 基础功能模块
import './counts.js';
import './link.js';
import './search.js';
import './scroll.js';
import './badges.js';
import './paging.js';

// 依赖基础模块的功能
import './read-state.js';
import './theme.js';
import './settings.js';
import './filter.js';
import './view-mode.js';
import './category-timeline.js';
import './tabs.js';
import './data.js';
import './infinite-scroll.js';
// category-tab-reorder.js — PC 端拖拽排序，移动端不需要
// title-drag-scroll.js — PC 端标题拖拽滚动，移动端不需要
import './explore-timeline.js';
import './rss-category-carousel.js';
import './click-tracker.js';
import './auth.js';
import './my-tags.js';
import './discovery.js';
import './finance-timeline.js';
import './openclaw-timeline.js';
import './source-subscription.js';
import './login-modal.js';
// 以下模块改为动态加载（code-split），减少主 bundle 体积
import('./summary-modal.js');
import('./favorites.js');
import './article-tags.js';
// context-menu.js — PC 端右键菜单，移动端用 ActionSheet 替代
import('./comment-preview.js');
// snippet-preview.js — PC 端 hover 预览，移动端不需要
import('./todo.js');
import('./subscribe-sidebar.js');
import('./payment.js');

// 异步加载非关键 heavy 模块 (Code Splitting)
// platform-reorder.js — PC 端拖拽排序，移动端不需要
import('./subscription.js');
import('./rss-catalog-preview-parity.js');
import('./explore-embedded-rss.js');
import('./topic-tracker.js');

// 初始化模块（必须最后导入）
import './init.js';

// 导出 TR 命名空间供外部使用
export { TR } from './core.js';
