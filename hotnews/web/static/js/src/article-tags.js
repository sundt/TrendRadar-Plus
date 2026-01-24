/**
 * Article Tags Module
 * 
 * Loads and displays quality/category tags for summarized articles.
 * Tags are shown as suffixes after the title, visible on hover.
 */

// Quality tag labels (Chinese)
const QUALITY_TAG_LABELS = {
    // Negative
    ad: '广告',
    sponsored: '软文',
    clickbait: '标题党',
    pr: '公关稿',
    outdated: '过时',
    low_quality: '水文',
    // Positive
    gem: '精华',
    breaking: '突发',
    exclusive: '独家',
    practical: '实用'
};

// Category tag labels (Chinese)
const CATEGORY_TAG_LABELS = {
    tech: '科技', ai_ml: 'AI', tutorial: '教程', tool_rec: '工具',
    dev_tools: '开发', deep_dive: '深度', programming: '编程',
    business: '商业', finance: '财经', hardware: '硬件',
    mobile: '移动', lifestyle: '生活', career: '职场',
    llm: 'LLM', free_deal: '福利', politics: '政治',
    breaking: '突发', world: '国际', database: '数据库',
    official: '官方', entertainment: '娱乐', cloud: '云计算',
    opinion: '观点', sports: '体育', cybersecurity: '安全',
    interview: '访谈', health: '健康', science: '科学',
    web3: 'Web3', event: '活动', education: '教育',
    gaming: '游戏', robotics: '机器人', iot: '物联网',
    vr_ar: 'VR/AR', opensource: '开源', stock: '股票',
    crypto: '加密', macro: '宏观', banking: '银行',
    insurance: '保险', real_estate: '房产', personal_fin: '理财',
    startup: '创业', ecommerce: '电商', marketing: '营销',
    hr: '人力', management: '管理', food: '美食',
    travel: '旅行', books: '书籍'
};

// Cache for loaded tags
let tagsCache = {};

/**
 * Generate tag HTML for a news item
 */
function generateTagsHtml(tags) {
    if (!tags) return '';
    
    let html = '';
    
    // Quality tag first (if any)
    if (tags.quality && QUALITY_TAG_LABELS[tags.quality]) {
        html += `<span class="article-tag-suffix tag-${tags.quality}">${QUALITY_TAG_LABELS[tags.quality]}</span>`;
    }
    
    // Category tags (max 2)
    if (tags.category && tags.category.length > 0) {
        tags.category.slice(0, 2).forEach(cat => {
            const label = CATEGORY_TAG_LABELS[cat] || cat;
            html += `<span class="article-tag-suffix tag-category">${label}</span>`;
        });
    }
    
    return html;
}

/**
 * Apply tags to a news item element
 */
function applyTagsToNewsItem(newsItem, tags) {
    if (!newsItem || !tags) return;
    
    const titleLink = newsItem.querySelector('.news-title');
    if (!titleLink) return;
    
    // Remove existing tags
    titleLink.querySelectorAll('.article-tag-suffix').forEach(el => el.remove());
    
    // Add new tags
    const tagsHtml = generateTagsHtml(tags);
    if (tagsHtml) {
        titleLink.insertAdjacentHTML('beforeend', tagsHtml);
    }
}

/**
 * Load tags for visible news items
 */
async function loadTagsForVisibleItems() {
    // Collect URLs from visible news items that don't have tags yet
    const newsItems = document.querySelectorAll('.news-item[data-url]');
    const urlsToLoad = [];
    const urlToItems = {};
    
    newsItems.forEach(item => {
        const url = item.dataset.url;
        if (!url) return;
        
        // Skip if already has tags or already in cache
        if (item.dataset.tagsLoaded === 'true') return;
        if (tagsCache[url] !== undefined) {
            // Apply from cache
            if (tagsCache[url]) {
                applyTagsToNewsItem(item, tagsCache[url]);
            }
            item.dataset.tagsLoaded = 'true';
            return;
        }
        
        urlsToLoad.push(url);
        if (!urlToItems[url]) urlToItems[url] = [];
        urlToItems[url].push(item);
    });
    
    if (urlsToLoad.length === 0) return;
    
    // Batch load tags (max 50 per request)
    const batchSize = 50;
    for (let i = 0; i < urlsToLoad.length; i += batchSize) {
        const batch = urlsToLoad.slice(i, i + batchSize);
        
        try {
            const response = await fetch(`/api/summary/tags?urls=${encodeURIComponent(batch.join(','))}`);
            if (!response.ok) continue;
            
            const data = await response.json();
            if (!data.ok || !data.tags) continue;
            
            // Apply tags to items
            batch.forEach(url => {
                const tags = data.tags[url] || null;
                tagsCache[url] = tags;
                
                const items = urlToItems[url] || [];
                items.forEach(item => {
                    if (tags) {
                        applyTagsToNewsItem(item, tags);
                    }
                    item.dataset.tagsLoaded = 'true';
                });
            });
        } catch (e) {
            console.warn('Failed to load article tags:', e);
        }
    }
}

/**
 * Initialize article tags module
 */
function initArticleTags() {
    // Load tags after initial render
    setTimeout(loadTagsForVisibleItems, 500);
    
    // Reload tags when tab changes
    document.addEventListener('tabChanged', () => {
        setTimeout(loadTagsForVisibleItems, 300);
    });
    
    // Reload tags when content updates
    const observer = new MutationObserver((mutations) => {
        let hasNewItems = false;
        mutations.forEach(mutation => {
            if (mutation.addedNodes.length > 0) {
                mutation.addedNodes.forEach(node => {
                    if (node.classList && node.classList.contains('news-item')) {
                        hasNewItems = true;
                    }
                    if (node.querySelectorAll) {
                        const items = node.querySelectorAll('.news-item');
                        if (items.length > 0) hasNewItems = true;
                    }
                });
            }
        });
        
        if (hasNewItems) {
            setTimeout(loadTagsForVisibleItems, 100);
        }
    });
    
    // Observe platform grid for changes
    const grids = document.querySelectorAll('.platform-grid, .tab-content-area');
    grids.forEach(grid => {
        observer.observe(grid, { childList: true, subtree: true });
    });
}

// Export for use in other modules
window.ArticleTags = {
    init: initArticleTags,
    loadTags: loadTagsForVisibleItems,
    applyTags: applyTagsToNewsItem,
    generateHtml: generateTagsHtml,
    QUALITY_LABELS: QUALITY_TAG_LABELS,
    CATEGORY_LABELS: CATEGORY_TAG_LABELS
};

// Auto-init when DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initArticleTags);
} else {
    initArticleTags();
}
