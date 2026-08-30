import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const routes = [
  { path: '/#/', selector: '#home' },
  { path: '/#/pulse', selector: '[data-view="pulse"]' },
  { path: '/#/explore', selector: '#geo-explorer' },
  { path: '/#/compare', selector: '#compare' },
  { path: '/#/series/KDA-CPI-YOY-KEN', selector: '#series' },
  { path: '/#/data', selector: '#catalogue' },
  { path: '/#/rankings', selector: '[data-view="rankings"]' },
  { path: '/#/countyiq', selector: '#countyiq-view' }
];

function runtimeGuard(page) {
  const errors = [];
  page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
  page.on('console', message => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

function axeSummary(blockers) {
  return blockers.flatMap(violation => violation.nodes.map(node => {
    const target = node.target?.join(' > ') || 'unknown target';
    const message = node.any?.[0]?.message || node.failureSummary || violation.help;
    return `${violation.id} [${violation.impact}] ${target}: ${message}`;
  })).join('\n');
}

for (const route of routes) {
  test(`${route.path} renders without runtime errors`, async ({ page }) => {
    const errors = runtimeGuard(page);
    await page.goto(route.path, { waitUntil: 'domcontentloaded' });
    await expect(page.locator(route.selector).first()).toBeVisible();
    await page.waitForTimeout(700);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(3);
    expect(errors).toEqual([]);
  });
}

test.describe('WCAG automated gate', () => {
  for (const route of routes) {
    test(`${route.path} has no serious or critical axe violations`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name === 'mobile-chromium', 'axe gate runs once in desktop Chromium');
      await page.goto(route.path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator(route.selector).first()).toBeVisible();
      await page.waitForTimeout(500);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
      const blockers = results.violations.filter(item => item.impact === 'critical' || item.impact === 'serious');
      expect(blockers, axeSummary(blockers)).toEqual([]);
    });
  }
});

test('skip link reaches the main landmark', async ({ page }) => {
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
});

test('desktop navigation is keyboard reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-chromium', 'desktop-only navigation contract');
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  await page.locator('a[href="#/compare"]').first().focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/compare$/);
  await expect(page.locator('#compare')).toBeVisible();
});

test('mobile menu exposes navigation and keeps focus visible', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'mobile-only contract');
  await page.goto('/#/', { waitUntil: 'domcontentloaded' });
  const menu = page.locator('.menu-button');
  await expect(menu).toBeVisible();
  await menu.focus();
  await expect(menu).toBeFocused();
  await menu.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#main-nav')).toBeVisible();
});

test('reduced-motion preference does not hide core content', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/#/countyiq', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('#countyiq-view')).toBeVisible();
});
