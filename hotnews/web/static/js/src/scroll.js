/**
 * Hotnews Scroll Module
 * 平台滚动持久化 + 微信返回导航恢复
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';

const PLATFORM_GRID_SCROLL_STORAGE_KEY = 'hotnews_platform_grid_scroll_v1';
// Use localStorage instead of sessionStorage for nav state
// because WeChat browser may open links in a new webview,
// causing sessionStorage to be lost on back-navigation.
const NAV_STATE_KEY = 'hotnews_nav_state_v2';

/**
 * @typedef {Object} PlatformGridScrollEntry
 * @property {number} left - scrollLeft value
 * @property {string|null} anchorPlatformId - Platform ID of the anchor card
 * @property {number} anchorOffsetX - Offset from anchor card's left edge
 * @property {number} updatedAt - Timestamp when saved
 */

/**
 * @typedef {Object} NavigationState
 * @property {number} scrollY - Window scroll position
 * @property {string|null} activeTab - Active tab ID
 * @property {number} timestamp - When the state was saved
 * @property {number} [gridScrollLeft] - Platform grid scrollLeft
 * @property {string} [anchorPlatformId] - Anchor platform card ID
 * @property {number} [anchorOffsetX] - Offset from anchor card
 */

export const scroll = {
    /**
     * Get all saved platform grid scroll positions.
     * @returns {Record<string, PlatformGridScrollEntry>}
     */
    getPlatformGridScrollState() {
        return storage.get(PLATFORM_GRID_SCROLL_STORAGE_KEY, {});
    },

    /**
     * Save platform grid scroll positions.
     * @param {Record<string, PlatformGridScrollEntry>} state
     */
    setPlatformGridScrollState(state) {
        storage.set(PLATFORM_GRID_SCROLL_STORAGE_KEY, state || {});
    },

    /**
     * Record the current scroll position of a tab's platform grid.
     * @param {string} tabId
     * @param {HTMLElement} grid
     */
    recordPlatformGridScrollForTab(tabId, grid) {
        if (!tabId || !grid) return;

        const left = grid.scrollLeft || 0;
        let anchorPlatformId = null;
        let anchorOffsetX = 0;

        let anchor = null;
        const cards = grid.querySelectorAll('.platform-card');
        for (const card of cards) {
            if ((card.offsetLeft || 0) <= left + 1) {
                anchor = card;
            } else {
                break;
            }
        }
        if (anchor?.dataset?.platform) {
            anchorPlatformId = anchor.dataset.platform;
            anchorOffsetX = Math.max(0, left - (anchor.offsetLeft || 0));
        }

        const state = this.getPlatformGridScrollState();
        state[tabId] = {
            left,
            anchorPlatformId,
            anchorOffsetX,
            updatedAt: Date.now(),
        };
        this.setPlatformGridScrollState(state);
    },

    /** Bind scroll event listeners to all platform grids for persistence. */
    attachPlatformGridScrollPersistence() {
        document.querySelectorAll('.tab-pane .platform-grid').forEach((grid) => {
            if (grid.dataset.scrollPersistBound === '1') return;
            grid.dataset.scrollPersistBound = '1';

            let ticking = false;
            grid.addEventListener('scroll', () => {
                if (grid.dataset.trRestoring !== '1') {
                    grid.dataset.trUserScrolled = '1';
                }
                if (ticking) return;
                ticking = true;
                requestAnimationFrame(() => {
                    ticking = false;
                    // Don't overwrite saved scroll state during programmatic restore
                    if (grid.dataset.trRestoring === '1') return;
                    const pane = grid.closest('.tab-pane');
                    const tabId = pane?.id?.startsWith('tab-') ? pane.id.slice(4) : null;
                    this.recordPlatformGridScrollForTab(tabId, grid);
                });
            }, { passive: true });
        });
    },

    /**
     * Restore platform grid scroll from snapshot state (normal refresh).
     * @param {{ activeTab?: string, preserveScroll?: boolean, activeTabPlatformGridScrollLeft?: number, activeTabPlatformAnchorPlatformId?: string, activeTabPlatformAnchorOffsetX?: number }} state
     */
    restoreActiveTabPlatformGridScroll(state) {
        const tabId = state?.activeTab;
        if (!state?.preserveScroll || !tabId) return;

        const saved = this.getPlatformGridScrollState()?.[tabId];
        const left = Number.isFinite(saved?.left) ? saved.left : (Number.isFinite(state.activeTabPlatformGridScrollLeft) ? state.activeTabPlatformGridScrollLeft : 0);
        const anchorId = (typeof saved?.anchorPlatformId === 'string' && saved.anchorPlatformId) ? saved.anchorPlatformId : state.activeTabPlatformAnchorPlatformId;
        const offsetX = Number.isFinite(saved?.anchorOffsetX) ? saved.anchorOffsetX : (Number.isFinite(state.activeTabPlatformAnchorOffsetX) ? state.activeTabPlatformAnchorOffsetX : 0);

        this._applyGridScroll(tabId, anchorId, offsetX, left, false);
    },

    /**
     * Restore platform grid scroll from navigation state (back-navigation).
     * Force mode: ignores trUserScrolled, uses anchor from nav state.
     * @param {NavigationState} navState
     */
    restoreNavGridScroll(navState) {
        if (!navState || !navState.activeTab) return;
        const tabId = navState.activeTab;
        const anchorId = navState.anchorPlatformId || null;
        const offsetX = Number.isFinite(navState.anchorOffsetX) ? navState.anchorOffsetX : 0;
        const left = Number.isFinite(navState.gridScrollLeft) ? navState.gridScrollLeft : 0;

        // If nav state doesn't have anchor info, fall back to localStorage
        if (!anchorId && left <= 0) {
            const saved = this.getPlatformGridScrollState()?.[tabId];
            if (saved) {
                this._applyGridScroll(tabId, saved.anchorPlatformId, saved.anchorOffsetX || 0, saved.left || 0, true);
                return;
            }
        }

        this._applyGridScroll(tabId, anchorId, offsetX, left, true);
    },

    /**
     * Internal: apply grid scroll with retry logic.
     * @param {string} tabId
     * @param {string|null} anchorId
     * @param {number} offsetX
     * @param {number} left
     * @param {boolean} force - if true, ignores trUserScrolled flag
     */
    _applyGridScroll(tabId, anchorId, offsetX, left, force) {
        if (!tabId) return;

        const applyOnce = () => {
            const grid = document.querySelector(`#tab-${tabId} .platform-grid`);
            if (!grid) return false;

            if (!force && grid.dataset.trUserScrolled === '1') return false;

            // Temporarily disable scroll-snap and smooth behavior
            // so programmatic scrollLeft assignment takes effect immediately
            // without being overridden by snap alignment or animated smoothly.
            const origSnapType = grid.style.scrollSnapType;
            const origBehavior = grid.style.scrollBehavior;
            grid.style.scrollSnapType = 'none';
            grid.style.scrollBehavior = 'auto';

            let applied = false;

            if (anchorId) {
                const anchorCard = grid.querySelector(`.platform-card[data-platform="${anchorId}"]`);
                if (anchorCard && anchorCard.offsetParent !== null) {
                    grid.dataset.trRestoring = '1';
                    grid.scrollLeft = (anchorCard.offsetLeft || 0) + offsetX;
                    applied = true;
                }
            }

            if (!applied && left > 0) {
                grid.dataset.trRestoring = '1';
                grid.scrollLeft = left;
                applied = true;
            }

            if (applied) {
                // Delay restoring scroll-snap to ensure scrollLeft has taken effect
                requestAnimationFrame(() => {
                    grid.style.scrollSnapType = origSnapType;
                    grid.style.scrollBehavior = origBehavior;
                    try { delete grid.dataset.trRestoring; } catch (_) { }
                });
            } else {
                grid.style.scrollSnapType = origSnapType;
                grid.style.scrollBehavior = origBehavior;
            }

            return applied;
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                applyOnce();
                setTimeout(applyOnce, 50);
                setTimeout(applyOnce, 200);
                setTimeout(applyOnce, 600);
                setTimeout(applyOnce, 1200);
                setTimeout(applyOnce, 2000);
            });
        });
    },

    /**
     * Save full page state to localStorage before navigating away.
     * Uses localStorage (not sessionStorage) because WeChat browser
     * may open links in a new webview, losing sessionStorage.
     */
    saveNavigationState() {
        try {
            const activeTab = storage.getRaw('hotnews_active_tab') ||
                (document.querySelector('.category-tab.active')?.dataset?.category) || null;
            const state = {
                scrollY: window.scrollY || 0,
                activeTab,
                timestamp: Date.now(),
            };
            // Snapshot the current tab's platform grid scroll and embed in nav state
            if (activeTab) {
                const grid = document.querySelector(`#tab-${activeTab} .platform-grid`);
                if (grid) {
                    this.recordPlatformGridScrollForTab(activeTab, grid);
                    try {
                        const gridState = this.getPlatformGridScrollState()?.[activeTab];
                        if (gridState) {
                            state.gridScrollLeft = gridState.left || 0;
                            state.anchorPlatformId = gridState.anchorPlatformId || null;
                            state.anchorOffsetX = gridState.anchorOffsetX || 0;
                        }
                    } catch (_) { }
                }
            }
            storage.setRaw(NAV_STATE_KEY, JSON.stringify(state));
        } catch (e) {
            // ignore
        }
    },

    /**
     * Retrieve and consume saved navigation state.
     * Returns the state object or null if none/expired (5 min TTL).
     * @returns {NavigationState|null}
     */
    consumeNavigationState() {
        try {
            const raw = storage.getRaw(NAV_STATE_KEY);
            if (!raw) return null;
            storage.remove(NAV_STATE_KEY);
            const state = JSON.parse(raw);
            // Expire after 5 minutes
            if (state && (Date.now() - (state.timestamp || 0)) < 300000) {
                return state;
            }
        } catch (e) {
            // ignore
        }
        return null;
    },

    /**
     * Peek at saved navigation state without consuming it.
     * @returns {NavigationState|null}
     */
    peekNavigationState() {
        try {
            const raw = storage.getRaw(NAV_STATE_KEY);
            if (!raw) return null;
            const state = JSON.parse(raw);
            if (state && (Date.now() - (state.timestamp || 0)) < 300000) {
                return state;
            }
        } catch (e) {
            // ignore
        }
        return null;
    },

    /**
     * Restore scrollY from saved navigation state.
     * @param {NavigationState} navState
     */
    restoreNavigationScrollY(navState) {
        if (!navState) return;
        const y = Number(navState.scrollY || 0);
        if (y <= 0) return;

        const doRestore = () => {
            try {
                window.scrollTo({ top: y, behavior: 'auto' });
            } catch (e) { /* ignore */ }
        };

        requestAnimationFrame(doRestore);
        setTimeout(doRestore, 50);
        setTimeout(doRestore, 200);
        setTimeout(doRestore, 500);
    },

    /** Temporarily disable scroll-snap on body. */
    pauseScrollSnap() {
        document.body.classList.add('tr-snap-paused');
    },

    /** Re-enable scroll-snap on body after a short delay. */
    resumeScrollSnap() {
        setTimeout(() => {
            document.body.classList.remove('tr-snap-paused');
        }, 100);
    },

    /** Set up visibility/beforeunload/pageshow handlers for scroll state persistence. */
    setupVisibilityScrollFix() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                document.body.classList.add('tr-page-hidden');
                this.pauseScrollSnap();
                this.saveNavigationState();
            } else if (document.visibilityState === 'visible') {
                document.body.classList.remove('tr-page-hidden');
                this.resumeScrollSnap();
            }
        });

        window.addEventListener('beforeunload', () => {
            this.pauseScrollSnap();
            this.saveNavigationState();
        });

        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                document.body.classList.remove('tr-page-hidden');
                this.resumeScrollSnap();
            }
        });
    }
};

TR.scroll = scroll;

ready(function () {
    scroll.setupVisibilityScrollFix();
});
