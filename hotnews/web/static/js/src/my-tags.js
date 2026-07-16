/**
 * My Tags Module
 * Handles the "我的标签" category tab which displays news filtered by user's followed tags.
 * Implements both frontend (localStorage) and backend caching for fast loading.
 * Integrated with auth-state.js for reactive auth updates.
 */

import { TR, formatNewsDate } from './core.js';
import { authState } from './auth-state.js';
import { events } from './events.js';
import { skeletonCards } from './skeleton.js';

const MY_TAGS_CATEGORY_ID = 'my-tags';
const MY_TAGS_CACHE_KEY = 'hotnews_my_tags_cache';
const INITIAL_CARDS_DESKTOP = 5;
const INITIAL_CARDS_MOBILE = 2;
const MAX_CARDS = 20;

let myTagsLoaded = false;
let myTagsLoading = false;
let _myTagsGeneration = 0;
let _timelineOffset = 0;
let _timelineFinished = false;
let _timelineObserver = null;
let _timelineScrollArmed = false;

function getItemsPerCard() {
    return (window.SYSTEM_SETTINGS && window.SYSTEM_SETTINGS.display && window.SYSTEM_SETTINGS.display.items_per_card) || 20;
}

function getInitialCards() {
    return window.innerWidth <= 640 ? INITIAL_CARDS_MOBILE : INITIAL_CARDS_DESKTOP;
}

/**
 * Check if user is authenticated using authState
 */
/**
 * Clear cached data
 */
function clearCache() {
    try {
        localStorage.removeItem(MY_TAGS_CACHE_KEY);
        console.log('[MyTags] Cache cleared');
    } catch (e) {
        console.error('[MyTags] Cache clear error:', e);
    }
}

/**
 * Redirect to login page
 */
function redirectToLogin() {
    window.location.href = '/api/auth/page';
}

/**
 * Check WeChat auth expiration and show warning if needed
 */
async function checkWechatAuthExpiration() {
    try {
        const res = await fetch('/api/wechat/auth/expiration-warning', {
            credentials: 'include'
        });
        if (!res.ok) return null;
        
        const data = await res.json();
        if (data.ok && data.show_warning) {
            // Show red dot on settings button instead of banner
            showSettingsWarningDot(true);
            return data;
        }
        showSettingsWarningDot(false);
        return null;
    } catch (e) {
        console.error('[MyTags] WeChat auth check failed:', e);
        return null;
    }
}

/**
 * Show/hide red warning dot on settings button
 */
function showSettingsWarningDot(show) {
    const badge = document.getElementById('categorySettingsNewBadge');
    if (badge) {
        if (show) {
            badge.style.display = 'inline-block';
            badge.style.background = '#ef4444';  // Red color for warning
            badge.classList.add('wechat-warning-dot');
        } else if (badge.classList.contains('wechat-warning-dot')) {
            badge.style.display = 'none';
            badge.classList.remove('wechat-warning-dot');
        }
    }
}

/**
 * Render WeChat auth expiration warning banner (disabled - now using red dot)
 */
function renderWechatWarningBanner(container, warningData) {
    // No longer showing banner, using red dot on settings button instead
    return;
}

/**
 * Render the empty state when user has no followed tags
 */
function renderEmptyState(container) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;">
            <div style="font-size:64px;margin-bottom:20px;">🏷️</div>
            <div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">您还未关注任何标签</div>
            <div style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">
                点击下方按钮添加感兴趣的标签、订阅源或公众号，<br>
                这里将为您聚合相关新闻
            </div>
            <button onclick="typeof openSubscribeSidebar === 'function' && openSubscribeSidebar()" 
               style="display:inline-block;padding:12px 24px;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:white;border:none;cursor:pointer;border-radius:8px;font-weight:500;font-size:15px;transition:transform 0.2s;"
               onmouseover="this.style.transform='scale(1.05)'"
               onmouseout="this.style.transform='scale(1)'">
                ➕ 添加关注
            </button>
        </div>
    `;
}

/**
 * Render the login required state
 */
function renderLoginRequired(container) {
    container.innerHTML = `
        <div class="platform-card" style="min-height:500px;">
            <div style="text-align:center;padding:80px 20px 40px;">
                <div style="font-size:56px;margin-bottom:16px;">🔒</div>
                <div style="font-size:17px;color:#374151;margin-bottom:10px;font-weight:600;">请先登录</div>
                <div style="font-size:13px;color:#6b7280;margin-bottom:20px;line-height:1.5;">
                    登录后即可查看您关注的标签新闻
                </div>
                <button onclick="openLoginModal()" 
                   style="display:inline-block;padding:10px 22px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:white;border:none;cursor:pointer;border-radius:8px;font-weight:500;font-size:14px;transition:transform 0.2s;"
                   onmouseover="this.style.transform='scale(1.05)'"
                   onmouseout="this.style.transform='scale(1)'">
                    立即登录
                </button>
            </div>
        </div>
    `;
}

/**
 * Render error state
 */
function renderError(container, message) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;">
            <div style="font-size:48px;margin-bottom:16px;">😕</div>
            <div style="font-size:16px;">加载失败: ${message || '未知错误'}</div>
            <button onclick="window.HotNews?.myTags?.load(true)" 
                    style="margin-top:16px;padding:8px 16px;background:#4f46e5;color:white;border:none;border-radius:6px;cursor:pointer;">
                重试
            </button>
        </div>
    `;
}

function ensureTimelineLayout(container) {
    if (!container) return;
    container.style.display = 'flex';
    container.style.flexDirection = 'row';
    container.style.overflowX = 'auto';
    container.style.overflowY = 'hidden';
    container.style.alignItems = 'flex-start';
    container.style.overscrollBehavior = 'contain';
}

function createTimelineSentinel(container) {
    const existing = container.querySelector('#my-tags-load-sentinel');
    if (existing) existing.remove();

    const sentinel = document.createElement('div');
    sentinel.id = 'my-tags-load-sentinel';
    sentinel.style.minWidth = '20px';
    sentinel.style.height = '100%';
    sentinel.style.flexShrink = '0';
    sentinel.innerHTML = '<div style="padding:20px;color:#9ca3af;font-size:12px;">⏳</div>';
    container.appendChild(sentinel);
    return sentinel;
}

function createTagCard(tagData, cardIndex) {
    const { tag, news, count } = tagData;
    const itemType = tagData.item_type || tag.type || 'tag';
    const tagIcon = tag.icon || '🏷️';
    const tagName = tag.name || tag.id;

    const newsListHtml = Array.isArray(news) && news.length > 0
        ? news.map((item, idx) => {
            const dateStr = formatNewsDate(item.published_at);
            const safeTitle = (item.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedTitle = safeTitle.replace(/'/g, "\\'");
            const escapedUrl = (item.url || '').replace(/'/g, "\\'");
            const escapedTagName = (tagName || '').replace(/'/g, "\\'");
            const dateHtml = dateStr ? `<span class="tr-news-date">${dateStr}</span>` : '';
            const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${item.id}" data-title="${safeTitle}" data-url="${item.url || ''}" data-source-id="${tag.id}" data-source-name="${tagName || ''}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${tag.id}', '${escapedTagName}')" ></button>`;
            const commentBtnHtml = `<button class="news-comment-btn" data-url="${(item.url || '').replace(/"/g, '&quot;')}" data-title="${safeTitle}"></button>`;
            const actionsHtml = `<div class="news-actions">${dateHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;
            return `
                <li class="news-item" data-news-id="${item.id}" data-news-title="${safeTitle}" data-news-url="${item.url || ''}">
                    <div class="news-item-content">
                        <span class="news-index">${idx + 1}</span>
                        <a class="news-title" href="${item.url || '#'}" target="_blank" rel="noopener noreferrer" onclick="handleTitleClickV2(this, event)" onauxclick="handleTitleClickV2(this, event)" oncontextmenu="handleTitleClickV2(this, event)" onkeydown="handleTitleKeydownV2(this, event)">
                            ${safeTitle}
                        </a>
                        ${actionsHtml}
                    </div>
                </li>
            `;
        }).join('')
        : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无相关新闻</li>';

    const extraAttrs = [];
    extraAttrs.push(`data-item-type="${itemType}"`);
    extraAttrs.push(`data-my-tags-index="${cardIndex}"`);
    if (itemType === 'keyword' && tagData.keyword_id) extraAttrs.push(`data-keyword-id="${tagData.keyword_id}"`);
    if (itemType === 'wechat' && tagData.fakeid) extraAttrs.push(`data-fakeid="${tagData.fakeid}"`);

    const card = document.createElement('div');
    card.className = 'platform-card tr-my-tags-card';
    card.style.minWidth = '360px';
    // data-platform 必须用稳定 ID（基于 tag.id），不能用位置 index。
    // 否则用户右键置顶后，保存的"位置-X"和刷新后重新分配的"位置-Y"对不上。
    card.dataset.platform = `mytags:${String(tag.id || '').toLowerCase()}`;
    card.dataset.tagId = tag.id;
    card.draggable = false;
    card.innerHTML = `
        <div class="platform-header">
            <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                ${tagIcon} ${tagName}
                <span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${count}条)</span>
            </div>
            <div class="platform-header-actions"></div>
        </div>
        <ul class="news-list" ${extraAttrs.join(' ')}>
            ${newsListHtml}
        </ul>
    `;
    return card;
}

function appendTagCards(tagsData, startIndex, container) {
    if (!container || !Array.isArray(tagsData) || tagsData.length <= 0) return;
    const sentinel = container.querySelector('#my-tags-load-sentinel');
    const fragment = document.createDocumentFragment();
    tagsData.forEach((tagData, idx) => {
        fragment.appendChild(createTagCard(tagData, startIndex + idx));
    });
    if (sentinel) container.insertBefore(fragment, sentinel);
    else container.appendChild(fragment);
}

async function fetchGroupedBatch(groupLimit, groupOffset, signal) {
    const newsLimit = getItemsPerCard();
    const url = `/api/user/preferences/followed-news?limit=${encodeURIComponent(String(newsLimit))}&group_limit=${encodeURIComponent(String(groupLimit))}&group_offset=${encodeURIComponent(String(groupOffset))}`;
    const res = await fetch(url, { credentials: 'include', signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload?.needsAuth) return { needsAuth: true, tags: [], total: 0 };
    return {
        ok: payload?.ok !== false,
        tags: Array.isArray(payload?.tags) ? payload.tags : [],
        total: Number.isFinite(payload?.total) ? payload.total : null,
    };
}

function attachTimelineObserver(container) {
    if (_timelineObserver) {
        try { _timelineObserver.disconnect(); } catch (e) { /* ignore */ }
        _timelineObserver = null;
    }
    if (!container) return;

    _timelineScrollArmed = false;
    const armScroll = () => {
        _timelineScrollArmed = true;
        container.removeEventListener('scroll', armScroll);
        const sentinel = container.querySelector('#my-tags-load-sentinel');
        if (sentinel) {
            const rootRect = container.getBoundingClientRect();
            const sentinelRect = sentinel.getBoundingClientRect();
            if (sentinelRect.left < rootRect.right + 200) {
                loadNextTimelineBatch().catch(() => {});
            }
        }
    };
    container.addEventListener('scroll', armScroll, { passive: true });

    _timelineObserver = new IntersectionObserver((entries) => {
        if (!_timelineScrollArmed) return;
        for (const entry of entries) {
            if (entry.isIntersecting) {
                loadNextTimelineBatch().catch(() => {});
            }
        }
    }, { root: container, rootMargin: '200px', threshold: 0.01 });

    const sentinel = container.querySelector('#my-tags-load-sentinel');
    if (sentinel) _timelineObserver.observe(sentinel);
}

async function loadNextTimelineBatch() {
    if (myTagsLoading || _timelineFinished) return;

    if (_timelineOffset >= MAX_CARDS) {
        _timelineFinished = true;
        const sentinel = document.getElementById('my-tags-load-sentinel');
        if (sentinel) {
            sentinel.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已达到最大显示数量</div>';
            sentinel.style.width = '40px';
        }
        return;
    }

    const container = document.getElementById('myTagsGrid');
    if (!container) return;

    myTagsLoading = true;
    const myGeneration = _myTagsGeneration;
    try {
        const groupLimit = getInitialCards();
        const result = await fetchGroupedBatch(groupLimit, _timelineOffset);
        if (myGeneration !== _myTagsGeneration) return;
        if (result.needsAuth) {
            renderLoginRequired(container);
            _timelineFinished = true;
            return;
        }

        const tags = result.tags || [];
        if (!tags.length) {
            _timelineFinished = true;
            const sentinel = document.getElementById('my-tags-load-sentinel');
            if (sentinel) {
                sentinel.innerHTML = '<div style="writing-mode:vertical-rl;padding:20px;color:#9ca3af;font-size:12px;">已显示全部内容</div>';
                sentinel.style.width = '40px';
            }
            return;
        }

        appendTagCards(tags, _timelineOffset, container);
        _timelineOffset += tags.length;

        if (tags.length < groupLimit || (result.total !== null && _timelineOffset >= result.total)) {
            _timelineFinished = true;
            const sentinel = document.getElementById('my-tags-load-sentinel');
            if (sentinel) sentinel.remove();
        }

        try { TR.readState?.restoreReadState?.(); } catch (e) { /* ignore */ }
    } catch (e) {
        console.error('[MyTags] timeline next batch failed:', e);
    } finally {
        myTagsLoading = false;
    }
}

/**
 * Wait for authState with timeout
 */
async function waitForAuthWithTimeout(timeoutMs = 3000) {
    if (authState.initialized) {
        return authState.getUser();
    }
    
    return new Promise((resolve) => {
        const timeout = setTimeout(() => {
            console.warn('[MyTags] authState init timeout, proceeding without auth');
            resolve(null);
        }, timeoutMs);
        
        authState.init().then(() => {
            clearTimeout(timeout);
            resolve(authState.getUser());
        }).catch((e) => {
            clearTimeout(timeout);
            console.error('[MyTags] authState init failed:', e);
            resolve(null);
        });
    });
}

/**
 * Main load function for My Tags
 */
async function loadMyTags(force = false) {
    console.log('[MyTags] loadMyTags called, force:', force, 'loading:', myTagsLoading, 'loaded:', myTagsLoaded, 'gen:', _myTagsGeneration);

    if (myTagsLoading) {
        console.log('[MyTags] Already loading, skipping');
        return;
    }
    if (myTagsLoaded && !force) {
        console.log('[MyTags] Already loaded, skipping');
        return;
    }

    const container = document.getElementById('myTagsGrid');
    if (!container) {
        console.error('[MyTags] Container #myTagsGrid not found!');
        return;
    }

    // Capture generation to detect stale loads
    const myGeneration = _myTagsGeneration;

    console.log('[MyTags] Container found, starting load...');
    myTagsLoading = true;

    try {
        // Wait for authState to initialize with timeout (for WeChat browser compatibility)
        console.log('[MyTags] Waiting for authState with timeout...');
        const user = await waitForAuthWithTimeout(3000);
        
        if (!user) {
            console.log('[MyTags] User not authenticated');
            renderLoginRequired(container);
            myTagsLoading = false;
            return;
        }
        console.log('[MyTags] User authenticated:', user);

        ensureTimelineLayout(container);
        container.innerHTML = skeletonCards(getInitialCards(), { rows: 10, extraClass: 'tr-skeleton-my-tags' });
        _timelineOffset = 0;
        _timelineFinished = false;
        _timelineScrollArmed = false;
        if (_timelineObserver) {
            try { _timelineObserver.disconnect(); } catch (e) { /* ignore */ }
            _timelineObserver = null;
        }

        let neededCards = getInitialCards();
        if (myGeneration > 0 || window._trNoRebuildExpected) {
            try {
                const navState = TR.scroll?.peekNavigationState?.() || null;
                if (navState && navState.activeTab === MY_TAGS_CATEGORY_ID && navState.anchorPlatformId) {
                    const match = String(navState.anchorPlatformId).match(/my-tags-group-(\d+)/);
                    if (match) {
                        const anchorIdx = parseInt(match[1], 10);
                        neededCards = Math.min(MAX_CARDS, Math.max(neededCards, anchorIdx + 2));
                    }
                }
            } catch (e) { /* ignore */ }
        }

        console.log('[MyTags] Fetching grouped cards, groupLimit:', neededCards);
        const result = await fetchGroupedBatch(neededCards, 0);
        if (myGeneration !== _myTagsGeneration) return;

        if (result.needsAuth) {
            console.log('[MyTags] Grouped API returned needsAuth');
            renderLoginRequired(container);
            return;
        }

        const tags = result.tags || [];
        console.log('[MyTags] Got grouped cards:', tags.length);

        container.innerHTML = '';
        ensureTimelineLayout(container);

        if (!tags.length) {
            renderEmptyState(container);
            myTagsLoaded = true;
            return;
        }

        createTimelineSentinel(container);
        appendTagCards(tags, 0, container);

        _timelineOffset = tags.length;
        if (tags.length < neededCards || (result.total !== null && _timelineOffset >= result.total)) {
            _timelineFinished = true;
            const s = document.getElementById('my-tags-load-sentinel');
            if (s) s.remove();
        } else {
            attachTimelineObserver(container);
        }

        try { TR.readState?.restoreReadState?.(); } catch (e) { /* ignore */ }
        myTagsLoaded = true;
        console.log('[MyTags] Grouped load complete!');
        
        // Restore scroll position from navigation state if this is the active tab
        // Only restore if this load was triggered after renderViewerFromData
        // (generation > 0), not the initial ready() load which may be stale.
        if (myGeneration > 0 || window._trNoRebuildExpected) {
            try {
                if (window.TR?.scroll) {
                    const navState = window.TR.scroll.peekNavigationState?.() || null;
                    if (navState && navState.activeTab === MY_TAGS_CATEGORY_ID) {
                        console.log('[MyTags] Restoring navigation scroll after content loaded (gen:', myGeneration, ')');
                        const consumed = window.TR.scroll.consumeNavigationState();
                        requestAnimationFrame(() => {
                            window.TR.scroll.restoreNavigationScrollY(consumed || navState);
                            window.TR.scroll.restoreNavGridScroll(consumed || navState);
                        });
                    }
                }
            } catch (e) {
                console.error('[MyTags] Failed to restore scroll:', e);
            }
        } else {
            console.log('[MyTags] Skipping scroll restore on initial load (gen:', myGeneration, ', noRebuild:', !!window._trNoRebuildExpected, ')');
        }
        
        // Check WeChat auth expiration and show warning if needed
        const wechatWarning = await checkWechatAuthExpiration();
        if (wechatWarning) {
            console.log('[MyTags] WeChat auth warning:', wechatWarning);
            renderWechatWarningBanner(container, wechatWarning);
        }

    } catch (e) {
        console.error('[MyTags] Load error:', e);
        renderError(container, e.message);
    } finally {
        myTagsLoading = false;
    }
}

/**
 * Preload data in background (called after login)
 */
async function preloadData() {
    // My-tags now uses paged timeline loading; avoid the old 50-item preload.
    return;
}

/**
 * Handle tab switch event
 */
function handleTabSwitch(categoryId) {
    if (categoryId === MY_TAGS_CATEGORY_ID) {
        loadMyTags();
    }
}

// Listen for viewer:rendered event (replaces monkey-patch on renderViewerFromData)
events.on('viewer:rendered', () => {
    try {
        console.log('[MyTags] viewer:rendered event, resetting state, bumping gen');
        _myTagsGeneration++;
        myTagsLoaded = false;
        myTagsLoading = false;
        _timelineOffset = 0;
        _timelineFinished = false;
        _timelineScrollArmed = false;
        if (_timelineObserver) {
            try { _timelineObserver.disconnect(); } catch (e) { /* ignore */ }
            _timelineObserver = null;
        }

        // If my-tags tab is active, reload
        setTimeout(() => {
            const activePane = document.querySelector('#tab-my-tags.active');
            if (activePane) {
                console.log('[MyTags] Tab is active after re-render, loading...');
                loadMyTags();
            }
        }, 100);
    } catch (e) {
        console.error('[MyTags] viewer:rendered handler error:', e);
    }
});

/**
 * Initialize the module
 */
function init() {
    console.log('[MyTags] Initializing module...');

    // Subscribe to auth state changes - reset and reload when auth changes
    let previousUser = authState.getUser();
    authState.subscribe((user) => {
        const wasLoggedIn = !!previousUser;
        const isLoggedIn = !!user;

        if (wasLoggedIn !== isLoggedIn) {
            console.log('[MyTags] Auth state changed, wasLoggedIn:', wasLoggedIn, 'isLoggedIn:', isLoggedIn);
            // Reset loaded state
            myTagsLoaded = false;
            myTagsLoading = false;
            _timelineOffset = 0;
            _timelineFinished = false;
            _timelineScrollArmed = false;
            if (_timelineObserver) {
                try { _timelineObserver.disconnect(); } catch (e) { /* ignore */ }
                _timelineObserver = null;
            }
            // Clear cache on logout
            if (!isLoggedIn) {
                clearCache();
            } else {
                // User just logged in - preload data in background
                console.log('[MyTags] User logged in, preloading data...');
                preloadData();
            }
            // Reload if my-tags tab is active
            const activePane = document.querySelector('#tab-my-tags.active');
            if (activePane) {
                console.log('[MyTags] Tab is active, reloading...');
                loadMyTags(true);
            }
        }
        previousUser = user;
    });

    // Listen for tab switch events
    events.on('tab:switched', (detail) => {
        const categoryId = detail?.categoryId;
        console.log('[MyTags] tab:switched event received, categoryId:', categoryId);
        if (categoryId) {
            handleTabSwitch(categoryId);
        }
    });

    // Check if my-tags is the default active tab and load (single check, no duplicate)
    if (!myTagsLoaded && !myTagsLoading) {
        const activePane = document.querySelector('#tab-my-tags.active');
        if (activePane) {
            console.log('[MyTags] Tab is active on init, loading...');
            loadMyTags();
        }
    }

    // Add click listener to the my-tags tab button as a fallback
    // This ensures loading even if tr_tab_switched event doesn't fire
    const tryAttachClickListener = () => {
        const tabButton = document.querySelector('.sub-tab[data-category="my-tags"]');
        if (tabButton) {
            console.log('[MyTags] Attaching click listener to tab button');
            tabButton.addEventListener('click', () => {
                console.log('[MyTags] Tab button clicked');
                // Use setTimeout to ensure the tab pane is active
                setTimeout(() => {
                    const pane = document.querySelector('#tab-my-tags.active');
                    if (pane) {
                        console.log('[MyTags] Tab pane is now active, loading...');
                        loadMyTags();
                    }
                }, 100);
            });

            // Also add touchstart for better mobile/WeChat support
            tabButton.addEventListener('touchstart', () => {
                console.log('[MyTags] Tab button touched (touchstart)');
                setTimeout(() => {
                    const pane = document.querySelector('#tab-my-tags.active');
                    if (pane) {
                        console.log('[MyTags] Tab pane is now active after touch, loading...');
                        loadMyTags();
                    }
                }, 100);
            }, { passive: true });
        } else {
            console.warn('[MyTags] Tab button not found, will retry...');
            // Retry after a short delay if button not found yet
            setTimeout(tryAttachClickListener, 500);
        }
    };

    // Try to attach click listener
    tryAttachClickListener();

    // Add MutationObserver to watch for tab pane becoming active
    // This is a fallback for WeChat browser and other environments where events may not fire
    const observeTabActivation = () => {
        const tabPane = document.getElementById('tab-my-tags');
        if (!tabPane) {
            console.warn('[MyTags] Tab pane not found for MutationObserver');
            return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('active')) {
                        console.log('[MyTags] Tab pane became active (MutationObserver)');
                        // Only load if not already loaded or loading
                        if (!myTagsLoaded && !myTagsLoading) {
                            loadMyTags();
                        }
                    }
                }
            }
        });

        observer.observe(tabPane, {
            attributes: true,
            attributeFilter: ['class']
        });

        console.log('[MyTags] MutationObserver attached to tab pane');
    };

    // Attach observer after a short delay to ensure DOM is ready
    setTimeout(observeTabActivation, 100);

    console.log('[MyTags] Module initialized');
}

// Export for global access
if (typeof window !== 'undefined') {
    window.HotNews = window.HotNews || {};
    window.HotNews.myTags = {
        load: loadMyTags,
        init: init,
        clearCache: clearCache,
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { loadMyTags, init, handleTabSwitch, clearCache };
