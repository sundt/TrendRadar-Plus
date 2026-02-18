import { TR, ready, escapeHtml, formatNewsDate } from './core.js';
import { storage } from './storage.js';
import { events } from './events.js';

const MORNING_BRIEF_CATEGORY_ID = 'knowledge';
const SINCE_STORAGE_KEY = 'tr_morning_brief_since_v1';
const LATEST_BASELINE_WINDOW_SEC = 2 * 3600;
const AUTO_REFRESH_INTERVAL_MS = 300000;
const INITIAL_CARDS_DESKTOP = 10;
const INITIAL_CARDS_MOBILE = 1;
const MAX_CARDS = 20;

function _getInitialCards() {
    return window.innerWidth <= 640 ? INITIAL_CARDS_MOBILE : INITIAL_CARDS_DESKTOP;
}
const LAST_VISIT_KEY = 'tr_category_last_visit_v1';
const NEW_CONTENT_WINDOW_SEC = 24 * 3600;

function getItemsPerCard() {
    return (window.SYSTEM_SETTINGS && window.SYSTEM_SETTINGS.display && window.SYSTEM_SETTINGS.display.morning_brief_items) || 50;
}

let _mbInFlight = false;
let _mbLastRefreshAt = 0;
let _tabSwitchDebounceTimer = null;
let _mbOffset = 0;
let _mbObserver = null;
let _mbFinished = false;
let _mbInitialized = false;
let _mbRetryCount = 0;
let _mbGeneration = 0;
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 500;

function _getActiveTabId() {
    try {
        return document.querySelector('.category-tabs .category-tab.active')?.dataset?.category || null;
    } catch (e) {
        return null;
    }
}

// Session start timestamp for red dot logic
const SESSION_START_TIME = Math.floor(Date.now() / 1000);
let morningBriefViewed = false;

function _markMorningBriefViewed() {
    morningBriefViewed = true;
}

function _isNewContent(publishedAt) {
    // Morning brief (knowledge category) always returns false for red dots
    // This category has unreliable timestamps causing false positive red dots
    return false;
}

function _applyPagingToCard(card) {
    try {
        TR.paging?.setCardPageSize?.(card, 50);
        TR.paging?.applyPagingToCard?.(card, 0);
    } catch (e) {
        // ignore
    }
}

// Use formatNewsDate from core.js for relative time display
function _fmtTime(tsSec) {
    return formatNewsDate(tsSec);
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
        const timeHtml = t ? `<span class="tr-news-date">${escapeHtml(t)}</span>` : '';
        const publishedAt = n?.published_at || n?.created_at || 0;
        const dotHtml = _isNewContent(publishedAt) ? '<span class="tr-new-dot"></span>' : '';
        
        // AI indicator dot
        const escapedTitle = title.replace(/'/g, "\\'");
        const escapedUrl = url.replace(/'/g, "\\'");
        const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${stableId}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', 'knowledge', '知识库')"></span>`;
        
        // Actions container
        const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${stableId}" data-title="${title.replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}" data-source-id="knowledge" data-source-name="知识库" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', 'knowledge', '知识库')"></button>`;
        const commentBtnHtml = `<button class="news-comment-btn" data-url="${url.replace(/"/g, '&quot;')}" data-title="${title.replace(/"/g, '&quot;')}"></button>`;
        const actionsHtml = `<div class="news-actions">${timeHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;
        
        return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}" data-news-url="${url}">
                <div class="news-item-content">
                    ${dotHtml}
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${url}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                        ${title}
                    </a>
                    ${aiDotHtml}
                    ${actionsHtml}
                </div>
            </li>`;
    }).join('');
}

function _getPane() {
    const pane = document.getElementById(`tab-${MORNING_BRIEF_CATEGORY_ID}`);
    if (!pane) {
        console.warn('[MorningBrief] Pane not found: tab-knowledge');
    }
    return pane;
}

function _getGrid() {
    const pane = _getPane();
    if (!pane) return null;
    const grid = pane.querySelector('.platform-grid');
    if (!grid) {
        console.warn('[MorningBrief] Grid not found in pane');
    }
    return grid;
}

function _ensureLayout() {
    const pane = _getPane();
    if (!pane) return false;

    // Ensure grid exists
    let grid = pane.querySelector('.platform-grid');
    if (!grid) {
        grid = document.createElement('div');
        grid.className = 'platform-grid';
        grid.style.display = 'flex';
        grid.style.flexDirection = 'row';
        grid.style.overflowX = 'auto';
        grid.style.overflowY = 'hidden';
        grid.style.alignItems = 'flex-start';
        grid.style.overscrollBehavior = 'contain';
        pane.appendChild(grid);
    } else {
        grid.style.overscrollBehavior = 'contain';
    }

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
 * Added drop_published_at_zero=0 to include items without published date
 */
async function _fetchTimelineBatch(limit, offset) {
    const url = `/api/rss/brief/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}&drop_published_at_zero=0`;
    const payload = await _fetchJson(url);
    return Array.isArray(payload?.items) ? payload.items : [];
}

/**
 * Add a card to the grid
 */
function _appendCard(items, cardIndex, container) {
    if (!items || !items.length) return;

    const card = document.createElement('div');
    card.className = 'platform-card tr-morning-brief-card';
    card.style.minWidth = '360px';
    card.dataset.platform = `mb-slice-${cardIndex}`;
    card.draggable = false;

    const limit = getItemsPerCard();
    const displayStart = cardIndex * limit + 1;
    const displayEnd = cardIndex * limit + items.length;

    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                🕒 最新 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" data-mb-list="slice-${cardIndex}">
            ${_buildNewsItemsHtml(items, { emptyText: '暂无内容' })}
        </ul>
    `;

    const indices = card.querySelectorAll('.news-index');
    indices.forEach((el, i) => {
        el.textContent = String(displayStart + i);
    });

    const sentinel = container.querySelector('#mb-load-sentinel');
    if (sentinel) {
        container.insertBefore(card, sentinel);
    } else {
        container.appendChild(card);
    }

    _applyPagingToCard(card);
}

function _createSentinel(container) {
    const existing = container.querySelector('#mb-load-sentinel');
    if (existing) existing.remove();

    const sentinel = document.createElement('div');
    sentinel.id = 'mb-load-sentinel';
    sentinel.style.minWidth = '20px';
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
        root: pane.querySelector('.platform-grid'),
        rootMargin: '200px',
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

    const myGeneration = _mbGeneration;

    const currentCardCount = Math.floor(_mbOffset / getItemsPerCard());
    if (currentCardCount >= MAX_CARDS) {
        _mbFinished = true;
        const s = document.getElementById('mb-load-sentinel');
        if (s) {
            s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已达到最大显示数量</div>';
            s.style.width = '40px';
        }
        return;
    }

    _mbInFlight = true;
    try {
        const limit = getItemsPerCard();
        const items = await _fetchTimelineBatch(limit, _mbOffset);

        if (!items.length) {
            _mbFinished = true;
            const s = document.getElementById('mb-load-sentinel');
            if (s) {
                s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已显示全部内容</div>';
                s.style.width = '40px';
            }
            return;
        }

        const grid = _getGrid();
        if (grid) {
            // Abort if generation changed (DOM was rebuilt during fetch)
            if (myGeneration !== _mbGeneration) {
                console.log('[MorningBrief] _loadNextBatch: stale generation, aborting');
                return;
            }
            const cardIndex = Math.floor(_mbOffset / getItemsPerCard());
            // Defensive: skip if card already exists
            const existingCard = grid.querySelector(`.tr-morning-brief-card[data-platform="mb-slice-${cardIndex}"]`);
            if (existingCard) {
                console.warn(`[MorningBrief] _loadNextBatch: card mb-slice-${cardIndex} already exists, skipping`);
                _mbOffset += items.length;
                return;
            }
            _appendCard(items, cardIndex, grid);

            try {
                TR.readState?.restoreReadState?.();
            } catch (e) { /* ignore */ }
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
    if (!grid) {
        console.warn('[MorningBrief] Grid not found, skipping load');
        if (_mbRetryCount < MAX_RETRY_COUNT) {
            _mbRetryCount++;
            console.log(`[MorningBrief] Scheduling retry ${_mbRetryCount}/${MAX_RETRY_COUNT}`);
            setTimeout(() => {
                _initialLoad().catch(() => {});
            }, RETRY_DELAY_MS * _mbRetryCount);
        }
        return;
    }

    _mbRetryCount = 0;

    const myGeneration = _mbGeneration;

    const previousContent = grid.innerHTML;
    const hadContent = grid.querySelectorAll('.tr-morning-brief-card .news-item').length > 0;

    // Reset state
    _mbOffset = 0;
    _mbFinished = false;
    
    grid.innerHTML = '<div class="mb-loading-state" style="padding:40px;text-align:center;color:#9ca3af;width:100%;"><div style="font-size:24px;margin-bottom:8px;">⏳</div>加载中...</div>';

    try {
        const limit = getItemsPerCard();
        let neededCards = _getInitialCards();
        if (myGeneration > 0 || window._trNoRebuildExpected) {
            try {
                const navState = TR.scroll?.peekNavigationState?.() || null;
                if (navState && navState.activeTab === MORNING_BRIEF_CATEGORY_ID && navState.anchorPlatformId) {
                    const m = String(navState.anchorPlatformId).match(/mb-slice-(\d+)/);
                    if (m) {
                        const anchorIdx = parseInt(m[1], 10);
                        neededCards = Math.max(neededCards, anchorIdx + 2);
                        neededCards = Math.min(neededCards, MAX_CARDS);
                    }
                }
            } catch (e) { /* ignore */ }
        }
        const initialLimit = limit * neededCards;
        const items = await _fetchTimelineBatch(initialLimit, 0);

        // Abort if a newer generation has started
        if (myGeneration !== _mbGeneration) {
            console.log('[MorningBrief] _loadTimeline: stale generation, aborting');
            return;
        }

        const currentGrid = _getGrid();
        if (!currentGrid) {
            console.warn('[MorningBrief] Grid disappeared during fetch, aborting');
            return;
        }

        currentGrid.innerHTML = '';

        if (!items.length) {
            currentGrid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
            _mbInitialized = true;
            return;
        }

        if (myGeneration !== _mbGeneration) {
            console.log('[MorningBrief] Stale load after grid clear, aborting');
            return;
        }

        _createSentinel(currentGrid);

        for (let i = 0; i < items.length; i += limit) {
            const chunk = items.slice(i, i + limit);
            const cardIndex = Math.floor(i / limit);
            _appendCard(chunk, cardIndex, currentGrid);
        }

        _mbOffset = items.length;
        _mbInitialized = true;

        if (items.length < initialLimit) {
            _mbFinished = true;
            const s = document.getElementById('mb-load-sentinel');
            if (s) s.remove();
        } else {
            _attachObserver();
        }
        
        try {
            TR.readState?.restoreReadState?.();
        } catch (e) { /* ignore */ }

        // Restore scroll position from back-navigation state
        if (myGeneration > 0 || window._trNoRebuildExpected) {
            try {
                const navState = TR.scroll?.peekNavigationState?.() || null;
                if (navState && navState.activeTab === MORNING_BRIEF_CATEGORY_ID) {
                    console.log('[MorningBrief] Restoring scroll from nav state');
                    const consumed = TR.scroll.consumeNavigationState();
                    requestAnimationFrame(() => {
                        TR.scroll.restoreNavigationScrollY(consumed || navState);
                        TR.scroll.restoreNavGridScroll(consumed || navState);
                    });
                }
            } catch (e) {
                console.error('[MorningBrief] Failed to restore scroll:', e);
            }
        }
    } catch (e) {
        console.error('[MorningBrief] Failed to load timeline:', e);
        const currentGrid = _getGrid();
        if (!currentGrid) return;
        
        if (hadContent && previousContent) {
            currentGrid.innerHTML = previousContent;
        } else {
            currentGrid.innerHTML = `
                <div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">
                    <div style="font-size:24px;margin-bottom:8px;">⚠️</div>
                    <div>加载失败，请稍后重试</div>
                    <button onclick="window.TR?.morningBrief?.refresh?.()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">重新加载</button>
                </div>`;
        }
    }
}

async function _refreshTimelineIfNeeded(opts = {}) {
    const force = opts.force === true;
    const skipTabCheck = opts.skipTabCheck === true;
    
    if (!skipTabCheck && _getActiveTabId() !== MORNING_BRIEF_CATEGORY_ID) return false;

    const now = Date.now();
    if (!force && _mbLastRefreshAt > 0 && (now - _mbLastRefreshAt) < (AUTO_REFRESH_INTERVAL_MS - 5000)) {
        return false;
    }

    if (_mbInFlight) {
        console.log('[MorningBrief] Refresh already in flight, will retry after completion');
        return false;
    }

    if (!_ensureLayout()) {
        console.warn('[MorningBrief] Layout not ready');
        return false;
    }

    _mbInFlight = true;
    try {
        await _loadTimeline();
        // Only mark as refreshed if we actually loaded (not aborted by generation change)
        if (_mbInitialized) {
            _mbLastRefreshAt = Date.now();
        }
        return true;
    } catch (e) {
        console.error('[MorningBrief] Refresh failed:', e);
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
    console.log('[MorningBrief] Starting initial load');
    
    if (_mbInFlight) {
        console.log('[MorningBrief] Skipping initial load — already in flight');
        return;
    }
    
    _mbFinished = false;
    
    let retries = 3;
    while (retries > 0) {
        if (_ensureLayout()) break;
        retries--;
        if (retries > 0) {
            console.log(`[MorningBrief] Layout not ready, retrying... (${3 - retries}/3)`);
            await new Promise(r => setTimeout(r, 100));
        }
    }
    
    if (!_ensureLayout()) {
        console.warn('[MorningBrief] Layout not ready after retries, scheduling delayed retry');
        setTimeout(() => {
            _initialLoad().catch(() => {});
        }, 500);
        return;
    }
    
    _attachHandlersOnce();
    await _refreshTimelineIfNeeded({ force: true, skipTabCheck: true });
    console.log('[MorningBrief] Initial load complete');
}

function _ensurePolling() {
    events.on('tab:switched', (detail) => {
        const cid = String(detail?.categoryId || '').trim();
        if (cid !== MORNING_BRIEF_CATEGORY_ID) return;

        // If a load is already in flight (from viewer:rendered), skip.
        if (_mbInFlight) return;

        const grid = _getGrid();
        const hasCards = grid && grid.querySelectorAll('.tr-morning-brief-card').length > 0;

        if (hasCards) {
            // Already has content — reattach observer and optionally refresh
            if (!_mbFinished) _attachObserver();
            clearTimeout(_tabSwitchDebounceTimer);
            _tabSwitchDebounceTimer = setTimeout(() => {
                _refreshTimelineIfNeeded({ force: false }).catch(() => { });
            }, 120);
        } else {
            // No cards yet — user genuinely switched to knowledge tab, load it
            _ensureLayout();
            _attachHandlersOnce();
            _refreshTimelineIfNeeded({ force: true, skipTabCheck: true }).catch(() => { });
        }
    });
}

// Listen for viewer:rendered event — this is the SOLE trigger for loading.
// ready() no longer calls _initialLoad() because viewer:rendered always fires
// (hasDefaultHiddenCategories is always true → refreshViewerData → renderViewerFromData → viewer:rendered).
// Having two triggers (ready + viewer:rendered) caused _loadTimeline to run twice,
// leading to observer/state corruption and duplicate cards on mobile.
events.on('viewer:rendered', () => {
    // Cancel any in-flight observer before DOM rebuild
    if (_mbObserver) {
        try { _mbObserver.disconnect(); } catch (e) { /* ignore */ }
        _mbObserver = null;
    }

    try {
        _mbFinished = false;
        _mbOffset = 0;
        _mbInitialized = false;
        _mbRetryCount = 0;
        _mbLastRefreshAt = 0;
        _mbGeneration = (_mbGeneration || 0) + 1;
        const gen = _mbGeneration;

        // Reset _mbInFlight so the new load can proceed.
        // The old generation's in-flight load (if any) will abort via generation check.
        _mbInFlight = false;

        setTimeout(() => {
            if (gen !== _mbGeneration) return;
            _initialLoad().catch((e) => {
                console.error('[MorningBrief] Initial load failed after render:', e);
            });
        }, 50);
    } catch (e) {
        console.error('[MorningBrief] Error in render hook:', e);
    }
});

TR.morningBrief = {
    ...(TR.morningBrief || {}),
    refresh: () => _refreshTimelineIfNeeded({ force: true }),
    getStatus: () => ({
        inFlight: _mbInFlight,
        finished: _mbFinished,
        offset: _mbOffset,
        initialized: _mbInitialized,
        retryCount: _mbRetryCount,
        lastRefreshAt: _mbLastRefreshAt,
    }),
};

// Only register polling (tab:switched handler) on ready.
// Do NOT call _initialLoad() here — viewer:rendered is the sole trigger
// when renderViewerFromData runs (which is the normal case because
// hasDefaultHiddenCategories is always true).
//
// Fallback: if init.js takes the else branch (no custom config AND no
// default hidden categories), viewer:rendered never fires and
// _trNoRebuildExpected is set. In that case we need to load here.
ready(function () {
    _ensurePolling();

    // Delay slightly so init.js ready() handler runs first and sets _trNoRebuildExpected
    setTimeout(() => {
        if (window._trNoRebuildExpected && !_mbInitialized && !_mbInFlight) {
            console.log('[MorningBrief] No viewer:rendered expected, loading from ready fallback');
            _initialLoad().catch(() => {});
        }
    }, 100);
});
