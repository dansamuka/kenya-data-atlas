// P34 -- browser regression coverage for the governed local-54 indicator panel.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

async function openLocal54(page, geoCode) {
  await page.goto('/#/explore', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Boolean(window.KDAPlaceProfile), null, { timeout: 15000 });
  await page.evaluate(async (code) => {
    const geos = await (await fetch('data/geography/registry/geographies.json')).json();
    const geo = geos.find(g => g.geo_code === code);
    window.KDAPlaceProfile.renderProfile(geo.geography_id, 'local54');
  }, geoCode);
  await page.locator('.place-l54-panel').waitFor({ state: 'visible', timeout: 15000 });
}

test('local-54 panel renders all 54 indicators for a ward, including unavailable and not-applicable', async ({ page }) => {
  await openLocal54(page, 'KEN-C001-CON001-W0001');
  await expect(page.locator('.place-l54-card')).toHaveCount(54);
  await expect(page.locator('.place-l54-card .badge.l54-unavailable').first()).toBeVisible();
  await expect(page.locator('.place-l54-card .badge.l54-na').first()).toBeVisible();
});

test('an unavailable indicator resolves its full reason from the shared reason catalogue, not a blank/duplicated inline copy', async ({ page }) => {
  await openLocal54(page, 'KEN-C001-CON001-W0001');
  const card = page.locator('[data-indicator-code="IND-AGRICULTURE-GCP-SHARE"]');
  await expect(card.locator('.badge')).toHaveText('Data unavailable');
  await card.locator('.place-l54-explain').click();
  const detailText = await card.locator('.place-l54-detail').innerText();
  expect(detailText.length).toBeGreaterThan(200);
  expect(detailText).toContain('KNBS');
});

test('local-54 panel shows the ward representative with a freshness flag when stale', async ({ page }) => {
  await openLocal54(page, 'KEN-C001-CON001-W0001');
  const rep = page.locator('.place-l54-rep').first();
  await expect(rep).toContainText('Member of County Assembly');
  await expect(rep.locator('.badge.l54-stale')).toBeVisible();
});

test('local-54 panel exposes an inspectable conflict history without mislabelling the official value', async ({ page }) => {
  await openLocal54(page, 'KEN-C001');
  const card = page.locator('[data-indicator-code="IND-CLASS-C-RURAL-ROAD-LENGTH"]');
  await expect(card.locator('.badge')).toHaveText('Official');
  await card.locator('.place-l54-explain').click();
  await expect(card.locator('.place-l54-detail')).toBeVisible();
  await expect(card.locator('.l54-conflict')).toContainText('competing candidate value was investigated and rejected');
});

test('local-54 badges are visually distinct from official evidence and do not open the unrelated legacy provenance popover', async ({ page }) => {
  await openLocal54(page, 'KEN-C001-CON001-W0001');
  const officialBadges = await page.locator('.badge.l54-official, .badge.l54-derived').count();
  const cautionaryBadges = await page.locator('.badge.l54-secondary-verified, .badge.l54-secondary-corroborated, .badge.l54-probable, .badge.l54-modelled').count();
  const unavailableBadges = await page.locator('.badge.l54-unavailable, .badge.l54-na').count();
  expect(officialBadges + cautionaryBadges + unavailableBadges).toBe(54);
  const badge = page.locator('.place-l54-card .badge').first();
  await badge.click({ force: true });
  await expect(page.locator('#kda-provenance-v2:not([hidden])')).toHaveCount(0);
});

test('local-54 panel WCAG 2.2 AA critical-impact gate', async ({ page }) => {
  await openLocal54(page, 'KEN-C001-CON001-W0001');
  const result = await new AxeBuilder({ page }).include('#profile').withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  const critical = result.violations.filter(item => item.impact === 'critical');
  expect(critical, `critical axe violations: ${critical.map(v => v.id).join(', ')}`).toEqual([]);
});
