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
    'openclaw': 'timeline',    // OpenClaw — 固定时间线
    'finance': 'timeline',     // 财经 — 固定时间线
};

// 自管理栏目：虽然在 column_config 树中有记录，但不是 tag-driven，允许切换视图模式
const SELF_MANAGED = ['my-tags', 'discovery', 'explore'];

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
        // Tag-driven 栏目（在 column_config 树中），自管理栏目除外
        if (!SELF_MANAGED.includes(cid)) {
            const node = _findInColumnConfig(cid);
            if (node) {
                // fixed_view is a top-level field on the node (extracted from source_filter by backend)
                if (node.fixed_view) return node.fixed_view;
                // 不可切换的栏目：忽略用户偏好，直接返回默认值
                if (!this.canSwitch(cid)) return 'timeline';
                // 可切换的栏目：走用户偏好，默认 timeline
                const map = _load();
                return map[cid] || 'timeline';
            }
        }
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
        // column_config 中有 fixed_view 的栏目也不可覆盖
        const node = _findInColumnConfig(cid);
        if (node?.fixed_view) return;
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
        // 只有 my-tags 和 topic-* 可以切换视图模式
        if (cid === 'my-tags' || cid.startsWith('topic-')) return true;
        return false;
    },
};

TR.viewMode = viewMode;

// 判断某个栏目的 viewMode 偏好是否应该被忽略/清理
// 如果栏目不可切换（canSwitch=false），用户偏好就不应该存在
function _shouldIgnorePreference(cid) {
    if (FIXED_CATEGORIES[cid]) return true;
    const node = _findInColumnConfig(cid);
    if (node?.fixed_view) return true;
    // 栏目在 column_config 中但不可切换 → 偏好无意义，应清理
    if (node && !viewMode.canSwitch(cid)) return true;
    return false;
}

// 页面加载时异步从服务器同步 view_mode（已登录用户）
// 先用 localStorage 缓存渲染，服务器数据到达后更新本地
(async function _syncViewModeFromServer() {
    try {
        const prefs = await preferences.getPreferences();
        if (!prefs?.view_mode || typeof prefs.view_mode !== 'object') return;
        const local = _load();
        let changed = false;
        let serverDirty = false;
        const cleanedServerMap = { ...prefs.view_mode };

        for (const [k, v] of Object.entries(prefs.view_mode)) {
            if (_shouldIgnorePreference(k)) {
                // 服务端存了不该存的偏好，本地不同步，并标记需要清理服务端
                delete cleanedServerMap[k];
                if (local[k]) { delete local[k]; changed = true; }
                serverDirty = true;
                continue;
            }
            if (local[k] !== v) { local[k] = v; changed = true; }
        }

        // 同时清理本地已有的固定栏目脏数据
        for (const k of Object.keys(local)) {
            if (_shouldIgnorePreference(k)) {
                delete local[k];
                changed = true;
                serverDirty = true;
                if (!(k in cleanedServerMap)) continue;
                delete cleanedServerMap[k];
            }
        }

        if (changed) {
            _save(local);
            console.log('[ViewMode] Synced from server (cleaned fixed modes)');
        }

        // 清理服务端脏数据
        if (serverDirty) {
            preferences.updatePreferences({ view_mode: cleanedServerMap }).catch(() => {});
            console.log('[ViewMode] Cleaned fixed-mode entries from server');
        }
    } catch (e) { /* ignore */ }
})();
