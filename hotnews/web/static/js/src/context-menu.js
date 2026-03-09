/**
 * Context Menu Module - Apple Style
 * Long press / right click to show actions
 */

import { authState, requireLogin } from './auth-state.js';

let menuEl = null;
let backdropEl = null;
let currentNewsData = null;
let currentTagData = null;  // For tag unfollow
let currentCardEl = null;   // Parent card of the right-clicked news item
let longPressTimer = null;
let longPressTarget = null;

const LONG_PRESS_DURATION = 500; // ms

/**
 * Create menu elements if not exist
 */
function ensureMenuExists() {
    if (menuEl) return;
    
    // Backdrop
    backdropEl = document.createElement('div');
    backdropEl.className = 'tr-context-menu-backdrop';
    backdropEl.addEventListener('click', hideMenu);
    backdropEl.addEventListener('touchstart', hideMenu, { passive: true });
    document.body.appendChild(backdropEl);
    
    // Menu
    menuEl = document.createElement('div');
    menuEl.className = 'tr-context-menu';
    document.body.appendChild(menuEl);
}

/**
 * Build menu HTML based on context type
 */
function buildMenuHtml(type, data) {
    if (type === 'tag') {
        return `
            <div class="tr-context-menu-item" data-action="unfollow">
                <span class="tr-context-menu-item-icon">🚫</span>
                <span>不再关注</span>
            </div>
        `;
    }
    
    // Default: news item menu
    return `
        <div class="tr-context-menu-item" data-action="summary">
            <span class="tr-context-menu-item-icon">✨</span>
            <span>AI 智能总结</span>
        </div>
        <div class="tr-context-menu-divider"></div>
        <div class="tr-context-menu-item" data-action="open">
            <span class="tr-context-menu-item-icon">↗</span>
            <span>打开原文</span>
        </div>
        <div class="tr-context-menu-item" data-action="copy">
            <span class="tr-context-menu-item-icon">📋</span>
            <span>复制链接</span>
        </div>
        <div class="tr-context-menu-divider"></div>
        <div class="tr-context-menu-item" data-action="copy-all">
            <span class="tr-context-menu-item-icon">📎</span>
            <span>复制卡片所有链接</span>
        </div>
        <div class="tr-context-menu-item" data-action="export-pdf">
            <span class="tr-context-menu-item-icon">📄</span>
            <span>生成文章合集</span>
        </div>
    `;
}

/**
 * Show context menu at position
 */
function showMenu(x, y, newsData, tagData = null) {
    ensureMenuExists();
    
    currentNewsData = newsData;
    currentTagData = tagData;
    
    // Build menu based on context
    const menuType = tagData ? 'tag' : 'news';
    menuEl.innerHTML = buildMenuHtml(menuType, tagData || newsData);
    menuEl.removeEventListener('click', handleMenuClick);
    menuEl.addEventListener('click', handleMenuClick);
    
    // Update menu item state for news menu
    if (!tagData && newsData) {
        const summaryItem = menuEl.querySelector('[data-action="summary"]');
        if (summaryItem) {
            const hasSummary = newsData.hasSummary;
            summaryItem.classList.toggle('has-summary', hasSummary);
            summaryItem.querySelector('span:last-child').textContent = hasSummary ? '查看总结' : 'AI 智能总结';
        }
    }
    
    // Position menu
    const menuWidth = 200;
    const menuHeight = tagData ? 50 : 160;
    const padding = 10;
    
    let finalX = x;
    let finalY = y;
    let originBottom = false;
    
    // Keep menu in viewport
    if (x + menuWidth > window.innerWidth - padding) {
        finalX = window.innerWidth - menuWidth - padding;
    }
    if (finalX < padding) {
        finalX = padding;
    }
    
    if (y + menuHeight > window.innerHeight - padding) {
        finalY = y - menuHeight;
        originBottom = true;
    }
    if (finalY < padding) {
        finalY = padding;
        originBottom = false;
    }
    
    menuEl.style.left = `${finalX}px`;
    menuEl.style.top = `${finalY}px`;
    menuEl.classList.toggle('origin-bottom', originBottom);
    
    // Show
    backdropEl.classList.add('show');
    menuEl.classList.add('show');
}

/**
 * Hide context menu
 */
function hideMenu() {
    if (menuEl) {
        menuEl.classList.remove('show');
    }
    if (backdropEl) {
        backdropEl.classList.remove('show');
    }
    currentNewsData = null;
    currentTagData = null;
    currentCardEl = null;
    clearLongPress();
}

/**
 * Handle menu item click
 */
function handleMenuClick(e) {
    const item = e.target.closest('.tr-context-menu-item');
    if (!item) return;
    
    const action = item.dataset.action;
    
    hideMenu();
    
    switch (action) {
        case 'summary':
            if (currentNewsData) handleSummaryAction(currentNewsData);
            break;
        case 'open':
            if (currentNewsData) window.open(currentNewsData.url, '_blank', 'noopener,noreferrer');
            break;
        case 'copy':
            if (currentNewsData) copyToClipboard(currentNewsData.url);
            break;
        case 'copy-all':
            if (currentCardEl) {
                const links = Array.from(currentCardEl.querySelectorAll('.news-list .news-title'))
                    .map(a => a.href)
                    .filter(Boolean);
                if (links.length) {
                    copyToClipboard(links.join('\n'), `已复制 ${links.length} 条链接`);
                } else if (window.TR?.toast?.show) {
                    window.TR.toast.show('该卡片暂无链接', { variant: 'warning', durationMs: 1500 });
                }
            }
            break;
        case 'export-pdf':
            if (currentCardEl) handleExportPdf(currentCardEl);
            break;
        case 'unfollow':
            if (currentTagData) handleUnfollowTag(currentTagData);
            break;
    }
}

/**
 * Handle summary action
 */
function handleSummaryAction(data) {
    if (!requireLogin()) return;
    
    // Call the summary modal
    if (typeof window.openSummaryModal === 'function') {
        window.openSummaryModal(
            data.newsId,
            data.title,
            data.url,
            data.sourceId,
            data.sourceName
        );
    }
}

/**
 * Copy text to clipboard
 */
async function copyToClipboard(text, successMsg) {
    try {
        await navigator.clipboard.writeText(text);
        // Show toast if available
        if (window.TR?.toast?.show) {
            window.TR.toast.show(successMsg || '链接已复制', { variant: 'success', durationMs: 1500 });
        }
    } catch (e) {
        console.error('Copy failed:', e);
    }
}

/**
 * Handle export PDF action — collect all articles from card and generate combined document
 */
async function handleExportPdf(cardEl) {
    // Collect all articles from the card
    const newsItems = Array.from(cardEl.querySelectorAll('.news-list .news-item'));
    const articles = [];

    for (const item of newsItems) {
        const titleEl = item.querySelector('.news-title');
        if (!titleEl || !titleEl.href) continue;
        articles.push({
            title: titleEl.textContent?.trim() || '',
            url: titleEl.href
        });
    }

    if (!articles.length) {
        if (window.TR?.toast?.show) {
            window.TR.toast.show('该卡片暂无文章', { variant: 'warning', durationMs: 1500 });
        }
        return;
    }

    // Get card title
    const cardTitle = cardEl.querySelector('.platform-name')?.textContent?.trim() || '文章合集';

    // Show loading toast
    if (window.TR?.toast?.show) {
        window.TR.toast.show(`正在获取 ${articles.length} 篇文章内容...`, { variant: 'info', durationMs: 30000 });
    }

    try {
        const resp = await fetch('/api/articles/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ articles, card_title: cardTitle })
        });

        if (!resp.ok) {
            throw new Error(`HTTP ${resp.status}`);
        }

        const html = await resp.text();

        // Open in new window
        const win = window.open('', 'export-window');
        if (win) {
            win.document.open();
            win.document.write(html);
            win.document.close();
        } else {
            // Popup blocked — fallback to blob download
            const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        }

        if (window.TR?.toast?.show) {
            window.TR.toast.show('文章合集已生成！', { variant: 'success', durationMs: 2000 });
        }
    } catch (e) {
        console.error('Export failed:', e);
        if (window.TR?.toast?.show) {
            window.TR.toast.show('生成失败，请重试', { variant: 'error', durationMs: 2000 });
        }
    }
}

/**
 * Get news data from element
 */
function getNewsDataFromElement(el) {
    const newsItem = el.closest('.news-item');
    if (!newsItem) return null;
    
    const titleEl = newsItem.querySelector('.news-title');
    const summaryBtn = newsItem.querySelector('.news-summary-btn');
    
    return {
        newsId: newsItem.dataset.newsId || '',
        title: newsItem.dataset.newsTitle || titleEl?.textContent?.trim() || '',
        url: titleEl?.href || '',
        sourceId: summaryBtn?.dataset.sourceId || '',
        sourceName: summaryBtn?.dataset.sourceName || '',
        hasSummary: summaryBtn?.classList.contains('has-summary') || false
    };
}

/**
 * Start long press detection
 */
function startLongPress(e, target) {
    clearLongPress();
    
    const newsItem = target.closest('.news-item');
    if (!newsItem) return;
    
    longPressTarget = newsItem;
    newsItem.classList.add('long-pressing');
    
    const touch = e.touches?.[0];
    const x = touch ? touch.clientX : e.clientX;
    const y = touch ? touch.clientY : e.clientY;
    
    longPressTimer = setTimeout(() => {
        const data = getNewsDataFromElement(target);
        if (data) {
            // Haptic feedback on mobile
            if (navigator.vibrate) {
                navigator.vibrate(10);
            }
            showMenu(x, y, data);
        }
        clearLongPress();
    }, LONG_PRESS_DURATION);
}

/**
 * Clear long press state
 */
function clearLongPress() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
    if (longPressTarget) {
        longPressTarget.classList.remove('long-pressing');
        longPressTarget = null;
    }
}

/**
 * Handle unfollow tag action
 */
async function handleUnfollowTag(tagData) {
    if (!requireLogin()) return;
    
    try {
        const card = document.querySelector(`.platform-card[data-tag-id="${tagData.tagId}"]`);
        const itemType = card?.dataset?.itemType || 'tag';

        let resp;
        if (itemType === 'source') {
            const sourceType = tagData.tagId.startsWith('custom-') || tagData.tagId.startsWith('custom_') ? 'custom' : 'rss';
            resp = await fetch('/api/sources/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ source_id: tagData.tagId, source_type: sourceType })
            });
        } else if (itemType === 'keyword') {
            const keywordId = card?.dataset?.keywordId;
            const kwMatch = !keywordId && tagData.tagId.match(/^keyword_(\d+)$/);
            const kwId = keywordId || (kwMatch && kwMatch[1]);
            if (kwId) {
                resp = await fetch(`/api/user/keywords/${encodeURIComponent(kwId)}`, {
                    method: 'DELETE',
                    credentials: 'include',
                });
            }
        } else if (itemType === 'wechat') {
            const fakeid = card?.dataset?.fakeid || tagData.tagId.replace(/^mp-/, '');
            resp = await fetch('/api/wechat/unsubscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ fakeid })
            });
        } else {
            resp = await fetch('/api/user/preferences/tag-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ tag_id: tagData.tagId, preference: 'neutral' })
            });
        }
        
        if (!resp || !resp.ok) throw new Error('取消关注失败');
        
        // Remove the card from DOM
        if (card) {
            card.style.transition = 'opacity 0.3s, transform 0.3s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.95)';
            setTimeout(() => card.remove(), 300);
        }
        
        // Clear my-tags cache
        try { localStorage.removeItem('hotnews_my_tags_cache'); } catch {}
        
        // Show toast
        if (window.TR?.toast?.show) {
            window.TR.toast.show(`已取消关注「${tagData.tagName}」`, { variant: 'success', durationMs: 2000 });
        }
    } catch (e) {
        console.error('Unfollow tag failed:', e);
        if (window.TR?.toast?.show) {
            window.TR.toast.show('操作失败，请重试', { variant: 'error', durationMs: 2000 });
        }
    }
}

/**
 * Get tag data from platform card header
 */
function getTagDataFromElement(el) {
    const card = el.closest('.platform-card[data-tag-id]');
    if (!card) return null;
    
    const tagId = card.dataset.tagId;
    const nameEl = card.querySelector('.platform-name');
    const tagName = nameEl?.textContent?.replace(/\(.*\)/, '').trim() || tagId;
    
    return {
        tagId,
        tagName
    };
}

/**
 * Handle context menu (right click)
 */
function handleContextMenu(e) {
    const target = e.target;
    if (!target) return;
    
    // my-tags card headers are handled by platform-reorder.js
    // Only handle news titles here
    const titleEl = target.closest('.news-title');
    if (!titleEl) return;
    
    const data = getNewsDataFromElement(target);
    if (!data) return;
    
    // Save reference to the parent card for "copy all links" action
    const cardEl = titleEl.closest('.platform-card');
    
    e.preventDefault();
    currentCardEl = cardEl;
    showMenu(e.clientX, e.clientY, data);
}

/**
 * Handle touch start for long press
 */
function handleTouchStart(e) {
    const target = e.target;
    if (!target) return;
    
    const titleEl = target.closest('.news-title');
    if (!titleEl) return;
    
    startLongPress(e, target);
}

/**
 * Handle touch end/cancel
 */
function handleTouchEnd() {
    clearLongPress();
}

/**
 * Handle touch move (cancel long press if moved)
 */
function handleTouchMove(e) {
    if (!longPressTimer) return;
    
    // Cancel if moved more than 10px
    const touch = e.touches?.[0];
    if (touch) {
        clearLongPress();
    }
}

/**
 * Initialize context menu
 */
function init() {
    // Desktop: right click
    document.addEventListener('contextmenu', handleContextMenu);
    
    // Mobile: long press
    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    document.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    document.addEventListener('touchmove', handleTouchMove, { passive: true });
    
    // Close menu on scroll
    document.addEventListener('scroll', hideMenu, { passive: true });
    
    // Close menu on escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideMenu();
        }
    });
}

// Auto init
init();

export { showMenu, hideMenu };
