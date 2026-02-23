import { TR, ready } from './core.js';

function showConfirmDialog(message) {
    return new Promise((resolve) => {
        // 创建遮罩
        const backdrop = document.createElement('div');
        backdrop.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:10010;display:flex;align-items:center;justify-content:center;';
        
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);text-align:center;';
        dialog.innerHTML = `
            <div style="font-size:15px;color:#1f2937;line-height:1.6;margin-bottom:20px;">${message}</div>
            <div style="display:flex;gap:12px;justify-content:center;">
                <button class="confirm-cancel" style="flex:1;padding:8px 0;border:1px solid #d1d5db;border-radius:8px;background:#fff;color:#6b7280;font-size:14px;cursor:pointer;">取消</button>
                <button class="confirm-ok" style="flex:1;padding:8px 0;border:none;border-radius:8px;background:#ef4444;color:#fff;font-size:14px;cursor:pointer;">确认删除</button>
            </div>
        `;
        
        backdrop.appendChild(dialog);
        document.body.appendChild(backdrop);
        
        const cleanup = (result) => {
            backdrop.remove();
            resolve(result);
        };
        
        dialog.querySelector('.confirm-cancel').onclick = () => cleanup(false);
        dialog.querySelector('.confirm-ok').onclick = () => cleanup(true);
        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) cleanup(false); });
    });
}

function getCategoryIdFromGrid(grid) {
    const pane = grid?.closest?.('.tab-pane');
    const id = pane?.id || '';
    return id.startsWith('tab-') ? id.slice(4) : null;
}

function getClosestCard(grid, x, y) {
    const cards = Array.from(grid.querySelectorAll('.platform-card:not(.dragging):not(.platform-card-placeholder)'));
    let best = null;
    let bestDist = Infinity;
    for (const c of cards) {
        const r = c.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const dx = x - cx;
        const dy = y - cy;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
            bestDist = d;
            best = { card: c, rect: r, cx, cy };
        }
    }
    return best;
}

function persistPlatformOrder(categoryId, orderedPlatformIds) {
    if (!categoryId || !Array.isArray(orderedPlatformIds)) return;

    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config = TR.settings.normalizeCategoryConfig(base);
    const merged = TR.settings.getMergedCategoryConfig();

    const mergedCustom = (merged.customCategories || []).find(c => c.id === categoryId);
    if (mergedCustom) {
        const idx = (config.customCategories || []).findIndex(c => c.id === categoryId);
        if (idx >= 0) {
            config.customCategories[idx] = {
                ...config.customCategories[idx],
                platforms: orderedPlatformIds
            };
        }
    } else {
        if (!config.platformOrder || typeof config.platformOrder !== 'object') config.platformOrder = {};
        config.platformOrder[categoryId] = orderedPlatformIds;
    }

    TR.settings.saveCategoryConfig(config);
}

function hidePlatformCard(cardEl, platformId, categoryId) {
    if (!platformId) return;
    
    // Get platform name for toast
    const platformName = cardEl?.querySelector('.platform-name')?.textContent?.replace(/📱\s*/, '').replace(/NEW$/, '').trim() || platformId;
    
    // Get current config
    const base = TR.settings.getCategoryConfig() || TR.settings.getDefaultCategoryConfig();
    const config = TR.settings.normalizeCategoryConfig(base);
    
    // Add to hiddenPlatforms
    if (!config.hiddenPlatforms.includes(platformId)) {
        config.hiddenPlatforms.push(platformId);
    }
    
    TR.settings.saveCategoryConfig(config);
    
    // Remove card from DOM with animation
    if (cardEl) {
        cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
        cardEl.style.opacity = '0';
        cardEl.style.transform = 'scale(0.95)';
        setTimeout(() => cardEl.remove(), 300);
    }
    
    // Show toast
    if (window.TR?.toast?.show) {
        window.TR.toast.show(`已隐藏「${platformName}」，可在栏目设置中恢复`, { variant: 'success', durationMs: 2500 });
    }
}

/**
 * Remove a source from a topic by calling the API to update the topic's rss_source_ids
 */
async function removeTopicSource(cardEl, sourceName, topicId) {
    if (!sourceName || !topicId) return;

    // 确认弹窗
    const confirmed = await showConfirmDialog(`确定要从主题中删除数据源「${sourceName}」吗？`);
    if (!confirmed) return;

    try {
        // First, get the current topic data
        const response = await fetch(`/api/topics/${topicId}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('获取主题信息失败');
        }

        const data = await response.json();
        if (!data.ok || !data.topic) {
            throw new Error('主题不存在');
        }

        const topic = data.topic;
        const currentSourceIds = topic.rss_source_ids || [];

        // Get source ID from card's data-source-id attribute (e.g., mp-xxx or rss-xxx)
        const sourceId = cardEl?.dataset?.sourceId;

        if (!sourceId) {
            console.warn('Source ID not found in card, cannot remove');
            if (window.TR?.toast?.show) {
                window.TR.toast.show('无法删除此数据源，请通过编辑主题移除', { variant: 'warning', durationMs: 3000 });
            }
            return;
        }

        // Filter out the source to remove
        const newSourceIds = currentSourceIds.filter(id => id !== sourceId);

        // If nothing changed, the source wasn't in the list
        if (newSourceIds.length === currentSourceIds.length) {
            console.warn('Source not found in topic sources:', sourceId);
            if (cardEl) {
                cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
                cardEl.style.opacity = '0';
                cardEl.style.transform = 'scale(0.95)';
                setTimeout(() => cardEl.remove(), 300);
            }
            if (window.TR?.toast?.show) {
                window.TR.toast.show(`已移除「${sourceName}」`, { variant: 'success', durationMs: 2000 });
            }
            return;
        }

        // Update topic with new source list
        const updateResponse = await fetch(`/api/topics/${topicId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ rss_source_ids: newSourceIds })
        });

        if (!updateResponse.ok) {
            throw new Error('更新主题失败');
        }

        const updateData = await updateResponse.json();
        if (!updateData.ok) {
            throw new Error(updateData.error || '更新主题失败');
        }

        // Remove card from DOM with animation
        if (cardEl) {
            cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
            cardEl.style.opacity = '0';
            cardEl.style.transform = 'scale(0.95)';
            setTimeout(() => cardEl.remove(), 300);
        }

        if (window.TR?.toast?.show) {
            window.TR.toast.show(`已从主题中移除「${sourceName}」`, { variant: 'success', durationMs: 2500 });
        }

    } catch (e) {
        console.error('Remove topic source failed:', e);
        if (window.TR?.toast?.show) {
            window.TR.toast.show('删除失败，请重试', { variant: 'error', durationMs: 2000 });
        }
    }
}

/**
 * Remove a keyword from a topic by calling the API to update the topic's keywords
 */
async function removeTopicKeyword(cardEl, keyword, topicId) {
    if (!keyword || !topicId) return;

    // 确认弹窗
    const confirmed = await showConfirmDialog(`确定要从主题中删除关键词「${keyword}」吗？`);
    if (!confirmed) return;

    try {
        // First, get the current topic data
        const response = await fetch(`/api/topics/${topicId}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            throw new Error('获取主题信息失败');
        }

        const data = await response.json();
        if (!data.ok || !data.topic) {
            throw new Error('主题不存在');
        }

        const topic = data.topic;
        const currentKeywords = topic.keywords || [];

        // Filter out the keyword to remove
        const newKeywords = currentKeywords.filter(k => k !== keyword);

        // Check if we have at least one keyword left
        if (newKeywords.length === 0) {
            if (window.TR?.toast?.show) {
                window.TR.toast.show('至少需要保留一个关键词', { variant: 'warning', durationMs: 2500 });
            }
            return;
        }

        // If nothing changed, the keyword wasn't in the list
        if (newKeywords.length === currentKeywords.length) {
            console.warn('Keyword not found in topic:', keyword);
            if (cardEl) {
                cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
                cardEl.style.opacity = '0';
                cardEl.style.transform = 'scale(0.95)';
                setTimeout(() => cardEl.remove(), 300);
            }
            if (window.TR?.toast?.show) {
                window.TR.toast.show(`已移除关键词「${keyword}」`, { variant: 'success', durationMs: 2000 });
            }
            return;
        }

        // Update topic with new keywords list
        const updateResponse = await fetch(`/api/topics/${topicId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ keywords: newKeywords })
        });

        if (!updateResponse.ok) {
            throw new Error('更新主题失败');
        }

        const updateData = await updateResponse.json();
        if (!updateData.ok) {
            throw new Error(updateData.error || '更新主题失败');
        }

        // Remove card from DOM with animation
        if (cardEl) {
            cardEl.style.transition = 'opacity 0.3s, transform 0.3s';
            cardEl.style.opacity = '0';
            cardEl.style.transform = 'scale(0.95)';
            setTimeout(() => cardEl.remove(), 300);
        }

        if (window.TR?.toast?.show) {
            window.TR.toast.show(`已从主题中移除关键词「${keyword}」`, { variant: 'success', durationMs: 2500 });
        }

    } catch (e) {
        console.error('Remove topic keyword failed:', e);
        if (window.TR?.toast?.show) {
            window.TR.toast.show('删除失败，请重试', { variant: 'error', durationMs: 2000 });
        }
    }
}

export const platformReorder = {
    _draggingCard: null,
    _draggingPlatformId: null,
    _originGrid: null,
    _originCategoryId: null,
    _pointerId: null,
    _ghostEl: null,
    _placeholderEl: null,
    _ghostRaf: null,
    _ghostClientX: 0,
    _ghostClientY: 0,
    _ghostOffsetX: 0,
    _ghostOffsetY: 0,
    _prevUserSelect: null,
    _autoScrollRaf: null,
    _autoScrollGrid: null,
    _autoScrollDir: 0,
    _autoScrollSpeed: 0,
    _reorderRaf: null,
    _reorderGrid: null,
    _reorderX: 0,
    _reorderY: 0,
    _reorderOverCard: null,

    attach() {
        if (this._attached) return;
        this._attached = true;

        const AUTO_SCROLL_EDGE_PX = 80;  // Increased from 40 for easier long-distance dragging
        const AUTO_SCROLL_MAX_SPEED = 35; // Increased from 18 for faster scrolling
        const RAPID_SCROLL_BASE_PX_PER_S = 1400;
        const RAPID_SCROLL_MAX_PX_PER_S = 5200;
        const RAPID_SCROLL_ACCEL_PX_PER_S2 = 5200;

        let leftArrow = null;
        let rightArrow = null;
        let rapidScrollRaf = null;

        const createEdgeArrows = () => {
            if (leftArrow || rightArrow) return;

            leftArrow = document.createElement('div');
            leftArrow.className = 'tr-drag-edge-arrow tr-drag-edge-arrow-left';
            leftArrow.innerHTML = '◀';
            leftArrow.style.cssText = `
                position: fixed;
                left: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 60px;
                height: 120px;
                background: linear-gradient(90deg, rgba(99, 102, 241, 0.9) 0%, rgba(99, 102, 241, 0.3) 100%);
                color: white;
                font-size: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                cursor: pointer;
                border-radius: 0 12px 12px 0;
                pointer-events: all;
                transition: background 0.2s;
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            `;
            leftArrow.style.opacity = '0.25';

            rightArrow = document.createElement('div');
            rightArrow.className = 'tr-drag-edge-arrow tr-drag-edge-arrow-right';
            rightArrow.innerHTML = '▶';
            rightArrow.style.cssText = `
                position: fixed;
                right: 0;
                top: 50%;
                transform: translateY(-50%);
                width: 60px;
                height: 120px;
                background: linear-gradient(90deg, rgba(99, 102, 241, 0.3) 0%, rgba(99, 102, 241, 0.9) 100%);
                color: white;
                font-size: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 9999;
                cursor: pointer;
                border-radius: 12px 0 0 12px;
                pointer-events: all;
                transition: background 0.2s;
                box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
            `;
            rightArrow.style.opacity = '0.25';

            document.body.appendChild(leftArrow);
            document.body.appendChild(rightArrow);
        };

        const removeEdgeArrows = () => {
            if (leftArrow) {
                leftArrow.remove();
                leftArrow = null;
            }
            if (rightArrow) {
                rightArrow.remove();
                rightArrow = null;
            }
            if (rapidScrollRaf) {
                cancelAnimationFrame(rapidScrollRaf);
                rapidScrollRaf = null;
            }
        };

        const startRapidScroll = (direction, grid) => {
            if (rapidScrollRaf) cancelAnimationFrame(rapidScrollRaf);

            let startTs = 0;
            let lastTs = 0;
            const scroll = (ts) => {
                if (!grid) return;
                if (!startTs) startTs = ts;
                if (!lastTs) lastTs = ts;

                const dt = Math.max(0, ts - lastTs);
                lastTs = ts;
                const elapsed = Math.max(0, ts - startTs);

                const speed = Math.min(
                    RAPID_SCROLL_MAX_PX_PER_S,
                    RAPID_SCROLL_BASE_PX_PER_S + (elapsed / 1000) * RAPID_SCROLL_ACCEL_PX_PER_S2
                );

                const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
                const delta = direction * speed * (dt / 1000);
                const next = Math.max(0, Math.min(maxScrollLeft, (grid.scrollLeft || 0) + delta));
                grid.scrollLeft = next;

                // Continue scrolling
                rapidScrollRaf = requestAnimationFrame(scroll);
            };

            rapidScrollRaf = requestAnimationFrame(scroll);
        };

        const stopRapidScroll = () => {
            if (rapidScrollRaf) {
                cancelAnimationFrame(rapidScrollRaf);
                rapidScrollRaf = null;
            }
        };

        const setEdgeArrowActive = (leftActive, rightActive) => {
            if (leftArrow) leftArrow.style.opacity = leftActive ? '1' : '0.25';
            if (rightArrow) rightArrow.style.opacity = rightActive ? '1' : '0.25';
        };

        const stopAutoScroll = () => {
            if (this._autoScrollRaf) {
                cancelAnimationFrame(this._autoScrollRaf);
            }
            this._autoScrollRaf = null;
            this._autoScrollGrid = null;
            this._autoScrollDir = 0;
            this._autoScrollSpeed = 0;
        };

        const stopGhostMove = () => {
            if (this._ghostRaf) cancelAnimationFrame(this._ghostRaf);
            this._ghostRaf = null;
        };

        const scheduleGhostMove = (clientX, clientY) => {
            this._ghostClientX = clientX;
            this._ghostClientY = clientY;
            if (this._ghostRaf) return;
            this._ghostRaf = requestAnimationFrame(() => {
                this._ghostRaf = null;
                if (!this._ghostEl) return;
                const x = this._ghostClientX - this._ghostOffsetX;
                const y = this._ghostClientY - this._ghostOffsetY;
                this._ghostEl.style.transform = `translate3d(${x}px, ${y}px, 0)`;
            });
        };

        const ensureAutoScrollLoop = () => {
            if (this._autoScrollRaf) return;
            let lastTs = 0;
            const tick = () => {
                if (!this._autoScrollGrid || !this._autoScrollDir || !this._autoScrollSpeed) {
                    stopAutoScroll();
                    return;
                }
                const g = this._autoScrollGrid;
                const maxScrollLeft = Math.max(0, (g.scrollWidth || 0) - (g.clientWidth || 0));
                if (maxScrollLeft <= 0) {
                    stopAutoScroll();
                    return;
                }

                const now = performance.now();
                if (!lastTs) lastTs = now;
                const dt = Math.max(0, now - lastTs);
                lastTs = now;

                const scaled = this._autoScrollSpeed * (dt / 16.6667);
                const next = Math.max(0, Math.min(maxScrollLeft, (g.scrollLeft || 0) + this._autoScrollDir * scaled));
                g.scrollLeft = next;
                this._autoScrollRaf = requestAnimationFrame(tick);
            };
            this._autoScrollRaf = requestAnimationFrame(tick);
        };

        const updateAutoScrollFromEvent = (e, grid) => {
            if (!this._draggingCard || !grid) {
                stopAutoScroll();
                setEdgeArrowActive(false, false);
                stopRapidScroll();
                return 'none';
            }

            // Check if mouse is over edge arrows
            const x = e.clientX;
            if (leftArrow && rightArrow) {
                const leftRect = leftArrow.getBoundingClientRect();
                const rightRect = rightArrow.getBoundingClientRect();

                if (x >= leftRect.left && x <= leftRect.right) {
                    setEdgeArrowActive(true, false);
                    stopAutoScroll();
                    startRapidScroll(-1, grid);
                    return 'arrow';
                } else if (x >= rightRect.left && x <= rightRect.right) {
                    setEdgeArrowActive(false, true);
                    stopAutoScroll();
                    startRapidScroll(1, grid);
                    return 'arrow';
                } else {
                    stopRapidScroll();
                }
            }

            const maxScrollLeft = Math.max(0, (grid.scrollWidth || 0) - (grid.clientWidth || 0));
            if (maxScrollLeft <= 0) {
                stopAutoScroll();
                setEdgeArrowActive(false, false);
                return 'none';
            }

            const rect = grid.getBoundingClientRect();
            const distLeft = x - rect.left;
            const distRight = rect.right - x;

            let dir = 0;
            let dist = 0;
            if (distLeft >= 0 && distLeft <= AUTO_SCROLL_EDGE_PX) {
                dir = -1;
                dist = distLeft;
            } else if (distRight >= 0 && distRight <= AUTO_SCROLL_EDGE_PX) {
                dir = 1;
                dist = distRight;
            } else {
                setEdgeArrowActive(false, false);
                stopAutoScroll();
                return 'none';
            }

            setEdgeArrowActive(dir === -1, dir === 1);

            const intensity = Math.max(0, Math.min(1, (AUTO_SCROLL_EDGE_PX - dist) / AUTO_SCROLL_EDGE_PX));
            const speed = Math.max(1, Math.round((intensity * intensity) * AUTO_SCROLL_MAX_SPEED));

            this._autoScrollGrid = grid;
            this._autoScrollDir = dir;
            this._autoScrollSpeed = speed;
            ensureAutoScrollLoop();
            return 'edge';
        };

        const stopReorder = () => {
            if (this._reorderRaf) cancelAnimationFrame(this._reorderRaf);
            this._reorderRaf = null;
            this._reorderGrid = null;
            this._reorderOverCard = null;
        };

        const ensureReorderLoop = () => {
            if (this._reorderRaf) return;
            const tick = () => {
                this._reorderRaf = null;
                const grid = this._reorderGrid;
                const moving = this._placeholderEl || this._draggingCard;
                if (!grid || !moving) return;

                let target = this._reorderOverCard;
                if (!target || target === moving || !grid.contains(target) || target.classList?.contains?.('platform-card-placeholder')) {
                    const best = getClosestCard(grid, this._reorderX, this._reorderY);
                    target = best?.card || null;
                }
                if (!target || target === moving) return;

                const r = target.getBoundingClientRect();
                const before = this._reorderX < (r.left + r.width / 2);
                const ref = before ? target : target.nextSibling;
                if (ref === moving || ref === moving.nextSibling) return;
                grid.insertBefore(moving, ref);
            };
            this._reorderRaf = requestAnimationFrame(tick);
        };

        const scheduleReorderFromEvent = (e, grid, overCard) => {
            if (!this._draggingCard || !grid) return;
            this._reorderGrid = grid;
            this._reorderX = e.clientX;
            this._reorderY = e.clientY;
            this._reorderOverCard = overCard;
            ensureReorderLoop();
        };

        const cleanupPointerDrag = () => {
            if (this._ghostEl) {
                this._ghostEl.remove();
                this._ghostEl = null;
            }
            stopGhostMove();

            if (this._prevUserSelect != null) {
                document.body.style.userSelect = this._prevUserSelect;
                this._prevUserSelect = null;
            }

            if (this._draggingCard) this._draggingCard.classList.remove('dragging');
            this._draggingCard = null;
            this._draggingPlatformId = null;
            this._originGrid = null;
            this._originCategoryId = null;
            this._pointerId = null;
            this._placeholderEl = null;
            stopAutoScroll();
            stopRapidScroll();
            stopReorder();
            setEdgeArrowActive(false, false);
            removeEdgeArrows();
        };

        const endPointerDrag = () => {
            const grid = this._originGrid;
            const categoryId = this._originCategoryId;
            const card = this._draggingCard;
            const placeholder = this._placeholderEl;

            if (card && placeholder && placeholder.parentNode) {
                placeholder.replaceWith(card);
            }

            if (grid && categoryId) {
                const ordered = Array.from(grid.querySelectorAll('.platform-card')).map(c => c.dataset.platform).filter(Boolean);
                persistPlatformOrder(categoryId, ordered);
            }

            cleanupPointerDrag();
        };

        document.addEventListener('pointerdown', (e) => {
            if (e.button !== 0) return;
            const handle = e.target?.closest?.('.platform-drag-handle');
            if (!handle) return;
            const card = handle.closest('.platform-card');
            const grid = handle.closest('.platform-grid');
            const categoryId = getCategoryIdFromGrid(grid);
            const platformId = card?.dataset?.platform || null;
            if (!card || !grid || !categoryId || !platformId) return;

            e.preventDefault();

            this._prevUserSelect = document.body.style.userSelect;
            document.body.style.userSelect = 'none';

            handle.style.touchAction = 'none';
            try {
                handle.setPointerCapture(e.pointerId);
            } catch (_) {
            }

            this._pointerId = e.pointerId;
            this._draggingCard = card;
            this._draggingPlatformId = platformId;
            this._originGrid = grid;
            this._originCategoryId = categoryId;

            const rect = card.getBoundingClientRect();
            this._ghostOffsetX = e.clientX - rect.left;
            this._ghostOffsetY = e.clientY - rect.top;

            const placeholder = document.createElement('div');
            placeholder.className = 'platform-card platform-card-placeholder';
            placeholder.style.width = rect.width + 'px';
            placeholder.style.height = rect.height + 'px';
            placeholder.style.boxSizing = 'border-box';
            placeholder.style.border = '2px dashed rgba(99, 102, 241, 0.6)';
            placeholder.style.borderRadius = '12px';
            placeholder.style.background = 'rgba(99, 102, 241, 0.06)';
            this._placeholderEl = placeholder;

            if (card.parentNode) {
                card.parentNode.replaceChild(placeholder, card);
            }

            const ghost = card.cloneNode(true);
            ghost.classList.add('dragging');
            ghost.style.position = 'fixed';
            ghost.style.left = '0';
            ghost.style.top = '0';
            ghost.style.width = rect.width + 'px';
            ghost.style.height = rect.height + 'px';
            ghost.style.margin = '0';
            ghost.style.zIndex = '10001';
            ghost.style.pointerEvents = 'none';
            ghost.style.opacity = '0.92';
            ghost.style.willChange = 'transform';
            ghost.style.transform = `translate3d(${rect.left}px, ${rect.top}px, 0)`;
            this._ghostEl = ghost;
            document.body.appendChild(ghost);

            createEdgeArrows();
            setEdgeArrowActive(false, false);
            card.classList.add('dragging');

            scheduleGhostMove(e.clientX, e.clientY);
        }, true);

        document.addEventListener('pointermove', (e) => {
            if (!this._draggingCard || this._pointerId == null) return;
            if (e.pointerId !== this._pointerId) return;

            e.preventDefault();
            scheduleGhostMove(e.clientX, e.clientY);

            const grid = this._originGrid;
            if (!grid) return;

            const scrollMode = updateAutoScrollFromEvent(e, grid);
            if (scrollMode !== 'none') {
                stopReorder();
                return;
            }

            const gridRect = grid.getBoundingClientRect();
            const inside = e.clientX >= gridRect.left && e.clientX <= gridRect.right && e.clientY >= gridRect.top && e.clientY <= gridRect.bottom;
            if (!inside) {
                stopReorder();
                return;
            }

            const el = document.elementFromPoint(e.clientX, e.clientY);
            const overCard = el?.closest?.('.platform-card');
            if (overCard && overCard.classList?.contains?.('platform-card-placeholder')) {
                scheduleReorderFromEvent(e, grid, null);
                return;
            }
            scheduleReorderFromEvent(e, grid, overCard);
        }, true);

        document.addEventListener('pointerup', (e) => {
            if (this._pointerId == null) return;
            if (e.pointerId !== this._pointerId) return;
            e.preventDefault();
            endPointerDrag();
        }, true);

        document.addEventListener('pointercancel', (e) => {
            if (this._pointerId == null) return;
            if (e.pointerId !== this._pointerId) return;
            e.preventDefault();
            endPointerDrag();
        }, true);

        document.addEventListener('dragstart', (e) => {
            const handle = e.target?.closest?.('.platform-drag-handle');
            if (!handle) return;
            e.preventDefault();
        }, true);

        // ======================================
        // Context Menu: Move to Top / Bottom
        // ======================================
        let contextMenuEl = null;

        const hideContextMenu = () => {
            if (contextMenuEl && contextMenuEl.parentNode) {
                contextMenuEl.parentNode.removeChild(contextMenuEl);
            }
            contextMenuEl = null;
        };

        const showContextMenu = (e, card, grid, categoryId) => {
            hideContextMenu();

            const isMyTags = categoryId === 'my-tags';
            const isDiscovery = categoryId === 'discovery';
            const isTopic = categoryId.startsWith('topic-');
            const tagId = card.dataset?.tagId;
            const platformId = card.dataset?.platform;
            const keyword = card.dataset?.keyword;
            const source = card.dataset?.source;

            contextMenuEl = document.createElement('div');
            contextMenuEl.className = 'tr-platform-context-menu';
            
            // Build menu items
            let menuHtml = '';
            
            if (isDiscovery && tagId) {
                // Discovery tab: show "一键关注" option
                menuHtml = `
                    <div class="tr-ctx-item" data-action="follow">➕ 一键关注</div>
                `;
            } else if (isTopic) {
                // Topic tab: show different options for keyword vs source cards
                // 编辑主题和删除主题已在栏目 tab 右键菜单中，这里只放卡片级操作
                if (keyword) {
                    menuHtml = `
                        <div class="tr-ctx-item" data-action="remove-keyword">🗑️ 删除此关键词</div>
                    `;
                } else if (source) {
                    menuHtml = `
                        <div class="tr-ctx-item" data-action="remove-source">🗑️ 删除此数据源</div>
                    `;
                }
            } else {
                // Normal tabs: show reorder options
                menuHtml = `
                    <div class="tr-ctx-item" data-action="top">⬆️ 置顶</div>
                    <div class="tr-ctx-item" data-action="bottom">⬇️ 置底</div>
                    <div class="tr-ctx-item" data-action="hide" style="border-top:1px solid #e5e7eb;">👁️‍🗨️ 隐藏卡片</div>
                    <div class="tr-ctx-item" data-action="edit" style="border-top:1px solid #e5e7eb;">⚙️ 编辑顺序</div>
                `;
                
                // Add unfollow option for my-tags
                if (isMyTags && tagId) {
                    menuHtml += `<div class="tr-ctx-item" data-action="unfollow" style="border-top:1px solid #e5e7eb;color:#ef4444;">🚫 取消关注</div>`;
                }
            }
            
            contextMenuEl.innerHTML = menuHtml;
            contextMenuEl.style.cssText = `
                position: fixed;
                left: ${e.clientX}px;
                top: ${e.clientY}px;
                background: white;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
                z-index: 10000;
                min-width: 120px;
                overflow: hidden;
            `;

            const itemStyle = `
                padding: 10px 16px;
                cursor: pointer;
                font-size: 14px;
                transition: background 0.15s;
            `;
            contextMenuEl.querySelectorAll('.tr-ctx-item').forEach(item => {
                item.style.cssText = itemStyle;
                item.addEventListener('mouseenter', () => item.style.background = '#f3f4f6');
                item.addEventListener('mouseleave', () => item.style.background = 'white');
            });

            contextMenuEl.addEventListener('click', (ev) => {
                const action = ev.target?.dataset?.action;
                if (!action) return;

                if (action === 'edit') {
                    // Open settings modal and navigate to the category
                    hideContextMenu();
                    if (window.openCategorySettings) {
                        window.openCategorySettings();
                        // Wait for modal to open, then trigger edit for this category
                        setTimeout(() => {
                            try {
                                if (TR.settings && typeof TR.settings.editCategory === 'function') {
                                    TR.settings.editCategory(categoryId);
                                }
                            } catch (e) {
                                console.error('Failed to edit category:', e);
                            }
                        }, 100);
                    }
                    return;
                }

                if (action === 'edit-topic' && isTopic) {
                    // Edit topic
                    hideContextMenu();
                    const topicId = categoryId.replace('topic-', '');
                    if (window.TopicTracker && typeof window.TopicTracker.editTopic === 'function') {
                        window.TopicTracker.editTopic(topicId);
                    }
                    return;
                }

                if (action === 'delete-topic' && isTopic) {
                    // Delete topic
                    hideContextMenu();
                    const topicId = categoryId.replace('topic-', '');
                    if (window.TopicTracker && typeof window.TopicTracker.deleteTopic === 'function') {
                        window.TopicTracker.deleteTopic(topicId);
                    }
                    return;
                }

                if (action === 'remove-keyword' && isTopic && keyword) {
                    // Remove keyword from topic
                    hideContextMenu();
                    const topicId = categoryId.replace('topic-', '');
                    removeTopicKeyword(card, keyword, topicId);
                    return;
                }

                if (action === 'remove-source' && isTopic && source) {
                    // Remove source from topic
                    hideContextMenu();
                    const topicId = categoryId.replace('topic-', '');
                    removeTopicSource(card, source, topicId);
                    return;
                }

                if (action === 'hide' && platformId) {
                    hideContextMenu();
                    hidePlatformCard(card, platformId, categoryId);
                    return;
                }

                if (action === 'follow' && isDiscovery && tagId) {
                    hideContextMenu();
                    // Check if user is logged in
                    const authState = window.authState || (window.HotNews && window.HotNews.authState);
                    let isLoggedIn = false;
                    try {
                        if (authState && typeof authState.isLoggedIn === 'function') {
                            isLoggedIn = authState.isLoggedIn();
                        } else if (authState && typeof authState.getUser === 'function') {
                            isLoggedIn = !!authState.getUser();
                        }
                    } catch (e) {
                        console.error('Auth check failed:', e);
                    }
                    
                    if (!isLoggedIn) {
                        // Open login modal
                        if (typeof window.openLoginModal === 'function') {
                            window.openLoginModal();
                        }
                        return;
                    }
                    
                    // Call follow API
                    const tagName = card.querySelector('.platform-name')?.textContent?.replace(/NEW.*$/, '').replace(/发现于.*$/, '').replace(/\(.*\)/, '').trim() || tagId;
                    fetch('/api/user/preferences/tag-settings', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ tag_id: tagId, preference: 'follow' })
                    }).then(resp => {
                        if (!resp.ok) throw new Error('关注失败');
                        return resp.json();
                    }).then(data => {
                        if (!data.ok) throw new Error(data.error || '关注失败');
                        // Clear my-tags cache
                        try { localStorage.removeItem('hotnews_my_tags_cache'); } catch {}
                        // Show toast
                        if (window.TR?.toast?.show) {
                            window.TR.toast.show(`已关注「${tagName}」`, { variant: 'success', durationMs: 2000 });
                        }
                    }).catch(err => {
                        console.error('Follow failed:', err);
                        if (window.TR?.toast?.show) {
                            window.TR.toast.show('关注失败，请重试', { variant: 'error', durationMs: 2000 });
                        }
                    });
                    return;
                }

                if (action === 'unfollow' && isMyTags && tagId) {
                    hideContextMenu();
                    const tagName = card.querySelector('.platform-name')?.textContent?.replace(/\(.*\)/, '').trim() || tagId;
                    const itemType = card.dataset?.itemType || 'tag';

                    // Build the correct API call based on item type
                    let unfollowPromise;
                    if (itemType === 'source') {
                        // Source subscription: POST /api/sources/unsubscribe
                        const sourceType = tagId.startsWith('custom-') || tagId.startsWith('custom_') ? 'custom' : 'rss';
                        unfollowPromise = fetch('/api/sources/unsubscribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ source_id: tagId, source_type: sourceType })
                        });
                    } else if (itemType === 'keyword') {
                        // Keyword: DELETE /api/user/keywords/{keyword_id}
                        const keywordId = card.dataset?.keywordId;
                        if (keywordId) {
                            unfollowPromise = fetch(`/api/user/keywords/${encodeURIComponent(keywordId)}`, {
                                method: 'DELETE',
                                credentials: 'include',
                            });
                        } else {
                            // Fallback: extract numeric id from tag_id like "keyword_42"
                            const kwMatch = tagId.match(/^keyword_(\d+)$/);
                            if (kwMatch) {
                                unfollowPromise = fetch(`/api/user/keywords/${kwMatch[1]}`, {
                                    method: 'DELETE',
                                    credentials: 'include',
                                });
                            }
                        }
                    } else if (itemType === 'wechat') {
                        // WeChat MP: POST /api/wechat/unsubscribe
                        const fakeid = card.dataset?.fakeid || tagId.replace(/^mp-/, '');
                        unfollowPromise = fetch('/api/wechat/unsubscribe', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ fakeid })
                        });
                    } else {
                        // Tag: POST /api/user/preferences/tag-settings
                        unfollowPromise = fetch('/api/user/preferences/tag-settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ tag_id: tagId, preference: 'neutral' })
                        });
                    }

                    if (!unfollowPromise) {
                        if (window.TR?.toast?.show) {
                            window.TR.toast.show('操作失败，请重试', { variant: 'error', durationMs: 2000 });
                        }
                        return;
                    }

                    unfollowPromise.then(resp => {
                        if (!resp.ok) throw new Error('取消关注失败');
                        // Remove card with animation
                        card.style.transition = 'opacity 0.3s, transform 0.3s';
                        card.style.opacity = '0';
                        card.style.transform = 'scale(0.95)';
                        setTimeout(() => card.remove(), 300);
                        // Clear cache
                        try { localStorage.removeItem('hotnews_my_tags_cache'); } catch {}
                        // Show toast
                        if (window.TR?.toast?.show) {
                            window.TR.toast.show(`已取消关注「${tagName}」`, { variant: 'success', durationMs: 2000 });
                        }
                    }).catch(err => {
                        console.error('Unfollow failed:', err);
                        if (window.TR?.toast?.show) {
                            window.TR.toast.show('操作失败，请重试', { variant: 'error', durationMs: 2000 });
                        }
                    });
                    return;
                }

                const cards = Array.from(grid.querySelectorAll('.platform-card'));
                if (action === 'top') {
                    grid.insertBefore(card, cards[0]);
                } else if (action === 'bottom') {
                    grid.appendChild(card);
                }

                // Save order
                const ordered = Array.from(grid.querySelectorAll('.platform-card')).map(c => c.dataset.platform).filter(Boolean);
                persistPlatformOrder(categoryId, ordered);

                hideContextMenu();
            });

            document.body.appendChild(contextMenuEl);

            // Adjust position if off-screen
            const rect = contextMenuEl.getBoundingClientRect();
            if (rect.right > window.innerWidth) {
                contextMenuEl.style.left = (window.innerWidth - rect.width - 8) + 'px';
            }
            if (rect.bottom > window.innerHeight) {
                contextMenuEl.style.top = (window.innerHeight - rect.height - 8) + 'px';
            }
        };

        document.addEventListener('click', (e) => {
            if (contextMenuEl && !contextMenuEl.contains(e.target)) {
                hideContextMenu();
            }
        }, true);

        document.addEventListener('contextmenu', (e) => {
            // Only trigger on drag handle or platform header
            const handle = e.target?.closest?.('.platform-drag-handle');
            const header = e.target?.closest?.('.platform-header');
            if (!handle && !header) return;

            const card = e.target?.closest?.('.platform-card');
            const grid = e.target?.closest?.('.platform-grid');
            const categoryId = getCategoryIdFromGrid(grid);

            if (!card || !grid || !categoryId) return;

            // Exclude special categories: explore, knowledge (morning brief)
            // my-tags is handled separately with additional "unfollow" option
            // discovery is handled separately with "follow" option
            if (categoryId === 'explore' || categoryId === 'knowledge') return;

            e.preventDefault();
            showContextMenu(e, card, grid, categoryId);
        }, true);
    }
};

TR.platformReorder = platformReorder;

ready(() => {
    platformReorder.attach();
});
