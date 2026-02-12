/**
 * Platform Card Templates
 * 平台卡片 HTML 生成
 */

import { escapeHtml } from '../core.js';
import { renderNewsItemHtml } from './news-item.js';

/**
 * 平台卡片头部操作按钮
 */
export function renderPlatformHeaderButtonsHtml(catId, platformId) {
    const pid = String(platformId || '').trim();
    const isRss = pid.startsWith('rss-');
    const canDelete = isRss;
    const delBtn = canDelete
        ? '<button type="button" class="tr-platform-card-delete" data-action="delete-platform">−</button>'
        : '';
    const hideBtn = !isRss
        ? '<button type="button" class="tr-platform-card-hide" data-action="hide-platform">🙈</button>'
        : '';
    return `${delBtn}${hideBtn}`;
}

/**
 * 骨架屏新闻条目
 */
export function renderSkeletonNewsItemsHtml(count) {
    const n = Math.max(0, Number(count || 0) || 0);
    let html = '';
    for (let i = 0; i < n; i++) {
        html += '<li class="tr-news-skeleton" aria-hidden="true"><div class="tr-news-skeleton-line"></div></li>';
    }
    return html;
}

/**
 * 生成完整平台卡片 HTML（用于 renderViewerFromData 中的批量渲染）
 */
export function renderPlatformCardHtml(catId, platformId, platform, opts = {}) {
    const pid = String(platformId || '').trim();
    const p = platform || {};
    const platformName = escapeHtml(p?.name || pid);
    const platformBadge = p?.is_new
        ? `<span class="new-badge new-badge-platform" data-platform="${escapeHtml(pid)}">NEW</span>`
        : '';
    const news = Array.isArray(p?.news) ? p.news : [];
    const totalCount = news.length;
    const isLazy = !!opts.isLazy;
    const initialCount = isLazy ? 0 : Math.min(totalCount, opts.pageSize || 20);
    const pagingOffset = opts.pagingOffset || 0;
    const filteredNews = news.slice(0, initialCount);

    const newsItemsHtml = isLazy
        ? renderSkeletonNewsItemsHtml(8)
        : (filteredNews.map((n, idx) =>
            renderNewsItemHtml(n, idx, pid, platformName, {
                pagingOffset,
                pageSize: opts.pageSize || 20,
            })
        ).join(''));

    const headerButtons = renderPlatformHeaderButtonsHtml(catId, pid);
    const dragHandle = '<span class="platform-drag-handle" title="拖拽调整平台顺序" draggable="true">☰</span>';
    const animateIn = opts.animateIn ? ' tr-explore-flip-in' : '';

    return `
        <div class="platform-card${animateIn}" data-platform="${escapeHtml(pid)}" data-total-count="${String(totalCount)}" data-loaded-count="${String(initialCount)}" data-lazy="${isLazy ? '1' : '0'}" data-loaded-done="${isLazy ? '0' : '1'}" draggable="false">
            <div class="platform-header">
                ${dragHandle}
                <div class="platform-name" style="margin-bottom: 0; padding-bottom: 0; border-bottom: none; cursor: pointer;" onclick="dismissNewPlatformBadge('${escapeHtml(pid)}')">📱 ${platformName}${platformBadge}</div>
                <div class="platform-header-actions">${headerButtons}</div>
            </div>
            <ul class="news-list">${newsItemsHtml}
            </ul>
            <div class="news-load-sentinel" aria-hidden="true"></div>
        </div>`;
}
