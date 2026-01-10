// === NewsNow Platform Management ===
let newsNowPlatforms = [];

async function loadNewsNowPlatforms() {
  const tbody = document.getElementById('newsnow-tbody');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6">加载中...</td></tr>';

  try {
    const res = await fetchWithAuth('/api/newsnow_platforms');
    const data = await res.json();

    if (!Array.isArray(data)) {
      tbody.innerHTML = '<tr><td colspan="6">加载失败</td></tr>';
      return;
    }

    newsNowPlatforms = data;
    tbody.innerHTML = '';

    if (data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="muted">暂无热榜平台，点击"从配置文件导入"开始</td></tr>';
      return;
    }

    data.forEach(p => {
      const tr = document.createElement('tr');
      const statusBadge = p.enabled
        ? '<span class="badge badge-ok">启用</span>'
        : '<span class="badge badge-off">禁用</span>';
      const categoryBadge = p.category ? `<span class="pill">${p.category}</span>` : '-';

      tr.innerHTML = `
              <td>${p.id}</td>
              <td>${p.name}</td>
              <td>${categoryBadge}</td>
              <td>${statusBadge}</td>
              <td>${p.last_fetch_at || '-'}</td>
              <td>
                <button class="btn btn-sm" onclick='editNewsNowPlatform(${JSON.stringify(p)})'>编辑</button>
                <button class="btn btn-sm" onclick="toggleNewsNow('${p.id}')">${p.enabled ? '禁用' : '启用'}</button>
                <button class="btn btn-danger btn-sm" onclick="deleteNewsNow('${p.id}')">删除</button>
              </td>
            `;
      tbody.appendChild(tr);
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6">错误: ${e.message}</td></tr>`;
  }
}

function filterNewsNow() {
  const query = (document.getElementById('newsnow-search')?.value || '').toLowerCase();
  const rows = document.querySelectorAll('#newsnow-tbody tr');
  rows.forEach(tr => {
    const text = tr.innerText.toLowerCase();
    tr.style.display = text.includes(query) ? '' : 'none';
  });
}

function openNewsNowModal(platform = null) {
  document.getElementById('newsnow-edit-original-id').value = platform?.id || '';
  document.getElementById('newsnow-edit-id').value = platform?.id || '';
  document.getElementById('newsnow-edit-id').disabled = !!platform;
  document.getElementById('newsnow-edit-name').value = platform?.name || '';
  document.getElementById('newsnow-edit-category').value = platform?.category || '';
  document.getElementById('newsnow-edit-order').value = platform?.sort_order || 0;
  document.getElementById('newsnow-edit-enabled').checked = platform?.enabled !== false;

  document.getElementById('newsnow-modal').style.display = 'flex';
}

function editNewsNowPlatform(p) {
  openNewsNowModal(p);
}

function closeNewsNowModal() {
  document.getElementById('newsnow-modal').style.display = 'none';
}

async function saveNewsNowPlatform() {
  const originalId = document.getElementById('newsnow-edit-original-id').value;
  const id = document.getElementById('newsnow-edit-id').value.trim();
  const name = document.getElementById('newsnow-edit-name').value.trim();
  const category = document.getElementById('newsnow-edit-category').value;
  const sort_order = parseInt(document.getElementById('newsnow-edit-order').value) || 0;
  const enabled = document.getElementById('newsnow-edit-enabled').checked;

  if (!id || !name) {
    showToast('ID 和名称不能为空', 'error');
    return;
  }

  const payload = { id, name, category, sort_order, enabled };
  const isEdit = !!originalId;
  const url = isEdit ? `/api/newsnow_platforms/${originalId}` : '/api/newsnow_platforms';
  const method = isEdit ? 'PUT' : 'POST';

  try {
    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      showToast(isEdit ? '更新成功' : '添加成功', 'success');
      closeNewsNowModal();
      loadNewsNowPlatforms();
    } else {
      const err = await res.json();
      showToast('保存失败: ' + err.detail, 'error');
    }
  } catch (e) {
    showToast('请求失败: ' + e.message, 'error');
  }
}

async function toggleNewsNow(id) {
  try {
    const res = await fetchWithAuth(`/api/newsnow_platforms/${id}/toggle`, { method: 'POST' });
    if (res.ok) {
      showToast('状态已切换', 'success');
      loadNewsNowPlatforms();
    } else {
      showToast('切换失败', 'error');
    }
  } catch (e) {
    showToast('请求失败', 'error');
  }
}

async function deleteNewsNow(id) {
  if (!confirm('确定删除 ' + id + ' 吗?')) return;
  try {
    const res = await fetchWithAuth(`/api/newsnow_platforms/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('已删除', 'success');
      loadNewsNowPlatforms();
    } else {
      showToast('删除失败', 'error');
    }
  } catch (e) {
    showToast('请求失败', 'error');
  }
}

async function migrateNewsNowFromConfig() {
  if (!confirm('从 config.yaml 导入平台配置？已存在的平台不会重复导入。')) return;
  try {
    const res = await fetchWithAuth('/api/newsnow_platforms/migrate', { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      showToast(`导入完成: ${data.migrated} 个平台`, 'success');
      loadNewsNowPlatforms();
    } else {
      showToast('导入失败: ' + data.detail, 'error');
    }
  } catch (e) {
    showToast('请求失败: ' + e.message, 'error');
  }
}

function showReloadInstructions() {
  const isDocker = confirm(
    '配置已在数据库中更新。\n\n' +
    '要使平台启用/禁用立即生效，需要重启爬虫服务。\n\n' +
    '您是使用 Docker 部署的吗？\n\n' +
    '【确定】= Docker 部署（显示重启命令）\n' +
    '【取消】= 本地运行（查看说明）'
  );

  if (isDocker) {
    // Docker 部署
    const cmd = 'docker compose restart trend-radar';
    const message =
      '请在终端运行以下命令重启爬虫容器：\n\n' +
      cmd + '\n\n' +
      '重启后，禁用的平台将不再抓取数据。';

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(cmd).then(() => {
        alert(message + '\n\n✅ 命令已复制到剪贴板！');
      }).catch(() => {
        alert(message);
      });
    } else {
      alert(message + '\n\n(请手动复制命令)');
    }
  } else {
    // 本地运行
    alert(
      '本地运行说明：\n\n' +
      '1. 在终端按 Ctrl+C 停止当前运行的 TrendRadar\n' +
      '2. 重新运行启动命令\n' +
      '3. 禁用的平台将不再抓取数据\n\n' +
      '注意：Viewer 服务（端口 8090）无需重启。'
    );
  }
}
