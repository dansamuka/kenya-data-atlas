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
