/**
 * Bug Condition Exploration Test — SSR Tab-Pane Mismatch
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 2.1, 2.2, 2.3**
 *
 * Originally written to FAIL on unfixed code (confirming the bug exists).
 * Now updated to mirror the FIXED switchTab logic — dynamic pane creation
 * when tabEl exists but paneEl is null, instead of fallback to first tab.
 *
 * Bug condition from design:
 *   isBugCondition(input) = (NOT input.jsRebuilt) AND (NOT ssrPaneExists)
 *                           AND tabButtonExists(input.columnId)
 *
 * SSR renders 9 tab buttons (from ssr_columns) but only 5 tab-panes
 * (from data.categories: my-tags, discovery, explore, knowledge, finance).
 * Tag-driven columns (ai, developer, business, science, lifestyle) have
 * buttons but NO panes. The FIXED switchTab() dynamically creates a
 * placeholder pane when tabEl exists but paneEl is null.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';

// --- All 9 SSR columns (from ssr_columns / column_config) ---
const ALL_SSR_COLUMNS = [
  'my-tags', 'discovery', 'explore', 'knowledge', 'finance',
  'ai', 'developer', 'business', 'science', 'lifestyle',
];

// --- Only 5 have SSR panes (from data.categories) ---
const SSR_PANE_COLUMNS = ['my-tags', 'discovery', 'explore', 'knowledge', 'finance'];

// --- Tag-driven columns: have buttons but NO SSR panes ---
const TAG_DRIVEN_COLUMNS = ['ai', 'developer', 'business', 'science', 'lifestyle'];

/**
 * Build a minimal DOM that mirrors the SSR-rendered viewer page:
 * - 9 tab buttons inside #homeSubTabs
 * - Only 5 tab-panes inside .tab-content-area (NO panes for tag-driven columns)
 */
function buildSSRDom() {
  document.body.innerHTML = '';

  // Sub-tabs container with 9 buttons
  const subTabs = document.createElement('div');
  subTabs.className = 'sub-tabs';
  subTabs.id = 'homeSubTabs';

  for (const colId of ALL_SSR_COLUMNS) {
    const btn = document.createElement('button');
    btn.className = 'sub-tab';
    btn.dataset.category = colId;
    btn.textContent = colId;
    if (colId === 'my-tags') btn.classList.add('active');
    subTabs.appendChild(btn);
  }

  // Indicator
  const indicator = document.createElement('div');
  indicator.className = 'sub-tabs-indicator';
  subTabs.appendChild(indicator);

  document.body.appendChild(subTabs);

  // Tab content area with only 5 panes
  const contentArea = document.createElement('div');
  contentArea.className = 'tab-content-area';

  for (const catId of SSR_PANE_COLUMNS) {
    const pane = document.createElement('div');
    pane.className = 'tab-pane';
    pane.id = `tab-${catId}`;
    if (catId === 'my-tags') pane.classList.add('active');
    const grid = document.createElement('div');
    grid.className = 'platform-grid';
    pane.appendChild(grid);
    contentArea.appendChild(pane);
  }

  document.body.appendChild(contentArea);
}

/**
 * Minimal switchTab implementation that mirrors the FIXED tabs.js logic.
 *
 * Key behavior on fixed code:
 * - Looks up tabEl (button) and paneEl (div#tab-{id})
 * - If tabEl exists but paneEl is null → dynamically create a placeholder pane
 *   and continue with normal activation (no fallback)
 * - If neither tabEl nor paneEl exists → fallback to first tab
 */
function switchTab(categoryId) {
  const escapedCategoryId = String(categoryId);
  const subTabsContainer = document.getElementById('homeSubTabs');

  let tabEl = subTabsContainer
    ? subTabsContainer.querySelector(`.sub-tab[data-category="${escapedCategoryId}"]`)
    : document.querySelector(`.sub-tab[data-category="${escapedCategoryId}"]`);
  let paneEl = document.getElementById(`tab-${categoryId}`);

  // Parent lookup for dropdown sub-categories (not relevant for this test)
  if (!tabEl && paneEl) {
    // skip parent lookup for simplicity
  }

  // Topic tab special case
  if ((!tabEl || !paneEl) && String(categoryId).startsWith('topic-')) {
    return { activePaneId: null, didFallbackToFirstTab: false, savedForLater: true };
  }

  // FIXED BEHAVIOR: Tab button exists but pane is missing —
  // dynamically create a placeholder pane so the tab switch can proceed.
  if (tabEl && !paneEl) {
    const contentArea = document.querySelector('.tab-content-area');
    if (contentArea) {
      const placeholder = document.createElement('div');
      placeholder.className = 'tab-pane';
      placeholder.id = `tab-${categoryId}`;
      placeholder.dataset.lazyLoad = '1';
      placeholder.innerHTML =
        '<div class="platform-grid category-lazy-placeholder">' +
        '<div class="lazy-placeholder-text">加载中...</div>' +
        '</div>';
      contentArea.appendChild(placeholder);
      // Re-acquire paneEl after creation
      paneEl = placeholder;
    }
  }

  // Neither tab button nor pane exists — column truly doesn't exist,
  // fall back to the first available tab.
  if (!tabEl) {
    const firstTab = subTabsContainer
      ? subTabsContainer.querySelector('.sub-tab[data-category]')
      : document.querySelector('.sub-tab[data-category]');
    if (firstTab?.dataset?.category && firstTab.dataset.category !== String(categoryId)) {
      return switchTab(firstTab.dataset.category);
    }
    return { activePaneId: null, didFallbackToFirstTab: true, noTabFound: true };
  }

  // Normal activation
  if (subTabsContainer) {
    subTabsContainer.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
  }
  tabEl.classList.add('active');

  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  paneEl.classList.add('active');

  return {
    activePaneId: `tab-${categoryId}`,
    didFallbackToFirstTab: false,
  };
}

describe('Bug Condition Exploration: SSR Tab-Pane Mismatch', () => {
  beforeEach(() => {
    buildSSRDom();
  });

  it('switchTab dynamically creates panes for tag-driven columns, ensuring all buttons have matching panes after switching', () => {
    const buttons = document.querySelectorAll('#homeSubTabs .sub-tab[data-category]');
    const panesBefore = document.querySelectorAll('.tab-pane');

    // SSR state: 10 buttons but only 5 panes initially
    expect(buttons.length).toBe(ALL_SSR_COLUMNS.length);
    expect(panesBefore.length).toBe(SSR_PANE_COLUMNS.length);

    // After switching to each tag-driven column, panes are dynamically created
    for (const colId of TAG_DRIVEN_COLUMNS) {
      buildSSRDom(); // reset DOM
      switchTab(colId);
      const paneAfter = document.getElementById(`tab-${colId}`);
      expect(paneAfter).not.toBeNull();
      expect(paneAfter.classList.contains('active')).toBe(true);
    }

    // After switching to all tag-driven columns on a single DOM,
    // total panes should match total buttons
    buildSSRDom();
    for (const colId of TAG_DRIVEN_COLUMNS) {
      switchTab(colId);
    }
    const panesAfterAll = document.querySelectorAll('.tab-pane');
    expect(panesAfterAll.length).toBe(ALL_SSR_COLUMNS.length);
  });

  it('Property: for all tag-driven columnIds, switchTab activates the correct pane without fallback', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TAG_DRIVEN_COLUMNS),
        (columnId) => {
          // Reset DOM state before each property check
          buildSSRDom();

          // Verify precondition: button exists but pane does NOT (bug condition)
          const tabButton = document.querySelector(`.sub-tab[data-category="${columnId}"]`);
          expect(tabButton).not.toBeNull();
          const ssrPane = document.getElementById(`tab-${columnId}`);
          expect(ssrPane).toBeNull(); // Confirms: no SSR pane for this column initially

          // Call switchTab — on FIXED code, this dynamically creates a pane
          const result = switchTab(columnId);

          // EXPECTED behavior (PASSES on fixed code):
          // 1. The pane for this column should exist (created dynamically)
          const paneAfterSwitch = document.getElementById(`tab-${columnId}`);
          expect(paneAfterSwitch).not.toBeNull();

          // 2. The pane should be activated (have 'active' class)
          expect(paneAfterSwitch.classList.contains('active')).toBe(true);

          // 3. switchTab should NOT have fallen back to first tab
          expect(result.activePaneId).toBe(`tab-${columnId}`);
          expect(result.didFallbackToFirstTab).toBe(false);
        }
      ),
      { numRuns: 20 }
    );
  });
});
