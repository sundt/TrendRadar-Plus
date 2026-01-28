/**
 * Discovery Module
 * Handles the "✨ 新发现" category tab which displays AI-discovered trending tags.
 * Public endpoint - no authentication required.
 * Implements frontend (localStorage) and backend caching for fast loading.
 */

import { formatNewsDate } from './core.js';

const DISCOVERY_CATEGORY_ID = 'discovery';
const DISCOVERY_CACHE_KEY = 'hotnews_discovery_cache';
const DISCOVERY_CACHE_TTL = 10 * 60 * 1000; // 10 minutes in milliseconds

let discoveryLoaded = false;
let discoveryLoading = false;

/**
 * Get cached data from localStorage
 */
function getCachedData() {
    try {
        const cached = localStorage.getItem(DISCOVERY_CACHE_KEY);
        if (!cached) return null;

        const data = JSON.parse(cached);
        const now = Date.now();

        // Check if cache is expired
        if (!data.timestamp || (now - data.timestamp) > DISCOVERY_CACHE_TTL) {
            localStorage.removeItem(DISCOVERY_CACHE_KEY);
            return null;
        }

        return data.tags;
    } catch (e) {
        console.error('[Discovery] Cache read error:', e);
        localStorage.removeItem(DISCOVERY_CACHE_KEY);
        return null;
    }
}

/**
 * Save data to localStorage cache
 */
function setCachedData(tags) {
    try {
        const data = {
            tags: tags,
            timestamp: Date.now(),
        };
        localStorage.setItem(DISCOVERY_CACHE_KEY, JSON.stringify(data));
    } catch (e) {
        console.error('[Discovery] Cache write error:', e);
    }
}

/**
 * Clear cached data
 */
function clearCache() {
    try {
        localStorage.removeItem(DISCOVERY_CACHE_KEY);
        console.log('[Discovery] Cache cleared');
    } catch (e) {
        console.error('[Discovery] Cache clear error:', e);
    }
}

/**
 * Fetch discovery news from API
 */
async function fetchDiscoveryNews() {
    try {
        const res = await fetch('/api/user/preferences/discovery-news?news_limit=50&tag_limit=30', {
            credentials: 'include'
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        return await res.json();
    } catch (e) {
        console.error('[Discovery] Fetch failed:', e);
        return { error: e.message };
    }
}


/**
 * Render the empty state when no discovery tags available
 */
function renderEmptyState(container) {
    container.innerHTML = `
        <div style="text-align:center;padding:60px 20px;width:100%;">
            <div style="font-size:64px;margin-bottom:20px;">✨</div>
            <div style="font-size:18px;color:#374151;margin-bottom:12px;font-weight:600;">暂无新发现</div>
            <div style="font-size:14px;color:#6b7280;margin-bottom:24px;line-height:1.6;">
                AI 正在持续发现热门话题，<br>
                稍后再来看看吧
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
            <button onclick="window.HotNews?.discovery?.load(true)" 
                    style="margin-top:16px;padding:8px 16px;background:#10b981;color:white;border:none;border-radius:6px;cursor:pointer;">
                重试
            </button>
        </div>
    `;
}

/**
 * Create a news card HTML for a discovery tag
 */
function createDiscoveryCard(tagData) {
    const { tag, news, count } = tagData;
    const tagIcon = tag.icon || '🏷️';
    const tagName = tag.name || tag.id;
    const firstSeenDate = tag.first_seen_date || '';
    const occurrenceCount = tag.occurrence_count || 0;

    const newsListHtml = news.length > 0
        ? news.map((item, idx) => {
            const dateStr = formatNewsDate(item.published_at);
            const safeTitle = (item.title || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const escapedTitle = safeTitle.replace(/'/g, "\\'");
            const escapedUrl = (item.url || '').replace(/'/g, "\\'");
            const escapedTagName = (tagName || '').replace(/'/g, "\\'");
            
            // AI indicator dot
            const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${item.id}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${tag.id}', '${escapedTagName}')"></span>`;
            
            // Actions container (date + summary button)
            const dateHtml = dateStr ? `<span class="tr-news-date">${dateStr}</span>` : '';
            const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${item.id}" data-title="${safeTitle}" data-url="${item.url || ''}" data-source-id="${tag.id}" data-source-name="${tagName || ''}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${item.id}', '${escapedTitle}', '${escapedUrl}', '${tag.id}', '${escapedTagName}')" ></button>`;
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
        : '<li class="news-placeholder" style="color:#9ca3af;padding:20px;text-align:center;">暂无相关新闻</li>';

    return `
        <div class="platform-card discovery-card" data-tag-id="${tag.id}" data-candidate="true" draggable="false">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                    ${tagIcon} ${tagName}
                    <span class="discovery-badge">NEW</span>
                    <span class="discovery-date">发现于 ${firstSeenDate}</span>
                    <span class="discovery-count">(${occurrenceCount}条)</span>
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
 * Render the discovery tags with news
 */
function renderDiscoveryNews(container, tagsData) {
    console.log('[Discovery] renderDiscoveryNews called, container:', container, 'tagsData:', tagsData);

    if (!container) {
        console.error('[Discovery] renderDiscoveryNews: container is null!');
        return;
    }

    if (!tagsData || tagsData.length === 0) {
        console.log('[Discovery] No tags data, showing empty state');
        renderEmptyState(container);
        return;
    }

    console.log('[Discovery] Rendering', tagsData.length, 'tags');
    const cardsHtml = tagsData.map(tagData => createDiscoveryCard(tagData)).join('');
    console.log('[Discovery] Generated HTML length:', cardsHtml.length);
    container.innerHTML = cardsHtml;
    console.log('[Discovery] HTML inserted into container');
    
    // Restore read state for the newly rendered items
    if (window.TR && window.TR.readState) {
        window.TR.readState.restoreReadState();
    }
}


/**
 * Main load function for Discovery
 */
async function loadDiscovery(force = false) {
    console.log('[Discovery] loadDiscovery called, force:', force, 'loading:', discoveryLoading, 'loaded:', discoveryLoaded);

    if (discoveryLoading) {
        console.log('[Discovery] Already loading, skipping');
        return;
    }
    if (discoveryLoaded && !force) {
        console.log('[Discovery] Already loaded, skipping');
        return;
    }

    const container = document.getElementById('discoveryGrid');
    if (!container) {
        console.error('[Discovery] Container #discoveryGrid not found!');
        return;
    }

    console.log('[Discovery] Container found, starting load...');
    discoveryLoading = true;

    try {
        // Try to load from frontend cache first (if not forcing refresh)
        if (!force) {
            const cachedTags = getCachedData();
            if (cachedTags && cachedTags.length > 0) {
                console.log('[Discovery] Loading from frontend cache, tags:', cachedTags.length);
                renderDiscoveryNews(container, cachedTags);
                discoveryLoaded = true;
                discoveryLoading = false;

                // Fetch fresh data in background to update cache
                fetchAndUpdateCache().catch(e => {
                    console.error('[Discovery] Background update failed:', e);
                });
                return;
            } else {
                console.log('[Discovery] No valid cache found');
            }
        }

        // Show loading state
        console.log('[Discovery] Showing loading state...');
        container.innerHTML = `
            <div class="discovery-loading" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">✨</div>
                <div style="font-size:16px;">发现中...</div>
            </div>
        `;

        // Fetch discovery news
        console.log('[Discovery] Fetching discovery news from API...');
        const result = await fetchDiscoveryNews();
        console.log('[Discovery] API response:', result);

        if (result.error) {
            console.error('[Discovery] API returned error:', result.error);
            renderError(container, result.error);
            discoveryLoading = false;
            return;
        }

        if (!result.ok) {
            console.error('[Discovery] API returned not ok');
            renderError(container, '请求失败');
            discoveryLoading = false;
            return;
        }

        const tags = result.tags || [];
        console.log('[Discovery] Got tags from API:', tags.length, 'tags');

        // Log cache status
        if (result.cached) {
            console.log(`[Discovery] Loaded from backend cache (age: ${result.cache_age}s)`);
        } else {
            console.log('[Discovery] Loaded fresh data from database');
        }

        // Save to frontend cache
        setCachedData(tags);

        // Render the tags
        console.log('[Discovery] Rendering tags...');
        renderDiscoveryNews(container, tags);
        discoveryLoaded = true;
        console.log('[Discovery] Load complete!');

    } catch (e) {
        console.error('[Discovery] Load error:', e);
        renderError(container, e.message);
    } finally {
        discoveryLoading = false;
    }
}

/**
 * Fetch and update cache in background
 */
async function fetchAndUpdateCache() {
    try {
        const result = await fetchDiscoveryNews();
        if (result.ok && result.tags) {
            setCachedData(result.tags);
            console.log('[Discovery] Background cache update completed');
            return result.tags;
        }
    } catch (e) {
        console.error('[Discovery] Background cache update error:', e);
    }
    return null;
}

/**
 * Handle tab switch event
 */
function handleTabSwitch(categoryId) {
    if (categoryId === DISCOVERY_CATEGORY_ID) {
        loadDiscovery();
    }
}

/**
 * Initialize the module
 */
function init() {
    console.log('[Discovery] Initializing module...');

    // Listen for tab switch events
    window.addEventListener('tr_tab_switched', (event) => {
        const categoryId = event?.detail?.categoryId;
        console.log('[Discovery] tr_tab_switched event received, categoryId:', categoryId);
        if (categoryId) {
            handleTabSwitch(categoryId);
        }
    });

    // Also check if discovery is already the active tab (on page load)
    const activePane = document.querySelector('#tab-discovery.active');
    if (activePane) {
        console.log('[Discovery] Tab is already active on page load');
        loadDiscovery();
    }

    // Add click listener to the discovery tab button as a fallback
    const tryAttachClickListener = () => {
        const tabButton = document.querySelector('.category-tab[data-category="discovery"]');
        if (tabButton) {
            console.log('[Discovery] Attaching click listener to tab button');
            tabButton.addEventListener('click', () => {
                console.log('[Discovery] Tab button clicked');
                setTimeout(() => {
                    const pane = document.querySelector('#tab-discovery.active');
                    if (pane) {
                        console.log('[Discovery] Tab pane is now active, loading...');
                        loadDiscovery();
                    }
                }, 100);
            });

            tabButton.addEventListener('touchstart', () => {
                console.log('[Discovery] Tab button touched (touchstart)');
                setTimeout(() => {
                    const pane = document.querySelector('#tab-discovery.active');
                    if (pane) {
                        console.log('[Discovery] Tab pane is now active after touch, loading...');
                        loadDiscovery();
                    }
                }, 100);
            }, { passive: true });
        } else {
            console.warn('[Discovery] Tab button not found, will retry...');
            setTimeout(tryAttachClickListener, 500);
        }
    };

    tryAttachClickListener();

    // Add MutationObserver to watch for tab pane becoming active
    const observeTabActivation = () => {
        const tabPane = document.getElementById('tab-discovery');
        if (!tabPane) {
            console.warn('[Discovery] Tab pane not found for MutationObserver');
            return;
        }

        const observer = new MutationObserver((mutations) => {
            for (const mutation of mutations) {
                if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList.contains('active')) {
                        console.log('[Discovery] Tab pane became active (MutationObserver)');
                        if (!discoveryLoaded && !discoveryLoading) {
                            loadDiscovery();
                        }
                    }
                }
            }
        });

        observer.observe(tabPane, {
            attributes: true,
            attributeFilter: ['class']
        });

        console.log('[Discovery] MutationObserver attached to tab pane');
    };

    setTimeout(observeTabActivation, 100);

    console.log('[Discovery] Module initialized');
}

// Export for global access
if (typeof window !== 'undefined') {
    window.HotNews = window.HotNews || {};
    window.HotNews.discovery = {
        load: loadDiscovery,
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

export { loadDiscovery, init, handleTabSwitch, clearCache };
