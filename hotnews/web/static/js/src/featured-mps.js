/**
 * Featured MPs Module (精选公众号) - Timeline Card Mode
 * 所有精选公众号文章按时间倒序排列，每卡片50条，横向滚动无限加载。
 */

import { TR, ready, escapeHtml, formatNewsDate } from './core.js';
import { events } from './events.js';
import { viewMode } from './view-mode.js';

const CATEGORY_ID = 'featured-mps';
const INITIAL_CARDS_DESKTOP = 3;
const INITIAL_CARDS_MOBILE = 1;
const MAX_CARDS = 20;

function _getInitialCards() {
    return window.innerWidth <= 640 ? INITIAL_CARDS_MOBILE : INITIAL_CARDS_DESKTOP;
}

function getItemsPerCard() {
    return (window.SYSTEM_SETTINGS?.display?.items_per_card) || 50;
}

let _inFlight = false;
let _offset = 0;
let _observer = null;
let _finished = false;
let _initialized = false;
let _generation = 0;
let _lastRefreshAt = 0;

function _getActiveTabId() {
    try {
        return document.querySelector('.sub-tabs .sub-tab.active')?.dataset?.category || null;
    } catch (e) { return null; }
}

function _fmtTime(tsSec) { return formatNewsDate(tsSec); }

function _buildNewsItemsHtml(items) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return '<li class="tr-fmp-empty" aria-hidden="true">暂无内容</li>';
    return arr.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '#');
        const sourceName = escapeHtml(n?.source_name || '公众号');
        const t = _fmtTime(n?.published_at || n?.created_at);
        const timeHtml = t ? `<span class="tr-news-date">${escapeHtml(t)}</span>` : '';
        const escapedTitle = title.replace(/'/g, "\\'");
        const escapedUrl = url.replace(/'/g, "\\'");
        const escapedSource = sourceName.replace(/'/g, "\\'");
        const sourceId = escapeHtml(n?.source_id || 'featured-mps');
        const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${stableId}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSource}')"></span>`;
        const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${stableId}" data-title="${title.replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}" data-source-id="${sourceId}" data-source-name="${sourceName.replace(/"/g, '&quot;')}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSource}')"></button>`;
        const commentBtnHtml = `<button class="news-comment-btn" data-url="${url.replace(/"/g, '&quot;')}" data-title="${title.replace(/"/g, '&quot;')}"></button>`;
        const actionsHtml = `<div class="news-actions">${timeHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;
        return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}" data-news-url="${url}">
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${url}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)">
                        ${title}
                    </a>
                    ${aiDotHtml}
                    ${actionsHtml}
                </div>
            </li>`;
    }).join('');
}

function _getPane() { return document.getElementById(`tab-${CATEGORY_ID}`); }
function _getGrid() {
    const pane = _getPane();
    return pane ? pane.querySelector('.platform-grid') : null;
}

function _ensureLayout() {
    const pane = _getPane();
    if (!pane) return false;
    let grid = pane.querySelector('.platform-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'platform-grid';
        pane.appendChild(grid);
    }
    grid.style.display = 'flex';
    grid.style.flexDirection = 'row';
    grid.style.overflowX = 'auto';
    grid.style.overflowY = 'hidden';
    grid.style.alignItems = 'flex-start';
    grid.style.overscrollBehavior = 'contain';
    return true;
}

async function _fetchTimelineBatch(limit, offset) {
    const url = `/api/rss/featured-mps/timeline?limit=${limit}&offset=${offset}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    return Array.isArray(payload?.items) ? payload.items : [];
}

function _appendCard(items, cardIndex, container) {
    if (!items || !items.length) return;
    const card = document.createElement('div');
    card.className = 'platform-card tr-fmp-card';
    card.style.minWidth = '360px';
    card.dataset.platform = `fmp-slice-${cardIndex}`;
    card.draggable = false;

    const limit = getItemsPerCard();
    const displayStart = cardIndex * limit + 1;
    const displayEnd = cardIndex * limit + items.length;

    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                📱 最新 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" data-fmp-list="slice-${cardIndex}">
            ${_buildNewsItemsHtml(items)}
        </ul>
    `;
    const indices = card.querySelectorAll('.news-index');
    indices.forEach((el, i) => { el.textContent = String(displayStart + i); });

    const sentinel = container.querySelector('#fmp-load-sentinel');
    if (sentinel) container.insertBefore(card, sentinel);
    else container.appendChild(card);
}

function _createSentinel(container) {
    const existing = container.querySelector('#fmp-load-sentinel');
    if (existing) existing.remove();
    const sentinel = document.createElement('div');
    sentinel.id = 'fmp-load-sentinel';
    sentinel.style.cssText = 'min-width:20px;height:100%;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#9ca3af;';
    sentinel.innerHTML = '⏳';
    container.appendChild(sentinel);
    return sentinel;
}

function _attachObserver() {
    if (_observer) { try { _observer.disconnect(); } catch (e) {} _observer = null; }
    const pane = _getPane();
    if (!pane) return;
    _observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) _loadNextBatch().catch(() => {});
        }
    }, { root: pane.querySelector('.platform-grid'), rootMargin: '200px', threshold: 0.01 });
    const sentinel = pane.querySelector('#fmp-load-sentinel');
    if (sentinel) _observer.observe(sentinel);
}

async function _loadNextBatch() {
    if (_inFlight || _finished) return;
    const currentCardCount = Math.floor(_offset / getItemsPerCard());
    if (currentCardCount >= MAX_CARDS) {
        _finished = true;
        const s = document.getElementById('fmp-load-sentinel');
        if (s) { s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已达到最大显示数量</div>'; s.style.width = '40px'; }
        return;
    }
    _inFlight = true;
    const myGen = _generation;
    try {
        const limit = getItemsPerCard();
        const items = await _fetchTimelineBatch(limit, _offset);
        if (myGen !== _generation) return;
        if (!items.length) {
            _finished = true;
            const s = document.getElementById('fmp-load-sentinel');
            if (s) { s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已显示全部内容</div>'; s.style.width = '40px'; }
            return;
        }
        const grid = _getGrid();
        if (grid) {
            const cardIndex = Math.floor(_offset / limit);
            _appendCard(items, cardIndex, grid);
            try { TR.readState?.restoreReadState?.(); } catch (e) {}
        }
        _offset += items.length;
        if (items.length < limit) {
            _finished = true;
            const s = document.getElementById('fmp-load-sentinel');
            if (s) s.remove();
        }
    } catch (e) {
        console.error('[FeaturedMPs] loadNextBatch error:', e);
    } finally { _inFlight = false; }
}

async function _loadTimeline() {
    const grid = _getGrid();
    if (!grid) return;
    const myGen = _generation;
    _offset = 0;
    _finished = false;
    grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">⏳ 加载中...</div>';

    try {
        const limit = getItemsPerCard();
        const neededCards = _getInitialCards();
        const initialLimit = limit * neededCards;
        const items = await _fetchTimelineBatch(initialLimit, 0);
        if (myGen !== _generation) return;
        const currentGrid = _getGrid();
        if (!currentGrid) return;
        currentGrid.innerHTML = '';
        if (!items.length) {
            currentGrid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
            _initialized = true;
            return;
        }
        _createSentinel(currentGrid);
        for (let i = 0; i < items.length; i += limit) {
            const chunk = items.slice(i, i + limit);
            const cardIndex = Math.floor(i / limit);
            _appendCard(chunk, cardIndex, currentGrid);
        }
        _offset = items.length;
        _initialized = true;
        if (items.length < initialLimit) {
            _finished = true;
            const s = document.getElementById('fmp-load-sentinel');
            if (s) s.remove();
        } else {
            _attachObserver();
        }
        try { TR.readState?.restoreReadState?.(); } catch (e) {}
    } catch (e) {
        console.error('[FeaturedMPs] loadTimeline error:', e);
        const g = _getGrid();
        if (g) g.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;"><div style="font-size:24px;margin-bottom:8px;">⚠️</div><div>加载失败</div><button onclick="window.HotNews?.featuredMps?.load(true)" style="margin-top:12px;padding:8px 16px;background:#07c160;color:white;border:none;border-radius:6px;cursor:pointer;">重试</button></div>`;
    }
}

async function _initialLoad() {
    if (_inFlight) return;
    _finished = false;
    if (!_ensureLayout()) {
        setTimeout(() => _initialLoad().catch(() => {}), 500);
        return;
    }
    _inFlight = true;
    try {
        await _loadTimeline();
        if (_initialized) _lastRefreshAt = Date.now();
    } finally { _inFlight = false; }
}

function resetState() {
    _offset = 0;
    _finished = false;
    _inFlight = false;
    _initialized = false;
    _generation++;
    _lastRefreshAt = 0;
    if (_observer) { try { _observer.disconnect(); } catch (e) {} _observer = null; }
}

// --- Event wiring ---
events.on('viewer:rendered', () => {
    if (viewMode.get(CATEGORY_ID) !== 'timeline') return;
    if (_observer) { try { _observer.disconnect(); } catch (e) {} _observer = null; }
    resetState();
    const gen = _generation;
    setTimeout(() => {
        if (gen !== _generation) return;
        _initialLoad().catch(() => {});
    }, 80);
});

events.on('tab:switched', (detail) => {
    if (String(detail?.categoryId || '') !== CATEGORY_ID) return;
    if (viewMode.get(CATEGORY_ID) !== 'timeline') return;
    if (_inFlight) return;
    const grid = _getGrid();
    const hasCards = grid && grid.querySelectorAll('.tr-fmp-card').length > 0;
    if (hasCards) {
        if (!_finished) _attachObserver();
    } else {
        _initialLoad().catch(() => {});
    }
});

window.HotNews = window.HotNews || {};
window.HotNews.featuredMps = {
    load: (force) => { if (force) resetState(); _initialLoad().catch(() => {}); },
    resetState,
    getStatus: () => ({ offset: _offset, finished: _finished, inFlight: _inFlight, initialized: _initialized }),
};

export const featuredMps = { resetState };
