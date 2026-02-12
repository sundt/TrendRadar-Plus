/**
 * Hotnews Core Module
 * 核心工具函数和命名空间
 */

// 全局命名空间
export const TR = window.Hotnews = window.Hotnews || {};

// Ready 机制
const readyHandlers = [];
let isReady = false;

/**
 * Register a callback to run when the DOM is ready.
 * If the DOM is already ready, the handler runs immediately.
 * @param {() => void} handler
 */
export function ready(handler) {
    if (isReady) {
        handler();
    } else {
        readyHandlers.push(handler);
    }
}

document.addEventListener('DOMContentLoaded', function () {
    isReady = true;
    readyHandlers.forEach(h => {
        try { h(); } catch (e) { console.error('Ready handler error:', e); }
    });
});

/**
 * Escape HTML special characters to prevent XSS.
 * @param {*} str - Value to escape (coerced to string)
 * @returns {string}
 */
export function escapeHtml(str) {
    return String(str || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

/**
 * Format an "updated at" timestamp for display.
 * Converts "YYYY-MM-DD HH:MM:SS" to "MM-DD HH:MM".
 * @param {*} value - Raw timestamp string
 * @returns {string}
 */
export function formatUpdatedAt(value) {
    const raw = (value == null) ? '' : String(value).trim();
    if (!raw) return raw;

    const m1 = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::\d{2})?$/);
    if (m1) return `${m1[2]}-${m1[3]} ${m1[4]}:${m1[5]}`;

    const m2 = raw.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
    if (m2) return raw;

    return raw;
}

// 挂载到 TR 命名空间
TR.ready = ready;
TR.escapeHtml = escapeHtml;
TR.formatUpdatedAt = formatUpdatedAt;

/**
 * Format a news timestamp to relative time or date for display.
 * Shows "刚刚", "X分钟前", "X小时前", "X天前" for recent items,
 * and "M-D" or "YYYY-M-D" for older items.
 * @param {string|number} ts - Timestamp string (YYYY-MM-DD HH:MM:SS) or unix seconds
 * @returns {string} Formatted date or empty string
 */
export function formatNewsDate(ts) {
    if (ts == null || ts === '') return '';
    
    try {
        // Define valid date range: 2000-01-01 to current time + 7 days
        const MIN_TIMESTAMP = 946684800; // 2000-01-01 00:00:00 UTC (seconds)
        const now = Date.now();
        const MAX_TIMESTAMP = Math.floor(now / 1000) + (7 * 24 * 60 * 60); // Current + 7 days (seconds)
        const MAX_MS = now + (7 * 24 * 60 * 60 * 1000); // Current + 7 days (milliseconds)
        
        let ms = null;
        
        // Try unix timestamp (seconds or milliseconds)
        const num = Number(ts);
        if (Number.isFinite(num) && num > 0) {
            // Heuristic: if > 1e12, it's milliseconds; otherwise seconds
            if (num > 1e12) {
                // Milliseconds
                if (num < 946684800000 || num > MAX_MS) {
                    return '';
                }
                ms = num;
            } else {
                // Seconds
                if (num < MIN_TIMESTAMP || num > MAX_TIMESTAMP) {
                    return '';
                }
                ms = num * 1000;
            }
        }
        
        // Try parsing string like "2026-01-12 19:30:00"
        if (ms === null) {
            const s = String(ts || '').trim();
            const parsed = new Date(s.replace(' ', 'T'));
            if (!isNaN(parsed.getTime())) {
                ms = parsed.getTime();
            }
        }
        
        if (ms === null) return '';
        
        const d = new Date(ms);
        if (isNaN(d.getTime())) return '';
        
        // Double-check the year is reasonable
        const year = d.getFullYear();
        if (year < 2000 || year > new Date().getFullYear() + 1) {
            return '';
        }
        
        // Calculate relative time
        const diffMs = now - ms;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        // Future time or just now
        if (diffMins < 0) return '刚刚';
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return diffMins + '分钟前';
        if (diffHours < 24) return diffHours + '小时前';
        if (diffDays < 7) return diffDays + '天前';
        
        // Older than 7 days: show date
        const month = d.getMonth() + 1;
        const day = d.getDate();
        const nowDate = new Date();
        
        if (year === nowDate.getFullYear()) {
            return month + '-' + day;
        }
        return year + '-' + month + '-' + day;
        
    } catch (e) {
        // ignore
    }
    
    return '';
}

TR.formatNewsDate = formatNewsDate;

/**
 * Generate HTML for a news item with all standard features.
 * This is the canonical way to render news items across all modules.
 * 
 * Features included:
 * - News index number
 * - Clickable title with read state tracking
 * - AI indicator dot (shows if summarized)
 * - Summary button (hover to show)
 * - Date display
 * 
 * @param {Object} item - News item data
 * @param {string|number} item.id - Unique news ID
 * @param {string} item.title - News title
 * @param {string} item.url - News URL
 * @param {number} item.published_at - Unix timestamp (seconds)
 * @param {number} idx - Index number (1-based)
 * @param {Object} source - Source/tag info for summary tracking
 * @param {string} source.id - Source ID (e.g., tag_id, mp-fakeid)
 * @param {string} source.name - Source display name
 * @returns {string} HTML string for the news item
 */
export function renderNewsItemHtml(item, idx, source) {
    const dateStr = formatNewsDate(item.published_at || item.publish_time);
    const safeTitle = escapeHtml(item.title || '');
    const escapedTitle = (item.title || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const escapedUrl = (item.url || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const escapedSourceName = (source.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const sourceId = source.id || '';
    
    // AI indicator dot - shows green when summarized
    const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${item.id}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSourceName}')"></span>`;
    
    // Summary button - appears on hover
    const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${item.id}" data-title="${safeTitle}" data-url="${item.url || ''}" data-source-id="${sourceId}" data-source-name="${source.name || ''}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSourceName}')"></button>`;
    
    // Actions container (date + summary button)
    const dateHtml = dateStr ? `<span class="tr-news-date">${dateStr}</span>` : '';
    const actionsHtml = `<div class="news-actions">${dateHtml}${summaryBtnHtml}</div>`;
    
    return `
    <li class="news-item" data-news-id="${item.id}" data-news-title="${safeTitle}" data-news-url="${item.url || ''}">
        <div class="news-item-content">
            <span class="news-index">${idx}</span>
            <a class="news-title" href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)">
                ${item.title}
            </a>
            ${aiDotHtml}
            ${actionsHtml}
        </div>
    </li>
    `;
}

TR.renderNewsItemHtml = renderNewsItemHtml;

const _toastState = {
    container: null,
    nextId: 1,
    items: new Map(),
};

function _getToastContainer() {
    if (_toastState.container) return _toastState.container;
    const el = document.createElement('div');
    el.id = 'tr-toast-container';
    el.style.position = 'fixed';
    el.style.right = '16px';
    el.style.bottom = '16px';
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.gap = '10px';
    el.style.zIndex = '99999';
    try {
        document.body.appendChild(el);
    } catch (e) {
        // ignore
    }
    _toastState.container = el;
    return el;
}

function _toastStyleForVariant(variant) {
    const v = String(variant || 'info');
    if (v === 'loading') {
        return { bg: '#111827', fg: '#fff', border: '#111827' };
    }
    if (v === 'success') {
        return { bg: '#16a34a', fg: '#fff', border: '#16a34a' };
    }
    if (v === 'error') {
        return { bg: '#dc2626', fg: '#fff', border: '#dc2626' };
    }
    return { bg: '#111827', fg: '#fff', border: '#111827' };
}

function _renderToast(el, message, variant) {
    const styles = _toastStyleForVariant(variant);
    el.className = 'tr-toast';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.gap = '10px';
    el.style.padding = '10px 12px';
    el.style.borderRadius = '10px';
    el.style.background = styles.bg;
    el.style.color = styles.fg;
    el.style.border = `1px solid ${styles.border}`;
    el.style.boxShadow = '0 10px 20px rgba(0,0,0,0.18)';
    el.style.fontSize = '0.9rem';
    el.style.maxWidth = '360px';
    el.style.wordBreak = 'break-word';

    const v = String(variant || 'info');
    const prefix = (v === 'loading') ? '<span aria-hidden="true" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#60a5fa;box-shadow:0 0 0 2px rgba(96,165,250,0.3);"></span>' : '';
    el.innerHTML = `${prefix}<div class="tr-toast-msg">${escapeHtml(message || '')}</div>`;
}

/**
 * @typedef {Object} ToastOptions
 * @property {'info'|'loading'|'success'|'error'} [variant='info']
 * @property {number} [durationMs=0] - Auto-hide after ms (0 = manual hide)
 */

/** Toast notification system */
TR.toast = {
    /**
     * Show a toast notification.
     * @param {string} message
     * @param {ToastOptions} [opts]
     * @returns {string} Toast ID for update/hide
     */
    show(message, opts = {}) {
        const id = `toast-${_toastState.nextId++}`;
        const container = _getToastContainer();
        const el = document.createElement('div');
        el.dataset.toastId = id;
        _renderToast(el, message, opts.variant);
        try {
            container.appendChild(el);
        } catch (e) {
            // ignore
        }
        const item = {
            id,
            el,
            hideTimer: 0,
        };
        _toastState.items.set(id, item);
        const durationMs = Number(opts.durationMs || 0);
        if (durationMs > 0) {
            item.hideTimer = window.setTimeout(() => {
                TR.toast.hide(id);
            }, durationMs);
        }
        return id;
    },
    /**
     * Update an existing toast's message and variant.
     * @param {string} id - Toast ID from show()
     * @param {string} message
     * @param {ToastOptions} [opts]
     */
    update(id, message, opts = {}) {
        const item = _toastState.items.get(String(id || ''));
        if (!item) return;
        if (item.hideTimer) {
            window.clearTimeout(item.hideTimer);
            item.hideTimer = 0;
        }
        _renderToast(item.el, message, opts.variant);
        const durationMs = Number(opts.durationMs || 0);
        if (durationMs > 0) {
            item.hideTimer = window.setTimeout(() => {
                TR.toast.hide(id);
            }, durationMs);
        }
    },
    /**
     * Hide and remove a toast.
     * @param {string} id - Toast ID from show()
     */
    hide(id) {
        const item = _toastState.items.get(String(id || ''));
        if (!item) return;
        if (item.hideTimer) {
            window.clearTimeout(item.hideTimer);
            item.hideTimer = 0;
        }
        try {
            item.el.remove();
        } catch (e) {
            // ignore
        }
        _toastState.items.delete(String(id || ''));
    }
};

/**
 * Memory cleanup utilities
 * Helps reduce memory usage by cleaning up unused DOM and caches
 */
TR.cleanup = {
    /**
     * Get current memory stats (if available)
     */
    getMemoryStats() {
        try {
            if (performance && performance.memory) {
                return {
                    usedJSHeapSize: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024),
                    totalJSHeapSize: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024),
                    jsHeapSizeLimit: Math.round(performance.memory.jsHeapSizeLimit / 1024 / 1024),
                };
            }
        } catch (e) {
            // ignore
        }
        return null;
    },

    /**
     * Count DOM nodes for debugging
     */
    countDOMNodes() {
        try {
            const newsItems = document.querySelectorAll('.news-item').length;
            const platformCards = document.querySelectorAll('.platform-card').length;
            const totalNodes = document.getElementsByTagName('*').length;
            return { newsItems, platformCards, totalNodes };
        } catch (e) {
            return null;
        }
    },

    /**
     * Force garbage collection hint (not guaranteed)
     */
    hint() {
        try {
            // Create and discard large objects to hint GC
            const arr = new Array(1000000);
            arr.fill(0);
            arr.length = 0;
        } catch (e) {
            // ignore
        }
    }
};
