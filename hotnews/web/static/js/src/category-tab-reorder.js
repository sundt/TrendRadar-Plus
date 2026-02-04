import { TR, ready } from './core.js';

function _getOrderedCategoryIdsFromDom(container) {
    if (!container) return [];
    return Array.from(container.querySelectorAll('.category-tab'))
        .map((el) => String(el?.dataset?.category || '').trim())
        .filter(Boolean);
}

function _persistCategoryOrder(orderedCategoryIds) {
    if (!Array.isArray(orderedCategoryIds) || orderedCategoryIds.length === 0) return;

    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config = TR.settings.normalizeCategoryConfig(base);
    // Preserve non-visible categories (e.g., hidden defaults) by only reordering the
    // visible subset within the existing order.
    const merged = TR.settings.getMergedCategoryConfig();
    const existingOrder = Array.isArray(merged?.categoryOrder) && merged.categoryOrder.length > 0
        ? merged.categoryOrder.slice()
        : orderedCategoryIds.slice();

    const visibleSet = new Set(orderedCategoryIds);
    let idx = 0;
    const nextOrder = existingOrder.map((catId) => {
        const id = String(catId || '').trim();
        if (!id) return id;
        if (!visibleSet.has(id)) return id;
        const next = orderedCategoryIds[idx];
        idx += 1;
        return next;
    });
    config.categoryOrder = nextOrder;
    config.__migrated_explore_ai_front_v1 = Date.now();
    config.__migrated_explore_knowledge_front_v1 = Date.now();
    TR.settings.saveCategoryConfig(config);
}

function _reorderTabPanes(orderedCategoryIds) {
    const contentEl = document.querySelector('.tab-content-area');
    if (!contentEl) return;

    const panes = new Map();
    contentEl.querySelectorAll('.tab-pane').forEach((p) => {
        const id = String(p?.id || '');
        if (id.startsWith('tab-')) {
            panes.set(id.slice(4), p);
        }
    });

    const frag = document.createDocumentFragment();
    for (const catId of orderedCategoryIds) {
        const pane = panes.get(catId);
        if (pane) frag.appendChild(pane);
    }

    // Keep any remaining panes (if any) appended (safety).
    for (const [catId, pane] of panes.entries()) {
        if (!orderedCategoryIds.includes(catId)) {
            frag.appendChild(pane);
        }
    }

    contentEl.appendChild(frag);
}

function _ensureTabHandles() {
    const tabsEl = document.querySelector('.category-tabs');
    if (!tabsEl) return;
    tabsEl.querySelectorAll('.category-tab').forEach((tab) => {
        try {
            tab.setAttribute('draggable', 'false');
            let handle = tab.querySelector(':scope > .category-drag-handle');
            if (!handle) {
                handle = document.createElement('span');
                handle.className = 'category-drag-handle';
                handle.setAttribute('title', '拖拽调整栏目顺序');
                handle.setAttribute('draggable', 'true');
                handle.textContent = '☰';
                tab.insertBefore(handle, tab.firstChild);
            } else {
                handle.setAttribute('draggable', 'true');
            }
        } catch (e) {
            // ignore
        }
    });
}

function _observeTabRerenders() {
    const tabsEl = document.querySelector('.category-tabs');
    if (!tabsEl) return;
    try {
        const obs = new MutationObserver(() => {
            _ensureTabHandles();
        });
        obs.observe(tabsEl, { childList: true, subtree: true });
    } catch (e) {
        // ignore
    }
}

function _enableLongPressHint() {
    // Mobile: long-press on tab shows context menu
    const root = document.body;
    if (!root) return;

    let longPressTimer = 0;
    let longPressTab = null;
    let startX = 0;
    let startY = 0;
    const LONG_PRESS_DURATION = 500; // ms
    const MOVE_THRESHOLD = 10; // px

    const clearLongPress = () => {
        if (longPressTimer) {
            window.clearTimeout(longPressTimer);
            longPressTimer = 0;
        }
        if (longPressTab) {
            longPressTab.classList.remove('long-pressing');
            longPressTab = null;
        }
    };

    document.addEventListener(
        'touchstart',
        (e) => {
            const tab = e.target?.closest?.('.category-tab');
            if (!tab) return;
            
            const tabsEl = tab.closest('.category-tabs');
            if (!tabsEl) return;
            
            // Don't trigger on drag handle
            const handle = e.target?.closest?.('.category-drag-handle');
            if (handle) return;

            clearLongPress();
            
            const touch = e.touches?.[0];
            if (!touch) return;
            
            startX = touch.clientX;
            startY = touch.clientY;
            longPressTab = tab;
            tab.classList.add('long-pressing');
            
            longPressTimer = window.setTimeout(() => {
                if (!longPressTab) return;
                
                // Haptic feedback
                if (navigator.vibrate) {
                    navigator.vibrate(10);
                }
                
                // Show context menu at touch position
                _showCategoryContextMenu({ clientX: startX, clientY: startY }, longPressTab);
                clearLongPress();
            }, LONG_PRESS_DURATION);
        },
        { passive: true }
    );

    document.addEventListener(
        'touchmove',
        (e) => {
            if (!longPressTimer) return;
            
            const touch = e.touches?.[0];
            if (!touch) return;
            
            // Cancel if moved too much
            const dx = Math.abs(touch.clientX - startX);
            const dy = Math.abs(touch.clientY - startY);
            if (dx > MOVE_THRESHOLD || dy > MOVE_THRESHOLD) {
                clearLongPress();
            }
        },
        { passive: true }
    );

    document.addEventListener('touchend', clearLongPress, { passive: true });
    document.addEventListener('touchcancel', clearLongPress, { passive: true });
}

// ============ Category Tab Context Menu ============
let _categoryContextMenuEl = null;

function _hideCategoryContextMenu() {
    if (_categoryContextMenuEl && _categoryContextMenuEl.parentNode) {
        _categoryContextMenuEl.parentNode.removeChild(_categoryContextMenuEl);
    }
    _categoryContextMenuEl = null;
}

function _showCategoryContextMenu(e, tab) {
    _hideCategoryContextMenu();
    
    const categoryId = tab?.dataset?.category;
    if (!categoryId) return;
    
    const categoryName = tab.querySelector('.category-tab-name')?.textContent?.replace(/NEW$/, '').trim() || categoryId;
    
    // Check if this is a topic tab
    const isTopicTab = tab.classList.contains('topic-tab');
    const topicId = tab.dataset?.topicId;
    
    _categoryContextMenuEl = document.createElement('div');
    _categoryContextMenuEl.className = 'tr-category-context-menu';
    
    if (isTopicTab && topicId) {
        // Topic tab menu
        _categoryContextMenuEl.innerHTML = `
            <div class="tr-cat-ctx-item" data-action="refresh-topic">🔄 刷新</div>
            <div class="tr-cat-ctx-item" data-action="edit-topic" style="border-top:1px solid #e5e7eb;">⚙️ 编辑主题</div>
            <div class="tr-cat-ctx-item tr-cat-ctx-danger" data-action="delete-topic" style="border-top:1px solid #e5e7eb;">🗑️ 删除主题</div>
        `;
    } else {
        // Regular category tab menu
        _categoryContextMenuEl.innerHTML = `
            <div class="tr-cat-ctx-item" data-action="hide">👁️‍🗨️ 隐藏栏目</div>
            <div class="tr-cat-ctx-item" data-action="settings" style="border-top:1px solid #e5e7eb;">⚙️ 栏目设置</div>
        `;
    }
    
    _categoryContextMenuEl.style.cssText = `
        position: fixed;
        left: ${e.clientX}px;
        top: ${e.clientY}px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 10000;
        min-width: 130px;
        overflow: hidden;
    `;
    
    const itemStyle = `
        padding: 10px 16px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s;
    `;
    _categoryContextMenuEl.querySelectorAll('.tr-cat-ctx-item').forEach(item => {
        item.style.cssText = itemStyle;
        if (item.classList.contains('tr-cat-ctx-danger')) {
            item.style.color = '#dc2626';
        }
        item.addEventListener('mouseenter', () => item.style.background = '#f3f4f6');
        item.addEventListener('mouseleave', () => item.style.background = 'white');
    });
    
    _categoryContextMenuEl.addEventListener('click', (ev) => {
        const action = ev.target?.dataset?.action;
        if (!action) return;
        
        _hideCategoryContextMenu();
        
        if (action === 'hide') {
            _hideCategory(categoryId, categoryName, tab);
        } else if (action === 'settings') {
            if (window.openCategorySettings) {
                window.openCategorySettings();
            }
        } else if (action === 'refresh-topic') {
            if (window.TopicTracker?.refreshTopic) {
                window.TopicTracker.refreshTopic(topicId);
            }
        } else if (action === 'edit-topic') {
            if (window.TopicTracker?.editTopic) {
                window.TopicTracker.editTopic(topicId);
            }
        } else if (action === 'delete-topic') {
            if (window.TopicTracker?.deleteTopic) {
                window.TopicTracker.deleteTopic(topicId);
            }
        }
    });
    
    document.body.appendChild(_categoryContextMenuEl);
    
    // Adjust position if menu goes off screen
    const rect = _categoryContextMenuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        _categoryContextMenuEl.style.left = `${window.innerWidth - rect.width - 10}px`;
    }
    if (rect.bottom > window.innerHeight) {
        _categoryContextMenuEl.style.top = `${window.innerHeight - rect.height - 10}px`;
    }
    
    // Close on click outside
    setTimeout(() => {
        document.addEventListener('click', _hideCategoryContextMenu, { once: true });
    }, 0);
}

function _hideCategory(categoryId, categoryName, tabEl) {
    // Get current config
    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config = TR.settings.normalizeCategoryConfig(base);
    
    // Check if it's a custom category
    const isCustom = config.customCategories?.some(c => c.id === categoryId);
    
    if (isCustom) {
        // For custom categories, remove from customCategories array
        config.customCategories = config.customCategories.filter(c => c.id !== categoryId);
        config.categoryOrder = config.categoryOrder.filter(id => id !== categoryId);
    } else {
        // For default categories, add to hiddenDefaultCategories
        if (!config.hiddenDefaultCategories.includes(categoryId)) {
            config.hiddenDefaultCategories.push(categoryId);
        }
    }
    
    TR.settings.saveCategoryConfig(config);
    
    // Remove tab from DOM with animation
    if (tabEl) {
        tabEl.style.transition = 'opacity 0.3s, transform 0.3s';
        tabEl.style.opacity = '0';
        tabEl.style.transform = 'scale(0.9)';
        setTimeout(() => {
            tabEl.remove();
            // Also remove the corresponding tab pane
            const pane = document.getElementById(`tab-${categoryId}`);
            if (pane) pane.remove();
            
            // If the hidden tab was active, switch to first visible tab
            const firstTab = document.querySelector('.category-tab');
            if (firstTab && !document.querySelector('.category-tab.active')) {
                const firstCatId = firstTab.dataset?.category;
                if (firstCatId && window.switchTab) {
                    window.switchTab(firstCatId);
                }
            }
        }, 300);
    }
    
    // Show toast
    if (window.TR?.toast?.show) {
        window.TR.toast.show(`已隐藏「${categoryName}」，可在栏目设置中恢复`, { variant: 'success', durationMs: 2500 });
    }
}

export const categoryTabReorder = {
    _attached: false,
    _draggingTab: null,
    _originTabsEl: null,

    attach() {
        if (this._attached) return;
        this._attached = true;

        _ensureTabHandles();
        _observeTabRerenders();
        _enableLongPressHint();

        // Prevent clicking the tab when user interacts with the handle.
        document.addEventListener(
            'click',
            (e) => {
                const handle = e.target?.closest?.('.category-drag-handle');
                if (!handle) return;
                e.preventDefault();
                e.stopPropagation();
            },
            true
        );

        // Right-click context menu for category tabs
        document.addEventListener(
            'contextmenu',
            (e) => {
                const tab = e.target?.closest?.('.category-tab');
                if (!tab) return;
                
                // Make sure we're in the category-tabs container
                const tabsEl = tab.closest('.category-tabs');
                if (!tabsEl) return;
                
                e.preventDefault();
                _showCategoryContextMenu(e, tab);
            },
            true
        );

        document.addEventListener(
            'dragstart',
            (e) => {
                const handle = e.target?.closest?.('.category-drag-handle');
                if (!handle) return;

                const tab = handle.closest('.category-tab');
                const tabsEl = handle.closest('.category-tabs');
                const catId = tab?.dataset?.category;
                if (!tab || !tabsEl || !catId) return;

                this._draggingTab = tab;
                this._originTabsEl = tabsEl;
                tab.classList.add('dragging');

                e.dataTransfer.effectAllowed = 'move';
                try {
                    e.dataTransfer.setData('text/plain', String(catId));
                } catch (_) {
                }
            },
            true
        );

        document.addEventListener(
            'dragover',
            (e) => {
                const tabsEl = e.target?.closest?.('.category-tabs');
                if (!tabsEl || !this._draggingTab) return;
                if (this._originTabsEl && tabsEl !== this._originTabsEl) return;

                const overTab = e.target?.closest?.('.category-tab');
                if (!overTab || overTab === this._draggingTab) return;

                e.preventDefault();

                const tabs = Array.from(tabsEl.querySelectorAll('.category-tab'));
                const draggingIndex = tabs.indexOf(this._draggingTab);
                const overIndex = tabs.indexOf(overTab);
                if (draggingIndex < 0 || overIndex < 0 || draggingIndex === overIndex) return;

                if (draggingIndex < overIndex) {
                    tabsEl.insertBefore(this._draggingTab, overTab.nextSibling);
                } else {
                    tabsEl.insertBefore(this._draggingTab, overTab);
                }
            },
            true
        );

        document.addEventListener(
            'drop',
            (e) => {
                const tabsEl = e.target?.closest?.('.category-tabs');
                if (!tabsEl || !this._draggingTab) return;
                if (this._originTabsEl && tabsEl !== this._originTabsEl) return;
                e.preventDefault();
            },
            true
        );

        document.addEventListener(
            'dragend',
            (e) => {
                const handle = e.target?.closest?.('.category-drag-handle');
                if (!handle) return;

                const tabsEl = handle.closest('.category-tabs');
                if (!tabsEl || !this._draggingTab) {
                    if (this._draggingTab) this._draggingTab.classList.remove('dragging');
                    this._draggingTab = null;
                    this._originTabsEl = null;
                    return;
                }

                const ordered = _getOrderedCategoryIdsFromDom(tabsEl);
                _persistCategoryOrder(ordered);
                _reorderTabPanes(ordered);

                this._draggingTab.classList.remove('dragging');
                this._draggingTab = null;
                this._originTabsEl = null;
            },
            true
        );
    }
};

TR.categoryTabReorder = categoryTabReorder;

ready(() => {
    categoryTabReorder.attach();
});
