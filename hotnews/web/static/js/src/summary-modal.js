/**
 * Summary Modal Module
 * One-click article summarization with auto-classification
 */

import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';
import { openTodoPanel, closeTodoPanel, batchAddTodos, addTodo, getCurrentTodoCount, loadTodos, initSelectionTodo } from './todo.js';

let isModalOpen = false;
let currentNewsId = null;
let currentNewsTitle = null;
let currentNewsUrl = null;
let slowLoadingTimer = null;

// Timeout before showing "view original" hint (in ms)
const SLOW_LOADING_TIMEOUT = 10000;

/**
 * Clear slow loading timer
 */
function clearSlowLoadingTimer() {
    if (slowLoadingTimer) {
        clearTimeout(slowLoadingTimer);
        slowLoadingTimer = null;
    }
}

/**
 * Article type icons - V4 (10 types + general)
 */
const TYPE_ICONS = {
    'news': '📰',
    'policy': '⚠️',
    'business': '📊',
    'tutorial': '✅',
    'research': '📚',
    'product': '🚀',
    'opinion': '💭',
    'interview': '💬',
    'listicle': '📑',
    'lifestyle': '✅',
    'general': '📝',
    // Legacy mappings for backward compatibility
    'tech-tutorial': '✅',
    'trend': '📊',
    'other': '📝'
};

/**
 * Format token display - only show current consumption (e.g., "2.3K")
 * @param {number} currentTokens - tokens used for this summary
 * @returns {string} formatted string like "2.3K"
 */
function formatTokenDisplay(currentTokens) {
    const tokens = currentTokens || 0;
    if (tokens >= 1000) {
        return (tokens / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    }
    return tokens.toString();
}

/**
 * Strip tags block from summary text for display
 * Removes [TAGS_START]...[TAGS_END] or [TAGSSTART]...[TAGSEND] blocks
 */
function stripTagsBlock(text) {
    if (!text) return text;
    // Match various formats: [TAGS_START], [TAGSSTART], with or without underscore, case insensitive
    // Also handle mismatched tags like [TAGSSTART]...[TAGS_END]
    let result = text.replace(/\[TAGS_?START\][\s\S]*?\[TAGS_?END\]/gi, '');
    // Clean up any trailing dashes or whitespace
    result = result.replace(/\n*-{3,}\s*$/g, '');
    return result.trim();
}

/**
 * Render Markdown to HTML - improved version
 */
function renderMarkdown(text) {
    if (!text) return '';
    
    // Pre-process: convert HTML br tags to newlines before escaping
    let html = text
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/br>/gi, '\n');
    
    // Escape HTML
    html = html
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
    
    // Add "添加到 Todo" button after action list header (multiple patterns)
    // Match: ✅ 行动清单, ✅行动清单, 行动清单, 📋 行动清单 etc.
    html = html.replace(
        /(<h[1-3]>(?:✅\s*|📋\s*)?行动清单\s*<\/h[1-3]>)/gi,
        '<div class="action-list-header">$1<button class="action-list-add-btn" onclick="addActionListToTodo()">+ Todo</button></div>'
    );
    
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
                    <h2 id="summaryModalTitle">✨ AI 总结</h2>
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
    const modalTitle = document.getElementById('summaryModalTitle');
    const body = document.getElementById('summaryModalBody');
    const footer = document.getElementById('summaryModalFooter');
    
    currentNewsId = newsId;
    currentNewsTitle = title;
    currentNewsUrl = url;
    isModalOpen = true;
    
    // Expose to window for selection todo
    window._currentSummaryNewsId = newsId;
    window._currentSummaryNewsTitle = title;
    window._currentSummaryNewsUrl = url;
    
    // Initialize selection todo (only once)
    initSelectionTodo();
    
    // Set modal title to news title
    if (modalTitle) {
        const displayTitle = title && title.length > 50 ? title.substring(0, 50) + '...' : (title || 'AI 总结');
        modalTitle.textContent = `✨ ${displayTitle}`;
    }
    
    // Show modal with loading state
    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
    
    body.innerHTML = `
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">正在获取文章内容...</div>
                <div class="summary-loading-hint">首次总结需要 10-30 秒</div>
                <div id="summarySlowHint" class="summary-slow-hint" style="display:none;">
                    <span>加载较慢？</span>
                    <a href="${url}" target="_blank" rel="noopener noreferrer" class="summary-slow-link">先看原文 →</a>
                </div>
            </div>
        </div>
    `;
    footer.style.display = 'none';
    
    // Start slow loading timer - after timeout, stop spinner and show direct link
    clearSlowLoadingTimer();
    slowLoadingTimer = setTimeout(() => {
        // Stop the loading spinner and show direct link to original article
        body.innerHTML = `
            <div class="summary-timeout">
                <div class="summary-timeout-icon">🛡️</div>
                <div class="summary-timeout-text">该网站防护较强，暂时无法获取内容</div>
                <div class="summary-timeout-subtext">建议直接阅读原文，体验更佳</div>
                <a href="${url}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                    📖 阅读原文
                </a>
            </div>
        `;
    }, SLOW_LOADING_TIMEOUT);
    
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
                            // Article type determined with confidence
                            articleType = data.article_type;
                            articleTypeName = data.article_type_name;
                            // Store confidence for footer display
                            window._currentTypeConfidence = data.confidence || 0;
                            break;
                            
                        case 'chunk':
                            // Streaming content chunk
                            if (!isStreaming) {
                                // First chunk - switch to content view
                                isStreaming = true;
                                clearSlowLoadingTimer(); // Content arrived, no need for slow hint
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
                            clearSlowLoadingTimer(); // Content arrived
                            fullContent = data.summary;
                            articleType = data.article_type;
                            articleTypeName = data.article_type_name;
                            tokenUsage = data.token_usage || null;
                            const cachedFeedback = data.feedback || null;
                            // Balance info is now included in cached response
                            const cachedBalanceInfo = (data.token_balance !== undefined) ? {
                                token_balance: data.token_balance,
                                tokens_used: data.tokens_used,
                                default_tokens: 100000
                            } : null;
                            // Strip tags block before rendering (same as done event)
                            const cachedDisplayContent = stripTagsBlock(fullContent);
                            body.innerHTML = `
                                <div class="summary-content">
                                    ${renderMarkdown(cachedDisplayContent)}
                                </div>
                            `;
                            showFooter(url, articleType, articleTypeName, true, tokenUsage, cachedFeedback, cachedBalanceInfo);
                            updateNewsItemButton(newsId, true);
                            
                            // Apply tags for cached summary too
                            if (data.tags && window.ArticleTags) {
                                console.log('[Summary] Applying cached tags for newsId:', newsId, 'tags:', data.tags);
                                let cachedNewsItem = document.querySelector(`.news-item[data-news-id="${newsId}"]`);
                                if (!cachedNewsItem) {
                                    cachedNewsItem = document.querySelector(`.news-item[data-url="${url}"]`);
                                }
                                if (cachedNewsItem) {
                                    console.log('[Summary] Found news item for cached, applying tags');
                                    window.ArticleTags.applyTags(cachedNewsItem, data.tags);
                                    cachedNewsItem.dataset.tagsLoaded = 'true';
                                }
                            }
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
                                // Strip tags block before final render
                                const displayContent = stripTagsBlock(fullContent);
                                finalEl.innerHTML = renderMarkdown(displayContent);
                            }
                            // Pass confidence to footer
                            const typeConfidence = window._currentTypeConfidence || 0;
                            showFooter(url, articleType, articleTypeName, false, tokenUsage, null, doneBalanceInfo, typeConfidence);
                            updateNewsItemButton(newsId, true);
                            
                            // Apply tags immediately after summary completes
                            if (data.tags && window.ArticleTags) {
                                console.log('[Summary] Applying tags for newsId:', newsId, 'tags:', data.tags);
                                // Try multiple selectors to find the news item
                                let newsItem = document.querySelector(`.news-item[data-news-id="${newsId}"]`);
                                if (!newsItem) {
                                    // Fallback: find by URL
                                    newsItem = document.querySelector(`.news-item[data-url="${url}"]`);
                                }
                                if (newsItem) {
                                    console.log('[Summary] Found news item, applying tags');
                                    window.ArticleTags.applyTags(newsItem, data.tags);
                                    newsItem.dataset.tagsLoaded = 'true';
                                } else {
                                    console.log('[Summary] News item not found in DOM');
                                }
                            }
                            break;
                            
                        case 'short_content':
                            // Content too short - show suggestion to read original
                            clearSlowLoadingTimer();
                            body.innerHTML = `
                                <div class="summary-short-content">
                                    <div class="short-content-icon">📄</div>
                                    <div class="short-content-message">${data.message}</div>
                                    <div class="short-content-length">文章长度：${data.content_length} 字</div>
                                    ${data.preview ? `<div class="short-content-preview">${data.preview}</div>` : ''}
                                    <div class="short-content-actions">
                                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="short-content-btn primary">
                                            📖 阅读原文
                                        </a>
                                        <button class="short-content-btn secondary" onclick="forceSummary('${newsId}', '${encodeURIComponent(title)}', '${encodeURIComponent(url)}', '${sourceId || ''}', '${encodeURIComponent(sourceName || '')}')">
                                            ✨ 仍要总结
                                        </button>
                                    </div>
                                </div>
                            `;
                            footer.style.display = 'none';
                            return;
                            
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
        clearSlowLoadingTimer();
        
        // Check if it's a content access error
        const isAccessError = e.message && (
            e.message.includes('访问限制') || 
            e.message.includes('无法获取') ||
            e.message.includes('无法访问') ||
            e.message.includes('请求失败')
        );
        
        if (isAccessError) {
            body.innerHTML = `
                <div class="summary-access-error">
                    <div class="summary-access-error-icon">🔒</div>
                    <div class="summary-access-error-title">暂时无法获取内容</div>
                    <div class="summary-access-error-text">该网站设置了访问保护，建议直接阅读原文</div>
                    <div class="summary-access-error-actions">
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="summary-view-original-btn">
                            📖 阅读原文
                        </a>
                        <button class="summary-retry-btn-secondary" onclick="retrySummaryModal()">重试</button>
                    </div>
                </div>
            `;
        } else {
            body.innerHTML = `
                <div class="summary-error">
                    <div class="summary-error-icon">😅</div>
                    <div class="summary-error-text">${e.message}</div>
                    <div class="summary-error-actions">
                        <button class="summary-retry-btn" onclick="retrySummaryModal()">重试</button>
                        <a href="${url}" target="_blank" rel="noopener noreferrer" class="summary-link-btn-secondary">查看原文</a>
                    </div>
                </div>
            `;
        }
    }
}

/**
 * Show footer with type tag, token usage and actions
 * V4: Shows article type (read-only, no selector)
 */
function showFooter(url, articleType, articleTypeName, isCached, tokenUsage, feedback = null, balanceInfo = null, confidence = null) {
    const footer = document.getElementById('summaryModalFooter');
    const typeIcon = TYPE_ICONS[articleType] || '📝';
    
    // Format token display: only show current consumption (e.g., "2.3K")
    let tokenDisplay = '';
    const currentTokens = tokenUsage?.total_tokens || 0;
    if (currentTokens > 0) {
        const tokenText = formatTokenDisplay(currentTokens);
        tokenDisplay = `<span class="summary-token-tag" title="本次消耗">🪙 ${tokenText}</span>`;
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
            <button class="summary-todo-btn" id="summaryTodoToggleBtn" onclick="toggleCurrentTodoPanel()" title="查看 Todo">
                📋 Todo
            </button>
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
    clearSlowLoadingTimer();
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
 * Force summary generation even for short content
 */
async function forceSummary(newsId, encodedTitle, encodedUrl, sourceId, encodedSourceName) {
    const title = decodeURIComponent(encodedTitle);
    const url = decodeURIComponent(encodedUrl);
    const sourceName = decodeURIComponent(encodedSourceName);
    
    // Call the force endpoint
    openSummaryModalForce(newsId, title, url, sourceId, sourceName);
}

/**
 * Open summary modal with force flag (skip short content check)
 */
async function openSummaryModalForce(newsId, title, url, sourceId, sourceName) {
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
    currentNewsTitle = title;
    currentNewsUrl = url;
    
    // Show loading state
    body.innerHTML = `
        <div class="summary-loading">
            <div class="summary-loading-spinner"></div>
            <div class="summary-loading-text">
                <div id="summaryStatusText">正在生成总结...</div>
            </div>
        </div>
    `;
    footer.style.display = 'none';
    
    try {
        // Use force endpoint
        const res = await fetch('/api/summary/stream?force=1', {
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
        
        // Process SSE stream (same as normal flow)
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
                            const statusEl = document.getElementById('summaryStatusText');
                            if (statusEl) statusEl.textContent = data.message;
                            break;
                            
                        case 'type':
                            articleType = data.article_type;
                            articleTypeName = data.article_type_name;
                            break;
                            
                        case 'chunk':
                            if (!isStreaming) {
                                isStreaming = true;
                                body.innerHTML = `
                                    <div class="summary-content summary-streaming" id="summaryStreamContent">
                                        <div class="summary-cursor"></div>
                                    </div>
                                `;
                            }
                            fullContent += data.content;
                            const contentEl = document.getElementById('summaryStreamContent');
                            if (contentEl) {
                                contentEl.innerHTML = renderMarkdown(fullContent) + '<span class="summary-cursor">▌</span>';
                                contentEl.scrollTop = contentEl.scrollHeight;
                            }
                            break;
                            
                        case 'done':
                            tokenUsage = data.token_usage || null;
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
                            
                            if (data.tags && window.ArticleTags) {
                                let newsItem = document.querySelector(`.news-item[data-news-id="${newsId}"]`);
                                if (!newsItem) newsItem = document.querySelector(`.news-item[data-url="${url}"]`);
                                if (newsItem) {
                                    window.ArticleTags.applyTags(newsItem, data.tags);
                                    newsItem.dataset.tagsLoaded = 'true';
                                }
                            }
                            break;
                            
                        case 'error':
                            throw new Error(data.message);
                    }
                } catch (parseErr) {
                    if (parseErr.message && !parseErr.message.includes('JSON')) {
                        throw parseErr;
                    }
                }
            }
        }
        
    } catch (e) {
        console.error('[Summary] Force error:', e);
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

// Reload summarized list when user returns to the page (cross-device sync)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        // Debounce: only reload if page was hidden for more than 30 seconds
        const lastLoad = window._lastSummarizedListLoad || 0;
        const now = Date.now();
        if (now - lastLoad > 30000) {
            console.log('[Summary] Page visible, reloading summarized list');
            loadSummarizedList();
        }
    }
});

// Track last load time
const originalLoadSummarizedList = loadSummarizedList;
loadSummarizedList = async function() {
    window._lastSummarizedListLoad = Date.now();
    return originalLoadSummarizedList();
};

/**
 * Open Todo panel for current news
 */
function openCurrentTodoPanel() {
    if (!currentNewsId || !currentNewsTitle) return;
    openTodoPanel(currentNewsId, currentNewsTitle, currentNewsUrl);
    updateTodoToggleButton(true);
}

/**
 * Toggle Todo panel for current news (open/close)
 */
function toggleCurrentTodoPanel() {
    if (!currentNewsId || !currentNewsTitle) return;
    
    const panel = document.getElementById('summaryTodoPanel');
    const isOpen = panel && panel.classList.contains('open');
    
    if (isOpen) {
        closeTodoPanel();
        updateTodoToggleButton(false);
    } else {
        openTodoPanel(currentNewsId, currentNewsTitle, currentNewsUrl);
        updateTodoToggleButton(true);
    }
}

/**
 * Update Todo toggle button active state
 */
function updateTodoToggleButton(isActive) {
    const btn = document.getElementById('summaryTodoToggleBtn');
    if (btn) {
        btn.classList.toggle('active', isActive);
    }
}

/**
 * Add action list items to Todo (行动清单一键添加)
 */
async function addActionListToTodo() {
    if (!currentNewsId || !currentNewsTitle) return;
    
    // Find action list section in the summary content
    const body = document.getElementById('summaryModalBody');
    if (!body) return;
    
    // Look for "✅ 行动清单" section and extract list items
    const content = body.innerHTML;
    const actionListMatch = content.match(/✅\s*行动清单[\s\S]*?<ul>([\s\S]*?)<\/ul>/i);
    
    if (!actionListMatch) {
        if (window.showToast) {
            window.showToast('未找到行动清单');
        }
        return;
    }
    
    // Extract list items
    const listHtml = actionListMatch[1];
    const itemMatches = listHtml.match(/<li>([\s\S]*?)<\/li>/gi) || [];
    
    const items = itemMatches.map(item => {
        // Remove HTML tags and clean up
        return item.replace(/<\/?li>/gi, '').replace(/<[^>]+>/g, '').trim();
    }).filter(item => item.length > 0);
    
    if (items.length === 0) {
        if (window.showToast) {
            window.showToast('行动清单为空');
        }
        return;
    }
    
    // Batch add to todo
    await batchAddTodos(items, {
        groupId: currentNewsId,
        groupTitle: currentNewsTitle,
        groupUrl: currentNewsUrl || '',
        isCustom: false
    });
}

// Expose to window
window.openSummaryModal = openSummaryModal;
window.closeSummaryModal = closeSummaryModal;
window.retrySummaryModal = retrySummaryModal;
window.regenerateSummaryModal = regenerateSummaryModal;
window.handleSummaryClick = handleSummaryClick;
window.loadSummarizedList = loadSummarizedList;
window.handleSummaryFeedback = handleSummaryFeedback;
window.openCurrentTodoPanel = openCurrentTodoPanel;
window.toggleCurrentTodoPanel = toggleCurrentTodoPanel;
window.addActionListToTodo = addActionListToTodo;
window.forceSummary = forceSummary;

export {
    openSummaryModal,
    closeSummaryModal,
    handleSummaryClick,
    loadSummarizedList,
    renderMarkdown
};
