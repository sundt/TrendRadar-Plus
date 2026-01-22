/**
 * Context Menu Module - Apple Style
 * Long press / right click to show actions
 */

import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';

let menuEl = null;
let backdropEl = null;
let currentNewsData = null;
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
    menuEl.innerHTML = `
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
    `;
    
    menuEl.addEventListener('click', handleMenuClick);
    document.body.appendChild(menuEl);
}

/**
 * Show context menu at position
 */
function showMenu(x, y, newsData) {
    ensureMenuExists();
    
    currentNewsData = newsData;
    
    // Update menu item state
    const summaryItem = menuEl.querySelector('[data-action="summary"]');
    if (summaryItem) {
        const hasSummary = newsData.hasSummary;
        summaryItem.classList.toggle('has-summary', hasSummary);
        summaryItem.querySelector('span:last-child').textContent = hasSummary ? '查看总结' : 'AI 智能总结';
    }
    
    // Position menu
    const menuWidth = 200;
    const menuHeight = 160;
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
    clearLongPress();
}

/**
 * Handle menu item click
 */
function handleMenuClick(e) {
    const item = e.target.closest('.tr-context-menu-item');
    if (!item || !currentNewsData) return;
    
    const action = item.dataset.action;
    const data = currentNewsData;
    
    hideMenu();
    
    switch (action) {
        case 'summary':
            handleSummaryAction(data);
            break;
        case 'open':
            window.open(data.url, '_blank', 'noopener,noreferrer');
            break;
        case 'copy':
            copyToClipboard(data.url);
            break;
    }
}

/**
 * Handle summary action
 */
function handleSummaryAction(data) {
    const user = authState.getUser();
    
    if (!user) {
        openLoginModal();
        return;
    }
    
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
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        // Show toast if available
        if (window.TR?.toast?.show) {
            window.TR.toast.show('链接已复制', { variant: 'success', durationMs: 1500 });
        }
    } catch (e) {
        console.error('Copy failed:', e);
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
 * Handle context menu (right click)
 */
function handleContextMenu(e) {
    const target = e.target;
    if (!target) return;
    
    // Only handle on news titles
    const titleEl = target.closest('.news-title');
    if (!titleEl) return;
    
    const data = getNewsDataFromElement(target);
    if (!data) return;
    
    e.preventDefault();
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
