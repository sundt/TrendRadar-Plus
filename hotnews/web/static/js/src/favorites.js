/**
 * Favorites Module
 * Handles user favorites functionality with local storage fallback
 */

import { authState, requireLogin } from './auth-state.js';
import { openLoginModal } from './login-modal.js';
// summary-modal.js 已改为动态加载，renderMarkdown 通过 window.* 访问
import { preferences } from './preferences.js';
import { skeletonInline } from './skeleton.js';

// renderMarkdown 代理：优先用 window.renderMarkdown（summary-modal 加载后可用），降级为纯文本
function renderMarkdown(text) {
    if (typeof window.renderMarkdown === 'function') return window.renderMarkdown(text);
    // 降级：简单 HTML 转义
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
}

const FAVORITES_STORAGE_KEY = 'hotnews_favorites_v1';
const FAVORITES_WIDTH_KEY = 'hotnews_favorites_width';
const DEFAULT_PANEL_WIDTH = 500;
const MIN_PANEL_WIDTH = 320;
const MAX_PANEL_WIDTH = 800;

let favoritesCache = null;
let isPanelOpen = false;
let isResizing = false;
let activeTab = 'summary'; // 'summary' | 'bookmarks'

/**
 * Get favorites from local storage (for non-logged-in users or as cache)
 */
function getLocalFavorites() {
    try {
        const data = localStorage.getItem(FAVORITES_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

/**
 * Save favorites to local storage
 */
function saveLocalFavorites(favorites) {
    try {
        localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(favorites));
    } catch (e) {
        console.error('[Favorites] Failed to save to localStorage:', e);
    }
}

/**
 * Fetch favorites from server
 */
async function fetchFavorites() {
    try {
        const res = await fetch('/api/user/favorites');
        if (res.status === 401) {
            return { needsAuth: true };
        }
        if (!res.ok) {
            throw new Error('Failed to fetch favorites');
        }
        const data = await res.json();
        if (data.ok) {
            favoritesCache = data.favorites || [];
            return { favorites: favoritesCache };
        }
        return { error: data.message || 'Unknown error' };
    } catch (e) {
        console.error('[Favorites] Fetch error:', e);
        return { error: e.message };
    }
}

/**
 * Add a favorite
 */
async function addFavorite(newsItem) {
    const user = authState.getUser();
    
    if (!user) {
        // Save to local storage for non-logged-in users
        const locals = getLocalFavorites();
        const exists = locals.some(f => f.news_id === newsItem.news_id);
        if (!exists) {
            locals.unshift({
                ...newsItem,
                created_at: Math.floor(Date.now() / 1000)
            });
            saveLocalFavorites(locals);
        }
        return { ok: true, local: true };
    }
    
    try {
        const res = await fetch('/api/user/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(newsItem)
        });
        const data = await res.json();
        if (data.ok) {
            // Update cache (initialize if needed)
            if (!favoritesCache) favoritesCache = [];
            // Avoid duplicates
            favoritesCache = favoritesCache.filter(f => f.news_id !== newsItem.news_id);
            favoritesCache.unshift(data.favorite);
        }
        return data;
    } catch (e) {
        console.error('[Favorites] Add error:', e);
        return { ok: false, error: e.message };
    }
}

/**
 * Remove a favorite
 */
async function removeFavorite(newsId) {
    const user = authState.getUser();
    
    if (!user) {
        // Remove from local storage
        const locals = getLocalFavorites();
        const filtered = locals.filter(f => f.news_id !== newsId);
        saveLocalFavorites(filtered);
        return { ok: true, local: true };
    }
    
    try {
        const res = await fetch(`/api/user/favorites/${encodeURIComponent(newsId)}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.ok) {
            if (favoritesCache) {
                favoritesCache = favoritesCache.filter(f => f.news_id !== newsId);
            }
        }
        return data;
    } catch (e) {
        console.error('[Favorites] Remove error:', e);
        return { ok: false, error: e.message };
    }
}

/**
 * Check if a news item is favorited
 */
function isFavorited(newsId) {
    const user = authState.getUser();
    
    if (!user) {
        const locals = getLocalFavorites();
        return locals.some(f => f.news_id === newsId);
    }
    
    if (favoritesCache) {
        return favoritesCache.some(f => f.news_id === newsId);
    }
    
    // Cache not loaded yet — check DOM button state as fallback
    const btn = document.querySelector(`.news-favorite-btn[data-news-id="${newsId}"]`);
    if (btn) {
        return btn.classList.contains('favorited');
    }
    
    return false;
}

/**
 * Toggle favorite status for a news item
 */
async function toggleFavorite(newsItem, button) {
    const newsId = newsItem.news_id;
    const wasFavorited = isFavorited(newsId);
    
    // Optimistic UI update — sync ALL buttons for this newsId
    const allBtns = document.querySelectorAll(`.news-favorite-btn[data-news-id="${newsId}"]`);
    allBtns.forEach(b => b.classList.toggle('favorited', !wasFavorited));
    if (button && !button.dataset.newsId) {
        button.classList.toggle('favorited', !wasFavorited);
    }
    
    let result;
    if (wasFavorited) {
        result = await removeFavorite(newsId);
    } else {
        result = await addFavorite(newsItem);
    }
    
    if (!result.ok) {
        // Revert on failure
        allBtns.forEach(b => b.classList.toggle('favorited', wasFavorited));
        if (button && !button.dataset.newsId) {
            button.classList.toggle('favorited', wasFavorited);
        }
    }
    
    return result;
}

/**
 * Format date for display
 */
function formatFavoriteDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    const MM = String(d.getMonth() + 1).padStart(2, '0');
    const DD = String(d.getDate()).padStart(2, '0');
    return `${MM}-${DD}`;
}

/**
 * Render favorites list in the panel
 */
function renderFavoritesList(favorites) {
    const body = document.getElementById('favoritesPanelBody');
    if (!body) return;
    
    if (!favorites || favorites.length === 0) {
        body.innerHTML = `
            <div class="favorites-empty">
                <div class="favorites-empty-icon">⭐</div>
                <div>暂无收藏</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    点击新闻标题旁的 ☆ 添加收藏
                </div>
            </div>
        `;
        return;
    }
    
    const html = `
        <div class="favorites-list">
            ${favorites.map(f => `
                <div class="favorite-item" data-news-id="${f.news_id}">
                    <a class="favorite-item-title" href="${f.url || '#'}" target="_blank" rel="noopener noreferrer">
                        ${f.title || '无标题'}
                    </a>
                    <div class="favorite-item-meta">
                        <span class="favorite-item-source">
                            ${f.source_name ? `<span>${f.source_name}</span>` : ''}
                            ${f.created_at ? `<span>收藏于 ${formatFavoriteDate(f.created_at)}</span>` : ''}
                        </span>
                        <div class="favorite-item-actions">
                            <button class="favorite-summary-btn${f.summary ? ' has-summary' : ''}" 
                                    onclick="handleFavoriteSummaryClick('${f.news_id}')" 
                                    title="${f.summary ? '查看总结' : 'AI 总结'}">
                                ${f.summary ? '📄' : '📝'}
                            </button>
                            <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${f.news_id}')" title="取消收藏">
                                删除
                            </button>
                        </div>
                    </div>
                    <div class="favorite-item-summary" id="summary-${f.news_id}" style="display:${f.summary ? 'block' : 'none'};">
                        <div class="summary-content">${f.summary ? renderMarkdown(f.summary) : ''}</div>
                        ${f.summary ? `
                            <div class="summary-actions">
                                <button class="summary-regenerate-btn" onclick="regenerateSummary('${f.news_id}')" title="重新生成">
                                    🔄 重新生成
                                </button>
                                <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${f.news_id}')">
                                    收起
                                </button>
                            </div>
                        ` : ''}
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    body.innerHTML = html;
}

/**
 * Render bookmarks list (收藏 Tab) — links only, no summaries
 */
function renderBookmarksList(favorites) {
    const body = document.getElementById('favoritesPanelBody');
    if (!body) return;

    if (!favorites || favorites.length === 0) {
        body.innerHTML = `
            <div class="favorites-empty">
                <div class="favorites-empty-icon">☆</div>
                <div>暂无收藏</div>
                <div style="font-size:12px;margin-top:8px;color:#64748b;">
                    点击新闻标题旁的 ☆ 添加收藏
                </div>
            </div>
        `;
        return;
    }

    const html = `
        <div class="favorites-list">
            ${favorites.map(f => `
                <div class="favorite-item" data-news-id="${f.news_id}">
                    <a class="favorite-item-title" href="${f.url || '#'}" target="_blank" rel="noopener noreferrer">
                        ${f.title || '无标题'}
                    </a>
                    <div class="favorite-item-meta">
                        <span class="favorite-item-source">
                            ${f.source_name ? `<span>${f.source_name}</span>` : ''}
                            ${f.created_at ? `<span>收藏于 ${formatFavoriteDate(f.created_at)}</span>` : ''}
                        </span>
                        <div class="favorite-item-actions">
                            <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${f.news_id}')" title="取消收藏">
                                删除
                            </button>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
    body.innerHTML = html;
}

/**
 * Render login required state
 */
function renderLoginRequired() {
    const body = document.getElementById('favoritesPanelBody');
    if (!body) return;
    
    // Check if there are local favorites
    const locals = getLocalFavorites();
    if (locals.length > 0) {
        // Show local favorites with login prompt
        body.innerHTML = `
            <div style="padding:12px;background:#334155;border-radius:8px;margin-bottom:16px;font-size:13px;color:#94a3b8;">
                <span style="color:#fbbf24;">💡</span> 登录后可同步收藏到云端
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();" style="margin-left:8px;padding:4px 12px;font-size:12px;">
                    登录
                </button>
            </div>
            <div class="favorites-list">
                ${locals.map(f => `
                    <div class="favorite-item" data-news-id="${f.news_id}">
                        <a class="favorite-item-title" href="${f.url || '#'}" target="_blank" rel="noopener noreferrer">
                            ${f.title || '无标题'}
                        </a>
                        <div class="favorite-item-meta">
                            <span class="favorite-item-source">
                                ${f.source_name ? `<span>${f.source_name}</span>` : ''}
                                ${f.created_at ? `<span>收藏于 ${formatFavoriteDate(f.created_at)}</span>` : ''}
                            </span>
                            <div class="favorite-item-actions">
                                <button class="favorite-remove-btn" onclick="removeFavoriteFromPanel('${f.news_id}')" title="取消收藏">
                                    删除
                                </button>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    } else {
        body.innerHTML = `
            <div class="favorites-login-required">
                <div class="favorites-login-icon">🔒</div>
                <div>登录后可使用收藏功能</div>
                <button class="favorites-login-btn" onclick="openLoginModal();closeFavoritesPanel();">
                    立即登录
                </button>
            </div>
        `;
    }
}

/**
 * Load and display favorites in the panel
 */
async function loadFavoritesPanel() {
    const body = document.getElementById('favoritesPanelBody');
    if (!body) return;
    
    body.innerHTML = skeletonInline(5);
    
    const user = authState.getUser();
    
    if (!user) {
        // Show local favorites or login prompt
        renderLoginRequired();
        return;
    }
    
    const result = await fetchFavorites();
    
    if (result.needsAuth) {
        renderLoginRequired();
        return;
    }
    
    if (result.error) {
        body.innerHTML = `
            <div class="favorites-empty">
                <div>加载失败: ${result.error}</div>
                <button onclick="loadFavoritesPanel()" style="margin-top:12px;padding:8px 16px;background:#3b82f6;color:white;border:none;border-radius:6px;cursor:pointer;">
                    重试
                </button>
            </div>
        `;
        return;
    }
    
    if (activeTab === 'bookmarks') {
        renderBookmarksList(result.favorites);
    } else {
        // "总结" Tab: only show items that have a summary
        const withSummary = (result.favorites || []).filter(f => f.summary);
        renderFavoritesList(withSummary);
    }
}

/**
 * Initialize tab switching in favorites panel
 */
function initTabSwitching() {
    const tabBar = document.querySelector('.favorites-tab-bar');
    if (!tabBar) return;
    tabBar.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tab]');
        if (!btn) return;
        const tab = btn.dataset.tab;
        if (tab === activeTab) return;
        activeTab = tab;
        tabBar.querySelectorAll('.favorites-tab-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.tab === activeTab)
        );
        loadFavoritesPanel();
    });
}

/**
 * Toggle favorites panel visibility
 */
function toggleFavoritesPanel() {
    if (!requireLogin()) return;
    
    const panel = document.getElementById('favoritesPanel');
    let overlay = document.getElementById('favoritesOverlay');
    
    if (!panel) return;
    
    // Create overlay if not exists
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'favoritesOverlay';
        overlay.className = 'favorites-overlay';
        overlay.onclick = closeFavoritesPanel;
        document.body.appendChild(overlay);
    }
    
    isPanelOpen = !isPanelOpen;
    
    if (isPanelOpen) {
        panel.classList.add('open');
        overlay.classList.add('open');
        loadFavoritesPanel();
    } else {
        panel.classList.remove('open');
        overlay.classList.remove('open');
    }
}

/**
 * Close favorites panel
 */
function closeFavoritesPanel() {
    const panel = document.getElementById('favoritesPanel');
    const overlay = document.getElementById('favoritesOverlay');
    
    isPanelOpen = false;
    
    if (panel) panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
}

/**
 * Remove favorite from panel (called from panel UI)
 */
async function removeFavoriteFromPanel(newsId) {
    const result = await removeFavorite(newsId);
    if (result.ok) {
        // Remove from DOM
        const item = document.querySelector(`.favorite-item[data-news-id="${newsId}"]`);
        if (item) {
            item.remove();
        }
        // Update button in news list if visible
        const btn = document.querySelector(`.news-favorite-btn[data-news-id="${newsId}"]`);
        if (btn) {
            btn.classList.remove('favorited');
        }
        // Check if list is now empty
        const list = document.querySelector('.favorites-list');
        if (list && list.children.length === 0) {
            loadFavoritesPanel();
        }
    }
}

/**
 * Handle favorite button click on news item
 */
function handleFavoriteClick(event, newsId, title, url, sourceId, sourceName) {
    event.preventDefault();
    event.stopPropagation();
    
    if (!requireLogin()) return;
    
    const button = event.currentTarget;
    const newsItem = {
        news_id: newsId,
        title: title,
        url: url,
        source_id: sourceId || '',
        source_name: sourceName || ''
    };
    
    toggleFavorite(newsItem, button);
}

/**
 * Get saved panel width from localStorage
 */
function getSavedPanelWidth() {
    try {
        const saved = localStorage.getItem(FAVORITES_WIDTH_KEY);
        if (saved) {
            const width = parseInt(saved, 10);
            if (width >= MIN_PANEL_WIDTH && width <= MAX_PANEL_WIDTH) {
                return width;
            }
        }
    } catch (e) {}
    return DEFAULT_PANEL_WIDTH;
}

/**
 * Save panel width to localStorage and server (if logged in)
 */
function savePanelWidth(width) {
    try {
        localStorage.setItem(FAVORITES_WIDTH_KEY, String(width));
        // Also save to server via preferences module
        preferences.saveSidebarWidths({ favorites_width: width });
    } catch (e) {}
}

/**
 * Apply panel width
 */
function applyPanelWidth(width) {
    const panel = document.getElementById('favoritesPanel');
    if (panel) {
        panel.style.width = width + 'px';
    }
}

/**
 * Initialize panel resize functionality
 */
function initPanelResize() {
    const panel = document.getElementById('favoritesPanel');
    const handle = document.getElementById('favoritesResizeHandle');
    
    if (!panel || !handle) return;
    
    // Apply saved width
    const savedWidth = getSavedPanelWidth();
    applyPanelWidth(savedWidth);
    
    let startX = 0;
    let startWidth = 0;
    
    function onMouseDown(e) {
        e.preventDefault();
        isResizing = true;
        startX = e.clientX;
        startWidth = panel.offsetWidth;
        
        panel.classList.add('resizing');
        handle.classList.add('active');
        
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    }
    
    function onMouseMove(e) {
        if (!isResizing) return;
        
        // Dragging left increases width, dragging right decreases
        const delta = startX - e.clientX;
        let newWidth = startWidth + delta;
        
        // Clamp to min/max
        newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
        
        panel.style.width = newWidth + 'px';
    }
    
    function onMouseUp() {
        if (!isResizing) return;
        
        isResizing = false;
        panel.classList.remove('resizing');
        handle.classList.remove('active');
        
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        
        // Save the new width
        savePanelWidth(panel.offsetWidth);
    }
    
    // Touch support
    function onTouchStart(e) {
        if (e.touches.length !== 1) return;
        e.preventDefault();
        isResizing = true;
        startX = e.touches[0].clientX;
        startWidth = panel.offsetWidth;
        
        panel.classList.add('resizing');
        handle.classList.add('active');
        
        document.addEventListener('touchmove', onTouchMove, { passive: false });
        document.addEventListener('touchend', onTouchEnd);
    }
    
    function onTouchMove(e) {
        if (!isResizing || e.touches.length !== 1) return;
        e.preventDefault();
        
        const delta = startX - e.touches[0].clientX;
        let newWidth = startWidth + delta;
        newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, newWidth));
        
        panel.style.width = newWidth + 'px';
    }
    
    function onTouchEnd() {
        if (!isResizing) return;
        
        isResizing = false;
        panel.classList.remove('resizing');
        handle.classList.remove('active');
        
        document.removeEventListener('touchmove', onTouchMove);
        document.removeEventListener('touchend', onTouchEnd);
        
        savePanelWidth(panel.offsetWidth);
    }
    
    handle.addEventListener('mousedown', onMouseDown);
    handle.addEventListener('touchstart', onTouchStart, { passive: false });
}

// 事件委托：处理收藏按钮点击
function initFavoriteButtonDelegation() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.news-favorite-btn');
        if (!btn) return;
        
        e.preventDefault();
        e.stopPropagation();
        
        if (!requireLogin()) return;
        
        // 从 DOM 中获取新闻信息
        const newsItem = btn.closest('.news-item');
        if (!newsItem) return;
        
        const newsId = newsItem.dataset.newsId || newsItem.dataset.id;
        const url = newsItem.dataset.newsUrl || newsItem.dataset.url;
        const titleEl = newsItem.querySelector('.news-title');
        const title = titleEl ? titleEl.textContent.trim() : '';
        
        // 获取平台信息
        const platformCard = newsItem.closest('.platform-card');
        const sourceId = platformCard ? platformCard.dataset.platform : '';
        const sourceNameEl = platformCard ? platformCard.querySelector('.platform-name') : null;
        const sourceName = sourceNameEl ? sourceNameEl.textContent.replace('📱', '').trim() : '';
        
        const item = {
            news_id: newsId,
            title: title,
            url: url,
            source_id: sourceId,
            source_name: sourceName
        };
        
        toggleFavorite(item, btn);
    });
}

/**
 * Inject favorite buttons (☆/★) into all news items
 * Uses MutationObserver to handle dynamically added items
 */
function injectFavoriteButtons() {
    // Inject into existing items
    _injectButtonsIntoContainer(document);

    // Watch for dynamically added news items
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node.nodeType !== 1) continue;
                // If the added node is a news-item or contains news-items
                if (node.classList?.contains('news-item')) {
                    _injectButtonIntoItem(node);
                } else if (node.querySelectorAll) {
                    _injectButtonsIntoContainer(node);
                }
            }
        }
    });

    // Observe the main content area
    const contentArea = document.querySelector('.tab-content-area') || document.body;
    observer.observe(contentArea, { childList: true, subtree: true });
}

function _injectButtonsIntoContainer(container) {
    const items = container.querySelectorAll('.news-item');
    items.forEach(item => _injectButtonIntoItem(item));
}

function _injectButtonIntoItem(item) {
    // Skip if already has a favorite button
    if (item.querySelector('.news-favorite-btn')) return;

    const hoverBtns = item.querySelector('.news-hover-btns');
    if (!hoverBtns) return;

    const newsId = item.dataset.newsId || item.dataset.id || '';
    if (!newsId) return;

    const btn = document.createElement('button');
    btn.className = 'news-favorite-btn';
    btn.dataset.newsId = newsId;

    const favorited = isFavorited(newsId);
    if (favorited) btn.classList.add('favorited');

    // Insert at the beginning of hover buttons
    hoverBtns.insertBefore(btn, hoverBtns.firstChild);
}

// Initialize resize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        initPanelResize();
        initFavoriteButtonDelegation();
        initTabSwitching();
        injectFavoriteButtons();
        _warmupFavoritesCache();
    });
} else {
    initPanelResize();
    initFavoriteButtonDelegation();
    initTabSwitching();
    injectFavoriteButtons();
    _warmupFavoritesCache();
}

/**
 * Preload favorites cache so isFavorited() works before panel is opened.
 * Also refreshes injected button states once cache is ready.
 */
async function _warmupFavoritesCache() {
    const user = authState.getUser();
    if (!user || favoritesCache) return;
    
    const result = await fetchFavorites();
    if (result.favorites) {
        // Refresh all injected button states
        document.querySelectorAll('.news-favorite-btn[data-news-id]').forEach(btn => {
            const newsId = btn.dataset.newsId;
            btn.classList.toggle('favorited', isFavorited(newsId));
        });
    }
}

/**
 * Handle summary button click in favorites panel
 */
async function handleFavoriteSummaryClick(newsId) {
    const summaryDiv = document.getElementById(`summary-${newsId}`);
    const btn = document.querySelector(`.favorite-item[data-news-id="${newsId}"] .favorite-summary-btn`);
    
    if (!summaryDiv || !btn) return;
    
    // If already has summary, toggle display
    if (btn.classList.contains('has-summary')) {
        toggleSummaryDisplay(newsId);
        return;
    }
    
    // Show loading state
    btn.disabled = true;
    btn.textContent = '⏳';
    btn.title = '生成中...';
    
    summaryDiv.style.display = 'block';
    summaryDiv.innerHTML = `
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <span>正在生成 AI 总结...</span>
        </div>
    `;
    
    try {
        const res = await fetch(`/api/user/favorites/${encodeURIComponent(newsId)}/summary`, {
            method: 'POST'
        });
        
        const data = await res.json();
        
        if (!res.ok) {
            throw new Error(data.detail || '生成失败');
        }
        
        if (data.ok && data.summary) {
            btn.classList.add('has-summary');
            btn.textContent = '📄';
            btn.title = '查看总结';
            
            summaryDiv.innerHTML = `
                <div class="summary-content">${renderMarkdown(data.summary)}</div>
                <div class="summary-actions">
                    <button class="summary-regenerate-btn" onclick="regenerateSummary('${newsId}')" title="重新生成">
                        🔄 重新生成
                    </button>
                    <button class="summary-toggle-btn" onclick="toggleSummaryDisplay('${newsId}')">
                        收起
                    </button>
                </div>
            `;
            
            // Update cache
            if (favoritesCache) {
                const fav = favoritesCache.find(f => f.news_id === newsId);
                if (fav) {
                    fav.summary = data.summary;
                    fav.summary_at = data.summary_at;
                }
            }
        } else {
            throw new Error(data.error || '生成失败');
        }
    } catch (e) {
        console.error('[Favorites] Summary error:', e);
        summaryDiv.innerHTML = `
            <div class="summary-error">
                <span>❌ ${e.message}</span>
                <button onclick="handleFavoriteSummaryClick('${newsId}')" style="margin-left:8px;">重试</button>
            </div>
        `;
        btn.textContent = '📝';
        btn.title = 'AI 总结';
    } finally {
        btn.disabled = false;
    }
}

/**
 * Toggle summary display
 */
function toggleSummaryDisplay(newsId) {
    const summaryDiv = document.getElementById(`summary-${newsId}`);
    if (!summaryDiv) return;
    
    const isVisible = summaryDiv.style.display !== 'none';
    summaryDiv.style.display = isVisible ? 'none' : 'block';
    
    // Update toggle button text
    const toggleBtn = summaryDiv.querySelector('.summary-toggle-btn');
    if (toggleBtn) {
        toggleBtn.textContent = isVisible ? '展开' : '收起';
    }
}

/**
 * Regenerate summary (delete cache and regenerate)
 */
async function regenerateSummary(newsId) {
    const summaryDiv = document.getElementById(`summary-${newsId}`);
    const btn = document.querySelector(`.favorite-item[data-news-id="${newsId}"] .favorite-summary-btn`);
    
    if (!summaryDiv) return;
    
    // Delete cached summary first
    try {
        await fetch(`/api/user/favorites/${encodeURIComponent(newsId)}/summary`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error('[Favorites] Delete summary error:', e);
    }
    
    // Reset button state
    if (btn) {
        btn.classList.remove('has-summary');
        btn.textContent = '📝';
    }
    
    // Update cache
    if (favoritesCache) {
        const fav = favoritesCache.find(f => f.news_id === newsId);
        if (fav) {
            fav.summary = null;
            fav.summary_at = null;
        }
    }
    
    // Regenerate
    await handleFavoriteSummaryClick(newsId);
}

// Expose to window
window.toggleFavoritesPanel = toggleFavoritesPanel;
window.closeFavoritesPanel = closeFavoritesPanel;
window.removeFavoriteFromPanel = removeFavoriteFromPanel;
window.handleFavoriteClick = handleFavoriteClick;
window.isFavorited = isFavorited;
window.handleFavoriteSummaryClick = handleFavoriteSummaryClick;
window.toggleSummaryDisplay = toggleSummaryDisplay;
window.regenerateSummary = regenerateSummary;

export {
    toggleFavoritesPanel,
    closeFavoritesPanel,
    addFavorite,
    removeFavorite,
    isFavorited,
    toggleFavorite,
    handleFavoriteClick
};
