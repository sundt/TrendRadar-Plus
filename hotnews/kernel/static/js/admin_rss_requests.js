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
      headers: { 'X-Admin-Token': window._adminToken || '' }
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

async function approvePending(id) {
  const name = prompt('确认收录名称（可留空用默认）：') ?? null;
  if (name === null) return; // 用户取消
  
  const category = prompt('分类（必须填写，例如：tech_news、ainews、finance 等）：');
  if (!category || category.trim() === '') {
    alert('必须填写分类标签，否则文章无法在各个频道正常显示。操作取消。');
    return;
  }

  const resp = await fetch(`/api/admin/pending-sources/${id}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': window._adminToken || '' },
    body: JSON.stringify({ name: name.trim(), category: category.trim() }),
  });
  const data = await resp.json();
  if (data.ok) {
    alert(`✅ 已收录！Source ID: ${data.source_id}`);
    loadPendingSources();
  } else {
    alert('操作失败：' + (data.error || '未知错误'));
  }
}

async function rejectPending(id) {
  const reason = prompt('拒绝原因（可留空）：') ?? null;
  if (reason === null) return;

  const resp = await fetch(`/api/admin/pending-sources/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': window._adminToken || '' },
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

// Tab 切换时自动加载
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.tab === 'pending-submissions') loadPendingSources();
    });
  });
  // 初始化时获取徽标数量
  fetch('/api/admin/pending-sources?status=pending', {
    headers: { 'X-Admin-Token': window._adminToken || '' }
  }).then(r => r.json()).then(data => {
    const badge = document.getElementById('pending-badge');
    const count = (data.counts || {}).pending || 0;
    if (badge && count > 0) {
      badge.textContent = count;
      badge.style.display = 'inline';
    }
  }).catch(() => {});
});
