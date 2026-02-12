/**
 * Hotnews Init Module
 * 初始化入口 - 处理栏目闪烁问题
 */

import { TR, ready } from './core.js';
import { authState } from './auth-state.js';
import { AuthButton } from './auth-ui.js';
import { openLoginModal } from './login-modal.js';
import { initTodoButton, loadTodos } from './todo.js';
import { openSubscriptionModal } from './subscription.js';
import { openSubscribeSidebar } from './subscribe-sidebar.js';

// 保留原 Token 充值功能（隐藏，仅内部使用）
import { openPaymentModal as openTokenPaymentModal } from './payment.js';

const MOBILE_TOP_COLLAPSE_STORAGE_KEY = 'hotnews_mobile_top_collapsed_v1';
const MOBILE_TOP_COLLAPSE_CLASS = 'tr-mobile-top-collapsed';

/**
 * 跳转到设置页面（需要登录）
 * 现在改为打开快速订阅侧边栏
 */
function goToSettings() {
    if (authState.isLoggedIn()) {
        openSubscribeSidebar();
    } else {
        openLoginModal();
    }
}

// 暴露到全局
window.goToSettings = goToSettings;
// openPaymentModal 现在打开订阅弹窗（VIP）
window.openPaymentModal = openSubscriptionModal;
window.openSubscriptionModal = openSubscriptionModal;
// 保留原 Token 充值功能（隐藏入口）
window.openTokenPaymentModal = openTokenPaymentModal;

function _isMobileNarrowScreen() {
    try {
        return !!window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    } catch (e) {
        return false;
    }
}

function _setMobileTopCollapsed(collapsed) {
    const next = !!collapsed;
    try {
        document.body.classList.toggle(MOBILE_TOP_COLLAPSE_CLASS, next);
    } catch (e) {
        // ignore
    }
    try {
        localStorage.setItem(MOBILE_TOP_COLLAPSE_STORAGE_KEY, next ? '1' : '0');
    } catch (e) {
        // ignore
    }
    try {
        const link = document.getElementById('trFooterTopToggle');
        if (link) {
            link.textContent = next ? '显示顶部' : '隐藏顶部';
        }
    } catch (e) {
        // ignore
    }
}

function _setupMobileTopToggle() {
    let collapsed = true;
    try {
        const raw = localStorage.getItem(MOBILE_TOP_COLLAPSE_STORAGE_KEY);
        if (raw === '0') collapsed = false;
        if (raw === '1') collapsed = true;
    } catch (e) {
        // ignore
    }

    // E2E: always keep the top area visible, so tests can reliably interact with category tabs.
    try {
        const isE2E = (new URLSearchParams(window.location.search)).get('e2e') === '1';
        if (isE2E) {
            collapsed = false;
        }
    } catch (e) {
        // ignore
    }

    _setMobileTopCollapsed(collapsed);

    try {
        const link = document.getElementById('trFooterTopToggle');
        if (!link) return;
        if (link.dataset.bound === '1') return;
        link.dataset.bound = '1';
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', '显示或隐藏顶部栏');
        link.addEventListener('click', () => {
            const next = !document.body.classList.contains(MOBILE_TOP_COLLAPSE_CLASS);
            _setMobileTopCollapsed(next);
            if (!next) {
                try {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                } catch (e) {
                    // ignore
                }
            }
        });
    } catch (e) {
        // ignore
    }
}

// 初始化：检查用户配置并决定是否需要刷新数据
ready(function () {
    try {
        const isE2E = (new URLSearchParams(window.location.search)).get('e2e') === '1';
        if (isE2E) {
            try {
                const early = document.getElementById('early-hide');
                if (early) early.remove();
                const earlyCategories = document.getElementById('early-hide-categories');
                if (earlyCategories) earlyCategories.remove();
            } catch (e) {
                // ignore
            }
            try {
                const tabs = document.querySelector('.category-tabs');
                if (tabs && tabs instanceof HTMLElement) {
                    tabs.style.display = 'flex';
                }
            } catch (e) {
                // ignore
            }
            try {
                const content = document.querySelector('.tab-content-area');
                if (content && content instanceof HTMLElement) {
                    content.style.display = 'block';
                }
            } catch (e) {
                // ignore
            }
        }
    } catch (e) {
        // ignore
    }

    _setupMobileTopToggle();

    // Initialize AuthButton component if container exists
    // Note: authState auto-initializes on module load, so user data should be available
    const initAuthButton = () => {
        const authContainer = document.getElementById('authButtonContainer');
        if (authContainer) {
            new AuthButton(authContainer);
            console.log('[Init] AuthButton initialized');
        }
    };

    // Wait a short time for authState to complete initialization
    setTimeout(initAuthButton, 100);
    
    // Check if we should auto-open login modal (from /api/auth/page redirect)
    setTimeout(() => {
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.get('login') === '1') {
                // Remove the login parameter from URL without reload
                const url = new URL(window.location.href);
                url.searchParams.delete('login');
                window.history.replaceState({}, '', url.pathname + url.search);
                // Open login modal
                openLoginModal();
            }
        } catch (e) {
            console.error('[Init] Error checking login param:', e);
        }
    }, 300);
    
    // Initialize Todo button after auth is ready
    setTimeout(() => {
        initTodoButton();
        // Reload todos when user logs in
        authState.subscribe((user) => {
            if (user) {
                loadTodos();
            }
        });
    }, 200);

    // 检查栏目设置 NEW 标记是否应该隐藏 - 现在始终显示 NEW
    // (已移除隐藏逻辑，让 NEW 标记一直显示)

    if (localStorage.getItem('rss_subscription_badge_dismissed') === 'true') {
        const badge = document.getElementById('rssSubscriptionNewBadge');
        if (badge) badge.style.display = 'none';
    }

    // 检查用户是否有自定义配置
    const config = TR.settings.getCategoryConfig();
    const hasCustomConfig = config && (
        (config.customCategories && config.customCategories.length > 0) ||
        (config.hiddenDefaultCategories && config.hiddenDefaultCategories.length > 0) ||
        (config.categoryOrder && config.categoryOrder.length > 0) ||
        (config.platformOrder && typeof config.platformOrder === 'object' && Object.keys(config.platformOrder).length > 0)
    );

    // 获取默认配置中的隐藏栏目
    const defaultConfig = TR.settings.getDefaultCategoryConfig();
    const hasDefaultHiddenCategories = defaultConfig && 
        defaultConfig.hiddenDefaultCategories && 
        defaultConfig.hiddenDefaultCategories.length > 0;

    // 如果有自定义配置，或者有默认隐藏的栏目，都需要刷新数据
    if (hasCustomConfig || hasDefaultHiddenCategories) {
        // 触发数据刷新来应用配置
        // renderViewerFromData 完成后会添加 .categories-ready 类
        // If returning from navigation (WeChat back), preserve scroll position
        const hasNavState = !!(TR.scroll?.peekNavigationState?.());
        console.log('[Init] hasCustomConfig:', hasCustomConfig, 'hasNavState:', hasNavState, 'navState:', TR.scroll?.peekNavigationState?.());
        TR.data.refreshViewerData({ preserveScroll: hasNavState });

        try {
            window.setTimeout(() => {
                try {
                    if (document.body.classList.contains('categories-ready')) return;
                } catch (e) {
                    // ignore
                }
                try {
                    const early = document.getElementById('early-hide');
                    if (early) early.remove();
                    const earlyCategories = document.getElementById('early-hide-categories');
                    if (earlyCategories) earlyCategories.remove();
                } catch (e) {
                    // ignore
                }
                try {
                    const tabs = document.querySelector('.category-tabs');
                    if (tabs && tabs instanceof HTMLElement) {
                        tabs.style.display = 'flex';
                    }
                } catch (e) {
                    // ignore
                }
                try {
                    const content = document.querySelector('.tab-content-area');
                    if (content && content instanceof HTMLElement) {
                        content.style.display = 'block';
                    }
                } catch (e) {
                    // ignore
                }
                try {
                    document.body.classList.add('categories-ready');
                } catch (e) {
                    // ignore
                }
            }, 2500);
        } catch (e) {
            // ignore
        }
    } else {
        // 无自定义配置，直接显示服务端渲染的默认栏目
        document.body.classList.add('categories-ready');

        // Signal to dynamic modules that no renderViewerFromData will be called,
        // so they can safely consume nav state on their first load.
        window._trNoRebuildExpected = true;

        // Check for saved navigation state (back-navigation from WeChat etc.)
        // When there's no custom config, refreshViewerData won't be called,
        // so we need to restore scroll position here.
        try {
            const navState = TR.scroll?.peekNavigationState?.() || null;
            if (navState) {
                const isTopicTab = String(navState.activeTab || '').startsWith('topic-');
                const isDynamicTab = ['my-tags', 'discovery', 'featured-mps', 'knowledge', 'explore'].includes(navState.activeTab);
                
                if (isTopicTab || isDynamicTab) {
                    // Dynamic tab content not yet loaded - leave nav state for the module to consume
                    // Just preserve the active tab in localStorage so switchTab doesn't overwrite it
                    if (navState.activeTab) {
                        TR.tabs.switchTab(navState.activeTab);
                    }
                } else {
                    // Consume and restore for non-dynamic tabs
                    const consumed = TR.scroll.consumeNavigationState();
                    if (consumed && consumed.activeTab) {
                        TR.tabs.switchTab(consumed.activeTab);
                    }
                    TR.scroll.restoreNavigationScrollY(consumed || navState);
                    TR.scroll.restoreNavGridScroll(consumed || navState);
                }
            }
        } catch (e) {
            // ignore
        }
    }
});
