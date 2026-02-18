/**
 * Featured MPs Module (精选公众号)
 * Handles the "精选公众号" category tab with infinite scroll pagination.
 */

import { formatNewsDate } from './core.js';
import { events } from './events.js';

const CATEGORY_ID = 'featured-mps';
const INITIAL_CARDS_DESKTOP = 3;
const INITIAL_CARDS_MOBILE = 1;
const BATCH_SIZE = 3;

// WeChat icon SVGs
const WECHAT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="#07c160" width="48" height="48"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>`;
const WECHAT_ICON_SMALL = `<svg viewBox="0 0 24 24" fill="#07c160" width="18" height="18" style="vertical-align:middle;margin-right:6px;"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>`;

// State
let _offset = 0;
let _total = -1; // unknown until first fetch
let _finished = false;
let _inFlight = false;
let _initialized = false;
let _generation = 0;
let _observer = null;

function _isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 640px)').matches);
}

function _getInitialCount() {
    return _isMobile() ? INITIAL_CARDS_MOBILE : INITIAL_CARDS_DESKTOP;
}

function _getArticleLimit() {
    return _isMobile() ? 20 : 50;
}

function _getGrid() {
    return document.getElementById('featuredMpsGrid') || null;
}

function _getPane() {
    return document.getElementById('tab-featured-mps') || null;
}

async function _fetchBatch(limit, offset) {
    const artLimit = _getArticleLimit();
    const url = `/api/featured-mps?limit=${limit}&offset=${offset}&article_limit=${artLimit}`;
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
}

function _createMPCard(mp) {
    const { fakeid, nickname, round_head_img, articles } = mp;
    const avatarUrl = round_head_img
        ? `/api/wechat/avatar-proxy?url=${encodeURIComponent(round_head_img)}`
        : '';
    const avatarHtml = avatarUrl
        ? `<img src="${avatarUrl}" alt="" style="width:20px;height:20px;border-radius:50%;margin-right:6px;vertical-align:middle;" onerror="this.style.display='none'">`
        : WECHAT_ICON_SMALL;

    const newsListHtml = articles && articles.length > 0
        ? articles.map((item, idx) => {
            const dateStr = formatNewsDate(item.publish_time);
            const safeTitle = (item.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedTitle = safeTitle.replace(/'/g, "\\'");
            const escapedUrl = (item.url || '').replace(/'/g, "\\'");
            const escapedNickname = (nickname || '').replace(/'/g, "\\'");
            const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${item.id}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', 'mp-${fakeid}', '${escapedNickname}')"></span>`;
            const dateHtml = dateStr ? `<span class="tr-news-date">${dateStr}</span>` : '';
            const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${item.id}" data-title="${safeTitle}" data-url="${item.url || ''}" data-source-id="mp-${fakeid}" data-source-name="${nickname || ''}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', 'mp-${fakeid}', '${escapedNickname}')"></button>`;
            const commentBtnHtml = `<button class="news-comment-btn" data-url="${(item.url || '').replace(/"/g, '&quot;')}" data-title="${safeTitle}"></button>`;
            const actionsHtml = `<div class="news-actions">${dateHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;
            return `
            <li class="news-item" data-news-id="${item.id}" data-news-title="${safeTitle}" data-news-url="${item.url || ''}">
                <div class="news-item-content">
                    <span class="news-index">${idx + 1}</span>
                    <a class="news-title" href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)">
                        ${item.title}
                    </a>
                    ${aiDotHtml}
                    ${actionsHtml}
                </div>
            </li>`;
        }).join('')
        : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无文章</li>';

    const card = document.createElement('div');
    card.className = 'platform-card';
    card.dataset.platform = fakeid;
    card.dataset.mpFakeid = fakeid;
    card.draggable = false;
    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                ${avatarHtml}${nickname}
                <span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${articles?.length || 0}条)</span>
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list">${newsListHtml}</ul>`;
    return card;
}

function _createSentinel(container) {
    const existing = container.querySelector('#fmp-load-sentinel');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'fmp-load-sentinel';
    el.style.cssText = 'min-width:20px;height:100%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;';
    el.innerHTML = '⏳';
    container.appendChild(el);
    return el;
}

function _removeSentinel() {
    const s = document.getElementById('fmp-load-sentinel');
    if (s) s.remove();
}

function _attachObserver() {
    if (_observer) { try { _observer.disconnect(); } catch (e) { /* */ } _observer = null; }
    const pane = _getPane();
    if (!pane) return;
    _observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) _loadNextBatch().catch(() => {});
        }
    }, { root: pane.querySelector('.platform-grid'), rootMargin: '200px', threshold: 0.01 });
    const sentinel = document.getElementById('fmp-load-sentinel');
    if (sentinel) _observer.observe(sentinel);
}

async function _loadNextBatch() {
    if (_inFlight || _finished) return;
    _inFlight = true;
    const myGen = _generation;
    try {
        const result = await _fetchBatch(BATCH_SIZE, _offset);
        if (myGen !== _generation) return;
        const mps = result.mps || [];
        _total = result.total || _total;
        if (!mps.length) { _finished = true; _removeSentinel(); return; }
        const grid = _getGrid();
        if (!grid) return;
        const sentinel = grid.querySelector('#fmp-load-sentinel');
        for (const mp of mps) {
            const card = _createMPCard(mp);
            if (sentinel) grid.insertBefore(card, sentinel);
            else grid.appendChild(card);
        }
        _offset += mps.length;
        if (_offset >= _total) { _finished = true; _removeSentinel(); }
        try { window.TR?.readState?.restoreReadState?.(); } catch (e) { /* */ }
    } catch (e) {
        console.error('[FeaturedMPs] loadNextBatch error:', e);
    } finally {
        _inFlight = false;
    }
}

async function _initialLoad() {
    const grid = _getGrid();
    if (!grid) return;
    _offset = 0;
    _finished = false;
    _initialized = false;
    const myGen = _generation;

    grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;"><div style="margin-bottom:16px;">${WECHAT_ICON_SVG}</div><div>加载中...</div></div>`;

    try {
        const count = _getInitialCount();
        const result = await _fetchBatch(count, 0);
        if (myGen !== _generation) return;
        const mps = result.mps || [];
        _total = result.total || 0;

        const currentGrid = _getGrid();
        if (!currentGrid) return;
        currentGrid.innerHTML = '';

        if (!mps.length) {
            currentGrid.innerHTML = `<div style="text-align:center;padding:60px 20px;width:100%;"><div style="margin-bottom:20px;">${WECHAT_ICON_SVG}</div><div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">暂无精选公众号</div></div>`;
            _initialized = true;
            return;
        }

        for (const mp of mps) {
            currentGrid.appendChild(_createMPCard(mp));
        }
        _offset = mps.length;
        _initialized = true;

        if (_offset >= _total) {
            _finished = true;
        } else {
            _createSentinel(currentGrid);
            _attachObserver();
        }

        try { window.TR?.readState?.restoreReadState?.(); } catch (e) { /* */ }

        // Restore scroll from navigation state
        if (myGen > 0 || window._trNoRebuildExpected) {
            try {
                const navState = window.TR?.scroll?.peekNavigationState?.() || null;
                if (navState && navState.activeTab === CATEGORY_ID) {
                    const consumed = window.TR.scroll.consumeNavigationState();
                    requestAnimationFrame(() => {
                        window.TR.scroll.restoreNavigationScrollY(consumed || navState);
                        window.TR.scroll.restoreNavGridScroll(consumed || navState);
                    });
                }
            } catch (e) { /* */ }
        }
    } catch (e) {
        console.error('[FeaturedMPs] Initial load failed:', e);
        const g = _getGrid();
        if (g) g.innerHTML = `<div style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;"><div style="font-size:48px;margin-bottom:16px;">😕</div><div>加载失败</div><button onclick="window.HotNews?.featuredMps?.load(true)" style="margin-top:16px;padding:8px 16px;background:#07c160;color:white;border:none;border-radius:6px;cursor:pointer;">重试</button></div>`;
    }
}

function resetState() {
    _offset = 0;
    _total = -1;
    _finished = false;
    _inFlight = false;
    _initialized = false;
    _generation++;
    if (_observer) { try { _observer.disconnect(); } catch (e) { /* */ } _observer = null; }
}

// --- Event wiring ---

events.on('viewer:rendered', () => {
    resetState();
    setTimeout(() => {
        const pane = document.querySelector('#tab-featured-mps.active');
        if (pane) _initialLoad().catch(() => {});
    }, 100);
});

events.on('tab:switched', (detail) => {
    if (String(detail?.categoryId || '') !== CATEGORY_ID) return;
    if (_inFlight) return;
    const grid = _getGrid();
    const hasCards = grid && grid.querySelectorAll('.platform-card').length > 0;
    if (hasCards) {
        if (!_finished) _attachObserver();
    } else {
        _initialLoad().catch(() => {});
    }
});

// Public API
window.HotNews = window.HotNews || {};
window.HotNews.featuredMps = {
    load: (force) => { if (force) resetState(); _initialLoad().catch(() => {}); },
    resetState,
    getStatus: () => ({ offset: _offset, total: _total, finished: _finished, inFlight: _inFlight, initialized: _initialized }),
};

export const featuredMps = { resetState };
