/**
 * AI Model Settings Admin Controller
 */

// State
let aiProviders = [];
let aiModels = [];

// Init
async function initAISettings() {
    await loadAIConfig();
    renderAIProviders();
    renderAIModels();
}

// API: Load Config
async function loadAIConfig() {
    try {
        const res = await fetch('/api/admin/ai/config', {
            headers: { 'admin-token': getAdminToken() }
        });
        const data = await res.json();
        if (data.ok) {
            aiProviders = data.providers || [];
            aiModels = data.models || [];
        } else {
            showToast('Failed to load AI config: ' + data.detail, 'error');
        }
    } catch (e) {
        showToast('Error loading AI config: ' + e.message, 'error');
    }
}

// UI: Render Providers
function renderAIProviders() {
    const container = document.getElementById('ai-providers-list');
    if (!container) return;

    if (aiProviders.length === 0) {
        container.innerHTML = '<div class="muted">No providers configured. Click "Add Provider" to start.</div>';
        return;
    }

    let html = '';
    aiProviders.forEach(p => {
        const statusColor = p.enabled ? 'green' : 'gray';
        html += `
        <div class="card" style="margin-bottom:10px; padding:12px; border-left:4px solid ${statusColor};">
            <div class="row" style="justify-content:space-between; align-items:center;">
                <div>
                    <div style="font-weight:600; font-size:14px;">${p.name || p.id}</div>
                    <div class="muted" style="font-size:12px;">ID: ${p.id} | Type: ${p.type}</div>
                    <div class="muted" style="font-size:12px; font-family:monospace;">${p.base_url}</div>
                </div>
                <div>
                    <button class="btn btn-sm" onclick="editAIProvider('${p.id}')">Edit</button>
                    <button class="btn btn-sm btn-danger" onclick="deleteAIProvider('${p.id}')">Delete</button>
                </div>
            </div>
        </div>`;
    });
    container.innerHTML = html;
}

// UI: Render Models
function renderAIModels() {
    const tbody = document.getElementById('ai-models-tbody');
    if (!tbody) return;

    if (aiModels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="muted" style="text-align:center; padding:20px;">No models found. Try "Batch Import".</td></tr>';
        return;
    }

    // Sort by priority
    const sorted = [...aiModels].sort((a, b) => (a.priority || 99) - (b.priority || 99));

    let html = '';
    const nowStr = new Date().toISOString().split('T')[0];

    sorted.forEach(m => {
        const isExpired = m.expires && m.expires < nowStr;
        const statusIcon = !m.enabled ? '⛔' : (isExpired ? '⚠️ Expired' : '✅ Active');
        const rowStyle = isExpired ? 'opacity:0.6; background:#fff1f2;' : '';

        html += `
        <tr style="${rowStyle}">
            <td><div style="font-weight:500;">${m.name}</div><div class="muted" style="font-size:11px;">ID: ${m.id}</div></td>
            <td>${m.provider_id}</td>
            <td><span class="badge" style="background:${getPriorityColor(m.priority)}">${m.priority}</span></td>
            <td>${m.expires || '<span class="muted">-</span>'}</td>
            <td>${statusIcon}</td>
            <td>
                <button class="btn btn-sm" onclick="deleteAIModel('${m.id}')">🗑</button>
            </td>
        </tr>`;
    });
    tbody.innerHTML = html;
}

function getPriorityColor(p) {
    if (p <= 10) return '#dcfce7; color:#166534'; // High
    if (p <= 30) return '#e0f2fe; color:#075985'; // Med
    return '#f3f4f6; color:#374151'; // Low
}

// Action: Batch Import Preview
function previewBatchImport() {
    const text = document.getElementById('ai-batch-import-text').value;
    const lines = text.split('\n');
    let previewHtml = '<table class="data-table"><thead><tr><th>Provider</th><th>Model</th><th>Priority</th><th>Expires</th></tr></thead><tbody>';

    let validCount = 0;
    lines.forEach(line => {
        line = line.trim();
        if (!line || line.startsWith('#')) return;
        const parts = line.split('|').map(s => s.trim());
        if (parts.length < 2) return;

        previewHtml += `<tr>
            <td>${parts[0]}</td>
            <td>${parts[1]}</td>
            <td>${parts[2] || 50}</td>
            <td>${parts[3] || '-'}</td>
        </tr>`;
        validCount++;
    });
    previewHtml += '</tbody></table>';

    document.getElementById('ai-batch-preview').innerHTML = previewHtml;
    document.getElementById('btn-confirm-import').disabled = validCount === 0;
    document.getElementById('ai-batch-preview').style.display = 'block';
}

// Action: Batch Import Submit
async function submitBatchImport() {
    const text = document.getElementById('ai-batch-import-text').value;
    const mode = document.querySelector('input[name="import-mode"]:checked').value;

    try {
        const res = await fetch('/api/admin/ai/models/batch_import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'admin-token': getAdminToken()
            },
            body: JSON.stringify({ text, mode })
        });
        const data = await res.json();

        if (data.ok) {
            showToast(`Imported ${data.added} models!`, 'success');
            document.getElementById('ai-batch-import-text').value = '';
            document.getElementById('ai-batch-preview').style.display = 'none';
            await initAISettings(); // Reload
        } else {
            showToast('Import failed: ' + data.detail, 'error');
        }
    } catch (e) {
        showToast('Error: ' + e.message, 'error');
    }
}

// Action: Delete Model
async function deleteAIModel(modelId) {
    if (!confirm(`确定删除模型 "${modelId}"？`)) return;

    // Remove from local array
    const idx = aiModels.findIndex(m => m.id === modelId);
    if (idx === -1) {
        showToast('Model not found', 'error');
        return;
    }
    
    aiModels.splice(idx, 1);

    // Save to server
    try {
        const res = await fetch('/api/admin/ai/models', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'admin-token': getAdminToken()
            },
            body: JSON.stringify({ models: aiModels })
        });
        const data = await res.json();

        if (data.ok) {
            showToast('Model deleted!', 'success');
            renderAIModels();
        } else {
            // Reload to restore state
            await loadAIConfig();
            renderAIModels();
            showToast('Delete failed: ' + data.detail, 'error');
        }
    } catch (e) {
        await loadAIConfig();
        renderAIModels();
        showToast('Error: ' + e.message, 'error');
    }
}

// Action: Delete Provider
async function deleteAIProvider(providerId) {
    if (!confirm(`确定删除供应商 "${providerId}"？\n注意：关联的模型不会被删除，但会变为无效。`)) return;

    const idx = aiProviders.findIndex(p => p.id === providerId);
    if (idx === -1) {
        showToast('Provider not found', 'error');
        return;
    }
    
    aiProviders.splice(idx, 1);

    try {
        const res = await fetch('/api/admin/ai/providers', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'admin-token': getAdminToken()
            },
            body: JSON.stringify({ providers: aiProviders })
        });
        const data = await res.json();

        if (data.ok) {
            showToast('Provider deleted!', 'success');
            renderAIProviders();
        } else {
            await loadAIConfig();
            renderAIProviders();
            showToast('Delete failed: ' + data.detail, 'error');
        }
    } catch (e) {
        await loadAIConfig();
        renderAIProviders();
        showToast('Error: ' + e.message, 'error');
    }
}

// Action: Test Rotation
async function testAIRotation() {
    const resultDiv = document.getElementById('ai-test-result');
    resultDiv.innerHTML = '<div class="muted">Testing...</div>';

    try {
        const res = await fetch('/api/admin/ai/rotation_test', {
            method: 'POST',
            headers: { 'admin-token': getAdminToken() }
        });
        const data = await res.json();

        if (data.ok) {
            const m = data.selected_model;
            resultDiv.innerHTML = `
            <div style="padding:10px; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:6px; color:#166534;">
                <strong>Selected Model:</strong> ${m.name} <br>
                <small>Provider: ${m.provider_id} | Priority: ${m.priority}</small>
            </div>
            <div style="margin-top:10px; font-size:12px;">
                <strong>Candidate Queue:</strong><br>
                ${data.all_candidates.map((c, i) => `${i + 1}. ${c.name} (${c.provider_id})`).join('<br>')}
            </div>`;
        } else {
            resultDiv.innerHTML = `<div style="color:red;">Test Failed: ${data.detail}</div>`;
        }
    } catch (e) {
        resultDiv.innerHTML = `<div style="color:red;">Error: ${e.message}</div>`;
    }
}

// Helpers
function getAdminToken() {
    // Try meta tag first, then fallback to empty (session cookie will be used)
    const meta = document.querySelector("meta[name='admin-token']");
    return meta ? meta.getAttribute("content") : "";
}
function showToast(msg, type) {
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.innerText = msg;
    const container = document.getElementById('toast-container');
    if (container) container.appendChild(t);
    setTimeout(() => t.remove(), 3000);
}

// Auto init when AI settings tab is shown
let aiSettingsInitialized = false;

function maybeInitAISettings() {
    if (aiSettingsInitialized) return;
    const aiTab = document.getElementById('settings-tab-ai');
    if (aiTab && aiTab.classList.contains('active')) {
        aiSettingsInitialized = true;
        initAISettings();
    }
}

// Hook into settings tab switch (global function used by existing code)
const originalSwitchSettingsTab = window.switchSettingsTab;
window.switchSettingsTab = function (tabName) {
    if (originalSwitchSettingsTab) originalSwitchSettingsTab(tabName);
    if (tabName === 'ai') {
        setTimeout(maybeInitAISettings, 100);
    }
};

// Also try on page load
document.addEventListener('DOMContentLoaded', function () {
    setTimeout(maybeInitAISettings, 500);
});
