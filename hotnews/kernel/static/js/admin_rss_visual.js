let vsMode = null; // 'item', 'title', 'link', 'date'
let vsRules = { item: '', title: '', link: '', date: '' };
let vsUrl = '';

function openVisualSelector(customUrl) {
  console.log('Magic Select Clicked');
  const url = customUrl || (document.getElementById('edit-url') ? document.getElementById('edit-url').value : '') || (document.getElementById('edit-custom-magic-url') ? document.getElementById('edit-custom-magic-url').value : '');
  if (!url) {
    showToast('Please enter a URL first.', 'warning');
    return;
  }
  vsUrl = url;
  document.getElementById('vs-url').textContent = url;
  document.getElementById('visual-selector-modal').style.display = 'flex';

  // Load content
  loadVsContent(url);

  // Reset
  resetVs();
}

function closeVisualSelector() {
  document.getElementById('visual-selector-modal').style.display = 'none';
}

function loadVsContent(url) {
  const frame = document.getElementById('vs-iframe');
  const loader = document.getElementById('vs-loading');
  loader.style.display = 'flex';

  // Use our new API
  frame.src = `/api/admin/tool/fetch-html?token=${encodeURIComponent(token)}&url=${encodeURIComponent(url)}`;

  frame.onload = () => {
    loader.style.display = 'none';
  };
}

// ... (setVsMode, resetVs, window message listener, handleVsSelection) ...

function applyVisualRules() {
  // Construct JSON
  const rules = {
    items: document.getElementById('vs-item-sel').value, // Note: backend expects 'items' plural for custom source, but legacy 'item' singular. Let's standadize based on target.
    title: document.getElementById('vs-title-sel').value,
    link: document.getElementById('vs-link-sel').value
  };
  const date = document.getElementById('vs-date-sel').value;
  if (date) rules.date = date;

  if (!rules.items || !rules.title || !rules.link) {
    showToast('Item, Title, and Link are required.', 'error');
    return;
  }

  // Use 'item' singular for legacy input if needed, but internally we use 'items'
  // Actually, the original wrote 'item': ... to JSON.
  // Let's check target.

  if (window.currentEditTab === 'html') {
    // Update config json
    const configArea = document.getElementById('edit-custom-config');
    try {
      let config = JSON.parse(configArea.value || '{}');
      config.scrape_rules = rules; // {items:..., title:..., link:..., date:...}
      configArea.value = JSON.stringify(config, null, 2);
      showToast('Rules applied to Config JSON', 'success');
    } catch (e) {
      showToast('Invalid Config JSON, cannot apply rules', 'error');
    }
  } else {
    // Legacy RSS modal
    // The legacy backend expects 'item' singular?
    // Let's check what was there.
    // Original: rules = { item: ..., ... }
    // New: rules = { items: ... } -> Wait.

    // Restore legacy keys for RSS modal if needed
    const legacyRules = {
      item: rules.items,
      title: rules.title,
      link: rules.link
    };
    if (rules.date) legacyRules.date = rules.date;

    const json = JSON.stringify(legacyRules, null, 2);
    document.getElementById('edit-scrape-rules').value = json;
  }

  closeVisualSelector();
}

function setVsMode(mode) {
  vsMode = mode;
  // Highlight button
  document.querySelectorAll('.btn-vs-mode').forEach(b => {
    b.style.background = '#f3f4f6';
    b.style.color = 'black';
    b.style.borderColor = '#d1d5db';
  });
  const btn = document.getElementById(`btn-vs-${mode}`);
  if (btn) {
    btn.style.background = '#eff6ff';
    btn.style.color = '#1d4ed8';
    btn.style.borderColor = '#2563eb';
  }
}

function resetVs() {
  vsRules = { item: '', title: '', link: '', date: '' };
  ['item', 'title', 'link', 'date'].forEach(k => {
    const el = document.getElementById(`vs-${k}-sel`);
    if (el) el.value = '';
  });
  const cnt = document.getElementById('vs-item-count');
  if (cnt) cnt.textContent = '-';
  setVsMode('item'); // Start with item
}

// Listen for messages from iframe
window.addEventListener('message', function (e) {
  if (e.data && e.data.type === 'TRENDRADAR_ELEMENT_SELECTED') {
    handleVsSelection(e.data);
  }
});

function handleVsSelection(data) {
  if (!vsMode) return;

  const selector = data.selector;
  if (!selector) return;

  // Update UI & State
  const inp = document.getElementById(`vs-${vsMode}-sel`);
  if (inp) inp.value = selector;

  vsRules[vsMode] = selector;

  // Auto advance
  if (vsMode === 'item') setVsMode('title');
  else if (vsMode === 'title') setVsMode('link');
  // else stay
}
