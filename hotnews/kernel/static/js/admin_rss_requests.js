async function approveReq(id) {
  id = String(id || '').trim();
  const name = document.getElementById(`name-${id}`)?.value || '';
  const resp = await fetch(`/api/admin/rss-source-requests/${id}/approve?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name })
  });
  if (!resp.ok) {
    const t = await resp.text();
    alert(t || 'Approve failed');
    return;
  }
  location.reload();
}

async function rejectReq(id) {
  id = String(id || '').trim();
  const reason = document.getElementById(`reason-${id}`)?.value || '';
  const resp = await fetch(`/api/admin/rss-source-requests/${id}/reject?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason })
  });
  if (!resp.ok) {
    const t = await resp.text();
    alert(t || 'Reject failed');
    return;
  }
  location.reload();
}

async function reopenReq(id) {
  id = String(id || '').trim();
  const resp = await fetch(`/api/admin/rss-source-requests/${id}/reopen?token=${encodeURIComponent(token)}`, {
    method: 'POST'
  });
  if (!resp.ok) {
    const t = await resp.text();
    alert(t || 'Reopen failed');
    return;
  }
  location.reload();
}

// ─── 用户投稿待审 ──────────────────────────────────────────────────────────
async function loadPendingSources() {
  const filter = document.getElementById('pending-status-filter');
  const status = filter ? filter.value : 'pending';
  const list = document.getElementById('pending-sources-list');
  if (!list) return;
  list.innerHTML = '<p style="color:#6b7280;">加载中…</p>';

  try {
    const resp = await fetch(`/api/admin/pending-sources?status=${status}`, {
      headers: { 'X-Admin-Token': token }
    });
    const data = await resp.json();

    // 更新徽标
    const badge = document.getElementById('pending-badge');
    const pendingCount = (data.counts || {}).pending || 0;
    if (badge) {
      if (pendingCount > 0) {
        badge.textContent = pendingCount;
        badge.style.display = 'inline';
      } else {
        badge.style.display = 'none';
      }
    }

    if (!data.items || data.items.length === 0) {
      list.innerHTML = '<p style="color:#6b7280;padding:20px 0;">暂无记录</p>';
      return;
    }

    list.innerHTML = data.items.map(item => `
      <div id="pending-item-${item.id}" style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;margin-bottom:12px;background:#fff;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:600;font-size:14px;margin-bottom:4px;word-break:break-all;">
              ${escHtml(item.feed_title || item.host)}
            </div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">
              提交 URL：<a href="${escHtml(item.submitted_url)}" target="_blank" style="color:#2563eb;">${escHtml(item.submitted_url)}</a>
            </div>
            <div style="font-size:12px;color:#6b7280;margin-bottom:2px;">
              RSS：<a href="${escHtml(item.detected_rss)}" target="_blank" style="color:#2563eb;">${escHtml(item.detected_rss)}</a>
            </div>
            <div style="font-size:11px;color:#9ca3af;margin-top:4px;">
              ${item.item_count} 条内容 ·
              ${item.use_socks_proxy ? '⚠️ 需代理' : '✅ 直连'} ·
              ${item.submitter_ip} ·
              ${new Date(item.submitted_at * 1000).toLocaleString('zh-CN')}
            </div>
          </div>
          ${item.status === 'pending' ? `
            <div style="display:flex;flex-direction:column;gap:6px;flex-shrink:0;">
              <button onclick="approvePending('${item.id}')"
                style="padding:6px 14px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
                批准
              </button>
              <button onclick="rejectPending('${item.id}')"
                style="padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;">
                拒绝
              </button>
            </div>
          ` : `
            <div style="font-size:12px;padding:4px 10px;border-radius:6px;
              background:${item.status === 'approved' ? '#d1fae5' : '#fee2e2'};
              color:${item.status === 'approved' ? '#065f46' : '#991b1b'};">
              ${item.status === 'approved' ? '✅ 已批准' : '❌ 已拒绝'}
            </div>
          `}
        </div>
        ${item.reject_reason ? `<div style="margin-top:8px;font-size:12px;color:#b91c1c;background:#fef2f2;padding:6px 10px;border-radius:6px;">拒绝原因：${escHtml(item.reject_reason)}</div>` : ''}
      </div>
    `).join('');
  } catch (e) {
    list.innerHTML = `<p style="color:#dc2626;">加载失败：${e.message}</p>`;
  }
}

let _pendingApprovalId = null;

async function approvePending(id) {
  _pendingApprovalId = String(id || '').trim();
  
  // Reset input fields
  document.getElementById('approve-pending-name').value = '';
  const catSelect = document.getElementById('approve-pending-category');
  catSelect.innerHTML = '<option value="">(加载分类中...)</option>';
  
  // Show modal early for responsiveness
  const modal = document.getElementById('approve-pending-modal');
  if (modal) modal.style.display = 'block';

  // Fetch available categories (returns a plain array [{id, name, icon}])
  try {
    const res = await fetch('/api/platform/categories');
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      catSelect.innerHTML = '<option value="">(请选择分类)</option>' + data.map(c => 
        `<option value="${c.id}">${c.icon || ''} ${c.name || c.id}</option>`
      ).join('');
    } else {
      catSelect.innerHTML = '<option value="">(暂无分类，请先创建分类)</option>';
    }
  } catch (err) {
    console.error("Failed to load categories", err);
    catSelect.innerHTML = '<option value="">(加载分类失败，请刷新后重试)</option>';
  }
}

function closeApproveModal() {
  const modal = document.getElementById('approve-pending-modal');
  if (modal) modal.style.display = 'none';
  _pendingApprovalId = null;
}

async function confirmApprovePending() {
  if (!_pendingApprovalId) return;

  const nameVal = document.getElementById('approve-pending-name')?.value || '';
  const categoryVal = document.getElementById('approve-pending-category')?.value || '';

  if (categoryVal.trim() === '') {
    alert('必须选择或填写分类标签，否则文章无法在各个频道正常显示。');
    return;
  }

  // Show loading state
  const btn = document.querySelector('#approve-pending-modal .btn-primary');
  const oldText = btn.textContent;
  if(btn) btn.textContent = '提交中...';

  try {
    const resp = await fetch(`/api/admin/pending-sources/${_pendingApprovalId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
      body: JSON.stringify({ name: nameVal.trim(), category: categoryVal.trim() }),
    });
    const data = await resp.json();
    
    if (data.ok) {
      if (typeof showToast === 'function') {
        showToast(`✅ 已收录！Source ID: ${data.source_id}`);
      } else {
        alert(`✅ 已收录！Source ID: ${data.source_id}`);
      }
      closeApproveModal();
      loadPendingSources();
    } else {
      alert('操作失败：' + (data.error || '未知错误'));
    }
  } catch(e) {
    alert('请求失败: ' + e.message);
  } finally {
    if(btn) btn.textContent = oldText;
  }
}

async function rejectPending(id) {
  const reason = prompt('拒绝原因（可留空）：') ?? null;
  if (reason === null) return;

  const resp = await fetch(`/api/admin/pending-sources/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify({ reason }),
  });
  const data = await resp.json();
  if (data.ok) {
    document.getElementById(`pending-item-${id}`)?.remove();
    loadPendingSources();
  } else {
    alert('操作失败');
  }
}

function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// 页面加载时只获取初始徽标数量
document.addEventListener('DOMContentLoaded', () => {
  fetch('/api/admin/pending-sources?status=pending', {
    headers: { 'X-Admin-Token': token }
  }).then(r => r.json()).then(data => {
    const badge = document.getElementById('pending-badge');
    const count = (data.counts || {}).pending || 0;
    if (badge && count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
    }
  }).catch(() => {});
});
