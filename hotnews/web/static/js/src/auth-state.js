/**
 * Auth State Manager
 * Centralized authentication state management with reactive updates.
 * 
 * Features:
 * - Single source of truth for auth state
 * - Subscription-based UI updates
 * - Multi-tab synchronization via BroadcastChannel
 * - Automatic cache clearing on logout
 */

import { preferences } from './preferences.js';

// Singleton state manager
class AuthStateManager {
    constructor() {
        this.currentUser = null;
        this.listeners = [];
        this.initialized = false;
        this.loading = false;

        // Set up multi-tab synchronization
        this._setupBroadcastChannel();
    }

    /**
     * Initialize the auth state by fetching current user
     */
    async init() {
        if (this.initialized) return this.currentUser;

        try {
            await this.fetchUser();
            this.initialized = true;
        } catch (e) {
            console.error('[AuthState] Init failed:', e);
            this.currentUser = null;
            this.initialized = true;
        }

        return this.currentUser;
    }

    /**
     * Fetch current user from API
     */
    async fetchUser() {
        if (this.loading) return this.currentUser;

        this.loading = true;
        try {
            console.log('[AuthState] Fetching user...');
            const res = await fetch('/api/auth/me');

            if (res.status === 404 || res.status === 500) {
                this.currentUser = null;
            } else {
                const data = await res.json();
                this.currentUser = data.ok && data.user ? data.user : null;
            }

            console.log('[AuthState] User fetched:', this.currentUser ? 'logged in' : 'not logged in');
            this._notifyListeners();
            // Check if email binding is needed
            this._checkEmailBinding();
            return this.currentUser;
        } catch (e) {
            console.error('[AuthState] Fetch user failed:', e);
            this.currentUser = null;
            return null;
        } finally {
            this.loading = false;
        }
    }

    /**
     * Check if user is currently logged in
     */
    isLoggedIn() {
        return !!this.currentUser;
    }

    /**
     * Get current user
     */
    getUser() {
        return this.currentUser;
    }

    /**
     * Subscribe to auth state changes
     * @param {Function} callback - Called with (user) when state changes
     * @returns {Function} - Unsubscribe function
     */
    subscribe(callback) {
        this.listeners.push(callback);
        // Immediately call with current state
        callback(this.currentUser);
        return () => {
            this.listeners = this.listeners.filter(cb => cb !== callback);
        };
    }

    /**
     * Logout the current user
     */
    async logout() {
        console.log('[AuthState] Logging out...');

        try {
            const response = await fetch('/api/auth/logout', {
                method: 'POST',
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error(`Logout failed: ${response.status}`);
            }

            console.log('[AuthState] Logout successful');

            // Clear user state
            this.currentUser = null;
            this._notifyListeners();

            // Clear caches
            this._clearUserCaches();

            // Broadcast to other tabs
            this._broadcast({ type: 'logout' });

            return true;
        } catch (e) {
            console.error('[AuthState] Logout failed:', e);
            throw e;
        }
    }

    /**
     * Called after login (e.g., from OAuth callback)
     */
    async onLogin() {
        console.log('[AuthState] Login detected, refreshing user...');
        await this.fetchUser();
        
        // Sync preferences after successful login
        if (this.isLoggedIn()) {
            try {
                await preferences.syncOnLogin();
                console.log('[AuthState] Preferences synced after login');
            } catch (e) {
                console.error('[AuthState] Failed to sync preferences:', e);
                // Don't throw - preferences sync failure shouldn't block login
            }
        }
        
        this._broadcast({ type: 'login' });
    }

    /**
     * Clear all user-related caches from localStorage
     */
    _clearUserCaches() {
        console.log('[AuthState] Clearing user caches...');
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith('hotnews_')) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => localStorage.removeItem(key));
        console.log('[AuthState] Cleared', keysToRemove.length, 'cache entries');
    }

    /**
     * Notify all listeners of state change
     */
    _notifyListeners() {
        this.listeners.forEach(cb => {
            try {
                cb(this.currentUser);
            } catch (e) {
                console.error('[AuthState] Listener error:', e);
            }
        });
    }

    /**
     * Set up BroadcastChannel for multi-tab sync
     */
    _setupBroadcastChannel() {
        if (typeof BroadcastChannel === 'undefined') {
            console.warn('[AuthState] BroadcastChannel not supported');
            return;
        }

        try {
            this.channel = new BroadcastChannel('hotnews_auth');
            this.channel.onmessage = (event) => {
                console.log('[AuthState] Received broadcast:', event.data);
                if (event.data.type === 'logout') {
                    this.currentUser = null;
                    this._notifyListeners();
                } else if (event.data.type === 'login') {
                    this.fetchUser();
                }
            };
        } catch (e) {
            console.warn('[AuthState] BroadcastChannel setup failed:', e);
        }
    }

    /**
     * Check if logged-in user needs to bind email, show modal if so
     */
    _checkEmailBinding() {
        if (!this.currentUser) return;
        if (this.currentUser.email && this.currentUser.email_verified) return;
        // Skip if on bind-email page already
        if (window.location.pathname === '/bind-email') return;
        // Skip if modal already shown
        if (document.getElementById('bindEmailModal')) return;

        console.log('[AuthState] User needs email binding, showing modal...');
        this._showBindEmailModal();
    }

    /**
     * Show non-dismissible email binding modal
     */
    _showBindEmailModal() {
        const overlay = document.createElement('div');
        overlay.id = 'bindEmailModal';
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;';

        overlay.innerHTML = `
<div style="background:#fff;border-radius:16px;padding:36px 32px;max-width:400px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,0.2);">
  <div style="text-align:center;margin-bottom:6px;"><img src="/static/images/hxlogo.jpg" style="width:48px;height:48px;border-radius:10px;" alt=""></div>
  <div style="text-align:center;font-size:20px;font-weight:600;color:#1a1a1a;margin-bottom:4px;">绑定邮箱</div>
  <div style="text-align:center;font-size:13px;color:#888;margin-bottom:24px;line-height:1.5;">请绑定邮箱以完善账号信息，<br>方便找回密码和接收通知。</div>
  <div style="margin-bottom:14px;">
    <input type="email" id="be-email" placeholder="请输入邮箱地址" autocomplete="email"
      style="width:100%;padding:11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:15px;outline:none;background:#fafafa;box-sizing:border-box;">
  </div>
  <div style="display:flex;gap:10px;margin-bottom:14px;">
    <input type="text" id="be-code" placeholder="------" maxlength="6" inputmode="numeric"
      style="flex:1;padding:11px 13px;border:1.5px solid #e0e0e0;border-radius:10px;font-size:17px;text-align:center;letter-spacing:4px;outline:none;background:#fafafa;box-sizing:border-box;">
    <button id="be-send-btn"
      style="padding:11px 16px;border:none;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer;background:#f0f0f0;color:#333;white-space:nowrap;min-width:100px;">发送验证码</button>
  </div>
  <button id="be-bind-btn"
    style="width:100%;padding:13px;border:none;border-radius:10px;font-size:15px;font-weight:500;cursor:pointer;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;">确认绑定</button>
  <div id="be-msg" style="text-align:center;font-size:13px;margin-top:10px;min-height:18px;"></div>
</div>`;

        document.body.appendChild(overlay);

        // Wire up logic
        const emailInput = document.getElementById('be-email');
        const codeInput = document.getElementById('be-code');
        const sendBtn = document.getElementById('be-send-btn');
        const bindBtn = document.getElementById('be-bind-btn');
        const msgEl = document.getElementById('be-msg');
        let countdown = 0;

        const showMsg = (text, isError) => {
            msgEl.textContent = text;
            msgEl.style.color = isError ? '#e53e3e' : '#38a169';
        };

        const startCountdown = () => {
            countdown = 60;
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
            const tick = () => {
                if (countdown <= 0) {
                    sendBtn.textContent = '重新发送';
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = '1';
                    return;
                }
                sendBtn.textContent = countdown + 's';
                countdown--;
                setTimeout(tick, 1000);
            };
            tick();
        };

        sendBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            if (!email || !email.includes('@')) {
                showMsg('请输入有效的邮箱地址', true);
                return;
            }
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
            showMsg('', false);
            try {
                const resp = await fetch('/api/auth/bind-email/send-code', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email }),
                });
                const data = await resp.json();
                if (resp.ok && data.ok) {
                    showMsg('验证码已发送，请查看邮箱', false);
                    startCountdown();
                    codeInput.focus();
                } else {
                    showMsg(data.detail || data.message || '发送失败', true);
                    sendBtn.disabled = false;
                    sendBtn.style.opacity = '1';
                }
            } catch (e) {
                showMsg('网络错误，请重试', true);
                sendBtn.disabled = false;
                sendBtn.style.opacity = '1';
            }
        });

        bindBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            const code = codeInput.value.trim();
            if (!email || !email.includes('@')) { showMsg('请输入有效的邮箱地址', true); return; }
            if (!code || code.length < 4) { showMsg('请输入验证码', true); return; }
            bindBtn.disabled = true;
            bindBtn.style.opacity = '0.5';
            bindBtn.textContent = '绑定中...';
            showMsg('', false);
            try {
                const resp = await fetch('/api/auth/bind-email/verify', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, code }),
                });
                const data = await resp.json();
                if (resp.ok && data.ok) {
                    showMsg('✅ 绑定成功！', false);
                    setTimeout(() => {
                        overlay.remove();
                        window.location.reload();
                    }, 1000);
                } else {
                    showMsg(data.detail || data.message || '绑定失败', true);
                    bindBtn.disabled = false;
                    bindBtn.style.opacity = '1';
                    bindBtn.textContent = '确认绑定';
                }
            } catch (e) {
                showMsg('网络错误，请重试', true);
                bindBtn.disabled = false;
                bindBtn.style.opacity = '1';
                bindBtn.textContent = '确认绑定';
            }
        });

        // Enter key support
        emailInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendBtn.click(); });
        codeInput.addEventListener('keydown', e => { if (e.key === 'Enter') bindBtn.click(); });
        // Focus email input
        setTimeout(() => emailInput.focus(), 200);
    }

    /**
     * Broadcast message to other tabs
     */
    _broadcast(message) {
        if (this.channel) {
            try {
                this.channel.postMessage(message);
            } catch (e) {
                console.warn('[AuthState] Broadcast failed:', e);
            }
        }
    }

    /**
     * Verify logout was successful by checking API
     * Returns true if properly logged out
     */
    async verifyLogout() {
        try {
            const res = await fetch('/api/auth/me');
            const data = await res.json();
            return !(data.ok && data.user);
        } catch (e) {
            return true; // Assume logged out on error
        }
    }
}

// Singleton instance
export const authState = new AuthStateManager();

/**
 * 统一的登录检查函数。
 * 未登录时弹出登录弹窗，返回 false；已登录返回 true。
 *
 * @param {Object} [opts]
 * @param {string} [opts.toast] - 可选的 Toast 提示文案
 * @param {boolean} [opts.silent] - 为 true 时不弹登录弹窗
 * @returns {boolean}
 */
export function requireLogin(opts = {}) {
    if (authState.isLoggedIn()) return true;
    if (opts.toast && window.Toast?.show) {
        window.Toast.show(opts.toast, 'error');
    }
    if (!opts.silent) {
        // 动态 import 避免循环依赖（login-modal → auth-state）
        import('./login-modal.js').then(m => m.openLoginModal()).catch(() => {
            // fallback: 尝试 window 上的全局函数
            if (typeof window.openLoginModal === 'function') window.openLoginModal();
        });
    }
    return false;
}

// Auto-initialize on module load
(async () => {
    try {
        // Check for OAuth login callback
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('login')) {
            console.log('[AuthState] OAuth login callback detected, refreshing user...');
            await authState.onLogin();
            // Clean up URL
            urlParams.delete('login');
            const newUrl = urlParams.toString()
                ? `${window.location.pathname}?${urlParams}`
                : window.location.pathname;
            window.history.replaceState({}, '', newUrl);
        } else if (urlParams.has('logout')) {
            console.log('[AuthState] Logout callback detected, clearing state...');
            authState.currentUser = null;
            authState.initialized = true;
            authState._notifyListeners();
            // Clean up URL
            urlParams.delete('logout');
            const newUrl = urlParams.toString()
                ? `${window.location.pathname}?${urlParams}`
                : window.location.pathname;
            window.history.replaceState({}, '', newUrl);
        } else {
            // Normal init
            await authState.init();
        }
        console.log('[AuthState] Auto-initialization complete, user:', authState.currentUser ? 'logged in' : 'not logged in');
    } catch (e) {
        console.error('[AuthState] Auto-initialization failed:', e);
        authState.initialized = true;
    }
})();

// Expose to window for debugging
window.authState = authState;
window.requireLogin = requireLogin;
