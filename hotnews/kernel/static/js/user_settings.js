/**
 * User Settings Page JavaScript
 */

let currentUser = null;
let allTags = [];
let userPrefs = [];

// Local state for optimistic updates (extended for unified following)
const localState = {
    // Tag state
    followed: new Set(),
    tagOrder: [],
    
    // Source state
    subscribedSources: new Set(),
    sourceDetails: new Map(),  // source_id -> {id, type, name, url}
    
    // Keyword state
    userKeywords: [],
    
    // Unified following order
    followingOrder: [],  // Array of {type: 'tag'|'source', id: string}
    
    // Pending operations
    pending: new Map(),  // id -> { operation, timestamp, itemType }
    
    // UI state
    activeMainTab: 'recommendations',
    sourceSearchQuery: '',
    sourceSearchResults: [],
};

// WeChat local state
const wechatState = {
    authStatus: null,  // 'valid', 'expired', 'none'
    expiresAt: null,
    subscriptions: [],
    searchResults: [],
    searchLoading: false,
};

// QR Login state
const qrLoginState = {
    polling: false,
    pollTimer: null,
    sessionId: null,
};

// Helper function to clear my-tags frontend cache
function clearMyTagsCache() {
    try {
        localStorage.removeItem('hotnews_my_tags_cache');
        console.log('[Settings] Cleared my-tags cache');
    } catch (e) {
        console.error('[Settings] Failed to clear my-tags cache:', e);
    }
}

// Clear all relevant caches
function clearRelevantCaches() {
    clearMyTagsCache();
}

// Helper to get proxied avatar URL for WeChat images
function getProxiedAvatarUrl(url) {
    if (!url) return '';
    return `/api/wechat/img-proxy?url=${encodeURIComponent(url)}`;
}

async function init() {
    try {
        // Check auth
        const meResp = await fetch('/api/auth/me');
        if (!meResp.ok) {
            window.location.href = '/api/auth/page';
            return;
        }
        const meData = await meResp.json();
        
        if (!meData.ok || !meData.user) {
            window.location.href = '/api/auth/page';
            return;
        }
        
        currentUser = meData.user;

        // Setup user avatar
        const userName = currentUser.nickname || currentUser.email || '用户';
        const userInitial = userName[0].toUpperCase();
        document.getElementById('user-avatar').textContent = userInitial;

        // Load data in parallel
        const [tagsResp, settingsResp, prefsResp, subscriptionsResp, keywordsResp, wechatSubsResp] = await Promise.all([
            fetch('/api/admin/tags/public/all'),
            fetch('/api/user/preferences/tag-settings'),
            fetch('/api/user/preferences/tags'),
            fetch('/api/sources/subscriptions'),
            fetch('/api/user/keywords'),
            fetch('/api/wechat/subscriptions').catch(() => ({ ok: false })),
        ]);

        const tagsData = await tagsResp.json();
        const settingsData = await settingsResp.json();
        const prefsData = await prefsResp.json();
        const subscriptionsData = subscriptionsResp.ok ? await subscriptionsResp.json() : { subscriptions: [] };
        const keywordsData = keywordsResp.ok ? await keywordsResp.json() : { keywords: [] };
        const wechatSubsData = wechatSubsResp.ok ? await wechatSubsResp.json() : { subscriptions: [] };

        allTags = [...(tagsData.categories || []), ...(tagsData.topics || []), ...(tagsData.attributes || [])];
        userPrefs = prefsData.preferences || [];

        syncLocalState(settingsData, subscriptionsData, keywordsData, wechatSubsData);
        render();
        loadRecommendations();

        // Setup search handlers
        document.getElementById('tag-search').addEventListener('input', debounce(handleSearch, 300));
        document.getElementById('source-search').addEventListener('input', debounce(handleSourceSearch, 300));
    } catch (e) {
        console.error(e);
        document.getElementById('loading').textContent = '加载失败: ' + e.message;
    }
}

function syncLocalState(settingsData, subscriptionsData, keywordsData, wechatSubsData) {
    // Tags
    localState.followed = new Set((settingsData.followed || []).map(f => f.tag_id));
    localState.tagOrder = (settingsData.followed || []).map(f => f.tag_id);
    
    // Sources
    const subs = subscriptionsData?.subscriptions || [];
    localState.subscribedSources = new Set(subs.map(s => s.id));
    subs.forEach(s => localState.sourceDetails.set(s.id, s));
    
    // Keywords
    localState.userKeywords = keywordsData?.keywords || [];
    
    // WeChat subscriptions
    wechatState.subscriptions = wechatSubsData?.subscriptions || [];
    
    buildUnifiedOrder();
}

function buildUnifiedOrder() {
    localState.followingOrder = [
        ...localState.tagOrder.map(id => ({ type: 'tag', id })),
        ...[...localState.subscribedSources].map(id => ({ type: 'source', id })),
        ...localState.userKeywords.map(kw => ({ type: 'keyword', id: kw.id, keyword: kw.keyword })),
        ...wechatState.subscriptions.map(mp => ({ type: 'wechat', id: mp.fakeid, nickname: mp.nickname })),
    ];
}

function getTagById(tagId) {
    return allTags.find(t => t.id === tagId);
}

function getTagState(tagId) {
    if (localState.followed.has(tagId)) return 'follow';
    return 'neutral';
}

function render() {
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    // Stats
    const totalClicks = userPrefs.reduce((s, p) => s + p.click_count, 0);
    const topTag = userPrefs[0]?.tag?.name || '-';
    document.getElementById('stats').innerHTML = `
        <div class="stat-card"><div class="value">${localState.followed.size}</div><div class="label">关注标签</div></div>
        <div class="stat-card"><div class="value">${localState.subscribedSources.size}</div><div class="label">订阅源</div></div>
        <div class="stat-card"><div class="value">${wechatState.subscriptions.length}</div><div class="label">公众号</div></div>
        <div class="stat-card"><div class="value">${topTag}</div><div class="label">最感兴趣</div></div>
    `;

    renderFollowingList();
    renderAllTags();
}

function renderFollowingList() {
    const container = document.getElementById('following-list');
    
    if (localState.followingOrder.length === 0) {
        container.innerHTML = '<div class="empty-state">还没有关注任何内容，在下方添加标签、订阅源、关键词或公众号</div>';
        return;
    }
    
    const html = localState.followingOrder.map(item => {
        if (item.type === 'tag') {
            const tag = getTagById(item.id);
            if (!tag) return '';
            return createFollowedTagChipHTML(tag);
        } else if (item.type === 'source') {
            const source = localState.sourceDetails.get(item.id);
            if (!source) return '';
            return createSubscribedSourceChipHTML(source);
        } else if (item.type === 'keyword') {
            return createKeywordChipHTML(item);
        } else if (item.type === 'wechat') {
            return createWechatChipHTML(item);
        }
        return '';
    }).join('');
    
    container.innerHTML = html;
    initSortable();
}

function createFollowedTagChipHTML(tag) {
    return `
        <div class="tag-chip followed draggable" data-id="${tag.id}" data-type="tag" draggable="true">
            <span class="drag-handle" title="拖动调整顺序">☰</span>
            <span class="icon">${tag.icon || '🏷️'}</span>
            <span class="tag-name clickable" onclick="unfollowTag('${tag.id}')" title="点击取消关注">${tag.name}</span>
        </div>
    `;
}

function createSubscribedSourceChipHTML(source) {
    const icon = source.type === 'custom' ? '🔗' : '📰';
    return `
        <div class="source-chip draggable" data-id="${source.id}" data-type="source" draggable="true">
            <span class="drag-handle" title="拖动调整顺序">☰</span>
            <span class="icon">${icon}</span>
            <span class="source-name-text" onclick="unsubscribeSource('${source.id}', '${source.type}')" title="点击取消订阅">${source.name || source.id}</span>
        </div>
    `;
}

function createKeywordChipHTML(item) {
    return `
        <div class="keyword-chip draggable" data-id="${item.id}" data-type="keyword" draggable="true">
            <span class="drag-handle" title="拖动调整顺序">☰</span>
            <span class="icon">🔑</span>
            <span class="keyword-name-text" onclick="deleteKeyword(${item.id})" title="点击删除关键词">${item.keyword}</span>
        </div>
    `;
}

function createWechatChipHTML(item) {
    const fakeid = item.id || item.fakeid;
    const nickname = item.nickname || '';
    return `
        <div class="wechat-chip draggable" data-id="${fakeid}" data-type="wechat" draggable="true">
            <span class="drag-handle" title="拖动调整顺序">☰</span>
            <span class="icon">💬</span>
            <span class="wechat-name-text" onclick="unsubscribeWechatMP('${fakeid}')" title="点击取消订阅">${nickname}</span>
        </div>
    `;
}

function renderAllTags() {
    const grouped = { category: [], topic: [], attribute: [] };
    allTags.forEach(t => {
        if (!localState.followed.has(t.id) && grouped[t.type]) {
            grouped[t.type].push(t);
        }
    });

    let allTagsHtml = '';
    for (const [type, tags] of Object.entries(grouped)) {
        if (tags.length === 0) continue;
        const typeName = { category: '大类', topic: '主题', attribute: '属性' }[type] || type;
        allTagsHtml += `<div class="tag-group"><div class="tag-group-title">${typeName}</div><div class="tags-grid">`;
        tags.forEach(tag => {
            allTagsHtml += createUnfollowedTagChipHTML(tag);
        });
        allTagsHtml += '</div></div>';
    }
    document.getElementById('all-tags').innerHTML = allTagsHtml || '<div class="empty-state">所有标签都已关注</div>';
}

function createUnfollowedTagChipHTML(tag) {
    return `
        <div class="tag-chip clickable-tag" data-id="${tag.id}" onclick="followTag('${tag.id}')" title="点击关注">
            <span class="icon">${tag.icon || '🏷️'}</span>
            <span class="tag-name">${tag.name}</span>
        </div>
    `;
}


// ========== Tag Functions ==========

async function followTag(tagId) {
    await setTagPreference(tagId, 'follow');
}

async function unfollowTag(tagId) {
    await setTagPreference(tagId, 'neutral');
}

async function setTagPreference(tagId, preference) {
    if (localState.pending.has(tagId)) return;

    const oldState = getTagState(tagId);
    if (oldState === preference) {
        preference = 'neutral';
    }

    localState.pending.set(tagId, { operation: preference, timestamp: Date.now() });
    updateLocalState(tagId, preference);
    updateTagUI(tagId, preference);

    try {
        const response = await fetch('/api/user/preferences/tag-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag_id: tagId, preference })
        });

        if (!response.ok) throw new Error('请求失败');

        localState.pending.delete(tagId);
        showSuccessIcon(tagId);
        clearMyTagsCache();
    } catch (error) {
        console.error('Failed to update tag preference:', error);
        localState.pending.delete(tagId);
        updateLocalState(tagId, oldState);
        updateTagUI(tagId, oldState);
        showToast('操作失败，请重试', 'error');
    }
}

function updateLocalState(tagId, preference) {
    if (preference === 'follow') {
        if (!localState.followed.has(tagId)) {
            localState.followed.add(tagId);
            localState.tagOrder.push(tagId);
        }
    } else {
        localState.followed.delete(tagId);
        localState.tagOrder = localState.tagOrder.filter(id => id !== tagId);
    }
    buildUnifiedOrder();
}

function updateTagUI(tagId, preference) {
    renderFollowingList();
    renderAllTags();
    updateStats();
}

function updateStats() {
    const statsHtml = document.getElementById('stats');
    const statCards = statsHtml.querySelectorAll('.stat-card .value');
    if (statCards[0]) statCards[0].textContent = localState.followed.size;
    if (statCards[1]) statCards[1].textContent = localState.subscribedSources.size;
}

// ========== Tab Switching ==========

function switchMainTab(tab) {
    localState.activeMainTab = tab;
    
    document.querySelectorAll('#main-tabs .tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    
    document.getElementById('recommendations-tab-content').style.display = tab === 'recommendations' ? 'block' : 'none';
    document.getElementById('tag-selector-content').style.display = tab === 'tags' ? 'block' : 'none';
    document.getElementById('source-selector-content').style.display = tab === 'sources' ? 'block' : 'none';
    document.getElementById('keywords-tab-content').style.display = tab === 'keywords' ? 'block' : 'none';
    document.getElementById('wechat-tab-content').style.display = tab === 'wechat' ? 'block' : 'none';
    
    if (tab === 'keywords') loadKeywords();
    if (tab === 'wechat') {
        loadWechatAuthStatus();
        loadWechatSubscriptions();
    }
}

// ========== Source Functions ==========

async function handleSourceSearch(e) {
    const query = (e?.target?.value || '').trim();
    localState.sourceSearchQuery = query;
    
    if (query.length < 2) {
        localState.sourceSearchResults = [];
        renderSourceResults();
        return;
    }
    
    try {
        const resp = await fetch(`/api/sources/search?q=${encodeURIComponent(query)}&limit=20`);
        if (!resp.ok) throw new Error('Search failed');
        
        const data = await resp.json();
        localState.sourceSearchResults = data.sources || [];
        renderSourceResults();
    } catch (error) {
        console.error('[Settings] Source search error:', error);
        showToast('搜索失败', 'error');
    }
}

function renderSourceResults() {
    const container = document.getElementById('source-results');
    const results = localState.sourceSearchResults;
    const query = localState.sourceSearchQuery;
    
    if (query.length < 2) {
        container.innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">输入关键词搜索</div>
                <div class="empty-desc">搜索 RSS 源名称或网址（至少2个字符）</div>
            </div>
        `;
        return;
    }
    
    if (results.length === 0) {
        container.innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">😕</div>
                <div class="empty-title">未找到相关源</div>
                <div class="empty-desc">尝试其他关键词</div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = results.map(source => createSourceResultHTML(source)).join('');
    
    container.querySelectorAll('.source-sub-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sourceId = btn.dataset.sourceId;
            const sourceType = btn.dataset.sourceType;
            const isSubscribed = btn.classList.contains('subscribed');
            
            if (isSubscribed) {
                unsubscribeSource(sourceId, sourceType);
            } else {
                subscribeSource(sourceId, sourceType);
            }
        });
    });
}

function createSourceResultHTML(source) {
    const isSubscribed = localState.subscribedSources.has(source.id);
    let domain = '';
    try {
        domain = source.url ? new URL(source.url).hostname : source.category || '';
    } catch (e) {
        domain = source.category || '';
    }
    
    const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : '';
    const iconHtml = faviconUrl 
        ? `<img src="${faviconUrl}" alt="" style="width:24px;height:24px;border-radius:4px;object-fit:contain;background:#fff;">`
        : (source.type === 'custom' ? '🔗' : '📰');
    
    return `
        <div class="source-card" data-source-id="${source.id}">
            <div class="source-card-header" onclick="toggleSourcePreview('${source.id}')">
                <div class="source-icon">${iconHtml}</div>
                <div class="source-info">
                    <div class="source-name">${source.name || source.id}</div>
                    <div class="source-meta">
                        <span>${domain}</span>
                        <span class="source-expand-icon">▼</span>
                    </div>
                </div>
                <button class="source-sub-btn ${isSubscribed ? 'subscribed' : ''}"
                        data-source-id="${source.id}"
                        data-source-type="${source.type}"
                        onclick="event.stopPropagation()">
                    ${isSubscribed ? '已订阅 ✓' : '+ 订阅'}
                </button>
            </div>
            <div class="source-preview" id="preview-${source.id}">
                <div class="source-preview-inner">
                    <div class="source-preview-loading">点击展开预览最新内容...</div>
                </div>
            </div>
        </div>
    `;
}

async function toggleSourcePreview(sourceId) {
    const card = document.querySelector(`.source-card[data-source-id="${sourceId}"]`);
    const preview = document.getElementById(`preview-${sourceId}`);
    if (!card || !preview) return;
    
    const isExpanded = card.classList.contains('expanded');
    
    if (isExpanded) {
        card.classList.remove('expanded');
        preview.classList.remove('expanded');
    } else {
        card.classList.add('expanded');
        preview.classList.add('expanded');
        
        if (preview.dataset.loaded === 'true') return;
        
        const inner = preview.querySelector('.source-preview-inner');
        if (inner) inner.innerHTML = '<div class="source-preview-loading">加载中...</div>';
        
        try {
            const resp = await fetch(`/api/sources/preview/${encodeURIComponent(sourceId)}?limit=10`);
            if (!resp.ok) throw new Error('Failed to load');
            
            const data = await resp.json();
            if (!data.ok) throw new Error(data.error || 'Failed');
            
            if (data.entries && data.entries.length > 0) {
                const listHtml = data.entries.map(entry => {
                    const dateStr = entry.published_at ? new Date(entry.published_at * 1000).toLocaleDateString('zh-CN') : '';
                    return `
                        <li class="source-preview-item">
                            <a href="${entry.url}" target="_blank" rel="noopener">${entry.title}</a>
                            ${dateStr ? `<div class="preview-date">${dateStr}</div>` : ''}
                        </li>
                    `;
                }).join('');
                if (inner) inner.innerHTML = `<ul class="source-preview-list">${listHtml}</ul>`;
            } else {
                if (inner) inner.innerHTML = '<div class="source-preview-loading">暂无内容</div>';
            }
            preview.dataset.loaded = 'true';
        } catch (e) {
            console.error('[Settings] Preview error:', e);
            if (inner) inner.innerHTML = '<div class="source-preview-loading">加载失败</div>';
        }
    }
}

async function subscribeSource(sourceId, sourceType) {
    if (localState.pending.has(sourceId)) return;
    
    localState.pending.set(sourceId, { operation: 'subscribe', timestamp: Date.now(), itemType: 'source' });
    localState.subscribedSources.add(sourceId);
    
    const source = localState.sourceSearchResults.find(s => s.id === sourceId);
    if (source) localState.sourceDetails.set(sourceId, source);
    
    buildUnifiedOrder();
    renderFollowingList();
    updateSourceSearchUI(sourceId, true);
    updateStats();
    
    try {
        const resp = await fetch('/api/sources/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_type: sourceType, source_id: sourceId })
        });
        
        if (!resp.ok) throw new Error('Subscribe failed');
        
        localState.pending.delete(sourceId);
        clearRelevantCaches();
        showToast('订阅成功', 'success');
    } catch (error) {
        console.error('[Settings] Subscribe error:', error);
        localState.pending.delete(sourceId);
        localState.subscribedSources.delete(sourceId);
        localState.sourceDetails.delete(sourceId);
        buildUnifiedOrder();
        renderFollowingList();
        updateSourceSearchUI(sourceId, false);
        updateStats();
        showToast('订阅失败，请重试', 'error');
    }
}

async function unsubscribeSource(sourceId, sourceType) {
    if (localState.pending.has(sourceId)) return;
    
    const oldSource = localState.sourceDetails.get(sourceId);
    
    localState.pending.set(sourceId, { operation: 'unsubscribe', timestamp: Date.now(), itemType: 'source' });
    localState.subscribedSources.delete(sourceId);
    buildUnifiedOrder();
    renderFollowingList();
    updateSourceSearchUI(sourceId, false);
    updateStats();
    
    try {
        const resp = await fetch('/api/sources/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source_type: sourceType || 'rss', source_id: sourceId })
        });
        
        if (!resp.ok) throw new Error('Unsubscribe failed');
        
        localState.pending.delete(sourceId);
        localState.sourceDetails.delete(sourceId);
        clearRelevantCaches();
        showToast('已取消订阅', 'success');
    } catch (error) {
        console.error('[Settings] Unsubscribe error:', error);
        localState.pending.delete(sourceId);
        localState.subscribedSources.add(sourceId);
        if (oldSource) localState.sourceDetails.set(sourceId, oldSource);
        buildUnifiedOrder();
        renderFollowingList();
        updateSourceSearchUI(sourceId, true);
        updateStats();
        showToast('取消订阅失败，请重试', 'error');
    }
}

function updateSourceSearchUI(sourceId, isSubscribed) {
    const btn = document.querySelector(`.source-sub-btn[data-source-id="${sourceId}"]`);
    if (btn) {
        btn.classList.toggle('subscribed', isSubscribed);
        btn.textContent = isSubscribed ? '已订阅 ✓' : '+ 订阅';
    }
}


// ========== Keyword Functions ==========

async function loadKeywords() {
    try {
        const resp = await fetch('/api/user/keywords');
        if (!resp.ok) {
            if (resp.status === 401) {
                renderKeywordsList([]);
                return;
            }
            throw new Error('Failed to load keywords');
        }
        
        const data = await resp.json();
        localState.userKeywords = data.keywords || [];
        renderKeywordsList(localState.userKeywords);
    } catch (e) {
        console.error('[Settings] Load keywords error:', e);
        renderKeywordsList([]);
    }
}

function renderKeywordsList(keywords) {
    const container = document.getElementById('keywords-list');
    
    if (!keywords || keywords.length === 0) {
        container.innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">🔑</div>
                <div class="empty-title">还没有添加关键词</div>
                <div class="empty-desc">添加你感兴趣的关键词，获取个性化内容推荐</div>
            </div>
        `;
        return;
    }
    
    const html = keywords.map(kw => {
        const typeLabel = kw.keyword_type === 'fuzzy' ? '模糊' : '精确';
        const excludeBadge = kw.is_exclude ? '<span class="keyword-badge exclude">排除</span>' : '';
        const matchInfo = kw.match_count > 0 ? `匹配 ${kw.match_count} 次` : '暂无匹配';
        
        return `
            <div class="keyword-item" data-keyword-id="${kw.id}">
                <div class="keyword-icon">🔑</div>
                <div class="keyword-info">
                    <div class="keyword-text">${kw.keyword}</div>
                    <div class="keyword-meta">
                        <span class="keyword-badge">${typeLabel}</span>
                        ${excludeBadge}
                        <span>${matchInfo}</span>
                    </div>
                </div>
                <button class="keyword-delete-btn" onclick="deleteKeyword(${kw.id})">删除</button>
            </div>
        `;
    }).join('');
    
    container.innerHTML = `<div class="keyword-list">${html}</div>`;
}

async function addKeyword() {
    const input = document.getElementById('keyword-input');
    const keyword = (input.value || '').trim();
    
    if (!keyword || keyword.length < 2) {
        showToast('关键词至少需要2个字符', 'error');
        return;
    }
    
    try {
        const resp = await fetch('/api/user/keywords', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                keyword: keyword,
                keyword_type: 'exact',
                priority: 0,
            })
        });
        
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Failed to add keyword');
        }
        
        const data = await resp.json();
        
        const newKeyword = {
            id: data.keyword_id,
            keyword: keyword,
            keyword_type: 'exact',
            match_count: 0,
            enabled: 1,
        };
        localState.userKeywords.push(newKeyword);
        
        buildUnifiedOrder();
        renderFollowingList();
        renderKeywordsList(localState.userKeywords);
        
        input.value = '';
        showToast('关键词添加成功', 'success');
        
    } catch (e) {
        console.error('[Settings] Add keyword error:', e);
        showToast('添加失败: ' + e.message, 'error');
    }
}

async function deleteKeyword(keywordId) {
    localState.userKeywords = localState.userKeywords.filter(kw => kw.id !== keywordId);
    buildUnifiedOrder();
    renderFollowingList();
    renderKeywordsList(localState.userKeywords);
    
    try {
        const resp = await fetch(`/api/user/keywords/${keywordId}`, { method: 'DELETE' });
        if (!resp.ok) throw new Error('Failed to delete');
        showToast('关键词已删除', 'success');
    } catch (e) {
        console.error('[Settings] Delete keyword error:', e);
        showToast('删除失败', 'error');
    }
}

// ========== WeChat MP Functions ==========

async function loadWechatAuthStatus() {
    const authSection = document.getElementById('wechat-auth-section');
    const searchSection = document.getElementById('wechat-search-section');
    const statusContainer = document.getElementById('wechat-auth-status');
    
    statusContainer.innerHTML = `
        <div class="source-empty-state">
            <div class="empty-icon">⏳</div>
            <div class="empty-title">检查中...</div>
        </div>
    `;
    
    // Also check expiration warning
    checkWechatExpirationWarning();
    
    try {
        const resp = await fetch('/api/wechat/auth/auto', { method: 'POST' });
        if (!resp.ok) {
            if (resp.status === 401) {
                showWechatQRLogin();
                showWechatTabWarningDot(true);
                return;
            }
            throw new Error('Failed to check auth');
        }
        
        const data = await resp.json();
        
        if (data.has_auth) {
            wechatState.authStatus = 'valid';
            wechatState.expiresAt = data.expires_at;
            authSection.style.display = 'none';
            searchSection.style.display = 'block';
            loadWechatSubscriptions();
        } else {
            showWechatQRLogin();
            showWechatTabWarningDot(true);
        }
    } catch (e) {
        console.error('[Settings] Load WeChat auth error:', e);
        showWechatQRLogin();
    }
}

// Check WeChat auth expiration and show warning dot
async function checkWechatExpirationWarning() {
    try {
        const resp = await fetch('/api/wechat/auth/expiration-warning');
        if (!resp.ok) return;
        
        const data = await resp.json();
        if (data.ok && data.show_warning) {
            showWechatTabWarningDot(true);
        } else {
            showWechatTabWarningDot(false);
        }
    } catch (e) {
        console.error('[Settings] Check WeChat expiration error:', e);
    }
}

// Show/hide warning dot on WeChat tab
function showWechatTabWarningDot(show) {
    const dot = document.getElementById('wechatTabWarningDot');
    if (dot) {
        dot.style.display = show ? 'inline-block' : 'none';
    }
}

function showWechatQRLogin() {
    const authSection = document.getElementById('wechat-auth-section');
    const searchSection = document.getElementById('wechat-search-section');
    const statusContainer = document.getElementById('wechat-auth-status');
    
    authSection.style.display = 'block';
    searchSection.style.display = 'none';
    
    // 直接显示加载状态，然后自动获取二维码
    statusContainer.innerHTML = `
        <div class="wechat-qr-login-card" style="text-align:center; padding:24px;">
            <div id="qr-status-area">
                <div style="color:var(--text-muted);">
                    <span class="loading-icon" style="display:inline-block; animation: spin 1s linear infinite;">⟳</span>
                    正在获取二维码...
                </div>
            </div>
            <p style="color:var(--text-muted); font-size:12px; margin-top:16px;">
                ⚠️ <a href="https://mp.weixin.qq.com/cgi-bin/registermidpage?action=index&weblogo=1&lang=zh_CN" target="_blank" style="color:var(--primary);">请注册公众号或服务号</a>
            </p>
        </div>
    `;
    
    // 自动开始获取二维码
    startQRLogin();
}

async function startQRLogin() {
    const statusArea = document.getElementById('qr-status-area');
    statusArea.innerHTML = `
        <div style="color:var(--text-muted);">
            <span class="loading-icon" style="display:inline-block; animation: spin 1s linear infinite;">⟳</span>
            正在获取二维码...
        </div>
    `;
    
    try {
        const startResp = await fetch('/api/wechat/auth/qr/start', { method: 'POST' });
        const startData = await startResp.json();
        
        if (!startData.ok) throw new Error(startData.error || '创建会话失败');
        
        qrLoginState.sessionId = startData.session_id;
        const qrUrl = `/api/wechat/auth/qr/image?t=${Date.now()}`;
        
        statusArea.innerHTML = `
            <div style="margin-bottom:12px;">
                <img src="${qrUrl}" alt="登录二维码" style="width:200px; height:200px; border-radius:8px; background:#fff;" 
                     onerror="this.parentElement.innerHTML='<p style=color:var(--error)>二维码加载失败</p>'">
            </div>
            <p style="color:var(--text-muted); font-size:14px;">请使用微信扫描二维码</p>
            <p id="qr-scan-status" style="color:var(--primary); font-size:13px; margin-top:8px;">等待扫码...</p>
            <button class="btn btn-outline" style="margin-top:12px;" onclick="cancelQRLogin()">取消</button>
        `;
        
        qrLoginState.polling = true;
        pollQRStatus();
        
    } catch (e) {
        console.error('[QRLogin] Start error:', e);
        statusArea.innerHTML = `
            <p style="color:var(--error); margin-bottom:16px;">获取二维码失败: ${e.message}</p>
            <button class="btn" onclick="startQRLogin()">重试</button>
        `;
    }
}

async function pollQRStatus() {
    if (!qrLoginState.polling) return;
    
    try {
        const resp = await fetch('/api/wechat/auth/qr/status');
        const data = await resp.json();
        
        const statusEl = document.getElementById('qr-scan-status');
        if (!statusEl) {
            qrLoginState.polling = false;
            return;
        }
        
        if (data.status === 'waiting') {
            statusEl.textContent = '等待扫码...';
            statusEl.style.color = 'var(--text-muted)';
        } else if (data.status === 'scanned') {
            statusEl.textContent = '已扫码，请在手机上确认登录';
            statusEl.style.color = 'var(--warning)';
        } else if (data.status === 'confirmed') {
            statusEl.textContent = '已确认，正在完成登录...';
            statusEl.style.color = 'var(--success)';
            qrLoginState.polling = false;
            await completeQRLogin();
            return;
        } else if (data.status === 'expired' || data.need_refresh) {
            statusEl.textContent = '二维码已过期';
            statusEl.style.color = 'var(--error)';
            qrLoginState.polling = false;
            
            const statusArea = document.getElementById('qr-status-area');
            statusArea.innerHTML = `
                <p style="color:var(--error); margin-bottom:16px;">二维码已过期</p>
                <button class="btn" onclick="startQRLogin()">重新获取</button>
            `;
            return;
        } else if (data.status === 'error') {
            statusEl.textContent = data.message || '出错了';
            statusEl.style.color = 'var(--error)';
        }
        
        if (qrLoginState.polling) {
            qrLoginState.pollTimer = setTimeout(pollQRStatus, 2000);
        }
        
    } catch (e) {
        console.error('[QRLogin] Poll error:', e);
        if (qrLoginState.polling) {
            qrLoginState.pollTimer = setTimeout(pollQRStatus, 3000);
        }
    }
}

async function completeQRLogin() {
    const statusArea = document.getElementById('qr-status-area');
    
    try {
        const resp = await fetch('/api/wechat/auth/qr/complete-and-share', { method: 'POST' });
        const data = await resp.json();
        
        if (!data.ok) throw new Error(data.error || '登录失败');
        
        statusArea.innerHTML = `
            <p style="color:var(--success); font-size:18px; margin-bottom:16px;">✓ 登录成功！</p>
            <p style="color:var(--text-muted); font-size:13px;">正在加载公众号功能...</p>
        `;
        
        showToast('登录成功', 'success');
        
        setTimeout(() => {
            wechatState.authStatus = 'valid';
            wechatState.expiresAt = data.expires_at;
            document.getElementById('wechat-auth-section').style.display = 'none';
            document.getElementById('wechat-search-section').style.display = 'block';
            loadWechatSubscriptions();
        }, 1000);
        
    } catch (e) {
        console.error('[QRLogin] Complete error:', e);
        statusArea.innerHTML = `
            <p style="color:var(--error); margin-bottom:16px;">登录失败: ${e.message}</p>
            <button class="btn" onclick="startQRLogin()">重试</button>
        `;
    }
}

async function cancelQRLogin() {
    qrLoginState.polling = false;
    if (qrLoginState.pollTimer) {
        clearTimeout(qrLoginState.pollTimer);
        qrLoginState.pollTimer = null;
    }
    
    try {
        await fetch('/api/wechat/auth/qr/cancel', { method: 'POST' });
    } catch (e) {}
    
    showWechatQRLogin();
}

async function refreshWechatArticles() {
    const btn = document.getElementById('wechat-refresh-btn');
    const originalText = btn.innerHTML;
    btn.innerHTML = '⟳ 刷新中...';
    btn.disabled = true;
    
    try {
        const resp = await fetch('/api/wechat/refresh', { method: 'POST' });
        const data = await resp.json();
        
        if (data.ok) {
            showToast(data.message, 'success');
        } else {
            showToast(data.error || '刷新失败', 'error');
        }
    } catch (e) {
        console.error('[Settings] Refresh WeChat articles error:', e);
        showToast('刷新失败', 'error');
    } finally {
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function loadWechatSubscriptions() {
    const container = document.getElementById('wechat-subscriptions-list');
    
    try {
        const resp = await fetch('/api/wechat/subscriptions');
        if (!resp.ok) {
            if (resp.status === 401) {
                container.innerHTML = `
                    <div class="source-empty-state">
                        <div class="empty-icon">💬</div>
                        <div class="empty-title">还没有订阅公众号</div>
                        <div class="empty-desc">配置认证后搜索并订阅公众号</div>
                    </div>
                `;
                return;
            }
            throw new Error('Failed to load subscriptions');
        }
        
        const data = await resp.json();
        wechatState.subscriptions = data.subscriptions || [];
        
        renderWechatSubscriptions(wechatState.subscriptions);
        buildUnifiedOrder();
        renderFollowingList();
        
    } catch (e) {
        console.error('[Settings] Load WeChat subscriptions error:', e);
        container.innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">😕</div>
                <div class="empty-title">加载失败</div>
            </div>
        `;
    }
}

function renderWechatSubscriptions(subscriptions) {
    const container = document.getElementById('wechat-subscriptions-list');
    
    if (!subscriptions || subscriptions.length === 0) {
        container.innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">💬</div>
                <div class="empty-title">还没有订阅公众号</div>
                <div class="empty-desc">在上方搜索并订阅公众号</div>
            </div>
        `;
        return;
    }
    
    const html = subscriptions.map(mp => {
        const avatarUrl = getProxiedAvatarUrl(mp.round_head_img);
        const avatarHtml = avatarUrl 
            ? `<img class="wechat-mp-avatar" src="${avatarUrl}" alt="${mp.nickname}" onerror="this.outerHTML='<div class=\\'wechat-mp-avatar-placeholder\\'>💬</div>'">`
            : `<div class="wechat-mp-avatar-placeholder">💬</div>`;
        return `
            <div class="wechat-mp-card" data-fakeid="${mp.fakeid}">
                ${avatarHtml}
                <div class="wechat-mp-info">
                    <div class="wechat-mp-name">${mp.nickname}</div>
                    <div class="wechat-mp-signature">${mp.signature || ''}</div>
                </div>
                <button class="wechat-mp-btn subscribed" onclick="unsubscribeWechatMP('${mp.fakeid}')">
                    已订阅 ✓
                </button>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}


async function searchWechatMP() {
    const input = document.getElementById('wechat-search');
    const keyword = (input.value || '').trim();
    
    if (!keyword || keyword.length < 2) {
        showToast('请输入至少2个字符', 'error');
        return;
    }
    
    const container = document.getElementById('wechat-search-results');
    container.innerHTML = `
        <div class="source-empty-state">
            <div class="empty-icon">⏳</div>
            <div class="empty-title">搜索中...</div>
        </div>
    `;
    
    try {
        const resp = await fetch(`/api/wechat/search?keyword=${encodeURIComponent(keyword)}`);
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Search failed');
        }
        
        const data = await resp.json();
        wechatState.searchResults = data.list || [];
        renderWechatSearchResults(wechatState.searchResults);
        
    } catch (e) {
        console.error('[Settings] Search WeChat MP error:', e);
        container.innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">😕</div>
                <div class="empty-title">搜索失败</div>
                <div class="empty-desc">${e.message}</div>
            </div>
        `;
    }
}

function renderWechatSearchResults(results) {
    const container = document.getElementById('wechat-search-results');
    
    if (!results || results.length === 0) {
        container.innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">🔍</div>
                <div class="empty-title">未找到相关公众号</div>
                <div class="empty-desc">尝试其他关键词</div>
            </div>
        `;
        return;
    }
    
    const subscribedFakeids = new Set(wechatState.subscriptions.map(s => s.fakeid));
    
    const html = results.map(mp => {
        const isSubscribed = subscribedFakeids.has(mp.fakeid);
        const avatarUrl = getProxiedAvatarUrl(mp.round_head_img);
        const originalAvatarUrl = mp.round_head_img || '';
        const avatarHtml = avatarUrl 
            ? `<img class="wechat-mp-avatar" src="${avatarUrl}" alt="${mp.nickname}" onerror="this.outerHTML='<div class=\\'wechat-mp-avatar-placeholder\\'>💬</div>'">`
            : `<div class="wechat-mp-avatar-placeholder">💬</div>`;
        return `
            <div class="wechat-mp-card" data-fakeid="${mp.fakeid}">
                ${avatarHtml}
                <div class="wechat-mp-info">
                    <div class="wechat-mp-name">${mp.nickname}</div>
                    <div class="wechat-mp-signature">${mp.signature || ''}</div>
                </div>
                <button class="wechat-mp-btn ${isSubscribed ? 'subscribed' : ''}" 
                        onclick="${isSubscribed ? `unsubscribeWechatMP('${mp.fakeid}')` : `subscribeWechatMP('${mp.fakeid}', '${mp.nickname}', '${originalAvatarUrl}', '${(mp.signature || '').replace(/'/g, "\\'")}')`}">
                    ${isSubscribed ? '已订阅 ✓' : '+ 订阅'}
                </button>
            </div>
        `;
    }).join('');
    
    container.innerHTML = html;
}

async function subscribeWechatMP(fakeid, nickname, avatar, signature) {
    const btn = document.querySelector(`.wechat-mp-card[data-fakeid="${fakeid}"] .wechat-mp-btn`);
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '订阅中...';
    }
    
    try {
        const resp = await fetch('/api/wechat/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fakeid, nickname, round_head_img: avatar, signature })
        });
        
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Subscribe failed');
        }
        
        const data = await resp.json();
        
        wechatState.subscriptions.push({ fakeid, nickname, round_head_img: avatar, signature });
        
        renderWechatSearchResults(wechatState.searchResults);
        renderWechatSubscriptions(wechatState.subscriptions);
        buildUnifiedOrder();
        renderFollowingList();
        clearRelevantCaches();
        
        const message = data.articles_fetched > 0 
            ? `订阅成功，获取了 ${data.articles_fetched} 篇文章`
            : '订阅成功';
        showToast(message, 'success');
        
    } catch (e) {
        console.error('[Settings] Subscribe WeChat MP error:', e);
        showToast('订阅失败: ' + e.message, 'error');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '+ 订阅';
        }
    }
}

async function unsubscribeWechatMP(fakeid) {
    try {
        const resp = await fetch('/api/wechat/unsubscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fakeid })
        });
        
        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Unsubscribe failed');
        }
        
        wechatState.subscriptions = wechatState.subscriptions.filter(s => s.fakeid !== fakeid);
        
        renderWechatSearchResults(wechatState.searchResults);
        renderWechatSubscriptions(wechatState.subscriptions);
        buildUnifiedOrder();
        renderFollowingList();
        clearRelevantCaches();
        
        showToast('已取消订阅', 'success');
        
    } catch (e) {
        console.error('[Settings] Unsubscribe WeChat MP error:', e);
        showToast('取消订阅失败: ' + e.message, 'error');
    }
}

// ========== UI Helpers ==========

function showSuccessIcon(tagId) {
    const tagElements = document.querySelectorAll(`[data-id="${tagId}"]`);

    tagElements.forEach(element => {
        const actions = element.querySelector('.tag-actions');
        if (!actions) return;

        const existingIcon = actions.querySelector('.loading-icon, .success-icon');
        if (existingIcon) existingIcon.remove();

        const successIcon = document.createElement('span');
        successIcon.className = 'success-icon';
        successIcon.textContent = '✓';
        actions.insertBefore(successIcon, actions.firstChild);

        setTimeout(() => {
            if (successIcon.parentNode) successIcon.remove();
        }, 1000);
    });
}

function showToast(message, type = 'error') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    toast.style.display = 'block';

    setTimeout(() => {
        toast.style.display = 'none';
        toast.remove();
    }, 3000);
}

// ========== Drag and Drop ==========

let draggedElement = null;
let draggedItemId = null;
let draggedItemType = null;

function initSortable() {
    const container = document.getElementById('following-list');
    if (!container) return;

    const chips = container.querySelectorAll('.draggable');
    chips.forEach(chip => {
        chip.addEventListener('dragstart', handleDragStart);
        chip.addEventListener('dragend', handleDragEnd);
        chip.addEventListener('dragover', handleDragOver);
        chip.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    draggedElement = this;
    draggedItemId = this.dataset.id;
    draggedItemType = this.dataset.type;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    draggedElement = null;
    draggedItemId = null;
    draggedItemType = null;
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    if (!draggedElement || this === draggedElement) return;

    const targetId = this.dataset.id;
    const targetType = this.dataset.type;
    
    const fromIdx = localState.followingOrder.findIndex(
        item => item.id === draggedItemId && item.type === draggedItemType
    );
    const toIdx = localState.followingOrder.findIndex(
        item => item.id === targetId && item.type === targetType
    );

    if (fromIdx === -1 || toIdx === -1) return;

    const [removed] = localState.followingOrder.splice(fromIdx, 1);
    localState.followingOrder.splice(toIdx, 0, removed);
    
    localState.tagOrder = localState.followingOrder
        .filter(item => item.type === 'tag')
        .map(item => item.id);

    renderFollowingList();
    saveFollowingOrder();
}

async function saveFollowingOrder() {
    try {
        await fetch('/api/user/preferences/tag-order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order: localState.tagOrder })
        });
    } catch (e) {
        console.error('Failed to save order:', e);
    }
}

// ========== Utilities ==========

function debounce(fn, delay) {
    let timer = null;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ========== Recommendations ==========

async function loadRecommendations() {
    try {
        const resp = await fetch('/api/user/preferences/recommended-tags');
        if (!resp.ok) {
            document.getElementById('recommendations-content').innerHTML = `
                <div class="source-empty-state">
                    <div class="empty-icon">😕</div>
                    <div class="empty-title">加载推荐失败</div>
                </div>
            `;
            return;
        }

        const data = await resp.json();
        if (!data.ok) {
            document.getElementById('recommendations-content').innerHTML = `
                <div class="source-empty-state">
                    <div class="empty-icon">😕</div>
                    <div class="empty-title">暂无推荐</div>
                </div>
            `;
            return;
        }

        const allRecs = [
            ...(data.hot_tags || []).slice(0, 4),
            ...(data.new_tags || []).slice(0, 3),
            ...(data.related_tags || []).slice(0, 3),
        ];

        const content = document.getElementById('recommendations-content');

        if (allRecs.length === 0) {
            content.innerHTML = `
                <div class="source-empty-state">
                    <div class="empty-icon">🎉</div>
                    <div class="empty-title">暂无新推荐</div>
                    <div class="empty-desc">您已关注了大部分推荐标签</div>
                </div>
            `;
            return;
        }

        let html = '';
        for (const tag of allRecs) {
            if (localState.followed.has(tag.id)) continue;
            const badgeLabel = tag.badge === 'hot' ? '🔥 热门' : tag.badge === 'new' ? '✨ 新发现' : '💡 相关';
            html += `
                <div class="rec-card" data-id="${tag.id}">
                    <div class="rec-icon">${tag.icon || '🏷️'}</div>
                    <div class="rec-info">
                        <div class="rec-name">
                            ${tag.name}
                            <span class="rec-badge ${tag.badge}">${badgeLabel}</span>
                        </div>
                        <div class="rec-reason">${tag.reason || ''}</div>
                    </div>
                    <button class="btn btn-follow-rec" onclick="followTag('${tag.id}')">+ 关注</button>
                </div>
            `;
        }

        if (html) {
            content.innerHTML = html;
        } else {
            content.innerHTML = `
                <div class="source-empty-state">
                    <div class="empty-icon">🎉</div>
                    <div class="empty-title">暂无新推荐</div>
                    <div class="empty-desc">您已关注了大部分推荐标签</div>
                </div>
            `;
        }
    } catch (e) {
        console.error('loadRecommendations error:', e);
        document.getElementById('recommendations-content').innerHTML = `
            <div class="source-empty-state">
                <div class="empty-icon">😕</div>
                <div class="empty-title">加载推荐失败</div>
            </div>
        `;
    }
}

// ========== Search & Filter ==========

let currentFilter = 'all';

function handleSearch(e) {
    const query = (e?.target?.value || '').trim().toLowerCase();
    filterAndRenderTags(currentFilter, query);
}

function filterTags(filter) {
    currentFilter = filter;
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === filter);
    });
    const query = document.getElementById('tag-search').value.trim().toLowerCase();
    filterAndRenderTags(filter, query);
}

function filterAndRenderTags(filter, query) {
    let filteredTags = allTags.filter(t => !localState.followed.has(t.id));

    if (['category', 'topic', 'attribute'].includes(filter)) {
        filteredTags = filteredTags.filter(t => t.type === filter);
    } else if (filter === 'hot') {
        filteredTags = filteredTags.sort((a, b) => (a.name || '').length - (b.name || '').length);
    } else if (filter === 'new') {
        filteredTags = filteredTags.filter(t => t.is_dynamic);
    }

    if (query) {
        filteredTags = filteredTags.filter(t =>
            (t.name || '').toLowerCase().includes(query) ||
            (t.name_en || '').toLowerCase().includes(query) ||
            (t.id || '').toLowerCase().includes(query)
        );
    }

    if (filteredTags.length === 0) {
        document.getElementById('all-tags').innerHTML = '<div class="empty-state">没有匹配的标签</div>';
        return;
    }

    if (filter === 'all' && !query) {
        renderAllTags();
    } else {
        let html = '<div class="tags-grid">';
        filteredTags.forEach(tag => {
            html += createUnfollowedTagChipHTML(tag);
        });
        html += '</div>';
        document.getElementById('all-tags').innerHTML = html;
    }
}

// ========== Logout ==========

async function logout() {
    try {
        await fetch('/api/auth/logout', { method: 'POST' });
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('hotnews_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        window.location.href = '/?logout=' + Date.now();
    } catch (e) {
        console.error('Logout failed:', e);
        alert('退出失败，请重试');
    }
}

// ========== Category Settings Modal ==========

// Category settings state
const categorySettingsState = {
    defaultCategories: null,
    allPlatforms: null,
    editingCategoryId: null,
    isAddingNew: false,
    categoryListCollapsed: true,
    platformSearchQuery: '',
    configChanged: false,
};

const CATEGORY_CONFIG_KEY = 'hotnews_categories_config';
const CATEGORY_CONFIG_VERSION = 1;

function getCategoryConfig() {
    try {
        const raw = localStorage.getItem(CATEGORY_CONFIG_KEY);
        if (!raw) return null;
        const config = JSON.parse(raw);
        if (config.version !== CATEGORY_CONFIG_VERSION) return null;
        return normalizeCategoryConfig(config);
    } catch (e) {
        return null;
    }
}

function saveCategoryConfig(config) {
    config.version = CATEGORY_CONFIG_VERSION;
    localStorage.setItem(CATEGORY_CONFIG_KEY, JSON.stringify(config));
}

function normalizeCategoryConfig(config) {
    const base = config && typeof config === 'object' ? config : {};
    if (!Array.isArray(base.customCategories)) base.customCategories = [];
    if (!Array.isArray(base.hiddenDefaultCategories)) base.hiddenDefaultCategories = [];
    if (!Array.isArray(base.hiddenPlatforms)) base.hiddenPlatforms = [];
    if (!Array.isArray(base.categoryOrder)) base.categoryOrder = [];
    if (!base.platformOrder || typeof base.platformOrder !== 'object') base.platformOrder = {};
    if (!base.categoryFilters || typeof base.categoryFilters !== 'object') base.categoryFilters = {};
    return base;
}

async function openCategorySettingsModal() {
    // Fetch categories from server
    try {
        const response = await fetch('/api/news');
        const data = await response.json();
        if (data?.categories) {
            categorySettingsState.defaultCategories = {};
            categorySettingsState.allPlatforms = {};
            Object.entries(data.categories).forEach(([catId, cat]) => {
                categorySettingsState.defaultCategories[catId] = { 
                    id: catId, 
                    name: cat.name, 
                    icon: cat.icon, 
                    isDefault: true, 
                    platforms: Object.keys(cat.platforms || {}) 
                };
                Object.entries(cat.platforms || {}).forEach(([pid, p]) => {
                    categorySettingsState.allPlatforms[pid] = { 
                        id: pid, 
                        name: p.name, 
                        defaultCategory: catId, 
                        data: p 
                    };
                });
            });
        }
    } catch (e) {
        console.error('Failed to fetch categories:', e);
    }
    
    const modal = document.getElementById('categorySettingsModal');
    if (modal) {
        modal.classList.add('show');
        categorySettingsState.categoryListCollapsed = true;
        applyCategoryListCollapseState();
        renderCategoryList();
        hideEditPanel();
    }
}

function closeCategorySettings() {
    const modal = document.getElementById('categorySettingsModal');
    if (modal) {
        modal.classList.remove('show');
    }
    if (categorySettingsState.configChanged) {
        categorySettingsState.configChanged = false;
        // Notify user to refresh homepage
        showToast('栏目设置已保存，返回首页后生效', 'success');
    }
}

function closeCategorySettingsOnOverlay(event) {
    if (event.target.id === 'categorySettingsModal') {
        closeCategorySettings();
    }
}

function saveCategorySettings() {
    const editPanel = document.getElementById('categoryEditPanel');
    const isEditing = editPanel && editPanel.classList.contains('show');
    if (isEditing) {
        const ok = saveCategory();
        if (!ok) return;
    }
    closeCategorySettings();
}

function cancelCategorySettings() {
    categorySettingsState.configChanged = false;
    const modal = document.getElementById('categorySettingsModal');
    if (modal) {
        modal.classList.remove('show');
    }
}

function getDefaultCategoryConfig() {
    return {
        version: CATEGORY_CONFIG_VERSION,
        customCategories: [],
        hiddenDefaultCategories: [],
        hiddenPlatforms: [],
        categoryOrder: Object.keys(categorySettingsState.defaultCategories || {}),
        platformOrder: {},
        categoryFilters: {}
    };
}

function getMergedCategoryConfig() {
    const defaultConfig = getDefaultCategoryConfig();
    const userConfig = getCategoryConfig();
    if (!userConfig) return defaultConfig;

    const merged = {
        ...defaultConfig,
        customCategories: userConfig.customCategories || [],
        hiddenDefaultCategories: userConfig.hiddenDefaultCategories || [],
        hiddenPlatforms: userConfig.hiddenPlatforms || [],
        categoryOrder: userConfig.categoryOrder || defaultConfig.categoryOrder,
        platformOrder: userConfig.platformOrder || {},
        categoryFilters: userConfig.categoryFilters || {}
    };

    // Add missing categories
    Object.keys(categorySettingsState.defaultCategories || {}).forEach(catId => {
        if (!merged.categoryOrder.includes(catId)) {
            merged.categoryOrder.push(catId);
        }
    });

    merged.customCategories.forEach(cat => {
        if (!merged.categoryOrder.includes(cat.id)) {
            merged.categoryOrder.push(cat.id);
        }
    });

    return merged;
}

function renderCategoryList() {
    const container = document.getElementById('categoryList');
    if (!container) return;
    
    const config = getMergedCategoryConfig();
    const defaultCats = categorySettingsState.defaultCategories || {};

    let html = '';
    config.categoryOrder.forEach(catId => {
        const isCustom = config.customCategories.find(c => c.id === catId);
        const isHidden = config.hiddenDefaultCategories.includes(catId);

        let cat;
        if (isCustom) {
            cat = isCustom;
        } else if (defaultCats[catId]) {
            cat = defaultCats[catId];
        } else {
            return;
        }

        const platformCount = isCustom ? (cat.platforms?.length || 0) : (defaultCats[catId]?.platforms?.length || 0);

        html += `
            <div class="category-item ${isCustom ? 'custom' : ''}" data-category-id="${catId}" draggable="true">
                <span class="category-item-drag">☰</span>
                <span class="category-item-name">${cat.name}</span>
                <span class="category-item-platforms">${platformCount} 个平台</span>
                <label class="category-item-toggle">
                    <input type="checkbox" ${!isHidden ? 'checked' : ''} onchange="toggleCategoryVisibility('${catId}')">
                    <span class="slider"></span>
                </label>
                <div class="category-item-actions">
                    <button class="category-item-btn" onclick="editCategory('${catId}')">编辑</button>
                    ${isCustom ? `<button class="category-item-btn delete" onclick="deleteCategory('${catId}')">删除</button>` : ''}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
    setupCategoryDragAndDrop();
}

function applyCategoryListCollapseState() {
    const wrapper = document.getElementById('categoryListWrapper');
    if (wrapper) {
        if (categorySettingsState.categoryListCollapsed) {
            wrapper.classList.add('collapsed');
        } else {
            wrapper.classList.remove('collapsed');
        }
    }

    const btn = document.getElementById('categoryListToggleBtn');
    if (btn) {
        btn.textContent = categorySettingsState.categoryListCollapsed ? '展开栏目列表' : '收起栏目列表';
    }
}

function toggleCategoryListCollapseInSettings() {
    categorySettingsState.categoryListCollapsed = !categorySettingsState.categoryListCollapsed;
    applyCategoryListCollapseState();
}

function toggleCategoryVisibility(catId) {
    const config = getCategoryConfig() || getDefaultCategoryConfig();
    const idx = config.hiddenDefaultCategories.indexOf(catId);
    if (idx >= 0) {
        config.hiddenDefaultCategories.splice(idx, 1);
    } else {
        config.hiddenDefaultCategories.push(catId);
    }
    saveCategoryConfig(config);
    categorySettingsState.configChanged = true;
    renderCategoryList();
}

function setupCategoryDragAndDrop() {
    const container = document.getElementById('categoryList');
    if (!container) return;
    
    const items = container.querySelectorAll('.category-item');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
            saveCategoryOrder();
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = container.querySelector('.dragging');
            if (dragging && dragging !== item) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(dragging, item);
                } else {
                    container.insertBefore(dragging, item.nextSibling);
                }
            }
        });
    });
}

function saveCategoryOrder() {
    const container = document.getElementById('categoryList');
    if (!container) return;
    
    const items = container.querySelectorAll('.category-item');
    const order = Array.from(items).map(item => item.dataset.categoryId);

    const config = getCategoryConfig() || getDefaultCategoryConfig();
    config.categoryOrder = order;
    saveCategoryConfig(config);
    categorySettingsState.configChanged = true;
}

function showAddCategoryPanel() {
    categorySettingsState.isAddingNew = true;
    categorySettingsState.editingCategoryId = null;

    document.getElementById('editCategoryName').value = '';
    renderPlatformSelectList([], true);

    document.getElementById('categoryEditPanel').classList.add('show');
}

function editCategory(catId) {
    categorySettingsState.isAddingNew = false;
    categorySettingsState.editingCategoryId = catId;

    const config = getMergedCategoryConfig();
    const isCustom = config.customCategories.find(c => c.id === catId);
    const defaultCats = categorySettingsState.defaultCategories || {};

    let cat, platforms;
    if (isCustom) {
        cat = isCustom;
        platforms = cat.platforms || [];
    } else {
        cat = defaultCats[catId];
        platforms = config.platformOrder[catId] || cat?.platforms || [];
    }

    document.getElementById('editCategoryName').value = cat?.name || '';
    renderPlatformSelectList(platforms, !!isCustom);

    document.getElementById('categoryEditPanel').classList.add('show');
}

function hideEditPanel() {
    const panel = document.getElementById('categoryEditPanel');
    if (panel) {
        panel.classList.remove('show');
    }
    categorySettingsState.editingCategoryId = null;
    categorySettingsState.isAddingNew = false;
}

function cancelEditCategory() {
    hideEditPanel();
}

function renderPlatformSelectList(selectedPlatforms, isCustomCategory = false) {
    const container = document.getElementById('platformSelectList');
    if (!container) return;
    
    const allPlatforms = categorySettingsState.allPlatforms || {};
    const config = getMergedCategoryConfig();
    const hiddenPlatforms = (config.hiddenPlatforms || []).map(x => String(x || '').trim()).filter(Boolean);
    const hiddenSet = new Set(hiddenPlatforms);

    const sortedPlatforms = [];
    selectedPlatforms.forEach(pid => {
        if (allPlatforms[pid]) sortedPlatforms.push(pid);
    });

    if (isCustomCategory) {
        Object.keys(allPlatforms).forEach(pid => {
            if (!sortedPlatforms.includes(pid)) sortedPlatforms.push(pid);
        });
    }

    const query = (categorySettingsState.platformSearchQuery || '').trim().toLowerCase();
    const visiblePlatforms = query
        ? sortedPlatforms.filter(pid => (allPlatforms[pid]?.name || '').toLowerCase().includes(query))
        : sortedPlatforms;

    container.innerHTML = visiblePlatforms.map(pid => {
        const p = allPlatforms[pid];
        const isSelected = selectedPlatforms.includes(pid) && !hiddenSet.has(String(pid || '').trim());
        return `
            <label class="platform-select-item ${isSelected ? 'selected' : ''}" data-platform-id="${pid}" draggable="true">
                <span class="drag-handle">☰</span>
                <input type="checkbox" ${isSelected ? 'checked' : ''} onchange="togglePlatformSelect('${pid}')">
                <span>${p?.name || pid}</span>
            </label>
        `;
    }).join('');

    setupPlatformDragAndDrop();
}

function setupPlatformDragAndDrop() {
    const container = document.getElementById('platformSelectList');
    if (!container) return;
    
    const items = container.querySelectorAll('.platform-select-item');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            item.classList.add('dragging');
            e.dataTransfer.effectAllowed = 'move';
        });

        item.addEventListener('dragend', () => {
            item.classList.remove('dragging');
        });

        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            const dragging = container.querySelector('.dragging');
            if (dragging && dragging !== item) {
                const rect = item.getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                if (e.clientY < midY) {
                    container.insertBefore(dragging, item);
                } else {
                    container.insertBefore(dragging, item.nextSibling);
                }
            }
        });
    });
}

function togglePlatformSelect(platformId) {
    const item = document.querySelector(`.platform-select-item[data-platform-id="${platformId}"]`);
    if (item) {
        item.classList.toggle('selected');
    }
}

function getSelectedPlatforms() {
    const items = document.querySelectorAll('.platform-select-item');
    const selected = [];
    items.forEach(item => {
        if (item.classList.contains('selected')) {
            selected.push(item.dataset.platformId);
        }
    });
    return selected;
}

function getOrderedPlatforms() {
    const items = document.querySelectorAll('.platform-select-item');
    const ordered = [];
    items.forEach(item => {
        const pid = String(item?.dataset?.platformId || '').trim();
        if (pid) ordered.push(pid);
    });
    return ordered;
}

function setPlatformSearchQuery(query) {
    categorySettingsState.platformSearchQuery = String(query || '');
    const platforms = getSelectedPlatforms();
    renderPlatformSelectList(platforms, categorySettingsState.isAddingNew === true);
}

function bulkSelectPlatforms(mode) {
    const container = document.getElementById('platformSelectList');
    if (!container) return;

    const items = container.querySelectorAll('.platform-select-item');
    items.forEach(item => {
        const checkbox = item.querySelector('input[type="checkbox"]');
        if (mode === 'all') {
            item.classList.add('selected');
            if (checkbox) checkbox.checked = true;
        } else if (mode === 'none' || mode === 'clear') {
            item.classList.remove('selected');
            if (checkbox) checkbox.checked = false;
        }
    });
}

function saveCategory() {
    const name = document.getElementById('editCategoryName').value.trim();
    const platforms = getSelectedPlatforms();
    const orderedPlatforms = getOrderedPlatforms();

    if (!name) {
        alert('请输入栏目名称');
        return false;
    }

    if (platforms.length === 0) {
        alert('请至少选择一个平台');
        return false;
    }

    const config = getCategoryConfig() || getDefaultCategoryConfig();

    if (categorySettingsState.isAddingNew) {
        const newId = 'custom-' + Date.now();
        config.customCategories.push({
            id: newId,
            name,
            icon: '📱',
            platforms,
            isCustom: true
        });
        config.categoryOrder.unshift(newId);
    } else if (categorySettingsState.editingCategoryId) {
        const customIdx = config.customCategories.findIndex(c => c.id === categorySettingsState.editingCategoryId);
        if (customIdx >= 0) {
            config.customCategories[customIdx] = {
                ...config.customCategories[customIdx],
                name,
                platforms
            };
        } else {
            config.platformOrder[categorySettingsState.editingCategoryId] = orderedPlatforms;

            if (!Array.isArray(config.hiddenPlatforms)) config.hiddenPlatforms = [];
            const hiddenSet = new Set((config.hiddenPlatforms || []).map(x => String(x || '').trim()).filter(Boolean));
            orderedPlatforms.forEach(pid => {
                if (!pid) return;
                if (platforms.includes(pid)) {
                    hiddenSet.delete(pid);
                } else {
                    hiddenSet.add(pid);
                }
            });
            config.hiddenPlatforms = Array.from(hiddenSet);
        }
    }

    saveCategoryConfig(config);
    categorySettingsState.configChanged = true;
    hideEditPanel();
    renderCategoryList();

    categorySettingsState.categoryListCollapsed = false;
    applyCategoryListCollapseState();

    return true;
}

function deleteCategory(catId) {
    if (!confirm('确定要删除这个自定义栏目吗？')) return;

    const config = getCategoryConfig() || getDefaultCategoryConfig();
    config.customCategories = config.customCategories.filter(c => c.id !== catId);
    config.categoryOrder = config.categoryOrder.filter(id => id !== catId);
    delete config.platformOrder[catId];

    saveCategoryConfig(config);
    categorySettingsState.configChanged = true;
    renderCategoryList();
}

function resetDefaultCategoryConfig() {
    if (!confirm('确定要初始化默认栏目与卡片吗？自定义栏目将保留。')) return;

    const userConfig = getCategoryConfig();
    if (!userConfig) {
        renderCategoryList();
        return;
    }

    const defaultConfig = getDefaultCategoryConfig();
    const defaultIds = Array.isArray(defaultConfig?.categoryOrder) ? defaultConfig.categoryOrder : [];
    const defaultSet = new Set(defaultIds.map(x => String(x || '').trim()).filter(Boolean));

    const config = userConfig;

    config.hiddenDefaultCategories = (config.hiddenDefaultCategories || []).filter(id => !defaultSet.has(String(id || '').trim()));
    config.hiddenPlatforms = [];
    config.platformOrder = {};

    const customIds = Array.isArray(config.customCategories)
        ? config.customCategories.map(c => String(c?.id || '').trim()).filter(Boolean)
        : [];
    const nextOrder = defaultIds.slice();
    for (const cid of customIds) {
        if (!nextOrder.includes(cid)) nextOrder.push(cid);
    }
    config.categoryOrder = nextOrder;

    saveCategoryConfig(config);
    categorySettingsState.configChanged = true;

    renderCategoryList();
}

// Initialize on page load
init();
