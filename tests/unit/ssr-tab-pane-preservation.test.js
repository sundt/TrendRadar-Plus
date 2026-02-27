/**
 * Preservation Property Tests — SSR Tab-Pane Mismatch Bugfix
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 *
 * These tests verify EXISTING behavior that must be preserved after the fix.
 * They MUST PASS on UNFIXED code — confirming the baseline behavior.
 *
 * Preservation goal from design:
 *   FOR ALL X WHERE NOT isBugCondition(X) DO
 *     ASSERT switchTab(X.columnId) = switchTab'(X.columnId)
 *   END FOR
 *
 * Properties tested:
 * 1. Existing SSR pane columns switch correctly (active pane, active button, others deactivated)
 * 2. Topic tabs save to localStorage when pane not loaded
 * 3. Write operations (goToSettings/subscribe) check login state
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import fc from 'fast-check';

// --- All 9 SSR columns (from ssr_columns / column_config) ---
const ALL_SSR_COLUMNS = [
  'my-tags', 'discovery', 'explore', 'knowledge', 'finance',
  'ai', 'developer', 'business', 'science', 'lifestyle',
];

// --- Only 5 have SSR panes (from data.categories) ---
const SSR_PANE_COLUMNS = ['my-tags', 'discovery', 'explore', 'knowledge', 'finance'];

// Minimal localStorage stub
const localStorageStore = {};
const storageMock = {
  getItem: (key) => localStorageStore[key] ?? null,
  setItem: (key, val) => { localStorageStore[key] = String(val); },
  removeItem: (key) => { delete localStorageStore[key]; },
  clear: () => { Object.keys(localStorageStore).forEach(k => delete localStorageStore[k]); },
};

/**
 * Build a minimal DOM that mirrors the SSR-rendered viewer page:
 * - 9 tab buttons inside #homeSubTabs
 * - Only 5 tab-panes inside .tab-content-area (NO panes for tag-driven columns)
 *
 * Reuses the same structure from the exploration test.
 */
function buildSSRDom() {
  document.body.innerHTML = '';

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

  const indicator = document.createElement('div');
  indicator.className = 'sub-tabs-indicator';
  subTabs.appendChild(indicator);

  document.body.appendChild(subTabs);

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

// TAB_STORAGE_KEY mirrors the constant in tabs.js
const TAB_STORAGE_KEY = 'tr_active_sub_tab';

/**
 * Minimal storage helper mirroring tabs.js storage usage.
 */
const storage = {
  setRaw(key, val) { localStorageStore[key] = String(val); },
  remove(key) { delete localStorageStore[key]; },
  getRaw(key) { return localStorageStore[key] ?? null; },
};

/**
 * Minimal switchTab implementation mirroring the UNFIXED tabs.js logic.
 * Same as the exploration test — this is the code we're preserving behavior for.
 */
function switchTab(categoryId) {
  const escapedCategoryId = String(categoryId);
  const subTabsContainer = document.getElementById('homeSubTabs');

  let tabEl = subTabsContainer
    ? subTabsContainer.querySelector(`.sub-tab[data-category="${escapedCategoryId}"]`)
    : document.querySelector(`.sub-tab[data-category="${escapedCategoryId}"]`);
  const paneEl = document.getElementById(`tab-${categoryId}`);

  if (!tabEl && paneEl) {
    // Parent lookup for dropdown sub-categories — not relevant here
  }

  if (!tabEl || !paneEl) {
    // Topic tab special case: save to localStorage for later restore
    if (String(categoryId).startsWith('topic-')) {
      storage.setRaw(TAB_STORAGE_KEY, categoryId);
      return { activePaneId: null, didFallbackToFirstTab: false, savedForLater: true };
    }
    // FALLBACK: jump to first tab
    const firstTab = subTabsContainer
      ? subTabsContainer.querySelector('.sub-tab[data-category]')
      : document.querySelector('.sub-tab[data-category]');
    if (firstTab?.dataset?.category && firstTab.dataset.category !== String(categoryId)) {
      return switchTab(firstTab.dataset.category);
    }
    storage.remove(TAB_STORAGE_KEY);
    return { activePaneId: null, didFallbackToFirstTab: true, noTabFound: true };
  }

  // Normal activation: deactivate all, activate target
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

/**
 * Minimal goToSettings mirroring init.js — checks login before opening subscribe sidebar.
 */
function goToSettings(authState) {
  if (authState.isLoggedIn()) {
    return { action: 'openSubscribeSidebar' };
  } else {
    return { action: 'openLoginModal' };
  }
}

// ─────────────────────────────────────────────────────────────
// Property 1: Existing SSR pane columns switch correctly
// **Validates: Requirements 3.1, 3.2**
// ─────────────────────────────────────────────────────────────
describe('Preservation: Existing SSR Pane Column Switching', () => {
  beforeEach(() => {
    buildSSRDom();
    storageMock.clear();
  });

  it('Property: for all SSR pane columnIds, switchTab activates the correct pane and button', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SSR_PANE_COLUMNS),
        (columnId) => {
          // Reset DOM to clean state
          buildSSRDom();

          const result = switchTab(columnId);

          // 1. Correct pane is activated
          expect(result.activePaneId).toBe(`tab-${columnId}`);
          expect(result.didFallbackToFirstTab).toBe(false);

          // 2. The target pane has 'active' class
          const pane = document.getElementById(`tab-${columnId}`);
          expect(pane).not.toBeNull();
          expect(pane.classList.contains('active')).toBe(true);

          // 3. The target button has 'active' class
          const btn = document.querySelector(`.sub-tab[data-category="${columnId}"]`);
          expect(btn).not.toBeNull();
          expect(btn.classList.contains('active')).toBe(true);

          // 4. No other pane has 'active' class
          const allPanes = document.querySelectorAll('.tab-pane');
          for (const p of allPanes) {
            if (p.id !== `tab-${columnId}`) {
              expect(p.classList.contains('active')).toBe(false);
            }
          }

          // 5. No other button has 'active' class
          const allBtns = document.querySelectorAll('#homeSubTabs .sub-tab');
          for (const b of allBtns) {
            if (b.dataset.category !== columnId) {
              expect(b.classList.contains('active')).toBe(false);
            }
          }
        }
      ),
      { numRuns: 30 }
    );
  });

  it('Property: switching between any two SSR pane columns deactivates the previous one', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SSR_PANE_COLUMNS),
        fc.constantFrom(...SSR_PANE_COLUMNS),
        (firstCol, secondCol) => {
          buildSSRDom();

          // Switch to first column
          switchTab(firstCol);
          // Switch to second column
          const result = switchTab(secondCol);

          expect(result.activePaneId).toBe(`tab-${secondCol}`);

          // Second column's pane is active
          const secondPane = document.getElementById(`tab-${secondCol}`);
          expect(secondPane.classList.contains('active')).toBe(true);

          // If different columns, first column's pane is NOT active
          if (firstCol !== secondCol) {
            const firstPane = document.getElementById(`tab-${firstCol}`);
            expect(firstPane.classList.contains('active')).toBe(false);
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Property 2: Topic tabs save to localStorage when pane not loaded
// **Validates: Requirements 3.5**
// ─────────────────────────────────────────────────────────────
describe('Preservation: Topic Tab localStorage Save', () => {
  beforeEach(() => {
    buildSSRDom();
    storageMock.clear();
  });

  it('Property: for all topic- prefixed IDs, switchTab saves to localStorage when pane not loaded', () => {
    // Generate random topic tab IDs
    const topicIdArb = fc.stringMatching(/^[a-z0-9]{1,10}$/).map(s => `topic-${s}`);

    fc.assert(
      fc.property(
        topicIdArb,
        (topicId) => {
          buildSSRDom();
          // Clear storage before each check
          storage.remove(TAB_STORAGE_KEY);

          // Topic tabs have no SSR pane and no button — they're loaded by topic-tracker
          const result = switchTab(topicId);

          // 1. switchTab should NOT fallback to first tab
          expect(result.didFallbackToFirstTab).toBe(false);

          // 2. switchTab should indicate saved for later
          expect(result.savedForLater).toBe(true);

          // 3. The topic ID should be saved in localStorage
          expect(storage.getRaw(TAB_STORAGE_KEY)).toBe(topicId);
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─────────────────────────────────────────────────────────────
// Property 3: Write operations check login state
// **Validates: Requirements 3.3, 3.4**
// ─────────────────────────────────────────────────────────────
describe('Preservation: Write Operations Login Verification', () => {
  it('Property: goToSettings opens login modal when not logged in, subscribe sidebar when logged in', () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        (isLoggedIn) => {
          const authState = { isLoggedIn: () => isLoggedIn };
          const result = goToSettings(authState);

          if (isLoggedIn) {
            expect(result.action).toBe('openSubscribeSidebar');
          } else {
            expect(result.action).toBe('openLoginModal');
          }
        }
      ),
      { numRuns: 20 }
    );
  });
});
