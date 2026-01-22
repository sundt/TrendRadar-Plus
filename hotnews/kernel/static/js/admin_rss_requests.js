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
