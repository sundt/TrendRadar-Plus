/**
 * Topic Tracker - Frontend logic for topic tracking feature
 */

import { escapeHtml, ready, TR } from './core.js';
import { authState, requireLogin } from './auth-state.js';
import { events } from './events.js';
import { tabs } from './tabs.js';
import { scroll } from './scroll.js';
import { viewMode } from './view-mode.js';

function _confirmDialog(message) {
    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10010;display:flex;align-items:center;justify-content:center;';
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;';
        dialog.innerHTML = `
            <div style="font-size:15px;color:#1f2937;line-height:1.6;margin-bottom:20px;">${message}</div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button class="confirm-cancel" style="flex:1;padding:8px 0;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#6b7280;font-size:14px;cursor:pointer;">取消</button>
                <button class="confirm-ok" style="flex:1;padding:8px 0;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:14px;cursor:pointer;">确认删除</button>
            </div>`;
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
        const cleanup = (r) => { backdrop.remove(); resolve(r); };
        dialog.querySelector('.confirm-cancel').onclick = () => cleanup(false);
        dialog.querySelector('.confirm-ok').onclick = () => cleanup(true);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
    });
}

// State
    let topics = [];
    let currentEditTopic = null;
    let generatedData = null; // { icon, keywords, recommended_sources }
    
    // Loading state management (per topic)
    const topicLoadingState = new Map(); // topicId -> { loading: boolean, loaded: boolean }
    let _topicGeneration = 0;
    
    function getTopicState(topicId) {
        if (!topicLoadingState.has(topicId)) {
            topicLoadingState.set(topicId, { loading: false, loaded: false });
        }
        return topicLoadingState.get(topicId);
    }
    
    function resetTopicState(topicId) {
        topicLoadingState.set(topicId, { loading: false, loaded: false });
    }
    
    function resetAllTopicStates() {
        topicLoadingState.clear();
    }

    // DOM Elements (will be initialized after DOM ready)
    let modalOverlay = null;
    let modalTitle = null;
    let topicNameInput = null;
    let keywordsContainer = null;
    let sourcesContainer = null;
    let aiGenerateBtn = null;
    let submitBtn = null;
    
    // 缓存微信凭证状态，避免重复检查
    let hasWechatCredentialsCache = null;

    /**
     * Validate topic tabs ownership - remove tabs that don't belong to current user
     * This is a security measure to prevent cached pages from showing other users' topics
     */
    function validateTopicTabsOwnership() {
        // Get current user ID from auth state
        const currentUser = authState.getUser?.();
        const currentUserId = currentUser?.id;
        
        // Find ALL topic tabs (both server-rendered and dynamically created)
        const topicTabs = document.querySelectorAll('.sub-tab.topic-tab');
        
        topicTabs.forEach(tab => {
            const ownerUserId = tab.dataset.ownerUserId;
            const categoryId = tab.dataset.category;
            
            // Remove tab if:
            // 1. User is not logged in
            // 2. Tab has owner info but doesn't match current user
            // 3. Tab is server-rendered (has owner info) - we'll reload from API
            if (!currentUserId || (ownerUserId && String(ownerUserId) !== String(currentUserId))) {
                console.warn(`[TopicTracker] Removing topic tab: ${categoryId}, owner=${ownerUserId}, current=${currentUserId}`);
                
                // Remove the tab
                tab.remove();
                
                // Remove the corresponding tab-pane
                const pane = document.getElementById(`tab-${categoryId}`);
                if (pane) {
                    pane.remove();
                }
            }
        });
    }
    
    /**
     * Remove all server-rendered topic tabs (to prevent cache leakage)
     * We'll reload them from API for the current user
     */
    function removeServerRenderedTopicTabs() {
        // Find all topic tabs that have owner-user-id (server-rendered)
        const serverTabs = document.querySelectorAll('.sub-tab.topic-tab[data-owner-user-id]');
        
        serverTabs.forEach(tab => {
            const categoryId = tab.dataset.category;
            console.log(`[TopicTracker] Removing server-rendered topic tab: ${categoryId}`);
            
            // Remove the tab
            tab.remove();
            
            // Remove the corresponding tab-pane
            const pane = document.getElementById(`tab-${categoryId}`);
            if (pane) {
                pane.remove();
            }
        });
    }

    /**
     * Initialize topic tracker
     */
    function init() {
        console.log('[TopicTracker] Initializing...');
        
        // Ensure body exists
        if (!document.body) {
            console.warn('[TopicTracker] document.body not ready, retrying...');
            setTimeout(init, 100);
            return;
        }
        
        // Security: First remove ALL server-rendered topic tabs
        // This prevents cached pages from showing other users' topics
        // We'll reload the correct topics from API for the current user
        removeServerRenderedTopicTabs();
        
        // Then validate any remaining topic tabs (shouldn't be any at this point)
        validateTopicTabsOwnership();
        
        createModal();
        // 改为事件驱动：监听主导航切换到"我的主题"时加载
        // loadAndRenderTopicTabs(); — 移除直接调用
        // addNewTopicButton(); — "新建主题"已在 viewer.html 中静态渲染
        
        // 监听主导航切换到"我的主题"
        events.on('mainNav:topicsActivated', () => {
            console.log('[TopicTracker] mainNav:topicsActivated event received, loading topics...');
            loadAndRenderTopicTabs();
        });
        
        // Listen for tab switch events
        events.on('tab:switched', (detail) => {
            const categoryId = detail?.categoryId;
            console.log('[TopicTracker] tab:switched event received, categoryId:', categoryId);
            if (categoryId && String(categoryId).startsWith('topic-')) {
                const topicId = String(categoryId).replace('topic-', '');
                console.log('[TopicTracker] Topic tab switched, loading:', topicId);
                loadTopicNewsIfNeeded(topicId);
            }
        });
        
        // Listen for viewer data rendered event to setup topic tab listeners
        events.on('viewer:rendered', () => {
            console.log('[TopicTracker] viewer:rendered event received, resetting states and setting up listeners...');
            // Bump generation so scroll restore works after DOM rebuild
            _topicGeneration++;
            console.log('[TopicTracker] Generation bumped to:', _topicGeneration);
            // Security: Re-validate after re-render
            validateTopicTabsOwnership();
            // 重置所有主题的加载状态，因为 DOM 已经被重新渲染
            resetAllTopicStates();
            // 重新确保"新建主题"按钮存在
            addNewTopicButton();
            // 如果主题已加载过，重新加载主题 tabs
            loadAndRenderTopicTabs();
            
            // 如果当前激活的是主题 tab，重新加载
            const activePane = document.querySelector('.tab-pane.active[id^="tab-topic-"]');
            if (activePane) {
                const topicId = activePane.id.replace('tab-topic-', '');
                console.log('[TopicTracker] Active topic tab detected after re-render:', topicId);
                setTimeout(() => loadTopicNewsIfNeeded(topicId), 100);
            }
        });
        
        // Listen for auth state changes to reload topics
        window.addEventListener('authStateChanged', (event) => {
            console.log('[TopicTracker] Auth state changed, reloading topics...');
            // 清除现有的主题 tabs
            removeAllTopicTabs();
            // 重新加载
            if (event?.detail?.user) {
                loadAndRenderTopicTabs();
            }
        });
        
        // Check if a topic tab is already active on page load
        const activeTopicPane = document.querySelector('.tab-pane.active[id^="tab-topic-"]');
        if (activeTopicPane) {
            const topicId = activeTopicPane.id.replace('tab-topic-', '');
            console.log('[TopicTracker] Topic tab already active on page load:', topicId);
            setTimeout(() => loadTopicNewsIfNeeded(topicId), 200);
        }
    }
    
    /**
     * Remove all topic tabs from DOM (used when user logs out)
     */
    function removeAllTopicTabs() {
        // Remove all topic tabs
        document.querySelectorAll('.sub-tab.topic-tab').forEach(tab => tab.remove());
        // Remove all topic panes
        document.querySelectorAll('.tab-pane[id^="tab-topic-"]').forEach(pane => pane.remove());
        // Clear loading states
        resetAllTopicStates();
        // Clear topics array
        topics = [];
    }
    
    /**
     * Load topics from API and render tabs (frontend dynamic loading)
     * This replaces server-side injection to prevent cache leakage
     */
    async function loadAndRenderTopicTabs() {
        // Wait for authState to be available and initialized (may be async)
        try {
            if (!authState.initialized) {
                console.log('[TopicTracker] Waiting for authState to initialize...');
                await authState.init();
            }
        } catch (e) {
            console.warn('[TopicTracker] authState init failed:', e);
        }

        // Check if user is logged in
        if (!isUserLoggedIn()) {
            console.log('[TopicTracker] User not logged in, skipping topic tabs loading');
            return;
        }
        
        const categoryTabs = document.getElementById('topicSubTabs');
        if (!categoryTabs) {
            console.warn('[TopicTracker] topicSubTabs not found');
            return;
        }
        
        // Show skeleton loading state
        const skeletonContainer = showTopicTabsSkeleton(categoryTabs);
        
        try {
            console.log('[TopicTracker] Loading topics from API...');
            const response = await fetch('/api/topics', { credentials: 'include' });
            const data = await response.json();
            
            // Remove skeleton
            if (skeletonContainer) {
                skeletonContainer.remove();
            }
            
            if (data.ok && data.topics?.length > 0) {
                topics = data.topics;
                console.log(`[TopicTracker] Loaded ${topics.length} topics, rendering tabs...`);
                renderTopicTabsFromData(topics);
                
                // 检查是否需要切换到某个主题 tab（创建主题后刷新页面的情况）
                tryRestoreTopicTab();
            } else {
                console.log('[TopicTracker] No topics found or API error:', data.detail || data.error);
                topics = [];
            }
        } catch (e) {
            console.error('[TopicTracker] Failed to load topics:', e);
            // Remove skeleton on error
            if (skeletonContainer) {
                skeletonContainer.remove();
            }
            topics = [];
        }
    }
    
    /**
     * 尝试恢复到主题 tab（用于创建主题后刷新页面的情况）
     */
    function tryRestoreTopicTab() {
        try {
            // Check both storage keys: main tab system uses 'hotnews_active_tab',
            // topic-tracker legacy uses 'tr_active_tab'
            const mainSavedTab = localStorage.getItem('hotnews_active_tab');
            const legacySavedTab = localStorage.getItem('tr_active_tab');
            const savedTab = (mainSavedTab && mainSavedTab.startsWith('topic-')) ? mainSavedTab : legacySavedTab;
            
            if (savedTab && savedTab.startsWith('topic-')) {
                const tabEl = document.querySelector(`.sub-tab[data-category="${savedTab}"]`);
                const paneEl = document.getElementById(`tab-${savedTab}`);
                
                if (tabEl && paneEl) {
                    console.log(`[TopicTracker] Restoring to topic tab: ${savedTab}`);
                    
                    // 切换到该 tab
                    tabs.switchTab(savedTab);
                    
                    // Scroll restoration will happen after topic news loads
                    // (see loadTopicNews completion handler)
                } else {
                    // 主题 tab 不存在（可能已被删除），清除保存的 tab 并切换到默认 tab
                    console.log(`[TopicTracker] Topic tab not found, clearing saved tab: ${savedTab}`);
                    localStorage.removeItem('tr_active_tab');
                    
                    // Also consume any pending navigation state to prevent stale restores
                    try {
                        scroll.consumeNavigationState?.();
                    } catch (e) {}
                    
                    // 切换到我的关注或第一个可用的 tab
                    tabs.switchTab('my-tags');
                }
            }
        } catch (e) {
            console.error('[TopicTracker] Failed to restore topic tab:', e);
        }
    }
    
    /**
     * Show skeleton loading state for topic tabs
     */
    function showTopicTabsSkeleton(categoryTabs) {
        const indicator = categoryTabs.querySelector('.sub-tabs-indicator');
        
        // Create skeleton container
        const skeletonContainer = document.createElement('div');
        skeletonContainer.className = 'topic-tabs-loading';
        skeletonContainer.id = 'topicTabsSkeleton';
        skeletonContainer.style.cssText = 'display:flex;gap:4px;';
        
        // Add 2 skeleton tabs
        for (let i = 0; i < 2; i++) {
            const skeleton = document.createElement('div');
            skeleton.className = 'topic-tab-skeleton';
            skeleton.innerHTML = `<div class="skeleton-text"></div>`;
            skeletonContainer.appendChild(skeleton);
        }
        
        // Insert before the "+ 新建主题" button
        const newBtn = categoryTabs.querySelector('.sub-tab-new');
        if (newBtn) {
            categoryTabs.insertBefore(skeletonContainer, newBtn);
        } else if (indicator) {
            categoryTabs.insertBefore(skeletonContainer, indicator);
        } else {
            categoryTabs.appendChild(skeletonContainer);
        }
        
        return skeletonContainer;
    }
    
    /**
     * Render topic tabs from data (frontend dynamic rendering)
     */
    function renderTopicTabsFromData(topicsData) {
        const topicSubTabs = document.getElementById('topicSubTabs');
        if (!topicSubTabs) {
            console.warn('[TopicTracker] topicSubTabs not found');
            return;
        }
        
        const indicator = topicSubTabs.querySelector('.sub-tabs-indicator');
        
        topicsData.forEach(topic => {
            const categoryId = `topic-${topic.id}`;
            
            // Check if tab already exists
            if (topicSubTabs.querySelector(`[data-category="${categoryId}"]`)) {
                console.log(`[TopicTracker] Tab ${categoryId} already exists, skipping`);
                return;
            }
            
            // Create tab element (纯文字，无 emoji)
            const tab = document.createElement('button');
            tab.className = 'sub-tab topic-tab';
            tab.dataset.category = categoryId;
            tab.dataset.topicId = topic.id;
            tab.onclick = () => {
                tabs.switchTab(categoryId);
            };
            tab.innerHTML = `
                ${escapeHtml(topic.name)}
            `;
            
            // Insert before the "+ 新建主题" button
            const newBtn = topicSubTabs.querySelector('.sub-tab-new');
            topicSubTabs.insertBefore(tab, newBtn || null);
            
            // Create corresponding tab-pane
            createTopicTabPane(topic);
            
            console.log(`[TopicTracker] Created tab for topic: ${topic.name}`);
        });
        
        // Setup event listeners for the new tabs
        setupTopicTabListeners();
        
        // 更新指示器位置
        if (tabs.updateIndicator) {
            tabs.updateIndicator(topicSubTabs);
        }
    }
    
    /**
     * Create tab pane for a topic
     */
    function createTopicTabPane(topic) {
        const categoryId = `topic-${topic.id}`;
        const tabContent = document.querySelector('.tab-content-area');
        if (!tabContent) {
            console.error('[TopicTracker] tab-content-area not found');
            return;
        }
        
        // Check if pane already exists
        if (document.getElementById(`tab-${categoryId}`)) return;
        
        const pane = document.createElement('div');
        pane.className = 'tab-pane';
        pane.id = `tab-${categoryId}`;
        pane.dataset.lazyLoad = '0';
        
        // 使用与服务端渲染一致的结构
        pane.innerHTML = `
            <div class="platform-grid" id="topicCards-${topic.id}" data-topic-id="${topic.id}">
                <div class="topic-loading-state" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                    <div style="font-size:48px;margin-bottom:16px;">🔍</div>
                    <div style="font-size:16px;">加载中...</div>
                </div>
            </div>
        `;
        
        tabContent.appendChild(pane);
    }

    /**
     * Create the modal HTML
     */
    function createModal() {
        const modalHtml = `
            <div class="topic-modal-overlay" id="topicModalOverlay">
                <div class="topic-modal">
                    <div class="topic-modal-header">
                        <h3 class="topic-modal-title" id="topicModalTitle">新建追踪主题</h3>
                        <button class="topic-modal-close" onclick="TopicTracker.closeModal()">×</button>
                    </div>
                    <div class="topic-modal-body">
                        <div class="topic-form-group">
                            <label class="topic-form-label">主题名称</label>
                            <input type="text" class="topic-form-input" id="topicNameInput" 
                                   placeholder="例如：苹果公司、特斯拉、人工智能" maxlength="50">
                            <div class="topic-progress-container" id="topicProgressContainer" style="display:none;">
                                <div class="topic-progress-bar">
                                    <div class="topic-progress-fill" id="topicProgressFill"></div>
                                </div>
                                <div class="topic-progress-text" id="topicProgressText">准备中...</div>
                            </div>
                        </div>
                        
                        <div class="topic-form-group" id="topicIconGroup" style="display:none;">
                            <label class="topic-form-label">主题图标</label>
                            <div class="topic-icon-display" id="topicIconDisplay">
                                <span class="topic-icon-preview" id="topicIconPreview">🏷️</span>
                                <span class="topic-icon-label">AI 自动生成</span>
                            </div>
                        </div>
                        
                        <div class="topic-form-group" id="topicKeywordsGroup" style="display:none;">
                            <label class="topic-form-label">追踪关键词</label>
                            <div class="topic-keywords-container" id="topicKeywordsContainer">
                                <button class="topic-keyword-add" onclick="TopicTracker.addKeyword()">+ 添加关键词</button>
                            </div>
                        </div>
                        
                        <div class="topic-form-group" id="topicSourcesGroup" style="display:none;">
                            <label class="topic-form-label">推荐数据源 (一键添加)</label>
                            <div class="topic-sources-list" id="topicSourcesContainer"></div>
                            <div class="topic-sources-actions">
                                <button class="topic-sources-action-btn" onclick="TopicTracker.selectAllSources()">全选</button>
                                <button class="topic-sources-action-btn" onclick="TopicTracker.deselectAllSources()">取消全选</button>
                            </div>
                        </div>
                    </div>
                    <div id="topicFetchProgress" class="topic-fetch-progress" style="display:none;">
                        <div class="topic-fetch-progress-text">正在抓取数据源...</div>
                        <div class="topic-fetch-progress-bar">
                            <div class="topic-fetch-progress-fill" style="width: 0%"></div>
                        </div>
                    </div>
                    <div class="topic-modal-footer">
                        <button class="topic-modal-btn cancel" onclick="TopicTracker.closeModal()">取消</button>
                        <button class="topic-modal-btn primary" id="topicAiBtn" onclick="TopicTracker.generateKeywords()">
                            🤖 生成关键词和推荐源
                        </button>
                        <button class="topic-modal-btn primary" id="topicSubmitBtn" onclick="TopicTracker.submitTopic()" style="display:none;">
                            创建并开始追踪
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        
        // Cache DOM elements
        modalOverlay = document.getElementById('topicModalOverlay');
        modalTitle = document.getElementById('topicModalTitle');
        topicNameInput = document.getElementById('topicNameInput');
        keywordsContainer = document.getElementById('topicKeywordsContainer');
        sourcesContainer = document.getElementById('topicSourcesContainer');
        aiGenerateBtn = document.getElementById('topicAiBtn');
        submitBtn = document.getElementById('topicSubmitBtn');
        
        console.log('[TopicTracker] Modal created, elements cached:', {
            modalOverlay: !!modalOverlay,
            modalTitle: !!modalTitle,
            topicNameInput: !!topicNameInput
        });
    }

    /**
     * Add "New Topic" button to category tabs (left of 我的关注)
     */
    function addNewTopicButton() {
        // Find topicSubTabs container
        const topicSubTabs = document.getElementById('topicSubTabs');
        if (!topicSubTabs) {
            console.warn('[TopicTracker] topicSubTabs not found, will retry later');
            setTimeout(addNewTopicButton, 1000);
            return;
        }
        
        // Check if button already exists
        if (topicSubTabs.querySelector('.sub-tab-new')) return;
        
        // Create the button element
        const btn = document.createElement('button');
        btn.className = 'sub-tab sub-tab-new';
        btn.textContent = '+ 新建主题';
        btn.onclick = function() {
            TopicTracker.openModal();
        };
        
        // Insert at the beginning
        topicSubTabs.insertBefore(btn, topicSubTabs.firstChild);
        
        console.log('[TopicTracker] New topic button added to topicSubTabs');
    }

    /**
     * Load user's topics (legacy function, now uses loadAndRenderTopicTabs)
     * @deprecated Use loadAndRenderTopicTabs instead
     */
    async function loadTopics() {
        // Delegate to the new function
        await loadAndRenderTopicTabs();
    }

    /**
     * Setup click listeners for topic tabs to load news
     */
    function setupTopicTabListeners() {
        // 监听 tab 切换，当切换到主题 tab 时加载新闻
        document.querySelectorAll('.sub-tab[data-category^="topic-"]').forEach(tab => {
            const catId = tab.dataset.category;
            const topicId = catId.replace('topic-', '');
            
            // Click 事件
            tab.addEventListener('click', () => {
                setTimeout(() => loadTopicNewsIfNeeded(topicId), 100);
            });
            
            // Touch 事件（移动端/微信浏览器）
            tab.addEventListener('touchstart', () => {
                setTimeout(() => loadTopicNewsIfNeeded(topicId), 100);
            }, { passive: true });
        });
        
        // MutationObserver 监听 Tab 激活（兼容微信浏览器等特殊环境）
        document.querySelectorAll('.tab-pane[id^="tab-topic-"]').forEach(pane => {
            const topicId = pane.id.replace('tab-topic-', '');
            
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                        if (pane.classList.contains('active')) {
                            const state = getTopicState(topicId);
                            if (!state.loading && !state.loaded) {
                                loadTopicNewsIfNeeded(topicId);
                            }
                        }
                    }
                }
            });
            
            observer.observe(pane, { attributes: true, attributeFilter: ['class'] });
        });
    }

    /**
     * Load topic news if not already loaded
     */
    function loadTopicNewsIfNeeded(topicId) {
        const categoryId = `topic-${topicId}`;
        
        // If this topic is in timeline mode, let categoryTimeline handle rendering
        // (called from tabs.switchTab). Don't render card mode here.
        if (viewMode.get(categoryId) === 'timeline') {
            console.log(`[TopicTracker] Topic ${topicId} is in timeline mode, skipping card render`);
            return;
        }
        
        const state = getTopicState(topicId);
        
        // 防止重复加载
        if (state.loading) {
            console.log(`[TopicTracker] Topic ${topicId} already loading, skipping`);
            return;
        }
        if (state.loaded) {
            console.log(`[TopicTracker] Topic ${topicId} already loaded, skipping`);
            return;
        }
        
        const grid = document.getElementById(`topicCards-${topicId}`);
        if (!grid) {
            console.log(`[TopicTracker] Container topicCards-${topicId} not found`);
            return;
        }
        
        // 检查是否已有真实内容（news-item 说明已加载，而不是骨架卡片）
        // 骨架卡片只有 .news-placeholder，真实内容有 .news-item
        const hasRealContent = grid.querySelector('.news-item');
        if (hasRealContent) {
            console.log(`[TopicTracker] Topic ${topicId} already has real content, marking as loaded`);
            state.loaded = true;
            return;
        }
        
        loadTopicNews(topicId);
    }

    /**
     * Render topic tabs in the category tabs bar
     * @deprecated 主题 tabs 现在由服务端注入，此函数保留用于兼容
     */
    function renderTopicTabs() {
        // 主题 tabs 现在由服务端通过 /api/news 注入
        // 前端只需要设置事件监听
        setupTopicTabListeners();
    }

    /**
     * Render keyword card skeleton (loading state)
     */
    function renderKeywordCardSkeleton(keyword) {
        return `
            <div class="platform-card" data-keyword="${escapeHtml(keyword)}">
                <div class="platform-header">
                    <div class="platform-name">🔍 ${escapeHtml(keyword)}</div>
                </div>
                <ul class="news-list">
                    <li class="news-placeholder">加载中...</li>
                </ul>
            </div>
        `;
    }

    /**
     * Load news for a topic with timeout and error handling
     */
    async function loadTopicNews(topicId, force = false) {
        const state = getTopicState(topicId);
        
        // 防止重复加载
        if (state.loading) {
            console.log(`[TopicTracker] Topic ${topicId} already loading, skipping`);
            return;
        }
        if (state.loaded && !force) {
            console.log(`[TopicTracker] Topic ${topicId} already loaded, skipping`);
            return;
        }
        
        const container = document.getElementById(`topicCards-${topicId}`);
        if (!container) {
            console.error(`[TopicTracker] Container topicCards-${topicId} not found`);
            return;
        }
        
        state.loading = true;
        console.log(`[TopicTracker] Loading news for topic ${topicId}...`);
        
        // 显示加载状态
        showLoadingState(container);
        
        try {
            // 带超时的 API 请求（15秒）
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000);
            
            const apiUrl = `/api/topics/${topicId}/news?limit=50`;
            console.log(`[TopicTracker] Fetching: ${apiUrl}`);
            
            const response = await fetch(apiUrl, {
                credentials: 'include',
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            
            console.log(`[TopicTracker] API response status: ${response.status}`);
            
            if (!response.ok) {
                if (response.status === 401) {
                    renderLoginRequired(container, topicId);
                    state.loading = false;
                    return;
                }
                if (response.status === 404) {
                    // 主题不存在（可能已被删除），移除 tab 并切换到其他 tab
                    console.log(`[TopicTracker] Topic ${topicId} not found (404), removing tab`);
                    const categoryId = `topic-${topicId}`;
                    
                    // 移除 tab
                    const tab = document.querySelector(`.sub-tab[data-category="${categoryId}"]`);
                    if (tab) tab.remove();
                    
                    // 移除 pane
                    const pane = document.getElementById(`tab-${categoryId}`);
                    if (pane) pane.remove();
                    
                    // 清除 localStorage
                    try {
                        const savedTab = localStorage.getItem('tr_active_tab');
                        if (savedTab === categoryId) {
                            localStorage.removeItem('tr_active_tab');
                        }
                    } catch (e) {}
                    
                    // 切换到我的关注
                    tabs.switchTab('my-tags');
                    
                    state.loading = false;
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            console.log(`[TopicTracker] API response:`, { ok: data.ok, hasKeywordsNews: !!data.keywords_news, hasSourcesNews: !!data.sources_news, cached: data.cached });
            
            if (data.ok) {
                renderTopicNews(topicId, data.keywords_news, data.sources_news);
                state.loaded = true;
                
                // Restore scroll position from navigation state (back-navigation from WeChat etc.)
                // Only restore if this load was triggered after renderViewerFromData
                // (generation > 0), not the initial page load which may be stale.
                if (_topicGeneration > 0 || window._trNoRebuildExpected) {
                    try {
                        const navState = scroll.peekNavigationState?.() || null;
                        const categoryId = `topic-${topicId}`;
                        if (navState && navState.activeTab === categoryId) {
                            console.log(`[TopicTracker] Restoring navigation scroll after topic news loaded (gen: ${_topicGeneration}): ${categoryId}`);
                            const consumed = scroll.consumeNavigationState();
                            requestAnimationFrame(() => {
                                scroll.restoreNavigationScrollY(consumed || navState);
                                scroll.restoreNavGridScroll(consumed || navState);
                            });
                        }
                    } catch (e) {
                        console.error('[TopicTracker] Failed to restore scroll after news load:', e);
                    }
                } else {
                    console.log(`[TopicTracker] Skipping scroll restore on initial load (gen: ${_topicGeneration})`);
                }
                
                // Log cache status
                if (data.cached) {
                    console.log(`[TopicTracker] Loaded from cache (age: ${data.cache_age}s)`);
                }
            } else {
                throw new Error(data.error || '加载失败');
            }
        } catch (e) {
            console.error(`[TopicTracker] Load topic ${topicId} failed:`, e);
            const errorMsg = e.name === 'AbortError' ? '请求超时，请重试' : (e.message || '加载失败');
            renderError(container, errorMsg, topicId);
        } finally {
            state.loading = false;
        }
    }
    
    /**
     * Show loading state in container
     */
    function showLoadingState(container) {
        container.innerHTML = `
            <div class="topic-loading-state" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">🔍</div>
                <div style="font-size:16px;">加载中...</div>
            </div>
        `;
    }
    
    /**
     * Render error state with retry button
     */
    function renderError(container, message, topicId) {
        container.innerHTML = `
            <div class="topic-error-state" style="text-align:center;padding:60px 20px;width:100%;color:#6b7280;">
                <div style="font-size:48px;margin-bottom:16px;">😕</div>
                <div style="font-size:16px;margin-bottom:16px;">加载失败: ${escapeHtml(message)}</div>
                <button onclick="TopicTracker.retryLoadTopic('${escapeHtml(topicId)}')" 
                        style="padding:8px 16px;background:#22c55e;color:white;border:none;border-radius:6px;cursor:pointer;font-size:14px;">
                    重试
                </button>
            </div>
        `;
    }
    
    /**
     * Render login required state
     */
    function renderLoginRequired(container, topicId) {
        container.innerHTML = `
            <div class="topic-login-required" style="text-align:center;padding:60px 20px;width:100%;">
                <div style="font-size:48px;margin-bottom:16px;">🔒</div>
                <div style="font-size:16px;color:#374151;margin-bottom:10px;font-weight:600;">请先登录</div>
                <div style="font-size:13px;color:#6b7280;margin-bottom:20px;">登录后即可查看主题新闻</div>
                <button onclick="openLoginModal()" 
                        style="padding:10px 22px;background:linear-gradient(135deg,#3b82f6,#8b5cf6);color:white;border:none;cursor:pointer;border-radius:8px;font-weight:500;font-size:14px;">
                    立即登录
                </button>
            </div>
        `;
    }
    
    /**
     * Retry loading a topic (called from error state)
     */
    function retryLoadTopic(topicId) {
        resetTopicState(topicId);
        loadTopicNews(topicId, true);
    }

    /**
     * Render news for a topic
     * 不再依赖 topics 数组，直接使用 API 返回的 keywordsNews
     */
    function renderTopicNews(topicId, keywordsNews, sourcesNews) {
        const container = document.getElementById(`topicCards-${topicId}`);
        if (!container) {
            console.error(`[TopicTracker] renderTopicNews: container topicCards-${topicId} not found`);
            return;
        }
        
        // 直接从 keywordsNews 获取关键词列表，不依赖 topics 数组
        const keywords = Object.keys(keywordsNews || {});
        const sources = Object.keys(sourcesNews || {});
        console.log(`[TopicTracker] renderTopicNews: topicId=${topicId}, keywords=`, keywords, ', sources=', sources);
        
        // 渲染关键词卡片（只渲染有新闻的）
        const keywordCardsHtml = keywords
            .filter(keyword => {
                const news = keywordsNews[keyword] || [];
                return news.length > 0;
            })
            .map(keyword => {
                const news = keywordsNews[keyword] || [];
                return renderKeywordCard(keyword, news);
            })
            .join('');
        
        // 渲染订阅源卡片（只渲染有文章的）
        const sourceCardsHtml = sources
            .filter(sourceName => {
                const articles = sourcesNews[sourceName] || [];
                return articles.length > 0;
            })
            .map(sourceName => {
                const articles = sourcesNews[sourceName] || [];
                return renderSourceCard(sourceName, articles);
            })
            .join('');
        
        // 组合内容
        let html = '';
        
        if (keywordCardsHtml) {
            html += keywordCardsHtml;
        }
        
        if (sourceCardsHtml) {
            html += sourceCardsHtml;
        }
        
        // 如果都没有内容，显示提示
        if (!html) {
            container.innerHTML = `
                <div class="topic-no-news-hint">
                    <div class="topic-no-news-icon">📭</div>
                    <div class="topic-no-news-text">暂无匹配的新闻</div>
                    <div class="topic-no-news-tip">请编辑主题调整关键词或添加更多数据源</div>
                </div>
            `;
        } else {
            container.innerHTML = html;
            const keywordCount = keywords.filter(k => (keywordsNews[k] || []).length > 0).length;
            const sourceCount = sources.filter(s => (sourcesNews[s] || []).length > 0).length;
            console.log(`[TopicTracker] renderTopicNews: rendered ${keywordCount} keyword cards, ${sourceCount} source cards`);
        }
    }
    
    /**
     * Render a source card with articles (订阅源卡片)
     */
    function renderSourceCard(sourceName, articles) {
        // 从文章中获取 source_id（如 mp-xxx 或 rss-xxx）
        const realSourceId = articles[0]?.source || '';
        
        const newsHtml = articles.length > 0 
            ? articles.slice(0, 50).map((item, idx) => {
                const newsId = item.id || `source-${Date.now()}-${idx}`;
                const safeTitle = escapeHtml(item.title || '');
                const safeUrl = escapeHtml(item.url || '');
                const escapedTitle = safeTitle.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const escapedUrl = safeUrl.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const sourceId = `source-${sourceName}`;
                const escapedSourceName = escapeHtml(sourceName).replace(/'/g, "\\'");
                
                // 总结按钮 HTML
                const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${newsId}" data-title="${safeTitle}" data-url="${safeUrl}" data-source-id="${sourceId}" data-source-name="${escapedSourceName}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${newsId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSourceName}')"></button>`;
                const commentBtnHtml = `<button class="news-comment-btn" data-url="${safeUrl}" data-title="${safeTitle}"></button>`;
                
                return `
                <li class="news-item" data-news-id="${newsId}" data-news-title="${safeTitle}" data-news-url="${safeUrl}">
                    <div class="news-item-content">
                        <span class="news-index">${idx + 1}</span>
                        <a class="news-title" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
                            ${safeTitle}
                        </a>
                        <div class="news-actions">
                            <span class="tr-news-date">${formatDate(item.published_at)}</span>
                            <div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div>
                        </div>
                    </div>
                </li>
            `;
            }).join('')
            : '<li class="news-placeholder" style="color:#9ca3af;text-align:center;padding:20px;">暂无文章</li>';
        
        // 显示数量
        const countHtml = articles.length > 0 
            ? `<span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${articles.length}条)</span>`
            : '';
        
        // 根据类型选择图标
        const isWechatMp = articles[0]?.source_type === 'wechat_mp';
        const icon = isWechatMp ? '📱' : '📰';
        
        return `
            <div class="platform-card topic-source-card" data-source="${escapeHtml(sourceName)}" data-source-id="${escapeHtml(realSourceId)}">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                        ${icon} ${escapeHtml(sourceName)}${countHtml}
                    </div>
                </div>
                <ul class="news-list">${newsHtml}</ul>
            </div>
        `;
    }

    /**
     * Render a keyword card with news
     */
    function renderKeywordCard(keyword, news) {
        const newsHtml = news.length > 0 
            ? news.slice(0, 50).map((item, idx) => {
                const newsId = item.id || `topic-${Date.now()}-${idx}`;
                const safeTitle = escapeHtml(item.title || '');
                const safeUrl = escapeHtml(item.url || '');
                const escapedTitle = safeTitle.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const escapedUrl = safeUrl.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                const sourceId = `topic-kw-${keyword}`;
                const escapedSourceName = escapeHtml(keyword).replace(/'/g, "\\'");
                
                // 总结按钮 HTML
                const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${newsId}" data-title="${safeTitle}" data-url="${safeUrl}" data-source-id="${sourceId}" data-source-name="${escapedSourceName}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${newsId}', '${escapedTitle}', '${escapedUrl}', '${sourceId}', '${escapedSourceName}')"></button>`;
                const commentBtnHtml = `<button class="news-comment-btn" data-url="${safeUrl}" data-title="${safeTitle}"></button>`;
                
                return `
                <li class="news-item" data-news-id="${newsId}" data-news-title="${safeTitle}" data-news-url="${safeUrl}">
                    <div class="news-item-content">
                        <span class="news-index">${idx + 1}</span>
                        <a class="news-title" href="${safeUrl}" target="_blank" rel="noopener noreferrer">
                            ${safeTitle}
                        </a>
                        <div class="news-actions">
                            <span class="tr-news-date">${formatDate(item.published_at)}</span>
                            <div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div>
                        </div>
                    </div>
                </li>
            `;
            }).join('')
            : '<li class="news-placeholder" style="color:#9ca3af;text-align:center;padding:20px;">暂无相关新闻</li>';
        
        // 只有有新闻时才显示数量
        const countHtml = news.length > 0 
            ? `<span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${news.length}条)</span>`
            : '';
        
        return `
            <div class="platform-card" data-keyword="${escapeHtml(keyword)}">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                        🔍 ${escapeHtml(keyword)}${countHtml}
                    </div>
                </div>
                <ul class="news-list">${newsHtml}</ul>
            </div>
        `;
    }

    /**
     * Check if user is logged in
     */
    function isUserLoggedIn() {
        // Check if authState is available (from auth-state.js module)
        return !!authState.getUser();
    }
    
    /**
     * Open modal for new topic
     */
    async function openModal() {
        // Check if user is logged in
        if (!requireLogin()) return;
        
        // Check VIP status
        try {
            const response = await fetch('/api/subscription/status', { credentials: 'include' });
            const data = await response.json();
            if (data.ok !== false && !data.is_vip) {
                if (typeof window.openSubscriptionModal === 'function') {
                    window.openSubscriptionModal();
                } else {
                    alert('新增主题为会员专属功能，请前往设置中心升级会员。');
                }
                return;
            }
        } catch (e) {
            console.error('[TopicTracker] Failed to check subscription status:', e);
            // In case of network error, let the backend handle the VIP verification
        }
        
        currentEditTopic = null;
        generatedData = null;
        
        modalTitle.textContent = '新建追踪主题';
        topicNameInput.value = '';
        document.getElementById('topicIconGroup').style.display = 'none';
        document.getElementById('topicKeywordsGroup').style.display = 'none';
        document.getElementById('topicSourcesGroup').style.display = 'none';
        
        // 新建时：显示"生成"按钮，隐藏"创建"按钮
        aiGenerateBtn.style.display = '';
        aiGenerateBtn.disabled = false;
        aiGenerateBtn.innerHTML = '🤖 生成关键词和推荐源';
        submitBtn.style.display = 'none';
        
        modalOverlay.classList.add('active');
        topicNameInput.focus();
    }

    /**
     * Close modal
     */
    function closeModal() {
        modalOverlay.classList.remove('active');
        currentEditTopic = null;
        generatedData = null;
    }
    
    /**
     * Show dialog for inactive sources confirmation
     * @param {Array} inactiveSources - List of inactive sources with id, name, days_inactive
     * @param {string} topicId - Topic ID
     * @returns {Promise<boolean>} - true if user wants to remove inactive sources
     */
    function showInactiveSourcesDialog(inactiveSources, topicId) {
        return new Promise((resolve) => {
            // 创建对话框
            const dialogHtml = `
                <div class="topic-inactive-dialog-overlay" id="inactiveSourcesDialog">
                    <div class="topic-inactive-dialog">
                        <div class="topic-inactive-dialog-header">
                            <span class="topic-inactive-dialog-icon">⚠️</span>
                            <h3>检测到不活跃的公众号</h3>
                        </div>
                        <div class="topic-inactive-dialog-body">
                            <p class="topic-inactive-dialog-desc">以下 ${inactiveSources.length} 个公众号已超过 2 个月没有更新，可能已停更：</p>
                            <ul class="topic-inactive-source-list">
                                ${inactiveSources.map(s => {
                                    const daysText = s.days_inactive > 0 
                                        ? `${s.days_inactive} 天未更新` 
                                        : '从未更新';
                                    return `<li>
                                        <span class="topic-inactive-source-name">📱 ${escapeHtml(s.name)}</span>
                                        <span class="topic-inactive-source-days">${daysText}</span>
                                    </li>`;
                                }).join('')}
                            </ul>
                            <p class="topic-inactive-dialog-tip">移除不活跃账号可以让主题内容更精准</p>
                        </div>
                        <div class="topic-inactive-dialog-footer">
                            <button class="topic-inactive-btn secondary" id="inactiveKeepBtn">保留全部</button>
                            <button class="topic-inactive-btn primary" id="inactiveRemoveBtn">移除不活跃账号</button>
                        </div>
                    </div>
                </div>
            `;
            
            document.body.insertAdjacentHTML('beforeend', dialogHtml);
            
            const dialog = document.getElementById('inactiveSourcesDialog');
            const keepBtn = document.getElementById('inactiveKeepBtn');
            const removeBtn = document.getElementById('inactiveRemoveBtn');
            
            // 添加样式
            const style = document.createElement('style');
            style.id = 'inactiveDialogStyle';
            style.textContent = `
                .topic-inactive-dialog-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 10001;
                    animation: fadeIn 0.2s ease;
                }
                .topic-inactive-dialog {
                    background: white;
                    border-radius: 16px;
                    width: 90%;
                    max-width: 420px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
                    animation: slideUp 0.3s ease;
                }
                @keyframes slideUp {
                    from { transform: translateY(20px); opacity: 0; }
                    to { transform: translateY(0); opacity: 1; }
                }
                .topic-inactive-dialog-header {
                    padding: 24px 24px 16px;
                    text-align: center;
                }
                .topic-inactive-dialog-icon {
                    font-size: 48px;
                    display: block;
                    margin-bottom: 12px;
                }
                .topic-inactive-dialog-header h3 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                    color: #111827;
                }
                .topic-inactive-dialog-body {
                    padding: 0 24px 20px;
                }
                .topic-inactive-dialog-desc {
                    font-size: 14px;
                    color: #6b7280;
                    margin: 0 0 16px;
                    text-align: center;
                }
                .topic-inactive-source-list {
                    list-style: none;
                    padding: 0;
                    margin: 0 0 16px;
                    max-height: 200px;
                    overflow-y: auto;
                    background: #f9fafb;
                    border-radius: 8px;
                    padding: 8px;
                }
                .topic-inactive-source-list li {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 12px;
                    border-bottom: 1px solid #e5e7eb;
                }
                .topic-inactive-source-list li:last-child {
                    border-bottom: none;
                }
                .topic-inactive-source-name {
                    font-size: 14px;
                    color: #374151;
                    font-weight: 500;
                }
                .topic-inactive-source-days {
                    font-size: 12px;
                    color: #ef4444;
                    background: #fef2f2;
                    padding: 2px 8px;
                    border-radius: 4px;
                }
                .topic-inactive-dialog-tip {
                    font-size: 13px;
                    color: #9ca3af;
                    margin: 0;
                    text-align: center;
                }
                .topic-inactive-dialog-footer {
                    padding: 16px 24px 24px;
                    display: flex;
                    gap: 12px;
                }
                .topic-inactive-btn {
                    flex: 1;
                    padding: 12px 16px;
                    border-radius: 8px;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: all 0.2s;
                    border: none;
                }
                .topic-inactive-btn.secondary {
                    background: #f3f4f6;
                    color: #374151;
                }
                .topic-inactive-btn.secondary:hover {
                    background: #e5e7eb;
                }
                .topic-inactive-btn.primary {
                    background: linear-gradient(135deg, #ef4444, #dc2626);
                    color: white;
                }
                .topic-inactive-btn.primary:hover {
                    background: linear-gradient(135deg, #dc2626, #b91c1c);
                }
            `;
            document.head.appendChild(style);
            
            // 绑定事件
            keepBtn.onclick = () => {
                dialog.remove();
                document.getElementById('inactiveDialogStyle')?.remove();
                resolve(false);
            };
            
            removeBtn.onclick = () => {
                dialog.remove();
                document.getElementById('inactiveDialogStyle')?.remove();
                resolve(true);
            };
        });
    }
    
    /**
     * Remove inactive sources from topic
     */
    async function removeInactiveSources(topicId, inactiveSources, currentSourceIds) {
        const inactiveIds = new Set(inactiveSources.map(s => s.id));
        const newSourceIds = currentSourceIds.filter(id => !inactiveIds.has(id));
        
        try {
            const response = await fetch(`/api/topics/${topicId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ rss_source_ids: newSourceIds })
            });
            
            const data = await response.json();
            if (data.ok) {
                console.log(`[TopicTracker] Removed ${inactiveSources.length} inactive sources`);
            } else {
                console.error('[TopicTracker] Failed to remove inactive sources:', data.error);
            }
        } catch (e) {
            console.error('[TopicTracker] Failed to remove inactive sources:', e);
        }
    }

    /**
     * Generate keywords using AI
     */
    async function generateKeywords() {
        const topicName = topicNameInput.value.trim();
        if (!topicName) {
            alert('请先输入主题名称');
            return;
        }
        
        // 先检查微信凭证状态
        const hasCredentials = await checkWechatCredentials();
        if (!hasCredentials) {
            // 没有凭证，弹出二维码窗口
            showWechatQrcodeModal();
            return;
        }
        
        // 有凭证，直接生成
        doGenerateKeywords();
    }
    
    /**
     * Actually generate keywords (skip credential check)
     */
    async function doGenerateKeywords() {
        const topicName = topicNameInput.value.trim();
        if (!topicName) {
            alert('请先输入主题名称');
            return;
        }
        
        aiGenerateBtn.disabled = true;
        
        // 显示进度条
        const progressContainer = document.getElementById('topicProgressContainer');
        const progressFill = document.getElementById('topicProgressFill');
        const progressText = document.getElementById('topicProgressText');
        progressContainer.style.display = 'block';
        
        // 进度步骤 - 更细粒度，让等待感觉更自然
        const progressSteps = [
            { percent: 5, text: '🤖 正在分析主题...' },
            { percent: 15, text: '🔍 正在理解主题含义...' },
            { percent: 25, text: '📝 正在生成关键词...' },
            { percent: 35, text: '🎯 正在优化关键词...' },
            { percent: 45, text: '📡 正在搜索相关数据源...' },
            { percent: 55, text: '🔎 正在匹配公众号...' },
            { percent: 65, text: '🌐 正在查找 RSS 源...' },
            { percent: 72, text: '✅ 正在验证数据源...' },
            { percent: 78, text: '📊 正在整理推荐结果...' },
            { percent: 83, text: '⏳ 即将完成，请稍候...' },
            { percent: 87, text: '⏳ 正在做最后处理...' },
            { percent: 90, text: '⏳ 马上就好...' },
            { percent: 92, text: '⏳ 还差一点点...' },
            { percent: 94, text: '⏳ 快完成了...' }
        ];
        let stepIndex = 0;
        
        const updateProgress = () => {
            const step = progressSteps[stepIndex];
            progressFill.style.width = step.percent + '%';
            progressText.textContent = step.text;
        };
        updateProgress();
        
        // 前面步骤快一些（2秒），后面步骤慢一些（4秒）
        const getInterval = () => {
            if (stepIndex < 5) return 2000;      // 前5步：2秒
            if (stepIndex < 9) return 3000;      // 中间4步：3秒
            return 4000;                          // 最后几步：4秒
        };
        
        const advanceProgress = () => {
            if (stepIndex < progressSteps.length - 1) {
                stepIndex++;
                updateProgress();
                progressInterval = setTimeout(advanceProgress, getInterval());
            }
        };
        
        let progressInterval = setTimeout(advanceProgress, getInterval());
        
        try {
            const response = await fetch('/api/topics/generate-keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ topic_name: topicName })
            });
            
            // 处理 401 未授权错误
            if (response.status === 401) {
                alert('登录已过期，请重新登录');
                if (typeof openLoginModal === 'function') {
                    openLoginModal();
                }
                return;
            }
            
            const data = await response.json();
            
            if (data.ok) {
                // 完成进度
                progressFill.style.width = '100%';
                progressText.textContent = '✅ 生成完成！';
                
                generatedData = {
                    icon: data.icon || '🏷️',
                    keywords: data.keywords || [],
                    recommended_sources: data.recommended_sources || [],
                    has_wechat_credentials: data.has_wechat_credentials
                };
                
                // 短暂延迟后隐藏进度条并显示结果
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                    renderGeneratedData();
                    
                    // 生成成功后：隐藏"生成"按钮，显示"创建"按钮
                    aiGenerateBtn.style.display = 'none';
                    submitBtn.style.display = '';
                    submitBtn.disabled = false;
                    submitBtn.textContent = '创建并开始追踪';
                }, 500);
            } else {
                progressFill.style.width = '100%';
                progressFill.style.background = '#ef4444';
                progressText.textContent = '❌ ' + (data.error || 'AI 生成失败');
                setTimeout(() => {
                    progressContainer.style.display = 'none';
                    progressFill.style.background = '';
                }, 2000);
            }
        } catch (e) {
            console.error('Generate keywords failed:', e);
            progressFill.style.width = '100%';
            progressFill.style.background = '#ef4444';
            progressText.textContent = '❌ AI 生成失败，请重试';
            setTimeout(() => {
                progressContainer.style.display = 'none';
                progressFill.style.background = '';
            }, 2000);
        } finally {
            clearTimeout(progressInterval);
            aiGenerateBtn.disabled = false;
            aiGenerateBtn.innerHTML = '🤖 生成关键词和推荐源';
        }
    }
    
    /**
     * Check if wechat credentials are available
     */
    async function checkWechatCredentials() {
        // 如果已经缓存了结果（扫码成功后），直接返回
        if (hasWechatCredentialsCache === true) {
            return true;
        }
        
        try {
            const response = await fetch('/api/topics/check-credentials', {
                credentials: 'include'
            });
            const data = await response.json();
            const result = data.has_wechat_credentials === true;
            // 只缓存成功的结果
            if (result) {
                hasWechatCredentialsCache = true;
            }
            return result;
        } catch (e) {
            console.error('Check credentials failed:', e);
            return false;
        }
    }
    
    /**
     * Mark wechat credentials as available (called after successful QR scan)
     */
    function markWechatCredentialsAvailable() {
        hasWechatCredentialsCache = true;
    }
    
    /**
     * Show wechat qrcode modal for authorization
     */
    function showWechatQrcodeModal() {
        // 检查是否已有弹窗
        if (document.getElementById('wechatQrcodeModal')) {
            document.getElementById('wechatQrcodeModal').classList.add('active');
            // 重新获取二维码
            startQrcodeModalLogin();
            return;
        }
        
        const modal = document.createElement('div');
        modal.id = 'wechatQrcodeModal';
        modal.className = 'wechat-qrcode-modal active';
        modal.innerHTML = `
            <div class="wechat-qrcode-content">
                <button class="wechat-qrcode-close" onclick="TopicTracker.closeQrcodeModal()">×</button>
                <div class="wechat-qrcode-header">
                    <div class="wechat-qrcode-icon">📱</div>
                    <h3>扫码授权微信公众号</h3>
                </div>
                <div class="wechat-qrcode-body">
                    <p>为了验证和获取公众号文章，需要先扫码授权：</p>
                    <div id="qrcodeModalQRArea" class="wechat-qrcode-area">
                        <div class="topic-wechat-qr-loading">
                            <span class="topic-spinner"></span>
                            正在获取二维码...
                        </div>
                    </div>
                    <div class="wechat-qrcode-tips">
                        <p>💡 使用微信扫描上方二维码</p>
                        <p>⚠️ 请注册公众号或服务号</p>
                    </div>
                </div>
                <div class="wechat-qrcode-footer">
                    <button class="wechat-qrcode-btn secondary" onclick="TopicTracker.closeQrcodeModal()">稍后再说</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // 开始获取二维码
        startQrcodeModalLogin();
    }
    
    // 弹窗专用的二维码状态
    let qrcodeModalState = {
        polling: false,
        sessionId: null
    };
    
    /**
     * Start QR login in modal
     */
    async function startQrcodeModalLogin() {
        const qrArea = document.getElementById('qrcodeModalQRArea');
        if (!qrArea) return;
        
        qrArea.innerHTML = `
            <div class="topic-wechat-qr-loading">
                <span class="topic-spinner"></span>
                正在获取二维码...
            </div>
        `;
        
        try {
            const startResp = await fetch('/api/wechat/auth/qr/start', { 
                method: 'POST',
                credentials: 'include'
            });
            const startData = await startResp.json();
            
            if (!startData.ok) throw new Error(startData.error || '创建会话失败');
            
            qrcodeModalState.sessionId = startData.session_id;
            const qrUrl = `/api/wechat/auth/qr/image?t=${Date.now()}`;
            
            qrArea.innerHTML = `
                <img src="${qrUrl}" alt="登录二维码" class="wechat-qrcode-image" 
                     onerror="this.parentElement.innerHTML='<p class=wechat-qrcode-error>二维码加载失败</p>'">
                <p id="qrcodeModalStatus" class="wechat-qrcode-status">等待扫码...</p>
                <button class="wechat-qrcode-refresh" onclick="TopicTracker.refreshQrcodeModal()">🔄 刷新二维码</button>
            `;
            
            qrcodeModalState.polling = true;
            pollQrcodeModalStatus();
            
        } catch (e) {
            console.error('[TopicTracker] Start QR error:', e);
            qrArea.innerHTML = `
                <p class="wechat-qrcode-error">获取二维码失败: ${escapeHtml(e.message)}</p>
                <button class="wechat-qrcode-refresh" onclick="TopicTracker.refreshQrcodeModal()">重试</button>
            `;
        }
    }
    
    /**
     * Poll QR status in modal
     */
    async function pollQrcodeModalStatus() {
        if (!qrcodeModalState.polling) return;
        
        try {
            const resp = await fetch('/api/wechat/auth/qr/status', { credentials: 'include' });
            const data = await resp.json();
            
            const statusEl = document.getElementById('qrcodeModalStatus');
            if (!statusEl) {
                qrcodeModalState.polling = false;
                return;
            }
            
            if (data.status === 'waiting') {
                statusEl.textContent = '等待扫码...';
                statusEl.className = 'wechat-qrcode-status';
            } else if (data.status === 'scanned') {
                statusEl.textContent = '已扫码，请在手机上确认登录';
                statusEl.className = 'wechat-qrcode-status scanned';
            } else if (data.status === 'confirmed') {
                statusEl.textContent = '✅ 授权成功！';
                statusEl.className = 'wechat-qrcode-status confirmed';
                qrcodeModalState.polling = false;
                
                // 完成登录
                await completeQrcodeModalLogin();
                return;
            } else if (data.status === 'expired' || data.need_refresh) {
                statusEl.textContent = '二维码已过期';
                statusEl.className = 'wechat-qrcode-status expired';
                qrcodeModalState.polling = false;
                
                const qrArea = document.getElementById('qrcodeModalQRArea');
                if (qrArea) {
                    qrArea.innerHTML = `
                        <p class="wechat-qrcode-error">二维码已过期</p>
                        <button class="wechat-qrcode-refresh" onclick="TopicTracker.refreshQrcodeModal()">重新获取</button>
                    `;
                }
                return;
            } else if (data.status === 'error') {
                statusEl.textContent = data.message || '出错了';
                statusEl.className = 'wechat-qrcode-status error';
            }
            
            // 继续轮询
            if (qrcodeModalState.polling) {
                setTimeout(pollQrcodeModalStatus, 2000);
            }
        } catch (e) {
            console.error('[TopicTracker] Poll QR status error:', e);
            if (qrcodeModalState.polling) {
                setTimeout(pollQrcodeModalStatus, 3000);
            }
        }
    }
    
    /**
     * Complete QR login in modal
     */
    async function completeQrcodeModalLogin() {
        try {
            const resp = await fetch('/api/wechat/auth/qr/complete', {
                method: 'POST',
                credentials: 'include'
            });
            const data = await resp.json();
            
            if (data.ok) {
                const statusEl = document.getElementById('qrcodeModalStatus');
                if (statusEl) {
                    statusEl.textContent = '✅ 授权成功！正在生成...';
                    statusEl.className = 'wechat-qrcode-status confirmed';
                }
                
                // 标记凭证已可用，避免下次再检查
                markWechatCredentialsAvailable();
                
                // 授权成功，关闭弹窗并继续生成（跳过凭证检查）
                setTimeout(() => {
                    closeQrcodeModal();
                    doGenerateKeywords();  // 直接调用生成，不再检查凭证
                }, 1000);
            } else {
                const statusEl = document.getElementById('qrcodeModalStatus');
                if (statusEl) {
                    statusEl.textContent = data.error || '登录失败';
                    statusEl.className = 'wechat-qrcode-status error';
                }
            }
        } catch (e) {
            console.error('[TopicTracker] Complete QR login error:', e);
        }
    }
    
    /**
     * Refresh QR code in modal
     */
    function refreshQrcodeModal() {
        qrcodeModalState.polling = false;
        startQrcodeModalLogin();
    }
    
    /**
     * Close wechat qrcode modal
     */
    function closeQrcodeModal() {
        const modal = document.getElementById('wechatQrcodeModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }
    
    /**
     * Retry generate keywords after authorization
     */
    function retryAfterAuth() {
        closeQrcodeModal();
        // 重新触发生成
        generateKeywords();
    }

    /**
     * Render generated data (icon, keywords, sources)
     */
    function renderGeneratedData() {
        if (!generatedData) return;
        
        // Show icon
        document.getElementById('topicIconGroup').style.display = 'block';
        document.getElementById('topicIconPreview').textContent = generatedData.icon;
        
        // Show keywords
        document.getElementById('topicKeywordsGroup').style.display = 'block';
        renderKeywords();
        
        // Show sources
        if (generatedData.recommended_sources.length > 0) {
            document.getElementById('topicSourcesGroup').style.display = 'block';
            renderSources();
        }
    }

    /**
     * Render keywords tags
     */
    function renderKeywords() {
        if (!generatedData) return;
        
        const stats = generatedData.keywordStats || {};
        
        const html = generatedData.keywords.map(kw => {
            const count = stats[kw];
            const hasStats = count !== undefined;
            const hasNews = count > 0;
            
            // 编辑模式下显示新闻数量
            let countHtml = '';
            if (hasStats) {
                if (hasNews) {
                    countHtml = `<span class="topic-keyword-count has-news">${count}</span>`;
                } else {
                    countHtml = `<span class="topic-keyword-count no-news" title="暂无匹配新闻">0</span>`;
                }
            }
            
            return `
                <span class="topic-keyword-tag ${hasStats && !hasNews ? 'inactive' : ''}">
                    ${escapeHtml(kw)}${countHtml}
                    <button class="topic-keyword-remove" onclick="TopicTracker.removeKeyword('${escapeHtml(kw)}')">×</button>
                </span>
            `;
        }).join('') + `
            <button class="topic-keyword-add" onclick="TopicTracker.addKeyword()">+ 添加关键词</button>
        `;
        
        keywordsContainer.innerHTML = html;
    }

    /**
     * Add a keyword
     */
    function addKeyword() {
        const keyword = prompt('请输入关键词：');
        if (!keyword || !keyword.trim()) return;
        
        if (!generatedData) {
            generatedData = { icon: '🏷️', keywords: [], recommended_sources: [] };
            document.getElementById('topicIconGroup').style.display = 'block';
            document.getElementById('topicKeywordsGroup').style.display = 'block';
        }
        
        if (!generatedData.keywords.includes(keyword.trim())) {
            generatedData.keywords.push(keyword.trim());
            renderKeywords();
            submitBtn.disabled = false;
        }
    }

    /**
     * Remove a keyword
     */
    function removeKeyword(keyword) {
        if (!generatedData) return;
        
        generatedData.keywords = generatedData.keywords.filter(k => k !== keyword);
        renderKeywords();
        
        if (generatedData.keywords.length === 0) {
            submitBtn.disabled = true;
        }
    }

    /**
     * Render recommended sources
     * 区分显示已验证（数据库）和待验证（AI推荐）的源
     */
    function renderSources() {
        if (!generatedData || !generatedData.recommended_sources) return;
        
        const sources = generatedData.recommended_sources;
        
        // 如果没有推荐源，显示友好提示
        if (sources.length === 0) {
            sourcesContainer.innerHTML = `
                <div class="topic-sources-empty-hint">
                    <div class="topic-sources-empty-icon">📭</div>
                    <div class="topic-sources-empty-text">暂未找到匹配的数据源</div>
                    <div class="topic-sources-empty-tip">请使用下方按钮手动搜索添加相关的订阅源或公众号</div>
                </div>
                <div class="topic-sources-add">
                    <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                        🔄 重新搜索
                    </button>
                    <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                        ➕ 手动添加数据源
                    </button>
                </div>
            `;
            return;
        }
        
        // 分组：已验证 vs 待验证
        const verifiedSources = sources.filter(s => s.verified);
        const unverifiedSources = sources.filter(s => !s.verified);
        
        let html = '';
        
        // 已验证的源（来自数据库）
        if (verifiedSources.length > 0) {
            html += '<div class="topic-sources-section-title">✅ 已验证数据源</div>';
            html += verifiedSources.map((source, idx) => {
                const isRss = source.type === 'rss';
                const typeLabel = isRss ? 'RSS' : '公众号';
                const typeClass = isRss ? '' : 'wechat';
                const urlOrId = isRss ? source.url : (source.wechat_id ? `微信号: ${source.wechat_id}` : '');
                const realIdx = sources.indexOf(source);
                
                return `
                    <div class="topic-source-item verified">
                        <input type="checkbox" class="topic-source-checkbox" 
                               id="source-${realIdx}" data-source-idx="${realIdx}" 
                               data-source-id="${source.id || ''}" checked>
                        <div class="topic-source-info">
                            <div class="topic-source-name">${escapeHtml(source.name)}</div>
                            ${urlOrId ? `<div class="topic-source-url">${escapeHtml(urlOrId)}</div>` : ''}
                            ${source.description ? `<div class="topic-source-desc">${escapeHtml(source.description)}</div>` : ''}
                        </div>
                        <span class="topic-source-type ${typeClass}">${typeLabel}</span>
                    </div>
                `;
            }).join('');
        }
        
        // 待验证的源（AI推荐）
        if (unverifiedSources.length > 0) {
            html += '<div class="topic-sources-section-title">⚠️ AI 推荐（需验证）</div>';
            html += unverifiedSources.map((source, idx) => {
                const isRss = source.type === 'rss';
                const typeLabel = isRss ? 'RSS' : '公众号';
                const typeClass = isRss ? '' : 'wechat';
                const urlOrId = isRss ? source.url : `微信号: ${source.wechat_id}`;
                const realIdx = sources.indexOf(source);
                
                return `
                    <div class="topic-source-item unverified">
                        <input type="checkbox" class="topic-source-checkbox" 
                               id="source-${realIdx}" data-source-idx="${realIdx}" checked>
                        <div class="topic-source-info">
                            <div class="topic-source-name">${escapeHtml(source.name)}</div>
                            <div class="topic-source-url">${escapeHtml(urlOrId)}</div>
                            ${source.description ? `<div class="topic-source-desc">${escapeHtml(source.description)}</div>` : ''}
                        </div>
                        <span class="topic-source-type ${typeClass}">${typeLabel}</span>
                    </div>
                `;
            }).join('');
        }
        
        // 如果数据源少于3个，显示提示
        if (sources.length < 3) {
            html += `
                <div class="topic-sources-few-hint">
                    💡 数据源较少，建议手动搜索添加更多相关的订阅源或公众号
                </div>
            `;
        }
        
        // Add manual add buttons
        const buttonsHtml = `
            <div class="topic-sources-add">
                <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                    🔄 AI 新增数据源
                </button>
                <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                    ➕ 手动添加数据源
                </button>
            </div>
        `;
        
        sourcesContainer.innerHTML = html + buttonsHtml;
    }

    /**
     * Render sources for edit mode (existing + new recommended)
     */
    async function renderSourcesForEdit(existingSourceIds) {
        let html = '';
        
        // 1. Render existing sources (from database)
        if (existingSourceIds && existingSourceIds.length > 0) {
            try {
                const response = await fetch('/api/topics/sources/batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ source_ids: existingSourceIds })
                });
                const data = await response.json();
                
                if (data.ok && data.sources) {
                    const sourcesMap = {};
                    data.sources.forEach(s => sourcesMap[s.id] = s);
                    
                    html += '<div class="topic-sources-section-title">已关联的数据源</div>';
                    html += existingSourceIds.map((sourceId, idx) => {
                        const source = sourcesMap[sourceId] || { id: sourceId, name: sourceId, type: 'rss' };
                        const isRss = source.type !== 'wechat_mp';
                        const typeLabel = isRss ? 'RSS' : '公众号';
                        const typeClass = isRss ? '' : 'wechat';
                        const subtitle = isRss ? (source.url || '') : (source.wechat_id ? `微信号: ${source.wechat_id}` : '');
                        
                        return `
                            <div class="topic-source-item">
                                <input type="checkbox" class="topic-source-checkbox existing-source" 
                                       id="existing-source-${idx}" data-source-id="${sourceId}" checked>
                                <div class="topic-source-info">
                                    <div class="topic-source-name">${escapeHtml(source.name)}</div>
                                    ${subtitle ? `<div class="topic-source-url">${escapeHtml(subtitle)}</div>` : ''}
                                </div>
                                <span class="topic-source-type ${typeClass}">${typeLabel}</span>
                            </div>
                        `;
                    }).join('');
                }
            } catch (e) {
                console.error('Failed to fetch source details:', e);
            }
        }
        
        // 2. Render new recommended sources (if any)
        if (generatedData && generatedData.recommended_sources && generatedData.recommended_sources.length > 0) {
            html += '<div class="topic-sources-section-title">新添加的数据源</div>';
            html += generatedData.recommended_sources.map((source, idx) => {
                const isRss = source.type === 'rss';
                const typeLabel = isRss ? 'RSS' : '公众号';
                const typeClass = isRss ? '' : 'wechat';
                const urlOrId = isRss ? source.url : `微信号: ${source.wechat_id}`;
                // 如果源已验证，添加 data-source-id 属性
                const sourceIdAttr = source.verified && source.id ? `data-source-id="${escapeHtml(source.id)}"` : '';
                
                return `
                    <div class="topic-source-item">
                        <input type="checkbox" class="topic-source-checkbox" 
                               id="source-${idx}" data-source-idx="${idx}" ${sourceIdAttr} checked>
                        <div class="topic-source-info">
                            <div class="topic-source-name">${escapeHtml(source.name)}</div>
                            <div class="topic-source-url">${escapeHtml(urlOrId)}</div>
                        </div>
                        <span class="topic-source-type ${typeClass}">${typeLabel}</span>
                    </div>
                `;
            }).join('');
        }
        
        // 3. Add buttons
        html += `
            <div class="topic-sources-add">
                <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                    🔄 AI 新增数据源
                </button>
                <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                    ➕ 手动添加数据源
                </button>
            </div>
        `;
        
        sourcesContainer.innerHTML = html;
    }

    /**
     * Select all sources
     */
    function selectAllSources() {
        document.querySelectorAll('.topic-source-checkbox').forEach(cb => cb.checked = true);
    }

    /**
     * Deselect all sources
     */
    function deselectAllSources() {
        document.querySelectorAll('.topic-source-checkbox').forEach(cb => cb.checked = false);
    }

    /**
     * Submit topic (create or update)
     */
    async function submitTopic() {
        const name = topicNameInput.value.trim();
        if (!name) {
            alert('请输入主题名称');
            return;
        }
        
        if (!generatedData || generatedData.keywords.length === 0) {
            alert('请至少添加一个关键词');
            return;
        }
        
        // Get selected new sources (from AI recommendations)
        const selectedSources = [];
        document.querySelectorAll('.topic-source-checkbox:checked:not(.existing-source)').forEach(cb => {
            const idx = parseInt(cb.dataset.sourceIdx);
            if (generatedData.recommended_sources && generatedData.recommended_sources[idx]) {
                selectedSources.push(generatedData.recommended_sources[idx]);
            }
        });
        
        // Get existing sources that are still checked
        const existingSourceIds = [];
        document.querySelectorAll('.topic-source-checkbox.existing-source:checked').forEach(cb => {
            const sourceId = cb.dataset.sourceId;
            if (sourceId) {
                existingSourceIds.push(sourceId);
            }
        });
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="topic-spinner"></span> 创建中...';
        
        try {
            // 分离已验证源和待验证源
            const verifiedSourceIds = [];  // 已验证的源，直接使用 ID
            const unverifiedSources = [];  // 待验证的源，需要验证
            
            document.querySelectorAll('.topic-source-checkbox:checked:not(.existing-source)').forEach(cb => {
                const idx = parseInt(cb.dataset.sourceIdx);
                const sourceId = cb.dataset.sourceId;
                
                if (generatedData.recommended_sources && generatedData.recommended_sources[idx]) {
                    const source = generatedData.recommended_sources[idx];
                    if (source.verified && source.id) {
                        // 已验证的源，直接使用 ID
                        verifiedSourceIds.push(source.id);
                    } else {
                        // 待验证的源，需要验证
                        unverifiedSources.push(source);
                    }
                }
            });
            
            // Step 1: 验证待验证的源
            let newSourceIds = [];
            if (unverifiedSources.length > 0) {
                submitBtn.innerHTML = '<span class="topic-spinner"></span> 验证数据源...';
                
                const validateResponse = await fetch('/api/topics/validate-sources', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ sources: unverifiedSources })
                });
                
                const validateData = await validateResponse.json();
                
                if (validateData.ok && validateData.validated_sources) {
                    newSourceIds = validateData.validated_sources.map(s => s.id);
                    
                    // Show validation results
                    const created = validateData.validated_sources.filter(s => s.status === 'created').length;
                    const exists = validateData.validated_sources.filter(s => s.status === 'exists').length;
                    const failedSources = validateData.failed_sources || [];
                    
                    if (failedSources.length > 0) {
                        // Show failed sources to user
                        const failedMsg = failedSources.map(s => `• ${s.name}: ${s.reason}`).join('\n');
                        const successCount = created + exists;
                        
                        if (successCount > 0) {
                            alert(`成功添加 ${successCount} 个数据源\n\n以下 ${failedSources.length} 个源验证失败：\n${failedMsg}`);
                        } else if (verifiedSourceIds.length === 0 && existingSourceIds.length === 0) {
                            alert(`所有数据源验证失败：\n${failedMsg}\n\n主题仍会创建，但不会关联这些数据源。`);
                        }
                    }
                }
            }
            
            // Combine all source IDs: existing + verified + newly validated
            const allSourceIds = [...new Set([...existingSourceIds, ...verifiedSourceIds, ...newSourceIds])];
            
            console.log(`[TopicTracker] Source IDs: existing=${existingSourceIds.length}, verified=${verifiedSourceIds.length}, new=${newSourceIds.length}, total=${allSourceIds.length}`);
            
            // Step 2: Create/update the topic
            submitBtn.innerHTML = '<span class="topic-spinner"></span> 保存主题...';
            
            const body = {
                name: name,
                icon: generatedData.icon,
                keywords: generatedData.keywords,
                rss_source_ids: allSourceIds
            };
            
            const url = currentEditTopic ? `/api/topics/${currentEditTopic.id}` : '/api/topics';
            const method = currentEditTopic ? 'PUT' : 'POST';
            
            const response = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(body)
            });
            
            const data = await response.json();
            
            if (data.ok) {
                const topicId = data.topic?.id || (currentEditTopic ? currentEditTopic.id : null);
                
                if (!currentEditTopic && topicId) {
                    // 新建主题：先抓取数据源，再跳转
                    const sourceCount = allSourceIds.length;
                    
                    if (sourceCount > 0) {
                        // 显示进度条
                        const progressEl = document.getElementById('topicFetchProgress');
                        const progressText = progressEl?.querySelector('.topic-fetch-progress-text');
                        const progressFill = progressEl?.querySelector('.topic-fetch-progress-fill');
                        
                        if (progressEl) {
                            progressEl.style.display = 'block';
                        }
                        
                        submitBtn.innerHTML = `<span class="topic-spinner"></span> 抓取中...`;
                        
                        // 进度条：匀速渐慢递增，不会卡在某个文案上
                        let progress = 5;
                        if (progressFill) progressFill.style.width = '5%';
                        if (progressText) progressText.textContent = `📡 正在抓取 ${sourceCount} 个数据源...`;
                        
                        const progressMilestones = [
                            { at: 20, text: '📱 正在抓取公众号文章...' },
                            { at: 40, text: '📰 正在获取 RSS 内容...' },
                            { at: 60, text: '💾 正在保存到数据库...' },
                            { at: 75, text: '📊 正在整理文章列表...' },
                        ];
                        let milestoneIdx = 0;
                        
                        const fetchProgressTimer = setInterval(() => {
                            if (progress < 90) {
                                progress += (90 - progress) * 0.06;
                                const p = Math.round(progress);
                                if (progressFill) progressFill.style.width = p + '%';
                                // 到达里程碑时更新文案
                                if (milestoneIdx < progressMilestones.length && p >= progressMilestones[milestoneIdx].at) {
                                    if (progressText) progressText.textContent = progressMilestones[milestoneIdx].text;
                                    milestoneIdx++;
                                }
                            }
                        }, 500);
                        
                        try {
                            // 调用抓取 API
                            const fetchResponse = await fetch(`/api/topics/${topicId}/fetch-sources`, {
                                method: 'POST',
                                credentials: 'include'
                            });
                            
                            const fetchData = await fetchResponse.json();
                            
                            clearInterval(fetchProgressTimer);
                            
                            if (fetchData.ok) {
                                const fetched = fetchData.fetched || 0;
                                if (progressFill) progressFill.style.width = '100%';
                                if (progressText) progressText.textContent = `✅ 抓取完成 (${fetched}条新闻)`;
                                submitBtn.innerHTML = `<span class="topic-spinner"></span> 处理中...`;
                                console.log(`[TopicTracker] Fetch completed: ${fetched} articles from ${sourceCount} sources`);
                                
                                // 检查是否有不活跃的公众号
                                const inactiveSources = fetchData.inactive_sources || [];
                                if (inactiveSources.length > 0) {
                                    // 弹出确认窗口
                                    const shouldRemove = await showInactiveSourcesDialog(inactiveSources, topicId);
                                    if (shouldRemove) {
                                        // 用户选择移除不活跃账号
                                        if (progressText) progressText.textContent = '🗑️ 正在移除不活跃账号...';
                                        await removeInactiveSources(topicId, inactiveSources, allSourceIds);
                                    }
                                }
                            } else {
                                console.warn('[TopicTracker] Fetch sources warning:', fetchData.error);
                                if (progressFill) progressFill.style.width = '100%';
                                if (progressText) progressText.textContent = '✅ 抓取完成，即将跳转...';
                            }
                            
                            // 等待一下让用户看到完成状态
                            await new Promise(r => setTimeout(r, 800));
                        } catch (fetchError) {
                            console.error('[TopicTracker] Fetch sources failed:', fetchError);
                            clearInterval(fetchProgressTimer);
                            // 抓取失败不阻止跳转，用户可以稍后刷新
                        }
                    }
                    
                    closeModal();
                    
                    // 跳转到新主题
                    const categoryId = `topic-${topicId}`;
                    try {
                        localStorage.setItem('tr_active_tab', categoryId);
                    } catch (e) {}
                    
                    // 刷新页面
                    window.location.reload();
                } else if (topicId) {
                    // 编辑主题：只对新增的数据源触发抓取
                    const oldSourceIds = new Set((currentEditTopic.rss_source_ids || currentEditTopic.rss_sources || []));
                    const newlyAdded = allSourceIds.filter(id => !oldSourceIds.has(id));
                    
                    if (newlyAdded.length > 0) {
                        // 有新增数据源，触发抓取
                        const progressEl = document.getElementById('topicFetchProgress');
                        const progressText = progressEl?.querySelector('.topic-fetch-progress-text');
                        const progressFill = progressEl?.querySelector('.topic-fetch-progress-fill');
                        
                        if (progressEl) progressEl.style.display = 'block';
                        submitBtn.innerHTML = `<span class="topic-spinner"></span> 抓取新数据源...`;
                        
                        // 进度条：匀速递增，不会卡在"马上就好"
                        let progress = 5;
                        if (progressFill) progressFill.style.width = '5%';
                        if (progressText) progressText.textContent = `📡 正在抓取 ${newlyAdded.length} 个新数据源...`;
                        
                        const progressTimer = setInterval(() => {
                            if (progress < 90) {
                                progress += (90 - progress) * 0.08; // 渐慢递增，永远不会到90
                                if (progressFill) progressFill.style.width = Math.round(progress) + '%';
                            }
                        }, 500);
                        
                        try {
                            const fetchResponse = await fetch(`/api/topics/${topicId}/fetch-sources`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'include',
                                body: JSON.stringify({ source_ids: newlyAdded })
                            });
                            const fetchData = await fetchResponse.json();
                            clearInterval(progressTimer);
                            
                            if (fetchData.ok) {
                                const fetched = fetchData.fetched || 0;
                                if (progressFill) progressFill.style.width = '100%';
                                if (progressText) progressText.textContent = `✅ 抓取完成 (${fetched}条新文章)`;
                                
                                const inactiveSources = fetchData.inactive_sources || [];
                                if (inactiveSources.length > 0) {
                                    const shouldRemove = await showInactiveSourcesDialog(inactiveSources, topicId);
                                    if (shouldRemove) {
                                        if (progressText) progressText.textContent = '🗑️ 正在移除不活跃账号...';
                                        await removeInactiveSources(topicId, inactiveSources, allSourceIds);
                                    }
                                }
                            } else {
                                if (progressFill) progressFill.style.width = '100%';
                                if (progressText) progressText.textContent = '✅ 保存完成';
                            }
                            
                            await new Promise(r => setTimeout(r, 600));
                        } catch (fetchError) {
                            console.error('[TopicTracker] Edit fetch failed:', fetchError);
                            clearInterval(progressTimer);
                        }
                    }
                    
                    closeModal();
                    const categoryId = `topic-${topicId}`;
                    try { localStorage.setItem('tr_active_tab', categoryId); } catch (e) {}
                    window.location.reload();
                }
            } else {
                alert(data.error || '操作失败');
            }
        } catch (e) {
            console.error('Submit topic failed:', e);
            alert('操作失败，请重试');
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = currentEditTopic ? '保存更改' : '创建并开始追踪';
        }
    }

    /**
     * Refresh a topic's news (force reload)
     */
    function refreshTopic(topicId) {
        resetTopicState(topicId);
        loadTopicNews(topicId, true);
    }

    /**
     * Edit a topic
     */
    async function editTopic(topicId) {
        // Check if user is logged in
        if (!requireLogin()) return;
        
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        
        currentEditTopic = topic;
        generatedData = {
            icon: topic.icon || '🏷️',
            keywords: [...topic.keywords],
            recommended_sources: [],  // New sources to add
            keywordStats: {}  // 关键词新闻数量统计
        };
        
        // 获取关键词的新闻数量
        try {
            const response = await fetch(`/api/topics/${topicId}/news?limit=1`, { credentials: 'include' });
            const data = await response.json();
            if (data.ok && data.keywords_news) {
                for (const kw of topic.keywords) {
                    generatedData.keywordStats[kw] = (data.keywords_news[kw] || []).length;
                }
            }
        } catch (e) {
            console.warn('Failed to load keyword stats:', e);
        }
        
        modalTitle.textContent = '编辑主题';
        topicNameInput.value = topic.name;
        
        // 编辑模式：隐藏"生成"按钮，显示"保存"按钮
        aiGenerateBtn.style.display = 'none';
        submitBtn.style.display = '';
        submitBtn.textContent = '保存更改';
        submitBtn.disabled = false;
        
        renderGeneratedData();
        
        // Always show sources group in edit mode
        document.getElementById('topicSourcesGroup').style.display = 'block';
        await renderSourcesForEdit(topic.rss_sources || []);
        
        modalOverlay.classList.add('active');
    }
    
    /**
     * Render existing RSS sources for editing (legacy - now uses renderSourcesForEdit)
     */
    async function renderExistingSources(sourceIds) {
        await renderSourcesForEdit(sourceIds);
    }
    
    /**
     * Legacy function kept for compatibility
     */
    async function _renderExistingSourcesLegacy(sourceIds) {
        if (!sourceIds || sourceIds.length === 0) {
            sourcesContainer.innerHTML = `
                <div class="topic-sources-empty">暂无关联数据源</div>
                <div class="topic-sources-add">
                    <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                        🔄 AI 新增数据源
                    </button>
                    <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                        ➕ 手动添加数据源
                    </button>
                </div>
            `;
            return;
        }
        
        // Fetch source details from API
        try {
            const response = await fetch('/api/topics/sources/batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ source_ids: sourceIds })
            });
            const data = await response.json();
            
            if (data.ok && data.sources) {
                const sourcesMap = {};
                data.sources.forEach(s => sourcesMap[s.id] = s);
                
                const html = sourceIds.map((sourceId, idx) => {
                    const source = sourcesMap[sourceId] || { id: sourceId, name: sourceId, type: 'rss' };
                    const isRss = source.type !== 'wechat_mp';
                    const typeLabel = isRss ? 'RSS' : '公众号';
                    const typeClass = isRss ? '' : 'wechat';
                    const subtitle = isRss ? (source.url || '') : (source.wechat_id ? `微信号: ${source.wechat_id}` : '');
                    
                    return `
                        <div class="topic-source-item">
                            <input type="checkbox" class="topic-source-checkbox existing-source" 
                                   id="existing-source-${idx}" data-source-id="${sourceId}" checked>
                            <div class="topic-source-info">
                                <div class="topic-source-name">${escapeHtml(source.name)}</div>
                                ${subtitle ? `<div class="topic-source-url">${escapeHtml(subtitle)}</div>` : ''}
                            </div>
                            <span class="topic-source-type ${typeClass}">${typeLabel}</span>
                        </div>
                    `;
                }).join('');
                
                sourcesContainer.innerHTML = html + `
                    <div class="topic-sources-add">
                        <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                            🔄 AI 新增数据源
                        </button>
                        <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                            ➕ 手动添加数据源
                        </button>
                    </div>
                `;
                return;
            }
        } catch (e) {
            console.error('Failed to fetch source details:', e);
        }
        
        // Fallback: show IDs if API fails
        const html = sourceIds.map((sourceId, idx) => {
            const isRss = !sourceId.startsWith('mp-');
            const typeLabel = isRss ? 'RSS' : '公众号';
            const typeClass = isRss ? '' : 'wechat';
            
            return `
                <div class="topic-source-item">
                    <input type="checkbox" class="topic-source-checkbox existing-source" 
                           id="existing-source-${idx}" data-source-id="${sourceId}" checked>
                    <div class="topic-source-info">
                        <div class="topic-source-name">${escapeHtml(sourceId)}</div>
                    </div>
                    <span class="topic-source-type ${typeClass}">${typeLabel}</span>
                </div>
            `;
        }).join('');
        
        sourcesContainer.innerHTML = html + `
            <div class="topic-sources-add">
                <button class="topic-ai-btn small" onclick="TopicTracker.regenerateSources()">
                    🔄 AI 新增数据源
                </button>
                <button class="topic-ai-btn small secondary" onclick="TopicTracker.showManualAddForm()">
                    ➕ 手动添加数据源
                </button>
            </div>
        `;
    }
    
    // WeChat auth state for topic tracker
    let wechatAuthState = {
        checked: false,
        hasAuth: false,
        qrPolling: false,
        pollTimer: null,
        sessionId: null
    };
    
    /**
     * Show manual add source form
     */
    function showManualAddForm() {
        // Reset selected MPs
        selectedMps = [];
        
        // Create a simple modal/form for manual input
        const formHtml = `
            <div class="topic-manual-add-form" id="manualAddForm">
                <div class="topic-manual-tabs">
                    <button class="topic-manual-tab active" data-tab="rss" onclick="TopicTracker.switchManualTab('rss')">RSS 源</button>
                    <button class="topic-manual-tab" data-tab="wechat" onclick="TopicTracker.switchManualTab('wechat')">微信公众号</button>
                </div>
                <div class="topic-manual-content" id="manualTabRss">
                    <div class="topic-form-group compact">
                        <label>RSS 名称</label>
                        <input type="text" id="manualRssName" placeholder="例如：36氪科技" class="topic-form-input">
                    </div>
                    <div class="topic-form-group compact">
                        <label>RSS URL</label>
                        <input type="text" id="manualRssUrl" placeholder="https://example.com/feed.xml" class="topic-form-input">
                    </div>
                </div>
                <div class="topic-manual-content" id="manualTabWechat" style="display:none;">
                    <div id="topicWechatAuthArea">
                        <div class="topic-mp-loading">检查授权状态...</div>
                    </div>
                    <div id="topicWechatSearchArea" style="display:none;">
                        <div class="topic-form-group compact">
                            <label>搜索公众号</label>
                            <div class="topic-mp-search-box">
                                <input type="text" id="mpSearchInput" placeholder="搜索公众号（至少2个字符）..." 
                                       class="topic-form-input" onkeydown="if(event.key==='Enter')TopicTracker.doMpSearch()">
                                <button class="topic-mp-search-btn" onclick="TopicTracker.doMpSearch()">搜索</button>
                            </div>
                            <div class="topic-mp-search-results" id="mpSearchResults">
                                <div class="topic-mp-empty">输入关键词搜索公众号</div>
                            </div>
                        </div>
                        <div class="topic-mp-selected" id="mpSelectedList"></div>
                    </div>
                </div>
                <div class="topic-manual-actions">
                    <button class="topic-modal-btn cancel small" onclick="TopicTracker.hideManualAddForm()">取消</button>
                    <button class="topic-modal-btn primary small" onclick="TopicTracker.addManualSource()">添加</button>
                </div>
            </div>
        `;
        
        // Insert before the add buttons
        const addSection = sourcesContainer.querySelector('.topic-sources-add');
        if (addSection) {
            addSection.insertAdjacentHTML('beforebegin', formHtml);
            addSection.style.display = 'none';
        } else {
            sourcesContainer.insertAdjacentHTML('beforeend', formHtml);
        }
    }
    
    /**
     * Do MP search (triggered by button or Enter key)
     */
    function doMpSearch() {
        const input = document.getElementById('mpSearchInput');
        if (input) {
            searchWechatMps(input.value);
        }
    }
    
    // Store selected MPs temporarily
    let selectedMps = [];
    
    /**
     * Search WeChat MPs using the same API as quick subscribe
     */
    async function searchWechatMps(query) {
        const resultsContainer = document.getElementById('mpSearchResults');
        if (!resultsContainer) return;
        
        const trimmedQuery = query.trim();
        if (trimmedQuery.length < 2) {
            resultsContainer.innerHTML = '<div class="topic-mp-empty">请输入至少2个字符</div>';
            return;
        }
        
        resultsContainer.innerHTML = '<div class="topic-mp-empty">搜索中...</div>';
        
        try {
            const response = await fetch(`/api/wechat/search?keyword=${encodeURIComponent(trimmedQuery)}&limit=20`, {
                credentials: 'include'
            });
            
            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || '搜索失败');
            }
            
            const data = await response.json();
            const mps = data.list || data.results || [];
            
            if (mps.length === 0) {
                resultsContainer.innerHTML = '<div class="topic-mp-empty">未找到匹配的公众号</div>';
                return;
            }
            
            resultsContainer.innerHTML = mps.map(mp => {
                const isSelected = selectedMps.some(s => s.fakeid === mp.fakeid);
                return `
                    <div class="topic-mp-item ${isSelected ? 'selected' : ''}" 
                         data-fakeid="${mp.fakeid}" 
                         data-nickname="${escapeHtml(mp.nickname)}"
                         onclick="TopicTracker.toggleMpSelection(this)">
                        ${mp.round_head_img ? `<img class="topic-mp-avatar" src="${mp.round_head_img}" alt="">` : '<div class="topic-mp-avatar-placeholder">📱</div>'}
                        <div class="topic-mp-info">
                            <div class="topic-mp-name">${escapeHtml(mp.nickname)}</div>
                            ${mp.signature ? `<div class="topic-mp-sig">${escapeHtml(mp.signature.substring(0, 50))}</div>` : ''}
                        </div>
                        <span class="topic-mp-check">${isSelected ? '✓' : ''}</span>
                    </div>
                `;
            }).join('');
        } catch (e) {
            console.error('Search MPs failed:', e);
            resultsContainer.innerHTML = `<div class="topic-mp-empty">搜索失败: ${escapeHtml(e.message)}</div>`;
        }
    }
    
    /**
     * Toggle MP selection
     */
    function toggleMpSelection(el) {
        const fakeid = el.dataset.fakeid;
        const nickname = el.dataset.nickname;
        
        const idx = selectedMps.findIndex(s => s.fakeid === fakeid);
        if (idx >= 0) {
            selectedMps.splice(idx, 1);
            el.classList.remove('selected');
            el.querySelector('.topic-mp-check').textContent = '';
        } else {
            selectedMps.push({ fakeid, nickname });
            el.classList.add('selected');
            el.querySelector('.topic-mp-check').textContent = '✓';
        }
        
        renderSelectedMps();
    }
    
    /**
     * Render selected MPs
     */
    function renderSelectedMps() {
        const container = document.getElementById('mpSelectedList');
        if (!container) return;
        
        if (selectedMps.length === 0) {
            container.innerHTML = '';
            return;
        }
        
        container.innerHTML = `
            <div class="topic-mp-selected-label">已选择 ${selectedMps.length} 个公众号：</div>
            <div class="topic-mp-selected-tags">
                ${selectedMps.map(mp => `
                    <span class="topic-mp-tag">
                        ${escapeHtml(mp.nickname)}
                        <button onclick="TopicTracker.removeMpSelection('${mp.fakeid}')">&times;</button>
                    </span>
                `).join('')}
            </div>
        `;
    }
    
    /**
     * Remove MP from selection
     */
    function removeMpSelection(fakeid) {
        selectedMps = selectedMps.filter(s => s.fakeid !== fakeid);
        renderSelectedMps();
        
        // Update search results UI
        const item = document.querySelector(`.topic-mp-item[data-fakeid="${fakeid}"]`);
        if (item) {
            item.classList.remove('selected');
            item.querySelector('.topic-mp-check').textContent = '';
        }
    }
    
    /**
     * Hide manual add form
     */
    function hideManualAddForm() {
        // Stop QR polling if active
        stopWechatQRPolling();
        
        const form = document.getElementById('manualAddForm');
        if (form) form.remove();
        
        const addSection = sourcesContainer.querySelector('.topic-sources-add');
        if (addSection) addSection.style.display = '';
    }
    
    /**
     * Switch manual add tab
     */
    function switchManualTab(tab) {
        document.querySelectorAll('.topic-manual-tab').forEach(t => t.classList.remove('active'));
        document.querySelector(`.topic-manual-tab[data-tab="${tab}"]`).classList.add('active');
        
        document.getElementById('manualTabRss').style.display = tab === 'rss' ? '' : 'none';
        document.getElementById('manualTabWechat').style.display = tab === 'wechat' ? '' : 'none';
        
        // Check wechat auth when switching to wechat tab
        if (tab === 'wechat') {
            checkWechatAuthAndRender();
        } else {
            // Stop QR polling when switching away
            stopWechatQRPolling();
        }
    }
    
    /**
     * Check WeChat auth status and render appropriate UI
     */
    async function checkWechatAuthAndRender() {
        const authArea = document.getElementById('topicWechatAuthArea');
        const searchArea = document.getElementById('topicWechatSearchArea');
        
        if (!authArea || !searchArea) return;
        
        // Show loading
        authArea.innerHTML = '<div class="topic-mp-loading">检查授权状态...</div>';
        authArea.style.display = '';
        searchArea.style.display = 'none';
        
        try {
            const response = await fetch('/api/wechat/auth/auto', { 
                method: 'POST',
                credentials: 'include'
            });
            const data = await response.json();
            
            wechatAuthState.checked = true;
            wechatAuthState.hasAuth = data.has_auth === true;
            
            if (wechatAuthState.hasAuth) {
                // Has auth, show search UI
                authArea.style.display = 'none';
                searchArea.style.display = '';
            } else {
                // No auth, show QR login UI
                renderWechatQRAuth();
            }
        } catch (e) {
            console.error('[TopicTracker] Check wechat auth failed:', e);
            wechatAuthState.hasAuth = false;
            renderWechatQRAuth();
        }
    }
    
    /**
     * Render WeChat QR auth UI
     */
    function renderWechatQRAuth() {
        const authArea = document.getElementById('topicWechatAuthArea');
        if (!authArea) return;
        
        authArea.innerHTML = `
            <div class="topic-wechat-auth">
                <div class="topic-wechat-qr-area" id="topicWechatQRArea">
                    <div class="topic-wechat-qr-loading">
                        <span class="topic-spinner"></span>
                        正在获取二维码...
                    </div>
                </div>
                <p class="topic-wechat-qr-hint">请使用微信扫描二维码授权</p>
                <p class="topic-wechat-qr-note">
                    ⚠️ 需要 <a href="https://mp.weixin.qq.com/cgi-bin/registermidpage?action=index&weblogo=1&lang=zh_CN" target="_blank">注册公众号或服务号</a> 才能搜索公众号
                </p>
            </div>
        `;
        authArea.style.display = '';
        
        // Start QR login
        startWechatQRLogin();
    }
    
    /**
     * Start WeChat QR login for topic tracker
     */
    async function startWechatQRLogin() {
        const qrArea = document.getElementById('topicWechatQRArea');
        if (!qrArea) return;
        
        qrArea.innerHTML = `
            <div class="topic-wechat-qr-loading">
                <span class="topic-spinner"></span>
                正在获取二维码...
            </div>
        `;
        
        try {
            const startResp = await fetch('/api/wechat/auth/qr/start', { 
                method: 'POST',
                credentials: 'include'
            });
            const startData = await startResp.json();
            
            if (!startData.ok) throw new Error(startData.error || '创建会话失败');
            
            wechatAuthState.sessionId = startData.session_id;
            const qrUrl = `/api/wechat/auth/qr/image?t=${Date.now()}`;
            
            qrArea.innerHTML = `
                <img src="${qrUrl}" alt="登录二维码" class="topic-wechat-qr-image" 
                     onerror="this.parentElement.innerHTML='<p class=topic-wechat-qr-error>二维码加载失败</p>'">
                <p id="topicWechatQRStatus" class="topic-wechat-qr-status">等待扫码...</p>
                <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">🔄 刷新二维码</button>
            `;
            
            wechatAuthState.qrPolling = true;
            pollWechatQRStatus();
            
        } catch (e) {
            console.error('[TopicTracker] Start QR error:', e);
            qrArea.innerHTML = `
                <p class="topic-wechat-qr-error">获取二维码失败: ${escapeHtml(e.message)}</p>
                <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">重试</button>
            `;
        }
    }
    
    /**
     * Poll WeChat QR status
     */
    async function pollWechatQRStatus() {
        if (!wechatAuthState.qrPolling) return;
        
        try {
            const resp = await fetch('/api/wechat/auth/qr/status', { credentials: 'include' });
            const data = await resp.json();
            
            const statusEl = document.getElementById('topicWechatQRStatus');
            if (!statusEl) {
                wechatAuthState.qrPolling = false;
                return;
            }
            
            if (data.status === 'waiting') {
                statusEl.textContent = '等待扫码...';
                statusEl.className = 'topic-wechat-qr-status';
            } else if (data.status === 'scanned') {
                statusEl.textContent = '已扫码，请在手机上确认登录';
                statusEl.className = 'topic-wechat-qr-status scanned';
            } else if (data.status === 'confirmed') {
                statusEl.textContent = '已确认，正在完成登录...';
                statusEl.className = 'topic-wechat-qr-status confirmed';
                wechatAuthState.qrPolling = false;
                await completeWechatQRLogin();
                return;
            } else if (data.status === 'expired' || data.need_refresh) {
                statusEl.textContent = '二维码已过期';
                statusEl.className = 'topic-wechat-qr-status expired';
                wechatAuthState.qrPolling = false;
                
                const qrArea = document.getElementById('topicWechatQRArea');
                if (qrArea) {
                    qrArea.innerHTML = `
                        <p class="topic-wechat-qr-error">二维码已过期</p>
                        <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">重新获取</button>
                    `;
                }
                return;
            } else if (data.status === 'error') {
                statusEl.textContent = data.message || '出错了';
                statusEl.className = 'topic-wechat-qr-status error';
            }
            
            if (wechatAuthState.qrPolling) {
                wechatAuthState.pollTimer = setTimeout(pollWechatQRStatus, 2000);
            }
            
        } catch (e) {
            console.error('[TopicTracker] Poll QR error:', e);
            if (wechatAuthState.qrPolling) {
                wechatAuthState.pollTimer = setTimeout(pollWechatQRStatus, 3000);
            }
        }
    }
    
    /**
     * Complete WeChat QR login
     */
    async function completeWechatQRLogin() {
        const qrArea = document.getElementById('topicWechatQRArea');
        
        try {
            const resp = await fetch('/api/wechat/auth/qr/complete-and-share', { 
                method: 'POST',
                credentials: 'include'
            });
            const data = await resp.json();
            
            if (!data.ok) throw new Error(data.error || '登录失败');
            
            if (qrArea) {
                qrArea.innerHTML = `
                    <p class="topic-wechat-qr-success">✓ 授权成功！</p>
                `;
            }
            
            // Update state and show search UI
            setTimeout(() => {
                wechatAuthState.hasAuth = true;
                const authArea = document.getElementById('topicWechatAuthArea');
                const searchArea = document.getElementById('topicWechatSearchArea');
                if (authArea) authArea.style.display = 'none';
                if (searchArea) searchArea.style.display = '';
            }, 1000);
            
        } catch (e) {
            console.error('[TopicTracker] Complete QR error:', e);
            if (qrArea) {
                qrArea.innerHTML = `
                    <p class="topic-wechat-qr-error">登录失败: ${escapeHtml(e.message)}</p>
                    <button class="topic-wechat-qr-refresh" onclick="TopicTracker.refreshWechatQR()">重试</button>
                `;
            }
        }
    }
    
    /**
     * Stop WeChat QR polling
     */
    function stopWechatQRPolling() {
        wechatAuthState.qrPolling = false;
        if (wechatAuthState.pollTimer) {
            clearTimeout(wechatAuthState.pollTimer);
            wechatAuthState.pollTimer = null;
        }
    }
    
    /**
     * Refresh WeChat QR code
     */
    function refreshWechatQR() {
        stopWechatQRPolling();
        startWechatQRLogin();
    }
    
    /**
     * Add manual source
     */
    async function addManualSource() {
        const activeTab = document.querySelector('.topic-manual-tab.active').dataset.tab;
        
        if (activeTab === 'rss') {
            const name = document.getElementById('manualRssName').value.trim();
            const url = document.getElementById('manualRssUrl').value.trim();
            if (!url) {
                alert('请输入 RSS URL');
                return;
            }
            
            if (!generatedData.recommended_sources) {
                generatedData.recommended_sources = [];
            }
            generatedData.recommended_sources.push({ type: 'rss', name: name || url, url: url });
        } else {
            // Add selected MPs
            if (selectedMps.length === 0) {
                alert('请选择至少一个公众号');
                return;
            }
            
            if (!generatedData.recommended_sources) {
                generatedData.recommended_sources = [];
            }
            
            for (const mp of selectedMps) {
                generatedData.recommended_sources.push({
                    type: 'wechat_mp',
                    name: mp.nickname,
                    wechat_id: mp.fakeid  // Use fakeid as identifier
                });
            }
            
            // Clear selection
            selectedMps = [];
        }
        
        // Hide the form
        hideManualAddForm();
        
        // Re-render sources list (preserve existing sources in edit mode)
        if (currentEditTopic && currentEditTopic.rss_sources) {
            await renderSourcesForEdit(currentEditTopic.rss_sources);
        } else {
            renderSources();
        }
        
        // Show sources group if hidden
        document.getElementById('topicSourcesGroup').style.display = 'block';
    }
    
    /**
     * Regenerate recommended sources for current topic
     */
    async function regenerateSources() {
        const topicName = topicNameInput.value.trim();
        if (!topicName) {
            alert('请先输入主题名称');
            return;
        }
        
        const btn = document.querySelector('.topic-sources-add .topic-ai-btn');
        
        // 显示进度提示
        const progressSteps = [
            '🔍 正在搜索数据源...',
            '📡 正在验证 RSS 源...',
            '✅ 正在验证公众号...'
        ];
        let stepIndex = 0;
        
        const updateProgress = () => {
            if (btn) {
                btn.innerHTML = `<span class="topic-spinner"></span> ${progressSteps[stepIndex]}`;
            }
        };
        
        if (btn) {
            btn.disabled = true;
            updateProgress();
        }
        
        // 每2秒切换进度提示
        const progressInterval = setInterval(() => {
            stepIndex = Math.min(stepIndex + 1, progressSteps.length - 1);
            updateProgress();
        }, 2000);
        
        try {
            const response = await fetch('/api/topics/generate-keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ topic_name: topicName })
            });
            
            const data = await response.json();
            
            if (data.ok && data.recommended_sources && data.recommended_sources.length > 0) {
                // 增量添加：合并新推荐的源，去重
                const existingSources = generatedData.recommended_sources || [];
                const existingKeys = new Set(existingSources.map(s => 
                    s.type === 'rss' ? s.url : s.wechat_id
                ));
                
                let addedCount = 0;
                for (const newSource of data.recommended_sources) {
                    const key = newSource.type === 'rss' ? newSource.url : newSource.wechat_id;
                    if (!existingKeys.has(key)) {
                        existingSources.push(newSource);
                        existingKeys.add(key);
                        addedCount++;
                    }
                }
                
                generatedData.recommended_sources = existingSources;
                document.getElementById('topicSourcesGroup').style.display = 'block';
                
                // 编辑模式下使用 renderSourcesForEdit，新建模式用 renderSources
                if (currentEditTopic) {
                    await renderSourcesForEdit(currentEditTopic.rss_sources || []);
                } else {
                    renderSources();
                }
                
                if (addedCount > 0) {
                    console.log(`[TopicTracker] 新增 ${addedCount} 个推荐数据源`);
                } else {
                    alert('AI 推荐的数据源已全部添加过');
                }
            } else {
                alert('未找到新的推荐数据源');
            }
        } catch (e) {
            console.error('Regenerate sources failed:', e);
            alert('搜索数据源失败，请重试');
        } finally {
            clearInterval(progressInterval);
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🔄 AI 新增数据源';
            }
        }
    }

    /**
     * Delete a topic
     */
    async function deleteTopic(topicId) {
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        
        const confirmed = await _confirmDialog(`确定要删除主题「${topic.name}」吗？删除后不可恢复。`);
        if (!confirmed) return;
        
        try {
            const response = await fetch(`/api/topics/${topicId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (data.ok) {
                // 从 DOM 中移除主题 tab 和对应的内容面板
                const categoryId = 'topic-' + topicId;
                
                // 移除 tab
                const tab = document.querySelector(`.sub-tab[data-category="${categoryId}"]`);
                if (tab) {
                    tab.remove();
                    console.log(`[TopicTracker] Removed tab for topic ${topicId}`);
                }
                
                // 移除 tab-pane
                const pane = document.getElementById(`tab-${categoryId}`);
                if (pane) {
                    pane.remove();
                    console.log(`[TopicTracker] Removed pane for topic ${topicId}`);
                }
                
                // 清除该主题的加载状态
                resetTopicState(topicId);
                
                // 清除 localStorage 中保存的 tab（避免刷新后还指向已删除的主题）
                try {
                    const savedTab = localStorage.getItem('tr_active_tab');
                    if (savedTab === categoryId) {
                        localStorage.removeItem('tr_active_tab');
                        console.log(`[TopicTracker] Cleared saved tab for deleted topic ${topicId}`);
                    }
                } catch (e) {}
                
                // 切换到我的关注 tab
                tabs.switchTab('my-tags');
                
                // 更新本地主题列表
                topics = topics.filter(t => t.id !== topicId);
                
                // 显示成功提示
                if (TR.toast?.show) {
                    TR.toast.show(`已删除主题「${topic.name}」`, { variant: 'success' });
                }
            } else {
                alert(data.error || '删除失败');
            }
        } catch (e) {
            console.error('Delete topic failed:', e);
            alert('删除失败，请重试');
        }
    }

    // escapeHtml is imported from core.js

    function formatDate(timestamp) {
        if (!timestamp) return '';
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diffMs = now - date;
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);
        
        if (diffMins < 1) return '刚刚';
        if (diffMins < 60) return diffMins + '分钟前';
        if (diffHours < 24) return diffHours + '小时前';
        if (diffDays < 7) return diffDays + '天前';
        
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return month + '-' + day;
    }

    // Export public API
    window.TopicTracker = {
        init,
        openModal,
        closeModal,
        generateKeywords,
        addKeyword,
        removeKeyword,
        selectAllSources,
        deselectAllSources,
        submitTopic,
        refreshTopic,
        editTopic,
        deleteTopic,
        loadTopics,
        regenerateSources,
        showManualAddForm,
        hideManualAddForm,
        switchManualTab,
        addManualSource,
        searchWechatMps,
        doMpSearch,
        toggleMpSelection,
        removeMpSelection,
        refreshWechatQR,
        retryLoadTopic,
        loadTopicNews,
        closeQrcodeModal,
        retryAfterAuth,
        refreshQrcodeModal
    };

    // Initialize when DOM is ready
    ready(init);
