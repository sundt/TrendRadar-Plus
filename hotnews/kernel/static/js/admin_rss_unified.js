// === Unified Platform Management ===
let unifiedPlatforms = [];
let unifiedCategories = [];
let currentBatchIds = [];

async function loadUnifiedData() {
  await Promise.all([loadCategories(), loadUnifiedPlatforms()]);
}

async function loadCategories() {
  try {
    const res = await fetchWithAuth('/api/platform/categories');
    const data = await res.json();
    unifiedCategories = data;
    renderCategoryPills();
    renderCategorySelects();
  } catch (e) {
    console.error("Failed to load categories", e);
  }
}

function renderCategoryPills() {
  const container = document.getElementById('category-pills');
  if (!container) return;

  container.innerHTML = '';
  unifiedCategories.forEach(cat => {
    const pill = document.createElement('div');
    pill.className = 'cat-pill';
    pill.onclick = () => openCategoryModal(cat);
    pill.innerHTML = `
                <span class="icon">${cat.icon}</span>
                <span>${_escapeHtml(cat.name)}</span>
            `;
    container.appendChild(pill);
  });
}

function renderCategorySelects() {
  const selects = ['unified-filter-category', 'batch-cat-select'];
  selects.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const currentVal = el.value;
    let html = id === 'batch-cat-select' ? '<option value="">-- 选择栏目 --</option>' : '<option value="">所有栏目</option>';

    if (id === 'batch-cat-select') {
      // only valid categories
    } else {
      html += '<option value="other">其他</option>';
    }

    unifiedCategories.forEach(cat => {
      html += `<option value="${cat.id}">${cat.icon} ${cat.name}</option>`;
    });
    el.innerHTML = html;
    if (currentVal) el.value = currentVal;
  });
}

async function loadUnifiedPlatforms() {
  const tbody = document.getElementById('unified-tbody');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7">加载中...</td></tr>';

  try {
    const res = await fetchWithAuth('/api/platform/all');
    const data = await res.json();
    unifiedPlatforms = data;
    renderUnifiedTable();
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7">错误: ${e.message}</td></tr>`;
  }
}

function filterUnifiedPlatforms() {
  renderUnifiedTable();
}

function renderUnifiedTable() {
  const tbody = document.getElementById('unified-tbody');
  const search = (document.getElementById('unified-search')?.value || '').toLowerCase();
  const catFilter = document.getElementById('unified-filter-category')?.value;
  const typeFilter = document.getElementById('unified-filter-type')?.value;

  if (!tbody) return;

  let filtered = unifiedPlatforms.filter(p => {
    if (search) {
      const s = search; // already lowercased
      const matchName = p.name && p.name.toLowerCase().includes(s);
      const matchId = p.id && p.id.toLowerCase().includes(s);
      const matchUrl = p.url && p.url.toLowerCase().includes(s);
      const matchHost = p.host && p.host.toLowerCase().includes(s);
      const matchSource = p.source && p.source.toLowerCase().includes(s);
      const matchCountry = p.country && p.country.toLowerCase().includes(s);
      const matchLang = p.language && p.language.toLowerCase().includes(s);

      if (!matchName && !matchId && !matchUrl && !matchHost && !matchSource && !matchCountry && !matchLang) {
        return false;
      }
    }
    if (catFilter) {
      if (catFilter === 'other') {
        const known = new Set(unifiedCategories.map(c => c.id));
        if (p.category && known.has(p.category)) return false;
      } else {
        if (p.category !== catFilter) return false;
      }
    }
    if (typeFilter) {
      if (filterTypeMatch(p, typeFilter) === false) return false;
    }
    return true;
  });

  document.getElementById('unified-count').innerText = filtered.length;

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="muted">无匹配平台</td></tr>';
    return;
  }

  let html = '';
  filtered.forEach(p => {
    // Determine raw ID (strip prefix if RSS)
    let rawId = p.id;
    if (p.type === 'rss' && rawId.startsWith('rss-')) {
      rawId = rawId.substring(4);
    }

    const type = p.type;
    const isRss = type === 'rss';
    const isCustom = type === 'api' || type === 'html';
    const isNewsNow = type === 'newsnow';
    const isEnabled = !!p.enabled;

    // Badges
    const statusBadge = isEnabled
      ? '<span class="badge badge-ok">启用</span>'
      : '<span class="badge badge-off">禁用</span>';

    let catName = p.category || '-';
    const cat = unifiedCategories.find(c => c.id === p.category);
    if (cat) catName = `${cat.icon} ${cat.name}`;

    let typeBadge = '';
    if (isNewsNow) typeBadge = '<span class="badge" style="background:#ef4444;color:white;">热榜</span>';
    else if (isRss) typeBadge = '<span class="badge" style="background:#f59e0b;color:white;">RSS</span>';
    else if (isCustom && type === 'api') typeBadge = '<span class="badge" style="background:#3b82f6;color:white;">API</span>';
    else if (isCustom && type === 'html') typeBadge = '<span class="badge" style="background:#10b981;color:white;">HTML</span>';
    else typeBadge = `<span class="badge" style="background:#6b7280;color:white;">${type}</span>`;

    // Action Buttons
    // RSS requires dataset attributes for existing openEditModal
    let editBtnAttrs = '';
    if (isRss) {
      editBtnAttrs = `
        data-id="${rawId}"
        data-name="${_escapeHtml(p.name)}"
        data-url="${_escapeHtml(p.url)}"
        data-category="${_escapeHtml(p.category || '')}"
        data-feed-type="${_escapeHtml(p.feed_type || 'xml')}"
        data-country="${_escapeHtml(p.country || '')}"
        data-language="${_escapeHtml(p.language || '')}"
        data-source="${_escapeHtml(p.source || '')}"
        data-scrape-rules="${_escapeHtml(p.scrape_rules || '')}"
        data-enabled="${isEnabled ? 1 : 0}"
        data-use-scraperapi="${p.use_scraperapi ? 1 : 0}"
      `;
    }

    // Disable Delete for NewsNow/System if safer
    const allowDelete = !isNewsNow;

    const actionButtons = `
      <div class="row-actions">
        <button class="btn btn-icon" title="Edit" 
          onclick="dispatchEdit(this, '${type}', '${p.id}')" 
          ${editBtnAttrs}>✏️</button>
        
        <button class="btn btn-icon" title="Run" 
          onclick="dispatchRun(this, '${type}', '${p.id}')" 
          style="color:#2563eb;">▶️</button>
        
        <button class="btn btn-icon" title="${isEnabled ? 'Disable' : 'Enable'}"
          onclick="dispatchToggle(this, '${type}', '${p.id}', ${!isEnabled})"
          style="min-width:24px;">
          ${isEnabled ? '✅' : '⛔'}
        </button>
        
        ${allowDelete ? `
        <button class="btn btn-icon" title="Delete" 
          onclick="dispatchDelete(this, '${type}', '${p.id}', '${_escapeHtml(p.name)}')" 
          style="color:#dc2626;">🗑️</button>
        ` : ''}
      </div>
    `;


    html += `
              <tr class="unified-row" data-id="${p.id}">
                <td><input type="checkbox" class="unified-check" value="${p.id}" data-type="${p.type}"></td>
                <td><button class="expand-btn" onclick="toggleUnifiedDetail(this)" data-id="${p.id}">▶</button></td>
                <td>${typeBadge}</td>
                <td>
                    <div style="font-weight:500;">${_escapeHtml(p.name)}</div>
                    <div style="font-size:11px; color:#9ca3af;" title="${_escapeHtml(p.url)}">${_escapeHtml(p.url || p.host || p.id)}</div>
                </td>
                <td>${catName}</td>
                <td>${statusBadge}</td>
                <td>${p.last_fetch_at || '-'}</td>
                <td>
                   ${actionButtons}
                </td>
              </tr>
              <tr class="detail-row" style="display:none; background:#f9fafb;">
                  <td colspan="8">
                      <div id="detail-unified-${p.id}" style="padding:10px 20px;">
                          <div class="muted">Loading...</div>
                      </div>
                  </td>
              </tr>
            `;
  });
  tbody.innerHTML = html;

  document.getElementById('unified-select-all').checked = false;
}

function filterTypeMatch(p, filter) {
  if (filter === 'newsnow') return p.type === 'newsnow';
  if (filter === 'rss') return p.type === 'rss';
  if (filter === 'api') return p.type === 'api';
  if (filter === 'html') return p.type === 'html';
  return true;
}


// === Dispatchers ===

function dispatchEdit(btn, type, fullId) {
  if (type === 'rss') {
    // Legacy RSS modal expects dataset on the button
    if (typeof openEditModal === 'function') {
      openEditModal(btn);
    } else {
      showToast('RSS Edit Module not loaded', 'error');
    }
  } else if (type === 'api' || type === 'html') {
    if (typeof openEditCustomSourceModal === 'function') {
      openEditCustomSourceModal(fullId); // Custom expects full ID
    } else {
      showToast('Custom Edit Module not loaded', 'error');
    }
  } else if (type === 'newsnow') {
    if (typeof openNewsNowModal === 'function') {
      // NewsNow modal might need ID or empty for new
      // Currently NewsNow modal is "Add", edit might need implementation or checking
      // Checking admin_rss_sources.html -> openNewsNowModal() is usually for ADD
      // But we can check if there's an edit function. 
      // Based on previous reads, NewsNow edit is supported via edit button there.
      // We might need to port "openEditNewsNow" logic here or trigger it.
      // For now, let's try to find an edit function or fallback.
      // Looking at `openNewsNowModal` in admin_newsnow.js (assumed), it might check global state.
      // Let's defer NewsNow edit for safety or just alert.
      // Actually, looking at `admin_rss_sources.html` Tab Panel NewsNow, there is NO edit button in the HTML table usually?
      // Wait, there is 'Edit NewsNow Platform Modal' in HTML.
      // Let's assume we can wire it if we had the data.
      // For now, allow Custom/RSS primarily.
      alert('NewsNow editing via Unified tab is not fully linked yet.');
    }
  }
}

async function dispatchRun(btn, type, fullId) {
  if (type === 'rss') {
    // RSS requires raw ID for warmupSource
    let rawId = fullId;
    if (rawId.startsWith('rss-')) rawId = rawId.substring(4);

    // Create a proxy button/obj if needed, but warmupSource handles ID strings too?
    // warmupSource(btnOrSourceId) checking:
    // "const sid = btn ? String(btn?.dataset?.id || '').trim() : String(btnOrSourceId || '').trim();"
    // So we can pass raw ID directly, but we want the button feedback too.
    // If we pass 'btn', we need dataset.id on it.
    // We added data-id to the edit button, let's add it to Run button or use a proxy object.

    // Let's construct a temporary object to mimic the button behavior for feedback
    // Or just call warmupSource(rawId) and let it do toast?
    // warmupSource modifies the button text. So we should pass the button.
    // Ensure button has dataset.id
    if (!btn.dataset.id) btn.dataset.id = rawId;

    if (typeof warmupSource === 'function') {
      await warmupSource(btn);
    }
  } else if (type === 'api' || type === 'html') {
    if (typeof runCustomSource === 'function') {
      // Custom source run expects ID and type (for reload)
      // Custom run uses toast for feedback, doesn't manipulate button text heavily usually.
      // Let's toggle button state manually here for better UX
      const originalText = btn.textContent;
      btn.textContent = '⏳';
      btn.disabled = true;
      try {
        await runCustomSource(fullId, 'unified'); // 'unified' type to force reload generic or specific?
        // runCustomSource usually reloads 'all' or 'custom' tab. 
        // We might need to hook reloadUnifiedPlatforms() after.
        // runCustomSource impl: loadCustomSources(type)
        // If we pass 'unified', loadCustomSources might fail if not handled.
        // Let's modify runCustomSource or just reload manually.

        // Actually, runCustomSource in admin_rss_custom.js calls loadCustomSources(type).
        // if generic 'all' passed, it reloads custom tab. It won't reload unified tab.
        // So we should manually reload unified after.
        setTimeout(() => loadUnifiedPlatforms(), 2000);
      } finally {
        btn.textContent = originalText;
        btn.disabled = false;
      }
    }
  }
}

async function dispatchToggle(btn, type, fullId, nextEnabled) {
  // Use the standardized batch toggle for simplicity as it supports all types via /api/platform/batch-status
  // But we want single item feedback.

  const originalText = btn.textContent;
  btn.textContent = '...';
  btn.disabled = true;

  try {
    // Use the generic batch endpoint for single item
    await fetchWithAuth('/api/platform/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform_ids: [fullId],
        enabled: nextEnabled
      })
    });
    showToast(nextEnabled ? "已启用" : "已禁用", "success");
    // Update UI directly without full reload to be snappy
    btn.onclick = () => dispatchToggle(btn, type, fullId, !nextEnabled);
    btn.textContent = nextEnabled ? '✅' : '⛔';
    btn.title = nextEnabled ? 'Disable' : 'Enable';

    // Update status badge row if possible
    const tr = btn.closest('tr');
    if (tr) {
      const badgeCell = tr.children[5]; // 6th column
      if (badgeCell) {
        badgeCell.innerHTML = nextEnabled
          ? '<span class="badge badge-ok">启用</span>'
          : '<span class="badge badge-off">禁用</span>';
      }
    }

  } catch (e) {
    showToast("操作失败: " + e.message, "error");
    btn.textContent = originalText;
  } finally {
    btn.disabled = false;
  }
}

async function dispatchDelete(btn, type, fullId, name) {
  if (!confirm(`确定要删除 ${name} (${fullId}) 吗？\n此操作不可恢复。`)) return;

  if (type === 'rss') {
    // RSS delete
    let rawId = fullId;
    if (rawId.startsWith('rss-')) rawId = rawId.substring(4);

    // Mimic button for deleteSource
    if (!btn.dataset.id) btn.dataset.id = rawId;
    if (!btn.dataset.name) btn.dataset.name = name;

    if (typeof deleteSource === 'function') {
      await deleteSource(btn);
      // deleteSource reloads page, which is fine
    }
  } else if (type === 'api' || type === 'html') {
    // Custom delete
    // Custom delete function logic:
    /*
     async function deleteCustomSource(id) {
        ... fetch DELETE ...
        loadCustomSources(...)
     }
    */
    // We can call the API directly to avoid dependencies on tab specific reloaders
    try {
      const res = await fetchWithAuth(`/api/custom_sources/${fullId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('删除成功', 'success');
        loadUnifiedPlatforms();
      } else {
        showToast('删除失败', 'error');
      }
    } catch (e) {
      showToast('删除出错: ' + e.message, 'error');
    }
  }
}

async function toggleUnifiedDetail(btn) {
  const row = btn.closest('tr');
  const detailRow = row.nextElementSibling;
  const platformId = btn.dataset.id;

  if (detailRow && detailRow.classList.contains('detail-row')) {
    const isHidden = detailRow.style.display === 'none' || detailRow.style.display === '';

    if (isHidden) {
      // SHOW
      detailRow.style.display = 'table-row';
      btn.textContent = '▼';

      const container = document.getElementById(`detail-unified-${platformId}`);
      if (container && !container.dataset.loaded) {
        try {
          // Use Generic /api/news/page endpoint
          const resp = await fetch(`/api/news/page?platform_id=${encodeURIComponent(platformId)}&page_size=10`);
          const payload = await resp.json();

          const items = payload.items || [];
          if (items.length > 0) {
            const html = items.map(e => `
                      <div style="padding:4px 0; border-bottom:1px solid #e5e7eb; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
                          <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:75%;">
                              <a href="${_escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:none; font-weight:500;">
                                  ${_escapeHtml(e.title || 'No Title')}
                              </a>
                          </div>
                      </div>
                   `).join('');
            container.innerHTML = `<div style="padding:4px 0;">
                      <div style="font-size:11px; font-weight:700; color:#4b5563; margin-bottom:6px; letter-spacing:0.5px;">LATEST ITEMS</div>
                      ${html}
                   </div>`;
          } else {
            container.innerHTML = '<div class="muted" style="font-size:12px; padding:4px;">No items found.</div>';
          }
          container.dataset.loaded = "true";
        } catch (e) {
          container.innerHTML = `<div style="color:#dc2626; font-size:12px; padding:4px;">Error loading items: ${_escapeHtml(String(e))}</div>`;
        }
      }
    } else {
      // HIDE
      detailRow.style.display = 'none';
      btn.textContent = '▶';
    }
  }
}

// === Batch Operations ===
function toggleSelectAllUnified() {
  const all = document.getElementById('unified-select-all').checked;
  document.querySelectorAll('.unified-check').forEach(cb => cb.checked = all);
}

function getSelectedUnifiedIds() {
  return Array.from(document.querySelectorAll('.unified-check:checked')).map(cb => cb.value);
}

async function batchToggleUnified(enabled, ids = null) {
  const targetIds = ids || getSelectedUnifiedIds();
  if (targetIds.length === 0) {
    showToast("未选择任何平台", "error");
    return;
  }

  try {
    await fetchWithAuth('/api/platform/batch-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform_ids: targetIds,
        enabled: enabled
      })
    });
    showToast("批量操作成功");
    loadUnifiedPlatforms();
  } catch (e) {
    showToast("操作失败: " + e.message, "error");
  }
}

// === Category Management ===
function openCategoryModal(cat = null) {
  const modal = document.getElementById('category-modal');
  const title = document.getElementById('category-modal-title');
  const idInput = document.getElementById('cat-id');
  const nameInput = document.getElementById('cat-name');
  const iconInput = document.getElementById('cat-icon');
  const orderInput = document.getElementById('cat-order');
  const deleteBtn = document.getElementById('cat-delete-btn');

  if (cat) {
    title.innerText = "编辑栏目";
    idInput.value = cat.id;
    idInput.readOnly = true;
    nameInput.value = cat.name;
    iconInput.value = cat.icon;
    orderInput.value = cat.sort_order;
    // Show delete button for existing categories
    if (deleteBtn) deleteBtn.style.display = 'inline-block';
  } else {
    title.innerText = "新建栏目";
    idInput.value = "";
    idInput.readOnly = false;
    nameInput.value = "";
    iconInput.value = "📰";
    orderInput.value = 0;
    // Hide delete button for new categories
    if (deleteBtn) deleteBtn.style.display = 'none';
  }
  modal.style.display = "block";
}

function closeCategoryModal() {
  document.getElementById('category-modal').style.display = "none";
}

async function deleteCategory() {
  const id = document.getElementById('cat-id').value.trim();
  if (!id) {
    showToast("栏目ID不能为空", "error");
    return;
  }

  // Get category name for confirmation
  const cat = unifiedCategories.find(c => c.id === id);
  const catName = cat ? `${cat.icon} ${cat.name}` : id;

  if (!confirm(`确定要删除栏目「${catName}」吗？\n\n注意：删除后该栏目下的平台不会被删除，只是不再显示在该栏目中。`)) {
    return;
  }

  try {
    await fetchWithAuth(`/api/platform/categories/${id}`, {
      method: 'DELETE'
    });
    showToast("删除成功");
    closeCategoryModal();
    loadCategories();
  } catch (e) {
    showToast("删除失败: " + e.message, "error");
  }
}

async function saveCategory() {
  const id = document.getElementById('cat-id').value.trim();
  const name = document.getElementById('cat-name').value.trim();
  const icon = document.getElementById('cat-icon').value.trim();
  const sort_order = parseInt(document.getElementById('cat-order').value) || 0;

  if (!id || !name) {
    showToast("ID和名称不能为空", "error");
    return;
  }

  const isUpdate = document.getElementById('cat-id').readOnly;
  const method = isUpdate ? 'PUT' : 'POST';
  const url = isUpdate ? `/api/platform/categories/${id}` : '/api/platform/categories';

  try {
    await fetchWithAuth(url, {
      method: method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, icon, sort_order, enabled: true })
    });
    showToast("保存成功");
    closeCategoryModal();
    loadCategories();
  } catch (e) {
    showToast("保存失败: " + e.message, "error");
  }
}

let pendingCategoryIds = [];

async function openBatchCategoryModal(singleId) {
  if (unifiedCategories.length === 0) {
    await loadCategories();
  }

  pendingCategoryIds = [];

  if (Array.isArray(singleId)) {
    pendingCategoryIds = singleId;
  } else if (singleId) {
    pendingCategoryIds = [singleId];
  } else {
    pendingCategoryIds = getSelectedUnifiedIds();
  }

  if (pendingCategoryIds.length === 0) {
    showToast("未选择任何平台", "error");
    return;
  }
  document.getElementById('batch-cat-modal').style.display = 'block';
}

function closeBatchCategoryModal() {
  document.getElementById('batch-cat-modal').style.display = 'none';
  pendingCategoryIds = [];
}

async function executeBatchCategory() {
  const catId = document.getElementById('batch-cat-select').value;
  if (!catId) {
    showToast("请选择栏目", "error");
    return;
  }

  // Check if this is from custom sources modal
  const ids = window.batchCategoryContext === 'custom'
    ? (window.pendingCustomCategoryIds || [])
    : pendingCategoryIds;

  if (ids.length === 0) {
    showToast("未选择任何平台", "error");
    return;
  }

  try {
    await fetchWithAuth('/api/platform/batch-category', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform_ids: ids,
        category_id: catId
      })
    });
    showToast("设置成功");
    closeBatchCategoryModal();

    // Reset context
    window.batchCategoryContext = null;
    window.pendingCustomCategoryIds = null;

    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel && activePanel.dataset.panel === 'custom') {
      if (typeof loadCustomSources === 'function') {
        // Refresh all potentially visible lists to ensure consistency
        loadCustomSources('all');
        loadCustomSources('api');
        loadCustomSources('html');
      }
    } else {
      loadUnifiedPlatforms();
    }
  } catch (e) {
    showToast("操作失败: " + e.message, "error");
  }
}

document.querySelectorAll('button[data-tab="unified"]').forEach(btn => {
  btn.addEventListener('click', () => {
    loadUnifiedData();
  });
});
