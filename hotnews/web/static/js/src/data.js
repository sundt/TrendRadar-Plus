/**
 * Hotnews Data Module
 * 数据获取、渲染、自动刷新
 */

import { TR, ready, escapeHtml, formatUpdatedAt, formatNewsDate } from './core.js';
import { storage } from './storage.js';
import { renderPlatformCardHtml } from './templates/platform-card.js';
import { renderRssColPane, renderExplorePane, renderMyTagsPane, renderTopicDynamicPane, renderDiscoveryPane, renderThemePane } from './templates/tab-panes.js';

const TAB_STORAGE_KEY = 'hotnews_active_tab';
const CATEGORY_PAGE_SIZE = window.SYSTEM_SETTINGS?.display?.items_per_card || 20;

let _ajaxRefreshInFlight = false;
let _ajaxLastRefreshAt = 0;
let _ajaxRefreshPending = null;

let _latestCategories = null;
let _platformCloseHandlersAttached = false;

let _lazyPlatformObserver = null;

function _getCategoryIdFromCard(card) {
    const pane = card?.closest?.('.tab-pane');
    const id = pane?.id || '';
    return id.startsWith('tab-') ? id.slice(4) : null;
}

function _isCustomCategoryId(catId) {
    try {
        const merged = TR.settings?.getMergedCategoryConfig ? TR.settings.getMergedCategoryConfig() : null;
        const custom = Array.isArray(merged?.customCategories) ? merged.customCategories : [];
        return custom.some((c) => String(c?.id || '').trim() === String(catId || '').trim());
    } catch (e) {
        return false;
    }
}

// Template functions used via ./templates/platform-card.js (renderPlatformCardHtml)
// and ./templates/tab-panes.js (renderRssColPane, renderExplorePane, etc.)

function _createNewsLi(n, idx, platformId, platformName) {
    const li = document.createElement('li');
    li.className = 'news-item';
    const newsId = String(n?.stable_id || '');
    li.dataset.newsId = newsId;
    li.dataset.newsTitle = String(n?.display_title || n?.title || '');
    li.dataset.newsUrl = String(n?.url || '');

    const content = document.createElement('div');
    content.className = 'news-item-content';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'news-checkbox';
    cb.title = '标记已读';
    cb.addEventListener('change', () => {
        try { window.markAsRead(cb); } catch (e) { /* ignore */ }
    });

    const indexSpan = document.createElement('span');
    indexSpan.className = 'news-index';
    indexSpan.textContent = String(idx);

    const a = document.createElement('a');
    a.className = 'news-title';
    if (n?.is_cross_platform) a.classList.add('cross-platform');
    a.href = String(n?.url || '#');
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.setAttribute('onclick', 'handleTitleClickV2(this, event)');
    a.setAttribute('onauxclick', 'handleTitleClickV2(this, event)');
    a.setAttribute('oncontextmenu', 'handleTitleClickV2(this, event)');
    a.setAttribute('onkeydown', 'handleTitleKeydownV2(this, event)');
    a.textContent = String(n?.display_title || n?.title || '');

    if (n?.is_cross_platform) {
        const cps = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
        const badge = document.createElement('span');
        badge.className = 'cross-platform-badge';
        badge.title = `同时出现在: ${cps.join(', ')}`;
        badge.textContent = `🔥 ${String(n?.cross_platform_count ?? '')}`;
        a.appendChild(document.createTextNode(' '));
        a.appendChild(badge);
    }

    content.appendChild(cb);
    content.appendChild(indexSpan);
    content.appendChild(a);

    // AI indicator dot (breathing purple)
    const aiDot = document.createElement('span');
    aiDot.className = 'news-ai-indicator';
    aiDot.dataset.newsId = newsId;
    aiDot.title = 'AI 智能总结';
    aiDot.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.handleSummaryClick === 'function') {
            window.handleSummaryClick(e, newsId, String(n?.display_title || n?.title || ''), String(n?.url || ''), platformId, platformName);
        }
    };
    content.appendChild(aiDot);

    // Actions container (date + summary button)
    const actions = document.createElement('div');
    actions.className = 'news-actions';

    const dateStr = formatNewsDate(n?.timestamp);
    if (dateStr) {
        const dateSpan = document.createElement('span');
        dateSpan.className = 'tr-news-date';
        dateSpan.textContent = dateStr;
        actions.appendChild(dateSpan);
    }

    // Hover buttons container
    const hoverBtns = document.createElement('div');
    hoverBtns.className = 'news-hover-btns';

    // Summary button
    const summaryBtn = document.createElement('button');
    summaryBtn.className = 'news-summary-btn';
    summaryBtn.dataset.newsId = newsId;
    summaryBtn.dataset.title = String(n?.display_title || n?.title || '');
    summaryBtn.dataset.url = String(n?.url || '');
    summaryBtn.dataset.sourceId = platformId;
    summaryBtn.dataset.sourceName = platformName || '';
    summaryBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof window.handleSummaryClick === 'function') {
            window.handleSummaryClick(e, newsId, String(n?.display_title || n?.title || ''), String(n?.url || ''), platformId, platformName);
        }
    };
    hoverBtns.appendChild(summaryBtn);

    // Comment button
    const commentBtn = document.createElement('button');
    commentBtn.className = 'news-comment-btn';
    commentBtn.dataset.url = String(n?.url || '');
    commentBtn.dataset.title = String(n?.display_title || n?.title || '');
    hoverBtns.appendChild(commentBtn);

    actions.appendChild(hoverBtns);

    content.appendChild(actions);

    content.appendChild(actions);

    li.appendChild(content);

    const meta = String(n?.meta || '').trim();
    const isRssPlatform = String(platformId || '').startsWith('rss-');
    if (meta && !isRssPlatform) {
        const sub = document.createElement('div');
        sub.className = 'news-subtitle';
        sub.textContent = meta;
        li.appendChild(sub);
    }

    try {
        const reads = TR.readState?.getReadNews?.() || {};
        if (li.dataset.newsId && reads[li.dataset.newsId]) {
            li.classList.add('read');
            cb.checked = true;
        }
    } catch (e) {
        // ignore
    }

    return li;
}

async function _hydrateLazyPlatformCard(card) {
    if (!card || !(card instanceof Element)) return;
    if (String(card?.dataset?.lazy || '') !== '1') return;
    if (String(card?.dataset?.loading || '') === '1') return;

    const pane = card.closest('.tab-pane');
    if (!pane || !pane.classList.contains('active')) return;

    const pid = String(card.dataset.platform || '').trim();
    if (!pid) return;

    card.dataset.loading = '1';
    try {
        const url = `/api/news/page?platform_id=${encodeURIComponent(pid)}&offset=0&page_size=${encodeURIComponent(String(CATEGORY_PAGE_SIZE))}`;
        const resp = await fetch(url);
        if (!resp.ok) return;
        const payload = await resp.json();
        const items = Array.isArray(payload?.items) ? payload.items : [];

        const list = card.querySelector('.news-list');
        if (!list) return;

        list.querySelectorAll('.tr-news-skeleton').forEach((el) => el.remove());
        list.querySelectorAll('.news-placeholder').forEach((el) => el.remove());
        list.querySelectorAll('.news-item').forEach((el) => el.remove());

        // Get platform name from card header
        const platformNameEl = card.querySelector('.platform-name');
        const platformName = platformNameEl ? platformNameEl.textContent.trim() : pid;

        const capped = items.slice(0, CATEGORY_PAGE_SIZE);
        for (let i = 0; i < capped.length; i++) {
            list.appendChild(_createNewsLi(capped[i], i + 1, pid, platformName));
        }

        const loadedCount = list.querySelectorAll('.news-item').length;
        card.dataset.loadedCount = String(loadedCount);
        card.dataset.hasMore = '0';
        card.dataset.loadedDone = '1';
        card.dataset.lazy = '0';

        try {
            if (TR.paging) {
                TR.paging.setCardPageSize(card, Math.min(CATEGORY_PAGE_SIZE, Math.max(1, loadedCount || CATEGORY_PAGE_SIZE)));
                TR.paging.applyPagingToCard(card, 0);
            }
        } catch (e) {
            // ignore
        }

        try {
            if (TR.counts?.updatePlatformCount) TR.counts.updatePlatformCount(card);
            if (TR.counts?.updateAllCounts) TR.counts.updateAllCounts();
        } catch (e) {
            // ignore
        }

        try {
            TR.search?.searchNews?.();
        } catch (e) {
            // ignore
        }

        try {
            const activeTab = TR.tabs?.getActiveTabId?.() || null;
            if (activeTab) TR.filter?.applyCategoryFilter?.(activeTab);
        } catch (e) {
            // ignore
        }
    } catch (e) {
        // ignore
    } finally {
        card.dataset.loading = '0';
    }
}

function _attachLazyPlatformObservers() {
    try {
        if (_lazyPlatformObserver) {
            _lazyPlatformObserver.disconnect();
            _lazyPlatformObserver = null;
        }
    } catch (e) {
        // ignore
    }

    _lazyPlatformObserver = new IntersectionObserver((entries) => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const card = entry.target;
            if (!card || !(card instanceof Element)) continue;
            if (String(card?.dataset?.lazy || '') !== '1') {
                try { _lazyPlatformObserver?.unobserve?.(card); } catch (e) { /* ignore */ }
                continue;
            }
            _hydrateLazyPlatformCard(card).catch(() => { });
        }
    }, { root: null, rootMargin: '0px 200px 0px 200px', threshold: 0.15 });

    document.querySelectorAll('.platform-card[data-lazy="1"]').forEach((card) => {
        try { _lazyPlatformObserver.observe(card); } catch (e) { /* ignore */ }
    });
}

function _waitAnimationEnd(el, timeoutMs) {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            try {
                el?.removeEventListener?.('animationend', onEnd);
            } catch (e) {
                // ignore
            }
            resolve();
        };
        const onEnd = () => finish();
        try {
            el?.addEventListener?.('animationend', onEnd, { once: true });
        } catch (e) {
            // ignore
        }
        setTimeout(finish, Math.max(0, Number(timeoutMs || 0) || 0));
    });
}

let _trConfirmOverlayEl = null;
let _trConfirmResolve = null;

function _showCenteredConfirmModal(message, okText, cancelText) {
    return new Promise((resolve) => {
        if (_trConfirmResolve) {
            try {
                _trConfirmResolve(false);
            } catch (e) {
                // ignore
            }
        }
        _trConfirmResolve = resolve;

        if (!_trConfirmOverlayEl) {
            const overlay = document.createElement('div');
            overlay.className = 'tr-confirm-overlay';
            overlay.innerHTML = `
                <div class="tr-confirm-modal" role="dialog" aria-modal="true">
                    <div class="tr-confirm-message"></div>
                    <div class="tr-confirm-actions">
                        <button type="button" class="tr-confirm-btn tr-confirm-cancel" data-action="cancel"></button>
                        <button type="button" class="tr-confirm-btn tr-confirm-ok" data-action="ok"></button>
                    </div>
                </div>`;

            overlay.addEventListener('click', (e) => {
                const t = e?.target;
                if (!t || !(t instanceof Element)) return;
                const okBtn = t.closest('button[data-action="ok"]');
                const cancelBtn = t.closest('button[data-action="cancel"]');
                if (okBtn) {
                    e.preventDefault();
                    overlay.classList.remove('show');
                    const r = _trConfirmResolve;
                    _trConfirmResolve = null;
                    r?.(true);
                    return;
                }
                if (cancelBtn || t === overlay) {
                    e.preventDefault();
                    overlay.classList.remove('show');
                    const r = _trConfirmResolve;
                    _trConfirmResolve = null;
                    r?.(false);
                }
            });

            document.body.appendChild(overlay);
            _trConfirmOverlayEl = overlay;
        }

        try {
            const msgEl = _trConfirmOverlayEl.querySelector('.tr-confirm-message');
            if (msgEl) msgEl.textContent = String(message || '');
            const okEl = _trConfirmOverlayEl.querySelector('button[data-action="ok"]');
            if (okEl) okEl.textContent = String(okText || '确认');
            const cancelEl = _trConfirmOverlayEl.querySelector('button[data-action="cancel"]');
            if (cancelEl) cancelEl.textContent = String(cancelText || '取消');
        } catch (e) {
            // ignore
        }

        _trConfirmOverlayEl.classList.add('show');
    });
}

function _buildPlatformCardElement(categoryId, platformId, platform, state, opts = {}) {
    const catId = String(categoryId || '').trim();
    const pid = String(platformId || '').trim();
    const pagingOffset = (pid && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[pid])) ? state.pagingOffsets[pid] : 0;

    const html = renderPlatformCardHtml(catId, pid, platform, {
        isLazy: false,
        pageSize: CATEGORY_PAGE_SIZE,
        pagingOffset,
        animateIn: !!(opts && opts.animateIn),
    });

    const wrap = document.createElement('div');
    wrap.innerHTML = html.trim();
    return wrap.firstElementChild;
}

async function _deletePlatformFromCustomCategory(catId, platformId) {
    // ... (no changes)
    const custom = Array.isArray(config.customCategories) ? config.customCategories : [];
    const idx = custom.findIndex((c) => String(c?.id || '').trim() === cid);
    if (idx < 0) return false;

    const prev = custom[idx] || {};
    const prevPlatforms = Array.isArray(prev.platforms) ? prev.platforms : [];
    const nextPlatforms = prevPlatforms.filter((x) => String(x || '').trim() !== pid);
    config.customCategories[idx] = { ...prev, platforms: nextPlatforms };

    try {
        TR.settings.saveCategoryConfig(config);
    } catch (e) {
        return false;
    }
    return true;
}

async function _verifyServerRssSubscriptionRemoved(sourceId) {
    const sid = String(sourceId || '').trim();
    if (!sid) return false;
    try {
        const resp = await fetch('/api/me/rss-subscriptions', { method: 'GET' });
        if (!resp.ok) return false;
        const payload = await resp.json().catch(() => ({}));
        const subs = Array.isArray(payload?.subscriptions) ? payload.subscriptions : [];
        const exists = subs.some((s) => String(s?.source_id || s?.rss_source_id || '').trim() === sid);
        return !exists;
    } catch (e) {
        return false;
    }
}

async function _deleteRssSubscriptionByPlatformId(platformId) {
    const pid = String(platformId || '').trim();
    if (!pid.startsWith('rss-')) return false;
    const sid = pid.slice(4);
    if (!sid) return false;

    if (!TR.subscription) return false;
    try {
        TR.subscription.ensureSnapshot?.();
    } catch (e) {
        // ignore
    }
    let subs = [];
    try {
        subs = TR.subscription.getSubscriptions ? TR.subscription.getSubscriptions() : [];
    } catch (e) {
        subs = [];
    }
    const next = (Array.isArray(subs) ? subs : []).filter((s) => String(s?.source_id || s?.rss_source_id || '').trim() !== sid);
    try {
        TR.subscription.setSubscriptions?.(next);
    } catch (e) {
        return false;
    }

    try {
        if (TR.subscription.saveOnly) {
            await TR.subscription.saveOnly();
        } else if (TR.subscription.saveAndRefresh) {
            await TR.subscription.saveAndRefresh();
        }
    } catch (e) {
        return false;
    }

    return await _verifyServerRssSubscriptionRemoved(sid);
}

async function _deletePlatformCard(cardEl) {
    if (!cardEl || !(cardEl instanceof Element)) return;
    const catId = _getCategoryIdFromCard(cardEl);
    const pid = String(cardEl.getAttribute('data-platform') || '').trim();
    if (!catId || !pid) return;
    if (catId === 'explore') return;

    const isRss = pid.startsWith('rss-');
    if (!isRss) return;

    try {
        let shouldConfirm = true;
        try {
            const qs = new URLSearchParams(window.location.search);
            if (qs.get('e2e') === '1') {
                shouldConfirm = false;
            }
        } catch (e2) {
            // ignore
        }
        try {
            if (typeof navigator !== 'undefined' && navigator.webdriver === true) {
                shouldConfirm = false;
            }
        } catch (e2) {
            // ignore
        }

        if (shouldConfirm) {
            const ok = await _showCenteredConfirmModal(
                '确定要删除该 RSS 卡片吗？删除后将取消订阅。',
                '确认删除',
                '取消'
            );
            if (!ok) return;
        }
    } catch (e) {
        // ignore
    }

    try {
        const btn = cardEl.querySelector('button[data-action="delete-platform"]');
        if (btn) btn.setAttribute('disabled', 'true');
    } catch (e) {
        // ignore
    }

    const parent = cardEl.parentNode;
    const nextSibling = cardEl.nextSibling;

    try {
        if (parent) parent.removeChild(cardEl);
    } catch (e) {
        // ignore
    }
    try {
        TR.counts?.updateAllCounts?.();
    } catch (e) {
        // ignore
    }

    const ok = await _deleteRssSubscriptionByPlatformId(pid);

    if (!ok) {
        try {
            if (parent) {
                if (nextSibling) parent.insertBefore(cardEl, nextSibling);
                else parent.appendChild(cardEl);
            }
        } catch (e) {
            // ignore
        }
        try {
            const btn2 = cardEl.querySelector('button[data-action="delete-platform"]');
            if (btn2) btn2.removeAttribute('disabled');
        } catch (e) {
            // ignore
        }
        try {
            TR.toast?.show?.('删除失败：订阅未能从服务端移除，请稍后重试', { variant: 'error', durationMs: 2500 });
        } catch (e) {
            // ignore
        }
        return;
    }

    try {
        TR.counts?.updateAllCounts?.();
        TR.readState?.updateReadCount?.();
    } catch (e) {
        // ignore
    }
}

/**
 * 生成二级/三级 dropdown 列内容
 * children: 二级分类节点数组（每个节点可能有 children 三级）
 */
function renderDropdownColumns(children) {
    if (!children || !children.length) return '';
    return children.map(child => {
        const childId = escapeHtml(child.id || '');
        const childName = escapeHtml(child.name || child.id || '');
        const grandchildren = Array.isArray(child.children) ? child.children : [];
        if (grandchildren.length) {
            // 有三级：列标题不可点击，列内容为三级列表
            const items = grandchildren.map(gc => {
                const gcId = escapeHtml(gc.id || '');
                const gcName = escapeHtml(gc.name || gc.id || '');
                return `<div class="dd-item" onclick="window.handleTabClickWithAuth && window.handleTabClickWithAuth('${gcId}')">${gcName}</div>`;
            }).join('');
            return `
                <div class="dropdown-col">
                    <div class="dropdown-col-title">${childName}</div>
                    ${items}
                </div>`;
        } else {
            // 无三级：列标题可点击直接跳转
            return `
                <div class="dropdown-col">
                    <div class="dropdown-col-title dropdown-col-title--link" onclick="window.handleTabClickWithAuth && window.handleTabClickWithAuth('${childId}')">${childName}</div>
                </div>`;
        }
    }).join('');
}

/**
 * 生成桌面端导航 HTML（含 hover dropdown megamenu）
 * columns: /api/columns 返回的一级栏目树数组
 * categories: /api/news 返回的 categories 对象（用于 badge 等）
 * activeTabId: 当前激活的 tab id
 */
function renderDesktopNav(columns, categories, activeTabId) {
    if (!Array.isArray(columns) || !columns.length) return '';
    return columns.map(col => {
        const colId = escapeHtml(col.id || '');
        const colName = escapeHtml(col.name || col.id || '');
        const children = Array.isArray(col.children) ? col.children : [];
        const cat = categories ? categories[col.id] : null;
        const badgeCategory = cat?.is_new ? `<span class="new-badge new-badge-category" data-category="${colId}">NEW</span>` : '';
        const badgeSports = col.id === 'sports' ? '<span class="new-badge" id="newBadgeSportsTab" style="display:none;">NEW</span>' : '';
        const badge = `${badgeCategory}${badgeSports}`;

        // Determine active state: active if colId matches OR any child/grandchild matches
        function _isDescendantActive(nodes) {
            for (const n of nodes) {
                if (String(n.id) === String(activeTabId)) return true;
                if (Array.isArray(n.children) && _isDescendantActive(n.children)) return true;
            }
            return false;
        }
        const isActive = String(col.id) === String(activeTabId) || _isDescendantActive(children);
        const activeClass = isActive ? ' active' : '';

        if (!children.length) {
            // 无子分类：普通 tab 按钮
            return `<button class="sub-tab${activeClass}" data-category="${colId}" onclick="window.handleTabClickWithAuth && window.handleTabClickWithAuth('${colId}')">${colName}${badge}</button>`;
        }

        // 有子分类：wrapper + dropdown
        const dropdownCols = renderDropdownColumns(children);
        return `
            <div class="sub-tab-wrapper${activeClass}" data-category="${colId}">
                <button class="sub-tab${activeClass}" data-category="${colId}" onclick="window.handleTabClickWithAuth && window.handleTabClickWithAuth('${colId}')">${colName}${badge}</button>
                <div class="sub-dropdown">
                    <div class="dropdown-grid">
                        ${dropdownCols}
                    </div>
                </div>
            </div>`;
    }).join('');
}

export const data = {
    formatUpdatedAt,

    snapshotViewerState() {
        const activeTab = storage.getRaw(TAB_STORAGE_KEY) || (document.querySelector('.sub-tab.active')?.dataset?.category) || null;
        const pagingOffsets = {};
        document.querySelectorAll('.platform-card').forEach((card) => {
            const pid = card.dataset.platform;
            if (!pid) return;
            pagingOffsets[pid] = parseInt(card.dataset.pageOffset || '0', 10) || 0;
        });
        const grid = activeTab ? document.querySelector(`#tab-${activeTab} .platform-grid`) : null;
        const activeTabPlatformGridScrollLeft = grid ? (grid.scrollLeft || 0) : 0;
        let activeTabPlatformAnchorPlatformId = null;
        let activeTabPlatformAnchorOffsetX = 0;
        if (grid) {
            const left = grid.scrollLeft || 0;
            let anchor = null;
            const cards = grid.querySelectorAll('.platform-card');
            for (const card of cards) {
                if ((card.offsetLeft || 0) <= left + 1) {
                    anchor = card;
                } else {
                    break;
                }
            }
            if (anchor?.dataset?.platform) {
                activeTabPlatformAnchorPlatformId = anchor.dataset.platform;
                activeTabPlatformAnchorOffsetX = Math.max(0, left - (anchor.offsetLeft || 0));
            }
        }
        if (activeTab && grid) {
            TR.scroll.recordPlatformGridScrollForTab(activeTab, grid);
        }
        return {
            activeTab,
            pagingOffsets,
            activeTabPlatformGridScrollLeft,
            activeTabPlatformAnchorPlatformId,
            activeTabPlatformAnchorOffsetX,
            showReadMode: document.body.classList.contains('show-read-mode'),
            scrollY: window.scrollY || 0,
            searchText: (document.getElementById('searchInput')?.value || ''),
        };
    },

    renderViewerFromData(data, state, columns) {
        const contentEl = document.querySelector('.tab-content-area');
        const tabsEl = document.getElementById('homeSubTabs');
        if (!tabsEl || !contentEl) return;

        // Reset dynamic module states before re-rendering
        try {
            if (window.HotNews?.featuredMps?.resetState) {
                window.HotNews.featuredMps.resetState();
            }
        } catch (e) {
            // ignore
        }

        // Do NOT preserve knowledge grid HTML — no longer needed (knowledge tab removed)
        // morning-brief.js is disabled; knowledge tab replaced by tag-driven AI column

        const categories = TR.settings.applyCategoryConfigToData(data?.categories || {});
        _latestCategories = categories;
        const preferredActiveTab = (state && typeof state.activeTab === 'string') ? state.activeTab : null;
        const isE2E = (() => {
            try {
                return (new URLSearchParams(window.location.search)).get('e2e') === '1';
            } catch (e) {
                return false;
            }
        })();
        const tabIds = Object.keys(categories || {});
        let firstTabId = tabIds[0] || null;
        if (firstTabId === 'explore') {
            firstTabId = tabIds.find((id) => id !== 'explore') || firstTabId;
        }
        if (isE2E && firstTabId === 'rsscol-rss') {
            firstTabId = tabIds.find((id) => id !== 'rsscol-rss') || firstTabId;
        }
        let activeTabId = preferredActiveTab || firstTabId;
        if (activeTabId === 'explore' && activeTabId !== preferredActiveTab) {
            activeTabId = tabIds.find((id) => id !== 'explore') || activeTabId;
        }
        if (isE2E && activeTabId === 'rsscol-rss') {
            activeTabId = tabIds.find((id) => id !== 'rsscol-rss') || activeTabId;
        }
        // If the preferred tab is a topic tab (not in server categories),
        // use the first available tab for initial render. Topic-tracker will
        // switch to the correct tab after it loads topics from API.
        const isPreferredTopicTab = preferredActiveTab && String(preferredActiveTab).startsWith('topic-') && !tabIds.includes(preferredActiveTab);
        if (isPreferredTopicTab) {
            activeTabId = firstTabId;
        }

        const tabsHtml = (() => {
            // 若有 columns 数据，用 renderDesktopNav 生成含 dropdown 的导航
            if (Array.isArray(columns) && columns.length) {
                return renderDesktopNav(columns, categories, activeTabId);
            }
            // 降级：无 columns 时沿用旧逻辑
            return Object.entries(categories).map(([catId, cat]) => {
                if (String(catId).startsWith('topic-')) return '';
                const name = escapeHtml(cat?.name || catId);
                const badgeCategory = cat?.is_new ? `<span class="new-badge new-badge-category" data-category="${escapeHtml(catId)}">NEW</span>` : '';
                const badgeSports = catId === 'sports' ? '<span class="new-badge" id="newBadgeSportsTab" style="display:none;">NEW</span>' : '';
                const badge = `${badgeCategory}${badgeSports}`;
                const activeClass = (String(catId) === String(activeTabId)) ? ' active' : '';
                return `<button class="sub-tab${activeClass}" data-category="${escapeHtml(catId)}" onclick="switchTab('${escapeHtml(catId)}')">${name}${badge}</button>`;
            }).filter(Boolean).join('');
        })();

        // Build a set of theme column ids (from /api/columns) for quick lookup
        // These get renderThemePane — content loaded by categoryTimeline on switchTab
        const _themeColIds = new Set();
        if (Array.isArray(columns) && columns.length) {
            function _collectIds(nodes) {
                for (const n of nodes) {
                    _themeColIds.add(String(n.id));
                    if (Array.isArray(n.children)) _collectIds(n.children);
                }
            }
            _collectIds(columns);
            // Exclude special tabs that have their own dedicated pane renderers
            ['my-tags', 'discovery', 'explore', 'rsscol-rss'].forEach(id => _themeColIds.delete(id));
        }

        const contentHtml = Object.entries(categories).map(([catId, cat]) => {
            const isActiveCategory = !!activeTabId && String(catId) === String(activeTabId);

            if (String(catId) === 'rsscol-rss') return renderRssColPane(catId, isActiveCategory);
            if (String(catId) === 'explore') return renderExplorePane(catId, isActiveCategory);
            if (String(catId) === 'my-tags') return renderMyTagsPane(catId, isActiveCategory);

            // Tag-driven 主题栏目：空 pane，由 categoryTimeline.load() 填充
            if (_themeColIds.has(String(catId))) return renderThemePane(catId, isActiveCategory);

            if (String(catId).startsWith('topic-')) {
                const isDynamic = cat?.is_dynamic !== false;
                if (isDynamic) {
                    return renderTopicDynamicPane(catId, isActiveCategory, Array.isArray(cat?.keywords) ? cat.keywords : []);
                }
                // else: fall through to normal rendering with pre-loaded data
            }

            if (String(catId) === 'featured-mps') return ''; // featured-mps 已下线
            if (String(catId) === 'discovery') return renderDiscoveryPane(catId, isActiveCategory);
            // knowledge tab 已由 tag-driven AI 栏目替代，跳过

            const platforms = cat?.platforms || {};
            const orderedIds = Object.keys(platforms || {});

            // Smart Scroll-Aware Loading: Only hydrate cards near saved position
            const anchorPid = (isActiveCategory && state?.activeTabPlatformAnchorPlatformId) || null;
            const anchorIdx = anchorPid ? orderedIds.indexOf(anchorPid) : -1;
            const BUFFER_RANGE = 3;

            const platformCards = orderedIds.map((platformId, idx0) => {
                const platform = platforms?.[platformId];
                if (!platform) return '';

                const shouldHydrate = isActiveCategory && (
                    anchorIdx < 0 ? idx0 < 3 : (idx0 >= anchorIdx - BUFFER_RANGE && idx0 <= anchorIdx + BUFFER_RANGE)
                );
                const pagingOffset = (platformId && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[platformId])) ? state.pagingOffsets[platformId] : 0;

                return renderPlatformCardHtml(catId, platformId, platform, {
                    isLazy: !shouldHydrate,
                    pageSize: CATEGORY_PAGE_SIZE,
                    pagingOffset,
                });
            }).filter(Boolean).join('');

            const paneActiveClass = isActiveCategory ? ' active' : '';
            return `
            <div class="tab-pane${paneActiveClass}" id="tab-${escapeHtml(catId)}">
                <div class="platform-grid">${platformCards}
                </div>
                <div class="category-empty-state" style="display:none;" aria-hidden="true">没有匹配内容，请调整关键词或切换模式</div>
            </div>`;
        }).join('');

        tabsEl.innerHTML = tabsHtml + '<button class="sub-tab sub-tab-add" onclick="goToSettings()" onmouseenter="typeof preloadSubscribeSidebar === \'function\' && preloadSubscribeSidebar()" title="订阅更多内容">+ 订阅</button><div class="sub-tabs-indicator"></div>';

        // 为 _columnConfig 中所有子节点（L1/L2/L3）生成 pane（/api/news 不返回这些）
        let extraPanesHtml = '';
        if (Array.isArray(columns) && columns.length) {
            function _collectSubPanes(nodes) {
                let html = '';
                for (const n of nodes) {
                    const nId = String(n.id || '');
                    if (!nId || nId in (categories || {})) continue; // already rendered
                    // 排除自管理 tab（它们有自己的 pane renderer）
                    if (['my-tags', 'discovery', 'explore', 'rsscol-rss'].includes(nId)) continue;
                    const isActive = nId === String(activeTabId);
                    html += renderThemePane(nId, isActive);
                    if (Array.isArray(n.children) && n.children.length) {
                        html += _collectSubPanes(n.children);
                    }
                }
                return html;
            }
            extraPanesHtml = _collectSubPanes(columns);
        }

        contentEl.innerHTML = contentHtml + extraPanesHtml;

        // 更新滑动指示器
        if (TR.tabs && TR.tabs.updateIndicator) {
            TR.tabs.updateIndicator(tabsEl, false);
        }

        const updatedAtEl = document.getElementById('updatedAt');
        if (updatedAtEl && data?.updated_at) updatedAtEl.textContent = formatUpdatedAt(data.updated_at);

        // 重新从 localStorage 读取当前的 activeTab，而不是使用 state.activeTab
        // 这是因为用户可能在 API 请求期间切换了 tab，state.activeTab 是旧值
        const currentStoredTab = storage.getRaw(TAB_STORAGE_KEY);
        const desiredTab = currentStoredTab || (state && typeof state.activeTab === 'string' ? state.activeTab : null);
        if (desiredTab) {
            const escapedDesired = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(desiredTab) : desiredTab;
            const desiredTabEl = document.querySelector(`.sub-tab[data-category="${escapedDesired}"]`);
            if (desiredTabEl) {
                TR.tabs.switchTab(desiredTab);
            } else if (String(desiredTab).startsWith('topic-')) {
                // Topic tab not yet loaded by topic-tracker - show first tab visually
                // but preserve the topic tab ID in localStorage for later restore
                const firstTab = document.querySelector('.sub-tab[data-category]');
                if (firstTab?.dataset?.category) {
                    // Temporarily switch to first tab without overwriting localStorage
                    document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
                    firstTab.classList.add('active');
                    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
                    const firstPane = document.getElementById(`tab-${firstTab.dataset.category}`);
                    if (firstPane) firstPane.classList.add('active');
                }
                // Keep the topic tab ID in localStorage
                storage.setRaw(TAB_STORAGE_KEY, desiredTab);
            } else {
                const firstTab = document.querySelector('.sub-tab[data-category]');
                if (firstTab?.dataset?.category) {
                    TR.tabs.switchTab(firstTab.dataset.category);
                } else {
                    storage.remove(TAB_STORAGE_KEY);
                }
            }
        } else {
            const firstTab = document.querySelector('.sub-tab[data-category]');
            if (firstTab?.dataset?.category) {
                TR.tabs.switchTab(firstTab.dataset.category);
            } else {
                storage.remove(TAB_STORAGE_KEY);
            }
        }

        const nextShowReadMode = (typeof state?.showReadMode === 'boolean') ? state.showReadMode : TR.readState.getShowReadModePref();
        TR.readState.applyShowReadMode(nextShowReadMode);

        const searchEl = document.getElementById('searchInput');
        if (searchEl && typeof state?.searchText === 'string') {
            searchEl.value = state.searchText;
        }
        TR.search.searchNews();

        TR.filter.applyCategoryFilterForActiveTab();

        TR.readState.restoreReadState();

        document.querySelectorAll('.platform-card').forEach((card) => {
            const pid = card.dataset.platform;
            const off = (pid && state?.pagingOffsets && Number.isFinite(state.pagingOffsets[pid])) ? state.pagingOffsets[pid] : 0;
            TR.paging.setCardPageSize(card, TR.paging.PAGE_SIZE);
            TR.paging.applyPagingToCard(card, off);
        });

        TR.counts.updateAllCounts();
        TR.readState.updateReadCount();
        TR.scroll.restoreActiveTabPlatformGridScroll(state);
        TR.scroll.attachPlatformGridScrollPersistence();

        // 数据渲染完成，移除早期隐藏样式并揭开幕布显示栏目
        const earlyHide = document.getElementById('early-hide');
        if (earlyHide) earlyHide.remove();
        const earlyHideCategories = document.getElementById('early-hide-categories');
        if (earlyHideCategories) earlyHideCategories.remove();
        document.body.classList.add('categories-ready');

        TR.paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });

        _attachLazyPlatformObservers();

        try {
            if (TR.infiniteScroll && typeof TR.infiniteScroll.attach === 'function') {
                TR.infiniteScroll.attach();
            }
        } catch (e) {
            // ignore
        }

        // Dispatch events for modules to respond to render completion
        try {
            // Reset settings cache so topic categories are included
            if (TR.settings && typeof TR.settings.resetDefaultCategoriesCache === 'function') {
                TR.settings.resetDefaultCategoriesCache();
            }
            // Event bus: notify all subscribers that viewer DOM has been rebuilt
            TR.events.emit('viewer:rendered', data, state);
            TR.events.emit('viewer:ready');
        } catch (e) {
            // ignore
        }
    },

    async refreshViewerData(opts = {}) {
        const preserveScroll = opts.preserveScroll !== false;

        // Check for saved navigation state (back-navigation from WeChat etc.)
        // Peek first, consume after render to avoid losing it on error
        const navState = TR.scroll?.peekNavigationState?.() || null;
        const effectivePreserveScroll = preserveScroll || !!navState;

        if (_ajaxRefreshInFlight) {
            if (!_ajaxRefreshPending) {
                _ajaxRefreshPending = { preserveScroll: effectivePreserveScroll };
            } else {
                _ajaxRefreshPending.preserveScroll = _ajaxRefreshPending.preserveScroll && effectivePreserveScroll;
            }
            return;
        }
        _ajaxRefreshInFlight = true;
        try {
            const state = this.snapshotViewerState();
            state.preserveScroll = effectivePreserveScroll;

            // If we have a navigation state from back-navigation, override activeTab
            if (navState && navState.activeTab) {
                state.activeTab = navState.activeTab;
                // Also write to localStorage so renderViewerFromData picks it up
                storage.setRaw(TAB_STORAGE_KEY, navState.activeTab);

                // Inject anchor info from nav state (sessionStorage) into the render state
                // so Smart Scroll-Aware Loading hydrates the correct cards.
                // Nav state anchor is authoritative — it was saved at click time and
                // stored in sessionStorage, immune to localStorage overwrites during reload.
                if (navState.anchorPlatformId) {
                    state.activeTabPlatformAnchorPlatformId = navState.anchorPlatformId;
                    state.activeTabPlatformAnchorOffsetX = navState.anchorOffsetX || 0;
                    state.activeTabPlatformGridScrollLeft = navState.gridScrollLeft || 0;
                } else {
                    // Fallback: try localStorage (may have been saved by saveNavigationState)
                    try {
                        const savedGridScroll = TR.scroll?.getPlatformGridScrollState?.() || {};
                        const tabScroll = savedGridScroll[navState.activeTab];
                        if (tabScroll && tabScroll.anchorPlatformId) {
                            state.activeTabPlatformAnchorPlatformId = tabScroll.anchorPlatformId;
                            state.activeTabPlatformAnchorOffsetX = tabScroll.anchorOffsetX || 0;
                            state.activeTabPlatformGridScrollLeft = tabScroll.left || 0;
                        }
                    } catch (e) { /* ignore */ }
                }
            }

            const [newsResponse, columnsResponse] = await Promise.all([
                fetch('/api/news'),
                fetch('/api/columns').catch(() => null),
            ]);
            const baseData = await newsResponse.json();

            // 自动同步本地缓存：清理服务器上已不存在的平台
            try {
                if (TR.settings?.syncCacheWithServer && baseData?.categories) {
                    TR.settings.syncCacheWithServer(baseData.categories);
                }
            } catch (e) {
                console.error('[HotNews] Cache sync failed:', e);
            }

            // 挂载 column_config 树到全局，供 view-mode.js / category-timeline.js 使用
            try {
                if (columnsResponse && columnsResponse.ok) {
                    const columnsData = await columnsResponse.json();
                    window._columnConfig = Array.isArray(columnsData) ? columnsData : (columnsData?.columns || []);
                    // 构建父节点映射 {childId -> parentId}，供 handleTabClickWithAuth 使用
                    window._columnParentMap = {};
                    function _buildParentMap(nodes, parentId) {
                        for (const n of nodes) {
                            if (parentId) window._columnParentMap[String(n.id)] = parentId;
                            if (Array.isArray(n.children) && n.children.length) {
                                _buildParentMap(n.children, String(n.id));
                            }
                        }
                    }
                    _buildParentMap(window._columnConfig, null);
                }
            } catch (e) {
                window._columnConfig = window._columnConfig || [];
            }

            this.renderViewerFromData(baseData, state, window._columnConfig);

            try { TR.events.emit('data:refreshed', baseData); } catch (_) { }

            // Restore scroll position: prefer navigation state (back-nav) over snapshot
            // For dynamic tabs (topic, my-tags, discovery): don't consume nav state here
            // — these modules handle scroll restoration after their content loads asynchronously.
            const navActiveTab = TR.scroll?.peekNavigationState?.()?.activeTab || '';
            const isTopicTab = String(navActiveTab).startsWith('topic-');
            const isDynamicTab = ['my-tags', 'discovery', 'explore'].includes(navActiveTab);
            
            console.log(`[Data] After render: navActiveTab=${navActiveTab}, isTopicTab=${isTopicTab}, isDynamicTab=${isDynamicTab}`);
            
            if (isTopicTab || isDynamicTab) {
                console.log(`[Data] Deferring scroll restore for dynamic tab: ${navActiveTab}`);
            } else {
                const consumedNav = TR.scroll?.consumeNavigationState?.() || null;
                console.log(`[Data] Consuming nav state for normal tab:`, consumedNav);
                if (consumedNav) {
                    TR.scroll.restoreNavGridScroll(consumedNav);
                    TR.scroll.restoreNavigationScrollY(consumedNav);
                } else if (state.preserveScroll) {
                    window.scrollTo({ top: state.scrollY, behavior: 'auto' });
                    TR.scroll.restoreActiveTabPlatformGridScroll(state);
                }
            }
            _ajaxLastRefreshAt = Date.now();
        } catch (e) {
            console.error('refreshViewerData error:', e);
        } finally {
            _ajaxRefreshInFlight = false;

            const pending = _ajaxRefreshPending;
            _ajaxRefreshPending = null;
            if (pending) {
                this.refreshViewerData({ preserveScroll: pending.preserveScroll });
            }
        }
    },

    async fetchData() {
        const btn = document.getElementById('fetchBtn');
        const progress = document.getElementById('progressContainer');
        const bar = document.getElementById('progressBar');
        const status = document.getElementById('fetchStatus');

        btn.classList.add('loading');
        btn.disabled = true;
        progress.classList.add('show');
        bar.classList.add('indeterminate');
        status.className = 'fetch-status';
        status.textContent = '正在获取数据...';

        try {
            const response = await fetch('/api/fetch', { method: 'POST' });
            const result = await response.json();

            bar.classList.remove('indeterminate');

            if (result.success) {
                bar.style.width = '100%';
                status.className = 'fetch-status success';
                status.textContent = `✅ ${result.platforms} 个平台，${result.news_count} 条新闻`;
                setTimeout(() => this.refreshViewerData({ preserveScroll: true }), 300);
            } else {
                bar.style.width = '0%';
                status.className = 'fetch-status error';
                status.textContent = `❌ ${result.error}`;
            }
        } catch (error) {
            bar.classList.remove('indeterminate');
            bar.style.width = '0%';
            status.className = 'fetch-status error';
            status.textContent = `❌ ${error.message}`;
        } finally {
            btn.classList.remove('loading');
            btn.disabled = false;
            setTimeout(() => {
                progress.classList.remove('show');
                bar.style.width = '0%';
            }, 5000);
        }
    },

    setupAjaxAutoRefresh() {
        const checkIntervalMs = 300000; // Check every 5 minutes

        // Silent check for updates - only show red dot, don't refresh
        const checkForUpdates = async () => {
            if (document.visibilityState !== 'visible') return;

            try {
                const resp = await fetch('/api/news/check-updates');
                if (!resp.ok) return;

                const data = await resp.json();
                if (data.categories) {
                    for (const [catId, hasNew] of Object.entries(data.categories)) {
                        if (hasNew) {
                            this.showCategoryUpdateDot(catId);
                        }
                    }
                }
            } catch (e) {
                // Silent fail
            }
        };

        // Check periodically
        setInterval(checkForUpdates, checkIntervalMs);

        // Also check when page becomes visible (but no page refresh)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                // Wait a bit then check
                setTimeout(checkForUpdates, 2000);
            }
        });
    },

    showCategoryUpdateDot(categoryId) {
        // Categories that should never show update dots (unreliable timestamps)
        const NO_UPDATE_DOT_CATEGORIES = ['explore'];
        if (NO_UPDATE_DOT_CATEGORIES.includes(categoryId)) return;

        const tab = document.querySelector(`.sub-tab[data-category="${categoryId}"]`);
        if (!tab) return;

        let dot = tab.querySelector('.update-dot');
        if (!dot) {
            dot = document.createElement('span');
            dot.className = 'update-dot';
            tab.style.position = 'relative';
            tab.appendChild(dot);
        }
        dot.classList.add('show');
    },

    hideCategoryUpdateDot(categoryId) {
        const tab = document.querySelector(`.sub-tab[data-category="${categoryId}"]`);
        if (!tab) return;

        const dot = tab.querySelector('.update-dot');
        if (dot) {
            dot.classList.remove('show');
        }
    }
};

// 全局函数
window.fetchData = () => data.fetchData();
window.refreshViewerData = (opts) => data.refreshViewerData(opts);

/**
 * Tab 点击（含登录检查）
 * 未登录时弹登录弹窗，已登录时直接切换
 */
window.handleTabClickWithAuth = (categoryId) => {
    try {
        const { authState } = window.TR || {};
        // 需要登录的栏目：检查 _columnConfig 中的 require_login 字段
        const node = (() => {
            const tree = window._columnConfig;
            if (!Array.isArray(tree)) return null;
            function _s(nodes) {
                for (const n of nodes) {
                    if (String(n.id) === String(categoryId)) return n;
                    if (Array.isArray(n.children)) { const f = _s(n.children); if (f) return f; }
                }
                return null;
            }
            return _s(tree);
        })();
        if (node?.require_login && authState && !authState.isLoggedIn()) {
            if (typeof window.openLoginModal === 'function') window.openLoginModal();
            return;
        }
        // 若点击的是子分类，记录到父栏目的 subtab 偏好
        if (window._columnParentMap && window._columnParentMap[categoryId] && window.TR?.tabs?.saveActiveSubTab) {
            window.TR.tabs.saveActiveSubTab(window._columnParentMap[categoryId], categoryId);
        }
    } catch (e) {
        // ignore
    }
    if (typeof window.switchTab === 'function') window.switchTab(categoryId);
};

TR.data = data;

// 初始化
ready(function () {
    const updatedAtEl = document.getElementById('updatedAt');
    if (updatedAtEl && updatedAtEl.textContent) {
        updatedAtEl.textContent = formatUpdatedAt(updatedAtEl.textContent);
    }
    data.setupAjaxAutoRefresh();

    if (!_platformCloseHandlersAttached) {
        _platformCloseHandlersAttached = true;
        document.addEventListener('click', (e) => {
            const t = e?.target;
            if (!t || !(t instanceof Element)) return;
            const btn = t.closest('button[data-action="delete-platform"]');
            if (!btn) return;
            const card = btn.closest('.platform-card');
            if (!card) return;
            _deletePlatformCard(card).catch(() => { });
        });

        document.addEventListener('click', async (e) => {
            const t = e?.target;
            if (!t || !(t instanceof Element)) return;
            const btn = t.closest('button[data-action="hide-platform"]');
            if (!btn) return;
            const card = btn.closest('.platform-card');
            const pid = String(card?.getAttribute?.('data-platform') || '').trim();
            if (!pid || pid.startsWith('rss-')) return;

            const ok = await _showCenteredConfirmModal(
                '确定要隐藏该卡片吗？隐藏后该卡片将不再显示，你可以在「栏目设置」中重新勾选并保存来恢复显示。',
                '确认隐藏',
                '取消'
            );
            if (!ok) return;
            try {
                btn.setAttribute('disabled', 'true');
            } catch (e) {
                // ignore
            }
            try {
                TR.settings?.togglePlatformHidden?.(pid);
            } catch (e) {
                // ignore
            }
        });
    }

    _attachLazyPlatformObservers();
});
