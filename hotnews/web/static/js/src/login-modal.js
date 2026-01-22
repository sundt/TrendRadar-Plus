/**
 * Login Modal Module
 * Handles the login modal popup functionality
 */

let loginCurrentEmail = '';
let loginResendCountdown = 0;
let loginCountdownTimer = null;

/**
 * Open the login modal
 */
function openLoginModal() {
    const modal = document.getElementById('loginModal');
    if (modal) {
        modal.style.display = 'flex';
        // Reset to step 1
        loginGoToStep(1);
        // Focus email input
        setTimeout(() => {
            const emailInput = document.getElementById('login-email');
            if (emailInput) emailInput.focus();
        }, 100);
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
    // Reset form
    loginHideMessage();
    const emailInput = document.getElementById('login-email');
    const codeInput = document.getElementById('login-code');
    if (emailInput) emailInput.value = '';
    if (codeInput) codeInput.value = '';
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
 * Go back to step 1
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

export {
    openLoginModal,
    closeLoginModal,
    closeLoginModalOnOverlay,
    loginSendCode,
    loginVerifyCode,
    loginResendCode,
    loginGoBack,
    loginGoToStep,
    loginShowMessage
};
