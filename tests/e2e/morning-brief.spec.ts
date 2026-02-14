import { test, expect } from '@playwright/test';
import { ViewerPage } from './pages/viewer.page';

function getMorningBriefTabId() {
  // We keep the category id stable as "knowledge" while display name is "每日AI早报".
  return 'knowledge';
}

test.describe('Morning Brief Three Cards', () => {
  test('should render three cards in daily brief tab', async ({ page }) => {
    const viewer = new ViewerPage(page);

    await page.addInitScript(() => {
      // Ensure the viewer uses the ajax refresh path so our route mocks are used consistently.
      localStorage.setItem(
        'hotnews_categories_config',
        JSON.stringify({
          version: 1,
          customCategories: [],
          hiddenDefaultCategories: [],
          hiddenPlatforms: [],
          categoryOrder: ['knowledge', 'social', 'general', 'finance', 'tech_news', 'developer', 'sports', 'other'],
          platformOrder: {},
          categoryFilters: {},
        })
      );
      localStorage.removeItem('hotnews_active_tab');
    });

    // Mock base /api/news so the UI renders the knowledge tab.
    await page.route('**/api/news*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            knowledge: { id: 'knowledge', name: '每日AI早报', icon: '📚', platforms: {}, news_count: 0, filtered_count: 0, is_new: false },
            social: { id: 'social', name: '社交娱乐', icon: '🔥', platforms: {}, news_count: 0, filtered_count: 0, is_new: false },
            other: { id: 'other', name: '其他平台', icon: '📋', platforms: {}, news_count: 0, filtered_count: 0, is_new: false },
          },
        }),
      });
    });

    // Mock brief APIs.
    await page.route('**/api/rss/brief/timeline*', async (route) => {
      const items = Array.from({ length: 150 }).map((_, i) => {
        const n = i + 1;
        return {
          stable_id: `rsssrc-${n}`,
          title: `Item ${n}`,
          display_title: `Item ${n}`,
          url: `https://example.com/item-${n}`,
          created_at: 1700000000 - i,
          published_at: 1800000000 - i,
          source_id: 'rsssrc-1',
          source_name: 'Source 1',
        };
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          offset: 0,
          limit: 150,
          drop_published_at_zero: true,
          items,
          total_candidates: 150,
          updated_at: '2030-01-01 00:00:00',
        }),
      });
    });

    await viewer.goto();

    // Ensure ajax render is completed.
    await expect(page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });

    const tabId = getMorningBriefTabId();
    await page.locator(`.category-tab[data-category="${tabId}"]`).click();

    const pane = page.locator(`#tab-${tabId}`);
    await expect(pane).toBeVisible();

    // Verify three cards exist.
    const cards = pane.locator('.platform-card.tr-morning-brief-card');
    await expect(cards).toHaveCount(3);

    await expect(pane.locator('.platform-card[data-platform="mb-slice-1"] .platform-name')).toContainText('最新 1-50');
    await expect(pane.locator('.platform-card[data-platform="mb-slice-2"] .platform-name')).toContainText('最新 51-100');
    await expect(pane.locator('.platform-card[data-platform="mb-slice-3"] .platform-name')).toContainText('最新 101-150');

    await expect(pane.locator('.news-list[data-mb-list="slice1"]')).toContainText('Item 1');
    await expect(pane.locator('.news-list[data-mb-list="slice1"]')).toContainText('Item 50');
    await expect(pane.locator('.news-list[data-mb-list="slice2"]')).toContainText('Item 51');
    await expect(pane.locator('.news-list[data-mb-list="slice2"]')).toContainText('Item 100');
    await expect(pane.locator('.news-list[data-mb-list="slice3"]')).toContainText('Item 101');
    await expect(pane.locator('.news-list[data-mb-list="slice3"]')).toContainText('Item 150');

    const timeBadge = pane.locator('.news-list[data-mb-list="slice1"] .news-item:visible .tr-mb-time').first();
    await expect(timeBadge).toHaveText(/(\d{2}-\d{2} \d{2}:\d{2})|(\d{4}-\d{2}-\d{2})/);
  });

  test('should not duplicate cards on mobile after settings change', async ({ page }) => {
    const viewer = new ViewerPage(page);

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    await page.addInitScript(() => {
      localStorage.setItem(
        'hotnews_categories_config',
        JSON.stringify({
          version: 1,
          customCategories: [],
          hiddenDefaultCategories: [],
          hiddenPlatforms: [],
          categoryOrder: ['knowledge', 'social', 'general'],
          platformOrder: {},
          categoryFilters: {},
        })
      );
      localStorage.removeItem('hotnews_active_tab');
    });

    // Mock base /api/news
    await page.route('**/api/news*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          updated_at: '2030-01-01 00:00:00',
          categories: {
            knowledge: { id: 'knowledge', name: '每日AI早报', icon: '📚', platforms: {}, news_count: 0, filtered_count: 0, is_new: false },
            social: { id: 'social', name: '社交娱乐', icon: '🔥', platforms: {}, news_count: 0, filtered_count: 0, is_new: false },
            general: { id: 'general', name: '综合', icon: '📰', platforms: {}, news_count: 0, filtered_count: 0, is_new: false },
          },
        }),
      });
    });

    // Mock brief APIs
    await page.route('**/api/rss/brief/timeline*', async (route) => {
      const items = Array.from({ length: 150 }).map((_, i) => {
        const n = i + 1;
        return {
          stable_id: `rsssrc-${n}`,
          title: `Item ${n}`,
          display_title: `Item ${n}`,
          url: `https://example.com/item-${n}`,
          created_at: 1700000000 - i,
          published_at: 1800000000 - i,
          source_id: 'rsssrc-1',
          source_name: 'Source 1',
        };
      });
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          offset: 0,
          limit: 150,
          drop_published_at_zero: true,
          items,
          total_candidates: 150,
          updated_at: '2030-01-01 00:00:00',
        }),
      });
    });

    await viewer.goto();
    await expect(page.locator('body')).toHaveClass(/categories-ready/, { timeout: 15000 });

    const tabId = getMorningBriefTabId();
    
    // Switch to knowledge tab
    await page.locator(`.category-tab[data-category="${tabId}"]`).click();
    const pane = page.locator(`#tab-${tabId}`);
    await expect(pane).toBeVisible();

    // Wait for cards to load
    await page.waitForTimeout(1000);

    // Verify initial state: exactly 3 cards
    let cards = pane.locator('.platform-card.tr-morning-brief-card');
    await expect(cards).toHaveCount(3);

    // Verify card labels
    await expect(pane.locator('.platform-card[data-platform="mb-slice-1"] .platform-name')).toContainText('最新 1-50');
    await expect(pane.locator('.platform-card[data-platform="mb-slice-2"] .platform-name')).toContainText('最新 51-100');
    await expect(pane.locator('.platform-card[data-platform="mb-slice-3"] .platform-name')).toContainText('最新 101-150');

    // Simulate a settings change that triggers renderViewerFromData
    await page.evaluate(() => {
      // Trigger a data refresh (simulates user changing settings)
      if (window.TR?.data?.refreshViewerData) {
        window.TR.data.refreshViewerData();
      }
    });

    // Wait for re-render
    await page.waitForTimeout(1500);

    // Verify cards are still exactly 3 (not duplicated)
    cards = pane.locator('.platform-card.tr-morning-brief-card');
    await expect(cards).toHaveCount(3);

    // Verify card labels are still correct
    await expect(pane.locator('.platform-card[data-platform="mb-slice-1"] .platform-name')).toContainText('最新 1-50');
    await expect(pane.locator('.platform-card[data-platform="mb-slice-2"] .platform-name')).toContainText('最新 51-100');
    await expect(pane.locator('.platform-card[data-platform="mb-slice-3"] .platform-name')).toContainText('最新 101-150');

    // Verify content is still present
    await expect(pane.locator('.news-list[data-mb-list="slice1"]')).toContainText('Item 1');
    await expect(pane.locator('.news-list[data-mb-list="slice2"]')).toContainText('Item 51');
    await expect(pane.locator('.news-list[data-mb-list="slice3"]')).toContainText('Item 101');
  });
});
