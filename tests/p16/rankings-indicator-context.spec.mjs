import { test, expect } from '@playwright/test';

test('indicator rankings expose published distribution and pinned-county context', async ({ page }) => {
  const uncaught=[];
  page.on('pageerror',error=>uncaught.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/rankings',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-view','rankings');

  const indicatorTab=page.locator('[data-ri-tab="indicator"]');
  await expect(indicatorTab).toBeVisible({timeout:10000});
  await indicatorTab.click();

  const distribution=page.locator('#v2-indicator-distribution');
  await expect(distribution).toBeVisible({timeout:10000});
  const dots=distribution.locator('.ri-indicator-dot:not([disabled])');
  expect(await dots.count()).toBeGreaterThan(1);

  const first=dots.first();
  const geo=await first.getAttribute('data-ri-indicator-geo');
  expect(geo).toBeTruthy();
  await first.click();

  await expect(page).toHaveURL(new RegExp(`pinned=${String(geo).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  await expect(distribution.locator('.ri-indicator-pin')).toContainText('You are here');
  await expect(distribution.locator('.ri-indicator-context')).toContainText('National percentile');
  await expect(page.locator(`#ri-indicator-body tr[data-ri-geo="${geo}"]`)).toHaveClass(/ri-indicator-pinned/);

  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport+1);
  expect(uncaught,'uncaught runtime errors on indicator distribution').toEqual([]);
});
