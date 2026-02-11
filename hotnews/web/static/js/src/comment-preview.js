/**
 * comment-preview.js
 * 新闻评论按钮：hover 直接打开完整评论面板（可回复、emoji、删除）
 * 评论数直接显示在评论按钮上（有评论时 💬N，无评论时 💬）
 */

import { ready } from './core.js';
import { authState } from './auth-state.js';
import { openLoginModal } from './login-modal.js';

const SHOW_DELAY = 250;
const HIDE_DELAY = 350;
let showTimer = null;
let hideTimer = null;
let activePanel = null;
let activeBtnEl = null;
let fullCommentCache = {};
let summaryCache = {};

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

function ck(url) {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash) + url.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function fetchCommentSummary(url) {
  const k = ck(url);
  if (summaryCache[k]) return summaryCache[k];
  try {
    const params = new URLSearchParams({ url, summary: '1' });
    const resp = await fetch(`/api/comments?${params}`, { credentials: 'include' });
    const result = await resp.json();
    if (result.success && result.data) { summaryCache[k] = result.data; return result.data; }
  } catch (e) { console.warn('[comment-preview] fetch summary error:', e); }
  return null;
}

async function fetchFullComments(url) {
  try {
    const params = new URLSearchParams({ url });
    const resp = await fetch(`/api/comments?${params}`, { credentials: 'include' });
    const result = await resp.json();
    if (result.success && Array.isArray(result.data)) { fullCommentCache[ck(url)] = result.data; return result.data; }
  } catch (e) { console.warn('[comment-preview] fetch full error:', e); }
  return null;
}

async function postComment(articleUrl, articleTitle, content) {
  const resp = await fetch('/api/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ article_url: articleUrl, article_title: articleTitle, content }) });
  return resp.json();
}

async function postReply(commentId, content) {
  const resp = await fetch(`/api/comments/${commentId}/reply`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ content }) });
  return resp.json();
}

async function toggleReaction(commentId, emoji) {
  const resp = await fetch(`/api/comments/${commentId}/react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ emoji }) });
  return resp.json();
}

async function deleteCommentApi(commentId) {
  const resp = await fetch(`/api/comments/${commentId}`, { method: 'DELETE', credentials: 'include' });
  return resp.json();
}

// ---------------------------------------------------------------------------
// Panel rendering helpers
// ---------------------------------------------------------------------------

function renderReactions(comment) {
  const reactions = comment.reactions || {};
  const myReactions = comment.my_reactions || [];
  let html = '';
  for (const [emoji, count] of Object.entries(reactions)) {
    if (count > 0) {
      const active = myReactions.includes(emoji) ? ' active' : '';
      html += `<span class="hn-cp-reaction${active}" data-emoji="${emoji}" data-comment-id="${comment.id}">${emoji} ${count}</span>`;
    }
  }
  html += `<span class="hn-cp-reaction hn-cp-add-reaction" data-comment-id="${comment.id}">+</span>`;
  return `<div class="hn-cp-reactions">${html}</div>`;
}

function renderComment(c, isReply) {
  const name = escapeHtml(c.user_name || c.nickname || '匿名');
  const avatar = c.user_avatar
    ? `<img class="hn-cp-avatar" src="${escapeHtml(c.user_avatar)}" alt="">`
    : `<div class="hn-cp-avatar hn-cp-avatar-placeholder">${name[0]}</div>`;
  const time = formatTime(c.created_at);
  const deleteBtn = c.is_mine ? `<button class="hn-cp-delete" data-comment-id="${c.id}" title="删除">🗑️</button>` : '';
  const quote = c.quote_text ? `<div class="hn-cp-quote">"${escapeHtml(c.quote_text)}"</div>` : '';
  const replyTo = c.parent_user_name ? `<span class="hn-cp-reply-to">回复 ${escapeHtml(c.parent_user_name)}</span> ` : '';
  const content = `<div class="hn-cp-content">${replyTo}${escapeHtml(c.content)}</div>`;
  const reactions = renderReactions(c);
  const replyBtn = `<button class="hn-cp-reply-btn" data-comment-id="${c.id}">回复</button>`;
  let repliesHtml = '';
  if (c.replies && c.replies.length > 0) {
    repliesHtml = `<div class="hn-cp-replies">${c.replies.map(r => renderComment(r, true)).join('')}</div>`;
  }
  const cls = isReply ? 'hn-cp-reply' : 'hn-cp-comment';
  return `<div class="${cls}" data-comment-id="${c.id}">
    <div class="hn-cp-comment-header">${avatar}<span class="hn-cp-name">${name}</span><span class="hn-cp-time">${time}</span>${deleteBtn}</div>
    ${quote}${content}${reactions}${replyBtn}${repliesHtml}
  </div>`;
}


// ---------------------------------------------------------------------------
// Full Comment Panel (opens on hover)
// ---------------------------------------------------------------------------

function removePanel() {
  if (activePanel) { activePanel.remove(); activePanel = null; activeBtnEl = null; }
}

function cancelHide() { clearTimeout(hideTimer); }
function scheduleHide() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(removePanel, HIDE_DELAY);
}

function openCommentPanel(btn) {
  // If panel already open for same button, just cancel hide
  if (activePanel && activeBtnEl === btn) { cancelHide(); return; }

  removePanel();
  activeBtnEl = btn;

  const url = btn.dataset.url;
  const title = btn.dataset.title || '';
  const rect = btn.getBoundingClientRect();

  const panel = document.createElement('div');
  panel.className = 'hn-comment-panel';
  panel.dataset.url = url;
  panel.innerHTML = `<div class="hn-cp-header"><span>评论</span><button class="hn-cp-close">✕</button></div><div class="hn-cp-loading">加载中…</div>`;
  document.body.appendChild(panel);

  // Position
  const pr = panel.getBoundingClientRect();
  let top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - pr.width / 2;
  if (left < 8) left = 8;
  if (left + pr.width > window.innerWidth - 8) left = window.innerWidth - 8 - pr.width;
  if (top + pr.height > window.innerHeight - 8) top = rect.top - pr.height - 8;
  panel.style.top = top + 'px';
  panel.style.left = left + 'px';

  // Hover keep-alive: mouse in panel cancels hide, mouse out schedules hide
  panel.addEventListener('mouseenter', cancelHide);
  panel.addEventListener('mouseleave', scheduleHide);

  activePanel = panel;
  bindPanelEvents(panel, url, title);
  refreshPanelComments(panel, url, title);
}

function bindPanelEvents(panel, url, title) {
  panel.querySelector('.hn-cp-close').addEventListener('click', removePanel);

  panel.addEventListener('click', async (e) => {
    const target = e.target;

    if (target.classList.contains('hn-cp-delete')) {
      const cid = target.dataset.commentId;
      if (!confirm('确定删除？')) return;
      
      // Optimistic delete - remove from UI immediately
      const commentEl = panel.querySelector(`[data-comment-id="${cid}"]`);
      if (commentEl) {
        commentEl.style.opacity = '0.5';
        commentEl.style.pointerEvents = 'none';
      }
      
      // Update count in header
      const header = panel.querySelector('.hn-cp-header span');
      const currentCount = parseInt(header?.textContent?.match(/\d+/)?.[0] || '0');
      if (header && currentCount > 0) header.textContent = `评论 (${currentCount - 1})`;
      
      const res = await deleteCommentApi(cid);
      if (res.success) {
        // Remove element completely
        if (commentEl) commentEl.remove();
        // Update badge
        updateCommentBtnBadge(url, Math.max(0, currentCount - 1));
        // Show empty state if no comments left
        const listEl = panel.querySelector('.hn-cp-list');
        if (listEl && listEl.children.length === 0) {
          listEl.remove();
          const empty = document.createElement('div');
          empty.className = 'hn-cp-empty';
          empty.textContent = '暂无评论，来抢沙发吧';
          panel.appendChild(empty);
        }
      } else {
        // Restore on failure
        if (commentEl) {
          commentEl.style.opacity = '';
          commentEl.style.pointerEvents = '';
        }
        if (header) header.textContent = `评论 (${currentCount})`;
        alert(res.message || '删除失败');
      }
      return;
    }

    if (target.classList.contains('hn-cp-reaction') && !target.classList.contains('hn-cp-add-reaction')) {
      if (!authState.isLoggedIn) { openLoginModal(); return; }
      const cid = target.dataset.commentId;
      const emoji = target.dataset.emoji;
      optimisticToggleReaction(target, cid, emoji);
      return;
    }

    if (target.classList.contains('hn-cp-add-reaction')) {
      if (!authState.isLoggedIn) { openLoginModal(); return; }
      showEmojiPicker(target);
      return;
    }

    if (target.classList.contains('hn-cp-emoji-option')) {
      const cid = target.dataset.commentId;
      const emoji = target.textContent.trim();
      // Close picker first
      const picker = target.closest('.hn-cp-emoji-picker');
      if (picker) picker.remove();
      // Find reactions container and do optimistic update
      const commentEl = panel.querySelector(`[data-comment-id="${cid}"]`);
      if (commentEl) {
        const reactionsEl = commentEl.querySelector('.hn-cp-reactions');
        optimisticAddReaction(reactionsEl, cid, emoji);
      }
      return;
    }

    if (target.classList.contains('hn-cp-reply-btn')) {
      if (!authState.isLoggedIn) { openLoginModal(); return; }
      showReplyInput(target);
      return;
    }

    if (target.classList.contains('hn-cp-reply-submit')) {
      const cid = target.dataset.commentId;
      const replyInputEl = target.closest('.hn-cp-reply-input');
      const textarea = replyInputEl.querySelector('textarea');
      const content = textarea.value.trim();
      if (!content) return;
      
      // Optimistic update: show reply immediately
      const tempId = 'temp-reply-' + Date.now();
      const tempReply = {
        id: tempId,
        content: content,
        user_name: authState.user?.nickname || authState.user?.name || '我',
        user_avatar: authState.user?.avatar || '',
        created_at: Math.floor(Date.now() / 1000),
        is_mine: true,
        reactions: {},
        my_reactions: [],
        replies: []
      };
      
      // Find parent comment and add reply
      const parentComment = panel.querySelector(`[data-comment-id="${cid}"]`);
      let repliesEl = parentComment?.querySelector('.hn-cp-replies');
      if (!repliesEl && parentComment) {
        repliesEl = document.createElement('div');
        repliesEl.className = 'hn-cp-replies';
        parentComment.appendChild(repliesEl);
      }
      
      if (repliesEl) {
        const tempHtml = renderComment(tempReply, true);
        repliesEl.insertAdjacentHTML('beforeend', tempHtml);
        const tempEl = repliesEl.querySelector(`[data-comment-id="${tempId}"]`);
        if (tempEl) tempEl.classList.add('hn-cp-sending');
      }
      
      // Remove input area
      replyInputEl.remove();
      
      // Send to backend
      const res = await postReply(cid, content);
      
      if (res.success) {
        // Update temp reply with real ID
        const tempEl = repliesEl?.querySelector(`[data-comment-id="${tempId}"]`);
        if (tempEl && res.data) {
          tempEl.classList.remove('hn-cp-sending');
          tempEl.dataset.commentId = res.data.id;
          const delBtn = tempEl.querySelector('.hn-cp-delete');
          if (delBtn) delBtn.dataset.commentId = res.data.id;
          const replyBtn = tempEl.querySelector('.hn-cp-reply-btn');
          if (replyBtn) replyBtn.dataset.commentId = res.data.id;
          tempEl.querySelectorAll('.hn-cp-reaction').forEach(r => r.dataset.commentId = res.data.id);
        }
      } else {
        // Remove temp reply on failure
        const tempEl = repliesEl?.querySelector(`[data-comment-id="${tempId}"]`);
        if (tempEl) tempEl.remove();
        alert(res.message || '回复失败');
      }
      return;
    }

    if (target.classList.contains('hn-cp-reply-cancel')) {
      const ri = target.closest('.hn-cp-reply-input');
      if (ri) ri.remove();
      return;
    }
  });
}

function showReplyInput(replyBtn) {
  const panel = replyBtn.closest('.hn-comment-panel');
  panel.querySelectorAll('.hn-cp-reply-input').forEach(el => el.remove());
  const commentEl = replyBtn.closest('[data-comment-id]');
  const cid = commentEl.dataset.commentId;
  const div = document.createElement('div');
  div.className = 'hn-cp-reply-input';
  div.innerHTML = `<textarea class="hn-cp-textarea" rows="2" placeholder="回复…"></textarea>
    <div class="hn-cp-reply-actions">
      <button class="hn-cp-reply-cancel">取消</button>
      <button class="hn-cp-reply-submit" data-comment-id="${cid}">发送</button>
    </div>`;
  replyBtn.after(div);
  div.querySelector('textarea').focus();
}

// Optimistic reaction toggle for existing reaction button
function optimisticToggleReaction(btn, commentId, emoji) {
  const isActive = btn.classList.contains('active');
  const countMatch = btn.textContent.match(/\d+/);
  let count = countMatch ? parseInt(countMatch[0]) : 0;
  
  // Optimistic UI update
  if (isActive) {
    btn.classList.remove('active');
    count = Math.max(0, count - 1);
    if (count === 0) {
      btn.remove();
    } else {
      btn.textContent = `${emoji} ${count}`;
    }
  } else {
    btn.classList.add('active');
    count++;
    btn.textContent = `${emoji} ${count}`;
  }
  
  // Fire and forget - no need to wait
  toggleReaction(commentId, emoji).catch(console.warn);
}

// Optimistic add new reaction from picker
function optimisticAddReaction(reactionsEl, commentId, emoji) {
  if (!reactionsEl) return;
  
  // Check if reaction already exists
  const existing = reactionsEl.querySelector(`[data-emoji="${emoji}"]`);
  if (existing && !existing.classList.contains('hn-cp-add-reaction')) {
    optimisticToggleReaction(existing, commentId, emoji);
    return;
  }
  
  // Add new reaction button before the + button
  const addBtn = reactionsEl.querySelector('.hn-cp-add-reaction');
  const newReaction = document.createElement('span');
  newReaction.className = 'hn-cp-reaction active';
  newReaction.dataset.emoji = emoji;
  newReaction.dataset.commentId = commentId;
  newReaction.textContent = `${emoji} 1`;
  if (addBtn) {
    addBtn.before(newReaction);
  } else {
    reactionsEl.appendChild(newReaction);
  }
  
  // Fire and forget
  toggleReaction(commentId, emoji).catch(console.warn);
}

function showEmojiPicker(addBtn) {
  document.querySelectorAll('.hn-cp-emoji-picker').forEach(el => el.remove());
  const cid = addBtn.dataset.commentId;
  const picker = document.createElement('div');
  picker.className = 'hn-cp-emoji-picker';
  picker.innerHTML = ALLOWED_EMOJIS.map(e => `<button class="hn-cp-emoji-option" data-comment-id="${cid}">${e}</button>`).join('');
  addBtn.style.position = 'relative';
  addBtn.appendChild(picker);
  setTimeout(() => {
    const handler = (ev) => {
      if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', handler, true); }
    };
    document.addEventListener('click', handler, true);
  }, 0);
}


async function refreshPanelComments(panel, url, title) {
  const loading = panel.querySelector('.hn-cp-loading');
  if (loading) loading.textContent = '加载中…';

  const comments = await fetchFullComments(url);
  if (loading) loading.remove();
  panel.querySelectorAll('.hn-cp-list, .hn-cp-empty, .hn-cp-input-area, .hn-cp-extension-hint, .hn-cp-login-hint').forEach(el => el.remove());

  const header = panel.querySelector('.hn-cp-header span');
  if (header) header.textContent = `评论 (${comments ? comments.length : 0})`;

  // Extension hint
  const hint = document.createElement('div');
  hint.className = 'hn-cp-extension-hint';
  hint.innerHTML = `💡 安装浏览器插件可选中文字评论 <a href="/extension/install" target="_blank">安装</a>`;
  panel.querySelector('.hn-cp-header').after(hint);

  // Input area
  if (authState.isLoggedIn) {
    const inputArea = document.createElement('div');
    inputArea.className = 'hn-cp-input-area';
    inputArea.innerHTML = `<textarea class="hn-cp-textarea" rows="1" placeholder="写评论…"></textarea><button class="hn-cp-submit">发送</button>`;
    hint.after(inputArea);
    const submitBtn = inputArea.querySelector('.hn-cp-submit');
    const textarea = inputArea.querySelector('.hn-cp-textarea');
    submitBtn.addEventListener('click', async () => {
      const content = textarea.value.trim();
      if (!content) return;
      
      // Optimistic update: show comment immediately
      const tempId = 'temp-' + Date.now();
      const tempComment = {
        id: tempId,
        content: content,
        user_name: authState.user?.nickname || authState.user?.name || '我',
        user_avatar: authState.user?.avatar || '',
        created_at: Math.floor(Date.now() / 1000),
        is_mine: true,
        reactions: {},
        my_reactions: [],
        replies: []
      };
      
      // Add to UI immediately
      let listEl = panel.querySelector('.hn-cp-list');
      const emptyEl = panel.querySelector('.hn-cp-empty');
      if (emptyEl) emptyEl.remove();
      if (!listEl) {
        listEl = document.createElement('div');
        listEl.className = 'hn-cp-list';
        panel.appendChild(listEl);
      }
      const tempHtml = renderComment(tempComment, false);
      listEl.insertAdjacentHTML('afterbegin', tempHtml);
      const tempEl = listEl.querySelector(`[data-comment-id="${tempId}"]`);
      if (tempEl) tempEl.classList.add('hn-cp-sending');
      
      // Update count in header
      const header = panel.querySelector('.hn-cp-header span');
      const currentCount = parseInt(header?.textContent?.match(/\d+/)?.[0] || '0');
      if (header) header.textContent = `评论 (${currentCount + 1})`;
      
      // Optimistic update: update badge immediately
      updateCommentBtnBadge(url, currentCount + 1);
      
      // Clear input
      const savedContent = textarea.value;
      textarea.value = '';
      submitBtn.disabled = true;
      
      // Send to backend
      const res = await postComment(url, title, content);
      submitBtn.disabled = false;
      
      if (res.success) {
        // Replace temp comment with real one
        if (tempEl && res.data) {
          tempEl.classList.remove('hn-cp-sending');
          tempEl.dataset.commentId = res.data.id;
          // Update delete button
          const delBtn = tempEl.querySelector('.hn-cp-delete');
          if (delBtn) delBtn.dataset.commentId = res.data.id;
          // Update reply button
          const replyBtn = tempEl.querySelector('.hn-cp-reply-btn');
          if (replyBtn) replyBtn.dataset.commentId = res.data.id;
          // Update reaction buttons
          tempEl.querySelectorAll('.hn-cp-reaction').forEach(r => r.dataset.commentId = res.data.id);
        }
        // Badge already updated optimistically, no need to update again
      } else {
        // Remove temp comment on failure
        if (tempEl) tempEl.remove();
        if (header) header.textContent = `评论 (${currentCount})`;
        // Rollback badge
        updateCommentBtnBadge(url, currentCount);
        textarea.value = savedContent;
        alert(res.message || '评论失败');
      }
    });
  } else {
    const loginHint = document.createElement('div');
    loginHint.className = 'hn-cp-input-area hn-cp-login-hint';
    loginHint.innerHTML = `<span style="font-size:13px;color:var(--text-tertiary,#999)">登录后可评论</span><button class="hn-cp-login-btn">登录</button>`;
    hint.after(loginHint);
    loginHint.querySelector('.hn-cp-login-btn').addEventListener('click', openLoginModal);
  }

  if (!comments || comments.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'hn-cp-empty';
    empty.textContent = '暂无评论，来抢沙发吧';
    panel.appendChild(empty);
  } else {
    const listEl = document.createElement('div');
    listEl.className = 'hn-cp-list';
    listEl.innerHTML = comments.map(c => renderComment(c, false)).join('');
    panel.appendChild(listEl);
  }

  updateCommentBtnBadge(url, comments ? comments.length : 0);
}

// ---------------------------------------------------------------------------
// Comment Button Badge
// ---------------------------------------------------------------------------

function updateCommentBtnBadge(url, count) {
  document.querySelectorAll('.news-comment-btn[data-url]').forEach(btn => {
    if (btn.dataset.url !== url) return;
    if (count > 0) {
      btn.classList.add('has-comments');
      btn.dataset.count = String(count);
    } else {
      btn.classList.remove('has-comments');
      delete btn.dataset.count;
    }
  });
}

// ---------------------------------------------------------------------------
// Event Handlers — hover opens panel directly
// ---------------------------------------------------------------------------

function handleBtnEnter(e) {
  const btn = e.target;
  cancelHide();
  clearTimeout(showTimer);
  showTimer = setTimeout(() => openCommentPanel(btn), SHOW_DELAY);
}

function handleBtnLeave() {
  clearTimeout(showTimer);
  scheduleHide();
}

// ---------------------------------------------------------------------------
// Load visible badges
// ---------------------------------------------------------------------------

async function loadVisibleBadges() {
  const btns = document.querySelectorAll('.news-comment-btn[data-url]');
  const urlSet = new Set();
  btns.forEach(btn => { const u = btn.dataset.url; if (u) urlSet.add(u); });
  for (const url of urlSet) {
    const data = await fetchCommentSummary(url);
    if (data) updateCommentBtnBadge(url, data.count ?? data.total ?? 0);
  }
}

// ---------------------------------------------------------------------------
// Batch refresh comment counts (for real-time updates)
// ---------------------------------------------------------------------------

async function batchRefreshCommentCounts() {
  const btns = document.querySelectorAll('.news-comment-btn[data-url]');
  const urls = [];
  btns.forEach(btn => {
    const u = btn.dataset.url;
    if (u && !urls.includes(u)) urls.push(u);
  });
  
  if (urls.length === 0) return;
  
  try {
    const resp = await fetch('/api/comments/batch-counts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ urls })
    });
    if (!resp.ok) return;
    const result = await resp.json();
    if (result.success && result.data) {
      // Update all badges
      for (const [url, count] of Object.entries(result.data)) {
        updateCommentBtnBadge(url, count);
      }
      // Clear badges for URLs not in result (no comments)
      urls.forEach(url => {
        if (!(url in result.data)) {
          updateCommentBtnBadge(url, 0);
        }
      });
    }
  } catch (e) {
    console.warn('[comment-preview] batch refresh error:', e);
  }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------

function initCommentPreview() {
  document.addEventListener('mouseenter', (e) => {
    if (e.target.classList && e.target.classList.contains('news-comment-btn')) handleBtnEnter(e);
  }, true);

  document.addEventListener('mouseleave', (e) => {
    if (e.target.classList && e.target.classList.contains('news-comment-btn')) handleBtnLeave();
  }, true);

  // Close panel on outside click
  document.addEventListener('mousedown', (e) => {
    if (activePanel && !activePanel.contains(e.target) && !e.target.closest('.news-comment-btn')) removePanel();
  });

  loadVisibleBadges();

  // Observe DOM changes to load badges for new elements
  let badgeTimer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(badgeTimer);
    badgeTimer = setTimeout(loadVisibleBadges, 500);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Periodic refresh of comment counts (every 60 seconds when page is visible)
  const REFRESH_INTERVAL = 60000;
  setInterval(() => {
    if (document.visibilityState === 'visible') {
      batchRefreshCommentCounts();
    }
  }, REFRESH_INTERVAL);

  // Also refresh when page becomes visible
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      setTimeout(batchRefreshCommentCounts, 1000);
    }
  });
}

ready(initCommentPreview);
