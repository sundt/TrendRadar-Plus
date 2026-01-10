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



    


      // === Unified Platform Management ===

