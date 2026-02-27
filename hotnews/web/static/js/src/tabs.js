/**
 * Hotnews Tabs Module
 * Tab 切换
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';
import { authState } from './auth-state.js';
import { events } from './events.js';
import { viewMode } from './view-mode.js';
import { categoryTimeline } from './category-timeline.js';
import { openLoginModal } from './login-modal.js';

const TAB_STORAGE_KEY = 'hotnews_active_tab';
const VIEWER_POS_STORAGE_KEY = 'hotnews_viewer_pos_v1';
const MAIN_NAV_STORAGE_KEY = 'hotnews_main_nav';
const EXPLORE_TAB_ID = 'explore';
const TAB_SWITCHED_EVENT = 'tr_tab_switched';
const EXPLORE_MODAL_OPENED_EVENT = 'tr_explore_modal_opened';
const EXPLORE_MODAL_CLOSED_EVENT = 'tr_explore_modal_closed';

// Default tabs based on login status
const DEFAULT_TAB_LOGGED_IN = 'my-tags';  // 已登录用户默认显示"我的关注"
const DEFAULT_TAB_GUEST = 'ai';            // 未登录用户默认显示"AI"（tag-driven 主栏目）

// Memory optimization: max number of tabs to keep DOM content
// Mobile users switch tabs more frequently via drawer, need larger cache
const _isMobile = typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 640px)').matches;
const MAX_CACHED_TABS = _isMobile ? 8 : 3;
// Track recently visited tabs for LRU cleanup
let _recentTabs = [];

let _explorePrevTabId = null;
let _explorePrevScrollY = 0;

// 主导航状态
let _currentMainNav = 'home';
let _lastHomeSubTab = null;
let _lastTopicSubTab = null;
let _topicsLoaded = false;

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

        // Directly call switchTab — it handles L2/L3 ids that may not have
        // a .sub-tab DOM element (e.g. tag-driven sub-columns).
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
        const tabEl = document.querySelector(`.sub-tab[data-category="${escaped}"]`);
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
 * 切换主导航：'home' 或 'topics'
 */
function switchMainNav(nav) {
    if (nav === _currentMainNav) return;

    // 未登录用户点击"我的主题" → 弹登录弹窗，不切换
    if (nav === 'topics' && !authState.isLoggedIn()) {
        openLoginModal();
        return;
    }

    // 保存当前子栏目选中状态
    if (_currentMainNav === 'home') {
        _lastHomeSubTab = tabs.getActiveTabId();
    } else {
        _lastTopicSubTab = tabs.getActiveTabId();
    }

    _currentMainNav = nav;

    // 更新主导航按钮样式
    document.querySelectorAll('.main-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.nav === nav);
    });

    // 切换子栏目容器
    const homeSubTabs = document.getElementById('homeSubTabs');
    const topicSubTabs = document.getElementById('topicSubTabs');
    if (homeSubTabs) homeSubTabs.style.display = nav === 'home' ? 'flex' : 'none';
    if (topicSubTabs) topicSubTabs.style.display = nav === 'topics' ? 'flex' : 'none';

    // 持久化主导航状态
    storage.setRaw(MAIN_NAV_STORAGE_KEY, nav);

    if (nav === 'topics') {
        // 按需加载主题（首次点击时触发）
        if (!_topicsLoaded) {
            _topicsLoaded = true;
            events.emit('mainNav:topicsActivated');
        }
        // 恢复上次选中的主题子栏目
        const targetTab = _lastTopicSubTab || _getFirstTopicSubTab();
        if (targetTab) {
            tabs.switchTab(targetTab);
        }
    } else {
        // 恢复上次选中的主页子栏目
        const targetTab = _lastHomeSubTab || 'my-tags';
        tabs.switchTab(targetTab);
    }

    // 更新滑动指示器
    _updateIndicator(nav === 'home' ? homeSubTabs : topicSubTabs);
}

function _getFirstTopicSubTab() {
    const topicSubTabs = document.getElementById('topicSubTabs');
    if (!topicSubTabs) return null;
    const first = topicSubTabs.querySelector('.sub-tab[data-category]');
    return first ? first.dataset.category : null;
}

/**
 * 更新指定子栏目容器的滑动指示器位置
 */
function _updateIndicator(container, animate = true) {
    if (!container) return;
    const activeTab = container.querySelector('.sub-tab.active');
    const indicator = container.querySelector('.sub-tabs-indicator');
    if (!activeTab || !indicator) return;

    const containerRect = container.getBoundingClientRect();
    const tabRect = activeTab.getBoundingClientRect();
    const left = tabRect.left - containerRect.left + container.scrollLeft + 14;
    const width = tabRect.width - 28;

    if (!animate) {
        indicator.style.transition = 'none';
    }
    indicator.style.left = left + 'px';
    indicator.style.width = Math.max(width, 0) + 'px';

    if (!animate) {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                indicator.style.transition = '';
            });
        });
    }
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
            if (['explore', 'my-tags', 'discovery', 'rsscol-rss'].includes(tabId)) return;
            // Skip topic tabs — their content is async-loaded and expensive to re-fetch
            if (String(tabId).startsWith('topic-')) return;
            
            const pane = document.getElementById(`tab-${tabId}`);
            if (!pane) return;
            
            // Skip timeline-mode tabs (tl-card is expensive to reload)
            const grid = pane.querySelector('.platform-grid');
            if (grid && grid.querySelector('.tl-card')) return;
            
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

const SUB_TAB_STORAGE_PREFIX = 'hotnews_active_subtab_';

/**
 * 获取某一级栏目上次激活的二级分类 id
 * 无记录时返回 `{parentId}-all`（全部子分类）
 */
function getDefaultSubTab(parentId) {
    try {
        const saved = storage.getRaw(SUB_TAB_STORAGE_PREFIX + parentId);
        if (saved) return saved;
    } catch (e) {
        // ignore
    }
    return `${parentId}-all`;
}

/**
 * 持久化某一级栏目当前激活的二级分类 id
 */
function saveActiveSubTab(parentId, subTabId) {
    try {
        storage.setRaw(SUB_TAB_STORAGE_PREFIX + parentId, subTabId);
    } catch (e) {
        // ignore
    }
}

export const tabs = {
    TAB_STORAGE_KEY,

    switchTab(categoryId) {
        const prevCategoryId = this.getActiveTabId();
        TR.badges.dismissNewCategoryBadge(categoryId);
        document.body.classList.toggle('tr-rss-reading', String(categoryId) === 'rsscol-rss');
        const escapedCategoryId = (window.CSS && typeof window.CSS.escape === 'function') ? window.CSS.escape(String(categoryId)) : String(categoryId);
        
        // 在当前活跃的 sub-tabs 容器内查找标签
        const subTabsContainer = _currentMainNav === 'home'
            ? document.getElementById('homeSubTabs')
            : document.getElementById('topicSubTabs');
        let tabEl = subTabsContainer
            ? subTabsContainer.querySelector(`.sub-tab[data-category="${escapedCategoryId}"]`)
            : document.querySelector(`.sub-tab[data-category="${escapedCategoryId}"]`);
        const paneEl = document.getElementById(`tab-${categoryId}`);

        // 若 tabEl 未找到但 pane 存在，可能是 dropdown 子分类（dd-item）
        // 此时激活其父栏目的 tab
        let parentWrapperTab = null;
        if (!tabEl && paneEl) {
            // 从 _columnParentMap 查找父栏目
            const parentMap = window._columnParentMap || {};
            let parentId = parentMap[categoryId];
            // 可能需要向上多级（L3 → L2 → L1）
            while (parentId && !subTabsContainer?.querySelector(`.sub-tab[data-category="${parentId}"]`)) {
                parentId = parentMap[parentId];
            }
            if (parentId) {
                parentWrapperTab = subTabsContainer?.querySelector(`.sub-tab[data-category="${parentId}"]`);
            }
            if (parentWrapperTab) tabEl = parentWrapperTab;
        }

        // Topic tab that hasn't been loaded yet by topic-tracker:
        // keep the saved tab ID so topic-tracker can restore it later.
        if ((!tabEl || !paneEl) && String(categoryId).startsWith('topic-')) {
            console.log(`[Tabs] Topic tab ${categoryId} not yet loaded, preserving for later restore`);
            storage.setRaw(TAB_STORAGE_KEY, categoryId);
            return;
        }

        // Tab button exists but pane is missing (e.g. SSR rendered button
        // for a tag-driven column before JS rebuild creates the pane).
        // Dynamically create a placeholder pane so the tab switch can proceed.
        if (tabEl && !paneEl) {
            const contentArea = document.querySelector('.tab-content-area');
            if (contentArea) {
                const placeholder = document.createElement('div');
                placeholder.className = 'tab-pane';
                placeholder.id = `tab-${categoryId}`;
                placeholder.dataset.lazyLoad = '1';
                placeholder.innerHTML =
                    '<div class="platform-grid category-lazy-placeholder">' +
                    '<div class="lazy-placeholder-text">加载中...</div>' +
                    '</div>';
                contentArea.appendChild(placeholder);
            }
        }

        // Neither tab button nor pane exists — column truly doesn't exist,
        // fall back to the first available tab.
        if (!tabEl) {
            const firstTab = subTabsContainer
                ? subTabsContainer.querySelector('.sub-tab[data-category]')
                : document.querySelector('.sub-tab[data-category]');
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

        // 更新子栏目 active 状态
        if (subTabsContainer) {
            subTabsContainer.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
        }
        tabEl.classList.add('active');

        // 更新滑动指示器
        _updateIndicator(subTabsContainer);

        // 委托给 activatePane 完成 pane 激活 + 数据加载
        this.activatePane(categoryId, { prevCategoryId, hasUpdate });
    },

    /**
     * 激活指定分类的 pane 并触发数据加载。
     * 不依赖 .sub-tab DOM 元素，只需要 #tab-{categoryId} pane 存在。
     * switchTab 内部调用此方法；移动端分类面板也可直接调用。
     *
     * @param {string} categoryId
     * @param {object} [opts] - { prevCategoryId, hasUpdate } 可选上下文
     */
    activatePane(categoryId, opts) {
        const paneEl = document.getElementById(`tab-${categoryId}`);
        if (!paneEl) return;

        const prevCategoryId = opts?.prevCategoryId ?? this.getActiveTabId();
        const hasUpdate = opts?.hasUpdate ?? false;

        // 激活 pane
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

        // --- View mode handling ---
        // Tabs with their own dedicated timeline modules handle themselves
        const SELF_MANAGED_TIMELINE = ['explore', 'discovery'];
        const mode = viewMode.get(categoryId);

        if (mode === 'timeline' && !SELF_MANAGED_TIMELINE.includes(String(categoryId))) {
            // Generic timeline mode — use categoryTimeline renderer
            const grid = paneEl.querySelector('.platform-grid');
            const hasTlCards = grid && grid.querySelector('.tl-card');
            if (!hasTlCards) {
                categoryTimeline.load(categoryId);
            } else {
                // Already loaded, just re-attach observer if needed
                const s = categoryTimeline.getState(categoryId);
                if (!s.finished) {
                    // Re-observe sentinel for infinite scroll
                    setTimeout(() => {
                        const sentinel = grid?.querySelector(`#tl-sentinel-${categoryId}`);
                        if (sentinel && s.observer) {
                            try { s.observer.observe(sentinel); } catch {}
                        }
                    }, 100);
                }
            }
            return;
        }

        if (isLazyLoad && lazyPlaceholder) {
            // 懒加载栏目数据
            this._loadCategoryData(categoryId, paneEl, lazyPlaceholder);
            return;
        }

        // finance in card mode: no SSR cards, use loadCardMode
        const DYNAMIC_CARD_CATS = ['finance'];
        if (DYNAMIC_CARD_CATS.includes(String(categoryId)) && mode === 'card') {
            const grid = paneEl.querySelector('.platform-grid');
            const hasCards = grid && grid.querySelector('.platform-card');
            if (!hasCards) {
                categoryTimeline.loadCardMode(categoryId);
            }
            return;
        }

        // Topic tabs in card mode: use TopicTracker
        if (String(categoryId).startsWith('topic-') && mode !== 'timeline') {
            const topicId = String(categoryId).replace('topic-', '');
            const grid = paneEl.querySelector('.platform-grid');
            const hasRealContent = grid && grid.querySelector('.news-item');
            if (!hasRealContent) {
                if (window.TopicTracker?.refreshTopic) {
                    window.TopicTracker.refreshTopic(topicId);
                }
            }
            return;
        }

        try {
            const hasItems = !!paneEl.querySelector('.news-item');
            const hasPlaceholder = !!paneEl.querySelector('.news-placeholder');
            const shouldLoad = !hasItems && hasPlaceholder;

            // Explore is self-loading only when in timeline mode.
            const selfLoadingTabs = [];
            if (viewMode.get('explore') === 'timeline') selfLoadingTabs.push('explore');
            if (shouldLoad && !selfLoadingTabs.includes(String(categoryId))) {
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
            
            const displayNews = news.slice(0, 50);
            const newsHtml = displayNews.map((n, i) => {
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
                     data-total-count="${news.length}" data-loaded-count="${displayNews.length}" 
                     data-lazy="0" data-loaded-done="1" draggable="false">
                    <div class="platform-header">
                        <span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>
                        <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none;">
                            📱 ${this._escapeHtml(platform.name || platformId)}
                        </div>
                        <div class="platform-header-actions"></div>
                    </div>
                    <ul class="news-list">${newsHtml}</ul>
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
        // 恢复主导航状态
        const savedNav = storage.getRaw(MAIN_NAV_STORAGE_KEY) || 'home';
        if (savedNav === 'topics' && authState.isLoggedIn()) {
            switchMainNav('topics');
        } else {
            _currentMainNav = 'home';
            // 确保主页子栏目容器显示
            const homeSubTabs = document.getElementById('homeSubTabs');
            if (homeSubTabs) homeSubTabs.style.display = 'flex';
        }

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
            const tabEl = document.querySelector(`.sub-tab[data-category="${savedTab}"]`);
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
        const defaultTabEl = document.querySelector(`.sub-tab[data-category="${defaultTab}"]`);
        if (defaultTabEl) {
            this.switchTab(defaultTab);
        }
    },

    getActiveTabId() {
        return storage.getRaw(TAB_STORAGE_KEY) || (document.querySelector('.sub-tab.active')?.dataset?.category) || null;
    },

    switchMainNav,
    getMainNav() { return _currentMainNav; },
    updateIndicator: _updateIndicator,
    getDefaultSubTab,
    saveActiveSubTab,

    restoreActiveTabPlatformGridScroll(state) {
        TR.scroll.restoreActiveTabPlatformGridScroll(state);
    },

    attachPlatformGridScrollPersistence() {
        TR.scroll.attachPlatformGridScrollPersistence();
    }
};

// 全局函数
window.switchTab = (categoryId) => tabs.switchTab(categoryId);
window.activatePane = (categoryId, opts) => tabs.activatePane(categoryId, opts);
window.switchMainNav = switchMainNav;

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

    // 主导航按钮点击事件
    document.querySelectorAll('.main-nav-item').forEach(btn => {
        btn.addEventListener('click', () => switchMainNav(btn.dataset.nav));
    });

    tabs.restoreActiveTab();
    _restoreViewerPosIfAny();
    tabs.attachPlatformGridScrollPersistence();
    const tabId = tabs.getActiveTabId();
    if (tabId) {
        tabs.restoreActiveTabPlatformGridScroll({ preserveScroll: true, activeTab: tabId });
    }

    // 首次加载时无动画定位指示器
    const activeContainer = document.getElementById('homeSubTabs');
    _updateIndicator(activeContainer, false);

    // resize 时重新计算指示器
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            const container = _currentMainNav === 'home'
                ? document.getElementById('homeSubTabs')
                : document.getElementById('topicSubTabs');
            _updateIndicator(container, false);
        }, 150);
    });

    // 子栏目滚动时更新指示器
    ['homeSubTabs', 'topicSubTabs'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('scroll', () => _updateIndicator(el, false), { passive: true });
        }
    });

    // Listen for view mode changes — reload the active tab
    events.on('viewMode:changed', (detail) => {
        const catId = detail?.categoryId;
        if (!catId) return;
        const mode = detail?.mode;
        const activeTab = tabs.getActiveTabId();

        // Self-managed timeline tabs (have their own dedicated modules)
        const SELF_MANAGED_TIMELINE = ['explore', 'discovery'];

        if (mode === 'timeline') {
            if (SELF_MANAGED_TIMELINE.includes(catId)) {
                // These tabs' own modules handle timeline rendering.
                if (catId === 'finance' && window.HotNews?.financeTimeline?.load) {
                    window.HotNews.financeTimeline.load(true);
                } else if (catId !== activeTab) {
                    tabs.switchTab(catId);
                }
            } else {
                // Generic timeline — use categoryTimeline renderer
                if (catId !== activeTab) {
                    tabs.switchTab(catId);
                } else {
                    categoryTimeline.load(catId, true);
                }
            }
        } else {
            // Switching to card mode
            if (catId === 'finance') {
                // finance has no SSR card data — use categoryTimeline.loadCardMode
                categoryTimeline.loadCardMode(catId);
            } else if (catId === 'my-tags') {
                // my-tags card content is managed by my-tags.js module
                categoryTimeline.restoreCardMode(catId);
                if (window.HotNews?.myTags?.load) {
                    window.HotNews.myTags.load(true);
                }
            } else if (String(catId).startsWith('topic-')) {
                // Topic tabs: restore card layout, then trigger topic-tracker reload
                categoryTimeline.restoreCardMode(catId);
                const topicId = String(catId).replace('topic-', '');
                if (window.TopicTracker?.refreshTopic) {
                    window.TopicTracker.refreshTopic(topicId);
                }
            } else if (!SELF_MANAGED_TIMELINE.includes(catId)) {
                categoryTimeline.restoreCardMode(catId);
                // Re-trigger switchTab to load card content
                setTimeout(() => tabs.switchTab(catId), 50);
            } else {
                // Other self-managed (explore) — restore grid
                const grid = document.querySelector(`#tab-${catId} .platform-grid`);
                if (grid) {
                    grid.style.display = '';
                    grid.style.flexDirection = '';
                    grid.style.overflowX = '';
                    grid.style.overflowY = '';
                    grid.style.alignItems = '';
                    grid.style.overscrollBehavior = '';
                    grid.innerHTML = '';
                }
                setTimeout(() => tabs.switchTab(catId), 50);
            }
        }
    });
});
