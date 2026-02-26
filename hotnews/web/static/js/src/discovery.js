/**
 * Discovery Module (✨ 新发现)
 * Handles the "新发现" category tab with infinite scroll pagination.
 */

import { formatNewsDate } from './core.js';
import { events } from './events.js';

const CATEGORY_ID = 'discovery';
const INITIAL_CARDS_DESKTOP = 3;
const INITIAL_CARDS_MOBILE = 1;
const BATCH_SIZE = 3;

// State
let _offset = 0;
let _total = -1;
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

function _getNewsLimit() {
    return (window.SYSTEM_SETTINGS && window.SYSTEM_SETTINGS.display && window.SYSTEM_SETTINGS.display.items_per_card) || 50;
}

function _getGrid() {
    return document.getElementById('discoveryGrid') || null;
}

function _getPane() {
    return document.getElementById('tab-discovery') || null;
}

async function _fetchBatch(limit, offset) {
    const newsLimit = _getNewsLimit();
    const url = `/api/user/preferences/discovery-news?limit=${limit}&offset=${offset}&news_limit=${newsLimit}&tag_limit=30`;
    const resp = await fetch(url, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
}

function _createDiscoveryCard(tagData) {
    const { tag, news, count } = tagData;
    const tagIcon = tag.icon || '🏷️';
    const tagName = tag.name || tag.id;
    const firstSeenDate = tag.first_seen_date || '';

    const newsListHtml = news && news.length > 0
        ? news.map((item, idx) => {
            const dateStr = formatNewsDate(item.published_at);
            const safeTitle = (item.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedTitle = safeTitle.replace(/'/g, "\\'");
            const escapedUrl = (item.url || '').replace(/'/g, "\\'");
            const escapedTagName = (tagName || '').replace(/'/g, "\\'");
            const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${item.id}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${tag.id}', '${escapedTagName}')"></span>`;
            const dateHtml = dateStr ? `<span class="tr-news-date">${dateStr}</span>` : '';
            const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${item.id}" data-title="${safeTitle}" data-url="${item.url || ''}" data-source-id="${tag.id}" data-source-name="${tagName || ''}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${tag.id}', '${escapedTagName}')"></button>`;
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
        : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无相关新闻</li>';

    const card = document.createElement('div');
    card.className = 'platform-card discovery-card';
    card.dataset.platform = tag.id;
    card.dataset.tagId = tag.id;
    card.dataset.candidate = 'true';
    card.draggable = false;
    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                ${tagIcon} ${tagName}
                <span class="discovery-badge">NEW</span>
                <span class="discovery-date">发现于 ${firstSeenDate}</span>
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list">${newsListHtml}</ul>`;
    return card;
}

function _createSentinel(container) {
    const existing = container.querySelector('#discovery-load-sentinel');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.id = 'discovery-load-sentinel';
    el.style.cssText = 'min-width:20px;height:100%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;';
    el.innerHTML = '⏳';
    container.appendChild(el);
    return el;
}

function _removeSentinel() {
    const s = document.getElementById('discovery-load-sentinel');
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
    const sentinel = document.getElementById('discovery-load-sentinel');
    if (sentinel) _observer.observe(sentinel);
}

async function _loadNextBatch() {
    if (_inFlight || _finished) return;
    _inFlight = true;
    const myGen = _generation;
    try {
        const result = await _fetchBatch(BATCH_SIZE, _offset);
        if (myGen !== _generation) return;
        const tags = result.tags || [];
        _total = result.total != null ? result.total : _total;
        if (!tags.length) { _finished = true; _removeSentinel(); return; }
        const grid = _getGrid();
        if (!grid) return;
        const sentinel = grid.querySelector('#discovery-load-sentinel');
        for (const tagData of tags) {
            const card = _createDiscoveryCard(tagData);
            if (sentinel) grid.insertBefore(card, sentinel);
            else grid.appendChild(card);
        }
        _offset += tags.length;
        if (_total >= 0 && _offset >= _total) { _finished = true; _removeSentinel(); }
        try { window.TR?.readState?.restoreReadState?.(); } catch (e) { /* */ }
    } catch (e) {
        console.error('[Discovery] loadNextBatch error:', e);
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

    grid.innerHTML = `<div style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;"><div style="font-size:48px;margin-bottom:16px;">✨</div><div>发现中...</div></div>`;

    try {
        const count = _getInitialCount();
        const result = await _fetchBatch(count, 0);
        if (myGen !== _generation) return;
        const tags = result.tags || [];
        _total = result.total != null ? result.total : 0;

        const currentGrid = _getGrid();
        if (!currentGrid) return;
        currentGrid.innerHTML = '';

        if (!tags.length) {
            currentGrid.innerHTML = `<div style="text-align:center;padding:60px 20px;width:100%;"><div style="font-size:64px;margin-bottom:20px;">✨</div><div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">暂无新发现</div><div style="font-size:14px;color:#6b7280;">AI 正在持续发现热门话题，稍后再来看看吧</div></div>`;
            _initialized = true;
            return;
        }

        for (const tagData of tags) {
            currentGrid.appendChild(_createDiscoveryCard(tagData));
        }
        _offset = tags.length;
        _initialized = true;

        if (_total >= 0 && _offset >= _total) {
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
        console.error('[Discovery] Initial load failed:', e);
        const g = _getGrid();
        if (g) g.innerHTML = `<div style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;"><div style="font-size:48px;margin-bottom:16px;">😕</div><div>加载失败</div><button onclick="window.HotNews?.discovery?.load(true)" style="margin-top:16px;padding:8px 16px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;">重试</button></div>`;
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
        const pane = document.querySelector('#tab-discovery.active');
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
window.HotNews.discovery = {
    load: (force) => { if (force) resetState(); _initialLoad().catch(() => {}); },
    resetState,
    clearCache: () => { try { localStorage.removeItem('hotnews_discovery_cache'); } catch (e) { /* */ } },
    getStatus: () => ({ offset: _offset, total: _total, finished: _finished, inFlight: _inFlight, initialized: _initialized }),
};

export const discovery = { resetState };
