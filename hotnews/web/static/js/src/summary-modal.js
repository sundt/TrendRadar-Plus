/**
 * Summary Modal Module
 * One-click article summarization with auto-classification
 */

import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';

let isModalOpen = false;
let currentNewsId = null;

/**
 * Article type icons
 */
const TYPE_ICONS = {
    'news': '📰',
    'tech-tutorial': '👨‍💻',
    'product': '🚀',
    'opinion': '⚖️',
    'research': '📚',
    'business': '💼',
    'trend': '📈',
    'lifestyle': '🌟',
    'other': '📝'
};

/**
 * Format token display as "本次/已用/剩余" (e.g., "6.6/13.2/86.8")
 * @param {number} currentTokens - tokens used for this summary
 * @param {number} tokensUsed - total tokens used by user
 * @param {number} tokenBalance - remaining token balance
 * @returns {string} formatted string like "6.6/13.2/86.8"
 */
function formatTokenDisplay(currentTokens, tokensUsed, tokenBalance) {
    const current = ((currentTokens || 0) / 1000).toFixed(1);
    const used = ((tokensUsed || 0) / 1000).toFixed(1);
    const remaining = ((tokenBalance || 0) / 1000).toFixed(1);
    return `${current}/${used}/${remaining}`;
}

/**
 * Check if token balance is low (remaining < 10K)
 * @param {number} tokenBalance - current balance
 * @returns {boolean}
 */
function isLowBalance(tokenBalance) {
    return (tokenBalance || 0) < 10000;
}

/**
 * Render Markdown to HTML - improved version
 */
function renderMarkdown(text) {
    if (!text) return '';
    
    // Escape HTML
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Code blocks (must be before other processing)
    html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>');
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Headers (with optional leading #)
    html = html.replace(/^#{4}\s+(.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^#{3}\s+(.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^#{2}\s+(.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^#{1}\s+(.+)$/gm, '<h1>$1</h1>');
    
    // Bold and italic (handle ** and * properly)
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    html = html.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Blockquotes (> at start of line)
    html = html.replace(/^&gt;\s*(.*)$/gm, '<blockquote>$1</blockquote>');
    // Merge consecutive blockquotes
    html = html.replace(/<\/blockquote>\n<blockquote>/g, '\n');
    
    // Horizontal rules (---, ***, ___) - only when alone on a line
    html = html.replace(/^[-]{3,}\s*$/gm, '<hr>');
    html = html.replace(/^[*]{3,}\s*$/gm, '<hr>');
    html = html.replace(/^[_]{3,}\s*$/gm, '<hr>');
    
    // Process line by line for lists and tables
    const lines = html.split('\n');
    let result = [];
    let inTable = false;
    let tableRows = [];
    let inList = false;
    let listItems = [];
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmedLine = line.trim();
        
        // Check for table row
        const isTableRow = /^\|(.+)\|$/.test(trimmedLine);
        const isTableSeparator = /^\|[\s\-:|]+\|$/.test(trimmedLine);
        
        // Check for list item (- or * followed by space, or numbered list)
        const unorderedMatch = trimmedLine.match(/^[-*]\s+(.+)$/);
        const orderedMatch = trimmedLine.match(/^\d+\.\s+(.+)$/);
        const isListItem = unorderedMatch || orderedMatch;
        
        // Handle table
        if (isTableRow) {
            // Close any open list first
            if (inList && listItems.length > 0) {
                result.push('<ul>' + listItems.join('') + '</ul>');
                listItems = [];
                inList = false;
            }
            
            if (!inTable) {
                inTable = true;
                tableRows = [];
            }
            if (!isTableSeparator) {
                const cells = trimmedLine.slice(1, -1).split('|').map(c => c.trim());
                const isHeader = tableRows.length === 0;
                const tag = isHeader ? 'th' : 'td';
                const row = '<tr>' + cells.map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
                tableRows.push(row);
            }
            continue;
        } else if (inTable && tableRows.length > 0) {
            result.push('<table>' + tableRows.join('') + '</table>');
            tableRows = [];
            inTable = false;
        }
        
        // Handle list item
        if (isListItem) {
            const content = unorderedMatch ? unorderedMatch[1] : orderedMatch[1];
            inList = true;
            listItems.push('<li>' + content + '</li>');
            continue;
        } else if (inList && listItems.length > 0) {
            result.push('<ul>' + listItems.join('') + '</ul>');
            listItems = [];
            inList = false;
        }
        
        result.push(line);
    }
    
    // Close any remaining table or list
    if (inTable && tableRows.length > 0) {
        result.push('<table>' + tableRows.join('') + '</table>');
    }
    if (inList && listItems.length > 0) {
        result.push('<ul>' + listItems.join('') + '</ul>');
    }
    
    html = result.join('\n');
    
    // Convert double newlines to paragraph breaks
    html = html.split(/\n{2,}/).map(block => {
        block = block.trim();
        if (!block) return '';
        // Don't wrap block elements
        if (/^<(h[1-6]|ul|ol|table|pre|blockquote|hr)/.test(block)) {
            return block;
        }
        // Don't wrap if it ends with a block element
        if (/<\/(h[1-6]|ul|ol|table|pre|blockquote)>$/.test(block)) {
            return block;
        }
        return '<p>' + block.replace(/\n/g, '<br>') + '</p>';
    }).join('\n');
    
    // Clean up empty paragraphs and stray tags
    html = html.replace(/<p>\s*<\/p>/g, '');
    html = html.replace(/<p><hr><\/p>/g, '<hr>');
    html = html.replace(/<p>(<table>)/g, '$1');
    html = html.replace(/(<\/table>)<\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\/ul>)<\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\/blockquote>)<\/p>/g, '$1');
    
    return html;
}

/**
 * Create modal HTML if not exists
 */
function ensureModalExists() {
    if (document.getElementById('summaryModal')) return;
    
    const modalHtml = `
        <div id="summaryModal" class="summary-modal">
            <div class="summary-modal-backdrop" onclick="closeSummaryModal()"></div>
            <div class="summary-modal-content">
                <button class="summary-modal-close" onclick="closeSummaryModal()" title="关闭">✕</button>
                <div class="summary-modal-header">
                    <h2>📝 AI 智能总结</h2>
                </div>
                <div class="summary-modal-body" id="summaryModalBody">
                    <!-- Content will be inserted here -->
                </div>
                <div class="summary-modal-footer" id="summaryModalFooter" style="display:none;">
                    <!-- Footer with type tag and actions -->
                </div>
            </div>
        </div>
    `;
    
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Open summary modal and generate summary with streaming
 */
async function openSummaryModal(newsId, title, url, sourceId, sourceName) {
    const user = authState.getUser();
    
    if (!user) {
        openLoginModal();
        return;
    }
    
    ensureModalExists();
    
    const modal = document.getElementById('summaryModal');
    const body = document.getElementById('summaryModalBody');
    const footer = document.getElementById('summaryModalFooter');
    
    currentNewsId = newsId;
    isModalOpen = true;
    
    // Show modal with loading state
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    body.innerHTML = `
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">正在获取文章内容...</div>
                <div class="summary-loading-hint">首次总结需要 10-30 秒</div>
            </div>
        </div>
    `;
    footer.style.display = 'none';
    
    try {
        // Use streaming endpoint
        const res = await fetch('/api/summary/stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: url,
                title: title,
                news_id: newsId,
                source_id: sourceId,
                source_name: sourceName
            })
        });
        
        if (!res.ok) {
            const errData = await res.json();
            throw new Error(errData.detail || '生成失败');
        }
        
        // Process SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        
        let fullContent = '';
        let articleType = 'other';
        let articleTypeName = '其他';
        let isStreaming = false;
        let tokenUsage = null;
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const text = decoder.decode(value, { stream: true });
            const lines = text.split('\n');
            
            for (const line of lines) {
                if (!line.startsWith('data: ')) continue;
                
                try {
                    const data = JSON.parse(line.slice(6));
                    
                    switch (data.type) {
                        case 'status':
                            // Update status text
                            const statusEl = document.getElementById('summaryStatusText');
                            if (statusEl) {
                                statusEl.textContent = data.message;
                            }
                            break;
                            
                        case 'type':
                            // Article type determined
                            articleType = data.article_type;
                            articleTypeName = data.article_type_name;
                            break;
                            
                        case 'chunk':
                            // Streaming content chunk
                            if (!isStreaming) {
                                // First chunk - switch to content view
                                isStreaming = true;
                                body.innerHTML = `
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `;
                            }
                            fullContent += data.content;
                            // Render incrementally
                            const contentEl = document.getElementById('summaryStreamContent');
                            if (contentEl) {
                                contentEl.innerHTML = renderMarkdown(fullContent) + '<span class="summary-cursor">▌</span>';
                                // Auto scroll to bottom
                                contentEl.scrollTop = contentEl.scrollHeight;
                            }
                            break;
                            
                        case 'cached':
                            // Cached summary - render immediately with token usage and feedback
                            fullContent = data.summary;
                            articleType = data.article_type;
                            articleTypeName = data.article_type_name;
                            tokenUsage = data.token_usage || null;
                            const cachedFeedback = data.feedback || null;
                            // For cached responses, fetch balance from API
                            let cachedBalanceInfo = null;
                            try {
                                const balanceRes = await fetch('/api/user/tokens');
                                if (balanceRes.ok) {
                                    cachedBalanceInfo = await balanceRes.json();
                                }
                            } catch (e) {
                                console.warn('[Summary] Failed to fetch balance:', e);
                            }
                            body.innerHTML = `
                                <div class="summary-content">
                                    ${renderMarkdown(fullContent)}
                                </div>
                            `;
                            showFooter(url, articleType, articleTypeName, true, tokenUsage, cachedFeedback, cachedBalanceInfo);
                            updateNewsItemButton(newsId, true);
                            return;
                            
                        case 'done':
                            // Streaming complete - extract token usage and balance
                            tokenUsage = data.token_usage || null;
                            // Balance info is included in done event for new generations
                            const doneBalanceInfo = (data.token_balance !== undefined) ? {
                                token_balance: data.token_balance,
                                tokens_used: data.tokens_used,
                                default_tokens: 100000
                            } : null;
                            const finalEl = document.getElementById('summaryStreamContent');
                            if (finalEl) {
                                finalEl.classList.remove('summary-streaming');
                                finalEl.innerHTML = renderMarkdown(fullContent);
                            }
                            showFooter(url, articleType, articleTypeName, false, tokenUsage, null, doneBalanceInfo);
                            updateNewsItemButton(newsId, true);
                            break;
                            
                        case 'error':
                            throw new Error(data.message);
                    }
                } catch (parseErr) {
                    // Ignore parse errors for incomplete chunks
                    if (parseErr.message && !parseErr.message.includes('JSON')) {
                        throw parseErr;
                    }
                }
            }
        }
        
    } catch (e) {
        console.error('[Summary] Error:', e);
        body.innerHTML = `
            <div class="summary-error">
                <div class="summary-error-icon">❌</div>
                <div class="summary-error-text">${e.message}</div>
                <button class="summary-retry-btn" onclick="retrySummaryModal()">重试</button>
            </div>
        `;
    }
}

/**
 * Show footer with type tag, token usage and actions
 */
function showFooter(url, articleType, articleTypeName, isCached, tokenUsage, feedback = null, balanceInfo = null) {
    const footer = document.getElementById('summaryModalFooter');
    const typeIcon = TYPE_ICONS[articleType] || '📝';
    
    // Format token display: "本次/已用/剩余" (e.g., "6.6/13.2/86.8")
    let tokenDisplay = '';
    const currentTokens = tokenUsage?.total_tokens || 0;
    if (balanceInfo && balanceInfo.tokens_used !== undefined) {
        const tokenText = formatTokenDisplay(currentTokens, balanceInfo.tokens_used, balanceInfo.token_balance);
        const lowBalanceClass = isLowBalance(balanceInfo.token_balance) ? 'low-balance' : '';
        tokenDisplay = `<span class="summary-token-tag ${lowBalanceClass}" title="本次/已用/剩余 (K tokens)">🪙 ${tokenText}</span>`;
    }
    
    // Feedback button active states
    const upActive = feedback === 'up' ? 'active' : '';
    const downActive = feedback === 'down' ? 'active' : '';
    
    footer.innerHTML = `
        <div class="summary-footer-left">
            ${tokenDisplay}
            <span class="summary-type-tag">${typeIcon} ${articleTypeName}</span>
            <div class="summary-feedback">
                <button class="summary-feedback-btn ${upActive}" data-vote="up" onclick="handleSummaryFeedback('up')" title="有帮助">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                    </svg>
                </button>
                <span class="summary-feedback-divider"></span>
                <button class="summary-feedback-btn ${downActive}" data-vote="down" onclick="handleSummaryFeedback('down')" title="需改进">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="summary-footer-right">
            <a href="${url}" target="_blank" rel="noopener noreferrer" class="summary-link-btn">
                🔗 查看原文
            </a>
            <button class="summary-regenerate-btn" onclick="regenerateSummaryModal()">
                🔄 重新生成
            </button>
        </div>
    `;
    footer.style.display = 'flex';
}

/**
 * Handle summary feedback (thumbs up/down)
 */
async function handleSummaryFeedback(vote) {
    if (!currentNewsId) return;
    
    const btns = document.querySelectorAll('.summary-feedback-btn');
    const clickedBtn = document.querySelector(`.summary-feedback-btn[data-vote="${vote}"]`);
    const isActive = clickedBtn?.classList.contains('active');
    
    // Determine new vote: if clicking active button, clear it; otherwise set new vote
    const newVote = isActive ? 'none' : vote;
    
    // Update UI immediately
    btns.forEach(btn => btn.classList.remove('active'));
    if (newVote !== 'none') {
        clickedBtn?.classList.add('active');
    }
    
    // Send to backend
    try {
        const res = await fetch(`/api/summary/${encodeURIComponent(currentNewsId)}/feedback`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ vote: newVote })
        });
        
        if (!res.ok) {
            console.error('[Summary] Feedback failed:', await res.text());
        }
    } catch (e) {
        console.error('[Summary] Feedback error:', e);
    }
}

/**
 * Close summary modal
 */
function closeSummaryModal() {
    const modal = document.getElementById('summaryModal');
    if (modal) {
        modal.classList.remove('open');
        document.body.style.overflow = '';
    }
    isModalOpen = false;
    currentNewsId = null;
}

/**
 * Retry summary generation
 */
function retrySummaryModal() {
    // Get the original parameters from the button
    const btn = document.querySelector(`.news-summary-btn[data-news-id="${currentNewsId}"]`);
    if (btn) {
        const title = btn.dataset.title;
        const url = btn.dataset.url;
        const sourceId = btn.dataset.sourceId;
        const sourceName = btn.dataset.sourceName;
        openSummaryModal(currentNewsId, title, url, sourceId, sourceName);
    }
}

/**
 * Regenerate summary (delete cache first)
 */
async function regenerateSummaryModal() {
    if (!currentNewsId) return;
    
    // Delete cached summary
    try {
        await fetch(`/api/summary/${encodeURIComponent(currentNewsId)}`, {
            method: 'DELETE'
        });
    } catch (e) {
        console.error('[Summary] Delete error:', e);
    }
    
    // Retry
    retrySummaryModal();
}

/**
 * Update news item button and indicator state
 */
function updateNewsItemButton(newsId, hasSummary) {
    // Update summary button
    const btn = document.querySelector(`.news-summary-btn[data-news-id="${newsId}"]`);
    if (btn) {
        btn.classList.toggle('has-summary', hasSummary);
        btn.title = hasSummary ? '查看总结' : 'AI 总结';
    }
    
    // Update news item (for green index)
    const item = document.querySelector(`.news-item[data-news-id="${newsId}"]`);
    if (item) {
        item.classList.toggle('has-summary', hasSummary);
    }
}

/**
 * Handle summary button click (called from news list)
 */
function handleSummaryClick(event, newsId, title, url, sourceId, sourceName) {
    event.preventDefault();
    event.stopPropagation();
    openSummaryModal(newsId, title, url, sourceId, sourceName);
}

/**
 * Load list of summarized news_ids and mark them on the page
 */
async function loadSummarizedList() {
    try {
        const res = await fetch('/api/summary/list');
        if (!res.ok) return;
        
        const data = await res.json();
        if (!data.ok || !data.news_ids) return;
        
        const newsIds = new Set(data.news_ids);
        if (newsIds.size === 0) return;
        
        // Mark all news items that have summaries
        document.querySelectorAll('.news-item[data-news-id]').forEach(item => {
            const newsId = item.getAttribute('data-news-id');
            if (newsIds.has(newsId)) {
                item.classList.add('has-summary');
            }
        });
        
        // Mark all summary buttons
        document.querySelectorAll('.news-summary-btn[data-news-id]').forEach(btn => {
            const newsId = btn.getAttribute('data-news-id');
            if (newsIds.has(newsId)) {
                btn.classList.add('has-summary');
                btn.title = '查看总结';
            }
        });
        
        console.log(`[Summary] Marked ${newsIds.size} summarized items`);
    } catch (e) {
        console.error('[Summary] Failed to load summarized list:', e);
    }
}

// Load summarized list on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(loadSummarizedList, 500);
    });
} else {
    setTimeout(loadSummarizedList, 500);
}

// Expose to window
window.openSummaryModal = openSummaryModal;
window.closeSummaryModal = closeSummaryModal;
window.retrySummaryModal = retrySummaryModal;
window.regenerateSummaryModal = regenerateSummaryModal;
window.handleSummaryClick = handleSummaryClick;
window.loadSummarizedList = loadSummarizedList;
window.handleSummaryFeedback = handleSummaryFeedback;

export {
    openSummaryModal,
    closeSummaryModal,
    handleSummaryClick,
    loadSummarizedList
};
