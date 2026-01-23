/**
 * Hotnews Theme Module
 * 护眼模式（暗色模式）管理
 */

import { TR } from './core.js';
import { preferences } from './preferences.js';

const DARK_THEME_CLASS = 'eye-protection-mode';

export const theme = {
    isDarkMode() {
        // 使用 preferences 模块获取主题设置
        // 主题值为 'light', 'dark', 或 'auto'
        const themeValue = preferences.getTheme();
        return themeValue === 'dark';
    },

    toggle() {
        const isDark = this.isDarkMode();
        const nextIsDark = !isDark;
        this.apply(nextIsDark);
        // 使用 preferences 模块保存主题设置
        const themeValue = nextIsDark ? 'dark' : 'light';
        preferences.saveTheme(themeValue);
    },

    apply(isDark) {
        if (isDark) {
            document.body.classList.add(DARK_THEME_CLASS);
        } else {
            document.body.classList.remove(DARK_THEME_CLASS);
        }
        this.updateButtonState(isDark);
    },

    updateButtonState(isDark) {
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.innerHTML = isDark ? '🌞' : '🌙';
            btn.classList.toggle('active', isDark);
        }
    },

    init() {
        const isDark = this.isDarkMode();
        this.apply(isDark);
    }
};

// 挂载到 TR 命名空间
TR.theme = theme;

// 暴露全局函数供 HTML 点击调用
window.toggleTheme = function () {
    theme.toggle();
};

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    theme.init();
});
