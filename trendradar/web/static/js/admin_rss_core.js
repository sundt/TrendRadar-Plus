const token = document.querySelector('meta[name="admin-token"]')?.content || '';
console.log("Admin Token:", token);

async function fetchWithAuth(url, options = {}) {
  const headers = options.headers || {};
  headers['X-Admin-Token'] = token;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    console.error("401 Unauthorized");
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
