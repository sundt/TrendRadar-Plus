/**
 * Category Timeline Module — 通用分类时间线渲染器
 *
 * 为任意栏目提供时间线模式渲染：按时间倒序，每卡片 N 条，横向滚动无限加载。
 * 被 view-mode 切换时调用。
 */

import { TR, escapeHtml, formatNewsDate } from './core.js';
import { events } from './events.js';
import { viewMode } from './view-mode.js';
import { skeletonCards, skeletonSentinel } from './skeleton.js';

const INITIAL_CARDS_DESKTOP = 3;
const INITIAL_CARDS_MOBILE = 1;
const MAX_CARDS = 20;
const COLUMN_CONFIG_RETRY_MS = 300;
const COLUMN_CONFIG_MAX_RETRIES = 5;

/**
 * 等待 _columnConfig 就绪（服务器重启后异步加载可能延迟）
 * 返回 true 表示就绪，false 表示超时仍未就绪
 */
async function _waitForColumnConfig() {
    if (Array.isArray(window._columnConfig) && window._columnConfig.length > 0) return true;
    for (let i = 0; i < COLUMN_CONFIG_MAX_RETRIES; i++) {
        await new Promise(r => setTimeout(r, COLUMN_CONFIG_RETRY_MS));
        if (Array.isArray(window._columnConfig) && window._columnConfig.length > 0) return true;
    }
    // 最后尝试主动拉取一次
    try {
        const resp = await fetch('/api/columns', { credentials: 'include' });
        if (resp.ok) {
            const d = await resp.json();
            window._columnConfig = Array.isArray(d) ? d : (d.columns || []);
            if (window._columnConfig.length > 0) return true;
        }
    } catch {}
    return false;
}

/**
 * 递归在 window._columnConfig 树中查找 catId 节点
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

function _getInitialCards() {
    return window.innerWidth <= 640 ? INITIAL_CARDS_MOBILE : INITIAL_CARDS_DESKTOP;
}

function _getItemsPerCard() {
    return (window.SYSTEM_SETTINGS?.display?.items_per_card) || 50;
}

function _fmtTime(ts) { return formatNewsDate(ts); }

// --- Per-category state ---
const _state = {};  // categoryId -> { inFlight, offset, observer, finished, generation }

function _getState(catId) {
    if (!_state[catId]) {
        _state[catId] = { inFlight: false, offset: 0, observer: null, finished: false, generation: 0 };
    }
    return _state[catId];
}

function _resetState(catId) {
    const s = _getState(catId);
    s.offset = 0;
    s.finished = false;
    s.inFlight = false;
    s.generation++;
    if (s.observer) { try { s.observer.disconnect(); } catch {} s.observer = null; }
}

// --- API URL mapping ---
function _getApiUrl(catId) {
    if (catId === 'finance') return '/api/rss/finance/timeline';
    if (catId === 'explore') return '/api/explore/timeline';
    if (catId === 'my-tags') return '/api/rss/my-tags/timeline';
    if (catId.startsWith('topic-')) {
        const topicId = catId.replace('topic-', '');
        return `/api/rss/topic/${topicId}/timeline`;
    }
    // Tag-driven 栏目：从 _columnConfig 树中查找 tag_ids
    const node = _findInColumnConfig(catId);
    if (node) {
        // 自身有 tag_ids → 直接用
        if (Array.isArray(node.tag_ids) && node.tag_ids.length) {
            return `/api/timeline?tags=${node.tag_ids.join(',')}`;
        }
        // 中间节点（如 ai、ai-llm）：收集所有后代叶子的 tag_ids
        const allTags = [];
        function _collectTags(nodes) {
            for (const n of nodes) {
                if (Array.isArray(n.tag_ids) && n.tag_ids.length) {
                    allTags.push(...n.tag_ids);
                }
                if (Array.isArray(n.children)) _collectTags(n.children);
            }
        }
        if (Array.isArray(node.children)) _collectTags(node.children);
        if (allTags.length) {
            return `/api/timeline?tags=${allTags.join(',')}`;
        }
    }
    // Generic category
    return `/api/rss/category/${encodeURIComponent(catId)}/timeline`;
}

// --- News item HTML builder ---
function _buildNewsItemsHtml(items, catId) {
    const arr = Array.isArray(items) ? items : [];
    if (!arr.length) return '<li style="padding:20px;color:#9ca3af;">暂无内容</li>';
    return arr.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '#');
        const sourceName = escapeHtml(n?.source_name || '');
        const sourceId = escapeHtml(n?.source_id || catId);
        const t = _fmtTime(n?.published_at || n?.created_at);
        const timeHtml = t ? `<span class="tr-news-date">${escapeHtml(t)}</span>` : '';
        const escapedTitle = title.replace(/'/g, "\\'");
        const escapedUrl = url.replace(/'/g, "\\'");
        const escapedSource = sourceName.replace(/'/g, "\\'");
        const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${stableId}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSource}')"></span>`;
        const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${stableId}" data-title="${title.replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}" data-source-id="${sourceId}" data-source-name="${sourceName.replace(/"/g, '&quot;')}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSource}')"></button>`;
        const commentBtnHtml = `<button class="news-comment-btn" data-url="${url.replace(/"/g, '&quot;')}" data-title="${title.replace(/"/g, '&quot;')}"></button>`;
        const actionsHtml = `<div class="news-actions">${timeHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;
        return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}" data-news-url="${url}">
                <div class="news-item-content">
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

// --- Fetch ---
async function _fetchBatch(catId, limit, offset) {
    const base = _getApiUrl(catId);
    const sep = base.includes('?') ? '&' : '?';
    const resp = await fetch(`${base}${sep}limit=${limit}&offset=${offset}`, { credentials: 'include' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const payload = await resp.json();
    return Array.isArray(payload?.items) ? payload.items : [];
}

// --- DOM helpers ---
function _getPane(catId) { return document.getElementById(`tab-${catId}`); }
function _getGrid(catId) {
    const pane = _getPane(catId);
    return pane ? pane.querySelector('.platform-grid') : null;
}

function _ensureTimelineLayout(catId) {
    const pane = _getPane(catId);
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

function _appendCard(catId, items, cardIndex, container) {
    if (!items || !items.length) return;
    const limit = _getItemsPerCard();
    const displayStart = cardIndex * limit + 1;
    const displayEnd = cardIndex * limit + items.length;

    const card = document.createElement('div');
    card.className = 'platform-card tl-card';
    card.style.minWidth = '360px';
    card.dataset.platform = `tl-${catId}-${cardIndex}`;
    card.draggable = false;

    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                📋 最新 ${displayStart}-${displayEnd}
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list">
            ${_buildNewsItemsHtml(items, catId)}
        </ul>
    `;
    // Fix indices
    card.querySelectorAll('.news-index').forEach((el, i) => { el.textContent = String(displayStart + i); });

    const sentinel = container.querySelector(`#tl-sentinel-${catId}`);
    if (sentinel) container.insertBefore(card, sentinel);
    else container.appendChild(card);
}

function _createSentinel(catId, container) {
    const existing = container.querySelector(`#tl-sentinel-${catId}`);
    if (existing) existing.remove();
    const sentinel = document.createElement('div');
    sentinel.id = `tl-sentinel-${catId}`;
    sentinel.innerHTML = skeletonSentinel();
    container.appendChild(sentinel);
    return sentinel;
}

function _attachObserver(catId) {
    const s = _getState(catId);
    if (s.observer) { try { s.observer.disconnect(); } catch {} s.observer = null; }
    const grid = _getGrid(catId);
    if (!grid) return;
    s.observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (entry.isIntersecting) _loadNextBatch(catId).catch(() => {});
        }
    }, { root: grid, rootMargin: '200px', threshold: 0.01 });
    const sentinel = grid.querySelector(`#tl-sentinel-${catId}`);
    if (sentinel) s.observer.observe(sentinel);
}

async function _loadNextBatch(catId) {
    const s = _getState(catId);
    if (s.inFlight || s.finished) return;
    const currentCards = Math.floor(s.offset / _getItemsPerCard());
    if (currentCards >= MAX_CARDS) {
        s.finished = true;
        const el = document.getElementById(`tl-sentinel-${catId}`);
        if (el) { el.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已达到最大显示数量</div>'; }
        return;
    }
    s.inFlight = true;
    const myGen = s.generation;
    try {
        const limit = _getItemsPerCard();
        const items = await _fetchBatch(catId, limit, s.offset);
        if (myGen !== s.generation) return;
        if (!items.length) {
            s.finished = true;
            const el = document.getElementById(`tl-sentinel-${catId}`);
            if (el) { el.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已显示全部内容</div>'; }
            return;
        }
        const grid = _getGrid(catId);
        if (grid) {
            const cardIndex = Math.floor(s.offset / limit);
            _appendCard(catId, items, cardIndex, grid);
            try { TR.readState?.restoreReadState?.(); } catch {}
        }
        s.offset += items.length;
        if (items.length < limit) {
            s.finished = true;
            const el = document.getElementById(`tl-sentinel-${catId}`);
            if (el) el.remove();
        }
    } catch (e) {
        console.error(`[CategoryTimeline] loadNextBatch(${catId}) error:`, e);
    } finally { s.inFlight = false; }
}

// --- Main load function ---
async function loadTimeline(catId, force = false) {
    const s = _getState(catId);
    if (s.inFlight && !force) return;
    if (force) _resetState(catId);

    if (!_ensureTimelineLayout(catId)) {
        setTimeout(() => loadTimeline(catId, force).catch(() => {}), 300);
        return;
    }

    // 等待 _columnConfig 就绪，避免重启后 tag-driven 栏目显示空白
    await _waitForColumnConfig();

    const grid = _getGrid(catId);
    if (!grid) return;

    s.inFlight = true;
    s.offset = 0;
    s.finished = false;
    const myGen = s.generation;

    grid.innerHTML = skeletonCards(window.innerWidth <= 640 ? 1 : 3);

    try {
        const limit = _getItemsPerCard();
        const neededCards = _getInitialCards();
        const initialLimit = limit * neededCards;
        const items = await _fetchBatch(catId, initialLimit, 0);
        if (myGen !== s.generation) return;

        const currentGrid = _getGrid(catId);
        if (!currentGrid) return;
        currentGrid.innerHTML = '';

        if (!items.length) {
            currentGrid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
            s.inFlight = false;
            return;
        }

        _createSentinel(catId, currentGrid);
        for (let i = 0; i < items.length; i += limit) {
            const chunk = items.slice(i, i + limit);
            _appendCard(catId, chunk, Math.floor(i / limit), currentGrid);
        }
        s.offset = items.length;

        if (items.length < initialLimit) {
            s.finished = true;
            const el = document.getElementById(`tl-sentinel-${catId}`);
            if (el) el.remove();
        } else {
            _attachObserver(catId);
        }
        try { TR.readState?.restoreReadState?.(); } catch {}
    } catch (e) {
        console.error(`[CategoryTimeline] loadTimeline(${catId}) error:`, e);
        const g = _getGrid(catId);
        if (g) g.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;"><div style="font-size:24px;margin-bottom:8px;">⚠️</div><div>加载失败</div><button onclick="window.categoryTimeline?.load('${catId}', true)" style="margin-top:12px;padding:8px 16px;background:#07c160;color:white;border:none;border-radius:6px;cursor:pointer;">重试</button></div>`;
    } finally { s.inFlight = false; }
}

// --- Restore card mode ---
function restoreCardMode(catId) {
    _resetState(catId);
    const grid = _getGrid(catId);
    if (!grid) return;
    // Reset grid to vertical card layout
    grid.style.display = '';
    grid.style.flexDirection = '';
    grid.style.overflowX = '';
    grid.style.overflowY = '';
    grid.style.alignItems = '';
    grid.style.overscrollBehavior = '';
    // Clear timeline content — tabs.switchTab will reload card content
    grid.innerHTML = '';
}

// --- Load card mode (per-source grouped cards) ---
// Used by self-managed timeline categories (finance) when switching to card mode.
// For categories with full platform data (e.g. finance), fetches from /api/category/ to get
// all platforms (custom scrapers + RSS sources).
async function loadCardMode(catId) {
    const grid = _getGrid(catId);
    if (!grid) return;

    // 等待 _columnConfig 就绪，避免重启后 tag-driven 栏目显示空白
    await _waitForColumnConfig();

    // Reset grid styles to standard card layout
    grid.style.display = '';
    grid.style.flexDirection = '';
    grid.style.overflowX = '';
    grid.style.overflowY = '';
    grid.style.alignItems = '';
    grid.style.overscrollBehavior = '';
    grid.innerHTML = skeletonCards(window.innerWidth <= 640 ? 1 : 2);

    try {
        // Tag-driven 分支：若该栏目在 _columnConfig 中有 tag_ids，每个 tag 渲染一张卡片
        const node = _findInColumnConfig(catId);
        const nodeTags = (() => {
            if (!node) return [];
            if (Array.isArray(node.tag_ids) && node.tag_ids.length) return node.tag_ids;
            // 中间节点：收集后代叶子的 tag_ids
            const tags = [];
            function _c(nodes) {
                for (const n of nodes) {
                    if (Array.isArray(n.tag_ids) && n.tag_ids.length) tags.push(...n.tag_ids);
                    if (Array.isArray(n.children)) _c(n.children);
                }
            }
            if (Array.isArray(node.children)) _c(node.children);
            return tags;
        })();
        if (nodeTags.length) {
            grid.innerHTML = '';
            for (const tagId of nodeTags) {
                try {
                    const resp = await fetch(`/api/timeline?tags=${encodeURIComponent(tagId)}&limit=20`, { credentials: 'include' });
                    if (!resp.ok) continue;
                    const payload = await resp.json();
                    const items = Array.isArray(payload?.items) ? payload.items : [];
                    if (!items.length) continue;
                    const card = document.createElement('div');
                    card.className = 'platform-card';
                    card.dataset.platform = `tag-${tagId}`;
                    card.draggable = false;
                    card.innerHTML = `
                        <div class="platform-header">
                            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                                🏷️ ${escapeHtml(tagId)}
                            </div>
                            <div class="platform-header-actions"></div>
                        </div>
                        <ul class="news-list">
                            ${_buildNewsItemsHtml(items, catId)}
                        </ul>
                    `;
                    grid.appendChild(card);
                } catch (e) {
                    // skip failed tag
                }
            }
            if (!grid.querySelector('.platform-card')) {
                grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
            }
            try { TR.readState?.restoreReadState?.(); } catch {}
            return;
        }

        // Try /api/category/ first — it returns the full set of platforms
        // (custom scrapers + RSS sources) which is what the original card mode shows.
        let usedCategoryApi = false;
        try {
            const catResp = await fetch(`/api/category/${encodeURIComponent(catId)}`, { credentials: 'include' });
            if (catResp.ok) {
                const catData = await catResp.json();
                const platforms = catData?.category?.platforms;
                if (platforms && typeof platforms === 'object' && Object.keys(platforms).length > 0) {
                    usedCategoryApi = true;
                    grid.innerHTML = '';
                    for (const [platformId, platform] of Object.entries(platforms)) {
                        const news = platform.news || [];
                        if (!news.length) continue;
                        const card = document.createElement('div');
                        card.className = 'platform-card';
                        card.dataset.platform = escapeHtml(platformId);
                        card.draggable = false;
                        const pName = platform.name || platformId;
                        card.innerHTML = `
                            <div class="platform-header">
                                <span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>
                                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                                    📱 ${escapeHtml(pName)}
                                </div>
                                <div class="platform-header-actions">
                                </div>
                            </div>
                            <ul class="news-list">
                                ${_buildCategoryNewsHtml(news, platformId, pName)}
                            </ul>
                        `;
                        grid.appendChild(card);
                    }
                    try { TR.readState?.restoreReadState?.(); } catch {}
                    if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
                    return;
                }
            }
        } catch (e) {
            // Fall through to timeline API
        }

        // Fallback: fetch from timeline API and group by source
        const nofilterParam = catId === 'finance' ? '&nofilter=1' : '';
        const base = _getApiUrl(catId);
        const sep = base.includes('?') ? '&' : '?';
        const resp = await fetch(`${base}${sep}limit=5000&offset=0${nofilterParam}`, { credentials: 'include' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        const payload = await resp.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];
        if (!items.length) {
            grid.innerHTML = '<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;">暂无内容</div>';
            return;
        }

        // Group by source_name
        const groups = new Map();
        for (const item of items) {
            const key = item.source_name || item.source_id || 'unknown';
            if (!groups.has(key)) groups.set(key, { sourceId: item.source_id, items: [] });
            groups.get(key).items.push(item);
        }

        grid.innerHTML = '';
        for (const [sourceName, group] of groups) {
            const card = document.createElement('div');
            card.className = 'platform-card';
            card.dataset.platform = `rss-${group.sourceId}`;
            card.draggable = false;

            const displayItems = group.items;
            const totalCount = displayItems.length;
            card.innerHTML = `
                <div class="platform-header">
                    <span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                        📱 ${escapeHtml(sourceName)}
                    </div>
                    <div class="platform-header-actions">
                    </div>
                </div>
                <ul class="news-list">
                    ${_buildNewsItemsHtml(displayItems, catId)}
                </ul>
            `;
            grid.appendChild(card);
        }

        try { TR.readState?.restoreReadState?.(); } catch {}
        if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
    } catch (e) {
        console.error(`[CategoryTimeline] loadCardMode(${catId}) error:`, e);
        grid.innerHTML = `<div style="padding:40px;text-align:center;color:#9ca3af;width:100%;"><div style="font-size:24px;margin-bottom:8px;">⚠️</div><div>加载失败</div><button onclick="window.categoryTimeline?.loadCardMode('${catId}')" style="margin-top:12px;padding:8px 16px;background:#07c160;color:white;border:none;border-radius:6px;cursor:pointer;">重试</button></div>`;
    }
}

// Build news items HTML from /api/category/ response format (different from timeline API format)
function _buildCategoryNewsHtml(newsArr, platformId, platformName) {
    if (!newsArr || !newsArr.length) return '<li style="padding:20px;color:#9ca3af;">暂无内容</li>';
    return newsArr.map((n, idx) => {
        const stableId = escapeHtml(n?.stable_id || '');
        const title = escapeHtml(n?.display_title || n?.title || '');
        const url = escapeHtml(n?.url || '#');
        const sourceId = escapeHtml(platformId);
        const sourceName = escapeHtml(platformName);
        const t = _fmtTime(n?.timestamp || n?.published_at || n?.created_at);
        const timeHtml = t ? `<span class="tr-news-date">${escapeHtml(t)}</span>` : '';
        const escapedTitle = title.replace(/'/g, "\\'");
        const escapedUrl = url.replace(/'/g, "\\'");
        const escapedSource = sourceName.replace(/'/g, "\\'");
        const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${stableId}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSource}')"></span>`;
        const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${stableId}" data-title="${title.replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}" data-source-id="${sourceId}" data-source-name="${sourceName.replace(/"/g, '&quot;')}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSource}')"></button>`;
        const commentBtnHtml = `<button class="news-comment-btn" data-url="${url.replace(/"/g, '&quot;')}" data-title="${title.replace(/"/g, '&quot;')}"></button>`;
        const actionsHtml = `<div class="news-actions">${timeHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;
        return `
            <li class="news-item" data-news-id="${stableId}" data-news-title="${title}" data-news-url="${url}">
                <div class="news-item-content">
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

// --- Public API ---
export const categoryTimeline = {
    load: loadTimeline,
    loadCardMode,
    resetState: _resetState,
    restoreCardMode,
    getState: _getState,
};

window.categoryTimeline = categoryTimeline;
TR.categoryTimeline = categoryTimeline;
