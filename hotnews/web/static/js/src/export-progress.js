/**
 * Export Progress Widget — 悬浮可最小化的导出进度条
 *
 * Usage:
 *   import { startExport } from './export-progress.js';
 *   startExport(cardEl);
 */

let widget = null;
let minimized = false;
let abortController = null;

const STYLES = `
.tr-export-widget {
    position: fixed;
    bottom: 24px;
    right: 24px;
    z-index: 9999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Expanded state */
.tr-export-expanded {
    width: 340px;
    background: #1a1a2e;
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.25), 0 0 0 1px rgba(255,255,255,0.08);
    color: #eee;
}
.tr-export-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 10px;
}
.tr-export-title {
    font-size: 13px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
}
.tr-export-title .spinner {
    display: inline-block;
    width: 14px; height: 14px;
    border: 2px solid rgba(255,255,255,0.2);
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: tr-spin 0.8s linear infinite;
}
.tr-export-btns {
    display: flex;
    gap: 4px;
}
.tr-export-btn {
    background: none; border: none; color: #888; cursor: pointer;
    font-size: 16px; padding: 2px 4px; border-radius: 4px;
    transition: color 0.15s, background 0.15s;
}
.tr-export-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
.tr-export-status {
    font-size: 12px; color: #aaa; margin-bottom: 8px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tr-export-bar-track {
    height: 4px; background: rgba(255,255,255,0.1); border-radius: 2px; overflow: hidden;
}
.tr-export-bar-fill {
    height: 100%; background: linear-gradient(90deg, #818cf8, #6366f1);
    border-radius: 2px; transition: width 0.3s ease;
}
.tr-export-bar-fill.indeterminate {
    width: 40% !important;
    animation: tr-slide 1.2s ease-in-out infinite;
}
.tr-export-actions {
    display: flex; gap: 8px; margin-top: 12px;
}
.tr-export-action {
    flex: 1; padding: 8px 0; border: none; border-radius: 8px;
    font-size: 13px; font-weight: 500; cursor: pointer;
    transition: opacity 0.15s;
}
.tr-export-action:hover { opacity: 0.85; }
.tr-export-action.primary {
    background: linear-gradient(135deg, #818cf8, #6366f1);
    color: #fff;
}
.tr-export-action.secondary {
    background: rgba(255,255,255,0.1); color: #ccc;
}

/* Minimized state */
.tr-export-mini {
    width: 48px; height: 48px;
    background: #1a1a2e;
    border-radius: 50%;
    box-shadow: 0 4px 16px rgba(0,0,0,0.3), 0 0 0 1px rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer;
    transition: transform 0.2s;
}
.tr-export-mini:hover { transform: scale(1.08); }
.tr-export-mini .spinner {
    width: 20px; height: 20px;
    border: 2.5px solid rgba(255,255,255,0.15);
    border-top-color: #818cf8;
    border-radius: 50%;
    animation: tr-spin 0.8s linear infinite;
}
.tr-export-mini .done-icon {
    font-size: 22px;
}
.tr-export-mini .fail-icon {
    font-size: 22px;
}

@keyframes tr-spin { to { transform: rotate(360deg); } }
@keyframes tr-slide {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
}
`;

function injectStyles() {
    if (document.getElementById('tr-export-styles')) return;
    const style = document.createElement('style');
    style.id = 'tr-export-styles';
    style.textContent = STYLES;
    document.head.appendChild(style);
}

function createWidget() {
    removeWidget();
    injectStyles();

    widget = document.createElement('div');
    widget.className = 'tr-export-widget';
    document.body.appendChild(widget);
    return widget;
}

function removeWidget() {
    if (widget) {
        widget.remove();
        widget = null;
    }
}

function renderExpanded(state) {
    if (!widget) return;
    const { status, progress, done, error, htmlResult } = state;

    let actionsHtml = '';
    if (done && !error && htmlResult) {
        actionsHtml = `
            <div class="tr-export-actions">
                <button class="tr-export-action primary" data-act="open">📄 打开合集</button>
                <button class="tr-export-action secondary" data-act="close">关闭</button>
            </div>`;
    } else if (done && error) {
        actionsHtml = `
            <div class="tr-export-actions">
                <button class="tr-export-action secondary" data-act="close">关闭</button>
            </div>`;
    }

    const barClass = done ? '' : (progress > 0 ? '' : 'indeterminate');
    const barWidth = done ? '100%' : (progress > 0 ? `${progress}%` : '40%');

    widget.innerHTML = `
        <div class="tr-export-expanded">
            <div class="tr-export-header">
                <div class="tr-export-title">
                    ${done ? (error ? '❌' : '✅') : '<span class="spinner"></span>'}
                    ${done ? (error ? '导出失败' : '导出完成') : '正在导出文章'}
                </div>
                <div class="tr-export-btns">
                    ${!done ? '<button class="tr-export-btn" data-act="minimize" title="最小化">▬</button>' : ''}
                    ${!done ? '<button class="tr-export-btn" data-act="cancel" title="取消">✕</button>' : ''}
                </div>
            </div>
            <div class="tr-export-status">${status}</div>
            <div class="tr-export-bar-track">
                <div class="tr-export-bar-fill ${barClass}" style="width: ${barWidth}"></div>
            </div>
            ${actionsHtml}
        </div>`;

    widget.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const act = e.currentTarget.dataset.act;
            if (act === 'minimize') {
                minimized = true;
                renderMini(state);
            } else if (act === 'cancel') {
                if (abortController) abortController.abort();
                removeWidget();
            } else if (act === 'open' && htmlResult) {
                openExportHtml(htmlResult);
            } else if (act === 'close') {
                removeWidget();
            }
        });
    });
}

function renderMini(state) {
    if (!widget) return;
    const { done, error } = state;

    let inner;
    if (done && error) {
        inner = '<span class="fail-icon">❌</span>';
    } else if (done) {
        inner = '<span class="done-icon">✅</span>';
    } else {
        inner = '<span class="spinner"></span>';
    }

    widget.innerHTML = `<div class="tr-export-mini">${inner}</div>`;
    widget.querySelector('.tr-export-mini').addEventListener('click', () => {
        minimized = false;
        renderExpanded(state);
    });
}

function updateWidget(state) {
    if (!widget) return;
    if (minimized) {
        renderMini(state);
    } else {
        renderExpanded(state);
    }
}

function openExportHtml(html) {
    const win = window.open('', '_blank');
    if (win) {
        win.document.open();
        win.document.write(html);
        win.document.close();
    } else {
        const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
}

/**
 * Start the export process for a card element.
 * @param {Element} cardEl - The platform card element
 */
export function startExport(cardEl) {
    // Collect articles
    const newsItems = Array.from(cardEl.querySelectorAll('.news-list .news-item'));
    const articles = [];
    for (const item of newsItems) {
        const titleEl = item.querySelector('.news-title');
        if (!titleEl || !titleEl.href) continue;
        articles.push({
            title: titleEl.textContent?.trim() || '',
            url: titleEl.href
        });
    }

    if (!articles.length) {
        if (window.TR?.toast?.show) {
            window.TR.toast.show('该卡片暂无文章', { variant: 'warning', durationMs: 1500 });
        }
        return;
    }

    const cardTitle = cardEl.querySelector('.platform-name')?.textContent?.trim() || '文章合集';

    // Create widget
    createWidget();
    minimized = false;
    abortController = new AbortController();

    const state = {
        status: `正在获取 ${articles.length} 篇文章内容...`,
        progress: 0,
        done: false,
        error: null,
        htmlResult: null,
    };

    updateWidget(state);

    // Start fetch
    fetch('/api/articles/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ articles, card_title: cardTitle }),
        signal: abortController.signal,
    })
    .then(resp => {
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        return resp.text();
    })
    .then(html => {
        state.done = true;
        state.progress = 100;
        state.htmlResult = html;

        // Count success/fail from the HTML
        const successMatch = html.match(/成功获取 (\d+) 篇/);
        const totalMatch = html.match(/共 (\d+) 篇文章/);
        const success = successMatch ? successMatch[1] : '?';
        const total = totalMatch ? totalMatch[1] : articles.length;
        state.status = `${total} 篇文章已处理，${success} 篇获取成功`;

        updateWidget(state);
    })
    .catch(err => {
        if (err.name === 'AbortError') {
            removeWidget();
            return;
        }
        state.done = true;
        state.error = err.message;
        state.status = `导出失败: ${err.message}`;
        updateWidget(state);
    });
}
