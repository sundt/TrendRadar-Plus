import { TR, ready, escapeHtml } from './core.js';

const MORNING_BRIEF_CATEGORY_ID = 'knowledge';
const SINCE_STORAGE_KEY = 'tr_morning_brief_since_v1';
const LATEST_BASELINE_WINDOW_SEC = 2 * 3600;
const TAB_SWITCHED_EVENT = 'tr_tab_switched';
const AUTO_REFRESH_INTERVAL_MS = 300000;

const ITEMS_PER_CARD = 50;
const INITIAL_CARDS = 3; // First load 3 cards (150 items)

let _mbInFlight = false;
let _mbLastRefreshAt = 0;
let _tabSwitchDebounceTimer = null;
let _mbOffset = 0;
let _mbObserver = null;
let _mbFinished = false;

function _getActiveTabId() {
    try {
        return document.querySelector('.category-tabs .category-tab.active')?.dataset?.category || null;
    } catch (e) {
        return null;
    }
}

function _applyPagingToCard(card) {
    try {
        TR.paging?.setCardPageSize?.(card, 50);
        TR.paging?.applyPagingToCard?.(card, 0);
    } catch (e) {
        // ignore
    }
}

function _fmtTime(tsSec) {
    const ts = Number(tsSec || 0) || 0;
    if (!ts) return '';
    try {
        const d = new Date(ts * 1000);
        const YYYY = String(d.getFullYear());
        const MM = String(d.getMonth() + 1).padStart(2, '0');
        const DD = String(d.getDate()).padStart(2, '0');
        return `${YYYY}-${MM}-${DD}`;
    } catch (e) {
        return '';
    }
}

function _buildNewsItemsHtml(items, opts = {}) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) {
        const emptyText = escapeHtml(opts.emptyText || '暂无内容');
        return `<li class="tr-mb-empty" aria-hidden="true">${emptyText}</li>`;
    }
    return arr.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '#');
        const t = _fmtTime(n?.published_at || n?.created_at);
        const timeHtml = t ? `<span class="tr-mb-time" style="margin-left:8px;color:#9ca3af;font-size:12px;">${escapeHtml(t)}</span>` : '';
        return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}">
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${url}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                        ${title}
                    </a>
                    ${timeHtml}
                </div>
            </li>`;
    }).join('');
}

function _getPane() {
    return document.getElementById(`tab-${MORNING_BRIEF_CATEGORY_ID}`);
}

function _getGrid() {
    const pane = _getPane();
    return pane ? pane.querySelector('.platform-grid') : null;
}

function _ensureLayout() {
    const pane = _getPane();
    if (!pane) return false;

    // Ensure grid exists
    let grid = pane.querySelector('.platform-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'platform-grid';
        // Force horizontal scroll if not already applied by CSS
        grid.style.display = 'flex';
        grid.style.flexDirection = 'row';
        grid.style.overflowX = 'auto';
        grid.style.overflowY = 'hidden';
        grid.style.alignItems = 'flex-start'; // Align items to top
        pane.appendChild(grid);
    }

    // Mark as injected
    try {
        if (grid.dataset) grid.dataset.mbInjected = '1';
    } catch (e) { }

    return true;
}

async function _fetchJson(url) {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
}

/**
 * Fetch a batch of items (limit/offset).
 */
async function _fetchTimelineBatch(limit, offset) {
    const url = `/api/rss/brief/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}`;
    const payload = await _fetchJson(url);
    return Array.isArray(payload?.items) ? payload.items : [];
}

/**
 * Add a card to the grid
 */
function _appendCard(items, startIdx, endIdx, container) {
    if (!items || !items.length) return;

    const card = document.createElement('div');
    card.className = 'platform-card tr-morning-brief-card';
    card.style.minWidth = '360px'; // Ensure cards have width
    card.dataset.platform = `mb-slice-${startIdx}`;
    card.draggable = false;

    // Adjust logic to correctly display range like 1-50, 51-100
    // startIdx is 0-based offset, so display is startIdx+1
    const displayStart = startIdx + 1;
    const displayEnd = startIdx + items.length;

    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                🕒 最新 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" data-mb-list="slice-${startIdx}">
            ${_buildNewsItemsHtml(items, { emptyText: '暂无内容' })}
        </ul>
    `;

    // Convert rendered indices to continue from the offset
    // _buildNewsItemsHtml uses 0-based index + 1. 
    // We need to shift these indices.
    const indices = card.querySelectorAll('.news-index');
    indices.forEach((el, i) => {
        el.textContent = String(displayStart + i);
    });

    // Insert before sentinel if exists
    const sentinel = container.querySelector('#mb-load-sentinel');
    if (sentinel) {
        container.insertBefore(card, sentinel);
    } else {
        container.appendChild(card);
    }

    _applyPagingToCard(card);
}

function _createSentinel(container) {
    // Remove existing if any
    const existing = container.querySelector('#mb-load-sentinel');
    if (existing) existing.remove();

    const sentinel = document.createElement('div');
    sentinel.id = 'mb-load-sentinel';
    sentinel.style.minWidth = '20px'; // Small width
    sentinel.style.height = '100%';
    sentinel.style.flexShrink = '0';
    sentinel.innerHTML = '<div style="width:20px;height:100%;display:flex;align-items:center;justify-content:center;color:#9ca3af;">⏳</div>';
    container.appendChild(sentinel);
    return sentinel;
}

function _attachObserver() {
    if (_mbObserver) {
        _mbObserver.disconnect();
        _mbObserver = null;
    }

    const pane = _getPane();
    if (!pane) return;

    _mbObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                _loadNextBatch().catch(() => { });
            }
        }
    }, {
        root: pane.querySelector('.platform-grid'), // The scrolling container
        rootMargin: '200px', // Preload when close
        threshold: 0.01
    });

    const sentinel = pane.querySelector('#mb-load-sentinel');
    if (sentinel) {
        _mbObserver.observe(sentinel);
    }
}

/**
 * Infinite scroll step
 */
async function _loadNextBatch() {
    if (_mbInFlight || _mbFinished) return;

    _mbInFlight = true;
    try {
        // Fetch next page
        const limit = ITEMS_PER_CARD;
        const items = await _fetchTimelineBatch(limit, _mbOffset);

        if (!items.length) {
            _mbFinished = true;
            // Remove sentinel
            const s = document.getElementById('mb-load-sentinel');
            if (s) {
                s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已显示全部内容</div>';
                s.style.width = '40px';
            }
            return;
        }

        const grid = _getGrid();
        if (grid) {
            _appendCard(items, _mbOffset, _mbOffset + items.length, grid);
        }

        _mbOffset += items.length;

        if (items.length < limit) {
            _mbFinished = true;
            const s = document.getElementById('mb-load-sentinel');
            if (s) s.remove();
        }

    } catch (e) {
        // Error
    } finally {
        _mbInFlight = false;
    }
}

/**
 * Initial Full Reload
 */
async function _loadTimeline() {
    const grid = _getGrid();
    if (!grid) return;

    // Reset state
    _mbOffset = 0;
    _mbFinished = false;
    grid.innerHTML = ''; // Clear all

    // Create Sentinel immediately so we can insert before it
    _createSentinel(grid);

    // Fetch Initial Batch (3 cards = 150 items)
    const initialLimit = ITEMS_PER_CARD * INITIAL_CARDS;
    const items = await _fetchTimelineBatch(initialLimit, 0);

    if (!items.length) {
        grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
        return;
    }

    // Chunk into cards
    for (let i = 0; i < items.length; i += ITEMS_PER_CARD) {
        const chunk = items.slice(i, i + ITEMS_PER_CARD);
        _appendCard(chunk, i, i + chunk.length, grid); // i is the offset
    }

    _mbOffset = items.length;

    if (items.length < initialLimit) {
        // No more data
        _mbFinished = true;
        const s = document.getElementById('mb-load-sentinel');
        if (s) s.remove();
    } else {
        // Setup observer for next batches
        _attachObserver();
    }
}

async function _refreshTimelineIfNeeded(opts = {}) {
    const force = opts.force === true;
    if (_getActiveTabId() !== MORNING_BRIEF_CATEGORY_ID) return false;

    // Simple cooldown if not forced
    const now = Date.now();
    if (!force && _mbLastRefreshAt > 0 && (now - _mbLastRefreshAt) < (AUTO_REFRESH_INTERVAL_MS - 5000)) {
        return false;
    }

    if (!_ensureLayout()) return false;

    _mbInFlight = true;
    try {
        await _loadTimeline();
        _mbLastRefreshAt = Date.now();
        return true;
    } catch (e) {
        return false;
    } finally {
        _mbInFlight = false;
    }
}

function _attachHandlersOnce() {
    const pane = _getPane();
    if (!pane) return;
    if (pane.dataset && pane.dataset.mbBound === '1') return;

    pane.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || !(t instanceof Element)) return;

        const refresh = t.closest('[data-action="mb-refresh"]');
        if (refresh) {
            e.preventDefault();
            // Just reload timeline
            _refreshTimelineIfNeeded({ force: true }).catch(() => {
                try { TR.toast?.show('刷新失败', { variant: 'error', durationMs: 2000 }); } catch (_) { }
            });
        }
    });

    try {
        if (pane.dataset) pane.dataset.mbBound = '1';
    } catch (e) { }
}

async function _initialLoad() {
    if (!_ensureLayout()) return;
    _attachHandlersOnce();
    await _refreshTimelineIfNeeded({ force: false });
}

function _ensurePolling() {
    try {
        window.addEventListener(TAB_SWITCHED_EVENT, (ev) => {
            const cid = String(ev?.detail?.categoryId || '').trim();
            if (cid !== MORNING_BRIEF_CATEGORY_ID) return;
            // When switching to this tab, attach observer again if needed (observers sometimes disconnect if hidden)
            if (!_mbFinished) _attachObserver();

            clearTimeout(_tabSwitchDebounceTimer);
            _tabSwitchDebounceTimer = setTimeout(() => {
                _refreshTimelineIfNeeded({ force: false }).catch(() => { });
            }, 120);
        });
    } catch (e) { }
}

function _patchRenderHook() {
    if (TR.morningBrief && TR.morningBrief._patched === true) return;
    const orig = TR.data?.renderViewerFromData;
    if (typeof orig !== 'function') return;

    TR.data.renderViewerFromData = function patchedRenderViewerFromData(data, state) {
        orig.call(TR.data, data, state);
        try {
            _initialLoad().catch(() => { });
        } catch (e) { }
    };

    TR.morningBrief = {
        ...(TR.morningBrief || {}),
        _patched: true,
    };
}

ready(function () {
    _patchRenderHook();
    _initialLoad().catch(() => { });
    _ensurePolling();
});
