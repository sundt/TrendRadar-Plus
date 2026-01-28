const token = document.querySelector('meta[name="admin-token"]')?.content || '';
console.log("Admin Token:", token);

async function fetchWithAuth(url, options = {}) {
  const headers = options.headers || {};

  // Legacy token auth fallback (only if token exists in global scope)
  if (typeof token !== 'undefined' && token) {
    headers['X-Admin-Token'] = token;
  }

  // Use session cookie authentication (credentials: 'include' sends cookies)
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include' // Important: sends session cookies
  });

  if (res.status === 401 || res.status === 403) {
    console.error(`${res.status} Unauthorized - redirecting to login`);
    // Optionally redirect to login page
    // window.location.href = '/admin/login';
  }
  return res;
}

// ============================================================================
// Toast Notification System
// ============================================================================
function showToast(message, type = 'info', duration = 3000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showProgress(current, total, message) {
  const msg = `${message} (${current}/${total})`;
  showToast(msg, 'info', 1500);
}

// ============================================================================
// Tab System
// ============================================================================
function initTabs() {
  const tabButtons = document.querySelectorAll('.tabs button[data-tab]');
  const tabPanels = document.querySelectorAll('.tab-panel[data-panel]');

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetPanel = btn.dataset.tab;

      tabButtons.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      tabPanels.forEach((panel) => {
        if (panel.dataset.panel === targetPanel) {
          panel.classList.add('active');
        } else {
          panel.classList.remove('active');
        }
      });

      if (targetPanel === 'custom' && typeof loadCustomSources === 'function') loadCustomSources('all');
      if (targetPanel === 'newsnow' && typeof loadNewsNowPlatforms === 'function') loadNewsNowPlatforms();
      if (targetPanel === 'unified' && typeof loadUnifiedData === 'function') loadUnifiedData();
      if (targetPanel === 'settings' && typeof initSettingsTab === 'function') initSettingsTab();
      if (targetPanel === 'featured-mps' && typeof loadFeaturedMpList === 'function') loadFeaturedMpList();

      window.location.hash = targetPanel;
    });
  });

  const hash = window.location.hash.substring(1);
  if (hash) {
    const targetBtn = document.querySelector(`button[data-tab="${hash}"]`);
    if (targetBtn) {
      targetBtn.click();
    }
  }
}

// Initialize tabs on load
document.addEventListener('DOMContentLoaded', initTabs);

// ============================================================================
// Dropdown System (used by RSS Catalog)
// ============================================================================
function toggleDropdown(id) {
  const menu = document.getElementById(id);
  const allMenus = document.querySelectorAll('.dropdown-menu');
  allMenus.forEach((m) => {
    if (m.id !== id) m.classList.remove('show');
  });
  if (menu) menu.classList.toggle('show');
}

function closeDropdown(id) {
  const menu = document.getElementById(id);
  if (menu) menu.classList.remove('show');
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('.dropdown')) {
    document.querySelectorAll('.dropdown-menu').forEach((m) => m.classList.remove('show'));
  }
});

function _escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ============================================================================
// Cache Management
// ============================================================================
async function reloadPlatformCache() {
  if (!confirm('确认刷新平台和分类缓存？\n\n这将使禁用/启用的源立即在前端生效，无需重启容器。')) {
    return;
  }

  try {
    showToast('正在刷新缓存...', 'info');
    const res = await fetchWithAuth('/api/admin/reload-cache', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    
    if (data.status === 'ok') {
      showToast('✅ 缓存刷新成功！页面将在2秒后刷新...', 'success', 2000);
      setTimeout(() => location.reload(), 2000);
    } else {
      showToast(`❌ 刷新失败: ${data.message || '未知错误'}`, 'error');
    }
  } catch (err) {
    console.error('Failed to reload cache:', err);
    showToast(`❌ 刷新失败: ${err.message}`, 'error');
  }
}
