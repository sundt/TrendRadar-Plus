/**
 * System Settings Admin Logic
 * Handles loading, validating, and saving system configurations.
 */

// Global state for settings
let currentSettings = null;

/**
 * Initialize Settings Tab
 */
function initSettingsTab() {
    loadSettings();
    loadMBCategoryWhitelistSettings();
    // Default to first tab
    switchSettingsTab('scheduler');
}

/**
 * Switch between settings sub-tabs
 * @param {string} tabName - The name of the tab to switch to (scheduler, display, search, retention)
 */
function switchSettingsTab(tabName) {
    // Update buttons
    document.querySelectorAll('.sub-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(`'${tabName}'`));
    });

    // Update content
    document.querySelectorAll('.settings-tab-content').forEach(content => {
        content.classList.remove('active');
    });

    const target = document.getElementById(`settings-tab-${tabName}`);
    if (target) {
        target.classList.add('active');
    }
}

/**
 * Load settings from API
 */
async function loadSettings() {
    const token = document.querySelector('meta[name="admin-token"]')?.content || '';
    try {
        // Load Config Settings
        const response = await fetch('/api/admin/settings?token=' + token);
        const result = await response.json();

        if (result.success) {
            currentSettings = result.settings;
            renderSettings(currentSettings);
            document.getElementById('settings-source-info').textContent =
                `Configuration Source: ${result.source === 'database' ? 'Database (Editable)' : 'config.yaml (Defaults)'}`;
        } else {
            showToast('Failed to load settings: ' + result.error, 'error');
        }

        // Load Realtime Scheduler Status
        loadSchedulerStatus();

    } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Network error loading settings', 'error');
    }
}

async function loadSchedulerStatus() {
    try {
        const res = await fetch('/api/scheduler/status');
        const data = await res.json();
        renderSchedulerStatus(data);
    } catch (e) {
        console.error("Failed to load scheduler status", e);
    }
}

function renderSchedulerStatus(data) {
    if (!data) return;

    // 1. Auto Fetch
    const af = data.auto_fetch || {};
    const afEl = document.getElementById('scheduler-status-autofetch');
    if (afEl) {
        if (af.available) {
            afEl.innerHTML = `Running: ${af.running ? '<span class="text-green">YES</span>' : '<span class="text-red">NO</span>'} | Last Fetch: ${af.last_fetch_time || 'Never'}`;
        } else {
            afEl.textContent = "Module Not Available";
        }
    }

    // 2. System Cron
    const cron = data.system_cron || {};
    const cronEnvEl = document.getElementById('scheduler-status-cron-env');
    if (cronEnvEl) cronEnvEl.textContent = cron.environment_schedule || "Not Set";

    const crontabEl = document.getElementById('scheduler-status-crontab');
    if (crontabEl) crontabEl.textContent = cron.crontab_content || "(No active crontab found)";

    // 3. Internal Tasks
    const tasks = data.internal_tasks || {};
    const tbody = document.getElementById('scheduler-internal-tasks-tbody');
    if (tbody) {
        if (Object.keys(tasks).length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="muted" style="padding:10px;">No internal tasks info available.</td></tr>';
            return;
        }

        let html = '';
        const taskLabels = {
            "rss_warmup": "RSS Warmup & Fetch",
            "mb_ai": "Morning Brief AI",
            "rss_source_ai": "RSS Source Classification (Daily)",
            "custom_ingest": "Custom Source Ingestion",
            "search_vector": "Search Index Rebuild (Daily)"
        };

        for (const [key, info] of Object.entries(tasks)) {
            const name = taskLabels[key] || key;
            const isRunning = info.running;
            const isActive = info.task_active || info.worker_active; // varying keys

            let details = [];
            if (info.config) {
                for (const [k, v] of Object.entries(info.config)) {
                    details.push(`${k}=${v}`);
                }
            }
            if (info.last_run_date) details.push(`Last Run: ${info.last_run_date}`);

            html += `
                <tr>
                    <td style="padding:8px;"><b>${name}</b></td>
                    <td style="padding:8px;">
                        ${isRunning ? '<span class="badge badge-ok">Enabled</span>' : '<span class="badge badge-off">Disabled</span>'}
                        ${isActive ? '<span class="badge badge-ok" title="Task Active">Active</span>' : '<span class="badge badge-warn" title="Task Inactive">Idle</span>'}
                    </td>
                    <td style="padding:8px; font-size:12px; color:#555;">
                        ${details.join('<br>')}
                    </td>
                    <td style="padding:8px; text-align:right;">
                        <!-- Controls could go here -->
                    </td>
                </tr>
            `;
        }
        tbody.innerHTML = html;
    }
}

/**
 * Render settings into form fields
 */
function renderSettings(settings) {
    if (!settings) return;

    // Scheduler
    const scheduler = settings.scheduler || {};
    setCheckbox('setting-auto-fetch', scheduler.auto_fetch);
    setValue('setting-fetch-interval', scheduler.fetch_interval_minutes);
    setCheckbox('setting-fetch-startup', scheduler.fetch_on_startup);
    setValue('setting-request-interval', scheduler.request_interval);

    // AI
    const ai = settings.ai || {};
    setCheckbox('setting-ai-mb-enabled', ai.mb_ai_enabled);
    setCheckbox('setting-ai-source-enabled', ai.rss_source_ai_enabled);
    setCheckbox('setting-ai-custom-enabled', ai.custom_ingest_ai_enabled);

    // Search
    const search = settings.search || {};
    setValue('setting-search-days', search.search_days);
    setCheckbox('setting-vector-enabled', search.vector_enabled);
    setValue('setting-embedding-model', search.embedding_model);
    setValue('setting-vector-top-k', search.vector_top_k);
    setValue('setting-keyword-min-score', search.keyword_min_score);

    // Retention
    const retention = settings.retention || {};
    setValue('setting-local-retention-days', retention.local_retention_days);
    setValue('setting-rss-entries-retention-days', retention.rss_entries_retention_days);
    setValue('setting-remote-retention-days', retention.remote_retention_days);

    setCheckbox('setting-push-window-enabled', retention.push_window_enabled);
    setValue('setting-push-start', retention.push_window_start);
    setValue('setting-push-end', retention.push_window_end);

    // Display
    const display = settings.display || {};
    setValue('setting-items-per-card', display.items_per_card || 20);
    setValue('setting-morning-brief-items', display.morning_brief_items || 50);

    // ScraperAPI
    const scraperapi = settings.scraperapi || {};
    setCheckbox('setting-scraperapi-enabled', scraperapi.enabled !== false);
    setValue('setting-scraperapi-max-per-hour', scraperapi.max_calls_per_hour || 100);
    setValue('setting-scraperapi-max-per-day', scraperapi.max_calls_per_day || 1000);
    setValue('setting-scraperapi-default-cron', scraperapi.default_cron || '0 */6 * * *');
}

/**
 * Gather settings from form fields
 */
function gatherSettings() {
    return {
        scheduler: {
            auto_fetch: getCheckbox('setting-auto-fetch'),
            fetch_interval_minutes: getInt('setting-fetch-interval'),
            fetch_on_startup: getCheckbox('setting-fetch-startup'),
            request_interval: getInt('setting-request-interval')
        },
        ai: {
            mb_ai_enabled: getCheckbox('setting-ai-mb-enabled'),
            rss_source_ai_enabled: getCheckbox('setting-ai-source-enabled'),
            custom_ingest_ai_enabled: getCheckbox('setting-ai-custom-enabled')
        },
        search: {
            search_days: getInt('setting-search-days'),
            vector_enabled: getCheckbox('setting-vector-enabled'),
            embedding_model: getValue('setting-embedding-model'),
            vector_top_k: getInt('setting-vector-top-k'),
            keyword_min_score: getFloat('setting-keyword-min-score')
        },
        retention: {
            local_retention_days: getInt('setting-local-retention-days'),
            remote_retention_days: getInt('setting-remote-retention-days'),
            rss_entries_retention_days: getInt('setting-rss-entries-retention-days'),
            push_window_enabled: getCheckbox('setting-push-window-enabled'),
            push_window_start: getValue('setting-push-start'),
            push_window_end: getValue('setting-push-end')
        },
        display: {
            items_per_card: getInt('setting-items-per-card'),
            morning_brief_items: getInt('setting-morning-brief-items')
        },
        scraperapi: {
            enabled: getCheckbox('setting-scraperapi-enabled'),
            max_calls_per_hour: getInt('setting-scraperapi-max-per-hour'),
            max_calls_per_day: getInt('setting-scraperapi-max-per-day'),
            default_cron: getValue('setting-scraperapi-default-cron')
        }
    };
}

/**
 * Save settings to API
 */
async function saveSettings() {
    const settings = gatherSettings();

    // Validation
    if (settings.scheduler.fetch_interval_minutes < 5 || settings.scheduler.fetch_interval_minutes > 1440) {
        showToast('Fetch interval must be between 5 and 1440 minutes', 'error');
        return;
    }
    if (settings.search.search_days < 1) {
        showToast('Search days must be at least 1', 'error');
        return;
    }

    const token = document.querySelector('meta[name="admin-token"]')?.content || '';
    const btn = document.getElementById('btn-save-settings');
    const originalText = btn.textContent;
    btn.textContent = 'Saving...';
    btn.disabled = true;

    try {
        // Save main settings
        const response = await fetch('/api/admin/settings?token=' + token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ settings })
        });
        const result = await response.json();

        // Also save Morning Brief category whitelist settings
        await saveMBCategoryWhitelistSettings();

        if (result.success) {
            showToast('Settings saved successfully', 'success');
            loadSettings(); // Reload to confirm state
            loadMBCategoryWhitelistSettings(); // Reload MB settings too
        } else {
            showToast('Failed to save: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error saving settings:', error);
        showToast('Network error saving settings', 'error');
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

// Helper functions
function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : '';
}
function setValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined ? val : '';
}
function getCheckbox(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}
function setCheckbox(id, val) {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
}
function getInt(id) {
    const el = document.getElementById(id);
    return el ? (parseInt(el.value, 10) || 0) : 0;
}
function getFloat(id) {
    const el = document.getElementById(id);
    return el ? (parseFloat(el.value) || 0.0) : 0.0;
}

/**
 * Load ScraperAPI usage statistics
 */
async function loadScraperAPIUsage() {
    const container = document.getElementById('scraperapi-usage-table');
    if (!container) return;

    container.innerHTML = '<div class="muted">Loading usage data...</div>';

    try {
        const response = await fetch('/api/admin/scraperapi/usage');
        const result = await response.json();

        if (!result.success) {
            container.innerHTML = `<div class="muted">Error: ${result.error}</div>`;
            return;
        }

        // Update total
        const totalEl = document.getElementById('scraperapi-today-total');
        if (totalEl) totalEl.textContent = result.today_total || 0;

        // Render table
        const sources = result.by_source || [];
        if (sources.length === 0) {
            container.innerHTML = '<div class="muted">今日暂无 API 调用记录</div>';
            return;
        }

        let html = `
            <table style="width:100%; font-size:13px;">
                <thead style="background:#f9fafb;">
                    <tr>
                        <th style="padding:8px; text-align:left;">数据源</th>
                        <th style="padding:8px; text-align:right;">今日调用</th>
                        <th style="padding:8px; text-align:right;">最后调用</th>
                    </tr>
                </thead>
                <tbody>
        `;

        for (const src of sources) {
            const lastCall = src.last_call ? src.last_call.split(' ')[1] || src.last_call : '-';
            html += `
                <tr>
                    <td style="padding:8px;">${src.name || src.source_id}</td>
                    <td style="padding:8px; text-align:right; font-weight:600;">${src.calls}</td>
                    <td style="padding:8px; text-align:right; color:#6b7280;">${lastCall}</td>
                </tr>
            `;
        }

        html += '</tbody></table>';
        container.innerHTML = html;

    } catch (error) {
        console.error('Error loading ScraperAPI usage:', error);
        container.innerHTML = '<div class="muted">加载失败</div>';
    }
}

/**
 * Load Morning Brief Category Whitelist Settings
 */
let mbRulesCache = null;

async function loadMBCategoryWhitelistSettings() {
    try {
        const resp = await fetch('/api/admin/morning-brief/rules');
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            console.error('Failed to load MB rules:', payload);
            return;
        }
        const rules = payload?.rules || {};
        mbRulesCache = rules;

        // Set category filter enabled checkbox
        const filterEnabled = rules.category_whitelist_enabled !== false;
        setCheckbox('setting-mb-category-filter-enabled', filterEnabled);

        // Set category checkboxes
        const whitelist = Array.isArray(rules.category_whitelist)
            ? rules.category_whitelist.map(c => String(c || '').toLowerCase())
            : ['explore', 'tech_news', 'ainews', 'developer'];

        document.querySelectorAll('.mb-category-checkbox').forEach(cb => {
            cb.checked = whitelist.includes(cb.value.toLowerCase());
        });

    } catch (e) {
        console.error('Error loading MB category settings:', e);
    }
}

/**
 * Gather and save Morning Brief Category Whitelist Settings
 * This is called from saveSettings()
 */
async function saveMBCategoryWhitelistSettings() {
    try {
        // Gather current values
        const filterEnabled = getCheckbox('setting-mb-category-filter-enabled');
        const selectedCategories = [];
        document.querySelectorAll('.mb-category-checkbox').forEach(cb => {
            if (cb.checked) {
                selectedCategories.push(cb.value);
            }
        });

        // Merge with existing rules
        const rules = mbRulesCache || {};
        rules.category_whitelist_enabled = filterEnabled;
        rules.category_whitelist = selectedCategories;

        const resp = await fetch('/api/admin/morning-brief/rules', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rules })
        });
        const payload = await resp.json().catch(() => ({}));
        if (!resp.ok) {
            console.error('Failed to save MB rules:', payload);
            showToast('保存栏目过滤设置失败', 'error');
            return false;
        }
        return true;
    } catch (e) {
        console.error('Error saving MB category settings:', e);
        showToast('保存栏目过滤设置失败: ' + e.message, 'error');
        return false;
    }
}

// Export for main script
window.initSettingsTab = initSettingsTab;
window.saveSettings = saveSettings;
window.switchSettingsTab = switchSettingsTab;
window.loadScraperAPIUsage = loadScraperAPIUsage;

