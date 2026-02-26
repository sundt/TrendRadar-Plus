/**
 * Skeleton Loading 组件
 * 统一的加载占位符生成器，替代 "⏳ 加载中..." 文本
 */

/**
 * 生成一个 skeleton 卡片的 HTML（模拟 platform-card）
 * @param {object} [opts]
 * @param {number} [opts.rows=8] - 列表行数
 * @param {string} [opts.extraClass] - 额外 CSS class
 * @returns {string}
 */
export function skeletonCard(opts = {}) {
    const rows = opts.rows || 8;
    const cls = opts.extraClass ? ` ${opts.extraClass}` : '';
    let rowsHtml = '';
    for (let i = 0; i < rows; i++) {
        rowsHtml += `<div class="tr-skeleton-card-row"><div class="tr-skeleton-bar tr-skeleton-idx"></div><div class="tr-skeleton-bar tr-skeleton-title"></div></div>`;
    }
    return `<div class="tr-skeleton-card${cls}"><div class="tr-skeleton-card-header"><div class="tr-skeleton-bar"></div><div class="tr-skeleton-bar"></div></div>${rowsHtml}</div>`;
}

/**
 * 生成 N 个 skeleton 卡片（用于 grid 占位）
 * @param {number} count
 * @param {object} [opts] - 传给 skeletonCard 的选项
 * @returns {string}
 */
export function skeletonCards(count, opts = {}) {
    let html = '';
    for (let i = 0; i < count; i++) {
        html += skeletonCard(opts);
    }
    return html;
}

/**
 * 生成 inline skeleton（用于面板/弹窗内的加载占位）
 * @param {number} [lines=4]
 * @returns {string}
 */
export function skeletonInline(lines = 4) {
    let html = '<div class="tr-skeleton-inline">';
    for (let i = 0; i < lines; i++) {
        html += '<div class="tr-skeleton-bar"></div>';
    }
    html += '</div>';
    return html;
}

/**
 * 生成 sentinel（加载更多的三点动画）
 * @returns {string}
 */
export function skeletonSentinel() {
    return '<div class="tr-load-sentinel"><div class="tr-load-sentinel-dot"></div><div class="tr-load-sentinel-dot"></div><div class="tr-load-sentinel-dot"></div></div>';
}
