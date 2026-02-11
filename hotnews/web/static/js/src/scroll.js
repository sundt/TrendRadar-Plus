/**
 * Hotnews Scroll Module
 * 平台滚动持久化
 */

import { TR, ready } from './core.js';
import { storage } from './storage.js';

const PLATFORM_GRID_SCROLL_STORAGE_KEY = 'hotnews_platform_grid_scroll_v1';
const NAV_STATE_SESSION_KEY = 'hotnews_nav_state_v1';

export const scroll = {
    getPlatformGridScrollState() {
        return storage.get(PLATFORM_GRID_SCROLL_STORAGE_KEY, {});
    },

    setPlatformGridScrollState(state) {
        storage.set(PLATFORM_GRID_SCROLL_STORAGE_KEY, state || {});
    },

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
                    const pane = grid.closest('.tab-pane');
                    const tabId = pane?.id?.startsWith('tab-') ? pane.id.slice(4) : null;
                    this.recordPlatformGridScrollForTab(tabId, grid);
                });
            }, { passive: true });
        });
    },

    restoreActiveTabPlatformGridScroll(state) {
        const tabId = state?.activeTab;
        if (!state?.preserveScroll || !tabId) return;

        const saved = this.getPlatformGridScrollState()?.[tabId];
        const left = Number.isFinite(saved?.left) ? saved.left : (Number.isFinite(state.activeTabPlatformGridScrollLeft) ? state.activeTabPlatformGridScrollLeft : 0);
        const anchorId = (typeof saved?.anchorPlatformId === 'string' && saved.anchorPlatformId) ? saved.anchorPlatformId : state.activeTabPlatformAnchorPlatformId;
        const offsetX = Number.isFinite(saved?.anchorOffsetX) ? saved.anchorOffsetX : (Number.isFinite(state.activeTabPlatformAnchorOffsetX) ? state.activeTabPlatformAnchorOffsetX : 0);

        const applyOnce = () => {
            const grid = document.querySelector(`#tab-${tabId} .platform-grid`);
            if (!grid) return;

            if (grid.dataset.trUserScrolled === '1') return;

            if (anchorId) {
                let anchorCard = null;
                grid.querySelectorAll('.platform-card').forEach((card) => {
                    if (!anchorCard && card.dataset.platform === anchorId) {
                        anchorCard = card;
                    }
                });
                if (anchorCard && anchorCard.offsetParent !== null) {
                    grid.dataset.trRestoring = '1';
                    grid.scrollLeft = (anchorCard.offsetLeft || 0) + offsetX;
                    requestAnimationFrame(() => {
                        try { delete grid.dataset.trRestoring; } catch (_) { }
                    });
                    return;
                }
            }

            grid.dataset.trRestoring = '1';
            grid.scrollLeft = left;
            requestAnimationFrame(() => {
                try { delete grid.dataset.trRestoring; } catch (_) { }
            });
        };

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                applyOnce();
                setTimeout(applyOnce, 50);
                setTimeout(applyOnce, 200);
                setTimeout(applyOnce, 600);
            });
        });
    },

    /**
     * Save full page state to sessionStorage before navigating away.
     * This is critical for WeChat browser which doesn't support bfcache
     * and does a full page reload on back navigation.
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
            // Also snapshot the current tab's platform grid scroll
            if (activeTab) {
                const grid = document.querySelector(`#tab-${activeTab} .platform-grid`);
                if (grid) {
                    this.recordPlatformGridScrollForTab(activeTab, grid);
                }
            }
            sessionStorage.setItem(NAV_STATE_SESSION_KEY, JSON.stringify(state));
        } catch (e) {
            // ignore - sessionStorage may be unavailable
        }
    },

    /**
     * Retrieve and consume saved navigation state from sessionStorage.
     * Returns the state object or null if none/expired.
     */
    consumeNavigationState() {
        try {
            const raw = sessionStorage.getItem(NAV_STATE_SESSION_KEY);
            if (!raw) return null;
            sessionStorage.removeItem(NAV_STATE_SESSION_KEY);
            const state = JSON.parse(raw);
            // Expire after 10 minutes to avoid stale restores
            if (state && (Date.now() - (state.timestamp || 0)) < 600000) {
                return state;
            }
        } catch (e) {
            // ignore
        }
        return null;
    },

    /**
     * Peek at saved navigation state without consuming it.
     */
    peekNavigationState() {
        try {
            const raw = sessionStorage.getItem(NAV_STATE_SESSION_KEY);
            if (!raw) return null;
            const state = JSON.parse(raw);
            if (state && (Date.now() - (state.timestamp || 0)) < 600000) {
                return state;
            }
        } catch (e) {
            // ignore
        }
        return null;
    },

    /**
     * Restore scrollY and platform grid scroll from saved navigation state.
     * Called after data rendering is complete.
     */
    restoreNavigationScrollY(navState) {
        if (!navState) return;
        const y = Number(navState.scrollY || 0);
        if (y <= 0) return;

        const doRestore = () => {
            try {
                window.scrollTo({ top: y, behavior: 'auto' });
            } catch (e) {
                // ignore
            }
        };

        // Multiple attempts to handle async rendering
        requestAnimationFrame(doRestore);
        setTimeout(doRestore, 50);
        setTimeout(doRestore, 200);
        setTimeout(doRestore, 500);
    },

    /**
     * Pause scroll-snap to prevent jump when returning from external link
     */
    pauseScrollSnap() {
        document.body.classList.add('tr-snap-paused');
    },

    /**
     * Resume scroll-snap after a short delay
     */
    resumeScrollSnap() {
        // Use a small delay to let the browser settle before re-enabling snap
        setTimeout(() => {
            document.body.classList.remove('tr-snap-paused');
        }, 100);
    },

    /**
     * Setup visibility change handlers to prevent scroll jump
     */
    setupVisibilityScrollFix() {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') {
                // Page is being hidden (user clicked a link, switched tab, etc.)
                document.body.classList.add('tr-page-hidden');
                this.pauseScrollSnap();
                // Save full state for WeChat browser back-navigation
                this.saveNavigationState();
            } else if (document.visibilityState === 'visible') {
                // Page is becoming visible again
                document.body.classList.remove('tr-page-hidden');
                // Resume scroll-snap after a short delay to prevent jump
                this.resumeScrollSnap();
            }
        });

        // Also handle beforeunload for immediate link clicks
        window.addEventListener('beforeunload', () => {
            this.pauseScrollSnap();
            this.saveNavigationState();
        });

        // Handle pageshow for bfcache restores (some browsers)
        window.addEventListener('pageshow', (e) => {
            if (e.persisted) {
                // Page was restored from bfcache
                document.body.classList.remove('tr-page-hidden');
                this.resumeScrollSnap();
            }
        });
    }
};

TR.scroll = scroll;

// Initialize visibility scroll fix
ready(function () {
    scroll.setupVisibilityScrollFix();
});

