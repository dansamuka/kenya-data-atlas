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

test('internal completion phases and duplicate governance overlay stay off public surfaces', async ({ page }) => {
  const publicRoutes=['/#/data','/#/explore/KEN-C032','/#/explore/KEN-C023','/#/compare','/#/rankings','/#/countyiq'];
  const retiredOverlaySelectors=[
    '#kda-data-programme',
    '#kda-p18-p22-profile',
    '#kda-p18-p22-ciq',
    '#kda-completion-compare-note',
    '#kda-completion-ranking-note',
    '.kda-completion-surface'
  ].join(',');

  for(const route of publicRoutes){
    await page.goto(route,{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(750);
    await expect(page.locator(retiredOverlaySelectors)).toHaveCount(0);
    const visibleText=await page.locator('body').innerText();
    expect(visibleText,`internal phase reference rendered on ${route}`).not.toMatch(/\bP\d{2}\b/);
  }
});

test('county profile uses published successor indicators and one coherent topic navigation', async ({ page }) => {
  await page.goto('/#/explore/KEN-C032?indicator=IND-POPULATION',{waitUntil:'domcontentloaded'});
  const profile=page.locator('#profile');
  await expect(profile).toContainText('Nakuru County',{timeout:15000});
  await expect(profile.locator('.place-sector-panel')).toHaveCount(0);
  await expect(profile.getByRole('tab',{name:'Education'})).toBeVisible();

  await profile.getByRole('tab',{name:'People'}).click();
  await expect(profile.locator('[data-indicator-code="IND-HOUSEHOLDS-CASH-TRANSFER-SOCIAL-ASSISTANCE"]')).toBeVisible();
  await expect(profile).not.toContainText('Inua Jamii cash-transfer beneficiaries');
  await expect(profile).not.toContainText('Mean KCPE / KCSE score');

  await profile.getByRole('tab',{name:'Education'}).click();
  for(const code of ['IND-PUBLIC-PRIMARY-SCHOOLS','IND-PRIMARY-CLASSROOM-TEACHERS','IND-PUBLIC-SECONDARY-SCHOOLS','IND-SECONDARY-TEACHERS']){
    await expect(profile.locator(`[data-indicator-code="${code}"]`)).toBeVisible();
  }

  await profile.getByRole('tab',{name:'Economy'}).click();
  for(const code of ['IND-AGRICULTURE-GVA','IND-MANUFACTURING-GVA','IND-MAIZE-AREA','IND-MAIZE-PRODUCTION','IND-MAIZE-YIELD']){
    await expect(profile.locator(`[data-indicator-code="${code}"]`)).toBeVisible();
  }
  await expect(profile).not.toContainText('Licensed businesses (count, year-on-year change)');
  await expect(profile).not.toContainText('Key crop production (county-dominant crop only)');

  await profile.getByRole('tab',{name:'Health'}).click();
  await expect(profile.locator('[data-indicator-code="IND-INPATIENT-SERVICE-AVAILABILITY"]')).toBeVisible();
  await expect(profile).not.toContainText('Facilities with electricity/water (%)');
  await expect(profile).not.toContainText('Hospital bed occupancy/utilisation rate');
  await expect(profile).not.toContainText('Drug and substance use prevalence');

  await profile.getByRole('tab',{name:'Infrastructure'}).click();
  for(const code of ['IND-CLASS-C-RURAL-ROAD-LENGTH','IND-HOUSEHOLD-MOTORCYCLE-OWNERSHIP','IND-HOUSEHOLD-CAR-OWNERSHIP','IND-INTERNET-USE','IND-COMPUTER-USE']){
    await expect(profile.locator(`[data-indicator-code="${code}"]`)).toBeVisible();
  }
  await expect(profile).not.toContainText('Classified road length (km)');
  await expect(profile).not.toContainText('Registered vehicles (count, per capita)');
});
