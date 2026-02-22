/**
 * Hotnews Tabs Module
 * Tab 切换
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';
import { authState } from './auth-state.js';
import { events } from './events.js';

const TAB_STORAGE_KEY = 'hotnews_active_tab';
const VIEWER_POS_STORAGE_KEY = 'hotnews_viewer_pos_v1';
const EXPLORE_TAB_ID = 'explore';
const TAB_SWITCHED_EVENT = 'tr_tab_switched';
const EXPLORE_MODAL_OPENED_EVENT = 'tr_explore_modal_opened';
const EXPLORE_MODAL_CLOSED_EVENT = 'tr_explore_modal_closed';

// Default tabs based on login status
const DEFAULT_TAB_LOGGED_IN = 'my-tags';  // 已登录用户默认显示"我的关注"
const DEFAULT_TAB_GUEST = 'explore';       // 未登录用户默认显示"探索"（有缓存预热）

// Memory optimization: max number of tabs to keep DOM content
const MAX_CACHED_TABS = 3;
// Track recently visited tabs for LRU cleanup
let _recentTabs = [];

let _explorePrevTabId = null;
let _explorePrevScrollY = 0;

function _persistViewerPos(tabId, scrollY) {
    try {
        const t = String(tabId || '').trim();
        if (!t) return;
        const payload = {
            activeTab: t,
            scrollY: Number(scrollY || 0) || 0,
            updatedAt: Date.now(),
        };
        storage.setRaw(VIEWER_POS_STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
        // ignore
    }
}

function _recordBeforeExploreModalOpen() {
    try {
        const prev = tabs.getActiveTabId();
        _explorePrevTabId = prev ? String(prev) : null;
        _explorePrevScrollY = window.scrollY || 0;
        try {
            const grid = _explorePrevTabId ? document.querySelector(`#tab-${_explorePrevTabId} .platform-grid`) : null;
            if (_explorePrevTabId && grid) {
                TR.scroll.recordPlatformGridScrollForTab(_explorePrevTabId, grid);
            }
        } catch (e) {
            // ignore
        }
    } catch (e) {
        // ignore
    }
}

function _restoreViewerPosIfAny() {
    try {
        const raw = storage.getRaw(VIEWER_POS_STORAGE_KEY);
        if (!raw) return;
        const pos = JSON.parse(raw);
        const tabId = String(pos?.activeTab || '').trim();
        if (!tabId) return;

        const escaped = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(tabId)) : String(tabId);
        const tabEl = document.querySelector(`.category-tab[data-category="${escaped}"]`);
        if (!tabEl) return;

        tabs.switchTab(tabId);
        const y = Number(pos?.scrollY || 0) || 0;
        requestAnimationFrame(() => {
            try {
                window.scrollTo({ top: y, behavior: 'auto' });
            } catch (e) {
                // ignore
            }
        });
    } catch (e) {
        // ignore
    }
}

function _openExploreModal() {
    try {
        if (TR.rssCatalogPreview && typeof TR.rssCatalogPreview.open === 'function') {
            TR.rssCatalogPreview.open();
            return;
        }
    } catch (e) {
        // ignore
    }
    try {
        if (typeof window.openRssCatalogPreviewModal === 'function') {
            window.openRssCatalogPreviewModal();
        }
    } catch (e) {
        // ignore
    }
}

function _restoreFromExploreModal() {
    const prevTabId = _explorePrevTabId;
    const prevScrollY = _explorePrevScrollY;
    _explorePrevTabId = null;
    _explorePrevScrollY = 0;

    if (!prevTabId) return;

    try {
        const escaped = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(prevTabId)) : String(prevTabId);
        const tabEl = document.querySelector(`.category-tab[data-category="${escaped}"]`);
        const paneEl = document.getElementById(`tab-${prevTabId}`);
        if (!tabEl || !paneEl) return;
    } catch (e) {
        // ignore
    }

    try {
        TR.tabs.switchTab(prevTabId);
    } catch (e) {
        // ignore
    }

    _persistViewerPos(prevTabId, prevScrollY);

    requestAnimationFrame(() => {
        try {
            window.scrollTo({ top: prevScrollY, behavior: 'auto' });
        } catch (e) {
            // ignore
        }
        try {
            TR.scroll.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: prevTabId });
        } catch (e) {
            // ignore
        }
    });
}

/**
 * Memory optimization: Clean up DOM content of inactive tabs
 * Uses LRU strategy to keep only MAX_CACHED_TABS tabs with content
 */
function _cleanupInactiveTabs(currentTabId) {
    // Update recent tabs list (LRU)
    _recentTabs = _recentTabs.filter(id => id !== currentTabId);
    _recentTabs.unshift(currentTabId);
    
    // Keep only MAX_CACHED_TABS
    if (_recentTabs.length <= MAX_CACHED_TABS) return;
    
    const tabsToClean = _recentTabs.slice(MAX_CACHED_TABS);
    _recentTabs = _recentTabs.slice(0, MAX_CACHED_TABS);
    
    // Clean up old tabs
    tabsToClean.forEach(tabId => {
        try {
            // Skip special tabs that shouldn't be cleaned
            if (['explore', 'knowledge', 'my-tags', 'discovery', 'rsscol-rss', 'featured-mps', 'finance'].includes(tabId)) return;
            
            const pane = document.getElementById(`tab-${tabId}`);
            if (!pane) return;
            
            // Count items before cleanup
            const itemCount = pane.querySelectorAll('.news-item').length;
            if (itemCount === 0) return;
            
            // Clean up news items but keep card structure
            pane.querySelectorAll('.platform-card').forEach(card => {
                const list = card.querySelector('.news-list');
                if (!list) return;
                
                // Mark card as needing reload
                card.dataset.lazy = '1';
                card.dataset.loadedDone = '0';
                card.dataset.loadedCount = '0';
                
                // Replace content with placeholder
                list.innerHTML = '<li class="news-placeholder" aria-hidden="true">待加载...</li>';
            });
            
            // console.log(`[Memory] Cleaned ${itemCount} items from tab: ${tabId}`);
        } catch (e) {
            // ignore
        }
    });
}

export const tabs = {
    TAB_STORAGE_KEY,

    switchTab(categoryId) {
        const prevCategoryId = this.getActiveTabId();
        TR.badges.dismissNewCategoryBadge(categoryId);
        document.body.classList.toggle('tr-rss-reading', String(categoryId) === 'rsscol-rss');
        const escapedCategoryId = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(categoryId)) : String(categoryId);
        const tabEl = document.querySelector(`.category-tab[data-category="${escapedCategoryId}"]`);
        const paneEl = document.getElementById(`tab-${categoryId}`);
        if (!tabEl || !paneEl) {
            // If this is a topic tab that hasn't been loaded yet by topic-tracker,
            // keep the saved tab ID so topic-tracker can restore it later.
            // Don't fall back to the first tab - this preserves back-navigation state.
            if (String(categoryId).startsWith('topic-')) {
                console.log(`[Tabs] Topic tab ${categoryId} not yet loaded, preserving for later restore`);
                storage.setRaw(TAB_STORAGE_KEY, categoryId);
                return;
            }
            const firstTab = document.querySelector('.category-tab');
            if (firstTab?.dataset?.category && firstTab.dataset.category !== String(categoryId)) {
                this.switchTab(firstTab.dataset.category);
            } else {
                storage.remove(TAB_STORAGE_KEY);
            }
            return;
        }

        // Check if this tab has update indicator (red dot)
        const updateDot = tabEl.querySelector('.update-dot.show');
        const hasUpdate = !!updateDot;

        // Hide the red dot
        if (updateDot) {
            updateDot.classList.remove('show');
        }

        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tabEl.classList.add('active');
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        paneEl.classList.add('active');
        storage.setRaw(TAB_STORAGE_KEY, categoryId);

        // Memory optimization: clean up inactive tabs after a short delay
        setTimeout(() => _cleanupInactiveTabs(categoryId), 500);

        events.emit('tab:switched', { categoryId, prevCategoryId, hasUpdate });

        _persistViewerPos(categoryId, window.scrollY || 0);

        TR.scroll.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: categoryId });

        if (categoryId === 'sports') {
            TR.badges.markFeatureSeen('sports-nba-schedule');
            TR.badges.updateNewBadges();
        }

        TR.filter.applyCategoryFilter(categoryId);

        if (TR.paging && typeof TR.paging.scheduleAutofillActiveTab === 'function') {
            TR.paging.scheduleAutofillActiveTab({ force: true, maxSteps: 1 });
        }

        // 检查是否需要懒加载栏目数据
        const isLazyLoad = paneEl.dataset.lazyLoad === '1';
        const lazyPlaceholder = paneEl.querySelector('.category-lazy-placeholder');
        
        if (isLazyLoad && lazyPlaceholder) {
            // 懒加载栏目数据
            this._loadCategoryData(categoryId, paneEl, lazyPlaceholder);
            return;
        }

        try {
            const hasItems = !!paneEl.querySelector('.news-item');
            const hasPlaceholder = !!paneEl.querySelector('.news-placeholder');
            const shouldLoad = !hasItems && hasPlaceholder;

            // Knowledge tab has its own loading logic (morning-brief.js),
            // skip bulkLoadCategory to avoid duplicate card creation.
            const SELF_LOADING_TABS = ['knowledge', 'explore'];
            if (shouldLoad && !SELF_LOADING_TABS.includes(String(categoryId))) {
                if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleBulkLoadCategory === 'function') {
                    TR.infiniteScroll.scheduleBulkLoadCategory(categoryId);
                } else if (TR.infiniteScroll && typeof TR.infiniteScroll.scheduleEnsureCategoryLoaded === 'function') {
                    TR.infiniteScroll.scheduleEnsureCategoryLoaded(categoryId);
                }
            }
        } catch (e) {
            // ignore
        }
    },

    async _loadCategoryData(categoryId, paneEl, placeholder) {
        // 显示加载状态
        const loadingDiv = placeholder.querySelector('.category-loading');
        if (loadingDiv) {
            loadingDiv.innerHTML = `
                <div style="font-size:32px;margin-bottom:12px;">⏳</div>
                <div style="font-size:14px;">加载中...</div>
            `;
        }

        try {
            const response = await fetch(`/api/category/${encodeURIComponent(categoryId)}`);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            const data = await response.json();
            const category = data.category;
            
            if (!category || !category.platforms) {
                throw new Error('Invalid category data');
            }

            // 渲染栏目内容
            const html = this._renderCategoryContent(categoryId, category);
            
            // 替换占位符
            const grid = paneEl.querySelector('.platform-grid');
            if (grid) {
                grid.innerHTML = html;
                grid.classList.remove('category-lazy-placeholder');
            }

            // 标记为已加载
            paneEl.dataset.lazyLoad = '0';

            // 恢复已读状态
            if (TR.readState && typeof TR.readState.restoreReadState === 'function') {
                TR.readState.restoreReadState();
            }

            // 更新计数
            if (TR.counts && typeof TR.counts.updateAllCounts === 'function') {
                TR.counts.updateAllCounts();
            }

        } catch (e) {
            console.error('[Tabs] Failed to load category:', categoryId, e);
            if (loadingDiv) {
                loadingDiv.innerHTML = `
                    <div style="font-size:32px;margin-bottom:12px;">❌</div>
                    <div style="font-size:14px;color:#ef4444;">加载失败，点击重试</div>
                `;
                loadingDiv.style.cursor = 'pointer';
                loadingDiv.onclick = () => this._loadCategoryData(categoryId, paneEl, placeholder);
            }
        }
    },

    _renderCategoryContent(categoryId, category) {
        const platforms = category.platforms || {};
        const platformEntries = Object.entries(platforms);
        
        if (platformEntries.length === 0) {
            return '<div class="category-empty-state">暂无内容</div>';
        }

        return platformEntries.map(([platformId, platform], idx) => {
            const news = platform.news || [];
            const isRssPlatform = platformId.startsWith('rss-');
            
            const newsHtml = news.slice(0, 20).map((n, i) => {
                const stableId = n.stable_id || '';
                const title = n.display_title || n.title || '';
                const url = n.url || '#';
                const meta = n.meta || '';
                const dateStr = n.timestamp ? String(n.timestamp).slice(5, 10) : '';
                
                return `
                    <li class="news-item" data-id="${this._escapeHtml(stableId)}" data-url="${this._escapeHtml(url)}">
                        <div class="news-item-content">
                            <input type="checkbox" class="news-checkbox" title="标记已读" />
                            <span class="news-index">${i + 1}</span>
                            <a class="news-title" href="${this._escapeHtml(url)}" target="_blank" rel="noopener noreferrer">
                                ${this._escapeHtml(title)}
                            </a>
                            <div class="news-actions">
                                ${dateStr ? `<span class="tr-news-date">${this._escapeHtml(dateStr)}</span>` : ''}
                                <button class="news-summary-btn" data-news-id="${this._escapeHtml(stableId)}" data-title="${this._escapeHtml(title)}" data-url="${this._escapeHtml(url)}" data-source-id="${this._escapeHtml(platformId)}" data-source-name="${this._escapeHtml(platform.name || platformId)}"></button>
                            </div>
                        </div>
                        ${meta && !isRssPlatform ? `<div class="news-subtitle">${this._escapeHtml(meta)}</div>` : ''}
                    </li>
                `;
            }).join('');

            return `
                <div class="platform-card" data-platform="${this._escapeHtml(platformId)}" 
                     data-total-count="${news.length}" data-loaded-count="${Math.min(news.length, 20)}" 
                     data-lazy="0" draggable="false">
                    <div class="platform-header">
                        <span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>
                        <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
                            📱 ${this._escapeHtml(platform.name || platformId)}
                        </div>
                        <div class="platform-header-actions"></div>
                    </div>
                    <ul class="news-list">${newsHtml}</ul>
                    <div class="news-load-sentinel" aria-hidden="true"></div>
                </div>
            `;
        }).join('');
    },

    _escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },

    restoreActiveTab() {
        const savedTab = storage.getRaw(TAB_STORAGE_KEY);
        if (savedTab) {
            try {
                const isE2E = (new URLSearchParams(window.location.search)).get('e2e') === '1';
                if (isE2E && String(savedTab) === 'rsscol-rss') {
                    storage.remove(TAB_STORAGE_KEY);
                    return;
                }
            } catch (e) {
                // ignore
            }
            const tabEl = document.querySelector(`.category-tab[data-category="${savedTab}"]`);
            if (tabEl) {
                this.switchTab(savedTab);
                return;
            }
            // If saved tab is a topic tab not yet loaded, preserve it for topic-tracker
            if (String(savedTab).startsWith('topic-')) {
                return;
            }
        }
        
        // No saved tab - use default based on login status
        const isLoggedIn = authState.isLoggedIn();
        const defaultTab = isLoggedIn ? DEFAULT_TAB_LOGGED_IN : DEFAULT_TAB_GUEST;
        const defaultTabEl = document.querySelector(`.category-tab[data-category="${defaultTab}"]`);
        if (defaultTabEl) {
            this.switchTab(defaultTab);
        }
    },

    getActiveTabId() {
        return storage.getRaw(TAB_STORAGE_KEY) || (document.querySelector('.category-tab.active')?.dataset?.category) || null;
    },

    restoreActiveTabPlatformGridScroll(state) {
        TR.scroll.restoreActiveTabPlatformGridScroll(state);
    },

    attachPlatformGridScrollPersistence() {
        TR.scroll.attachPlatformGridScrollPersistence();
    }
};

// 全局函数
window.switchTab = (categoryId) => tabs.switchTab(categoryId);

TR.tabs = tabs;

// 初始化
ready(function () {
    try {
        window.addEventListener(EXPLORE_MODAL_OPENED_EVENT, () => {
            _recordBeforeExploreModalOpen();
        });
        window.addEventListener(EXPLORE_MODAL_CLOSED_EVENT, () => {
            _restoreFromExploreModal();
        });
    } catch (e) {
        // ignore
    }
    tabs.restoreActiveTab();
    _restoreViewerPosIfAny();
    tabs.attachPlatformGridScrollPersistence();
    const tabId = tabs.getActiveTabId();
    if (tabId) {
        tabs.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: tabId });
    }
});
