/**
 * Click Tracker Module
 * - Shows red dots for new content arriving DURING current session
 * - Red dots only appear for content newer than session start time
 * - Refreshing page resets session, so no red dots on fresh load
 * - Reports clicks to backend for analytics
 */
import { TR, ready, escapeHtml } from './core.js';

// Session start timestamp (in seconds) - set once when page loads
// This is NOT stored in localStorage, so it resets on refresh
const SESSION_START_TIME = Math.floor(Date.now() / 1000);

// Track which categories have been viewed this session
const viewedCategories = new Set();

/**
 * Check if a news item is "new" based on published_at and session start
 * Only returns true if the item was published AFTER session started
 * AND the category has been viewed at least once (to detect updates)
 */
function isNewContent(publishedAt, categoryId) {
    const ts = Number(publishedAt) || 0;
    if (!ts) return false;

    // Only show red dot if:
    // 1. Category was already viewed (meaning user has been here before in this session)
    // 2. Item was published after session started
    if (!viewedCategories.has(categoryId)) {
        return false;
    }

    return ts > SESSION_START_TIME;
}

/**
 * Mark a category as viewed in this session
 */
function markCategoryViewed(categoryId) {
    if (!categoryId) return;
    viewedCategories.add(categoryId);
}

/**
 * Get session start time
 */
function getSessionStartTime() {
    return SESSION_START_TIME;
}

/**
 * Report a click to the backend
 */
async function reportClick(newsId, url, title, sourceName, category) {
    try {
        await fetch('/api/news/click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                news_id: newsId,
                url: url,
                title: title,
                source_name: sourceName || '',
                category: category || ''
            })
        });
    } catch (e) {
        // Silent fail - analytics should not break UX
    }
}

/**
 * Handle news title click - remove red dot and report
 */
function handleNewsClick(newsItem, categoryId) {
    if (!newsItem) return;

    // Remove red dot
    const dot = newsItem.querySelector('.tr-new-dot');
    if (dot) {
        dot.remove();
    }

    // Get data for reporting
    const newsId = newsItem.dataset.newsId || '';
    const title = newsItem.dataset.newsTitle || '';
    const link = newsItem.querySelector('.news-title');
    const url = link ? link.href : '';
    const sourceName = newsItem.closest('.platform-card')?.querySelector('.platform-name')?.textContent?.trim() || '';

    // Report click (async, non-blocking)
    if (newsId) {
        reportClick(newsId, url, title, sourceName, categoryId);
    }
}

/**
 * Attach click listeners to news items
 */
function attachClickListeners() {
    document.addEventListener('click', (e) => {
        const link = e.target.closest('.news-title');
        if (!link) return;

        const newsItem = link.closest('.news-item');
        if (!newsItem) return;

        const pane = newsItem.closest('.tab-pane');
        const categoryId = pane?.id?.startsWith('tab-') ? pane.id.slice(4) : '';

        handleNewsClick(newsItem, categoryId);
    });
}

/**
 * Mark category as viewed when switching tabs
 */
function attachTabSwitchListener() {
    window.addEventListener('tr_tab_switched', (ev) => {
        const categoryId = String(ev?.detail?.categoryId || '').trim();
        if (categoryId) {
            // Mark as viewed after a short delay (after initial render completes)
            setTimeout(() => {
                markCategoryViewed(categoryId);
            }, 2000);
        }
    });
}

// Export for other modules
TR.clickTracker = {
    getSessionStartTime,
    markCategoryViewed,
    isNewContent,
    reportClick,
    handleNewsClick
};

ready(function () {
    attachClickListeners();
    attachTabSwitchListener();

    // Mark initial category as viewed after page fully loads
    setTimeout(() => {
        const activePane = document.querySelector('.tab-pane.active');
        if (activePane && activePane.id?.startsWith('tab-')) {
            markCategoryViewed(activePane.id.slice(4));
        }
    }, 3000);
});
