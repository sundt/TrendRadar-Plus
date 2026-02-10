/**
 * comment-preview.js
 * 新闻评论按钮：hover 预览摘要，click 打开完整评论面板
 */

import { ready } from './core.js';
import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';

const SHOW_DELAY = 300;
const HIDE_DELAY = 400;
let showTimer = null;
let hideTimer = null;
let activePopup = null;
let activePanel = null;
let commentCache = {};
let fullCommentCache = {};

// Allowed emoji reactions (must match backend)
const ALLOWED_EMOJIS = ['👍', '🔥', '😂', '🤔', '❤️', '👀', '🎉', '💯'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str || '';
  return div.innerHTML;
}

function formatTime(ts) {
  if (!ts) return '';
  const now = Math.floor(Date.now() / 1000);
  const diff = now - ts;
  if (diff < 60) return '刚刚';
  if (diff < 3600) return Math.floor(diff / 60) + '分钟前';
  if (diff < 86400) return Math.floor(diff / 3600) + '小时前';
  if (diff < 2592000) return Math.floor(diff / 86400) + '天前';
  const d = new Date(ts * 1000);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function cacheKey(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function fetchCommentSummary(url) {
  const k = cacheKey(url);
  if (commentCache[k]) return commentCache[k];
  try {
    const params = new URLSearchParams({ url, summary: '1' });
    const resp = await fetch(`/api/comments?${params}`, { credentials: 'include' });
    const result = await resp.json();
    if (result.success && result.data) {
      commentCache[k] = result.data;
      return result.data;
    }
  } catch (e) {
    console.warn('[comment-preview] fetch summary error:', e);
  }
  return null;
}

async function fetchFullComments(url) {
  try {
    const params = new URLSearchParams({ url });
    const resp = await fetch(`/api/comments?${params}`, { credentials: 'include' });
    const result = await resp.json();
    if (result.success && Array.isArray(result.data)) {
      fullCommentCache[cacheKey(url)] = result.data;
      return result.data;
    }
  } catch (e) {
    console.warn('[comment-preview] fetch full error:', e);
  }
  return null;
}

async function postComment(articleUrl, articleTitle, content) {
  const resp = await fetch('/api/comments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ article_url: articleUrl, article_title: articleTitle, content }),
  });
  return resp.json();
}

async function postReply(commentId, content) {
  const resp = await fetch(`/api/comments/${commentId}/reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ content }),
  });
  return resp.json();
}

async function toggleReaction(commentId, emoji) {
  const resp = await fetch(`/api/comments/${commentId}/react`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ emoji }),
  });
  return resp.json();
}

async function deleteComment(commentId) {
  const resp = await fetch(`/api/comments/${commentId}`, {
    method: 'DELETE',
    credentials: 'include',
  });
  return resp.json();
}

// ---------------------------------------------------------------------------
// Hover preview popup (lightweight summary)
// ---------------------------------------------------------------------------

function createPreviewPopup(data, triggerEl, articleUrl) {
  removePopup();

  const popup = document.createElement('div');
  popup.className = 'hn-comment-preview-popup';

  const header = `<div class="hn-cpp-header">💬 ${data.count} 条评论${data.view_count ? ` · 👁 ${data.view_count}人看过` : ''}</div>`;

  let items = '';
  if (data.count === 0) {
    items = '<div class="hn-cpp-empty">暂无评论，点击发表第一条</div>';
  } else {
    items = (data.latest || []).map(c => {
      const quote = c.selected_text
        ? `<span class="hn-cpp-quote">"${escapeHtml(c.selected_text.length > 20 ? c.selected_text.slice(0, 20) + '...' : c.selected_text)}"</span> `
        : '';
      return `<div class="hn-cpp-item"><span class="hn-cpp-name">${escapeHtml(c.user_name || '匿名')}</span>：${quote}${escapeHtml(c.content.length > 40 ? c.content.slice(0, 40) + '...' : c.content)}</div>`;
    }).join('');
  }

  popup.innerHTML = `${header}<div class="hn-cpp-list">${items}</div><div class="hn-cpp-footer">点击查看全部评论</div>`;

  document.body.appendChild(popup);

  // Position near trigger
  const rect = triggerEl.getBoundingClientRect();
  const popupWidth = 300;
  const gap = 8;
  let top = rect.bottom + gap;
  let left = Math.max(gap, Math.min(rect.left, window.innerWidth - popupWidth - gap));
  if (top + 200 > window.innerHeight) {
    top = Math.max(gap, rect.top - 200 - gap);
  }
  popup.style.top = top + 'px';
  popup.style.left = left + 'px';

  popup.addEventListener('mouseenter', () => clearTimeout(hideTimer));
  popup.addEventListener('mouseleave', () => {
    hideTimer = setTimeout(removePopup, HIDE_DELAY);
  });

  activePopup = popup;
}

function removePopup() {
  if (activePopup) {
    activePopup.remove();
    activePopup = null;
  }
}

// ---------------------------------------------------------------------------
// Full comment panel (click to open)
// ---------------------------------------------------------------------------

function removePanel() {
  if (activePanel) {
    activePanel.remove();
    activePanel = null;
  }
}

function renderReactions(comment) {
  const reactions = comment.reactions || {};
  const myReactions = comment.my_reactions || [];
  let html = '<div class="hn-cp-reactions">';
  for (const emoji of ALLOWED_EMOJIS) {
    const count = reactions[emoji] || 0;
    const isMine = myReactions.includes(emoji);
    if (count > 0 || isMine) {
      html += `<button class="hn-cp-reaction${isMine ? ' active' : ''}" data-comment-id="${comment.id}" data-emoji="${emoji}">${emoji} ${count}</button>`;
    }
  }
  // Add emoji picker trigger
  html += `<button class="hn-cp-reaction hn-cp-add-reaction" data-comment-id="${comment.id}">+</button>`;
  html += '</div>';
  return html;
}

function renderComment(c, depth = 0) {
  const avatar = c.user_avatar
    ? `<img class="hn-cp-avatar" src="${escapeHtml(c.user_avatar)}" alt="" />`
    : `<div class="hn-cp-avatar hn-cp-avatar-placeholder">${escapeHtml((c.user_name || '?')[0])}</div>`;

  const replyTo = c.reply_to_user_name
    ? `<span class="hn-cp-reply-to">回复 ${escapeHtml(c.reply_to_user_name)}</span> `
    : '';

  const quote = c.selected_text
    ? `<div class="hn-cp-quote">"${escapeHtml(c.selected_text.length > 60 ? c.selected_text.slice(0, 60) + '...' : c.selected_text)}"</div>`
    : '';

  const deleteBtn = c.is_mine
    ? `<button class="hn-cp-delete" data-comment-id="${c.id}" title="删除">🗑️</button>`
    : '';

  const reactions = renderReactions(c);

  let html = `
    <div class="hn-cp-comment${depth > 0 ? ' hn-cp-reply' : ''}" data-comment-id="${c.id}">
      <div class="hn-cp-comment-header">
        ${avatar}
        <span class="hn-cp-name">${escapeHtml(c.user_name || '匿名')}</span>
        <span class="hn-cp-time">${formatTime(c.created_at)}</span>
        ${deleteBtn}
      </div>
      ${quote}
      <div class="hn-cp-content">${replyTo}${escapeHtml(c.content)}</div>
      ${reactions}
      <button class="hn-cp-reply-btn" data-comment-id="${c.id}" data-user-name="${escapeHtml(c.user_name || '匿名')}">回复</button>
    </div>`;

  if (c.replies && c.replies.length > 0) {
    html += '<div class="hn-cp-replies">';
    for (const r of c.replies) {
      html += renderComment(r, depth + 1);
    }
    html += '</div>';
  }

  return html;
}

async function openCommentPanel(articleUrl, articleTitle, triggerEl) {
  removePopup();
  removePanel();

  const panel = document.createElement('div');
  panel.className = 'hn-comment-panel';

  // Loading state
  panel.innerHTML = '<div class="hn-cp-loading">加载评论中...</div>';
  document.body.appendChild(panel);

  // Position near trigger
  const rect = triggerEl.getBoundingClientRect();
  const panelWidth = 360;
  const gap = 8;
  let left = Math.max(gap, Math.min(rect.right - panelWidth, window.innerWidth - panelWidth - gap));
  let top = rect.bottom + gap;
  if (top + 400 > window.innerHeight) {
    top = Math.max(gap, rect.top - 400 - gap);
  }
  panel.style.top = top + 'px';
  panel.style.left = left + 'px';

  activePanel = panel;

  // Fetch full comments
  const comments = await fetchFullComments(articleUrl);

  if (!activePanel || activePanel !== panel) return; // panel was closed

  const isLoggedIn = authState.isLoggedIn();
  const hasExtension = document.documentElement.getAttribute('data-hotnews-summarizer') === 'installed';

  // Extension install hint
  const extensionHint = hasExtension ? '' : `
    <div class="hn-cp-extension-hint">
      <span>💡 安装浏览器插件可选中文字评论</span>
      <a href="/extension-install" target="_blank">去安装</a>
    </div>`;

  // Comment input area
  const inputArea = isLoggedIn ? `
    <div class="hn-cp-input-area">
      <textarea class="hn-cp-textarea" placeholder="写下你的评论..." rows="2"></textarea>
      <button class="hn-cp-submit">发送</button>
    </div>` : `
    <div class="hn-cp-login-hint" style="padding:12px;text-align:center;color:#6b7280;font-size:13px;">
      <span>登录后可发表评论</span>
      <button class="hn-cp-login-btn">登录</button>
    </div>`;

  // Render comments
  const commentCount = comments ? comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0) : 0;
  let commentsHtml = '';
  if (comments && comments.length > 0) {
    commentsHtml = comments.map(c => renderComment(c)).join('');
  } else {
    commentsHtml = '<div class="hn-cp-empty">暂无评论，来发表第一条吧</div>';
  }

  panel.innerHTML = `
    <div class="hn-cp-header">
      <span>💬 ${commentCount} 条评论</span>
      <button class="hn-cp-close" title="关闭">✕</button>
    </div>
    ${extensionHint}
    ${inputArea}
    <div class="hn-cp-list">${commentsHtml}</div>`;

  // Bind events
  bindPanelEvents(panel, articleUrl, articleTitle);
}

function bindPanelEvents(panel, articleUrl, articleTitle) {
  // Close button
  panel.querySelector('.hn-cp-close')?.addEventListener('click', removePanel);

  // Login button
  panel.querySelector('.hn-cp-login-btn')?.addEventListener('click', () => {
    removePanel();
    openLoginModal();
  });

  // Submit comment
  const submitBtn = panel.querySelector('.hn-cp-submit');
  const textarea = panel.querySelector('.hn-cp-textarea');
  if (submitBtn && textarea) {
    submitBtn.addEventListener('click', async () => {
      const content = textarea.value.trim();
      if (!content) return;
      submitBtn.disabled = true;
      submitBtn.textContent = '发送中...';
      try {
        const result = await postComment(articleUrl, articleTitle, content);
        if (result.success) {
          textarea.value = '';
          // Invalidate cache and reload
          delete commentCache[cacheKey(articleUrl)];
          delete fullCommentCache[cacheKey(articleUrl)];
          const comments = await fetchFullComments(articleUrl);
          refreshPanelComments(panel, comments, articleUrl, articleTitle);
        } else {
          alert(result.detail || result.error || '发送失败');
        }
      } catch (e) {
        alert('发送失败，请重试');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = '发送';
      }
    });
    // Ctrl+Enter to submit
    textarea.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        submitBtn.click();
      }
    });
  }

  // Delegate: reply, reaction, delete, emoji picker
  panel.addEventListener('click', async (e) => {
    const target = e.target;

    // Reply button
    if (target.classList.contains('hn-cp-reply-btn')) {
      if (!authState.isLoggedIn()) { removePanel(); openLoginModal(); return; }
      const commentId = target.dataset.commentId;
      const userName = target.dataset.userName;
      showReplyInput(panel, commentId, userName, articleUrl, articleTitle);
      return;
    }

    // Emoji reaction
    if (target.classList.contains('hn-cp-reaction') && !target.classList.contains('hn-cp-add-reaction')) {
      if (!authState.isLoggedIn()) { removePanel(); openLoginModal(); return; }
      const commentId = target.dataset.commentId;
      const emoji = target.dataset.emoji;
      try {
        await toggleReaction(commentId, emoji);
        delete fullCommentCache[cacheKey(articleUrl)];
        const comments = await fetchFullComments(articleUrl);
        refreshPanelComments(panel, comments, articleUrl, articleTitle);
      } catch (e) { console.warn('reaction error:', e); }
      return;
    }

    // Add reaction (emoji picker)
    if (target.classList.contains('hn-cp-add-reaction')) {
      if (!authState.isLoggedIn()) { removePanel(); openLoginModal(); return; }
      showEmojiPicker(target, articleUrl, articleTitle, panel);
      return;
    }

    // Delete comment
    if (target.classList.contains('hn-cp-delete')) {
      const commentId = target.dataset.commentId;
      if (!confirm('确定删除这条评论？')) return;
      try {
        const result = await deleteComment(commentId);
        if (result.success) {
          delete commentCache[cacheKey(articleUrl)];
          delete fullCommentCache[cacheKey(articleUrl)];
          const comments = await fetchFullComments(articleUrl);
          refreshPanelComments(panel, comments, articleUrl, articleTitle);
        }
      } catch (e) { console.warn('delete error:', e); }
      return;
    }
  });

  // Click outside to close
  setTimeout(() => {
    const outsideHandler = (e) => {
      if (activePanel && !activePanel.contains(e.target) && !e.target.closest('.news-comment-btn')) {
        removePanel();
        document.removeEventListener('mousedown', outsideHandler);
      }
    };
    document.addEventListener('mousedown', outsideHandler);
  }, 100);
}

function showReplyInput(panel, commentId, userName, articleUrl, articleTitle) {
  // Remove any existing reply input
  panel.querySelectorAll('.hn-cp-reply-input').forEach(el => el.remove());

  const commentEl = panel.querySelector(`.hn-cp-comment[data-comment-id="${commentId}"]`);
  if (!commentEl) return;

  const replyBox = document.createElement('div');
  replyBox.className = 'hn-cp-reply-input';
  replyBox.innerHTML = `
    <textarea class="hn-cp-textarea" placeholder="回复 ${escapeHtml(userName)}..." rows="2"></textarea>
    <div class="hn-cp-reply-actions">
      <button class="hn-cp-reply-cancel">取消</button>
      <button class="hn-cp-reply-submit">回复</button>
    </div>`;

  commentEl.appendChild(replyBox);

  const ta = replyBox.querySelector('textarea');
  ta.focus();

  replyBox.querySelector('.hn-cp-reply-cancel').addEventListener('click', () => replyBox.remove());
  replyBox.querySelector('.hn-cp-reply-submit').addEventListener('click', async () => {
    const content = ta.value.trim();
    if (!content) return;
    const btn = replyBox.querySelector('.hn-cp-reply-submit');
    btn.disabled = true;
    btn.textContent = '发送中...';
    try {
      const result = await postReply(commentId, content);
      if (result.success) {
        delete commentCache[cacheKey(articleUrl)];
        delete fullCommentCache[cacheKey(articleUrl)];
        const comments = await fetchFullComments(articleUrl);
        refreshPanelComments(panel, comments, articleUrl, articleTitle);
      } else {
        alert(result.detail || result.error || '回复失败');
      }
    } catch (e) {
      alert('回复失败，请重试');
    }
  });

  ta.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      replyBox.querySelector('.hn-cp-reply-submit').click();
    }
  });
}

function showEmojiPicker(triggerBtn, articleUrl, articleTitle, panel) {
  // Remove existing picker
  panel.querySelectorAll('.hn-cp-emoji-picker').forEach(el => el.remove());

  const commentId = triggerBtn.dataset.commentId;
  const picker = document.createElement('div');
  picker.className = 'hn-cp-emoji-picker';
  picker.innerHTML = ALLOWED_EMOJIS.map(e => `<button class="hn-cp-emoji-option" data-emoji="${e}">${e}</button>`).join('');

  triggerBtn.parentElement.appendChild(picker);

  picker.addEventListener('click', async (e) => {
    const emoji = e.target.dataset?.emoji;
    if (!emoji) return;
    picker.remove();
    try {
      await toggleReaction(commentId, emoji);
      delete fullCommentCache[cacheKey(articleUrl)];
      const comments = await fetchFullComments(articleUrl);
      refreshPanelComments(panel, comments, articleUrl, articleTitle);
    } catch (err) { console.warn('emoji error:', err); }
  });

  // Close picker on outside click
  setTimeout(() => {
    const handler = (ev) => {
      if (!picker.contains(ev.target)) {
        picker.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 50);
}

function refreshPanelComments(panel, comments, articleUrl, articleTitle) {
  const listEl = panel.querySelector('.hn-cp-list');
  const headerEl = panel.querySelector('.hn-cp-header span');
  if (!listEl) return;

  const commentCount = comments ? comments.reduce((n, c) => n + 1 + (c.replies?.length || 0), 0) : 0;
  if (headerEl) headerEl.textContent = `💬 ${commentCount} 条评论`;

  if (comments && comments.length > 0) {
    listEl.innerHTML = comments.map(c => renderComment(c)).join('');
  } else {
    listEl.innerHTML = '<div class="hn-cp-empty">暂无评论，来发表第一条吧</div>';
  }

  // Update comment button badge
  updateCommentBtnBadge(articleUrl, commentCount);
}

function updateCommentBtnBadge(url, count) {
  document.querySelectorAll(`.news-comment-btn[data-url="${CSS.escape ? url : url}"]`).forEach(btn => {
    if (count > 0) {
      btn.classList.add('has-comments');
      btn.setAttribute('data-count', count);
    } else {
      btn.classList.remove('has-comments');
      btn.removeAttribute('data-count');
    }
  });
}

// ---------------------------------------------------------------------------
// Badge on title (existing feature)
// ---------------------------------------------------------------------------

function addBadge(titleEl, count) {
  if (titleEl.querySelector('.hn-comment-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'hn-comment-badge';
  badge.textContent = `💬${count}`;
  badge.title = `${count} 条评论`;
  titleEl.appendChild(badge);
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function handleCommentBtnEnter(e) {
  const btn = e.target.closest('.news-comment-btn');
  if (!btn) return;
  const url = btn.dataset.url;
  if (!url || url === '#') return;

  clearTimeout(hideTimer);
  clearTimeout(showTimer);

  showTimer = setTimeout(async () => {
    // Don't show preview if panel is open
    if (activePanel) return;
    const data = await fetchCommentSummary(url);
    if (data) {
      createPreviewPopup(data, btn, url);
    }
  }, SHOW_DELAY);
}

function handleCommentBtnLeave() {
  clearTimeout(showTimer);
  hideTimer = setTimeout(removePopup, HIDE_DELAY);
}

function handleCommentBtnClick(e) {
  const btn = e.target.closest('.news-comment-btn');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();

  removePopup();

  const url = btn.dataset.url;
  const title = btn.dataset.title || '';
  if (!url || url === '#') return;

  openCommentPanel(url, title, btn);
}

// Title hover (existing feature - show badge)
async function handleTitleEnter(e) {
  const titleEl = e.target.closest('.news-title');
  if (!titleEl) return;
  const url = titleEl.href;
  if (!url || url === '#') return;

  clearTimeout(hideTimer);
  clearTimeout(showTimer);

  showTimer = setTimeout(async () => {
    if (activePanel) return;
    const data = await fetchCommentSummary(url);
    if (data && data.count > 0) {
      addBadge(titleEl, data.count);
      createPreviewPopup(data, titleEl, url);
    }
  }, SHOW_DELAY);
}

function handleTitleLeave() {
  clearTimeout(showTimer);
  hideTimer = setTimeout(removePopup, HIDE_DELAY);
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

export function initCommentPreview() {
  // Comment button hover
  document.addEventListener('mouseenter', (e) => {
    if (e.target.closest('.news-comment-btn')) handleCommentBtnEnter(e);
    else if (e.target.closest('.news-title')) handleTitleEnter(e);
  }, true);

  document.addEventListener('mouseleave', (e) => {
    if (e.target.closest('.news-comment-btn')) handleCommentBtnLeave();
    else if (e.target.closest('.news-title')) handleTitleLeave();
  }, true);

  // Comment button click
  document.addEventListener('click', (e) => {
    if (e.target.closest('.news-comment-btn')) handleCommentBtnClick(e);
  }, true);

  // Load badges for visible items
  setTimeout(loadVisibleBadges, 2000);
}

async function loadVisibleBadges() {
  const titles = document.querySelectorAll('.news-title');
  const urls = [];
  titles.forEach((el, i) => {
    if (i < 50 && el.href && el.href !== '#') {
      urls.push({ el, url: el.href });
    }
  });

  for (const { el, url } of urls) {
    const data = await fetchCommentSummary(url);
    if (data && data.count > 0) {
      addBadge(el, data.count);
      // Also mark comment buttons
      updateCommentBtnBadge(url, data.count);
    }
  }
}

// Initialize
ready(function() {
  initCommentPreview();
});
