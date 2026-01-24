/**
 * Subscribe Sidebar Module - 快速订阅侧边栏
 * 允许用户在不离开当前页面的情况下快速管理订阅
 */

import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';
import { preferences } from './preferences.js';

// ============ 常量 ============
const SIDEBAR_WIDTH_KEY = 'subscribe_sidebar_width';
const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 800;
const SIDEBAR_DEFAULT_WIDTH = 420;

// ============ 状态 ============
let sidebarOpen = false;
let activeTab = 'recommendations';

// Tab 状态
const tabStates = {
    recommendations: { loading: false, data: [], error: null, loaded: false },
    tags: { loading: false, allTags: [], filteredTags: [], searchQuery: '', categoryFilter: 'all', followedIds: new Set(), loaded: false },
    sources: { loading: false, allSources: [], filteredSources: [], searchQuery: '', typeFilter: 'all', subscribedIds: new Set(), loaded: false, displayCount: 100, totalCount: 0 },
    keywords: { loading: false, keywords: [], inputValue: '', loaded: false },
    wechat: { loading: false, authStatus: null, subscriptions: [], searchQuery: '', searchResults: [], loaded: false },
};

// ============ 登录检查 ============
function requireLogin() {
    const user = authState.getUser();
    if (!user) {
        openLoginModal();
        return false;
    }
    return true;
}

// ============ 工具函数 ============
function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function showToast(message) {
    if (window.showToast) {
        window.showToast(message);
    } else {
        console.log('[SubscribeSidebar]', message);
    }
}

function debounce(fn, delay) {
    let timer = null;
    return function(...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}


// ============ 侧边栏 DOM 创建 ============
function ensureSubscribeSidebarExists() {
    if (document.getElementById('subscribeSidebar')) return;
    
    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.id = 'subscribeSidebarBackdrop';
    backdrop.className = 'subscribe-sidebar-backdrop';
    document.body.appendChild(backdrop);
    
    // Create sidebar
    const html = `
        <div id="subscribeSidebar" class="subscribe-sidebar">
            <div class="subscribe-resize-handle" id="subscribeResizeHandle"></div>
            <div class="subscribe-sidebar-header">
                <span class="subscribe-sidebar-title">⚙️ 快速订阅</span>
                <div class="subscribe-sidebar-actions">
                    <button class="subscribe-close-btn" title="关闭">✕</button>
                </div>
            </div>
            <div class="subscribe-tabs" id="subscribeTabs">
                <button class="subscribe-tab active" data-tab="recommendations">✨推荐</button>
                <button class="subscribe-tab" data-tab="tags">🏷️标签</button>
                <button class="subscribe-tab" data-tab="sources">📡订阅源</button>
                <button class="subscribe-tab" data-tab="keywords">🔑关键词</button>
                <button class="subscribe-tab" data-tab="wechat">💬公众号</button>
            </div>
            <div class="subscribe-sidebar-body" id="subscribeSidebarBody">
                <div class="subscribe-loading">加载中...</div>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
    
    // Restore saved width
    const savedWidth = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    if (savedWidth) {
        const sidebar = document.getElementById('subscribeSidebar');
        sidebar.style.width = savedWidth + 'px';
    }
    
    // Bind events
    const sidebar = document.getElementById('subscribeSidebar');
    const closeBtn = sidebar.querySelector('.subscribe-close-btn');
    
    backdrop.addEventListener('click', closeSubscribeSidebar);
    closeBtn.addEventListener('click', closeSubscribeSidebar);
    
    // Tab switching
    const tabs = document.getElementById('subscribeTabs');
    tabs.addEventListener('click', (e) => {
        const tabBtn = e.target.closest('.subscribe-tab');
        if (!tabBtn) return;
        const tab = tabBtn.dataset.tab;
        if (tab) switchTab(tab);
    });
    
    // ESC key to close
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && sidebarOpen) {
            closeSubscribeSidebar();
        }
    });
    
    // Setup resize
    setupSubscribeResize();
}

// ============ 宽度调整 ============
function setupSubscribeResize() {
    const sidebar = document.getElementById('subscribeSidebar');
    const handle = document.getElementById('subscribeResizeHandle');
    if (!sidebar || !handle) return;
    
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    
    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = sidebar.offsetWidth;
        sidebar.classList.add('resizing');
        handle.classList.add('active');
        e.preventDefault();
    });
    
    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const delta = startX - e.clientX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(SIDEBAR_MIN_WIDTH, Math.min(SIDEBAR_MAX_WIDTH, newWidth));
        sidebar.style.width = newWidth + 'px';
    });
    
    document.addEventListener('mouseup', () => {
        if (!isResizing) return;
        isResizing = false;
        sidebar.classList.remove('resizing');
        handle.classList.remove('active');
        // Save to localStorage
        localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebar.offsetWidth);
        preferences.saveSidebarWidths({ subscribe_width: sidebar.offsetWidth });
    });
}

// ============ 打开/关闭侧边栏 ============
function openSubscribeSidebar() {
    if (!requireLogin()) return;
    
    ensureSubscribeSidebarExists();
    const sidebar = document.getElementById('subscribeSidebar');
    const backdrop = document.getElementById('subscribeSidebarBackdrop');
    
    sidebar.classList.add('open');
    backdrop.classList.add('show');
    sidebarOpen = true;
    
    // Load active tab content
    loadTabContent(activeTab);
}

function closeSubscribeSidebar() {
    const sidebar = document.getElementById('subscribeSidebar');
    const backdrop = document.getElementById('subscribeSidebarBackdrop');
    
    if (sidebar) {
        sidebar.classList.remove('open');
    }
    if (backdrop) {
        backdrop.classList.remove('show');
    }
    sidebarOpen = false;
}

function isSubscribeSidebarOpen() {
    return sidebarOpen;
}


// ============ Tab 切换 ============
function switchTab(tab) {
    if (activeTab === tab) return;
    
    activeTab = tab;
    
    // Update tab buttons
    document.querySelectorAll('.subscribe-tab').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    // Load tab content
    loadTabContent(tab);
}

async function loadTabContent(tab) {
    const body = document.getElementById('subscribeSidebarBody');
    if (!body) return;
    
    const state = tabStates[tab];
    
    // Show loading if not loaded yet
    if (!state.loaded) {
        body.innerHTML = '<div class="subscribe-loading">加载中...</div>';
    }
    
    try {
        switch (tab) {
            case 'recommendations':
                await loadRecommendationsTab();
                break;
            case 'tags':
                await loadTagsTab();
                break;
            case 'sources':
                await loadSourcesTab();
                break;
            case 'keywords':
                await loadKeywordsTab();
                break;
            case 'wechat':
                await loadWechatTab();
                break;
        }
    } catch (e) {
        console.error('[SubscribeSidebar] Load tab error:', e);
        body.innerHTML = `<div class="subscribe-error">加载失败: ${escapeHtml(e.message)}</div>`;
    }
}

// ============ 为你推荐 Tab ============
async function loadRecommendationsTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.recommendations;
    
    if (!state.loaded) {
        state.loading = true;
        try {
            const resp = await fetch('/api/user/preferences/recommended-tags');
            if (!resp.ok) throw new Error('获取推荐失败');
            const data = await resp.json();
            state.data = data.recommendations || [];
            state.loaded = true;
        } catch (e) {
            state.error = e.message;
            throw e;
        } finally {
            state.loading = false;
        }
    }
    
    renderRecommendationsTab();
}

function renderRecommendationsTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.recommendations;
    
    if (state.data.length === 0) {
        body.innerHTML = '<div class="subscribe-empty">暂无推荐</div>';
        return;
    }
    
    let html = '<div class="subscribe-list">';
    for (const item of state.data) {
        const isFollowed = tabStates.tags.followedIds.has(item.id);
        html += renderTagItem(item, isFollowed);
    }
    html += '</div>';
    
    body.innerHTML = html;
    bindTagItemEvents(body);
}

// ============ 标签 Tab ============
async function loadTagsTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.tags;
    
    if (!state.loaded) {
        state.loading = true;
        try {
            const [tagsResp, settingsResp] = await Promise.all([
                fetch('/api/admin/tags/public/all'),
                fetch('/api/user/preferences/tag-settings')
            ]);
            
            if (!tagsResp.ok) throw new Error('获取标签失败');
            const tagsData = await tagsResp.json();
            state.allTags = [...(tagsData.categories || []), ...(tagsData.topics || []), ...(tagsData.attributes || [])];
            
            if (settingsResp.ok) {
                const settingsData = await settingsResp.json();
                state.followedIds = new Set((settingsData.followed || []).map(f => f.tag_id));
            }
            
            state.filteredTags = [...state.allTags];
            state.loaded = true;
        } catch (e) {
            throw e;
        } finally {
            state.loading = false;
        }
    }
    
    renderTagsTab();
}

function renderTagsTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.tags;
    
    let html = `
        <div class="subscribe-search-box">
            <input type="text" class="subscribe-search-input" id="tagSearchInput" 
                   placeholder="搜索标签..." value="${escapeHtml(state.searchQuery)}">
        </div>
        <div class="subscribe-filters" id="tagFilters">
            <button class="subscribe-filter-btn ${state.categoryFilter === 'all' ? 'active' : ''}" data-filter="all">全部</button>
            <button class="subscribe-filter-btn ${state.categoryFilter === 'category' ? 'active' : ''}" data-filter="category">大类</button>
            <button class="subscribe-filter-btn ${state.categoryFilter === 'topic' ? 'active' : ''}" data-filter="topic">主题</button>
            <button class="subscribe-filter-btn ${state.categoryFilter === 'attribute' ? 'active' : ''}" data-filter="attribute">属性</button>
        </div>
    `;
    
    // Filter tags
    let filtered = state.allTags;
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(t => t.name.toLowerCase().includes(q));
    }
    if (state.categoryFilter !== 'all') {
        filtered = filtered.filter(t => t.type === state.categoryFilter);
    }
    
    if (filtered.length === 0) {
        html += '<div class="subscribe-empty">没有找到匹配的标签</div>';
    } else {
        html += '<div class="subscribe-list">';
        for (const tag of filtered) {
            const isFollowed = state.followedIds.has(tag.id);
            html += renderTagItem(tag, isFollowed);
        }
        html += '</div>';
    }
    
    body.innerHTML = html;
    
    // Bind search
    const searchInput = document.getElementById('tagSearchInput');
    searchInput?.addEventListener('input', debounce((e) => {
        state.searchQuery = e.target.value;
        renderTagsTab();
    }, 300));
    
    // Bind filters
    const filters = document.getElementById('tagFilters');
    filters?.addEventListener('click', (e) => {
        const btn = e.target.closest('.subscribe-filter-btn');
        if (!btn) return;
        state.categoryFilter = btn.dataset.filter;
        renderTagsTab();
    });
    
    bindTagItemEvents(body);
}

function renderTagItem(tag, isFollowed) {
    return `
        <div class="subscribe-item" data-id="${escapeHtml(tag.id)}" data-type="tag">
            <span class="subscribe-item-icon">${tag.icon || '🏷️'}</span>
            <div class="subscribe-item-info">
                <span class="subscribe-item-name">${escapeHtml(tag.name)}</span>
                ${tag.description ? `<span class="subscribe-item-desc">${escapeHtml(tag.description)}</span>` : ''}
            </div>
            <button class="subscribe-item-btn ${isFollowed ? 'followed' : ''}" data-action="${isFollowed ? 'unfollow' : 'follow'}">
                ${isFollowed ? '已关注' : '+关注'}
            </button>
        </div>
    `;
}

function bindTagItemEvents(container) {
    container.querySelectorAll('.subscribe-item[data-type="tag"]').forEach(item => {
        const btn = item.querySelector('.subscribe-item-btn');
        btn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const tagId = item.dataset.id;
            const action = btn.dataset.action;
            await toggleTagFollow(tagId, action === 'follow');
        });
    });
}

async function toggleTagFollow(tagId, follow) {
    const state = tabStates.tags;
    const oldFollowed = state.followedIds.has(tagId);
    
    // Optimistic update
    if (follow) {
        state.followedIds.add(tagId);
    } else {
        state.followedIds.delete(tagId);
    }
    
    // Update UI
    if (activeTab === 'tags') renderTagsTab();
    if (activeTab === 'recommendations') renderRecommendationsTab();
    
    try {
        const resp = await fetch('/api/user/preferences/tag-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId, preference: follow ? 'follow' : 'neutral' })
        });
        
        if (!resp.ok) throw new Error('操作失败');
        showToast(follow ? '已关注' : '已取消关注');
        
        // Clear my-tags cache
        try { localStorage.removeItem('hotnews_my_tags_cache'); } catch {}
    } catch (e) {
        // Rollback
        if (oldFollowed) {
            state.followedIds.add(tagId);
        } else {
            state.followedIds.delete(tagId);
        }
        if (activeTab === 'tags') renderTagsTab();
        if (activeTab === 'recommendations') renderRecommendationsTab();
        showToast('操作失败，请重试');
    }
}


// ============ 订阅源 Tab ============
async function loadSourcesTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.sources;
    
    if (!state.loaded) {
        state.loading = true;
        try {
            // Load all sources and user subscriptions
            const [sourcesResp, subsResp] = await Promise.all([
                fetch('/api/sources/all'),
                fetch('/api/sources/subscriptions')
            ]);
            
            if (sourcesResp.ok) {
                const data = await sourcesResp.json();
                state.allSources = data.sources || [];
                state.filteredSources = [...state.allSources];
            }
            
            if (subsResp.ok) {
                const subsData = await subsResp.json();
                state.subscribedIds = new Set((subsData.subscriptions || []).map(s => s.id));
            }
            
            state.loaded = true;
        } catch (e) {
            console.error('[SubscribeSidebar] Load sources error:', e);
            throw e;
        } finally {
            state.loading = false;
        }
    }
    
    renderSourcesTab();
}

function renderSourcesTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.sources;
    
    // Count sources by type
    const rssCount = state.allSources.filter(s => s.type === 'rss').length;
    const customCount = state.allSources.filter(s => s.type === 'custom').length;
    
    let html = `
        <div class="subscribe-search-box">
            <input type="text" class="subscribe-search-input" id="sourceSearchInput" 
                   placeholder="搜索订阅源/添加新的请联系管理员..." value="${escapeHtml(state.searchQuery)}">
        </div>
        <div class="subscribe-filters" id="sourceFilters">
            <button class="subscribe-filter-btn ${state.typeFilter === 'all' ? 'active' : ''}" data-filter="all">全部 (${state.allSources.length})</button>
            <button class="subscribe-filter-btn ${state.typeFilter === 'rss' ? 'active' : ''}" data-filter="rss">📰 RSS (${rssCount})</button>
            <button class="subscribe-filter-btn ${state.typeFilter === 'custom' ? 'active' : ''}" data-filter="custom">🔗 自定义 (${customCount})</button>
        </div>
    `;
    
    // Filter sources
    let filtered = state.allSources;
    
    // Apply type filter
    if (state.typeFilter !== 'all') {
        filtered = filtered.filter(s => s.type === state.typeFilter);
    }
    
    // Apply search filter
    if (state.searchQuery) {
        const q = state.searchQuery.toLowerCase();
        filtered = filtered.filter(s => 
            (s.name && s.name.toLowerCase().includes(q)) ||
            (s.url && s.url.toLowerCase().includes(q))
        );
    }
    
    const totalFiltered = filtered.length;
    const displayCount = state.searchQuery ? totalFiltered : Math.min(state.displayCount, totalFiltered);
    const displaySources = filtered.slice(0, displayCount);
    const hasMore = displayCount < totalFiltered && !state.searchQuery;
    
    if (filtered.length === 0) {
        html += '<div class="subscribe-empty">没有找到订阅源</div>';
    } else {
        html += '<div class="subscribe-list subscribe-sources-list">';
        for (const source of displaySources) {
            const isSubscribed = state.subscribedIds.has(source.id);
            html += renderSourceItem(source, isSubscribed);
        }
        html += '</div>';
        
        // Show "load more" button if there are more sources
        if (hasMore) {
            const remaining = totalFiltered - displayCount;
            html += `
                <div class="subscribe-load-more">
                    <button class="subscribe-load-more-btn" id="loadMoreSourcesBtn">
                        加载更多 (还有 ${remaining} 个)
                    </button>
                </div>
            `;
        }
    }
    
    body.innerHTML = html;
    
    // Bind search
    const searchInput = document.getElementById('sourceSearchInput');
    searchInput?.addEventListener('input', debounce((e) => {
        state.searchQuery = e.target.value;
        state.displayCount = 100; // Reset display count on search
        renderSourcesTab();
    }, 300));
    
    // Bind type filters
    const filters = document.getElementById('sourceFilters');
    filters?.addEventListener('click', (e) => {
        const btn = e.target.closest('.subscribe-filter-btn');
        if (!btn) return;
        state.typeFilter = btn.dataset.filter;
        state.displayCount = 100; // Reset display count on filter change
        renderSourcesTab();
    });
    
    // Bind load more button
    const loadMoreBtn = document.getElementById('loadMoreSourcesBtn');
    loadMoreBtn?.addEventListener('click', () => {
        state.displayCount += 100;
        renderSourcesTab();
    });
    
    bindSourceItemEvents(body);
}

function renderSourceItem(source, isSubscribed) {
    let domain = '';
    try {
        domain = source.url ? new URL(source.url).hostname : '';
    } catch { domain = ''; }
    
    const icon = source.type === 'custom' ? '🔗' : '📰';
    const typeLabel = source.type === 'custom' ? '自定义' : (source.category || 'RSS');
    const sourceIdEscaped = escapeHtml(source.id);
    const sourceName = escapeHtml(source.name || source.id);
    
    return `
        <div class="subscribe-source-card" data-id="${sourceIdEscaped}" data-type="source" data-source-type="${escapeHtml(source.type)}">
            <div class="subscribe-source-header" data-source-id="${sourceIdEscaped}">
                <span class="subscribe-source-icon">${icon}</span>
                <div class="subscribe-source-info">
                    <span class="subscribe-source-name">${sourceName}</span>
                    <span class="subscribe-source-meta">
                        <span>${escapeHtml(domain || typeLabel)}</span>
                        <span class="subscribe-source-expand">▼</span>
                    </span>
                </div>
                <button class="subscribe-item-btn ${isSubscribed ? 'followed' : ''}" data-action="${isSubscribed ? 'unsubscribe' : 'subscribe'}">
                    ${isSubscribed ? '已订阅' : '+订阅'}
                </button>
            </div>
            <div class="subscribe-source-preview" id="sourcePreview-${sourceIdEscaped}">
                <div class="subscribe-source-preview-inner">
                    <div class="subscribe-source-preview-hint">点击展开预览最新内容...</div>
                </div>
            </div>
        </div>
    `;
}

function bindSourceItemEvents(container) {
    // Bind subscribe/unsubscribe buttons
    container.querySelectorAll('.subscribe-source-card').forEach(card => {
        const btn = card.querySelector('.subscribe-item-btn');
        btn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const sourceId = card.dataset.id;
            const sourceType = card.dataset.sourceType || 'rss';
            const action = btn.dataset.action;
            await toggleSourceSubscribe(sourceId, sourceType, action === 'subscribe');
        });
        
        // Bind header click for preview toggle
        const header = card.querySelector('.subscribe-source-header');
        if (header) {
            header.addEventListener('click', (e) => {
                // Don't toggle if clicking the button
                if (e.target.closest('.subscribe-item-btn')) return;
                const sourceId = card.dataset.id;
                toggleSourcePreview(sourceId);
            });
        }
    });
}

async function toggleSourcePreview(sourceId) {
    const card = document.querySelector(`.subscribe-source-card[data-id="${CSS.escape(sourceId)}"]`);
    const preview = document.getElementById(`sourcePreview-${sourceId}`);
    
    if (!card || !preview) return;
    
    const isExpanded = card.classList.contains('expanded');
    
    if (isExpanded) {
        card.classList.remove('expanded');
    } else {
        card.classList.add('expanded');
        
        // Check if already loaded
        if (preview.dataset.loaded === 'true') return;
        
        const inner = preview.querySelector('.subscribe-source-preview-inner');
        if (inner) inner.innerHTML = '<div class="subscribe-source-preview-hint">加载中...</div>';
        
        try {
            const resp = await fetch(`/api/sources/preview/${encodeURIComponent(sourceId)}?limit=10`);
            if (!resp.ok) throw new Error('Failed to load');
            
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Failed');
            
            if (data.entries && data.entries.length > 0) {
                const listHtml = data.entries.map(entry => {
                    const dateStr = entry.published_at ? new Date(entry.published_at * 1000).toLocaleDateString('zh-CN') : '';
                    return `
                        <li class="subscribe-source-preview-item">
                            <a href="${escapeHtml(entry.url)}" target="_blank" rel="noopener">${escapeHtml(entry.title)}</a>
                            ${dateStr ? `<span class="subscribe-source-preview-date">${dateStr}</span>` : ''}
                        </li>
                    `;
                }).join('');
                if (inner) inner.innerHTML = `<ul class="subscribe-source-preview-list">${listHtml}</ul>`;
            } else {
                if (inner) inner.innerHTML = '<div class="subscribe-source-preview-hint">暂无内容</div>';
            }
            preview.dataset.loaded = 'true';
        } catch (e) {
            if (inner) inner.innerHTML = '<div class="subscribe-source-preview-hint">加载失败</div>';
        }
    }
}

async function toggleSourceSubscribe(sourceId, sourceType, subscribe) {
    const state = tabStates.sources;
    const oldSubscribed = state.subscribedIds.has(sourceId);
    
    // Optimistic update
    if (subscribe) {
        state.subscribedIds.add(sourceId);
    } else {
        state.subscribedIds.delete(sourceId);
    }
    renderSourcesTab();
    
    try {
        const endpoint = subscribe ? '/api/sources/subscribe' : '/api/sources/unsubscribe';
        const resp = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_type: sourceType, source_id: sourceId })
        });
        
        if (!resp.ok) throw new Error('操作失败');
        showToast(subscribe ? '已订阅' : '已取消订阅');
    } catch (e) {
        // Rollback
        if (oldSubscribed) {
            state.subscribedIds.add(sourceId);
        } else {
            state.subscribedIds.delete(sourceId);
        }
        renderSourcesTab();
        showToast('操作失败，请重试');
    }
}

// ============ 关键词 Tab ============
async function loadKeywordsTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.keywords;
    
    if (!state.loaded) {
        state.loading = true;
        try {
            const resp = await fetch('/api/user/keywords');
            if (resp.ok) {
                const data = await resp.json();
                state.keywords = data.keywords || [];
            }
            state.loaded = true;
        } catch (e) {
            throw e;
        } finally {
            state.loading = false;
        }
    }
    
    renderKeywordsTab();
}

function renderKeywordsTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.keywords;
    
    let html = `
        <div class="subscribe-add-box">
            <input type="text" class="subscribe-add-input" id="keywordInput" 
                   placeholder="输入关键词（至少2个字符）..." value="${escapeHtml(state.inputValue)}">
            <button class="subscribe-add-btn" id="addKeywordBtn">添加</button>
        </div>
    `;
    
    if (state.keywords.length === 0) {
        html += `
            <div class="subscribe-empty-state">
                <div class="subscribe-empty-icon">🔑</div>
                <div class="subscribe-empty-title">输入关键词，如：DeepSeek、量子计算、马斯克…</div>
                <div class="subscribe-empty-desc">添加关键词后，系统会自动匹配包含这些词的新闻推送给你</div>
            </div>
        `;
    } else {
        html += '<div class="subscribe-keyword-list">';
        for (const kw of state.keywords) {
            const typeLabel = kw.keyword_type === 'fuzzy' ? '模糊' : '精确';
            const matchInfo = kw.match_count > 0 ? `匹配 ${kw.match_count} 次` : '暂无匹配';
            html += `
                <div class="subscribe-keyword-item" data-id="${kw.id}" data-type="keyword">
                    <div class="subscribe-keyword-icon">🔑</div>
                    <div class="subscribe-keyword-info">
                        <div class="subscribe-keyword-text">${escapeHtml(kw.keyword)}</div>
                        <div class="subscribe-keyword-meta">
                            <span class="subscribe-keyword-badge">${typeLabel}</span>
                            <span>${matchInfo}</span>
                        </div>
                    </div>
                    <button class="subscribe-keyword-delete" data-action="delete">删除</button>
                </div>
            `;
        }
        html += '</div>';
    }
    
    body.innerHTML = html;
    
    // Bind add
    const input = document.getElementById('keywordInput');
    const addBtn = document.getElementById('addKeywordBtn');
    
    const doAdd = async () => {
        const keyword = input.value.trim();
        if (!keyword || keyword.length < 2) {
            showToast('关键词至少需要2个字符');
            return;
        }
        await addKeyword(keyword);
        input.value = '';
        state.inputValue = '';
    };
    
    addBtn?.addEventListener('click', doAdd);
    input?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doAdd();
    });
    input?.addEventListener('input', (e) => {
        state.inputValue = e.target.value;
    });
    
    // Bind delete
    body.querySelectorAll('.subscribe-keyword-item').forEach(item => {
        const btn = item.querySelector('.subscribe-keyword-delete');
        btn?.addEventListener('click', async () => {
            const id = parseInt(item.dataset.id);
            await deleteKeyword(id);
        });
    });
}

async function addKeyword(keyword) {
    const state = tabStates.keywords;
    
    try {
        const resp = await fetch('/api/user/keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ keyword, keyword_type: 'exact', priority: 0 })
        });
        
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || '添加失败');
        }
        
        const data = await resp.json();
        state.keywords.push({ id: data.keyword_id, keyword });
        renderKeywordsTab();
        showToast('关键词已添加');
    } catch (e) {
        showToast('添加失败: ' + e.message);
    }
}

async function deleteKeyword(id) {
    const state = tabStates.keywords;
    const oldKeywords = [...state.keywords];
    
    // Optimistic update
    state.keywords = state.keywords.filter(k => k.id !== id);
    renderKeywordsTab();
    
    try {
        const resp = await fetch(`/api/user/keywords/${id}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('删除失败');
        showToast('关键词已删除');
    } catch (e) {
        state.keywords = oldKeywords;
        renderKeywordsTab();
        showToast('删除失败');
    }
}


// ============ 公众号 Tab ============
// QR Login state for sidebar
const qrLoginState = {
    polling: false,
    pollTimer: null,
    sessionId: null,
};

async function loadWechatTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.wechat;
    
    if (!state.loaded) {
        state.loading = true;
        try {
            // Check auth status
            const authResp = await fetch('/api/wechat/auth/auto', { method: 'POST' });
            if (authResp.ok) {
                const authData = await authResp.json();
                state.authStatus = authData.has_auth ? 'valid' : 'none';
            } else {
                state.authStatus = 'none';
            }
            
            // Load subscriptions if authorized
            if (state.authStatus === 'valid') {
                const subsResp = await fetch('/api/wechat/subscriptions');
                if (subsResp.ok) {
                    const subsData = await subsResp.json();
                    state.subscriptions = subsData.subscriptions || [];
                }
            }
            
            state.loaded = true;
        } catch (e) {
            state.authStatus = 'none';
            throw e;
        } finally {
            state.loading = false;
        }
    }
    
    renderWechatTab();
}

function renderWechatTab() {
    const body = document.getElementById('subscribeSidebarBody');
    const state = tabStates.wechat;
    
    if (state.authStatus !== 'valid') {
        // Show QR login UI
        body.innerHTML = `
            <div class="subscribe-wechat-auth">
                <div id="wechatQRArea" class="subscribe-qr-area">
                    <div class="subscribe-qr-loading">
                        <span class="subscribe-qr-spinner">⟳</span>
                        正在获取二维码...
                    </div>
                </div>
                <p class="subscribe-qr-hint">请使用微信扫描二维码登录</p>
                <p class="subscribe-qr-note">
                    ⚠️ <a href="https://mp.weixin.qq.com/cgi-bin/registermidpage?action=index&weblogo=1&lang=zh_CN" target="_blank">请注册公众号或服务号</a>
                </p>
            </div>
        `;
        // Auto start QR login
        startWechatQRLogin();
        return;
    }
    
    let html = `
        <div class="subscribe-search-box">
            <input type="text" class="subscribe-search-input" id="wechatSearchInput" 
                   placeholder="搜索公众号（至少2个字符）..." value="${escapeHtml(state.searchQuery)}">
            <button class="subscribe-search-btn" id="wechatSearchBtn">搜索</button>
        </div>
    `;
    
    // Show search results
    if (state.searchResults.length > 0) {
        html += '<div class="subscribe-section-title">搜索结果</div>';
        html += '<div class="subscribe-wechat-list">';
        for (const mp of state.searchResults) {
            const isSubscribed = state.subscriptions.some(s => s.fakeid === mp.fakeid);
            html += renderWechatCard(mp, isSubscribed);
        }
        html += '</div>';
    }
    
    // Show subscriptions
    if (state.subscriptions.length > 0) {
        html += '<div class="subscribe-section-title">已订阅</div>';
        html += '<div class="subscribe-wechat-list">';
        for (const mp of state.subscriptions) {
            html += renderWechatCard(mp, true);
        }
        html += '</div>';
    } else if (state.searchResults.length === 0) {
        html += `
            <div class="subscribe-empty-state">
                <div class="subscribe-empty-icon">💬</div>
                <div class="subscribe-empty-title">还没有订阅公众号</div>
                <div class="subscribe-empty-desc">在上方搜索并订阅公众号</div>
            </div>
        `;
    }
    
    body.innerHTML = html;
    
    // Bind search
    const searchInput = document.getElementById('wechatSearchInput');
    const searchBtn = document.getElementById('wechatSearchBtn');
    
    const doSearch = async () => {
        const query = searchInput.value.trim();
        if (!query || query.length < 2) {
            showToast('请输入至少2个字符');
            return;
        }
        state.searchQuery = query;
        await searchWechatMP(query);
    };
    
    searchBtn?.addEventListener('click', doSearch);
    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });
    
    bindWechatCardEvents(body);
}

// ============ WeChat QR Login ============
async function startWechatQRLogin() {
    const qrArea = document.getElementById('wechatQRArea');
    if (!qrArea) return;
    
    qrArea.innerHTML = `
        <div class="subscribe-qr-loading">
            <span class="subscribe-qr-spinner">⟳</span>
            正在获取二维码...
        </div>
    `;
    
    try {
        const startResp = await fetch('/api/wechat/auth/qr/start', { method: 'POST' });
        const startData = await startResp.json();
        
        if (!startData.ok) throw new Error(startData.error || '创建会话失败');
        
        qrLoginState.sessionId = startData.session_id;
        const qrUrl = `/api/wechat/auth/qr/image?t=${Date.now()}`;
        
        qrArea.innerHTML = `
            <img src="${qrUrl}" alt="登录二维码" class="subscribe-qr-image" 
                 onerror="this.parentElement.innerHTML='<p class=subscribe-qr-error>二维码加载失败</p>'">
            <p id="wechatQRStatus" class="subscribe-qr-status">等待扫码...</p>
            <button class="subscribe-qr-cancel" onclick="window.cancelWechatQRLogin()">取消</button>
        `;
        
        qrLoginState.polling = true;
        pollWechatQRStatus();
        
    } catch (e) {
        console.error('[WechatQR] Start error:', e);
        qrArea.innerHTML = `
            <p class="subscribe-qr-error">获取二维码失败: ${escapeHtml(e.message)}</p>
            <button class="subscribe-qr-retry" onclick="window.retryWechatQRLogin()">重试</button>
        `;
    }
}

async function pollWechatQRStatus() {
    if (!qrLoginState.polling) return;
    
    try {
        const resp = await fetch('/api/wechat/auth/qr/status');
        const data = await resp.json();
        
        const statusEl = document.getElementById('wechatQRStatus');
        if (!statusEl) {
            qrLoginState.polling = false;
            return;
        }
        
        if (data.status === 'waiting') {
            statusEl.textContent = '等待扫码...';
            statusEl.className = 'subscribe-qr-status';
        } else if (data.status === 'scanned') {
            statusEl.textContent = '已扫码，请在手机上确认登录';
            statusEl.className = 'subscribe-qr-status scanned';
        } else if (data.status === 'confirmed') {
            statusEl.textContent = '已确认，正在完成登录...';
            statusEl.className = 'subscribe-qr-status confirmed';
            qrLoginState.polling = false;
            await completeWechatQRLogin();
            return;
        } else if (data.status === 'expired' || data.need_refresh) {
            statusEl.textContent = '二维码已过期';
            statusEl.className = 'subscribe-qr-status expired';
            qrLoginState.polling = false;
            
            const qrArea = document.getElementById('wechatQRArea');
            if (qrArea) {
                qrArea.innerHTML = `
                    <p class="subscribe-qr-error">二维码已过期</p>
                    <button class="subscribe-qr-retry" onclick="window.retryWechatQRLogin()">重新获取</button>
                `;
            }
            return;
        } else if (data.status === 'error') {
            statusEl.textContent = data.message || '出错了';
            statusEl.className = 'subscribe-qr-status error';
        }
        
        if (qrLoginState.polling) {
            qrLoginState.pollTimer = setTimeout(pollWechatQRStatus, 2000);
        }
        
    } catch (e) {
        console.error('[WechatQR] Poll error:', e);
        if (qrLoginState.polling) {
            qrLoginState.pollTimer = setTimeout(pollWechatQRStatus, 3000);
        }
    }
}

async function completeWechatQRLogin() {
    const qrArea = document.getElementById('wechatQRArea');
    
    try {
        const resp = await fetch('/api/wechat/auth/qr/complete-and-share', { method: 'POST' });
        const data = await resp.json();
        
        if (!data.ok) throw new Error(data.error || '登录失败');
        
        if (qrArea) {
            qrArea.innerHTML = `
                <p class="subscribe-qr-success">✓ 登录成功！</p>
                <p class="subscribe-qr-loading-text">正在加载公众号功能...</p>
            `;
        }
        
        showToast('登录成功');
        
        // Update state and reload
        setTimeout(async () => {
            const state = tabStates.wechat;
            state.authStatus = 'valid';
            
            // Load subscriptions
            try {
                const subsResp = await fetch('/api/wechat/subscriptions');
                if (subsResp.ok) {
                    const subsData = await subsResp.json();
                    state.subscriptions = subsData.subscriptions || [];
                }
            } catch (e) {}
            
            renderWechatTab();
        }, 1000);
        
    } catch (e) {
        console.error('[WechatQR] Complete error:', e);
        if (qrArea) {
            qrArea.innerHTML = `
                <p class="subscribe-qr-error">登录失败: ${escapeHtml(e.message)}</p>
                <button class="subscribe-qr-retry" onclick="window.retryWechatQRLogin()">重试</button>
            `;
        }
    }
}

function cancelWechatQRLogin() {
    qrLoginState.polling = false;
    if (qrLoginState.pollTimer) {
        clearTimeout(qrLoginState.pollTimer);
        qrLoginState.pollTimer = null;
    }
    
    fetch('/api/wechat/auth/qr/cancel', { method: 'POST' }).catch(() => {});
    
    // Show initial state
    const qrArea = document.getElementById('wechatQRArea');
    if (qrArea) {
        qrArea.innerHTML = `
            <div class="subscribe-qr-loading">
                <span class="subscribe-qr-spinner">⟳</span>
                正在获取二维码...
            </div>
        `;
    }
    startWechatQRLogin();
}

function retryWechatQRLogin() {
    startWechatQRLogin();
}

// Expose to window for onclick handlers
window.cancelWechatQRLogin = cancelWechatQRLogin;
window.retryWechatQRLogin = retryWechatQRLogin;

function renderWechatCard(mp, isSubscribed) {
    const avatarUrl = mp.round_head_img ? `/api/wechat/img-proxy?url=${encodeURIComponent(mp.round_head_img)}` : '';
    const avatarHtml = avatarUrl 
        ? `<img class="subscribe-wechat-avatar" src="${avatarUrl}" alt="${escapeHtml(mp.nickname)}" onerror="this.outerHTML='<div class=\\'subscribe-wechat-avatar-placeholder\\'>💬</div>'">`
        : `<div class="subscribe-wechat-avatar-placeholder">💬</div>`;
    
    return `
        <div class="subscribe-wechat-card" data-fakeid="${escapeHtml(mp.fakeid)}">
            ${avatarHtml}
            <div class="subscribe-wechat-info">
                <div class="subscribe-wechat-name">${escapeHtml(mp.nickname)}</div>
                <div class="subscribe-wechat-signature">${escapeHtml(mp.signature || '')}</div>
            </div>
            <button class="subscribe-wechat-btn ${isSubscribed ? 'subscribed' : ''}" data-action="${isSubscribed ? 'unsubscribe' : 'subscribe'}">
                ${isSubscribed ? '已订阅 ✓' : '+ 订阅'}
            </button>
        </div>
    `;
}

function bindWechatCardEvents(container) {
    container.querySelectorAll('.subscribe-wechat-card').forEach(card => {
        const btn = card.querySelector('.subscribe-wechat-btn');
        btn?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const fakeid = card.dataset.fakeid;
            const action = btn.dataset.action;
            await toggleWechatSubscribe(fakeid, action === 'subscribe');
        });
    });
}

async function searchWechatMP(query) {
    const state = tabStates.wechat;
    
    try {
        const resp = await fetch(`/api/wechat/search?keyword=${encodeURIComponent(query)}&limit=20`);
        if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.detail || '搜索失败');
        }
        
        const data = await resp.json();
        // API returns data.list, not data.results
        state.searchResults = data.list || data.results || [];
        renderWechatTab();
    } catch (e) {
        showToast('搜索失败: ' + e.message);
    }
}

async function toggleWechatSubscribe(fakeid, subscribe) {
    const state = tabStates.wechat;
    
    try {
        if (subscribe) {
            const mp = state.searchResults.find(m => m.fakeid === fakeid);
            if (!mp) return;
            
            const resp = await fetch('/api/wechat/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fakeid, nickname: mp.nickname })
            });
            
            if (!resp.ok) throw new Error('订阅失败');
            state.subscriptions.push(mp);
            showToast('已订阅');
        } else {
            const resp = await fetch('/api/wechat/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fakeid })
            });
            
            if (!resp.ok) throw new Error('取消订阅失败');
            state.subscriptions = state.subscriptions.filter(s => s.fakeid !== fakeid);
            showToast('已取消订阅');
        }
        
        renderWechatTab();
    } catch (e) {
        showToast(e.message);
    }
}

// ============ 导出 ============
window.openSubscribeSidebar = openSubscribeSidebar;
window.closeSubscribeSidebar = closeSubscribeSidebar;

export {
    openSubscribeSidebar,
    closeSubscribeSidebar,
    isSubscribeSidebarOpen
};
