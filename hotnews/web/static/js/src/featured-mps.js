/**
 * Featured MPs Module (精选公众号)
 * Handles the "精选公众号" category tab which displays admin-curated WeChat official accounts.
 * Implements frontend caching for fast loading.
 */

import { formatNewsDate } from './core.js';

const FEATURED_MPS_CATEGORY_ID = 'featured-mps';
const FEATURED_MPS_CACHE_KEY = 'hotnews_featured_mps_cache';
const FEATURED_MPS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// WeChat icon SVG (green)
const WECHAT_ICON_SVG = `<svg viewBox="0 0 24 24" fill="#07c160" width="48" height="48"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>`;

// Small WeChat icon for card headers
const WECHAT_ICON_SMALL = `<svg viewBox="0 0 24 24" fill="#07c160" width="18" height="18" style="vertical-align:middle;margin-right:6px;"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>`;

let featuredMpsLoaded = false;
let featuredMpsLoading = false;

/**
 * Reset loaded state (called when viewer data is refreshed)
 */
function resetLoadedState() {
    featuredMpsLoaded = false;
    featuredMpsLoading = false;
    console.log('[FeaturedMPs] State reset');
}

/**
 * Get cached data from localStorage
 * DISABLED: Frontend cache causes issues in WeChat browser and other environments.
 * Backend has cache, so no performance impact.
 */
function getCachedData() {
    // Disable frontend cache to fix compatibility issues
    return null;
}

/**
 * Save data to localStorage cache
 * DISABLED: Frontend cache causes issues in WeChat browser and other environments.
 */
function setCachedData(mps) {
    // Disable frontend cache to fix compatibility issues
    return;
}

/**
 * Clear cached data
 */
function clearCache() {
    try {
        localStorage.removeItem(FEATURED_MPS_CACHE_KEY);
        console.log('[FeaturedMPs] Cache cleared');
    } catch (e) {
        console.error('[FeaturedMPs] Cache clear error:', e);
    }
}

/**
 * Fetch featured MPs from API
 */
async function fetchFeaturedMps() {
    try {
        const res = await fetch('/api/featured-mps', {
            credentials: 'include'
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.error('[FeaturedMPs] Fetch failed:', e);
        return { error: e.message };
    }
}

/**
 * Render empty state
 */
function renderEmptyState(container) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;">
            <div style="margin-bottom:20px;">${WECHAT_ICON_SVG}</div>
            <div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">暂无精选公众号</div>
            <div style="font-size:14px;color:#6b7280;line-height:1.6;">
                管理员尚未添加精选公众号
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
            <button onclick="window.HotNews?.featuredMps?.load(true)" 
                    style="margin-top:16px;padding:8px 16px;background:#07c160;color:white;border:none;border-radius:6px;cursor:pointer;">
                重试
            </button>
        </div>
    `;
}

/**
 * Create a news card HTML for an MP
 */
function createMPCard(mpData) {
    const { fakeid, nickname, round_head_img, signature, articles } = mpData;
    
    // Use avatar proxy for WeChat images
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
            
            // AI indicator dot
            const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${item.id}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', 'mp-${fakeid}', '${escapedNickname}')"></span>`;
            
            // Actions container (date + summary button)
            const dateHtml = dateStr ? `<span class="tr-news-date">${dateStr}</span>` : '';
            const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${item.id}" data-title="${safeTitle}" data-url="${item.url || ''}" data-source-id="mp-${fakeid}" data-source-name="${nickname || ''}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', 'mp-${fakeid}', '${escapedNickname}')"></button>`;
            const actionsHtml = `<div class="news-actions">${dateHtml}${summaryBtnHtml}</div>`;
            
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
            </li>
            `;
        }).join('')
        : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无文章</li>';

    return `
        <div class="platform-card" data-mp-fakeid="${fakeid}" draggable="false">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                    ${avatarHtml}${nickname}
                    <span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${articles?.length || 0}条)</span>
                </div>
                <div class="platform-header-actions"></div>
            </div>
            <ul class="news-list">
                ${newsListHtml}
            </ul>
        </div>
    `;
}

/**
 * Render the MPs with articles
 */
function renderFeaturedMps(container, mpsData) {
    console.log('[FeaturedMPs] renderFeaturedMps called, mps:', mpsData?.length);

    if (!container) {
        console.error('[FeaturedMPs] Container is null!');
        return;
    }

    if (!mpsData || mpsData.length === 0) {
        renderEmptyState(container);
        return;
    }

    const cardsHtml = mpsData.map(mp => createMPCard(mp)).join('');
    container.innerHTML = cardsHtml;
    
    // Restore read state for the newly rendered items
    if (window.TR && window.TR.readState) {
        window.TR.readState.restoreReadState();
    }
}

/**
 * Main load function for Featured MPs
 */
async function loadFeaturedMps(force = false) {
    console.log('[FeaturedMPs] loadFeaturedMps called, force:', force, 'loading:', featuredMpsLoading, 'loaded:', featuredMpsLoaded);

    if (featuredMpsLoading) {
        console.log('[FeaturedMPs] Already loading, skipping');
        return;
    }
    if (featuredMpsLoaded && !force) {
        console.log('[FeaturedMPs] Already loaded, skipping');
        return;
    }

    const container = document.getElementById('featuredMpsGrid');
    if (!container) {
        console.error('[FeaturedMPs] Container #featuredMpsGrid not found!');
        return;
    }

    featuredMpsLoading = true;

    try {
        // Try to load from frontend cache first (if not forcing refresh)
        if (!force) {
            const cachedMps = getCachedData();
            if (cachedMps && cachedMps.length > 0) {
                console.log('[FeaturedMPs] Loading from frontend cache');
                renderFeaturedMps(container, cachedMps);
                featuredMpsLoaded = true;
                featuredMpsLoading = false;

                // Fetch fresh data in background to update cache
                fetchAndUpdateCache().catch(e => {
                    console.error('[FeaturedMPs] Background update failed:', e);
                });
                return;
            }
        }

        // Show loading state
        container.innerHTML = `
            <div class="featured-mps-loading" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                <div style="margin-bottom:16px;">${WECHAT_ICON_SVG}</div>
                <div style="font-size:16px;">加载中...</div>
            </div>
        `;

        // Fetch from API
        console.log('[FeaturedMPs] Fetching from API...');
        const result = await fetchFeaturedMps();

        if (result.error) {
            renderError(container, result.error);
            featuredMpsLoading = false;
            return;
        }

        if (!result.ok) {
            renderError(container, '请求失败');
            featuredMpsLoading = false;
            return;
        }

        const mps = result.mps || [];
        console.log('[FeaturedMPs] Got', mps.length, 'MPs from API');

        // Save to frontend cache
        setCachedData(mps);

        // Render
        renderFeaturedMps(container, mps);
        featuredMpsLoaded = true;

    } catch (e) {
        console.error('[FeaturedMPs] Load error:', e);
        renderError(container, e.message);
    } finally {
        featuredMpsLoading = false;
    }
}

/**
 * Fetch and update cache in background
 */
async function fetchAndUpdateCache() {
    try {
        const result = await fetchFeaturedMps();
        if (result.ok && result.mps) {
            setCachedData(result.mps);
            console.log('[FeaturedMPs] Background cache update completed');
            return result.mps;
        }
    } catch (e) {
        console.error('[FeaturedMPs] Background cache update error:', e);
    }
    return null;
}

/**
 * Handle tab switch event
 */
function handleTabSwitch(categoryId) {
    if (categoryId === FEATURED_MPS_CATEGORY_ID) {
        loadFeaturedMps();
    }
}

/**
 * Initialize the module
 */
function init() {
    console.log('[FeaturedMPs] Initializing module...');

    // Listen for tab switch events
    window.addEventListener('tr_tab_switched', (event) => {
        const categoryId = event?.detail?.categoryId;
        if (categoryId) {
            handleTabSwitch(categoryId);
        }
    });

    // Check if featured-mps is already the active tab
    const activePane = document.querySelector('#tab-featured-mps.active');
    if (activePane) {
        console.log('[FeaturedMPs] Tab is already active on page load');
        loadFeaturedMps();
    }

    // Add click listener to the tab button as a fallback
    const tryAttachClickListener = () => {
        const tabButton = document.querySelector('.category-tab[data-category="featured-mps"]');
        if (tabButton) {
            tabButton.addEventListener('click', () => {
                setTimeout(() => {
                    const pane = document.querySelector('#tab-featured-mps.active');
                    if (pane) {
                        loadFeaturedMps();
                    }
                }, 100);
            });

            tabButton.addEventListener('touchstart', () => {
                setTimeout(() => {
                    const pane = document.querySelector('#tab-featured-mps.active');
                    if (pane) {
                        loadFeaturedMps();
                    }
                }, 100);
            }, { passive: true });
        } else {
            setTimeout(tryAttachClickListener, 500);
        }
    };

    tryAttachClickListener();

    // MutationObserver fallback
    const observeTabActivation = () => {
        const tabPane = document.getElementById('tab-featured-mps');
        if (!tabPane) return;

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('active')) {
                        if (!featuredMpsLoaded && !featuredMpsLoading) {
                            loadFeaturedMps();
                        }
                    }
                }
            }
        });

        observer.observe(tabPane, {
            attributes: true,
            attributeFilter: ['class']
        });
    };

    setTimeout(observeTabActivation, 100);

    console.log('[FeaturedMPs] Module initialized');
}

// Export for global access
if (typeof window !== 'undefined') {
    window.HotNews = window.HotNews || {};
    window.HotNews.featuredMps = {
        load: loadFeaturedMps,
        init: init,
        clearCache: clearCache,
        resetState: resetLoadedState,
    };
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

export { loadFeaturedMps, init, handleTabSwitch, clearCache };
