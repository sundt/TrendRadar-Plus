/**
 * Admin Featured MPs (精选公众号) Management
 * Embedded version for admin_rss_sources.html
 */

// WeChat icon SVG (green, small for avatar placeholder)
const FMP_WECHAT_ICON_SMALL = `<svg viewBox="0 0 24 24" fill="#07c160" width="20" height="20"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>`;

// WeChat icon SVG (green, large for empty state)
const FMP_WECHAT_ICON_LARGE = `<svg viewBox="0 0 24 24" fill="#07c160" width="48" height="48"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>`;

let fmpCurrentPreviewId = null;
let fmpPreviewItems = [];
let fmpLastSearchTime = 0;
const FMP_SEARCH_INTERVAL = 3000; // 3 seconds

// ========== API Helpers ==========
async function fmpApiGet(url) {
    const resp = await fetch(url, {
        credentials: 'include',
        headers: { 'X-Admin-Token': token }
    });
    return resp.json();
}

async function fmpApiPost(url, data) {
    const resp = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': token
        },
        body: JSON.stringify(data)
    });
    return resp.json();
}

async function fmpApiPut(url, data) {
    const resp = await fetch(url, {
        method: 'PUT',
        credentials: 'include',
        headers: {
            'Content-Type': 'application/json',
            'X-Admin-Token': token
        },
        body: JSON.stringify(data)
    });
    return resp.json();
}

async function fmpApiDelete(url) {
    const resp = await fetch(url, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'X-Admin-Token': token }
    });
    return resp.json();
}

// ========== List Management ==========
async function loadFeaturedMpList() {
    const category = document.getElementById('fmp-filter-category')?.value || '';
    const status = document.getElementById('fmp-filter-status')?.value || '';
    
    let url = '/api/admin/featured-mps?';
    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (status) url += `enabled=${encodeURIComponent(status)}&`;
    
    try {
        const data = await fmpApiGet(url);
        if (!data.ok) {
            showToast(data.detail || '加载失败', 'error');
            return;
        }
        
        renderFeaturedMpList(data.list || []);
        document.getElementById('fmp-total-count').textContent = `共 ${data.total || 0} 个公众号`;
    } catch (e) {
        showToast('加载失败: ' + e.message, 'error');
    }
}

function renderFeaturedMpList(mps) {
    const tbody = document.getElementById('fmp-tbody');
    if (!tbody) return;
    
    if (!mps || mps.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; padding: 60px; color: #6b7280;">
                    <div style="margin-bottom: 16px;">${FMP_WECHAT_ICON_LARGE}</div>
                    <div>暂无精选公众号</div>
                    <button class="btn btn-primary" onclick="openFeaturedMpAddModal()" style="margin-top: 16px;">添加公众号</button>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = mps.map(mp => {
        const avatarUrl = mp.round_head_img 
            ? `/api/wechat/avatar-proxy?url=${encodeURIComponent(mp.round_head_img)}`
            : '';
        const avatarHtml = avatarUrl 
            ? `<img src="${avatarUrl}" class="fmp-avatar" onerror="this.style.display='none'">`
            : `<div class="fmp-avatar" style="display:flex;align-items:center;justify-content:center;background:#e5e7eb;">${FMP_WECHAT_ICON_SMALL}</div>`;
        
        const statusClass = mp.enabled ? 'fmp-status-enabled' : 'fmp-status-disabled';
        const statusText = mp.enabled ? '启用' : '禁用';
        
        const lastFetch = mp.last_fetch_at 
            ? new Date(mp.last_fetch_at * 1000).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
            : '-';
        
        return `
            <tr data-fakeid="${_escapeHtml(mp.fakeid)}">
                <td><input type="checkbox" class="fmp-checkbox" data-fakeid="${_escapeHtml(mp.fakeid)}" onchange="updateFeaturedMpSelectionInfo()"></td>
                <td>
                    <div class="fmp-info">
                        ${avatarHtml}
                        <div>
                            <div class="fmp-name">${_escapeHtml(mp.nickname)}</div>
                            <div class="fmp-signature">${_escapeHtml(mp.signature || '')}</div>
                        </div>
                    </div>
                </td>
                <td>${_escapeHtml(mp.category || 'general')}</td>
                <td><span class="fmp-status-badge ${statusClass}">${statusText}</span></td>
                <td>${mp.sort_order || 0}</td>
                <td>${lastFetch}</td>
                <td>
                    <button class="btn btn-sm" onclick="openFeaturedMpEditModal('${_escapeHtml(mp.fakeid)}', '${_escapeHtml(mp.nickname)}', '${_escapeHtml(mp.category || 'general')}', ${mp.sort_order || 0}, ${mp.enabled ? 1 : 0})">编辑</button>
                    <button class="btn btn-sm" onclick="manualFetchFeaturedMp('${_escapeHtml(mp.fakeid)}')">抓取</button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Reset selection info
    updateFeaturedMpSelectionInfo();
}

function toggleFeaturedMpSelectAll() {
    const selectAll = document.getElementById('fmp-select-all');
    const checkboxes = document.querySelectorAll('.fmp-checkbox');
    checkboxes.forEach(cb => cb.checked = selectAll.checked);
    updateFeaturedMpSelectionInfo();
}

function updateFeaturedMpSelectionInfo() {
    const checkboxes = document.querySelectorAll('.fmp-checkbox:checked');
    const info = document.getElementById('fmp-selection-info');
    if (info) {
        info.textContent = `已选: ${checkboxes.length}`;
    }
}

async function batchDeleteFeaturedMps() {
    const checkboxes = document.querySelectorAll('.fmp-checkbox:checked');
    if (checkboxes.length === 0) {
        showToast('请先选择要删除的公众号', 'error');
        return;
    }
    
    if (!confirm(`确定要删除选中的 ${checkboxes.length} 个公众号吗？`)) {
        return;
    }
    
    const fakeids = Array.from(checkboxes).map(cb => cb.dataset.fakeid);
    
    try {
        const data = await fmpApiPost('/api/admin/featured-mps/batch-delete', { fakeids });
        
        if (data.ok) {
            showToast(data.message || `成功删除 ${data.deleted} 个公众号`, 'success');
            loadFeaturedMpList();
        } else {
            showToast(data.detail || '批量删除失败', 'error');
        }
    } catch (e) {
        showToast('批量删除失败: ' + e.message, 'error');
    }
}

// ========== Add Modal ==========
function openFeaturedMpAddModal() {
    document.getElementById('fmp-add-modal').style.display = 'flex';
    document.getElementById('fmp-search-keyword').value = '';
    document.getElementById('fmp-search-results').innerHTML = '';
}

function closeFeaturedMpAddModal() {
    document.getElementById('fmp-add-modal').style.display = 'none';
}

async function searchFeaturedMp() {
    const keyword = document.getElementById('fmp-search-keyword')?.value?.trim();
    if (!keyword) {
        showToast('请输入搜索关键词', 'error');
        return;
    }
    
    // Check rate limit
    const now = Date.now();
    if (now - fmpLastSearchTime < FMP_SEARCH_INTERVAL) {
        const wait = Math.ceil((FMP_SEARCH_INTERVAL - (now - fmpLastSearchTime)) / 1000);
        showToast(`请等待 ${wait} 秒后再搜索`, 'error');
        return;
    }
    fmpLastSearchTime = now;
    
    const btn = document.getElementById('fmp-search-btn');
    const resultsDiv = document.getElementById('fmp-search-results');
    
    btn.disabled = true;
    btn.textContent = '搜索中...';
    resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">搜索中...</div>';
    
    try {
        const data = await fmpApiGet(`/api/admin/featured-mps/search?keyword=${encodeURIComponent(keyword)}&limit=10`);
        
        if (!data.ok) {
            resultsDiv.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;">${_escapeHtml(data.error || '搜索失败')}</div>`;
            return;
        }
        
        if (!data.list || data.list.length === 0) {
            resultsDiv.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">未找到匹配的公众号</div>';
            return;
        }
        
        resultsDiv.innerHTML = data.list.map(acc => {
            const avatarUrl = acc.round_head_img 
                ? `/api/wechat/avatar-proxy?url=${encodeURIComponent(acc.round_head_img)}`
                : '';
            const avatarHtml = avatarUrl 
                ? `<img src="${avatarUrl}" style="width:40px;height:40px;border-radius:50%;" onerror="this.style.display='none'">`
                : `<div style="width:40px;height:40px;border-radius:50%;background:#e5e7eb;display:flex;align-items:center;justify-content:center;">${FMP_WECHAT_ICON_SMALL}</div>`;
            
            const featuredClass = acc.is_featured ? 'is-featured' : '';
            const featuredBadge = acc.is_featured ? '<span style="font-size:12px;color:#92400e;margin-left:8px;">已添加</span>' : '';
            
            return `
                <div class="fmp-search-result-item ${featuredClass}" onclick="addFeaturedMp('${_escapeHtml(acc.fakeid)}', '${_escapeHtml(acc.nickname)}', '${_escapeHtml(acc.round_head_img || '')}', '${_escapeHtml(acc.signature || '')}', ${acc.is_featured})">
                    ${avatarHtml}
                    <div style="flex:1;">
                        <div style="font-weight:600;">${_escapeHtml(acc.nickname)}${featuredBadge}</div>
                        <div style="font-size:12px;color:#6b7280;">${_escapeHtml(acc.signature || '')}</div>
                    </div>
                    ${acc.is_featured ? '' : '<button class="btn btn-sm btn-primary">添加</button>'}
                </div>
            `;
        }).join('');
        
    } catch (e) {
        resultsDiv.innerHTML = `<div style="text-align:center;padding:20px;color:#ef4444;">搜索失败: ${_escapeHtml(e.message)}</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = '搜索';
    }
}

async function addFeaturedMp(fakeid, nickname, avatar, signature, isFeatured) {
    if (isFeatured) {
        showToast('该公众号已在精选列表中', 'error');
        return;
    }
    
    try {
        const data = await fmpApiPost('/api/admin/featured-mps', {
            fakeid,
            nickname,
            round_head_img: avatar,
            signature,
            category: 'general'
        });
        
        if (data.ok) {
            showToast('添加成功', 'success');
            closeFeaturedMpAddModal();
            loadFeaturedMpList();
        } else {
            showToast(data.detail || '添加失败', 'error');
        }
    } catch (e) {
        showToast('添加失败: ' + e.message, 'error');
    }
}

// ========== Edit Modal ==========
function openFeaturedMpEditModal(fakeid, nickname, category, sortOrder, enabled) {
    document.getElementById('fmp-edit-modal').style.display = 'flex';
    document.getElementById('fmp-edit-fakeid').value = fakeid;
    document.getElementById('fmp-edit-nickname').value = nickname;
    document.getElementById('fmp-edit-category').value = category;
    document.getElementById('fmp-edit-sort-order').value = sortOrder;
    document.getElementById('fmp-edit-enabled').checked = enabled === 1;
}

function closeFeaturedMpEditModal() {
    document.getElementById('fmp-edit-modal').style.display = 'none';
}

async function saveFeaturedMpEdit() {
    const fakeid = document.getElementById('fmp-edit-fakeid').value;
    const category = document.getElementById('fmp-edit-category').value;
    const sortOrder = parseInt(document.getElementById('fmp-edit-sort-order').value) || 0;
    const enabled = document.getElementById('fmp-edit-enabled').checked ? 1 : 0;
    
    try {
        const data = await fmpApiPut(`/api/admin/featured-mps/${encodeURIComponent(fakeid)}`, {
            category,
            sort_order: sortOrder,
            enabled
        });
        
        if (data.ok) {
            showToast('保存成功', 'success');
            closeFeaturedMpEditModal();
            loadFeaturedMpList();
        } else {
            showToast(data.detail || '保存失败', 'error');
        }
    } catch (e) {
        showToast('保存失败: ' + e.message, 'error');
    }
}

async function confirmDeleteFeaturedMp() {
    const fakeid = document.getElementById('fmp-edit-fakeid').value;
    const nickname = document.getElementById('fmp-edit-nickname').value;
    
    if (!confirm(`确定要删除「${nickname}」吗？`)) return;
    
    try {
        const data = await fmpApiDelete(`/api/admin/featured-mps/${encodeURIComponent(fakeid)}`);
        
        if (data.ok) {
            showToast('删除成功', 'success');
            closeFeaturedMpEditModal();
            loadFeaturedMpList();
        } else {
            showToast(data.detail || '删除失败', 'error');
        }
    } catch (e) {
        showToast('删除失败: ' + e.message, 'error');
    }
}

// ========== Import Modal ==========
function openFeaturedMpImportModal() {
    document.getElementById('fmp-import-modal').style.display = 'flex';
    document.getElementById('fmp-import-step-1').style.display = 'block';
    document.getElementById('fmp-import-step-2').style.display = 'none';
    document.getElementById('fmp-import-step-3').style.display = 'none';
    document.getElementById('fmp-import-text').value = '';
    document.getElementById('fmp-import-file').value = '';
    fmpCurrentPreviewId = null;
    fmpPreviewItems = [];
}

function closeFeaturedMpImportModal() {
    document.getElementById('fmp-import-modal').style.display = 'none';
}

function backToFeaturedMpStep1() {
    document.getElementById('fmp-import-step-1').style.display = 'block';
    document.getElementById('fmp-import-step-2').style.display = 'none';
}

function handleFeaturedMpFileSelect() {
    const file = document.getElementById('fmp-import-file').files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('fmp-import-text').value = e.target.result;
    };
    reader.readAsText(file);
}

async function previewFeaturedMpImport() {
    const csvText = document.getElementById('fmp-import-text').value.trim();
    if (!csvText) {
        showToast('请提供 CSV 文件或文本内容', 'error');
        return;
    }
    
    // Show step 2 with progress
    document.getElementById('fmp-import-step-1').style.display = 'none';
    document.getElementById('fmp-import-step-2').style.display = 'block';
    document.getElementById('fmp-import-progress').style.display = 'block';
    document.getElementById('fmp-import-summary').innerHTML = '正在处理...';
    document.getElementById('fmp-import-preview-list').innerHTML = '';
    document.getElementById('fmp-confirm-import-btn').disabled = true;
    
    try {
        // Use fetch with streaming for SSE
        const response = await fetch('/api/admin/featured-mps/import/preview', {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': token
            },
            body: JSON.stringify({ csv_text: csvText })
        });
        
        if (!response.ok) {
            const err = await response.json();
            showToast(err.detail || '预览失败', 'error');
            backToFeaturedMpStep1();
            return;
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const data = JSON.parse(line.slice(6));
                        
                        if (data.type === 'start') {
                            document.getElementById('fmp-progress-text').textContent = `0/${data.total}`;
                            document.getElementById('fmp-progress-fill').style.width = '0%';
                        } else if (data.type === 'progress') {
                            const pct = Math.round((data.current / data.total) * 100);
                            document.getElementById('fmp-progress-text').textContent = `${data.current}/${data.total}`;
                            document.getElementById('fmp-progress-fill').style.width = `${pct}%`;
                            document.getElementById('fmp-import-summary').innerHTML = `正在搜索: <strong>${data.name}</strong>`;
                        } else if (data.type === 'done') {
                            document.getElementById('fmp-import-progress').style.display = 'none';
                            
                            if (!data.ok) {
                                showToast(data.message || '预览失败', 'error');
                                backToFeaturedMpStep1();
                                return;
                            }
                            
                            fmpCurrentPreviewId = data.preview_id;
                            fmpPreviewItems = data.items || [];
                            
                            document.getElementById('fmp-import-summary').innerHTML = `
                                <div style="display:flex;gap:20px;flex-wrap:wrap;">
                                    <div>总计: <strong>${data.total}</strong></div>
                                    <div style="color:#10b981;">可导入: <strong>${data.valid}</strong></div>
                                    <div style="color:#ef4444;">无法导入: <strong>${data.invalid}</strong></div>
                                </div>
                            `;
                            
                            renderFeaturedMpPreviewList(fmpPreviewItems);
                            document.getElementById('fmp-confirm-import-btn').disabled = data.valid === 0;
                        } else if (data.type === 'error') {
                            showToast(data.message || '处理失败', 'error');
                            backToFeaturedMpStep1();
                            return;
                        }
                    } catch (e) {
                        console.error('Parse SSE error:', e);
                    }
                }
            }
        }
        
    } catch (e) {
        showToast('预览失败: ' + e.message, 'error');
        backToFeaturedMpStep1();
    }
}

function renderFeaturedMpPreviewList(items) {
    const container = document.getElementById('fmp-import-preview-list');
    
    container.innerHTML = items.map((item, idx) => {
        const statusLabels = {
            'found': '✅ 已匹配',
            'exists': '⚠️ 已存在',
            'conflict': '⚠️ 源重名',
            'not_found': '❌ 未找到',
            'error': '❌ 错误',
            'duplicate': '⚠️ 重复'
        };
        
        const statusLabel = statusLabels[item.status] || item.status;
        const matched = item.matched;
        
        let matchedHtml = '';
        if (matched) {
            const avatarUrl = matched.round_head_img 
                ? `/api/wechat/avatar-proxy?url=${encodeURIComponent(matched.round_head_img)}`
                : '';
            matchedHtml = `
                <div style="display:flex;align-items:center;gap:8px;margin-top:4px;">
                    ${avatarUrl ? `<img src="${avatarUrl}" style="width:24px;height:24px;border-radius:50%;">` : ''}
                    <span style="font-size:12px;color:#4b5563;">${_escapeHtml(matched.nickname)}</span>
                </div>
            `;
        }
        
        const checkboxHtml = item.status === 'found' 
            ? `<input type="checkbox" class="fmp-import-checkbox" data-line="${item.line}" checked>`
            : '';
        
        return `
            <div class="fmp-import-preview-item">
                <div style="width:30px;">${checkboxHtml}</div>
                <div style="width:30px;color:#6b7280;">${item.line}</div>
                <div style="flex:1;">
                    <div>${_escapeHtml(item.input_name)}</div>
                    ${matchedHtml}
                </div>
                <div style="width:100px;">
                    <span class="fmp-import-status fmp-import-status-${item.status}">${statusLabel}</span>
                </div>
                <div style="width:150px;font-size:12px;color:#6b7280;">
                    ${item.error ? _escapeHtml(item.error) : ''}
                </div>
            </div>
        `;
    }).join('');
}

async function confirmFeaturedMpImport() {
    if (!fmpCurrentPreviewId) {
        showToast('预览已过期，请重新上传', 'error');
        return;
    }
    
    // Get selected lines
    const checkboxes = document.querySelectorAll('.fmp-import-checkbox:checked');
    const selectedLines = Array.from(checkboxes).map(cb => parseInt(cb.dataset.line));
    
    if (selectedLines.length === 0) {
        showToast('请选择要导入的公众号', 'error');
        return;
    }
    
    document.getElementById('fmp-confirm-import-btn').disabled = true;
    document.getElementById('fmp-confirm-import-btn').textContent = '导入中...';
    
    try {
        const data = await fmpApiPost('/api/admin/featured-mps/import/confirm', {
            preview_id: fmpCurrentPreviewId,
            selected_lines: selectedLines,
            skip_exists: true
        });
        
        // Show step 3 with result
        document.getElementById('fmp-import-step-2').style.display = 'none';
        document.getElementById('fmp-import-step-3').style.display = 'block';
        
        if (data.ok) {
            document.getElementById('fmp-import-result').innerHTML = `
                <div style="font-size:48px;margin-bottom:16px;">✅</div>
                <div style="font-size:18px;font-weight:600;margin-bottom:8px;">导入完成</div>
                <div style="color:#6b7280;">
                    成功导入 <strong style="color:#10b981;">${data.imported}</strong> 个公众号
                    ${data.skipped > 0 ? `，跳过 ${data.skipped} 个` : ''}
                    ${data.failed > 0 ? `，失败 ${data.failed} 个` : ''}
                </div>
            `;
            loadFeaturedMpList();
        } else {
            document.getElementById('fmp-import-result').innerHTML = `
                <div style="font-size:48px;margin-bottom:16px;">❌</div>
                <div style="font-size:18px;font-weight:600;margin-bottom:8px;">导入失败</div>
                <div style="color:#ef4444;">${_escapeHtml(data.detail || '未知错误')}</div>
            `;
        }
        
    } catch (e) {
        showToast('导入失败: ' + e.message, 'error');
    } finally {
        document.getElementById('fmp-confirm-import-btn').disabled = false;
        document.getElementById('fmp-confirm-import-btn').textContent = '确认导入';
    }
}

// ========== Export & Template ==========
function downloadFeaturedMpTemplate() {
    window.location.href = '/api/admin/featured-mps/import/template';
}

function exportFeaturedMpList() {
    const category = document.getElementById('fmp-filter-category')?.value || '';
    const status = document.getElementById('fmp-filter-status')?.value || '';
    
    let url = '/api/admin/featured-mps/export?';
    if (category) url += `category=${encodeURIComponent(category)}&`;
    if (status) url += `enabled=${encodeURIComponent(status)}&`;
    
    window.location.href = url;
}

// ========== Manual Fetch ==========
async function manualFetchFeaturedMp(fakeid) {
    if (!confirm('确定要手动抓取该公众号的文章吗？')) return;
    
    showToast('正在抓取...', 'info');
    
    try {
        const data = await fmpApiPost(`/api/admin/featured-mps/fetch?fakeid=${encodeURIComponent(fakeid)}`);
        
        if (data.ok) {
            showToast(data.message || '抓取完成', 'success');
            loadFeaturedMpList();
        } else {
            showToast(data.detail || '抓取失败', 'error');
        }
    } catch (e) {
        showToast('抓取失败: ' + e.message, 'error');
    }
}

async function manualFetchAllFeaturedMps() {
    if (!confirm('确定要手动抓取所有启用的公众号文章吗？\n这可能需要较长时间。')) return;
    
    showToast('正在抓取所有公众号...', 'info');
    
    try {
        const data = await fmpApiPost('/api/admin/featured-mps/fetch');
        
        if (data.ok) {
            showToast(data.message || '抓取完成', 'success');
            if (data.errors && data.errors.length > 0) {
                console.warn('Fetch errors:', data.errors);
            }
            loadFeaturedMpList();
        } else {
            showToast(data.detail || '抓取失败', 'error');
        }
    } catch (e) {
        showToast('抓取失败: ' + e.message, 'error');
    }
}
