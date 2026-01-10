let _csvPreviewHash = '';
let _csvPreviewText = '';
let _csvPreviewDetectedFormat = '';

function _setCsvImportStatus(msg) {
  const el = document.getElementById('csv-import-status');
  if (!el) return;
  el.textContent = msg || '';
}

function _parseUrlsFromTextareaText(text) {
  const out = [];
  const seen = new Set();
  const lines = String(text || '').split(/\r?\n/);
  for (const lineRaw of lines) {
    const line = String(lineRaw || '').trim();
    if (!line) continue;

    // Support:
    // 1) plain URL per line
    // 2) CSV row where 2nd column is URL
    let candidate = line;
    if (line.includes(',')) {
      const parts = line.split(',').map((x) => String(x || '').trim());
      if (parts.length >= 2 && (parts[1] || '').startsWith('http')) {
        candidate = parts[1];
      }
    }
    if (!candidate.startsWith('http://') && !candidate.startsWith('https://')) {
      continue;
    }
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    out.push(candidate);
  }
  return out;
}

async function bulkDisableByUrls() {
  const text = document.getElementById('csv-import-text')?.value || '';
  const urls = _parseUrlsFromTextareaText(text);
  if (!urls.length) {
    alert('No URL found in textarea. Paste one URL per line, or CSV rows with URL in the 2nd column.');
    return;
  }
  const ok = confirm(`Disable sources matching ${urls.length} URL(s)? (Only matched enabled sources will be disabled)`);
  if (!ok) return;
  try {
    _setCsvImportStatus('Disabling by URLs...');
    const resp = await fetch('/api/admin/rss-sources/bulk-disable-by-urls', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token
      },
      body: JSON.stringify({ urls })
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || 'Bulk disable by URLs failed');

    const disabled = Number(payload?.disabled || 0);
    const matched = Number(payload?.matched || 0);
    const notFound = Array.isArray(payload?.not_found) ? payload.not_found : [];
    const invalid = Array.isArray(payload?.invalid) ? payload.invalid : [];
    let msg = `Matched ${matched} URL(s), disabled ${disabled} source(s).`;
    if (invalid.length) msg += `\nInvalid: ${invalid.length}`;
    if (notFound.length) msg += `\nNot found: ${notFound.length}`;
    alert(msg);
    location.reload();
  } catch (e) {
    alert(e?.message || String(e));
    _setCsvImportStatus('');
  }
}

function _renderCsvImportResult(payload) {
  const el = document.getElementById('csv-import-result');
  if (!el) return;
  const fmt = payload?.detected_format || '';
  const hash = payload?.preview_hash || '';
  const summary = payload?.summary || {};
  const expected = payload?.expected || {};
  const invalid = Array.isArray(payload?.invalid_rows) ? payload.invalid_rows : [];
  const dups = Array.isArray(payload?.duplicate_rows) ? payload.duplicate_rows : [];
  const sample = Array.isArray(payload?.sample) ? payload.sample : [];
  const fetchErrors = Array.isArray(payload?.fetch_errors) ? payload.fetch_errors : [];

  const expUrlOnly = Array.isArray(expected?.url_only) ? expected.url_only.join(' | ') : '';
  const expHeaderless = Array.isArray(expected?.headerless_fixed_order) ? expected.headerless_fixed_order.join(', ') : '';
  const expZh = Array.isArray(expected?.headered_zh) ? expected.headered_zh.join(', ') : '';

  const kpiHtml = [
    `<span class="pill">format=${_escapeHtml(fmt)}</span>`,
    hash ? `<span class="pill">preview_hash=${_escapeHtml(hash)}</span>` : '',
    `<span class="pill">total_rows=${Number(summary.total_rows || 0)}</span>`,
    `<span class="pill">unique_urls=${Number(summary.unique_urls || 0)}</span>`,
    `<span class="pill">inserted=${Number(summary.inserted || 0)}</span>`,
    `<span class="pill">updated=${Number(summary.updated || 0)}</span>`,
    `<span class="pill">duplicates=${Number(summary.duplicates || 0)}</span>`,
    `<span class="pill">invalid=${Number(summary.invalid || 0)}</span>`
  ].filter(Boolean).join('');

  const invalidHtml = invalid.length ? `
        <div style="margin-top:10px;">
          <div style="font-weight:700;">Invalid Rows (showing up to 50)</div>
          <table style="margin-top:6px;">
            <thead><tr><th>line_no</th><th>error</th></tr></thead>
            <tbody>
              ${invalid.map((x) => `<tr><td class="muted">${_escapeHtml(x.line_no)}</td><td>${_escapeHtml(x.error)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : '';

  const dupHtml = dups.length ? `
        <div style="margin-top:10px;">
          <div style="font-weight:700;">Duplicate Rows (showing up to 50)</div>
          <table style="margin-top:6px;">
            <thead><tr><th>line_no</th><th>url</th><th>first_line_no</th></tr></thead>
            <tbody>
              ${dups.map((x) => `<tr><td class="muted">${_escapeHtml(x.line_no)}</td><td class="muted" style="max-width:520px;word-break:break-all;">${_escapeHtml(x.url)}</td><td class="muted">${_escapeHtml(x.first_line_no)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : '';

  const fetchErrorHtml = fetchErrors.length ? `
        <div style="margin-top:10px;">
          <div style="font-weight:700;">Fetch Errors (showing up to 30)</div>
          <table style="margin-top:6px;">
            <thead><tr><th>url</th><th>error</th></tr></thead>
            <tbody>
              ${fetchErrors.map((x) => `<tr><td class="muted" style="max-width:520px;word-break:break-all;">${_escapeHtml(x.url)}</td><td>${_escapeHtml(x.error)}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>
      ` : '';

  const sampleHtml = sample.length ? `
        <div style="margin-top:10px;">
          <div style="font-weight:700;">Sample (first 10 unique rows)</div>
          <table style="margin-top:6px;">
            <thead><tr><th>action</th><th>name</th><th>url</th><th>seed_last_updated</th><th>category</th><th>feed_type</th><th>country</th><th>language</th><th>source</th><th>added_at</th></tr></thead>
            <tbody>
              ${sample.map((x) => `
                <tr>
                  <td class="muted">${_escapeHtml(x.action)}</td>
                  <td><b>${_escapeHtml(x.name)}</b></td>
                  <td class="muted" style="max-width:420px;word-break:break-all;">${_escapeHtml(x.url)}</td>
                  <td class="muted">${_escapeHtml(x.seed_last_updated)}</td>
                  <td class="muted">${_escapeHtml(x.category)}</td>
                  <td class="muted">${_escapeHtml(x.feed_type)}</td>
                  <td class="muted">${_escapeHtml(x.country)}</td>
                  <td class="muted">${_escapeHtml(x.language)}</td>
                  <td class="muted">${_escapeHtml(x.source)}</td>
                  <td class="muted">${_escapeHtml(x.added_at)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      ` : '';

  el.innerHTML = `
        <div class="kpi" style="display:flex;">${kpiHtml}</div>
        <div style="margin-top:8px;" class="muted">
          ${expUrlOnly ? `<div><b>Expected (url-only)</b>: ${_escapeHtml(expUrlOnly)}</div>` : ''}
          <div><b>Expected (headerless)</b>: ${_escapeHtml(expHeaderless)}</div>
          <div><b>Expected (headered zh)</b>: ${_escapeHtml(expZh)}</div>
        </div>
        ${invalidHtml}
        ${dupHtml}
        ${fetchErrorHtml}
        ${sampleHtml}
      `;
}

async function previewCsvImport() {
  const text = document.getElementById('csv-import-text')?.value || '';
  _setCsvImportStatus('Previewing...');
  const el = document.getElementById('csv-import-result');
  if (el) el.innerHTML = '';
  _csvPreviewHash = '';
  _csvPreviewText = '';
  _csvPreviewDetectedFormat = '';
  const resp = await fetch(`/api/admin/rss-sources/import-csv/preview?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: text })
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    _setCsvImportStatus(payload?.detail || 'Preview failed');
    if (el) el.innerHTML = `<div style="color:#dc2626;">${_escapeHtml(payload?.detail || 'Preview failed')}</div>`;
    return;
  }
  _csvPreviewDetectedFormat = String(payload?.detected_format || '');
  _csvPreviewHash = String(payload?.preview_hash || '');
  _csvPreviewText = String(text || '');

  // For URL-only format, use the autofill result
  const autoText = String(payload?.autofill_csv_text || '');
  const autoHash = String(payload?.autofill_preview_hash || '');
  if (_csvPreviewDetectedFormat === 'url_only' && autoText && autoHash) {
    const ta = document.getElementById('csv-import-text');
    if (ta) ta.value = autoText;
    _csvPreviewHash = autoHash;
    _csvPreviewText = autoText;
    _csvPreviewDetectedFormat = 'headerless_fixed';
  }

  _setCsvImportStatus('Preview ready');
  _renderCsvImportResult(payload);
}

async function commitCsvImport() {
  const text = document.getElementById('csv-import-text')?.value || '';
  if (!_csvPreviewHash) {
    alert('Please Preview first.');
    return;
  }
  const currentText = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const previewText = String(_csvPreviewText || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (currentText !== previewText) {
    alert('CSV text changed since preview. Please Preview again.');
    return;
  }
  const ok = confirm('Commit import into rss_sources?');
  if (!ok) return;
  _setCsvImportStatus('Committing...');
  const resp = await fetch(`/api/admin/rss-sources/import-csv/commit?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv_text: text, preview_hash: _csvPreviewHash })
  });
  const payload = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    _setCsvImportStatus(payload?.detail || 'Commit failed');
    alert(payload?.detail || 'Commit failed');
    return;
  }
  _setCsvImportStatus('Committed');
  location.reload();
}

async function exportCatalogAll() {
  try {
    _setCsvImportStatus('Exporting...');
    const resp = await fetch('/api/admin/rss-sources/export', {
      method: 'GET',
      headers: {
        'X-Admin-Token': token
      }
    });
    if (!resp.ok) {
      const payload = await resp.json().catch(() => ({}));
      throw new Error(payload?.detail || 'Export failed');
    }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'admin_rss_catalog_all.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    _setCsvImportStatus('Exported');
  } catch (e) {
    alert(e?.message || String(e));
    _setCsvImportStatus('');
  }
}

async function bulkEnableCatalogAll() {
  const ok = confirm('Enable ALL disabled rss_sources in Catalog (All)?');
  if (!ok) return;
  try {
    _setCsvImportStatus('Enabling...');
    const resp = await fetch('/api/admin/rss-sources/bulk-enable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token
      },
      body: JSON.stringify({})
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || 'Bulk enable failed');
    alert(`Enabled ${Number(payload?.enabled || 0)} source(s).`);
    location.reload();
  } catch (e) {
    alert(e?.message || String(e));
    _setCsvImportStatus('');
  }
}

async function bulkDisableCatalogAll() {
  const ok = confirm('Disable ALL enabled rss_sources in Catalog (All)?');
  if (!ok) return;
  try {
    _setCsvImportStatus('Disabling...');
    const resp = await fetch('/api/admin/rss-sources/bulk-disable', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Token': token
      },
      body: JSON.stringify({})
    });
    const payload = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(payload?.detail || 'Bulk disable failed');
    alert(`Disabled ${Number(payload?.disabled || 0)} source(s).`);
    location.reload();
  } catch (e) {
    alert(e?.message || String(e));
    _setCsvImportStatus('');
  }
}
