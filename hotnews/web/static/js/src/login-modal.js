/**
 * Login Modal Module
 * Handles the login modal popup functionality with WeChat QR code login
 */

let loginCurrentEmail = '';
let loginResendCountdown = 0;
let loginCountdownTimer = null;

// WeChat QR Login state
let wechatQRSessionId = null;
let wechatQRPollingTimer = null;
let wechatQRCountdownTimer = null;
let wechatQRExpireSeconds = 300;

/**
 * Check if running in WeChat browser
 */
function isWeChatBrowser() {
    const ua = navigator.userAgent.toLowerCase();
    return ua.indexOf('micromessenger') !== -1;
}

/**
 * Open the login modal
 */
function openLoginModal() {
    // If in WeChat browser, redirect to WeChat OAuth directly
    if (isWeChatBrowser()) {
        window.location.href = '/api/auth/oauth/wechat-mp';
        return;
    }
    
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
        // Reset to main view
        loginHideEmailForm();
        loginGoToStep(1);
        // Load WeChat QR code
        loadWechatQR();
    }
}

/**
 * Close the login modal
 */
function closeLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'none';
    }
    // Clear any countdown timer
    if (loginCountdownTimer) {
        clearInterval(loginCountdownTimer);
        loginCountdownTimer = null;
    }
    // Stop WeChat QR polling
    stopWechatQRPolling();
    // Reset form
    loginHideMessage();
    loginHideEmailForm();
    const emailInput = document.getElementById('login-email');
    const codeInput = document.getElementById('login-code');
    if (emailInput) emailInput.value = '';
    if (codeInput) codeInput.value = '';
}

/**
 * Load WeChat QR code for login
 */
async function loadWechatQR() {
    const loading = document.getElementById('login-qr-loading');
    const image = document.getElementById('login-qr-image');
    const expired = document.getElementById('login-qr-expired');
    const countdown = document.getElementById('login-qr-countdown');
    
    // Show loading state
    if (loading) loading.style.display = 'flex';
    if (image) image.style.display = 'none';
    if (expired) expired.style.display = 'none';
    if (countdown) countdown.style.display = 'none';
    
    // Stop any existing polling
    stopWechatQRPolling();
    
    try {
        const resp = await fetch('/api/auth/wechat-qr/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await resp.json();
        
        if (data.ok && data.qr_url) {
            wechatQRSessionId = data.session_id;
            wechatQRExpireSeconds = data.expire_seconds || 300;
            
            // Show QR code
            if (image) {
                image.src = data.qr_url;
                image.onload = () => {
                    if (loading) loading.style.display = 'none';
                    image.style.display = 'block';
                };
                image.onerror = () => {
                    if (loading) loading.style.display = 'none';
                    if (expired) {
                        expired.style.display = 'flex';
                        expired.querySelector('span').textContent = '加载失败';
                    }
                };
            }
            
            // Start countdown
            startWechatQRCountdown(wechatQRExpireSeconds);
            
            // Start polling for login status
            startWechatQRPolling();
        } else {
            // Show error
            if (loading) loading.style.display = 'none';
            if (expired) {
                expired.style.display = 'flex';
                expired.querySelector('span').textContent = data.message || '加载失败';
            }
        }
    } catch (err) {
        console.error('Failed to load WeChat QR:', err);
        if (loading) loading.style.display = 'none';
        if (expired) {
            expired.style.display = 'flex';
            expired.querySelector('span').textContent = '网络错误';
        }
    }
}

/**
 * Refresh WeChat QR code
 */
function refreshWechatQR() {
    loadWechatQR();
}

/**
 * Start countdown for QR code expiration
 */
function startWechatQRCountdown(seconds) {
    const countdown = document.getElementById('login-qr-countdown');
    const countdownText = document.getElementById('login-qr-countdown-text');
    
    if (!countdown || !countdownText) return;
    
    let remaining = seconds;
    countdown.style.display = 'block';
    
    const updateCountdown = () => {
        const mins = Math.floor(remaining / 60);
        const secs = remaining % 60;
        countdownText.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
        
        // Warning color when < 60 seconds
        if (remaining < 60) {
            countdown.classList.add('warning');
        } else {
            countdown.classList.remove('warning');
        }
    };
    
    updateCountdown();
    
    wechatQRCountdownTimer = setInterval(() => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(wechatQRCountdownTimer);
            wechatQRCountdownTimer = null;
            showWechatQRExpired();
        } else {
            updateCountdown();
        }
    }, 1000);
}

/**
 * Show QR code expired state
 */
function showWechatQRExpired() {
    const image = document.getElementById('login-qr-image');
    const expired = document.getElementById('login-qr-expired');
    const countdown = document.getElementById('login-qr-countdown');
    
    if (image) image.style.display = 'none';
    if (expired) {
        expired.style.display = 'flex';
        expired.querySelector('span').textContent = '二维码已过期';
    }
    if (countdown) countdown.style.display = 'none';
    
    stopWechatQRPolling();
}

/**
 * Start polling for WeChat QR login status
 */
function startWechatQRPolling() {
    if (!wechatQRSessionId) return;
    
    const poll = async () => {
        try {
            const resp = await fetch(`/api/auth/wechat-qr/status?session_id=${encodeURIComponent(wechatQRSessionId)}`);
            const data = await resp.json();
            
            if (data.status === 'confirmed' && data.session_token) {
                // Login successful! Set cookie and reload
                stopWechatQRPolling();
                loginShowMessage('登录成功', 'success');
                
                // Call confirm-cookie endpoint to set the session cookie
                try {
                    await fetch(`/api/auth/wechat-qr/confirm-cookie?session_id=${encodeURIComponent(wechatQRSessionId)}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                } catch (e) {
                    console.error('Failed to set cookie:', e);
                }
                
                setTimeout(() => {
                    closeLoginModal();
                    window.location.reload();
                }, 500);
                return;
            } else if (data.status === 'scanned') {
                // User scanned, waiting for confirmation
                loginShowMessage('已扫码，请在手机上确认', 'success');
            } else if (data.status === 'expired') {
                showWechatQRExpired();
                return;
            }
            // Continue polling
        } catch (err) {
            console.error('Polling error:', err);
        }
    };
    
    // Poll every 2 seconds
    wechatQRPollingTimer = setInterval(poll, 2000);
    // Also poll immediately
    poll();
}

/**
 * Stop WeChat QR polling
 */
function stopWechatQRPolling() {
    if (wechatQRPollingTimer) {
        clearInterval(wechatQRPollingTimer);
        wechatQRPollingTimer = null;
    }
    if (wechatQRCountdownTimer) {
        clearInterval(wechatQRCountdownTimer);
        wechatQRCountdownTimer = null;
    }
    wechatQRSessionId = null;
}

/**
 * Show email login form
 */
function loginShowEmailForm() {
    const mainView = document.getElementById('login-main');
    const emailForm = document.getElementById('login-email-form');
    if (mainView) mainView.style.display = 'none';
    if (emailForm) emailForm.style.display = 'block';
    // Stop QR polling when switching to email
    stopWechatQRPolling();
    // Focus email input
    setTimeout(() => {
        const emailInput = document.getElementById('login-email');
        if (emailInput) emailInput.focus();
    }, 100);
}

/**
 * Hide email login form and show main view
 */
function loginHideEmailForm() {
    const mainView = document.getElementById('login-main');
    const emailForm = document.getElementById('login-email-form');
    if (mainView) mainView.style.display = 'block';
    if (emailForm) emailForm.style.display = 'none';
    // Reset to step 1
    loginGoToStep(1);
    loginHideMessage();
    // Reload QR code when going back
    loadWechatQR();
}

/**
 * Close modal when clicking overlay
 */
function closeLoginModalOnOverlay(event) {
    if (event.target.id === 'loginModal') {
        closeLoginModal();
    }
}

/**
 * Show message in the login modal
 */
function loginShowMessage(text, type) {
    const msg = document.getElementById('login-message');
    if (msg) {
        msg.textContent = text;
        msg.className = 'login-message ' + type;
    }
}

/**
 * Hide message
 */
function loginHideMessage() {
    const msg = document.getElementById('login-message');
    if (msg) {
        msg.className = 'login-message';
    }
}

/**
 * Go to a specific step
 */
function loginGoToStep(step) {
    document.querySelectorAll('.login-step').forEach(s => s.classList.remove('active'));
    const stepEl = document.getElementById('login-step-' + step);
    if (stepEl) stepEl.classList.add('active');

    document.querySelectorAll('.login-step-dot').forEach((d, i) => {
        d.classList.toggle('active', i < step);
    });

    loginHideMessage();
}

/**
 * Go back to step 1 (within email form)
 */
function loginGoBack() {
    loginGoToStep(1);
    if (loginCountdownTimer) {
        clearInterval(loginCountdownTimer);
        loginCountdownTimer = null;
    }
}

/**
 * Start resend countdown
 */
function loginStartResendCountdown() {
    loginResendCountdown = 60;
    const btn = document.getElementById('login-resend-btn');
    const text = document.getElementById('login-resend-text');
    if (btn) btn.disabled = true;

    loginCountdownTimer = setInterval(() => {
        loginResendCountdown--;
        if (loginResendCountdown <= 0) {
            clearInterval(loginCountdownTimer);
            loginCountdownTimer = null;
            if (btn) btn.disabled = false;
            if (text) text.textContent = '重新发送';
        } else {
            if (text) text.textContent = loginResendCountdown + '秒后重发';
        }
    }, 1000);
}

/**
 * Send verification code
 */
async function loginSendCode(e) {
    e.preventDefault();
    const btn = document.getElementById('login-send-btn');
    const email = document.getElementById('login-email').value.trim();

    if (!email) {
        loginShowMessage('请输入邮箱', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = '发送中...';
    }

    try {
        const resp = await fetch('/api/auth/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email })
        });

        const data = await resp.json();

        if (resp.ok) {
            loginCurrentEmail = email;
            const displayEmail = document.getElementById('login-display-email');
            if (displayEmail) displayEmail.textContent = email;
            loginGoToStep(2);
            const codeInput = document.getElementById('login-code');
            if (codeInput) codeInput.focus();
            loginStartResendCountdown();
        } else {
            const errMsg = typeof data.detail === 'string' ? data.detail :
                (data.detail?.[0]?.msg || data.message || '发送失败');
            loginShowMessage(errMsg, 'error');
        }
    } catch (err) {
        loginShowMessage('网络错误，请重试', 'error');
    }

    if (btn) {
        btn.disabled = false;
        btn.textContent = '获取验证码';
    }
}

/**
 * Resend verification code
 */
async function loginResendCode() {
    const btn = document.getElementById('login-resend-btn');
    if (btn) btn.disabled = true;

    try {
        const resp = await fetch('/api/auth/send-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: loginCurrentEmail })
        });

        const data = await resp.json();

        if (resp.ok) {
            loginShowMessage('验证码已重新发送', 'success');
            loginStartResendCountdown();
        } else {
            const errMsg = typeof data.detail === 'string' ? data.detail :
                (data.detail?.[0]?.msg || data.message || '发送失败');
            loginShowMessage(errMsg, 'error');
            if (btn) btn.disabled = false;
        }
    } catch (err) {
        loginShowMessage('网络错误，请重试', 'error');
        if (btn) btn.disabled = false;
    }
}

/**
 * Verify code and login
 */
async function loginVerifyCode(e) {
    e.preventDefault();
    const btn = document.getElementById('login-verify-btn');
    const code = document.getElementById('login-code').value.trim();

    if (!code || code.length !== 6) {
        loginShowMessage('请输入6位验证码', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.textContent = '登录中...';
    }

    try {
        const resp = await fetch('/api/auth/verify-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: loginCurrentEmail,
                code: code
            })
        });

        const data = await resp.json();

        if (resp.ok) {
            loginShowMessage('登录成功', 'success');
            // Close modal and reload page to update auth state
            setTimeout(() => {
                closeLoginModal();
                window.location.reload();
            }, 500);
        } else {
            const errMsg = typeof data.detail === 'string' ? data.detail :
                (data.detail?.[0]?.msg || data.message || '验证失败');
            loginShowMessage(errMsg, 'error');
        }
    } catch (err) {
        loginShowMessage('网络错误，请重试', 'error');
    }

    if (btn) {
        btn.disabled = false;
        btn.textContent = '登录';
    }
}

/**
 * Initialize login modal - setup code input auto-format
 */
function initLoginModal() {
    const codeInput = document.getElementById('login-code');
    if (codeInput) {
        codeInput.addEventListener('input', function (e) {
            this.value = this.value.replace(/[^0-9]/g, '').slice(0, 6);
        });
    }
}

// Initialize on DOM ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLoginModal);
} else {
    initLoginModal();
}

// Export functions to window for global access
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.closeLoginModalOnOverlay = closeLoginModalOnOverlay;
window.loginSendCode = loginSendCode;
window.loginVerifyCode = loginVerifyCode;
window.loginResendCode = loginResendCode;
window.loginGoBack = loginGoBack;
window.loginGoToStep = loginGoToStep;
window.loginShowMessage = loginShowMessage;
window.loginShowEmailForm = loginShowEmailForm;
window.loginHideEmailForm = loginHideEmailForm;
window.refreshWechatQR = refreshWechatQR;

export {
    openLoginModal,
    closeLoginModal,
    closeLoginModalOnOverlay,
    loginSendCode,
    loginVerifyCode,
    loginResendCode,
    loginGoBack,
    loginGoToStep,
    loginShowMessage,
    loginShowEmailForm,
    loginHideEmailForm,
    refreshWechatQR
};
