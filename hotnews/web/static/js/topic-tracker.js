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
        
        // 监听 DOM 变化，如果按钮被移除则重新添加
        const observer = new MutationObserver((mutations) => {
            if (!document.getElementById('newTopicBtn')) {
                console.log('[TopicTracker] Button removed, re-adding...');
                observer.disconnect();
                setTimeout(() => {
                    addNewTopicButton();
                    // 重新设置主题 tab 的事件监听
                    setupTopicTabListeners();
                }, 100);
            }
        });
        observer.observe(categoryTabs, { childList: true, subtree: false });
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
                // 主题 tabs 现在由服务端注入，不需要前端渲染
                // 但需要设置事件监听来加载新闻
                setupTopicTabListeners();
            } else {
                // 未登录或其他错误，清空主题
                console.log('[TopicTracker] Load topics failed:', data.detail || data.error);
                topics = [];
            }
        } catch (e) {
            console.error('Failed to load topics:', e);
            topics = [];
        }
    }

    /**
     * Setup click listeners for topic tabs to load news
     */
    function setupTopicTabListeners() {
        // 监听 tab 切换，当切换到主题 tab 时加载新闻
        document.querySelectorAll('.category-tab[data-category^="topic-"]').forEach(tab => {
            const catId = tab.dataset.category;
            const topicId = catId.replace('topic-', '');
            
            // 添加点击事件来加载新闻
            tab.addEventListener('click', () => {
                setTimeout(() => loadTopicNewsIfNeeded(topicId), 100);
            });
        });
    }

    /**
     * Load topic news if not already loaded
     */
    function loadTopicNewsIfNeeded(topicId) {
        const grid = document.getElementById(`topicCards-${topicId}`);
        if (!grid) return;
        
        // 检查是否已加载（没有 placeholder）
        if (!grid.querySelector('.news-placeholder')) return;
        
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
        
        // 只渲染有新闻的关键词卡片
        const cardsHtml = topic.keywords
            .filter(keyword => {
                const news = keywordsNews[keyword] || [];
                return news.length > 0;
            })
            .map(keyword => {
                const news = keywordsNews[keyword] || [];
                return renderKeywordCard(keyword, news);
            })
            .join('');
        
        // 如果所有关键词都没有新闻，显示提示
        if (!cardsHtml) {
            container.innerHTML = `
                <div class="topic-no-news-hint">
                    <div class="topic-no-news-icon">📭</div>
                    <div class="topic-no-news-text">暂无匹配的新闻</div>
                    <div class="topic-no-news-tip">请编辑主题调整关键词或添加更多数据源</div>
                </div>
            `;
        } else {
            container.innerHTML = cardsHtml;
        }
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
        if (window.authState && typeof window.authState.getUser === 'function') {
            return !!window.authState.getUser();
        }
        // Fallback: check for session cookie
        return document.cookie.includes('hotnews_session=');
    }
    
    /**
     * Open login modal
     */
    function showLoginModal() {
        if (typeof window.openLoginModal === 'function') {
            window.openLoginModal();
        } else {
            alert('请先登录');
        }
    }

    /**
     * Open modal for new topic
     */
    function openModal() {
        // Check if user is logged in
        if (!isUserLoggedIn()) {
            showLoginModal();
            return;
        }
        
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
        aiGenerateBtn.classList.add('loading');
        
        // 显示进度提示
        const progressSteps = [
            '🤖 正在分析主题...',
            '🔍 正在生成关键词...',
            '📡 正在搜索数据源...',
            '✅ 正在验证数据源...'
        ];
        let stepIndex = 0;
        
        const updateProgress = () => {
            aiGenerateBtn.innerHTML = `<span class="topic-spinner"></span> ${progressSteps[stepIndex]}`;
        };
        updateProgress();
        
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
            clearInterval(progressInterval);
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
                
                return `
                    <div class="topic-source-item">
                        <input type="checkbox" class="topic-source-checkbox" 
                               id="source-${idx}" data-source-idx="${idx}" checked>
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
                closeModal();
                await loadTopics();
                
                // Switch to the created/edited topic tab
                if (topicId) {
                    switchToTopicTab(topicId);
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
     * Refresh a topic's news
     */
    function refreshTopic(topicId) {
        loadTopicNews(topicId);
    }

    /**
     * Edit a topic
     */
    async function editTopic(topicId) {
        // Check if user is logged in
        if (!isUserLoggedIn()) {
            showLoginModal();
            return;
        }
        
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
        refreshWechatQR
    };

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
