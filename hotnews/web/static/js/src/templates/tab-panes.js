/**
 * Tab Pane Templates
 * 各栏目特殊 tab-pane HTML 生成
 */

import { escapeHtml } from '../core.js';
import { skeletonCards } from '../skeleton.js';

export function renderRssColPane(catId, isActive) {
    const cls = isActive ? ' active' : '';
    const btnRow = `
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <div id="rssCategoryCarouselStatus" style="color:#6b7280;font-size:0.85rem;flex:1;min-width:200px;"></div>
        </div>`;
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid" style="display:flex;flex-direction:column;gap:10px;min-height:0;">
                ${btnRow}
                <div id="rssCategoryCarouselGrid" style="display:flex;flex-direction:column;gap:10px;min-height:0;"></div>
            </div>
            <div class="category-empty-state" style="display:none;" aria-hidden="true">没有匹配内容，请调整关键词或切换模式</div>
        </div>`;
}

export function renderExplorePane(catId, isActive) {
    const cls = isActive ? ' active' : '';
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid" id="trExploreGrid"></div>
        </div>`;
}

export function renderMyTagsPane(catId, isActive) {
    const cls = isActive ? ' active' : '';
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid" id="myTagsGrid">
                ${skeletonCards(window.innerWidth <= 640 ? 1 : 3)}
            </div>
        </div>`;
}

export function renderTopicDynamicPane(catId, isActive, keywords) {
    const cls = isActive ? ' active' : '';
    const topicId = String(catId).replace('topic-', '');
    const kws = Array.isArray(keywords) ? keywords : [];
    const keywordsHtml = kws.map(kw => `
        <div class="platform-card" data-keyword="${escapeHtml(kw)}">
            <div class="platform-header">
                <div class="platform-name" style="margin-bottom:0;padding-bottom:0;border-bottom:none;">🔍 ${escapeHtml(kw)}</div>
            </div>
            <ul class="news-list">
                <li class="news-placeholder">加载中...</li>
            </ul>
        </div>
    `).join('');
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid" id="topicCards-${escapeHtml(topicId)}" data-topic-id="${escapeHtml(topicId)}">
                ${keywordsHtml || '<div style="text-align:center;padding:60px 20px;color:#6b7280;">加载中...</div>'}
            </div>
        </div>`;
}


const WECHAT_SVG = `<svg viewBox="0 0 24 24" fill="#07c160" width="48" height="48"><path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178A1.17 1.17 0 0 1 4.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 0 1-1.162 1.178 1.17 1.17 0 0 1-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 0 1 .598.082l1.584.926a.272.272 0 0 0 .14.047c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 0 1-.023-.156.49.49 0 0 1 .201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.27-.027-.407-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 0 1-.969.983.976.976 0 0 1-.969-.983c0-.542.434-.982.969-.982z"/></svg>`;

export function renderFeaturedMpsPane(catId, isActive) {
    const cls = isActive ? ' active' : '';
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid" id="featuredMpsGrid">
                <div class="featured-mps-loading" style="text-align:center;padding:60px 20px;color:#6b7280;width:100%;">
                    <div style="margin-bottom:16px;">${WECHAT_SVG}</div>
                    <div style="font-size:16px;">加载中...</div>
                </div>
            </div>
        </div>`;
}

export function renderDiscoveryPane(catId, isActive) {
    const cls = isActive ? ' active' : '';
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid" id="discoveryGrid">
                ${skeletonCards(window.innerWidth <= 640 ? 1 : 3)}
            </div>
        </div>`;
}

export function renderKnowledgePane(catId, isActive, existingGridHtml) {
    const cls = isActive ? ' active' : '';
    // No placeholder cards — morning-brief.js handles all card creation.
    // Placeholder cards caused duplicates because switchTab/bulkLoadCategory
    // would also try to load data into them (a second loading system).
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid" data-mb-injected="1"></div>
        </div>`;
}

/**
 * 通用主题栏目 pane（tag-driven 栏目复用）
 * 内容由 categoryTimeline.load() 在 switchTab 时填充
 */
export function renderThemePane(catId, isActive) {
    const cls = isActive ? ' active' : '';
    return `
        <div class="tab-pane${cls}" id="tab-${escapeHtml(catId)}">
            <div class="platform-grid"></div>
        </div>`;
}
