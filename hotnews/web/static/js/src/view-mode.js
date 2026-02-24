/**
 * View Mode Module — 栏目视图模式管理
 *
 * 每个栏目可独立设置 timeline（时间线）或 card（卡片）模式。
 * 偏好存储在 localStorage，切换时通过 events 通知其他模块。
 */

import { TR } from './core.js';
import { storage } from './storage.js';
import { events } from './events.js';
import { preferences } from './preferences.js';

const STORAGE_KEY = 'hotnews_view_mode_v1';

// 不可切换的栏目
const FIXED_CATEGORIES = {
    'discovery': 'card',       // 新发现 — 固定卡片
    'rsscol-rss': 'card',      // RSS 阅读器 — 固定
    'explore': 'timeline',     // 精选博客 — 固定时间线
};

/**
 * 递归在 window._columnConfig 树中查找 catId
 * 找到则返回该节点，否则返回 null
 */
function _findInColumnConfig(catId) {
    const tree = window._columnConfig;
    if (!Array.isArray(tree)) return null;
    function _search(nodes) {
        for (const node of nodes) {
            if (String(node.id || '') === String(catId)) return node;
            if (Array.isArray(node.children) && node.children.length) {
                const found = _search(node.children);
                if (found) return found;
            }
        }
        return null;
    }
    return _search(tree);
}

function _load() {
    try {
        const raw = storage.getRaw(STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function _save(map) {
    try { storage.setRaw(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

export const viewMode = {
    /**
     * 获取栏目的视图模式
     * @returns {'timeline' | 'card'}
     */
    get(categoryId) {
        const cid = String(categoryId || '');
        if (FIXED_CATEGORIES[cid]) return FIXED_CATEGORIES[cid];
        // Tag-driven 栏目（在 column_config 树中）固定时间线
        if (_findInColumnConfig(cid)) return 'timeline';
        const map = _load();
        if (map[cid]) return map[cid];
        // 默认值：finance 默认时间线，其余默认卡片
        return cid === 'finance' ? 'timeline' : 'card';
    },

    /**
     * 设置栏目的视图模式
     */
    set(categoryId, mode) {
        const cid = String(categoryId || '');
        if (FIXED_CATEGORIES[cid]) return; // 不可切换
        const m = mode === 'timeline' ? 'timeline' : 'card';
        const map = _load();
        map[cid] = m;
        _save(map);
        // Sync to server for cross-device consistency
        preferences.updatePreferences({ view_mode: map }).catch(() => {});
        events.emit('viewMode:changed', { categoryId: cid, mode: m });
    },

    /**
     * 切换栏目视图模式
     */
    toggle(categoryId) {
        const current = this.get(categoryId);
        const next = current === 'timeline' ? 'card' : 'timeline';
        this.set(categoryId, next);
        return next;
    },

    /**
     * 是否可切换
     */
    canSwitch(categoryId) {
        const cid = String(categoryId || '');
        if (FIXED_CATEGORIES[cid]) return false;
        // Tag-driven 栏目固定时间线，不可切换
        if (_findInColumnConfig(cid)) return false;
        return true;
    },
};

TR.viewMode = viewMode;
