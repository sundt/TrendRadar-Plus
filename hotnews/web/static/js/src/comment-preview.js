/**
 * comment-preview.js
 * 新闻标题悬停显示评论预览弹窗
 */

import { ready } from './core.js';

const SHOW_DELAY = 200;
const HIDE_DELAY = 400;
let showTimer = null;
let hideTimer = null;
let activePopup = null;
let commentCache = {};

function sha256(str) {
  // 简单哈希用于缓存 key（不需要加密安全）
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return String(hash);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
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

async function fetchCommentSummary(url) {
  const cacheKey = sha256(url);
  if (commentCache[cacheKey]) return commentCache[cacheKey];

  try {
    const params = new URLSearchParams({ url, summary: '1' });
    const resp = await fetch(`/api/comments?${params}`, { credentials: 'include' });
    const result = await resp.json();
    if (result.success && result.data) {
      commentCache[cacheKey] = result.data;
      return result.data;
    }
  } catch (e) {
    console.warn('[comment-preview] fetch error:', e);
  }
  return null;
}

function createPopup(data, triggerEl) {
  removePopup();

  const popup = document.createElement('div');
  popup.className = 'hn-comment-preview-popup';

  const header = `<div class="hn-cpp-header">💬 ${data.count} 条评论${data.view_count ? ` · 👁 ${data.view_count}人看过` : ''}</div>`;

  const items = (data.latest || []).map(c => {
    const quote = c.selected_text
      ? `<span class="hn-cpp-quote">"${escapeHtml(c.selected_text.length > 20 ? c.selected_text.slice(0, 20) + '...' : c.selected_text)}"</span> `
      : '';
    return `<div class="hn-cpp-item"><span class="hn-cpp-name">${escapeHtml(c.user_name || '匿名')}</span>：${quote}${escapeHtml(c.content.length > 40 ? c.content.slice(0, 40) + '...' : c.content)}</div>`;
  }).join('');

  const url = triggerEl.href || '#';
  popup.innerHTML = `${header}<div class="hn-cpp-list">${items}</div><a class="hn-cpp-more" href="${url}" target="_blank">查看全部 →</a>`;

  document.body.appendChild(popup);

  // 定位
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

function addBadge(titleEl, count) {
  if (titleEl.querySelector('.hn-comment-badge')) return;
  const badge = document.createElement('span');
  badge.className = 'hn-comment-badge';
  badge.textContent = `💬${count}`;
  badge.title = `${count} 条评论`;
  titleEl.appendChild(badge);
}

async function handleTitleEnter(e) {
  const titleEl = e.target.closest('.news-title');
  if (!titleEl) return;
  const url = titleEl.href;
  if (!url || url === '#') return;

  clearTimeout(hideTimer);
  clearTimeout(showTimer);

  showTimer = setTimeout(async () => {
    const data = await fetchCommentSummary(url);
    if (data && data.count > 0) {
      addBadge(titleEl, data.count);
      createPopup(data, titleEl);
    }
  }, SHOW_DELAY);
}

function handleTitleLeave() {
  clearTimeout(showTimer);
  hideTimer = setTimeout(removePopup, HIDE_DELAY);
}

export function initCommentPreview() {
  // 事件委托
  document.addEventListener('mouseenter', (e) => {
    if (e.target.closest('.news-title')) handleTitleEnter(e);
  }, true);

  document.addEventListener('mouseleave', (e) => {
    if (e.target.closest('.news-title')) handleTitleLeave();
  }, true);

  // 批量加载当前可见新闻的评论数（用于显示 badge）
  setTimeout(loadVisibleBadges, 2000);
}

async function loadVisibleBadges() {
  const titles = document.querySelectorAll('.news-title');
  // 只处理前 50 个，避免过多请求
  const urls = [];
  titles.forEach((el, i) => {
    if (i < 50 && el.href && el.href !== '#') {
      urls.push({ el, url: el.href });
    }
  });

  // 逐个请求（避免并发过多）
  for (const { el, url } of urls) {
    const data = await fetchCommentSummary(url);
    if (data && data.count > 0) {
      addBadge(el, data.count);
    }
  }
}


// 初始化
ready(function() {
  initCommentPreview();
});
