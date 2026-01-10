const token = document.querySelector('meta[name="admin-token"]').content;
      console.log("Admin Token:", token);

      async function fetchWithAuth(url, options = {}) {
        const headers = options.headers || {};
        headers['X-Admin-Token'] = token;
        const res = await fetch(url, { ...options, headers });
        if (res.status === 401) {
          // simple handling
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

        // Tab switching
        tabButtons.forEach(btn => {
          btn.addEventListener('click', () => {
            const targetPanel = btn.dataset.tab;

            // Update button states
            tabButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update panel states
            tabPanels.forEach(panel => {
              if (panel.dataset.panel === targetPanel) {
                panel.classList.add('active');
              } else {
                panel.classList.remove('active');
              }
            });

            // Load data if switching to specific tabs
            if (targetPanel === 'custom') loadCustomSources('all');
            if (targetPanel === 'newsnow') loadNewsNowPlatforms();
            if (targetPanel === 'unified') loadUnifiedData();

            // Update URL hash
            window.location.hash = targetPanel;
          });
        });

        // Restore tab from URL hash on load
        const hash = window.location.hash.substring(1);
        if (hash) {
          const targetBtn = document.querySelector(`button[data-tab="${hash}"]`);
          if (targetBtn) {
            targetBtn.click();
          }
        }
      }

      // ============================================================================
      // Quick Add RSS Function
      // ============================================================================
      async function quickAddRss() {
        const input = document.getElementById('quick-add-url');
        const url = (input?.value || '').trim();

        if (!url) {
          showToast('请输入 RSS URL', 'warning');
          return;
        }

        if (!token) {
          showToast('缺少 admin token', 'error');
          return;
        }

        try {
          // Step 1: Preview
          showToast('正在预览...', 'info');
          const previewResp = await fetch(`/api/admin/rss-sources/import-csv/preview?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv_text: url })
          });
          const previewData = await previewResp.json().catch(() => ({}));

          if (!previewResp.ok) {
            throw new Error(previewData?.detail || 'Preview 失败');
          }

          const previewHash = previewData?.preview_hash || '';
          let csvText = url;

          // Use autofill result if available
          const autofillText = previewData?.autofill_csv_text || '';
          const autofillHash = previewData?.autofill_preview_hash || '';
          if (autofillText && autofillHash) {
            csvText = autofillText;
            showToast('已自动填充元数据', 'success', 1500);
          }

          const finalHash = autofillHash || previewHash;

          // Step 2: Commit
          showToast('正在添加到数据库...', 'info');
          const commitResp = await fetch(`/api/admin/rss-sources/import-csv/commit?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ csv_text: csvText, preview_hash: finalHash })
          });
          const commitData = await commitResp.json().catch(() => ({}));

          if (!commitResp.ok) {
            throw new Error(commitData?.detail || 'Commit 失败');
          }

          showToast('✅ 添加成功！正在抓取内容...', 'success');

          // Clear input
          if (input) input.value = '';

          // Step 3: Warmup (optional, best effort)
          try {
            // Extract source_ids from preview sample (if available)
            const sample = previewData?.sample || [];
            if (sample.length > 0) {
              // Trigger warmup for newly added sources
              // We'll reload the page to see the new source
              setTimeout(() => location.reload(), 1500);
            } else {
              setTimeout(() => location.reload(), 1000);
            }
          } catch (e) {
            setTimeout(() => location.reload(), 1000);
          }

        } catch (error) {
          showToast(`添加失败: ${error.message}`, 'error', 5000);
        }
      }

      // Initialize tabs on load
      document.addEventListener('DOMContentLoaded', initTabs);

      // ============================================================================
      // Dropdown & Expand System
      // ============================================================================
      function toggleDropdown(id) {
        const menu = document.getElementById(id);
        const allMenus = document.querySelectorAll('.dropdown-menu');
        allMenus.forEach(m => {
          if (m.id !== id) m.classList.remove('show');
        });
        if (menu) menu.classList.toggle('show');
      }

      function closeDropdown(id) {
        const menu = document.getElementById(id);
        if (menu) menu.classList.remove('show');
      }

      // Close dropdowns when clicking outside
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.dropdown')) {
          document.querySelectorAll('.dropdown-menu').forEach(m => m.classList.remove('show'));
        }
      });

      async function toggleDetail(btn) {
        const row = btn.closest('tr');
        const detailRow = row.nextElementSibling;
        const sourceId = btn.dataset.id;

        if (detailRow && detailRow.classList.contains('detail-row')) {
          // Check visibility by style or class. We use inline style now.
          const isHidden = detailRow.style.display === 'none' || detailRow.style.display === '';

          if (isHidden) {
            // SHOW
            detailRow.style.display = 'table-row';
            btn.textContent = '▼';

            // Load content if needed
            const container = document.getElementById(`detail-entries-${sourceId}`);
            if (container && !container.dataset.loaded) {
              try {
                const resp = await fetch(`/api/admin/rss-sources/${sourceId}/entries?token=${encodeURIComponent(token)}`);
                const payload = await resp.json();

                // Handle potential error
                if (!resp.ok) throw new Error(payload.detail || 'Fetch failed');

                const entries = payload.entries || [];
                if (entries.length > 0) {
                  const items = entries.map(e => `
                      <div style="padding:4px 0; border-bottom:1px solid #e5e7eb; font-size:12px; display:flex; justify-content:space-between; align-items:center;">
                          <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:75%;">
                              <a href="${_escapeHtml(e.url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb; text-decoration:none; font-weight:500;">
                                  ${_escapeHtml(e.title || 'No Title')}
                              </a>
                          </div>
                          <div class="muted" style="font-size:11px; white-space:nowrap; margin-left:8px;">
                              ${_escapeHtml(e.time)}
                          </div>
                      </div>
                   `).join('');
                  container.innerHTML = `<div style="padding:4px 0;">
                      <div style="font-size:11px; font-weight:700; color:#4b5563; margin-bottom:6px; letter-spacing:0.5px;">LATEST 10 ENTRIES</div>
                      ${items}
                   </div>`;
                } else {
                  container.innerHTML = '<div class="muted" style="font-size:12px; padding:4px;">No entries found.</div>';
                }
                container.dataset.loaded = "true";
              } catch (e) {
                container.innerHTML = `<div style="color:#dc2626; font-size:12px; padding:4px;">Error loading entries: ${_escapeHtml(String(e))}</div>`;
              }
            }
          } else {
            // HIDE
            detailRow.style.display = 'none';
            btn.textContent = '▶';
          }
        }
      }

      function handleRowSelect(checkbox) {
        updateBulkSelectionInfo();
      }

      let _catalogFilter = 'ABNORMAL';

      function _getCatalogContainer() {
        return document.getElementById('rss-catalog-all');
      }

      function _getCatalogRows() {
        const c = _getCatalogContainer();
        if (!c) return [];
        return Array.from(c.querySelectorAll('table tbody tr[data-health]'));
      }

      function _rowIsVisible(tr) {
        if (!tr) return false;
        const v = String(tr.style?.display || '');
        return v !== 'none';
      }

      function getSelectedSourceIds() {
        const ids = [];
        const rows = _getCatalogRows();
        for (const tr of rows) {
          const cb = tr.querySelector('input.rss-src-select');
          if (!cb) continue;
          if (cb.checked) {
            const sid = String(cb.dataset?.id || '').trim();
            if (sid) ids.push(sid);
          }
        }
        return ids;
      }

      function updateBulkSelectionInfo() {
        const el = document.getElementById('bulk-selection-info');
        if (!el) return;
        const ids = getSelectedSourceIds();
        el.textContent = `Selected: ${ids.length}`;

        const head = document.getElementById('select-all-visible');
        if (head) {
          const rows = _getCatalogRows().filter(r => _rowIsVisible(r));
          let visibleCount = 0;
          let checkedCount = 0;
          for (const tr of rows) {
            const cb = tr.querySelector('input.rss-src-select');
            if (!cb) continue;
            visibleCount += 1;
            if (cb.checked) checkedCount += 1;
          }
          head.checked = visibleCount > 0 && checkedCount === visibleCount;
        }
      }

      function toggleSelectAllVisible(head) {
        const checked = !!head?.checked;
        const rows = _getCatalogRows();
        for (const tr of rows) {
          if (!_rowIsVisible(tr)) continue;
          const cb = tr.querySelector('input.rss-src-select');
          if (!cb) continue;
          cb.checked = checked;
        }
        updateBulkSelectionInfo();
      }

      async function _bulkPostJson(url, payload) {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': token
          },
          body: JSON.stringify(payload || {})
        });
        const data = await resp.json().catch(() => ({}));
        if (!resp.ok) throw new Error(data?.detail || `Failed (${resp.status})`);
        return data;
      }

      async function _warmupIds(ids, askConfirm) {
        const list = Array.isArray(ids) ? ids : [];
        if (!list.length) { alert('No rows selected.'); return; }
        if (!token) { alert('Missing admin token. Use ?token=...'); return; }
        if (askConfirm) {
          const ok = confirm(`批量抓取选中源？\ncount=${list.length}`);
          if (!ok) return;
        }
        _setCsvImportStatus(`批量抓取中... count=${list.length}`);

        const chunk = 25;
        let queued = 0;
        for (let i = 0; i < list.length; i += chunk) {
          const part = list.slice(i, i + chunk);
          const resp = await fetch('/api/rss-sources/warmup?wait_ms=1200', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify({ source_ids: part, priority: 'high' })
          });
          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(payload?.detail || `Failed (${resp.status})`);
          queued += Number(payload?.queued || 0);
        }
        _setCsvImportStatus(`批量抓取已触发: queued=${queued}`);
      }

      async function bulkWarmupSelected() {
        const ids = getSelectedSourceIds();
        await _warmupIds(ids, true);
      }

      async function bulkClearBackoffAndRetry() {
        const ids = getSelectedSourceIds();
        if (!ids.length) { alert('No rows selected.'); return; }
        if (!token) { alert('Missing admin token. Use ?token=...'); return; }
        const ok = confirm(`批量清除退避并重试抓取？\ncount=${ids.length}`);
        if (!ok) return;
        _setCsvImportStatus(`批量清退避中... count=${ids.length}`);

        await _bulkPostJson('/api/admin/rss-sources/clear-backoff-bulk', { source_ids: ids });
        await _warmupIds(ids, false);
      }

      async function bulkSetEnabledSelected(enabled) {
        const ids = getSelectedSourceIds();
        if (!ids.length) { alert('No rows selected.'); return; }
        if (!token) { alert('Missing admin token. Use ?token=...'); return; }
        const label = enabled ? '启用' : '禁用';
        const ok = confirm(`批量${label}选中源？\ncount=${ids.length}`);
        if (!ok) return;
        _setCsvImportStatus(`批量${label}中... count=${ids.length}`);
        await _bulkPostJson('/api/admin/rss-sources/set-enabled-bulk', { source_ids: ids, enabled: enabled ? 1 : 0 });
        _setCsvImportStatus(`批量${label}完成: count=${ids.length}`);
        try { window.location.reload(); } catch (e) { }
      }

      async function bulkDeleteSelected() {
        const ids = getSelectedSourceIds();
        if (!ids.length) { alert('No rows selected.'); return; }
        if (!token) { alert('Missing admin token. Use ?token=...'); return; }
        const ok = confirm(`确认批量删除选中源？\ncount=${ids.length}\n\n将同时删除 entries，并清理订阅引用。`);
        if (!ok) return;
        _setCsvImportStatus(`批量删除中... count=${ids.length}`);
        await _bulkPostJson('/api/admin/rss-sources/delete-bulk', { source_ids: ids });
        _setCsvImportStatus(`批量删除完成: count=${ids.length}`);
        try { window.location.reload(); } catch (e) { }
      }

      function _catalogFilterMatch(row, filter) {
        const f = String(filter || '').trim().toUpperCase() || 'ALL';
        const health = String(row?.dataset?.health || '').trim().toUpperCase();
        const abnormal = String(row?.dataset?.abnormal || '').trim() === '1';

        if (f === 'ALL') return true;
        if (f === 'ABNORMAL') return abnormal;
        return health === f;
      }

      function _catalogSearchMatch(row, q) {
        const query = String(q || '').trim().toLowerCase();
        if (!query) return true;
        const hay = String(row?.dataset?.search || '').toLowerCase();
        return hay.includes(query);
      }

      function applyCatalogFilter() {
        const q = document.getElementById('catalog-search')?.value || '';
        const rows = _getCatalogRows();
        for (const tr of rows) {
          const ok = _catalogFilterMatch(tr, _catalogFilter) && _catalogSearchMatch(tr, q);
          tr.style.display = ok ? '' : 'none';
        }

        const c = _getCatalogContainer();
        const btns = c ? c.querySelectorAll('button[data-filter]') : document.querySelectorAll('button[data-filter]');
        for (const b of btns) {
          const f = String(b?.dataset?.filter || '').trim().toUpperCase();
          if (!f) continue;
          if (f === String(_catalogFilter || '').trim().toUpperCase()) {
            b.classList.add('btn-primary');
          } else {
            b.classList.remove('btn-primary');
          }
        }

        updateBulkSelectionInfo();
      }

      async function deleteSource(btn) {
        const sid = String(btn?.dataset?.id || '').trim();
        const name = String(btn?.dataset?.name || '').trim();
        if (!sid) return;
        const ok = confirm(`确认删除 RSS 源？\n\nname=${name || '(unknown)'}\nsource_id=${sid}\n\n将同时删除该源 entries，并清理订阅引用。`);
        if (!ok) return;

        const originalBtnText = String(btn.textContent || '');
        try {
          if (!token) {
            _setCsvImportStatus('删除失败: 缺少 admin token');
            alert('Missing admin token. Use ?token=... to open this page or configure TREND_RADAR_ADMIN_TOKEN.');
            return;
          }

          btn.disabled = true;
          btn.textContent = 'Deleting...';
          _setCsvImportStatus(`Deleting: ${sid} ...`);

          const resp = await fetch('/api/admin/rss-sources/delete', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify({ source_id: sid })
          });
          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(payload?.detail || `Failed (${resp.status})`);

          _setCsvImportStatus(`Deleted: ${sid}`);
          try { window.location.reload(); } catch (e) { }
        } catch (e) {
          _setCsvImportStatus(`删除失败: ${sid}`);
          alert(e?.message || String(e));
          btn.textContent = originalBtnText || 'Delete';
        } finally {
          try { btn.disabled = false; } catch (e) { }
        }
      }

      async function clearBackoffAndRetry(btn) {
        const sid = String(btn?.dataset?.id || '').trim();
        if (!sid) return;
        const ok = confirm(`清除退避并重试抓取？\nsource_id=${sid}`);
        if (!ok) return;

        const originalBtnText = String(btn.textContent || '');
        try {
          if (!token) {
            _setCsvImportStatus('操作失败: 缺少 admin token');
            alert('Missing admin token. Use ?token=... to open this page or configure TREND_RADAR_ADMIN_TOKEN.');
            return;
          }

          btn.disabled = true;
          btn.textContent = '清理中...';
          _setCsvImportStatus(`清理退避: ${sid} ...`);

          const resp = await fetch('/api/admin/rss-sources/clear-backoff', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify({ source_id: sid, warmup: 0 })
          });
          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(payload?.detail || `Failed (${resp.status})`);

          _setCsvImportStatus(`已清除退避: ${sid}，开始重试抓取...`);
          btn.textContent = '重试中...';

          await warmupSource(sid);
          btn.textContent = '已重试';
        } catch (e) {
          _setCsvImportStatus(`操作失败: ${sid}`);
          alert(e?.message || String(e));
          btn.textContent = originalBtnText || '清退避并重试';
        } finally {
          try { btn.disabled = false; } catch (e) { }
        }
      }

      function setCatalogFilter(v) {
        _catalogFilter = String(v || 'ALL');
        applyCatalogFilter();
      }

      let _csvPreviewHash = '';
      let _csvPreviewText = '';
      let _csvPreviewDetectedFormat = '';

      try {
        const search = document.getElementById('catalog-search');
        if (search) {
          search.addEventListener('input', () => applyCatalogFilter());
        }
        updateBulkSelectionInfo();
        applyCatalogFilter();
      } catch (e) {
        // ignore
      }

      function _setCsvImportStatus(msg) {
        const el = document.getElementById('csv-import-status');
        if (!el) return;
        el.textContent = msg || '';
      }

      function _escapeHtml(s) {
        return String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');
      }

      function _setMorningBriefRulesStatus(msg) {
        const el = document.getElementById('mb-rules-status');
        if (!el) return;
        el.textContent = msg || '';
      }

      async function loadMorningBriefRules() {
        try {
          _setMorningBriefRulesStatus('Loading...');
          const resp = await fetch(`/api/admin/morning-brief/rules?token=${encodeURIComponent(token)}`);
          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(payload?.detail || 'Load failed');
          const rules = payload?.rules || {};
          const text = JSON.stringify(rules, null, 2);
          const ta = document.getElementById('mb-rules-text');
          if (ta) ta.value = text;
          _setMorningBriefRulesStatus(`Loaded (updated_at=${Number(payload?.updated_at || 0)})`);
        } catch (e) {
          _setMorningBriefRulesStatus('');
          alert(e?.message || String(e));
        }
      }

      function validateMorningBriefRules() {
        try {
          const ta = document.getElementById('mb-rules-text');
          const text = ta ? String(ta.value || '').trim() : '';
          if (!text) throw new Error('Empty rules JSON');
          const parsed = JSON.parse(text);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Rules must be a JSON object');
          }
          _setMorningBriefRulesStatus('Valid JSON');
        } catch (e) {
          _setMorningBriefRulesStatus('Invalid JSON');
          alert(e?.message || String(e));
        }
      }

      async function saveMorningBriefRules() {
        try {
          const ta = document.getElementById('mb-rules-text');
          const text = ta ? String(ta.value || '').trim() : '';
          if (!text) throw new Error('Empty rules JSON');
          const rules = JSON.parse(text);
          _setMorningBriefRulesStatus('Saving...');
          const resp = await fetch(`/api/admin/morning-brief/rules?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify({ rules })
          });
          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(payload?.detail || 'Save failed');
          _setMorningBriefRulesStatus(`Saved (updated_at=${Number(payload?.updated_at || 0)})`);
        } catch (e) {
          _setMorningBriefRulesStatus('');
          alert(e?.message || String(e));
        }
      }

      async function toggleSourceEnabled(btn) {
        const sourceId = btn?.dataset?.id || '';
        const curEnabled = String(btn?.dataset?.enabled || '').trim() === '1';
        const nextEnabled = !curEnabled;
        if (!sourceId) return;

        try {
          btn.disabled = true;
          const resp = await fetch('/api/admin/rss-sources/set-enabled', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify({ source_id: sourceId, enabled: nextEnabled ? 1 : 0 })
          });
          const payload = await resp.json();
          if (!resp.ok) throw new Error(payload?.detail || 'Failed');

          btn.dataset.enabled = nextEnabled ? '1' : '0';
          btn.textContent = nextEnabled ? 'Disable' : 'Enable';
          const cell = document.getElementById(`src-enabled-${sourceId}`);
          if (cell) cell.textContent = nextEnabled ? '1' : '0';
        } catch (e) {
          alert(e?.message || String(e));
        } finally {
          try { btn.disabled = false; } catch (e) { /* ignore */ }
        }
      }

      async function warmupSource(btnOrSourceId) {
        const btn = (btnOrSourceId && typeof btnOrSourceId === 'object' && 'dataset' in btnOrSourceId) ? btnOrSourceId : null;
        const sid = btn ? String(btn?.dataset?.id || '').trim() : String(btnOrSourceId || '').trim();
        if (!sid) return;

        const originalBtnText = btn ? String(btn.textContent || '') : '';
        try {
          if (!token) {
            _setCsvImportStatus('抓取失败: 缺少 admin token');
            alert('Missing admin token. Use ?token=... to open this page or configure TREND_RADAR_ADMIN_TOKEN.');
            return;
          }

          if (btn) {
            btn.disabled = true;
            btn.textContent = '抓取中...';
          }
          _setCsvImportStatus(`抓取中: ${sid} ...`);

          const ctrl = new AbortController();
          const t = setTimeout(() => ctrl.abort(), 15000);
          const resp = await fetch('/api/rss-sources/warmup?wait_ms=1200', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify({ source_ids: [sid], priority: 'high' }),
            signal: ctrl.signal,
          }).finally(() => clearTimeout(t));

          const payload = await resp.json().catch(() => ({}));
          if (!resp.ok) throw new Error(payload?.detail || `Failed (${resp.status})`);

          const detail = String(payload?.detail || '').toLowerCase();
          if (detail.includes('warmup not available')) {
            throw new Error(String(payload?.detail || 'warmup not available'));
          }
          if (Number(payload?.queued || 0) <= 0) {
            throw new Error(String(payload?.detail || 'No task queued'));
          }

          const res0 = Array.isArray(payload?.results) ? payload.results[0] : null;
          if (res0 && res0.ok === false && res0.error) {
            throw new Error(String(res0.error));
          }

          _setCsvImportStatus(`抓取完成: ${sid}`);
          if (btn) btn.textContent = '已触发';
        } catch (e) {
          _setCsvImportStatus(`抓取失败: ${sid}`);
          const name = String(e?.name || '');
          if (name === 'AbortError') {
            alert('Request timeout (15s).');
          } else {
            alert(e?.message || String(e));
          }
          if (btn) btn.textContent = originalBtnText || '手动抓取';
        } finally {
          if (btn) {
            try { btn.disabled = false; } catch (e) { /* ignore */ }
          }
        }
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
        const ai = payload?.ai || {};

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
        if (kpiEl) { kpiEl.style.display = 'none'; kpiEl.innerHTML = ''; }

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
    

      function openEditModal(btn) {
        const modal = document.getElementById('rss-edit-modal');
        // Populate fields
        document.getElementById('edit-source-id').value = btn.dataset.id || '';
        document.getElementById('edit-name').value = btn.dataset.name || '';
        document.getElementById('edit-url').value = btn.dataset.url || '';
        document.getElementById('edit-category').value = btn.dataset.category || '';
        document.getElementById('edit-feed-type').value = btn.dataset.feedType || '';
        document.getElementById('edit-country').value = btn.dataset.country || '';
        document.getElementById('edit-language').value = btn.dataset.language || '';
        document.getElementById('edit-source').value = btn.dataset.source || '';
        document.getElementById('edit-scrape-rules').value = btn.dataset.scrapeRules || '';
        document.getElementById('edit-enabled').checked = (btn.dataset.enabled === '1');

        modal.style.display = 'flex';
      }

      function closeEditModal() {
        document.getElementById('rss-edit-modal').style.display = 'none';
      }

      async function saveEditSource() {
        const sid = document.getElementById('edit-source-id').value;
        if (!sid) return;

        const payload = {
          source_id: sid,
          name: document.getElementById('edit-name').value,
          url: document.getElementById('edit-url').value,
          category: document.getElementById('edit-category').value,
          feed_type: document.getElementById('edit-feed-type').value,
          country: document.getElementById('edit-country').value,
          language: document.getElementById('edit-language').value,
          source: document.getElementById('edit-source').value,
          scrape_rules: document.getElementById('edit-scrape-rules').value,
          enabled: document.getElementById('edit-enabled').checked ? 1 : 0
        };

        try {
          const resp = await fetch('/api/admin/rss-sources/update', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify(payload)
          });
          const data = await resp.json();
          if (!resp.ok) throw new Error(data.detail || 'Update failed');

          showToast('Update successful!', 'success');
          setTimeout(() => window.location.reload(), 1000); // Reload to reflect changes
        } catch (e) {
          showToast(`Update failed: ${e.message}`, 'error');
        }
      }



    

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



      // === Custom Sources Management ===

      // Global store for custom sources
      window.customSourcesMap = {};

      async function loadCustomSources(tabName) {
        // tabName: 'all' for unified custom sources, or 'api'/'html' for legacy
        let targetBodyId = 'custom-tbody'; // New unified tbody
        if (tabName === 'api') targetBodyId = 'custom-api-tbody';
        if (tabName === 'html') targetBodyId = 'custom-html-tbody';

        const tbody = document.getElementById(targetBodyId);
        if (!tbody) return;

        tbody.innerHTML = '<tr><td colspan="10">加载中...</td></tr>';

        try {
          const res = await fetchWithAuth('/api/custom_sources');
          const data = await res.json();

          if (!Array.isArray(data)) {
            tbody.innerHTML = '<tr><td colspan="10">加载数据出错</td></tr>';
            return;
          }

          // Update global map
          data.forEach(item => {
            window.customSourcesMap[item.id] = item;
          });

          tbody.innerHTML = '';

          // For unified 'all' tab, no filtering needed
          let filtered = data;
          if (tabName === 'api') {
            const isApi = (p) => !['html', 'html_scraper', 'playwright', 'dynamic_py'].includes(p);
            filtered = data.filter(i => isApi(i.provider_type));
          }
          if (tabName === 'html') {
            const isHtml = (p) => ['html', 'html_scraper', 'playwright', 'dynamic_py'].includes(p);
            filtered = data.filter(i => isHtml(i.provider_type));
          }

          if (filtered.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="muted">暂无自定义源，点击上方按钮添加</td></tr>';
            return;
          }

          filtered.forEach((item, idx) => {
            const tr = document.createElement('tr');
            const rowId = `custom-row-${tabName}-${idx}`;
            const detailId = `custom-detail-${tabName}-${idx}`;
            tr.id = rowId;

            // Resolve friendly driver name
            let driverName = item.provider_type;
            let driverClass = 'badge';
            if (driverName === 'http_json') {
              driverName = 'Generic JSON';
              driverClass = 'badge badge-info'; // Blueish
            } else if (driverName === 'html_scraper') {
              driverName = 'Generic HTML';
              driverClass = 'badge badge-ok'; // Greenish
            } else if (driverName === 'html') {
              driverName = 'Playwright';
              driverClass = 'badge badge-warn'; // Orange
            } else {
              // Specific script
              driverClass = 'badge';
              // keep original name e.g. 'caixin', 'tencent_nba'
            }

            // Status badge
            let statusBadge = '';
            if (item.backoff_until && new Date(item.backoff_until) > new Date()) {
              statusBadge = '<span class="badge" style="background:#f59e0b;">BACKOFF</span>';
            } else if (item.last_status === 'success') {
              statusBadge = '<span class="badge badge-ok">OK</span>';
            } else if (item.last_status === 'error') {
              statusBadge = '<span class="badge badge-bad">ERROR</span>';
            } else {
              statusBadge = '<span class="badge badge-off">-</span>';
            }

            if (!item.enabled) {
              statusBadge = '<span class="badge badge-off">DISABLED</span>';
            }

            // Extract URL from config
            let configUrl = '';
            try {
              const config = JSON.parse(item.config_json);
              configUrl = config.url || '';
            } catch (e) { }

            // Name / URL column with tags
            const nameColumn = `
              <div style="font-weight:500; margin-bottom:4px;">${_escapeHtml(item.name)}</div>
              <div class="muted" style="font-size:10px; margin-bottom:4px;">${_escapeHtml(configUrl)}</div>
              <div style="font-size:10px;">
                ${item.country ? `<span class="muted">${item.country}</span>` : ''}
                ${item.language ? `<span class="muted">/ ${item.language}</span>` : ''}
              </div>
            `;

            // Time column
            const addDate = item.created_at ? item.created_at.split(' ')[0] : '-';
            const updDate = item.updated_at ? item.updated_at.split(' ')[0] : '-';
            const timeColumn = `
              <div style="font-size:11px;">Add: ${addDate}</div>
              <div style="font-size:11px; color:#6b7280;">Upd: ${updDate}</div>
            `;

            // Stats column
            const stats = item.stats || {};
            const statsColumn = `
              <div style="font-size:11px;">Entries: ${stats.entries || 0}</div>
              <div style="font-size:11px; color:#6b7280;">Fails: ${stats.fails || 0}</div>
              ${stats.last_update ? `<div style="font-size:10px; color:#9ca3af;">Upd: ${stats.last_update}</div>` : ''}
            `;

            // Latest column (error or last run time)
            let latestColumn = '-';
            if (item.last_error) {
              const errorPreview = item.last_error.length > 30 ? item.last_error.substring(0, 30) + '...' : item.last_error;
              latestColumn = `<div style="color:#dc2626; font-size:10px;" title="${_escapeHtml(item.last_error)}">Err: ${_escapeHtml(errorPreview)}</div>`;
            } else if (item.last_run_at) {
              latestColumn = `<div style="font-size:10px; color:#059669;">${item.last_run_at}</div>`;
            }

            // Icon action buttons
            const actions = `
              <button class="icon-btn" title="Set Category" onclick="openBatchCategoryModal('${item.id}')">📂</button>
              <button class="icon-btn" title="Edit" onclick="editCustomSource('${item.id}', '${tabName}')">✏️</button>
              <button class="icon-btn" title="Run" onclick="runCustomSource('${item.id}', '${tabName}')" style="color:#2563eb;">▶️</button>
              <button class="icon-btn" title="Delete" onclick="deleteCustomSource('${item.id}')" style="color:#dc2626;">🗑️</button>
            `;

            tr.innerHTML = `
              <td><input type="checkbox" class="row-checkbox" data-id="${item.id}"></td>
              <td><button class="expand-btn" onclick="toggleCustomDetail('${item.id}', '${detailId}')">▶</button></td>
              <td>${statusBadge}</td>
              <td>${nameColumn}</td>
              <td><span class="${driverClass}">${driverName}</span></td>
              <td>${item.category ? `<span class="pill">${item.category}</span>` : '-'}</td>
              <td>${timeColumn}</td>
              <td>${statsColumn}</td>
              <td>${latestColumn}</td>
              <td>${actions}</td>
            `;
            tbody.appendChild(tr);

            // Add detail row
            const detailTr = document.createElement('tr');
            detailTr.className = 'detail-row';
            detailTr.id = detailId;
            detailTr.innerHTML = `
              <td colspan="10">
                <div class="detail-content">
                  <div class="muted">Loading...</div>
                </div>
              </td>
            `;
            tbody.appendChild(detailTr);
          });
        } catch (e) {
          tbody.innerHTML = `<tr><td colspan="7">Error: ${e.message}</td></tr>`;
        }
      }

      function filterCustomSources(type) {
        const inputId = type === 'api' ? 'custom-api-search' : 'custom-html-search';
        const tableId = type === 'api' ? 'custom-api-table' : 'custom-html-table';
        const query = document.getElementById(inputId)?.value.toLowerCase();
        if (!query) {
          // Reset visibility
          document.querySelectorAll(`#${tableId} tbody tr`).forEach(tr => tr.style.display = '');
          return;
        }

        document.querySelectorAll(`#${tableId} tbody tr`).forEach(tr => {
          const text = tr.innerText.toLowerCase();
          tr.style.display = text.includes(query) ? '' : 'none';
        });
      }

      async function toggleCustomDetail(sourceId, detailId) {
        const detailRow = document.getElementById(detailId);
        if (!detailRow) return;

        const btn = event.target;

        if (detailRow.classList.contains('show')) {
          // Collapse
          detailRow.classList.remove('show');
          btn.textContent = '▶';
        } else {
          // Expand and load data
          detailRow.classList.add('show');
          btn.textContent = '▼';

          const content = detailRow.querySelector('.detail-content');
          content.innerHTML = '<div class="muted">Loading...</div>';

          try {
            const res = await fetchWithAuth(`/api/custom_sources/${sourceId}/items`);
            const data = await res.json();
            const items = data.items || [];

            if (items.length === 0) {
              content.innerHTML = '<div class="muted">No items found. Click Run to fetch data.</div>';
              return;
            }

            let html = '<div style="font-weight:600; margin-bottom:8px;">Latest 10 Items:</div>';
            html += '<div style="max-height:300px; overflow-y:auto;">';
            items.forEach((item, idx) => {
              html += `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #e5e7eb;">
                <div style="font-size:12px; color:#111827;"><strong>${idx + 1}.</strong> ${_escapeHtml(item.title)}</div>
                <div style="font-size:10px; color:#6b7280; margin-top:2px;">${_escapeHtml(item.url || '')}</div>
                <div style="font-size:10px; color:#9ca3af; margin-top:2px;">Crawl: ${item.crawl_time || '-'}</div>
              </div>`;
            });
            html += '</div>';
            content.innerHTML = html;
          } catch (e) {
            content.innerHTML = `<div style="color:#dc2626;">Error: ${e.message}</div>`;
          }
        }
      }


      function toggleSelectAllCustom(type) {
        const tableId = type === 'api' ? 'custom-api-table' : 'custom-html-table';
        const checkbox = document.getElementById(`custom-${type}-select-all`);
        const checkboxes = document.querySelectorAll(`#${tableId} .row-checkbox`);
        checkboxes.forEach(cb => cb.checked = checkbox.checked);
      }

      async function bulkEnableCustom(type) {
        const tableId = type === 'api' ? 'custom-api-table' : 'custom-html-table';
        const selected = [...document.querySelectorAll(`#${tableId} .row-checkbox:checked`)].map(cb => cb.dataset.id);
        if (selected.length === 0) {
          alert('Please select at least one source');
          return;
        }

        if (!confirm(`Enable ${selected.length} selected sources?`)) return;

        for (const id of selected) {
          try {
            const source = window.customSourcesMap[id];
            if (source) {
              source.enabled = true;
              await fetchWithAuth(`/api/custom_sources/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(source)
              });
            }
          } catch (e) {
            console.error('Failed to enable', id, e);
          }
        }

        loadCustomSources(type);
        alert('Bulk enable complete');
      }

      async function bulkDisableCustom(type) {
        const tableId = type === 'api' ? 'custom-api-table' : 'custom-html-table';
        const selected = [...document.querySelectorAll(`#${tableId} .row-checkbox:checked`)].map(cb => cb.dataset.id);
        if (selected.length === 0) {
          alert('Please select at least one source');
          return;
        }

        if (!confirm(`Disable ${selected.length} selected sources?`)) return;

        for (const id of selected) {
          try {
            const source = window.customSourcesMap[id];
            if (source) {
              source.enabled = false;
              await fetchWithAuth(`/api/custom_sources/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(source)
              });
            }
          } catch (e) {
            console.error('Failed to disable', id, e);
          }
        }

        loadCustomSources(type);
        alert('Bulk disable complete');
      }

      async function detectCustomSourceAI() {
        const url = document.getElementById('edit-custom-magic-url').value.trim();
        if (!url) {
          showToast('Please enter a URL first.', 'warning');
          return;
        }

        // Show loading
        const overlay = document.getElementById('ai-loading-overlay');
        if (overlay) overlay.style.display = 'flex';

        const resDiv = document.getElementById('custom-test-result');

        // Conversation state
        let conversation = [];
        let htmlSnippet = null;
        let attempt = 0;
        const maxAttempts = 10;

        // Progress status helper
        const updateStatus = (msg) => {
          const el = document.getElementById('ai-loading-status');
          if (el) el.innerText = msg;
        };

        // Show AI thinking in result div
        const showThinking = (thinking, attempt) => {
          if (resDiv) {
            resDiv.style.display = 'block';
            resDiv.innerHTML += `
                    <div style="margin-top:10px; padding:10px; background:#f0f9ff; border-radius:6px; border-left:3px solid #3b82f6;">
                        <div style="font-weight:600; color:#1e40af;">🤖 AI 思考 (第 ${attempt} 轮):</div>
                        <div style="color:#334155; margin-top:4px; white-space:pre-wrap;">${thinking}</div>
                    </div>
                `;
            resDiv.scrollTop = resDiv.scrollHeight;
          }
        };

        try {
          while (attempt < maxAttempts) {
            attempt++;

            // Get current state from UI
            const currentProvider = document.getElementById('edit-custom-provider').value;
            const currentConfig = document.getElementById('edit-custom-config').value;
            const currentScript = document.getElementById('edit-custom-script-content').value;

            // Determine if this is first attempt or retry
            let testError = null;
            if (attempt > 1) {
              // Run test first to get error
              updateStatus(`测试中 (第 ${attempt} 轮)...`);
              const payload = _getTestPayloadFromUI();
              const testRes = await _runTest(payload);

              if (testRes.success && testRes.items_count > 0) {
                // Success!
                if (resDiv) {
                  resDiv.innerHTML += `
                            <div style="margin-top:10px; padding:15px; background:#dcfce7; border-radius:6px; border-left:3px solid #22c55e;">
                                <div style="font-weight:700; color:#166534; font-size:16px;">🎉 成功!</div>
                                <div style="color:#166534; margin-top:4px;">抓取到 ${testRes.items_count} 条数据</div>
                            </div>
                        `;
                }
                showToast(`成功! 抓取到 ${testRes.items_count} 条数据`, 'success');
                return;
              }

              testError = testRes.success ? `Found 0 items` : testRes.error;

              if (resDiv) {
                resDiv.innerHTML += `
                        <div style="margin-top:10px; padding:10px; background:#fef2f2; border-radius:6px; border-left:3px solid #ef4444;">
                            <div style="font-weight:600; color:#991b1b;">❌ 测试失败 (第 ${attempt - 1} 轮):</div>
                            <div style="color:#7f1d1d; margin-top:4px;">${testError}</div>
                        </div>
                    `;
              }
            }

            // Call AI Debug endpoint
            updateStatus(`AI 分析中 (第 ${attempt} 轮)...`);

            const aiPayload = {
              url: url,
              html_snippet: htmlSnippet,
              conversation: conversation,
              current_config: currentConfig,
              current_script: currentScript,
              current_provider: currentProvider,
              test_error: testError
            };

            const resp = await fetchWithAuth('/api/custom_sources/ai_debug', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(aiPayload)
            });

            if (!resp.ok) {
              const err = await resp.json();
              throw new Error(err.detail || 'AI Debug failed');
            }

            const aiData = await resp.json();

            // Cache HTML snippet for future calls
            if (aiData.html_snippet) htmlSnippet = aiData.html_snippet;

            // Show AI thinking
            if (aiData.thinking) {
              showThinking(aiData.thinking, attempt);
            }

            // Update conversation history
            if (testError) {
              conversation.push({ role: 'user', content: `Test failed: ${testError}` });
            }
            if (aiData.assistant_message) {
              conversation.push({ role: 'assistant', content: aiData.assistant_message });
            }

            // Apply to UI
            _applyDataToUI(aiData);

            // If first attempt, immediately test
            if (attempt === 1) {
              continue; // Go to next iteration which will test
            }

            // Check confidence - if very low, maybe stop
            if (aiData.confidence && aiData.confidence <= 2 && attempt >= 3) {
              showToast('AI 信心不足，请手动检查配置', 'warning');
              break;
            }
          }

          // Max attempts reached
          if (resDiv) {
            resDiv.innerHTML += `
                  <div style="margin-top:10px; padding:15px; background:#fef3c7; border-radius:6px; border-left:3px solid #f59e0b;">
                      <div style="font-weight:700; color:#92400e;">⚠️ 已达最大尝试次数</div>
                      <div style="color:#92400e; margin-top:4px;">AI 已尝试 ${maxAttempts} 次，请检查生成的配置或手动调整</div>
                  </div>
              `;
          }
          showToast('已达最大尝试次数，请手动检查', 'warning');

        } catch (e) {
          console.error(e);
          showToast('Error: ' + e.message, 'error');
          if (resDiv) {
            resDiv.style.display = 'block';
            resDiv.innerHTML += `<div style="color:red; margin-top:10px;">❌ 错误: ${e.message}</div>`;
          }
        } finally {
          if (overlay) overlay.style.display = 'none';
        }
      }

      // --- Loop Helpers ---
      async function _fetchDetect(url) {
        const resp = await fetchWithAuth('/api/custom_sources/detect', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: url })
        });
        if (!resp.ok) throw new Error((await resp.json()).detail || 'Detect failed');
        return await resp.json();
      }

      async function _runTest(payload) {
        const resp = await fetchWithAuth('/api/custom_sources/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) {
          try {
            const e = await resp.json();
            return { success: false, error: e.detail || 'Test failed' };
          } catch (x) {
            return { success: false, error: resp.statusText };
          }
        }
        return await resp.json();
      }

      async function _fetchAutofix(payload) {
        const resp = await fetchWithAuth('/api/custom_sources/autofix', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!resp.ok) throw new Error((await resp.json()).detail || 'Autofix failed');
        return await resp.json();
      }

      function _getTestPayloadFromUI() {
        return {
          provider_type: document.getElementById('edit-custom-provider').value,
          config_json: document.getElementById('edit-custom-config').value,
          script_content: document.getElementById('edit-custom-script-content').value
        };
      }

      function _applyDataToUI(data) {
        if (data.provider_type) {
          const pSelect = document.getElementById('edit-custom-provider');
          if (pSelect) {
            let exists = false;
            for (let i = 0; i < pSelect.options.length; i++) {
              if (pSelect.options[i].value === data.provider_type) {
                exists = true; break;
              }
            }
            if (!exists) {
              const opt = document.createElement('option');
              opt.value = data.provider_type;
              opt.text = data.provider_type;
              pSelect.add(opt);
            }
            pSelect.value = data.provider_type;
            if (typeof onProviderChange === 'function') onProviderChange();
          }
        }
        if (data.config_json) document.getElementById('edit-custom-config').value = data.config_json;
        if (data.script_content) document.getElementById('edit-custom-script-content').value = data.script_content;

        if (data.name_suggestion && !document.getElementById('edit-custom-name').value) {
          document.getElementById('edit-custom-name').value = data.name_suggestion;
        }
        // Assuming meta helps
        const setIfEmpty = (id, val) => {
          const el = document.getElementById(id);
          if (el && !el.value && val) el.value = val;
        };
        setIfEmpty('edit-custom-category', data.category_suggestion);
        setIfEmpty('edit-custom-country', data.country_suggestion);
        setIfEmpty('edit-custom-language', data.language_suggestion);
        setIfEmpty('edit-custom-cron', data.cron_suggestion);
      }

      function onProviderChange() {
        const val = document.getElementById('edit-custom-provider').value;
        const configDiv = document.getElementById('editor-config-json');
        const scriptDiv = document.getElementById('editor-script-py');

        if (val === 'dynamic_py') {
          configDiv.style.display = 'none';
          scriptDiv.style.display = 'block';
        } else {
          configDiv.style.display = 'block';
          scriptDiv.style.display = 'none';
        }
      }

      function openEditCustomSourceModal(type) {
        // type: 'api' or 'html'
        window.currentEditTab = type; // Save context

        document.getElementById('edit-custom-id-original').value = '';
        document.getElementById('edit-custom-id').value = '';
        document.getElementById('edit-custom-id').disabled = false;
        document.getElementById('edit-custom-name').value = '';
        document.getElementById('edit-custom-category').value = '';
        document.getElementById('edit-custom-country').value = '';
        document.getElementById('edit-custom-language').value = '';
        document.getElementById('edit-custom-magic-url').value = '';

        // Reset AI summary
        document.getElementById('ai-detected-summary').style.display = 'none';

        // Populate options based on type
        const pSelect = document.getElementById('edit-custom-provider');
        if (pSelect) {
          pSelect.innerHTML = '';
          if (type === 'api') {
            pSelect.innerHTML = `
                <option value="http_json">Generic JSON Scraper</option>
                <option value="dynamic_py">Dynamic Python Script (New!)</option>
                <option value="tencent_nba">NBA (Python Script)</option>
                <option value="caixin">Caixin (Python Script)</option>
            `;
          } else {
            pSelect.innerHTML = `
                <option value="html_scraper">Generic HTML Scraper</option>
                <option value="playwright">Playwright Scraper (Headless)</option>
                <option value="dynamic_py">Dynamic Python Script (New!)</option>
            `;
          }
        }

        // Reset editors
        document.getElementById('edit-custom-config').value = '{\n  "url": "",\n  "scrape_rules": {\n    "items": "",\n    "title": "",\n    "link": "",\n    "date": ""\n  }\n}';
        document.getElementById('edit-custom-script-content').value = '';

        onProviderChange(); // Update visibility

        document.getElementById('edit-custom-cron').value = '';
        document.getElementById('edit-custom-enabled').checked = true;
        document.getElementById('custom-test-result').style.display = 'none';

        const m = document.getElementById('edit-source-modal');
        if (m) m.style.display = 'flex';
      }

      function editCustomSource(id, type) {
        window.currentEditTab = type;
        const item = window.customSourcesMap[id];
        if (!item) {
          showToast('Item not found', 'error');
          return;
        }

        document.getElementById('edit-custom-id-original').value = item.id;
        document.getElementById('edit-custom-id').value = item.id;
        document.getElementById('edit-custom-id').disabled = true;
        document.getElementById('edit-custom-name').value = item.name;
        document.getElementById('edit-custom-category').value = item.category || '';
        document.getElementById('edit-custom-country').value = item.country || '';
        document.getElementById('edit-custom-language').value = item.language || '';
        document.getElementById('edit-custom-magic-url').value = '';

        // Repopulate select to make sure current provider is there
        const pSelect = document.getElementById('edit-custom-provider');
        let options = '';
        if (['http_json', 'tencent_nba', 'caixin', 'custom', 'dynamic_py'].includes(item.provider_type) || type === 'api' || !['html_scraper', 'playwright'].includes(item.provider_type)) {
          // Default API set if unknown or explicitly API type
          options = `
                <option value="http_json">Generic JSON Scraper</option>
                <option value="dynamic_py">Dynamic Python Script (New!)</option>
                <option value="tencent_nba">NBA (Python Script)</option>
                <option value="caixin">Caixin (Python Script)</option>
           `;
        } else {
          // HTML set
          options = `
                <option value="html_scraper">Generic HTML Scraper</option>
                <option value="playwright">Playwright Scraper (Headless)</option>
                <option value="dynamic_py">Dynamic Python Script (New!)</option>
            `;
        }

        // If the current provider is not in the standard list, add it dynamically so it's preserved
        const standardValues = ['http_json', 'tencent_nba', 'caixin', 'html_scraper', 'playwright', 'dynamic_py'];
        if (!standardValues.includes(item.provider_type)) {
          options += `<option value="${item.provider_type}">${item.provider_type} (Custom)</option>`;
        }

        pSelect.innerHTML = options;
        pSelect.value = item.provider_type || (type === 'api' ? 'http_json' : 'html_scraper');

        // Load Script Content
        document.getElementById('edit-custom-script-content').value = item.script_content || '';

        document.getElementById('edit-custom-config').value = item.config_json; // already string
        try {
          // Format JSON nicely
          const parsed = JSON.parse(item.config_json);
          document.getElementById('edit-custom-config').value = JSON.stringify(parsed, null, 2);
        } catch (e) { }

        onProviderChange(); // Update visibility

        document.getElementById('edit-custom-cron').value = item.schedule_cron || '';
        document.getElementById('edit-custom-enabled').checked = item.enabled;
        document.getElementById('custom-test-result').style.display = 'none';

        const modal = document.getElementById('edit-source-modal');
        modal.style.display = 'flex';
      }

      function closeCustomSourceModal() {
        document.getElementById('edit-source-modal').style.display = 'none';
      }

      async function saveCustomSource() {
        const originalId = document.getElementById('edit-custom-id-original').value;
        let id = document.getElementById('edit-custom-id').value.trim();
        let name = document.getElementById('edit-custom-name').value.trim();
        const category = document.getElementById('edit-custom-category').value.trim();
        const country = document.getElementById('edit-custom-country').value.trim();
        const language = document.getElementById('edit-custom-language').value.trim();
        const provider = document.getElementById('edit-custom-provider').value;
        const configStr = document.getElementById('edit-custom-config').value;
        let cron = document.getElementById('edit-custom-cron').value.trim(); // Defaults below
        const enabled = document.getElementById('edit-custom-enabled').checked;

        const scriptContent = document.getElementById('edit-custom-script-content').value;

        // Auto-generate ID if empty (and not updating)
        if (!id) {
          id = 'custom_' + Math.random().toString(36).substring(2, 9);
        }

        // Auto-generate Name if empty
        if (!name) {
          try {
            const cfg = JSON.parse(configStr || '{}');
            if (cfg.url) {
              // Try to use hostname
              const u = new URL(cfg.url);
              name = u.hostname.replace('www.', '');
            } else if (cfg.scrape_rules && cfg.scrape_rules.items) {
              name = "Scraper " + new Date().toISOString().split('T')[0];
            }
          } catch (e) { }

          if (!name) {
            name = "New Source " + new Date().toLocaleTimeString();
          }
        }

        // Default cron
        if (!cron) {
          cron = "*/30 * * * *";
        }



        try {
          JSON.parse(configStr);
        } catch (e) {
          showToast('Invalid JSON Config', 'error');
          return;
        }

        const payload = {
          id: id,
          name: name,
          category: category,
          country: country,
          language: language,
          provider_type: provider,
          config_json: configStr,
          script_content: scriptContent, // Add script content
          enabled: enabled,
          schedule_cron: cron
        };

        try {
          let res;
          if (originalId) {
            // Update
            res = await fetchWithAuth(`/api/custom_sources/${originalId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          } else {
            // Create
            res = await fetchWithAuth('/api/custom_sources', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
          }

          if (res.ok) {
            const savedData = await res.json();
            const savedId = savedData.id || id;

            showToast('保存成功！正在自动抓取...', 'success');
            closeCustomSourceModal();
            loadCustomSources(window.currentEditTab); // Refresh correct tab

            // Auto-run fetch after save
            try {
              const runRes = await fetchWithAuth(`/api/custom_sources/${savedId}/run`, { method: 'POST' });
              if (runRes.ok) {
                const runData = await runRes.json();
                showToast(`抓取完成! 获取到 ${runData.items_count || 0} 条数据`, 'success');
              } else {
                const err = await runRes.json();
                showToast('自动抓取失败: ' + (err.detail || err.error), 'warning');
              }
            } catch (runErr) {
              console.error('Auto-run failed:', runErr);
              showToast('自动抓取失败: ' + runErr.message, 'warning');
            }
          } else {
            const err = await res.json();
            showToast('Error: ' + err.detail, 'error');
          }
        } catch (e) {
          showToast('Request failed: ' + e.message, 'error');
        }
      }

      async function magicDetectCustomSource() {
        const urlInput = document.getElementById('edit-custom-magic-url');
        const url = (urlInput?.value || '').trim();
        if (!url) {
          showToast('请输入 URL', 'warning');
          return;
        }

        const btn = document.getElementById('btn-magic-detect');
        const originalText = btn.innerText;
        btn.disabled = true;
        btn.innerText = '检测中...';

        try {
          const resp = await fetch(`/api/custom_sources/detect?token=${encodeURIComponent(token)}`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Admin-Token': token
            },
            body: JSON.stringify({ url: url })
          });

          if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || '检测失败');
          }

          const data = await resp.json();

          // Populate fields
          if (data.provider_type) {
            const pSelect = document.getElementById('edit-custom-provider');
            if (pSelect) {
              let exists = false;
              for (let i = 0; i < pSelect.options.length; i++) {
                if (pSelect.options[i].value === data.provider_type) {
                  exists = true;
                  break;
                }
              }
              if (!exists) {
                const opt = document.createElement('option');
                opt.value = data.provider_type;
                opt.text = data.provider_type;
                pSelect.add(opt);
              }
              pSelect.value = data.provider_type;
              // Trigger change logic to show/hide correct editors
              if (typeof onProviderChange === 'function') {
                onProviderChange();
              }
            }
          }

          if (data.script_content) {
            document.getElementById('edit-custom-script-content').value = data.script_content;
          }


          if (data.config_json) {
            document.getElementById('edit-custom-config').value = data.config_json;
          }

          if (data.name_suggestion && !document.getElementById('edit-custom-name').value) {
            document.getElementById('edit-custom-name').value = data.name_suggestion;
          }

          if (data.id_suggestion && !document.getElementById('edit-custom-id').value) {
            document.getElementById('edit-custom-id').value = data.id_suggestion;
          }
          if (data.category_suggestion && !document.getElementById('edit-custom-category').value) {
            document.getElementById('edit-custom-category').value = data.category_suggestion;
          }
          if (data.country_suggestion && !document.getElementById('edit-custom-country').value) {
            document.getElementById('edit-custom-country').value = data.country_suggestion;
          }
          if (data.language_suggestion && !document.getElementById('edit-custom-language').value) {
            document.getElementById('edit-custom-language').value = data.language_suggestion;
          }
          if (data.cron_suggestion && !document.getElementById('edit-custom-cron').value) {
            document.getElementById('edit-custom-cron').value = data.cron_suggestion;
          }

          showToast('✨ 配置已自动生成', 'success');
        } catch (e) {
          showToast(e.message, 'error');
        } finally {
          btn.disabled = false;
          btn.innerText = originalText;
        }
      }

      async function deleteCustomSource(id) {
        if (!confirm('Are you sure you want to delete ' + id + '?')) return;
        try {
          const res = await fetchWithAuth(`/api/custom_sources/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showToast('Deleted', 'success');
            loadCustomSources(window.currentEditTab);
          } else {
            showToast('Delete failed', 'error');
          }
        } catch (e) {
          showToast('Request failed', 'error');
        }
      }

      async function runCustomSource(id, type) {
        try {
          showToast('Running ' + id + '...', 'info');
          const res = await fetchWithAuth(`/api/custom_sources/${id}/run`, { method: 'POST' });
          if (res.ok) {
            const data = await res.json();
            showToast(`Run Success! Fetched ${data.items_count} items.`, 'success');
            loadCustomSources(type);
          } else {
            const err = await res.json();
            showToast(`Run Failed: ${err.detail}`, 'error');
            loadCustomSources(type); // To update error status
          }
        } catch (e) {
          showToast('Request failed: ' + e.message, 'error');
        }
      }


      async function testCustomSource() {
        const provider = document.getElementById('edit-custom-provider').value;
        const configStr = document.getElementById('edit-custom-config').value;
        const resDiv = document.getElementById('custom-test-result');

        resDiv.style.display = 'block';
        resDiv.innerHTML = '<div style="color:#6b7280;">Testing...</div>';

        try {
          const res = await fetchWithAuth('/api/custom_sources/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              provider_type: provider,
              config_json: configStr,
              script_content: document.getElementById('edit-custom-script-content').value
            })
          });
          const data = await res.json();

          // Format result nicely
          if (data.success && data.items_count > 0) {
            const count = data.items_count || 0;
            const items = data.items || [];

            let html = `<div style="margin-bottom:10px;">
              <strong style="color:#059669;">✓ 测试成功</strong> - 抓取到 <strong>${count}</strong> 条数据
            </div>`;

            // Show warning if present
            if (data.warning) {
              html += `<div style="margin-bottom:10px; padding:8px; background:#fef3c7; border-left:3px solid #f59e0b; color:#92400e; font-size:11px;">
                ⚠️ ${_escapeHtml(data.warning)}
              </div>`;
            }

            if (items.length > 0) {
              html += '<div style="font-weight:600; margin-top:10px; margin-bottom:6px;">前 ' + Math.min(5, items.length) + ' 条示例：</div>';
              html += '<div style="border-left:2px solid #2563eb; padding-left:10px;">';
              items.slice(0, 5).forEach((item, idx) => {
                html += `<div style="margin-bottom:8px; font-size:11px;">
                  <div style="color:#374151;"><strong>${idx + 1}.</strong> ${_escapeHtml(item.title || 'No title')}</div>
                  <div style="color:#6b7280; font-size:10px; margin-top:2px;">${_escapeHtml(item.url || '')}</div>
                </div>`;
              });
              html += '</div>';
            }

            resDiv.innerHTML = html;
          } else if (data.success && data.items_count === 0) {
            // 0 items is a failure
            resDiv.innerHTML = `<div style="color:#dc2626; padding:10px;">
              <strong>✗ 测试失败</strong> - 抓取到 0 条数据<br>
              <span style="font-size:11px; color:#7f1d1d;">CSS 选择器可能不正确，或者页面结构与预期不同</span>
            </div>`;
          } else {
            resDiv.innerHTML = `<div style="color:#dc2626;"><strong>✗ 测试失败</strong><br>${_escapeHtml(data.error || 'Unknown error')}</div>`;
          }
        } catch (e) {
          resDiv.innerHTML = `<div style="color:#dc2626;"><strong>✗ 错误:</strong> ${_escapeHtml(e.message)}</div>`;
        }
      }

      // Hook into tab switching to load data (moved to initTabs)

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

    

      // === Unified Platform Management ===
      let unifiedPlatforms = [];
      let unifiedCategories = [];
      let currentBatchIds = [];

      async function loadUnifiedData() {
        await Promise.all([loadCategories(), loadUnifiedPlatforms()]);
      }

      // ... (rest of the functions but I don't want to re-paste everything if I can avoid it)
      // Actually I should just re-paste the whole block to be safe and clean.

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

          // Add other option for fallback
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
          // Strict category filter? or permissive? 
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

          // Find category display name
          let catName = p.category || '-';
          const cat = unifiedCategories.find(c => c.id === p.category);
          if (cat) catName = `${cat.icon} ${cat.name}`;

          // Type badge
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

        // Reset select all
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
          // Default to Unified table selection
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

          // Smart reload based on active tab
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
