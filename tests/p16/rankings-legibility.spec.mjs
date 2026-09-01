import { test, expect } from '@playwright/test';

function overlaps(a,b){
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

test('rankings charts use taller lane-packed plots with bounded persistent labels', async ({ page }) => {
  const uncaught=[];
  page.on('pageerror',error=>uncaught.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/#/rankings',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-view','rankings');

  const development=page.locator('#v2-dev-beeswarm');
  await expect(development).toBeVisible({timeout:10000});
  const devPlot=development.locator('.ri-spectrum-plot');
  const devBox=await devPlot.boundingBox();
  expect(devBox?.height||0).toBeGreaterThanOrEqual(330);

  const devDots=development.locator('.ri-spectrum-dot');
  expect(await devDots.count()).toBe(47);
  const lanes=await devDots.evaluateAll(nodes=>[...new Set(nodes.map(n=>n.dataset.riLane))]);
  expect(lanes.length).toBeGreaterThanOrEqual(4);

  const persistent=development.locator('.ri-spectrum-dot.show-label .ri-spectrum-label');
  const persistentCount=await persistent.count();
  expect(persistentCount).toBeGreaterThanOrEqual(10);
  expect(persistentCount).toBeLessThanOrEqual(12);
  await expect(persistent.first()).toBeVisible();

  const visibleRects=await persistent.evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect()).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})));
  let collisions=0;
  for(let i=0;i<visibleRects.length;i+=1)for(let j=i+1;j<visibleRects.length;j+=1)if(overlaps(visibleRects[i],visibleRects[j]))collisions+=1;
  expect(collisions).toBeLessThanOrEqual(1);

  const hiddenDot=development.locator('.ri-spectrum-dot:not(.show-label)').first();
  const hiddenLabel=hiddenDot.locator('.ri-spectrum-label');
  await expect(hiddenLabel).toBeHidden();
  await hiddenDot.focus();
  await expect(hiddenLabel).toBeVisible();

  const indicatorTab=page.locator('[data-ri-tab="indicator"]');
  await indicatorTab.click();
  const distribution=page.locator('#v2-indicator-distribution');
  await expect(distribution).toBeVisible({timeout:10000});
  const indBox=await distribution.locator('.ri-indicator-plot').boundingBox();
  expect(indBox?.height||0).toBeGreaterThanOrEqual(220);

  const indLabels=distribution.locator('.ri-indicator-dot.show-label .ri-indicator-label');
  const indLabelCount=await indLabels.count();
  expect(indLabelCount).toBeGreaterThanOrEqual(7);
  expect(indLabelCount).toBeLessThanOrEqual(8);

  const target=distribution.locator('.ri-indicator-dot:not([disabled])').nth(5);
  const geo=await target.getAttribute('data-ri-indicator-geo');
  expect(geo).toBeTruthy();
  await target.click();
  await expect(page).toHaveURL(new RegExp(`pinned=${String(geo).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  await expect(distribution.locator('.ri-indicator-pin')).toContainText('You are here');
  await expect(distribution.locator('.ri-indicator-dot.is-pinned .ri-indicator-label')).toBeVisible();
  await expect(page.locator(`#ri-indicator-body tr[data-ri-geo="${geo}"]`)).toHaveClass(/ri-indicator-pinned/);
  expect(uncaught,'uncaught runtime errors').toEqual([]);
});

test('rankings legibility remains page-overflow safe on mobile', async ({ page }) => {
  const uncaught=[];
  page.on('pageerror',error=>uncaught.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/rankings',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#v2-dev-beeswarm')).toBeVisible({timeout:10000});
  const devBox=await page.locator('.ri-spectrum-plot').boundingBox();
  expect(devBox?.height||0).toBeGreaterThanOrEqual(300);

  await page.locator('[data-ri-tab="indicator"]').click();
  await expect(page.locator('#v2-indicator-distribution')).toBeVisible({timeout:10000});
  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport+1);
  expect(uncaught,'uncaught runtime errors on mobile').toEqual([]);
});
