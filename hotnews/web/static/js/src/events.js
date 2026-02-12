/**
 * Hotnews Event Bus
 * 轻量级发布-订阅事件总线，替代猴子补丁链
 */

import { TR } from './core.js';

const _listeners = new Map();

export const events = {
    /**
     * 注册事件监听器
     * @param {string} event - 事件名称
     * @param {Function} fn - 回调函数
     * @param {number} [priority=0] - 优先级，数值越小越先执行
     */
    on(event, fn, priority = 0) {
        if (typeof event !== 'string' || !event) return;
        if (typeof fn !== 'function') return;

        if (!_listeners.has(event)) {
            _listeners.set(event, []);
        }
        const list = _listeners.get(event);
        list.push({ fn, priority });
        list.sort((a, b) => a.priority - b.priority);
    },

    /**
     * 移除事件监听器
     * @param {string} event - 事件名称
     * @param {Function} fn - 要移除的回调函数引用
     */
    off(event, fn) {
        if (typeof event !== 'string' || !event) return;
        const list = _listeners.get(event);
        if (!list) return;
        const idx = list.findIndex(l => l.fn === fn);
        if (idx >= 0) list.splice(idx, 1);
        if (list.length === 0) _listeners.delete(event);
    },

    /**
     * 触发事件，按优先级顺序调用所有监听器
     * @param {string} event - 事件名称
     * @param {...*} args - 传递给监听器的参数
     */
    emit(event, ...args) {
        if (typeof event !== 'string' || !event) return;
        const list = _listeners.get(event);
        if (!list || !list.length) return;
        // Snapshot to avoid issues if listeners modify the list during emit
        const snapshot = list.slice();
        for (const entry of snapshot) {
            try {
                entry.fn(...args);
            } catch (e) {
                console.error(`[EventBus] Error in listener for "${event}":`, e);
            }
        }
    },

    /**
     * 查询某事件的所有监听器（调试用）
     * @param {string} event - 事件名称
     * @returns {Array<{ fn: Function, priority: number }>}
     */
    listeners(event) {
        if (typeof event !== 'string' || !event) return [];
        const list = _listeners.get(event);
        return list ? list.slice() : [];
    },
};

TR.events = events;
