import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = [
  { name: 'home', hash: '#/', view: 'home' },
  { name: 'pulse', hash: '#/pulse', view: 'pulse' },
  { name: 'explore', hash: '#/explore', view: 'explore' },
  { name: 'compare', hash: '#/compare', view: 'compare' },
  { name: 'series', hash: '#/series/KDA-CPI-YOY-KEN', view: 'series' },
  { name: 'data', hash: '#/data', view: 'data' },
  { name: 'rankings', hash: '#/rankings', view: 'rankings' },
  { name: 'countyiq', hash: '#/countyiq', view: 'countyiq' }
];

async function openRoute(page, route) {
  const uncaught = [];
  page.on('pageerror', error => uncaught.push(error.message));
  await page.goto(`/${route.hash}`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-view', route.view);
  await expect(page.locator('main')).toBeVisible();
  await page.waitForTimeout(350);
  expect(uncaught, `uncaught runtime errors on ${route.name}`).toEqual([]);
}

for (const route of routes) {
  test(`critical route: ${route.name}`, async ({ page }) => {
    await openRoute(page, route);
    if (route.view !== 'home') {
      await expect(page.locator(`[data-view="${route.view}"]:not([hidden])`).first()).toBeVisible();
    } else {
      await expect(page.locator('.hero:not([hidden])')).toBeVisible();
    }
  });
}

test('WCAG 2.2 AA automated critical-impact gate', async ({ page }) => {
  for (const route of [routes[0], routes[3], routes[7]]) {
    await openRoute(page, route);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    const critical = result.violations.filter(item => item.impact === 'critical');
    expect(critical, `critical axe violations on ${route.name}: ${critical.map(v => v.id).join(', ')}`).toEqual([]);
  }
});

test('mobile keyboard, focus and overflow gate', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'home');

  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();

  const menu = page.locator('.menu-button');
  await menu.focus();
  await expect(menu).toBeFocused();
  await menu.click();
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#main-nav')).toHaveClass(/open/);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await expect(menu).toBeFocused();

  const geometry = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth
  }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport + 1);
});

test('search is keyboard reachable from a routed view', async ({ page }) => {
  await page.goto('/#/compare', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-view', 'compare');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+K' : 'Control+K');
  await expect(page.locator('body')).toHaveAttribute('data-view', 'home');
  await expect(page.locator('#atlas-search')).toBeFocused();
});

test('universal search covers pages, places, indicators and datasets', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  const input=page.locator('#atlas-search');
  await input.focus();
  await expect.poll(async()=>page.evaluate(()=>Boolean(window.KDASiteSearch))).toBe(true);

  await input.fill('rankings');
  await expect(page.locator('#search-results')).toContainText('County Rankings & Insights');

  await input.fill('Nakuru');
  await expect(page.locator('#search-results')).toContainText('Nakuru');
  await expect(page.locator('#search-results')).toContainText(/County/i);

  await input.fill('inflation');
  await expect(page.locator('#search-results')).toContainText(/Consumer price inflation/i);

  await input.fill('2019 census');
  await expect(page.locator('#search-results')).toContainText(/2019 Census/i);
});

test('header and searchable-select buttons perform their intended search actions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/compare', { waitUntil: 'domcontentloaded' });
  const global=page.locator('[data-focus-search]');
  await global.click();
  await expect(page.locator('body')).toHaveAttribute('data-view','home');
  await expect(page.locator('#atlas-search')).toBeFocused();

  await page.goto('/#/compare', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#compare-place-strip select').first()).toBeVisible({timeout:10000});
  const trigger=page.locator('#compare-place-strip .kda-select-search-trigger').first();
  await expect(trigger).toBeVisible({timeout:10000});
  await trigger.click();
  const dialog=page.locator('.kda-select-search-dialog');
  await expect(dialog).toBeVisible();
  const filter=dialog.locator('input[type="search"]');
  await filter.fill('Nairobi');
  const option=dialog.locator('.kda-select-search-option').filter({hasText:'Nairobi'}).first();
  await expect(option).toBeVisible();
  await option.click();
  await expect(dialog).toBeHidden();
});

test('P18-P22 completed programme is visible on public surfaces', async ({ page }) => {
  await page.goto('/#/data', { waitUntil: 'domcontentloaded' });
  const programme=page.locator('#kda-data-programme');
  await expect(programme).toBeVisible({timeout:10000});
  await expect(programme).toContainText('P18 · Complete');
  await expect(programme).toContainText('P22 · Complete');
  await expect(programme).toContainText('19.26%');
  await expect(programme).toContainText('3,190');

  await page.goto('/#/explore/KEN-C032', { waitUntil: 'domcontentloaded' });
  const nakuru=page.locator('#kda-p18-p22-profile');
  await expect(nakuru).toBeVisible({timeout:15000});
  await expect(nakuru).toContainText('Nakuru · completed county data');
  await expect(nakuru).toContainText('Class C rural road length');
  await expect(nakuru).toContainText('Households receiving cash transfer or social assistance');
  await expect(nakuru).toContainText('Own-source revenue target attainment');

  await page.goto('/#/explore/KEN-C023', { waitUntil: 'domcontentloaded' });
  const turkana=page.locator('#kda-p18-p22-profile');
  await expect(turkana).toBeVisible({timeout:15000});
  await expect(turkana).toContainText('Turkana · completed county data');
  await expect(turkana).toContainText('Drought early warning bulletin status');
  await expect(turkana).toContainText('Current observation unavailable');
  await expect(turkana).toContainText('Refresh trigger');
});
