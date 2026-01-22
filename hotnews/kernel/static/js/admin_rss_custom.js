// === Custom Sources Management ===

// Global store for custom sources
window.customSourcesMap = {};
// Global AI History Store
window.CUSTOM_SOURCE_AI_HISTORY = {};
// Global AI Detection Abort Controller
let aiDetectionAbortController = null;

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
              <div style="font-weight:500; margin-bottom:4px;">
                ${_escapeHtml(item.name)}
                ${item.use_scraperapi ? '<span class="badge" style="background:#f59e0b; color:#fff; font-size:10px; padding:2px 6px; margin-left:4px;" title="使用 ScraperAPI">🔒 API</span>' : ''}
                ${item.use_socks_proxy ? '<span class="badge" style="background:#8b5cf6; color:#fff; font-size:10px; padding:2px 6px; margin-left:4px;" title="使用 Socks5 代理">🌐 Socks5</span>' : ''}
              </div>
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
              <button class="icon-btn" title="Edit" onclick="editCustomSource('${item.id}', '${tabName}')">✏️</button>
              <button class="icon-btn" title="Run" onclick="runCustomSource('${item.id}', '${tabName}')" style="color:#2563eb;">▶️</button>
              <button class="icon-btn" title="${item.enabled ? 'Disable' : 'Enable'}" onclick="toggleCustomSourceEnabled('${item.id}', ${item.enabled}, '${tabName}')">
                ${item.enabled ? '✅' : '⛔'}
              </button>
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
  const inputId = type === 'api' ? 'custom-api-search' : (type === 'html' ? 'custom-html-search' : 'custom-search');
  const query = document.getElementById(inputId)?.value.toLowerCase() || '';

  // Get filter values
  const categoryFilter = document.getElementById('custom-filter-category')?.value || '';
  const statusFilter = document.getElementById('custom-filter-status')?.value || '';

  const tableId = type === 'api' ? 'custom-api-table' : (type === 'html' ? 'custom-html-table' : 'custom-table');
  const tbodyId = type === 'api' ? 'custom-api-tbody' : (type === 'html' ? 'custom-html-tbody' : 'custom-tbody');

  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  const rows = tbody.querySelectorAll('tr:not(.detail-row)');
  rows.forEach(tr => {
    const text = tr.innerText.toLowerCase();
    const sourceId = tr.querySelector('input.row-checkbox')?.dataset?.id;
    const source = window.customSourcesMap[sourceId];

    if (!source) {
      tr.style.display = '';
      return;
    }

    let visible = true;

    // Text search
    if (query && !text.includes(query)) {
      visible = false;
    }

    // Category filter
    if (visible && categoryFilter) {
      const sourceCategory = (source.category || '').toLowerCase();
      if (sourceCategory !== categoryFilter.toLowerCase()) {
        visible = false;
      }
    }

    // Status filter
    if (visible && statusFilter) {
      const now = new Date();
      const backoffUntil = source.backoff_until ? new Date(source.backoff_until) : null;
      const hasError = source.last_status === 'error' || source.last_error;
      const isBackoff = backoffUntil && backoffUntil > now;

      if (statusFilter === 'enabled' && !source.enabled) visible = false;
      if (statusFilter === 'disabled' && source.enabled) visible = false;
      if (statusFilter === 'error' && !hasError) visible = false;
      if (statusFilter === 'backoff' && !isBackoff) visible = false;
    }

    tr.style.display = visible ? '' : 'none';

    // Also hide/show corresponding detail row
    const detailRow = tr.nextElementSibling;
    if (detailRow && detailRow.classList.contains('detail-row')) {
      detailRow.style.display = visible ? detailRow.style.display : 'none';
    }
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
        html += `<div style="margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #e5e7eb; display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <div style="font-size:12px; color:#111827;">
                        <strong>${idx + 1}.</strong> 
                        <span id="title-text-${item.id}">${_escapeHtml(item.title)}</span>
                    </div>
                    <div style="font-size:10px; color:#6b7280; margin-top:2px;">${_escapeHtml(item.url || '')}</div>
                    <div style="font-size:10px; color:#9ca3af; margin-top:2px;">Crawl: ${item.crawl_time || '-'}</div>
                </div>
                <button class="icon-btn" style="margin-left:8px;" onclick="editCustomItemTitle(${item.id}, '${sourceId}', '${detailId}')" title="Rename">✏️</button>
              </div>`;
      });
      html += '</div>';
      content.innerHTML = html;
    } catch (e) {
      content.innerHTML = `<div style="color:#dc2626;">Error: ${e.message}</div>`;
    }
  }
}

async function editCustomItemTitle(itemId, sourceId, detailId) {
  const span = document.getElementById(`title-text-${itemId}`);
  if (!span) return;

  const oldTitle = span.innerText;
  const newTitle = prompt("Edit Title:", oldTitle);

  if (newTitle !== null && newTitle.trim() !== "" && newTitle !== oldTitle) {
    try {
      const res = await fetchWithAuth(`/api/custom_sources/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle.trim() })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Update failed");
      }

      // Reload detail to show updates
      // Hacky: Close and reopen or just reload list?
      // Let's just update UI locally for speed
      span.innerText = newTitle.trim();
      showToast("Title updated", "success");

    } catch (e) {
      alert("Error updating title: " + e.message);
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

// Open batch category modal for custom sources
async function openBatchCategoryModalCustom() {
  // Get selected custom source IDs
  const selected = [...document.querySelectorAll('#custom-table .row-checkbox:checked')].map(cb => cb.dataset.id);

  if (selected.length === 0) {
    showToast('请至少选择一个自定义源', 'error');
    return;
  }

  // Store selected IDs for batch update
  window.pendingCustomCategoryIds = selected;

  // Show modal (reuse existing batch-cat-modal)
  const modal = document.getElementById('batch-cat-modal');
  if (!modal) {
    alert('批量设置栏目模态框未找到');
    return;
  }

  modal.style.display = 'block';

  // Set context flag
  window.batchCategoryContext = 'custom';
}


function clearCustomSourceMemory() {
  const url = document.getElementById('edit-custom-magic-url').value.trim();
  if (!url) return;

  if (window.CUSTOM_SOURCE_AI_HISTORY && window.CUSTOM_SOURCE_AI_HISTORY[url]) {
    delete window.CUSTOM_SOURCE_AI_HISTORY[url];
    showToast('AI Memory cleared for this URL.', 'success');

    // Also clear UI log
    const resDiv = document.getElementById('custom-test-result');
    if (resDiv) resDiv.innerHTML = '<div class="muted">Memory cleared. Ready to start fresh.</div>';
  } else {
    showToast('No memory found for this URL.', 'info');
  }
}

async function detectCustomSourceAI() {
  const url = document.getElementById('edit-custom-magic-url').value.trim();
  const objective = document.getElementById('edit-custom-objective').value.trim();
  if (!url) {
    showToast('Please enter a URL first.', 'warning');
    return;
  }

  // Show loading
  const overlay = document.getElementById('ai-loading-overlay');
  if (overlay) overlay.style.display = 'flex';

  const resDiv = document.getElementById('custom-test-result');

  // Converstation state - USE GLOBAL HISTORY
  window.CUSTOM_SOURCE_AI_HISTORY = window.CUSTOM_SOURCE_AI_HISTORY || {};

  // If we have history for this URL, reuse it (Memory Persistence)
  let conversation = window.CUSTOM_SOURCE_AI_HISTORY[url] || [];

  if (conversation.length > 0) {
    updateStatus(`Resuming analysis with existing memory (${conversation.length} messages)...`);
  }

  let htmlSnippet = null;
  let attempt = 0;
  const maxAttempts = 5; // Reduced from 10 for faster feedback
  let lastExecutionLogs = ""; // Store logs from last test execution

  // Setup abort controller for cancellation
  aiDetectionAbortController = new AbortController();
  const signal = aiDetectionAbortController.signal;

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
      // Check if cancelled
      if (signal.aborted) {
        showToast('AI 分析已取消', 'info');
        if (resDiv) {
          resDiv.innerHTML += `<div style="margin-top:10px; padding:10px; background:#e5e7eb; border-radius:6px;">🛑 用户已取消分析</div>`;
        }
        break;
      }
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
          // Validate data quality - check if items look real
          const items = testRes.items || [];
          const validItems = items.filter(item => {
            const hasTitle = item.title && item.title.length > 2;
            const hasUrl = item.url && (item.url.startsWith('http') || item.url.startsWith('/'));
            const notDebug = !String(item.title || '').toLowerCase().includes('[debug]');
            return hasTitle && hasUrl && notDebug;
          });

          // Need at least 3 valid items or 50% valid rate
          const isQualityOk = validItems.length >= 3 || (validItems.length / items.length >= 0.5);

          if (isQualityOk) {
            // Success!
            if (resDiv) {
              resDiv.innerHTML += `
                              <div style="margin-top:10px; padding:15px; background:#dcfce7; border-radius:6px; border-left:3px solid #22c55e;">
                                  <div style="font-weight:700; color:#166534; font-size:16px;">🎉 成功!</div>
                                  <div style="color:#166534; margin-top:4px;">抓取到 ${testRes.items_count} 条数据 (${validItems.length} 条有效)</div>
                              </div>
                          `;
            }
            showToast(`成功! 抓取到 ${testRes.items_count} 条数据`, 'success');
            return;
          } else {
            // Low quality data, treat as failure
            testError = `数据质量不足: ${validItems.length}/${items.length} 条有效`;
          }
        }

        if (testRes.logs) {
          lastExecutionLogs = testRes.logs;
        }

        testError = testRes.success ? `Found 0 items` : testRes.error;

        if (resDiv) {
          let logHtml = "";
          if (testRes.logs) {
            logHtml = `<div style="margin-top:8px; padding:8px; background:#1e1e1e; color:#d4d4d4; font-family:monospace; font-size:11px; max-height:150px; overflow-y:auto; border-radius:4px;"><strong>Stdout Logs:</strong><br>${_escapeHtml(testRes.logs)}</div>`;
          }
          resDiv.innerHTML += `
                        <div style="margin-top:10px; padding:10px; background:#fef2f2; border-radius:6px; border-left:3px solid #ef4444;">
                            <div style="font-weight:600; color:#991b1b;">❌ 测试失败 (第 ${attempt - 1} 轮):</div>
                            <div style="color:#7f1d1d; margin-top:4px;">${testError}</div>
                            ${logHtml}
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
        current_config: currentConfig,
        current_script: currentScript,
        current_provider: currentProvider,
        test_error: testError,
        current_provider: currentProvider,
        test_error: testError,
        user_objective: objective,
        execution_logs: lastExecutionLogs
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

      // Memory Persistence: Save to global history
      window.CUSTOM_SOURCE_AI_HISTORY[url] = conversation;

      // Apply to UI
      _applyDataToUI(aiData);

      // If first attempt, immediately test
      if (attempt === 1) {
        continue; // Go to next iteration which will test
      }

      // Check if backend suggests stopping
      if (aiData.should_stop) {
        showToast(aiData.stop_reason || 'AI 建议停止，请手动检查', 'warning');
        break;
      }

      // Check confidence - if very low, maybe stop
      if (aiData.confidence && aiData.confidence <= 2 && attempt >= 2) {
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
    aiDetectionAbortController = null; // Clear controller
  }
}

// Cancel AI detection function
function cancelAIDetection() {
  if (aiDetectionAbortController) {
    aiDetectionAbortController.abort();
    showToast('正在取消...', 'info');
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
    script_content: document.getElementById('edit-custom-script-content').value,
    use_scraperapi: document.getElementById('edit-custom-use-scraperapi')?.checked || false
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

  if (data.name_suggestion && !document.getElementById('edit-custom-source-name').value) {
    document.getElementById('edit-custom-source-name').value = data.name_suggestion;
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
  document.getElementById('edit-custom-source-name').value = '';
  document.getElementById('edit-custom-category').value = '深入探索';
  document.getElementById('edit-custom-country').value = '';
  document.getElementById('edit-custom-language').value = '';
  document.getElementById('edit-custom-magic-url').value = '';
  if (document.getElementById('edit-custom-objective')) {
    document.getElementById('edit-custom-objective').value = '';
  }

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
  document.getElementById('edit-custom-use-scraperapi').checked = false;
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
  document.getElementById('edit-custom-source-name').value = item.name;
  document.getElementById('edit-custom-category').value = item.category || '深入探索';
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
  document.getElementById('edit-custom-use-scraperapi').checked = item.use_scraperapi || false;
  document.getElementById('edit-custom-use-socks-proxy').checked = item.use_socks_proxy || false;
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
  let name = document.getElementById('edit-custom-source-name').value.trim();
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
    schedule_cron: cron,
    use_scraperapi: document.getElementById('edit-custom-use-scraperapi').checked,
    use_socks_proxy: document.getElementById('edit-custom-use-socks-proxy').checked
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

    if (data.name_suggestion && !document.getElementById('edit-custom-source-name').value) {
      document.getElementById('edit-custom-source-name').value = data.name_suggestion;
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

async function toggleCustomSourceEnabled(id, currentStatus, tabName) {
  const newStatus = !currentStatus;
  try {
    const source = window.customSourcesMap[id];
    if (source) {
      source.enabled = newStatus;
      const res = await fetchWithAuth(`/api/custom_sources/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(source)
      });

      if (res.ok) {
        showToast(newStatus ? 'Enabled' : 'Disabled', 'success');
        loadCustomSources(tabName);
      } else {
        const err = await res.json();
        showToast('Failed to update: ' + err.detail, 'error');
        // Revert local change if failed
        source.enabled = currentStatus;
      }
    }
  } catch (e) {
    console.error('Failed to toggle', id, e);
    showToast('Failed to toggle: ' + e.message, 'error');
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
        script_content: document.getElementById('edit-custom-script-content').value,
        use_scraperapi: document.getElementById('edit-custom-use-scraperapi').checked ? 1 : 0
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

// Batch ScraperAPI toggle for Custom sources
async function bulkSetScraperAPICustom(enableScraperAPI) {
  const selected = [...document.querySelectorAll('.row-checkbox:checked')].map(cb => cb.dataset.id);
  if (selected.length === 0) {
    alert('请先选择源');
    return;
  }

  const label = enableScraperAPI ? '启用' : '禁用';
  const ok = confirm(`批量${label} ScraperAPI？\n已选择: ${selected.length} 个源`);
  if (!ok) return;

  try {
    const payload = {
      platform_ids: selected,  // Custom sources don't need prefix
      use_scraperapi: enableScraperAPI
    };

    const resp = await fetchWithAuth('/api/platform/batch-scraperapi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      throw new Error(data?.detail || `Failed (${resp.status})`);
    }

    showToast(`✅ 已${label} ${selected.length} 个源的 ScraperAPI`, 'success');

    // Reload to reflect changes
    setTimeout(() => window.location.reload(), 1000);
  } catch (e) {
    showToast(`❌ 操作失败: ${e.message}`, 'error');
  }
}

