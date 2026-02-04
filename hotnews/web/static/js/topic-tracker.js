/**
 * Topic Tracker - Frontend logic for topic tracking feature
 */

(function() {
    'use strict';

    // State
    let topics = [];
    let currentEditTopic = null;
    let generatedData = null; // { icon, keywords, recommended_sources }

    // DOM Elements (will be initialized after DOM ready)
    let modalOverlay = null;
    let modalTitle = null;
    let topicNameInput = null;
    let keywordsContainer = null;
    let sourcesContainer = null;
    let aiGenerateBtn = null;
    let submitBtn = null;

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
        
        createModal();
        loadTopics();
        addNewTopicButton();
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
                            <button class="topic-ai-btn" id="topicAiBtn" onclick="TopicTracker.generateKeywords()">
                                🤖 生成关键词和推荐源
                            </button>
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
                    <div class="topic-modal-footer">
                        <button class="topic-modal-btn cancel" onclick="TopicTracker.closeModal()">取消</button>
                        <button class="topic-modal-btn primary" id="topicSubmitBtn" onclick="TopicTracker.submitTopic()" disabled>
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
        // Find category tabs container
        const categoryTabs = document.querySelector('.category-tabs');
        if (!categoryTabs) {
            console.warn('[TopicTracker] category-tabs not found, will retry later');
            setTimeout(addNewTopicButton, 1000);
            return;
        }
        
        // Check if button already exists
        if (document.getElementById('newTopicBtn')) return;
        
        // Create the button element
        const btn = document.createElement('div');
        btn.className = 'category-tab new-topic-tab';
        btn.id = 'newTopicBtn';
        btn.innerHTML = `
            <div class="category-tab-icon">➕</div>
            <div class="category-tab-name">新建主题</div>
        `;
        btn.onclick = function() {
            TopicTracker.openModal();
        };
        
        // Insert at the beginning (before 我的关注)
        categoryTabs.insertBefore(btn, categoryTabs.firstChild);
        
        console.log('[TopicTracker] New topic button added to tabs');
        
        // Create topics container in my-tags tab
        const myTagsGrid = document.getElementById('myTagsGrid');
        if (myTagsGrid && !document.getElementById('topicSectionsContainer')) {
            const topicsContainer = document.createElement('div');
            topicsContainer.id = 'topicSectionsContainer';
            myTagsGrid.parentNode.insertBefore(topicsContainer, myTagsGrid);
        }
    }

    /**
     * Load user's topics
     */
    async function loadTopics() {
        try {
            const response = await fetch('/api/topics', { credentials: 'include' });
            const data = await response.json();
            
            if (data.ok) {
                topics = data.topics || [];
                renderTopicTabs();
            }
        } catch (e) {
            console.error('Failed to load topics:', e);
        }
    }

    /**
     * Render topic tabs in the category tabs bar
     */
    function renderTopicTabs() {
        const categoryTabs = document.querySelector('.category-tabs');
        const tabContentArea = document.querySelector('.tab-content-area');
        if (!categoryTabs || !tabContentArea) return;
        
        // Remove existing topic tabs and panes
        document.querySelectorAll('.category-tab.topic-tab').forEach(el => el.remove());
        document.querySelectorAll('.tab-pane.topic-pane').forEach(el => el.remove());
        
        // Find the "新建主题" button to insert after it
        const newTopicBtn = document.getElementById('newTopicBtn');
        const insertAfter = newTopicBtn || categoryTabs.firstChild;
        
        // Add a tab and pane for each topic
        topics.forEach((topic, index) => {
            // Create tab
            const tab = document.createElement('div');
            tab.className = 'category-tab topic-tab';
            tab.dataset.category = `topic-${topic.id}`;
            tab.dataset.topicId = topic.id;
            tab.innerHTML = `
                <div class="category-tab-icon">${topic.icon || '🏷️'}</div>
                <div class="category-tab-name">${escapeHtml(topic.name)}</div>
            `;
            tab.onclick = function() {
                switchToTopicTab(topic.id);
            };
            // Add right-click context menu
            tab.oncontextmenu = function(e) {
                e.preventDefault();
                showTopicContextMenu(e.clientX, e.clientY, topic);
            };
            
            // Insert after newTopicBtn
            if (insertAfter && insertAfter.nextSibling) {
                categoryTabs.insertBefore(tab, insertAfter.nextSibling);
            } else {
                categoryTabs.appendChild(tab);
            }
            
            // Create tab pane (without header buttons - use right-click menu instead)
            const pane = document.createElement('div');
            pane.className = 'tab-pane topic-pane';
            pane.id = `tab-topic-${topic.id}`;
            pane.innerHTML = `
                <div class="platform-grid" id="topicCards-${topic.id}">
                    ${topic.keywords.map(kw => renderKeywordCardSkeleton(kw)).join('')}
                </div>
            `;
            tabContentArea.appendChild(pane);
        });
        
        console.log('[TopicTracker] Rendered', topics.length, 'topic tabs');
    }

    /**
     * Switch to a topic tab
     */
    function switchToTopicTab(topicId) {
        // Deactivate all tabs
        document.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        
        // Activate topic tab
        const tab = document.querySelector(`.category-tab[data-category="topic-${topicId}"]`);
        const pane = document.getElementById(`tab-topic-${topicId}`);
        
        if (tab) tab.classList.add('active');
        if (pane) {
            pane.classList.add('active');
            // Load news if not loaded yet
            const grid = pane.querySelector('.platform-grid');
            if (grid && grid.querySelector('.news-placeholder')) {
                loadTopicNews(topicId);
            }
        }
    }

    /**
     * Render a single topic section (legacy - kept for compatibility)
     */
    function renderTopicSection(topic) {
        return `
            <div class="topic-section" data-topic-id="${topic.id}">
                <div class="topic-section-header">
                    <div class="topic-section-title">
                        <span class="topic-section-icon">${topic.icon || '🏷️'}</span>
                        <span>${escapeHtml(topic.name)}</span>
                    </div>
                    <div class="topic-section-actions">
                        <button class="topic-section-btn" onclick="TopicTracker.refreshTopic('${topic.id}')" title="刷新">🔄</button>
                        <button class="topic-section-btn" onclick="TopicTracker.editTopic('${topic.id}')" title="配置">⚙️</button>
                        <button class="topic-section-btn" onclick="TopicTracker.deleteTopic('${topic.id}')" title="删除">🗑️</button>
                    </div>
                </div>
                <div class="topic-cards-grid" id="topicCards-${topic.id}">
                    ${topic.keywords.map(kw => renderKeywordCardSkeleton(kw)).join('')}
                </div>
            </div>
        `;
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
     * Load news for a topic
     */
    async function loadTopicNews(topicId) {
        try {
            const response = await fetch(`/api/topics/${topicId}/news?limit=50`, { credentials: 'include' });
            const data = await response.json();
            
            if (data.ok && data.keywords_news) {
                renderTopicNews(topicId, data.keywords_news);
            }
        } catch (e) {
            console.error('Failed to load topic news:', e);
        }
    }

    /**
     * Render news for a topic
     */
    function renderTopicNews(topicId, keywordsNews) {
        const container = document.getElementById(`topicCards-${topicId}`);
        if (!container) return;
        
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        
        container.innerHTML = topic.keywords.map(keyword => {
            const news = keywordsNews[keyword] || [];
            return renderKeywordCard(keyword, news);
        }).join('');
    }

    /**
     * Render a keyword card with news
     */
    function renderKeywordCard(keyword, news) {
        const newsHtml = news.length > 0 
            ? news.slice(0, 50).map((item, idx) => `
                <li class="news-item">
                    <div class="news-item-content">
                        <span class="news-index">${idx + 1}</span>
                        <a class="news-title" href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">
                            ${escapeHtml(item.title)}
                        </a>
                        <div class="news-actions">
                            <span class="tr-news-date">${formatDate(item.published_at)}</span>
                        </div>
                    </div>
                </li>
            `).join('')
            : '<li class="news-placeholder" style="color:#9ca3af;text-align:center;padding:20px;">暂无相关新闻</li>';
        
        return `
            <div class="platform-card" data-keyword="${escapeHtml(keyword)}">
                <div class="platform-header">
                    <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">
                        🔍 ${escapeHtml(keyword)}
                        <span style="font-size:12px;color:#9ca3af;margin-left:8px;">(${news.length}条)</span>
                    </div>
                </div>
                <ul class="news-list">${newsHtml}</ul>
            </div>
        `;
    }

    /**
     * Open modal for new topic
     */
    function openModal() {
        currentEditTopic = null;
        generatedData = null;
        
        modalTitle.textContent = '新建追踪主题';
        topicNameInput.value = '';
        document.getElementById('topicIconGroup').style.display = 'none';
        document.getElementById('topicKeywordsGroup').style.display = 'none';
        document.getElementById('topicSourcesGroup').style.display = 'none';
        submitBtn.textContent = '创建并开始追踪';
        submitBtn.disabled = true;
        
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
     * Generate keywords using AI
     */
    async function generateKeywords() {
        const topicName = topicNameInput.value.trim();
        if (!topicName) {
            alert('请先输入主题名称');
            return;
        }
        
        aiGenerateBtn.disabled = true;
        aiGenerateBtn.innerHTML = '<span class="topic-spinner"></span> 生成中...';
        aiGenerateBtn.classList.add('loading');
        
        try {
            const response = await fetch('/api/topics/generate-keywords', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ topic_name: topicName })
            });
            
            const data = await response.json();
            
            if (data.ok) {
                generatedData = {
                    icon: data.icon || '🏷️',
                    keywords: data.keywords || [],
                    recommended_sources: data.recommended_sources || []
                };
                
                renderGeneratedData();
                submitBtn.disabled = false;
            } else {
                alert(data.error || 'AI 生成失败，请手动输入关键词');
            }
        } catch (e) {
            console.error('Generate keywords failed:', e);
            alert('AI 生成失败，请手动输入关键词');
        } finally {
            aiGenerateBtn.disabled = false;
            aiGenerateBtn.innerHTML = '🤖 生成关键词和推荐源';
            aiGenerateBtn.classList.remove('loading');
        }
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
        
        const html = generatedData.keywords.map(kw => `
            <span class="topic-keyword-tag">
                ${escapeHtml(kw)}
                <button class="topic-keyword-remove" onclick="TopicTracker.removeKeyword('${escapeHtml(kw)}')">×</button>
            </span>
        `).join('') + `
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
     */
    function renderSources() {
        if (!generatedData || !generatedData.recommended_sources) return;
        
        const html = generatedData.recommended_sources.map((source, idx) => {
            const isRss = source.type === 'rss';
            const typeLabel = isRss ? 'RSS' : '公众号';
            const typeClass = isRss ? '' : 'wechat';
            const urlOrId = isRss ? source.url : `微信号: ${source.wechat_id}`;
            
            return `
                <div class="topic-source-item">
                    <input type="checkbox" class="topic-source-checkbox" 
                           id="source-${idx}" data-source-idx="${idx}" checked>
                    <div class="topic-source-info">
                        <div class="topic-source-name">${escapeHtml(source.name)}</div>
                        <div class="topic-source-url">${escapeHtml(urlOrId)}</div>
                        ${source.description ? `<div class="topic-source-desc">${escapeHtml(source.description)}</div>` : ''}
                    </div>
                    <span class="topic-source-type ${typeClass}">${typeLabel}</span>
                </div>
            `;
        }).join('');
        
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
        
        // Get selected sources
        const selectedSources = [];
        document.querySelectorAll('.topic-source-checkbox:checked').forEach(cb => {
            const idx = parseInt(cb.dataset.sourceIdx);
            if (generatedData.recommended_sources[idx]) {
                selectedSources.push(generatedData.recommended_sources[idx]);
            }
        });
        
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="topic-spinner"></span> 创建中...';
        
        try {
            const body = {
                name: name,
                icon: generatedData.icon,
                keywords: generatedData.keywords,
                // TODO: Handle RSS source creation
                rss_source_ids: []
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
                closeModal();
                loadTopics();
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
     * Refresh a topic's news
     */
    function refreshTopic(topicId) {
        loadTopicNews(topicId);
    }

    /**
     * Edit a topic
     */
    function editTopic(topicId) {
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        
        currentEditTopic = topic;
        generatedData = {
            icon: topic.icon || '🏷️',
            keywords: [...topic.keywords],
            recommended_sources: []
        };
        
        modalTitle.textContent = '编辑主题';
        topicNameInput.value = topic.name;
        submitBtn.textContent = '保存更改';
        submitBtn.disabled = false;
        
        renderGeneratedData();
        document.getElementById('topicSourcesGroup').style.display = 'none';
        
        modalOverlay.classList.add('active');
    }

    /**
     * Delete a topic
     */
    async function deleteTopic(topicId) {
        const topic = topics.find(t => t.id === topicId);
        if (!topic) return;
        
        if (!confirm(`确定要删除主题「${topic.name}」吗？`)) return;
        
        try {
            const response = await fetch(`/api/topics/${topicId}`, {
                method: 'DELETE',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (data.ok) {
                // Switch to my-tags tab before removing
                if (typeof window.switchTab === 'function') {
                    window.switchTab('my-tags');
                }
                loadTopics();
            } else {
                alert(data.error || '删除失败');
            }
        } catch (e) {
            console.error('Delete topic failed:', e);
            alert('删除失败，请重试');
        }
    }

    // ==================== Topic Context Menu ====================
    
    let topicMenuEl = null;
    let topicMenuBackdrop = null;
    let currentMenuTopic = null;
    
    /**
     * Create topic context menu elements
     */
    function ensureTopicMenuExists() {
        if (topicMenuEl) return;
        
        // Backdrop
        topicMenuBackdrop = document.createElement('div');
        topicMenuBackdrop.className = 'topic-context-menu-backdrop';
        topicMenuBackdrop.addEventListener('click', hideTopicContextMenu);
        document.body.appendChild(topicMenuBackdrop);
        
        // Menu
        topicMenuEl = document.createElement('div');
        topicMenuEl.className = 'topic-context-menu';
        topicMenuEl.innerHTML = `
            <div class="topic-context-menu-item" data-action="refresh">
                <span class="topic-context-menu-icon">🔄</span>
                <span>刷新</span>
            </div>
            <div class="topic-context-menu-item" data-action="edit">
                <span class="topic-context-menu-icon">⚙️</span>
                <span>编辑主题</span>
            </div>
            <div class="topic-context-menu-divider"></div>
            <div class="topic-context-menu-item danger" data-action="delete">
                <span class="topic-context-menu-icon">🗑️</span>
                <span>删除主题</span>
            </div>
        `;
        topicMenuEl.addEventListener('click', handleTopicMenuClick);
        document.body.appendChild(topicMenuEl);
    }
    
    /**
     * Show topic context menu
     */
    function showTopicContextMenu(x, y, topic) {
        ensureTopicMenuExists();
        currentMenuTopic = topic;
        
        // Position menu
        const menuWidth = 160;
        const menuHeight = 140;
        const padding = 10;
        
        let finalX = x;
        let finalY = y;
        
        if (x + menuWidth > window.innerWidth - padding) {
            finalX = window.innerWidth - menuWidth - padding;
        }
        if (finalY + menuHeight > window.innerHeight - padding) {
            finalY = y - menuHeight;
        }
        
        topicMenuEl.style.left = `${finalX}px`;
        topicMenuEl.style.top = `${finalY}px`;
        
        topicMenuBackdrop.classList.add('show');
        topicMenuEl.classList.add('show');
    }
    
    /**
     * Hide topic context menu
     */
    function hideTopicContextMenu() {
        if (topicMenuEl) topicMenuEl.classList.remove('show');
        if (topicMenuBackdrop) topicMenuBackdrop.classList.remove('show');
        currentMenuTopic = null;
    }
    
    /**
     * Handle topic menu item click
     */
    function handleTopicMenuClick(e) {
        const item = e.target.closest('.topic-context-menu-item');
        if (!item || !currentMenuTopic) return;
        
        const action = item.dataset.action;
        const topic = currentMenuTopic;
        
        hideTopicContextMenu();
        
        switch (action) {
            case 'refresh':
                refreshTopic(topic.id);
                break;
            case 'edit':
                editTopic(topic.id);
                break;
            case 'delete':
                deleteTopic(topic.id);
                break;
        }
    }

    // Utility functions
    function escapeHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;')
                  .replace(/</g, '&lt;')
                  .replace(/>/g, '&gt;')
                  .replace(/"/g, '&quot;');
    }

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
        loadTopics
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
