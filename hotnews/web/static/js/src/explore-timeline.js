import { TR, ready, escapeHtml, formatNewsDate } from './core.js';
import { skeletonCards, skeletonSentinel } from './skeleton.js';

const EXPLORE_TAB_ID = 'explore';
const INITIAL_CARDS_DESKTOP = 3;
const INITIAL_CARDS_MOBILE = 1;
const MAX_CARDS = 20;

function _getInitialCards() {
    return window.innerWidth <= 640 ? INITIAL_CARDS_MOBILE : INITIAL_CARDS_DESKTOP;
}

function getItemsPerCard() {
    return (window.SYSTEM_SETTINGS && window.SYSTEM_SETTINGS.display && window.SYSTEM_SETTINGS.display.items_per_card) || 50;
}

let _exploreInFlight = false;
let _exploreOffset = 0;
let _exploreObserver = null;
let _exploreFinished = false;
let _exploreGeneration = 0;

function _getActiveTabId() {
    try {
        // 优先从 sub-tab 按钮读取（PC 端）
        const fromTab = document.querySelector('.sub-tabs .sub-tab.active')?.dataset?.category || null;
        if (fromTab) return fromTab;
        // 降级：从 tab-pane.active 读取（移动端 drawer 导航时 sub-tab 可能没有 active）
        const activePane = document.querySelector('.tab-pane.active');
        if (activePane && activePane.id) {
            return activePane.id.replace(/^tab-/, '');
        }
        return null;
    } catch (e) {
        return null;
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
        return `<li class="tr-explore-empty" aria-hidden="true">${emptyText}</li>`;
    }
    return arr.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '#');
        const sourceId = escapeHtml(n?.source_id || 'explore');
        const sourceName = escapeHtml(n?.source_name || '精选博客');
        const t = _fmtTime(n?.published_at || n?.created_at);
        const timeHtml = t ? `<span class="tr-news-date">${escapeHtml(t)}</span>` : '';
        const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${stableId}" data-title="${title.replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}" data-source-id="${sourceId}" data-source-name="${sourceName.replace(/"/g, '&quot;')}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${title.replace(/'/g, "\\'")}', '${url.replace(/'/g, "\\'")}', '${sourceId}', '${sourceName.replace(/'/g, "\\'")}')" ></button>`;
        const commentBtnHtml = `<button class="news-comment-btn" data-url="${url.replace(/"/g, '&quot;')}" data-title="${title.replace(/"/g, '&quot;')}"></button>`;
        const actionsHtml = `<div class="news-actions">${timeHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;
        // Extract plain-text snippet from content for preview popover
        // 注意：不能用 innerHTML 解析，否则浏览器会预加载 content 中的所有图片（几百MB流量）
        const rawContent = n?.content || '';
        let snippetText = '';
        let imgSrc = '';
        if (rawContent) {
            // 用正则去除 HTML 标签提取纯文本，避免触发图片加载
            const plain = rawContent.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
            if (plain) {
                snippetText = plain.length > 200 ? plain.slice(0, 200) + '…' : plain;
            }
            const imgMatch = rawContent.match(/<img[^>]+src=["']([^"']+)["']/i);
            if (imgMatch && imgMatch[1]) {
                imgSrc = imgMatch[1];
            }
        }
        const snippetAttr = snippetText ? ` data-snippet="${escapeHtml(snippetText)}"` : '';
        const imgAttr = imgSrc ? ` data-snippet-img="${escapeHtml(imgSrc)}"` : '';
        const previewBtnHtml = snippetText ? `<button class="news-preview-btn" aria-label="预览摘要"></button>` : '';
        const actionsWithPreview = `<div class="news-actions">${timeHtml}<div class="news-hover-btns">${previewBtnHtml}${summaryBtnHtml}${commentBtnHtml}</div></div>`;
        return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}"${snippetAttr}${imgAttr}>
                <div class="news-item-content">
                    <span class="news-index">${String(idx + 1)}</span>
                    <a class="news-title" href="${url}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                        ${title}
                    </a>
                    ${actionsWithPreview}
                </div>
            </li>`;
    }).join('');
}

function _getPane() {
    return document.getElementById(`tab-${EXPLORE_TAB_ID}`);
}

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
        if (grid.dataset) grid.dataset.exploreInjected = '1';
    } catch (e) { }

    return true;
}

async function _fetchJson(url) {
    const resp = await fetch(url, { method: 'GET' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.json();
}

async function _fetchTimelineBatch(limit, offset) {
    const isMobile = window.innerWidth <= 640;
    const noContent = isMobile ? '&no_content=1' : '';
    const url = `/api/rss/explore/timeline?limit=${encodeURIComponent(String(limit))}&offset=${encodeURIComponent(String(offset))}${noContent}`;
    const payload = await _fetchJson(url);
    return Array.isArray(payload?.items) ? payload.items : [];
}

function _appendCard(items, cardIndex, container) {
    if (!items || !items.length) return;

    const card = _buildCard(items, cardIndex);

    const sentinel = container.querySelector('#explore-load-sentinel');
    if (sentinel) {
        container.insertBefore(card, sentinel);
    } else {
        container.appendChild(card);
    }
}

function _appendCardToFragment(items, cardIndex, fragment) {
    if (!items || !items.length) return;
    fragment.appendChild(_buildCard(items, cardIndex));
}

function _buildCard(items, cardIndex) {
    const card = document.createElement('div');
    card.className = 'platform-card tr-explore-card';
    card.style.minWidth = '360px';
    card.dataset.platform = `explore-slice-${cardIndex}`;
    card.draggable = false;

    const limit = getItemsPerCard();
    const displayStart = cardIndex * limit + 1;
    const displayEnd = cardIndex * limit + items.length;

    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                📰 最新 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" data-explore-list="slice-${cardIndex}">
            ${_buildNewsItemsHtml(items, { emptyText: '暂无内容' })}
        </ul>
    `;

    const indices = card.querySelectorAll('.news-index');
    indices.forEach((el, i) => {
        el.textContent = String(displayStart + i);
    });

    return card;
}

function _createSentinel(container) {
    const existing = container.querySelector('#explore-load-sentinel');
    if (existing) existing.remove();

    const sentinel = document.createElement('div');
    sentinel.id = 'explore-load-sentinel';
    sentinel.style.minWidth = '20px';
    sentinel.style.height = '100%';
    sentinel.style.flexShrink = '0';
    sentinel.innerHTML = skeletonSentinel();
    container.appendChild(sentinel);
    return sentinel;
}

function _attachObserver() {
    if (_exploreObserver) {
        _exploreObserver.disconnect();
        _exploreObserver = null;
    }

    const pane = _getPane();
    if (!pane) return;

    _exploreObserver = new IntersectionObserver((entries) => {
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

    const sentinel = pane.querySelector('#explore-load-sentinel');
    if (sentinel) {
        _exploreObserver.observe(sentinel);

        // Manual check: if sentinel is already visible (e.g., on wide screens),
        // trigger load immediately since Observer callback may not fire
        setTimeout(() => {
            const rect = sentinel.getBoundingClientRect();
            const grid = pane.querySelector('.platform-grid');
            if (grid && rect.left < grid.getBoundingClientRect().right) {
                _loadNextBatch().catch(() => { });
            }
        }, 100);
    }
}

async function _loadNextBatch() {
    if (_exploreInFlight || _exploreFinished) return;

    _exploreInFlight = true;
    try {
        const limit = getItemsPerCard();
        const currentCardCount = Math.floor(_exploreOffset / limit);

        // Safety check: stop if we've loaded too many cards
        if (currentCardCount >= MAX_CARDS) {
            _exploreFinished = true;
            const s = document.getElementById('explore-load-sentinel');
            if (s) {
                s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已达到最大显示数量</div>';
                s.style.width = '40px';
            }
            return;
        }

        const items = await _fetchTimelineBatch(limit, _exploreOffset);

        if (!items.length) {
            _exploreFinished = true;
            const s = document.getElementById('explore-load-sentinel');
            if (s) {
                s.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已显示全部内容</div>';
                s.style.width = '40px';
            }
            return;
        }

        const grid = _getGrid();
        if (grid) {
            const cardIndex = Math.floor(_exploreOffset / getItemsPerCard());
            _appendCard(items, cardIndex, grid);
        }

        _exploreOffset += items.length;

        if (items.length < limit) {
            _exploreFinished = true;
            const s = document.getElementById('explore-load-sentinel');
            if (s) s.remove();
        }

    } catch (e) {
        console.error('Explore load error:', e);
    } finally {
        _exploreInFlight = false;
    }
}

async function _loadTimeline() {
    const grid = _getGrid();
    if (!grid) return;

    _exploreOffset = 0;
    _exploreFinished = false;
    grid.innerHTML = skeletonCards(window.innerWidth <= 640 ? 1 : 3, { rows: 10, extraClass: 'tr-skeleton-explore' });

    _createSentinel(grid);

    const limit = getItemsPerCard();

    // Determine how many cards to load initially.
    // If restoring from nav state, load enough cards to cover the anchor position.
    let neededCards = _getInitialCards();
    if (_exploreGeneration > 0 || window._trNoRebuildExpected) {
        try {
            const navState = TR.scroll?.peekNavigationState?.() || null;
            if (navState && navState.activeTab === EXPLORE_TAB_ID && navState.anchorPlatformId) {
                const m = String(navState.anchorPlatformId).match(/explore-slice-(\d+)/);
                if (m) {
                    const anchorIdx = parseInt(m[1], 10);
                    // Load at least anchorIdx + 2 cards (anchor card + 1 extra)
                    neededCards = Math.max(neededCards, anchorIdx + 2);
                    neededCards = Math.min(neededCards, MAX_CARDS);
                }
            }
        } catch (e) { /* ignore */ }
    }

    const initialLimit = limit * neededCards;
    const items = await _fetchTimelineBatch(initialLimit, 0);

    // 移除 skeleton 占位
    grid.querySelectorAll('.tr-skeleton-card').forEach(el => el.remove());

    if (!items.length) {
        grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
        return;
    }

    // Batch insert initial cards using DocumentFragment to minimize reflow.
    // This is important for scroll restore accuracy — individual insertBefore
    // calls trigger reflow per card, causing offsetLeft to be unstable during
    // the retry window of _applyGridScroll.
    const fragment = document.createDocumentFragment();
    for (let i = 0; i < items.length; i += limit) {
        const chunk = items.slice(i, i + limit);
        const cardIndex = Math.floor(i / limit);
        _appendCardToFragment(chunk, cardIndex, fragment);
    }
    const sentinel = grid.querySelector('#explore-load-sentinel');
    if (sentinel) {
        grid.insertBefore(fragment, sentinel);
    } else {
        grid.appendChild(fragment);
    }

    _exploreOffset = items.length;

    if (items.length < initialLimit) {
        _exploreFinished = true;
        const s = document.getElementById('explore-load-sentinel');
        if (s) s.remove();
    } else {
        _attachObserver();
    }

    // Restore scroll position from back-navigation state (WeChat browser)
    // Only restore if this load was triggered after renderViewerFromData
    // (generation > 0), not the initial ready() load which may be stale.
    if (_exploreGeneration > 0 || window._trNoRebuildExpected) {
        try {
            const navState = TR.scroll?.peekNavigationState?.() || null;
            if (navState && navState.activeTab === EXPLORE_TAB_ID) {
                console.log('[Explore] Restoring scroll from nav state');
                const consumed = TR.scroll.consumeNavigationState();
                requestAnimationFrame(() => {
                    TR.scroll.restoreNavigationScrollY(consumed || navState);
                    TR.scroll.restoreNavGridScroll(consumed || navState);
                });
            }
        } catch (e) {
            console.error('[Explore] Failed to restore scroll:', e);
        }
    }
}

async function _refreshTimelineIfNeeded(force = false) {
    // 当 force=true 时跳过 active tab 检查（移动端 drawer 导航通过 activatePane
    // 切换 tab，不更新 .sub-tab.active，导致 _getActiveTabId() 返回旧值）
    if (!force && _getActiveTabId() !== EXPLORE_TAB_ID) return false;
    if (!_ensureLayout()) return false;

    const grid = _getGrid();
    if (!force && grid && grid.querySelectorAll('.platform-card').length > 0) {
        // Already has content, don't reload
        _exploreInFlight = false;
        return true;
    }

    _exploreInFlight = true;
    try {
        await _loadTimeline();
        return true;
    } catch (e) {
        console.error('Explore refresh error:', e);
        return false;
    } finally {
        _exploreInFlight = false;
    }
}

let _initialized = false;

async function _initialLoad() {
    if (_initialized) return; // Prevent duplicate initialization
    if (!_ensureLayout()) return;
    const loaded = await _refreshTimelineIfNeeded();
    // Only mark initialized if we actually loaded data (or the tab had content).
    // If the tab wasn't active, _refreshTimelineIfNeeded returns false and
    // we leave _initialized = false so tab:switched can trigger the load later.
    if (loaded) {
        _initialized = true;
    }
}

function _ensurePolling() {
    events.on('tab:switched', (detail) => {
        const cid = String(detail?.categoryId || '').trim();
        const hasUpdate = !!detail?.hasUpdate;
        if (cid !== EXPLORE_TAB_ID) return;
        if (viewMode.get(EXPLORE_TAB_ID) !== 'timeline') return;

        // If not initialized, viewer:rendered hasn't completed its load yet.
        // But if _initialized is false because the explore tab wasn't active
        // during _initialLoad, we need to load now.
        // The key distinction: if _exploreInFlight is true, a load is already
        // running (from viewer:rendered), so skip. Otherwise, trigger a load.
        if (_exploreInFlight) return;

        const grid = _getGrid();
        const hasCards = grid && grid.querySelectorAll('.tr-explore-card').length > 0;

        if (hasCards) {
            // Already has content — just reattach observer and optionally refresh
            if (!_exploreFinished) _attachObserver();
            _refreshTimelineIfNeeded(hasUpdate).catch(() => { });
        } else {
            // No cards yet — user genuinely switched to explore tab, load it
            _ensureLayout();
            _initialized = true;
            _refreshTimelineIfNeeded(true).catch(() => { });
        }
    });
}

import { events } from './events.js';
import { viewMode } from './view-mode.js';

// viewer:rendered is the SOLE trigger for loading explore data.
// ready() no longer calls _initialLoad() because viewer:rendered always fires
// (hasDefaultHiddenCategories is always true).
events.on('viewer:rendered', () => {
    if (viewMode.get(EXPLORE_TAB_ID) !== 'timeline') return;
    if (_exploreObserver) {
        try { _exploreObserver.disconnect(); } catch (e) { /* ignore */ }
        _exploreObserver = null;
    }
    _exploreGeneration++;
    _initialized = false;
    _exploreInFlight = false;
    _exploreFinished = false;
    _exploreOffset = 0;
    _initialLoad().catch(() => { });
});

// Only register polling on ready. Do NOT call _initialLoad() here.
// Fallback: if viewer:rendered never fires (_trNoRebuildExpected), load here.
ready(function () {
    _ensurePolling();
    setTimeout(() => {
        if (window._trNoRebuildExpected && !_initialized) {
            _initialLoad().catch(() => {});
        }
    }, 100);
});
