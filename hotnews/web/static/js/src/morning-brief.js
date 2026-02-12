import { TR, ready, escapeHtml, formatNewsDate } from './core.js';
import { storage } from './storage.js';
import { events } from './events.js';

const MORNING_BRIEF_CATEGORY_ID = 'knowledge';
const SINCE_STORAGE_KEY = 'tr_morning_brief_since_v1';
const LATEST_BASELINE_WINDOW_SEC = 2 * 3600;
const AUTO_REFRESH_INTERVAL_MS = 300000;
const INITIAL_CARDS = 10; // Load 10 cards initially (500 items) - dynamic like explore
const MAX_CARDS = 20; // Maximum cards to load (1000 items) to enable caching
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
        // Force horizontal scroll if not already applied by CSS
        grid.style.display = 'flex';
        grid.style.flexDirection = 'row';
        grid.style.overflowX = 'auto';
        grid.style.overflowY = 'hidden';
        grid.style.alignItems = 'flex-start'; // Align items to top
        // Prevent scroll from bubbling to page when at container boundaries
        grid.style.overscrollBehavior = 'contain';
        pane.appendChild(grid);
    } else {
        // Ensure overscroll behavior is set even if grid already exists
        grid.style.overscrollBehavior = 'contain';
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
 * Added drop_published_at_zero=0 to include items without published date
 */
async function _fetchTimelineBatch(limit, offset) {
    const url = `/api/rss/brief/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}&drop_published_at_zero=0`;
    const payload = await _fetchJson(url);
    return Array.isArray(payload?.items) ? payload.items : [];
}

/**
 * Add a card to the grid
 * @param {Array} items - The items to display in this card
 * @param {number} cardIndex - The 0-based card index (0 = first card, 1 = second card, etc.)
 * @param {HTMLElement} container - The grid container
 */
function _appendCard(items, cardIndex, container) {
    if (!items || !items.length) return;

    const card = document.createElement('div');
    card.className = 'platform-card tr-morning-brief-card';
    card.style.minWidth = '360px'; // Ensure cards have width
    card.dataset.platform = `mb-slice-${cardIndex}`;
    card.draggable = false;

    // Calculate display range: cardIndex 0 = 1-50, cardIndex 1 = 51-100, etc.
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

    // Update indices to reflect global position (not local 1, 2, 3... but global 1, 2... 51, 52...)
    const indices = card.querySelectorAll('.news-index');
    indices.forEach((el, i) => {
        el.textContent = String(displayStart + i);
    });

    // Always append to end (before sentinel if it exists)
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
    console.log(`[MorningBrief] _loadNextBatch called: offset=${_mbOffset}, inFlight=${_mbInFlight}, finished=${_mbFinished}`);
    if (_mbInFlight || _mbFinished) return;

    // Check if we've reached max cards
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
        // Fetch next page
        const limit = getItemsPerCard();
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
            // Calculate which card number this is (0-based)
            const cardIndex = Math.floor(_mbOffset / getItemsPerCard());
            console.log(`[MorningBrief] _loadNextBatch: creating card ${cardIndex}, offset=${_mbOffset}, items=${items.length}, displayRange=${cardIndex * getItemsPerCard() + 1}-${cardIndex * getItemsPerCard() + items.length}`);
            _appendCard(items, cardIndex, grid);
            
            // Restore read state for newly loaded items
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
        // Schedule retry if not too many attempts
        if (_mbRetryCount < MAX_RETRY_COUNT) {
            _mbRetryCount++;
            console.log(`[MorningBrief] Scheduling retry ${_mbRetryCount}/${MAX_RETRY_COUNT}`);
            setTimeout(() => {
                _initialLoad().catch(() => {});
            }, RETRY_DELAY_MS * _mbRetryCount);
        }
        return;
    }

    // Reset retry count on successful grid find
    _mbRetryCount = 0;

    // Capture current generation to detect stale loads
    const myGeneration = _mbGeneration;

    // Save existing content in case of error
    const previousContent = grid.innerHTML;
    const hadContent = grid.querySelectorAll('.tr-morning-brief-card .news-item').length > 0;

    // Reset state
    _mbOffset = 0;
    _mbFinished = false;
    
    // Show loading state instead of clearing immediately
    if (!hadContent) {
        grid.innerHTML = '<div class="mb-loading-state" style="padding:40px;text-align:center;color:#9ca3af;width:100%;"><div style="font-size:24px;margin-bottom:8px;">⏳</div>加载中...</div>';
    }

    try {
        // Determine how many cards to load initially.
        // If restoring from nav state, load enough cards to cover the anchor position.
        const limit = getItemsPerCard();
        let neededCards = INITIAL_CARDS;
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

        // Abort if a newer generation has started (DOM was rebuilt)
        if (myGeneration !== _mbGeneration) {
            console.log('[MorningBrief] Stale load detected, aborting');
            return;
        }

        // Verify grid still exists after async operation
        const currentGrid = _getGrid();
        if (!currentGrid) {
            console.warn('[MorningBrief] Grid disappeared during fetch, aborting');
            return;
        }

        // Clear grid only after successful fetch
        currentGrid.innerHTML = '';

        if (!items.length) {
            currentGrid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
            _mbInitialized = true;
            return;
        }

        // Create Sentinel for infinite scroll
        _createSentinel(currentGrid);

        // Chunk into cards
        for (let i = 0; i < items.length; i += limit) {
            const chunk = items.slice(i, i + limit);
            const cardIndex = Math.floor(i / limit); // 0, 1, 2, ...
            _appendCard(chunk, cardIndex, currentGrid);
        }

        _mbOffset = items.length;
        _mbInitialized = true;
        console.log(`[MorningBrief] Initial load complete: ${items.length} items, ${Math.ceil(items.length / limit)} cards, _mbOffset=${_mbOffset}`);

        if (items.length < initialLimit) {
            // No more data
            _mbFinished = true;
            const s = document.getElementById('mb-load-sentinel');
            if (s) s.remove();
        } else {
            // Setup observer for next batches
            _attachObserver();
        }
        
        // Restore read state for dynamically loaded items
        try {
            TR.readState?.restoreReadState?.();
        } catch (e) { /* ignore */ }

        // Restore scroll position from back-navigation state (WeChat browser)
        // Only restore if this load was triggered after renderViewerFromData
        // (generation > 0), not the initial ready() load which may be stale.
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
        // Verify grid still exists
        const currentGrid = _getGrid();
        if (!currentGrid) return;
        
        // Restore previous content if we had any, otherwise show error
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
    
    // Skip tab check only for initial load
    if (!skipTabCheck && _getActiveTabId() !== MORNING_BRIEF_CATEGORY_ID) return false;

    // Simple cooldown if not forced
    const now = Date.now();
    if (!force && _mbLastRefreshAt > 0 && (now - _mbLastRefreshAt) < (AUTO_REFRESH_INTERVAL_MS - 5000)) {
        return false;
    }

    // If already in flight, queue a refresh for after completion
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
        _mbLastRefreshAt = Date.now();
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
    console.log('[MorningBrief] Starting initial load');
    
    // Reset state for fresh load (important when called from renderViewerFromData patch)
    _mbInFlight = false;
    _mbFinished = false;
    _mbOffset = 0;
    
    // Retry up to 3 times if layout is not ready (DOM might not be fully rendered)
    let retries = 3;
    while (retries > 0) {
        if (_ensureLayout()) break;
        retries--;
        if (retries > 0) {
            console.log(`[MorningBrief] Layout not ready, retrying... (${3 - retries}/3)`);
            await new Promise(r => setTimeout(r, 100)); // Wait 100ms before retry
        }
    }
    
    if (!_ensureLayout()) {
        console.warn('[MorningBrief] Layout not ready after retries, scheduling delayed retry');
        // Schedule a delayed retry
        setTimeout(() => {
            _initialLoad().catch(() => {});
        }, 500);
        return;
    }
    
    _attachHandlersOnce();
    // Skip tab check for initial load - always load data
    await _refreshTimelineIfNeeded({ force: false, skipTabCheck: true });
    console.log('[MorningBrief] Initial load complete');
}

function _ensurePolling() {
    events.on('tab:switched', (detail) => {
        const cid = String(detail?.categoryId || '').trim();
        if (cid !== MORNING_BRIEF_CATEGORY_ID) return;
        // When switching to this tab, attach observer again if needed (observers sometimes disconnect if hidden)
        if (!_mbFinished) _attachObserver();

        clearTimeout(_tabSwitchDebounceTimer);
        _tabSwitchDebounceTimer = setTimeout(() => {
            _refreshTimelineIfNeeded({ force: false }).catch(() => { });
        }, 120);
    });
}

// Listen for viewer:rendered event (replaces monkey-patch on renderViewerFromData)
events.on('viewer:rendered', () => {
    // Cancel any in-flight observer before DOM rebuild
    if (_mbObserver) {
        try { _mbObserver.disconnect(); } catch (e) { /* ignore */ }
        _mbObserver = null;
    }

    try {
        // Check if the grid already has morning brief cards with real content
        // (data.js preserves _knowledgeGridHtml when cards exist)
        const grid = _getGrid();
        const existingCards = grid ? grid.querySelectorAll('.tr-morning-brief-card .news-item').length : 0;

        if (existingCards > 0 && _mbInitialized) {
            // Content was preserved by data.js — keep current state, just re-attach observer
            console.log(`[MorningBrief] Preserved ${existingCards} items, re-attaching observer`);
            _mbInFlight = false;
            if (!_mbFinished) {
                _attachObserver();
            }
        } else {
            // No existing content — full reset and reload
            console.log('[MorningBrief] No preserved content, scheduling full reload');
            _mbInFlight = false;
            _mbFinished = false;
            _mbOffset = 0;
            _mbInitialized = false;
            _mbRetryCount = 0;
            _mbLastRefreshAt = 0;

            // Use a generation counter to cancel stale loads
            _mbGeneration = (_mbGeneration || 0) + 1;
            const gen = _mbGeneration;

            setTimeout(() => {
                // Only proceed if no newer generation has been started
                if (gen !== _mbGeneration) return;
                _initialLoad().catch((e) => {
                    console.error('[MorningBrief] Initial load failed after render:', e);
                });
            }, 50);
        }
    } catch (e) {
        console.error('[MorningBrief] Error in render hook:', e);
    }
});

TR.morningBrief = {
    ...(TR.morningBrief || {}),
    // Expose refresh method for manual retry
    refresh: () => _refreshTimelineIfNeeded({ force: true }),
    // Expose status for debugging
    getStatus: () => ({
        inFlight: _mbInFlight,
        finished: _mbFinished,
        offset: _mbOffset,
        initialized: _mbInitialized,
        retryCount: _mbRetryCount,
        lastRefreshAt: _mbLastRefreshAt,
    }),
};

ready(function () {
    _initialLoad().catch(() => { });
    _ensurePolling();
});
