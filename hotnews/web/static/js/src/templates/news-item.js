/**
 * News Item Templates
 * 新闻条目 HTML 生成
 */

import { escapeHtml, formatNewsDate } from '../core.js';

/**
 * 生成新闻条目 HTML 字符串（用于 SSR 风格的批量渲染）
 */
export function renderNewsItemHtml(n, idx, platformId, platformName, opts = {}) {
    const stableId = escapeHtml(n?.stable_id || '');
    const title = escapeHtml(n?.display_title || n?.title || '');
    const url = escapeHtml(n?.url || '');
    const meta = escapeHtml(n?.meta || '');
    const isRssPlatform = String(platformId || '').startsWith('rss-');
    const isCross = !!n?.is_cross_platform;
    const crossPlatforms = Array.isArray(n?.cross_platforms) ? n.cross_platforms : [];
    const crossTitle = escapeHtml(crossPlatforms.join(', '));
    const crossCount = escapeHtml(n?.cross_platform_count ?? '');
    const crossBadge = isCross
        ? `<span class="cross-platform-badge" title="同时出现在: ${crossTitle}">🔥 ${crossCount}</span>`
        : '';
    const crossClass = isCross ? 'cross-platform' : '';

    const checkboxHtml = '<input type="checkbox" class="news-checkbox" title="标记已读" />';
    const indexHtml = `<span class="news-index">${String(idx + 1)}</span>`;

    const pagingOffset = opts.pagingOffset || 0;
    const pageSize = opts.pageSize || 20;
    const pagedHidden = (idx < pagingOffset || idx >= (pagingOffset + pageSize)) ? ' paged-hidden' : '';

    const metaHtml = (meta && !isRssPlatform) ? `<div class="news-subtitle">${meta}</div>` : '';
    const safeHref = url || '#';
    const dateStr = formatNewsDate(n?.timestamp);

    const safePlatformName = platformName.replace(/'/g, "\\'");
    const safeTitle = title.replace(/'/g, "\\'");
    const safeUrl = url.replace(/'/g, "\\'");
    const safePid = escapeHtml(platformId);

    const aiDotHtml = `<span class="news-ai-indicator" data-news-id="${stableId}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${safeTitle}', '${safeUrl}', '${safePid}', '${safePlatformName}')"></span>`;

    const dateHtml = dateStr ? `<span class="tr-news-date">${escapeHtml(dateStr)}</span>` : '';
    const summaryBtnHtml = `<button class="news-summary-btn" data-news-id="${stableId}" data-title="${title.replace(/"/g, '&quot;')}" data-url="${url.replace(/"/g, '&quot;')}" data-source-id="${safePid}" data-source-name="${platformName.replace(/"/g, '&quot;')}" onclick="event.preventDefault();event.stopPropagation();handleSummaryClick(event, '${stableId}', '${safeTitle}', '${safeUrl}', '${safePid}', '${safePlatformName}')" ></button>`;
    const commentBtnHtml = `<button class="news-comment-btn" data-url="${url.replace(/"/g, '&quot;')}" data-title="${title.replace(/"/g, '&quot;')}"></button>`;
    const actionsHtml = `<div class="news-actions">${dateHtml}<div class="news-hover-btns">${summaryBtnHtml}${commentBtnHtml}</div></div>`;

    return `
            <li class="news-item${pagedHidden}" data-id="${stableId}" data-url="${url}">
                <div class="news-item-content">
                    ${checkboxHtml}
                    ${indexHtml}
                    <a class="news-title ${crossClass}" href="${safeHref}" target="_blank" rel="noopener noreferrer">
                        ${title}
                        ${crossBadge}
                    </a>
                    ${aiDotHtml}
                    ${actionsHtml}
                </div>
                ${metaHtml}
            </li>`;
}
