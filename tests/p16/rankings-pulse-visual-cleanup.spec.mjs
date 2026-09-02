import { test, expect } from '@playwright/test';

async function waitForVisualClarity(page){
  await expect.poll(()=>page.evaluate(()=>Boolean(window.KDAVisualClarity)&&document.documentElement.dataset.visualClarity==='ready'),{timeout:10000}).toBe(true);
}

async function assertSingleSparkContract(page,rootSelector){
  const root=page.locator(rootSelector);
  await expect(root.locator('.metric-card').first()).toBeVisible({timeout:10000});
  await waitForVisualClarity(page);
  await expect.poll(()=>root.locator('.v2-card-spark').count(),{timeout:10000}).toBe(0);
  await expect.poll(()=>root.locator('.viz-card-spark').count(),{timeout:10000}).toBeGreaterThan(0);
  const duplicates=await root.locator('.metric-card').evaluateAll(cards=>cards.filter(card=>card.querySelectorAll('.viz-card-spark').length>1).length);
  expect(duplicates).toBe(0);
  const mixed=await root.locator('.metric-card').evaluateAll(cards=>cards.filter(card=>card.querySelector('.v2-card-spark')&&card.querySelector('.viz-card-spark')).length);
  expect(mixed).toBe(0);
  const stroke=await root.locator('.viz-card-spark .viz-spark polyline').first().evaluate(node=>getComputedStyle(node).stroke);
  expect(stroke).toMatch(/rgb\(192,\s*96,\s*60\)|#c0603c/i);
}

test('National Pulse metric cards retain one reddish history sparkline', async ({ page }) => {
  const uncaught=[];page.on('pageerror',error=>uncaught.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/#/pulse',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-view','pulse');
  await assertSingleSparkContract(page,'#pulse-grid');
  expect(uncaught,'uncaught runtime errors on Pulse').toEqual([]);
});

test('Home glance metric cards retain the same single reddish history sparkline', async ({ page }) => {
  const uncaught=[];page.on('pageerror',error=>uncaught.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/#/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-view','home');
  await assertSingleSparkContract(page,'#home-glance-grid');
  expect(uncaught,'uncaught runtime errors on Home').toEqual([]);
});
