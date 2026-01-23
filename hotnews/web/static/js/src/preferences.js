/**
 * Preferences Module
 * 用户偏好设置管理，支持云同步
 * 
 * Features:
 * - 已登录用户：从服务器获取/保存设置，本地缓存
 * - 未登录用户：仅使用 localStorage
 * - 服务器请求失败时回退到 localStorage
 * - 登录时自动同步设置
 */

import { authState } from './auth-state.js';

// localStorage 键名
const STORAGE_KEYS = {
    CATEGORY_CONFIG: 'hotnews_categories_config',
    THEME: 'hotnews_theme_mode',
    FAVORITES_WIDTH: 'hotnews_favorites_width',
    TODO_WIDTH: 'todo_sidebar_width'
};

// API 端点
const API_ENDPOINT = '/api/user/preferences/sync';

/**
 * 从 localStorage 获取偏好设置
 */
function getFromLocalStorage() {
    const result = {
        category_config: null,
        theme: 'light',
        sidebar_widths: {}
    };

    try {
        // 栏目配置
        const categoryConfigRaw = localStorage.getItem(STORAGE_KEYS.CATEGORY_CONFIG);
        if (categoryConfigRaw) {
            result.category_config = JSON.parse(categoryConfigRaw);
        }

        // 主题
        const themeRaw = localStorage.getItem(STORAGE_KEYS.THEME);
        if (themeRaw) {
            result.theme = themeRaw;
        }

        // 侧边栏宽度
        const favoritesWidth = localStorage.getItem(STORAGE_KEYS.FAVORITES_WIDTH);
        if (favoritesWidth) {
            result.sidebar_widths.favorites_width = parseInt(favoritesWidth, 10);
        }

        const todoWidth = localStorage.getItem(STORAGE_KEYS.TODO_WIDTH);
        if (todoWidth) {
            result.sidebar_widths.todo_width = parseInt(todoWidth, 10);
        }
    } catch (e) {
        console.error('[Preferences] Failed to read from localStorage:', e);
    }

    return result;
}

/**
 * 保存偏好设置到 localStorage
 */
function saveToLocalStorage(data) {
    try {
        // 栏目配置
        if (data.category_config !== undefined) {
            if (data.category_config === null) {
                localStorage.removeItem(STORAGE_KEYS.CATEGORY_CONFIG);
            } else {
                localStorage.setItem(STORAGE_KEYS.CATEGORY_CONFIG, JSON.stringify(data.category_config));
            }
        }

        // 主题
        if (data.theme !== undefined) {
            localStorage.setItem(STORAGE_KEYS.THEME, data.theme);
        }

        // 侧边栏宽度
        if (data.sidebar_widths) {
            if (data.sidebar_widths.favorites_width !== undefined) {
                localStorage.setItem(STORAGE_KEYS.FAVORITES_WIDTH, String(data.sidebar_widths.favorites_width));
            }
            if (data.sidebar_widths.todo_width !== undefined) {
                localStorage.setItem(STORAGE_KEYS.TODO_WIDTH, String(data.sidebar_widths.todo_width));
            }
        }
    } catch (e) {
        console.error('[Preferences] Failed to save to localStorage:', e);
    }
}

/**
 * 从服务器获取偏好设置
 */
async function fetchFromServer() {
    const user = authState.getUser();
    if (!user || !user.id) {
        throw new Error('User not logged in');
    }

    const url = `${API_ENDPOINT}?user_id=${encodeURIComponent(user.id)}`;
    const response = await fetch(url);

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Not authenticated');
        }
        if (response.status === 404) {
            // 服务器无设置，返回 null
            return null;
        }
        throw new Error(`Server error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.ok) {
        throw new Error(data.error || 'Unknown error');
    }

    return data.preferences || null;
}

/**
 * 保存偏好设置到服务器（全量更新）
 */
async function saveToServer(data) {
    const user = authState.getUser();
    if (!user || !user.id) {
        throw new Error('User not logged in');
    }

    const url = `${API_ENDPOINT}?user_id=${encodeURIComponent(user.id)}`;
    const response = await fetch(url, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Not authenticated');
        }
        throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.ok) {
        throw new Error(result.error || 'Unknown error');
    }

    return result.preferences;
}

/**
 * 部分更新偏好设置到服务器
 */
async function patchToServer(partial) {
    const user = authState.getUser();
    if (!user || !user.id) {
        throw new Error('User not logged in');
    }

    const url = `${API_ENDPOINT}?user_id=${encodeURIComponent(user.id)}`;
    const response = await fetch(url, {
        method: 'PATCH',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(partial)
    });

    if (!response.ok) {
        if (response.status === 401) {
            throw new Error('Not authenticated');
        }
        throw new Error(`Server error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.ok) {
        throw new Error(result.error || 'Unknown error');
    }

    return result.preferences;
}

/**
 * 检查服务器是否有设置
 */
function hasServerPreferences(serverData) {
    if (!serverData) return false;
    
    // 检查是否有任何有效设置
    const hasCategoryConfig = serverData.category_config && 
        typeof serverData.category_config === 'object' &&
        Object.keys(serverData.category_config).length > 0;
    
    const hasTheme = serverData.theme && 
        serverData.theme !== 'light'; // 'light' 是默认值
    
    const hasSidebarWidths = serverData.sidebar_widths && 
        typeof serverData.sidebar_widths === 'object' &&
        Object.keys(serverData.sidebar_widths).length > 0;
    
    return hasCategoryConfig || hasTheme || hasSidebarWidths;
}

/**
 * 检查本地是否有设置
 */
function hasLocalPreferences(localData) {
    if (!localData) return false;
    
    const hasCategoryConfig = localData.category_config && 
        typeof localData.category_config === 'object' &&
        Object.keys(localData.category_config).length > 0;
    
    const hasTheme = localData.theme && 
        localData.theme !== 'light';
    
    const hasSidebarWidths = localData.sidebar_widths && 
        typeof localData.sidebar_widths === 'object' &&
        Object.keys(localData.sidebar_widths).length > 0;
    
    return hasCategoryConfig || hasTheme || hasSidebarWidths;
}

// ============ 公共 API ============

export const preferences = {
    /**
     * 获取偏好设置
     * - 已登录：从服务器获取，失败时回退到 localStorage
     * - 未登录：从 localStorage 获取
     */
    async getPreferences() {
        if (!authState.isLoggedIn()) {
            return getFromLocalStorage();
        }

        try {
            const serverData = await fetchFromServer();
            if (serverData) {
                // 缓存到 localStorage
                saveToLocalStorage(serverData);
                return serverData;
            }
            // 服务器无数据，返回本地数据
            return getFromLocalStorage();
        } catch (error) {
            console.warn('[Preferences] Failed to fetch from server, falling back to localStorage:', error.message);
            return getFromLocalStorage();
        }
    },

    /**
     * 保存偏好设置（全量）
     * - 已登录：保存到服务器并更新 localStorage
     * - 未登录：只保存到 localStorage
     */
    async savePreferences(data) {
        // 始终保存到 localStorage
        saveToLocalStorage(data);

        if (!authState.isLoggedIn()) {
            return;
        }

        try {
            await saveToServer(data);
            console.log('[Preferences] Saved to server');
        } catch (error) {
            console.warn('[Preferences] Failed to save to server:', error.message);
            // 服务器保存失败，但本地已保存，不抛出错误
        }
    },

    /**
     * 部分更新偏好设置
     * - 已登录：部分更新到服务器并更新 localStorage
     * - 未登录：只更新 localStorage
     */
    async updatePreferences(partial) {
        // 更新 localStorage
        saveToLocalStorage(partial);

        if (!authState.isLoggedIn()) {
            return;
        }

        try {
            await patchToServer(partial);
            console.log('[Preferences] Updated on server');
        } catch (error) {
            console.warn('[Preferences] Failed to update on server:', error.message);
            // 服务器更新失败，但本地已更新，不抛出错误
        }
    },

    /**
     * 登录时同步设置
     * - 服务器有设置：使用服务器设置覆盖本地
     * - 服务器无设置且本地有设置：上传本地设置到服务器
     */
    async syncOnLogin() {
        if (!authState.isLoggedIn()) {
            console.warn('[Preferences] syncOnLogin called but user not logged in');
            return;
        }

        console.log('[Preferences] Starting sync on login...');

        try {
            const serverData = await fetchFromServer();
            const localData = getFromLocalStorage();

            if (hasServerPreferences(serverData)) {
                // 服务器有设置，覆盖本地
                console.log('[Preferences] Server has preferences, applying to local');
                saveToLocalStorage(serverData);
            } else if (hasLocalPreferences(localData)) {
                // 服务器无设置，本地有设置，上传到服务器
                console.log('[Preferences] No server preferences, uploading local preferences');
                await saveToServer(localData);
            } else {
                console.log('[Preferences] No preferences to sync');
            }

            console.log('[Preferences] Sync completed');
        } catch (error) {
            console.error('[Preferences] Sync failed:', error.message);
            // 同步失败不影响用户使用，本地设置仍然可用
        }
    },

    // ============ 单项设置读写方法 ============

    /**
     * 获取栏目配置
     */
    getCategoryConfig() {
        try {
            const raw = localStorage.getItem(STORAGE_KEYS.CATEGORY_CONFIG);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
    },

    /**
     * 保存栏目配置
     */
    async saveCategoryConfig(config) {
        try {
            localStorage.setItem(STORAGE_KEYS.CATEGORY_CONFIG, JSON.stringify(config));
        } catch (e) {
            console.error('[Preferences] Failed to save category config to localStorage:', e);
        }

        if (!authState.isLoggedIn()) {
            return;
        }

        try {
            await patchToServer({ category_config: config });
            console.log('[Preferences] Category config saved to server');
        } catch (error) {
            console.warn('[Preferences] Failed to save category config to server:', error.message);
        }
    },

    /**
     * 获取主题
     */
    getTheme() {
        try {
            return localStorage.getItem(STORAGE_KEYS.THEME) || 'light';
        } catch (e) {
            return 'light';
        }
    },

    /**
     * 保存主题
     */
    async saveTheme(theme) {
        try {
            localStorage.setItem(STORAGE_KEYS.THEME, theme);
        } catch (e) {
            console.error('[Preferences] Failed to save theme to localStorage:', e);
        }

        if (!authState.isLoggedIn()) {
            return;
        }

        try {
            await patchToServer({ theme: theme });
            console.log('[Preferences] Theme saved to server');
        } catch (error) {
            console.warn('[Preferences] Failed to save theme to server:', error.message);
        }
    },

    /**
     * 获取侧边栏宽度
     */
    getSidebarWidths() {
        const result = {};

        try {
            const favoritesWidth = localStorage.getItem(STORAGE_KEYS.FAVORITES_WIDTH);
            if (favoritesWidth) {
                result.favorites_width = parseInt(favoritesWidth, 10);
            }

            const todoWidth = localStorage.getItem(STORAGE_KEYS.TODO_WIDTH);
            if (todoWidth) {
                result.todo_width = parseInt(todoWidth, 10);
            }
        } catch (e) {
            console.error('[Preferences] Failed to get sidebar widths from localStorage:', e);
        }

        return result;
    },

    /**
     * 保存侧边栏宽度
     */
    async saveSidebarWidths(widths) {
        try {
            if (widths.favorites_width !== undefined) {
                localStorage.setItem(STORAGE_KEYS.FAVORITES_WIDTH, String(widths.favorites_width));
            }
            if (widths.todo_width !== undefined) {
                localStorage.setItem(STORAGE_KEYS.TODO_WIDTH, String(widths.todo_width));
            }
        } catch (e) {
            console.error('[Preferences] Failed to save sidebar widths to localStorage:', e);
        }

        if (!authState.isLoggedIn()) {
            return;
        }

        try {
            await patchToServer({ sidebar_widths: widths });
            console.log('[Preferences] Sidebar widths saved to server');
        } catch (error) {
            console.warn('[Preferences] Failed to save sidebar widths to server:', error.message);
        }
    },

    // ============ 工具方法 ============

    /**
     * 获取 localStorage 键名常量
     */
    getStorageKeys() {
        return { ...STORAGE_KEYS };
    }
};

// 暴露到 window 供调试
window.preferences = preferences;

export default preferences;
