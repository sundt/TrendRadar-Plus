function _setUsageStatus(msg) {
  const el = document.getElementById('usage-status');
  if (!el) return;
  el.textContent = msg || '';
}

function _n(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return 0;
  return x;
}

async function loadUsage() {
  const daysRaw = document.getElementById('usage-days')?.value || '7';
  const days = Math.max(1, Math.min(180, parseInt(daysRaw, 10) || 7));
  _setUsageStatus('Loading...');
  const tableEl = document.getElementById('usage-table');
  const kpiEl = document.getElementById('usage-kpi');
  if (tableEl) tableEl.innerHTML = '';
  if (kpiEl) {
    kpiEl.style.display = 'none';
    kpiEl.innerHTML = '';
  }

  const resp = await fetch(`/api/admin/rss-usage?days=${encodeURIComponent(String(days))}&token=${encodeURIComponent(token)}`);
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    _setUsageStatus(payload?.detail || 'Load failed');
    return;
  }

  const items = Array.isArray(payload?.items) ? payload.items : [];
  const maxReq = items.reduce((m, x) => Math.max(m, _n(x?.requests)), 0) || 1;
  const totalReq = items.reduce((s, x) => s + _n(x?.requests), 0);
  const totalUsers = items.reduce((s, x) => s + _n(x?.unique_clients), 0);
  const maxUsers = items.reduce((m, x) => Math.max(m, _n(x?.unique_clients)), 0);
  _setUsageStatus(`Loaded ${items.length} day(s)`);

  if (kpiEl) {
    kpiEl.style.display = 'flex';
    kpiEl.innerHTML = [
      `<span class="pill">days=${days}</span>`,
      `<span class="pill">total_requests=${totalReq}</span>`,
      `<span class="pill">sum_unique_clients=${totalUsers}</span>`,
      `<span class="pill">max_daily_unique_clients=${maxUsers}</span>`
    ].join('');
  }

  if (!tableEl) return;
  if (items.length === 0) {
    tableEl.innerHTML = '<div class="muted">No data.</div>';
    return;
  }

  const rows = items.map((x) => {
    const day = String(x?.day || '');
    const req = _n(x?.requests);
    const users = _n(x?.unique_clients);
    const avgSubs = _n(x?.avg_subs).toFixed(2);
    const maxSubs = _n(x?.max_subs);
    const pct = Math.max(0, Math.min(100, Math.round(req / maxReq * 100)));
    return `
          <tr>
            <td><b>${day}</b></td>
            <td>
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="bar"><div style="width:${pct}%;"></div></div>
                <span>${req}</span>
              </div>
            </td>
            <td>${users}</td>
            <td>${avgSubs}</td>
            <td>${maxSubs}</td>
          </tr>
        `;
  }).join('');

  tableEl.innerHTML = `
        <table>
          <thead>
            <tr>
              <th>Day</th>
              <th>Requests</th>
              <th>Unique Clients (Approx)</th>
              <th>Avg Subs</th>
              <th>Max Subs</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      `;
}
