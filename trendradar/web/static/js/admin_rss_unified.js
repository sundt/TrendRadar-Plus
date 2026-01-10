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
    if (search && !p.name.toLowerCase().includes(search) && !p.id.toLowerCase().includes(search)) return false;
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
    const statusBadge = p.enabled
      ? '<span class="badge badge-ok">启用</span>'
      : '<span class="badge badge-off">禁用</span>';

    let catName = p.category || '-';
    const cat = unifiedCategories.find(c => c.id === p.category);
    if (cat) catName = `${cat.icon} ${cat.name}`;

    let typeBadge = '';
    if (p.type === 'newsnow') typeBadge = '<span class="badge" style="background:#ef4444;color:white;">热榜</span>';
    else if (p.type === 'rss') typeBadge = '<span class="badge" style="background:#f59e0b;color:white;">RSS</span>';
    else if (p.type === 'api') typeBadge = '<span class="badge" style="background:#3b82f6;color:white;">API</span>';
    else typeBadge = '<span class="badge" style="background:#10b981;color:white;">HTML</span>';

    html += `
              <tr>
                <td><input type="checkbox" class="unified-check" value="${p.id}" data-type="${p.type}"></td>
                <td>${typeBadge}</td>
                <td>
                    <div style="font-weight:500;">${_escapeHtml(p.name)}</div>
                    <div style="font-size:11px; color:#9ca3af;">${p.id}</div>
                </td>
                <td>${catName}</td>
                <td>${statusBadge}</td>
                <td>${p.last_fetch_at || '-'}</td>
                <td>
                   <button class="btn btn-sm" onclick="togglePlatform('${p.id}', ${!p.enabled})">${p.enabled ? '禁用' : '启用'}</button>
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

async function togglePlatform(id, enabled) {
  await batchToggleUnified(enabled, [id]);
  loadUnifiedPlatforms();
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

  if (cat) {
    title.innerText = "编辑栏目";
    idInput.value = cat.id;
    idInput.readOnly = true;
    nameInput.value = cat.name;
    iconInput.value = cat.icon;
    orderInput.value = cat.sort_order;
  } else {
    title.innerText = "新建栏目";
    idInput.value = "";
    idInput.readOnly = false;
    nameInput.value = "";
    iconInput.value = "📰";
    orderInput.value = 0;
  }
  modal.style.display = "block";
}

function closeCategoryModal() {
  document.getElementById('category-modal').style.display = "none";
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

function openBatchCategoryModal(singleId) {
  pendingCategoryIds = [];

  if (singleId) {
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
  const ids = pendingCategoryIds;

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

    const activePanel = document.querySelector('.tab-panel.active');
    if (activePanel && activePanel.id === 'custom-panel') {
      loadCustomSources('all');
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
