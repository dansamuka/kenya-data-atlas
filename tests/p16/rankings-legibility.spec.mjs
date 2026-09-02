import { test, expect } from '@playwright/test';

function overlaps(a,b){
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

async function waitForVisualClarity(page){
  await expect.poll(()=>page.evaluate(()=>Boolean(window.KDAVisualClarity)&&document.documentElement.dataset.visualClarity==='ready'),{timeout:10000}).toBe(true);
}

test('rankings charts default to readable three-letter county labels with interactive full names', async ({ page }) => {
  const uncaught=[];
  page.on('pageerror',error=>uncaught.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('/#/rankings',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-view','rankings');
  await waitForVisualClarity(page);

  const development=page.locator('#v2-dev-beeswarm');
  await expect(development).toBeVisible({timeout:10000});
  await expect.poll(()=>development.locator('.ri-spectrum-dot.kda-acronym-default').count(),{timeout:10000}).toBe(47);
  const devPlot=development.locator('.ri-spectrum-plot');
  const devBox=await devPlot.boundingBox();
  expect(devBox?.height||0).toBeGreaterThanOrEqual(330);

  const devDots=development.locator('.ri-spectrum-dot');
  expect(await devDots.count()).toBe(47);
  const lanes=await devDots.evaluateAll(nodes=>[...new Set(nodes.map(n=>n.dataset.riLane))]);
  expect(lanes.length).toBeGreaterThanOrEqual(4);

  const devLabels=development.locator('.ri-spectrum-dot .ri-spectrum-label');
  expect(await devLabels.count()).toBe(47);
  for(const label of await devLabels.allTextContents())expect(label).toMatch(/^[A-Z]{3}$/);
  const visibleDev=await devLabels.evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').length);
  expect(visibleDev).toBe(47);
  expect(await development.locator('.ri-spectrum-dot > .sr-only').count()).toBe(0);

  const visibleRects=await devLabels.evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').map(n=>n.getBoundingClientRect()).map(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom})));
  let collisions=0;
  for(let i=0;i<visibleRects.length;i+=1)for(let j=i+1;j<visibleRects.length;j+=1)if(overlaps(visibleRects[i],visibleRects[j]))collisions+=1;
  expect(collisions).toBeLessThanOrEqual(1);

  const devTarget=devDots.nth(12),devCounty=await devTarget.getAttribute('data-ri-county'),devGeo=await devTarget.getAttribute('data-ri-geo');
  expect(devCounty).toBeTruthy();expect(devGeo).toBeTruthy();
  await devTarget.hover();
  await expect(devPlot.locator('.kda-rank-hover-card')).toBeVisible();
  await expect(devPlot.locator('.kda-rank-hover-card')).toContainText(devCounty);
  await devTarget.click();
  await expect(page).toHaveURL(new RegExp(`pinned=${String(devGeo).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  await expect(devPlot.locator('.kda-development-pin')).toContainText('You are here');
  await expect(devPlot.locator('.kda-development-pin')).toContainText(devCounty);

  const indicatorTab=page.locator('[data-ri-tab="indicator"]');
  await indicatorTab.click();
  const distribution=page.locator('#v2-indicator-distribution');
  await expect(distribution).toBeVisible({timeout:10000});
  await expect.poll(()=>distribution.locator('.ri-indicator-dot.kda-acronym-default').count(),{timeout:10000}).toBeGreaterThanOrEqual(40);
  const indBox=await distribution.locator('.ri-indicator-plot').boundingBox();
  expect(indBox?.height||0).toBeGreaterThanOrEqual(220);

  const indDots=distribution.locator('.ri-indicator-dot');
  const indLabels=distribution.locator('.ri-indicator-dot .ri-indicator-label');
  const dotCount=await indDots.count();
  expect(dotCount).toBeGreaterThanOrEqual(40);
  expect(await indLabels.count()).toBe(dotCount);
  for(const label of await indLabels.allTextContents())expect(label).toMatch(/^[A-Z]{3}$/);
  const visibleInd=await indLabels.evaluateAll(nodes=>nodes.filter(n=>getComputedStyle(n).display!=='none').length);
  expect(visibleInd).toBe(dotCount);
  expect(await distribution.locator('.ri-indicator-dot > .sr-only').count()).toBe(0);

  const target=distribution.locator('.ri-indicator-dot:not([disabled])').nth(5);
  const geo=await target.getAttribute('data-ri-indicator-geo');
  const fullName=(await target.getAttribute('aria-label')||'').split(' · ')[0].split(',')[0].trim();
  expect(geo).toBeTruthy();expect(fullName).toBeTruthy();
  await target.hover();
  await expect(distribution.locator('.kda-rank-hover-card')).toContainText(fullName);
  await target.click();
  await expect(page).toHaveURL(new RegExp(`pinned=${String(geo).replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}`));
  await expect(distribution.locator('.ri-indicator-pin')).toContainText('You are here');
  await expect(page.locator(`#ri-indicator-body tr[data-ri-geo="${geo}"]`)).toHaveClass(/ri-indicator-pinned/);
  expect(uncaught,'uncaught runtime errors').toEqual([]);
});

test('rankings acronym labels remain page-overflow safe on mobile', async ({ page }) => {
  const uncaught=[];
  page.on('pageerror',error=>uncaught.push(error.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/rankings',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#v2-dev-beeswarm')).toBeVisible({timeout:10000});
  await waitForVisualClarity(page);
  await expect.poll(()=>page.locator('#v2-dev-beeswarm .ri-spectrum-dot.kda-acronym-default').count(),{timeout:10000}).toBe(47);
  const devBox=await page.locator('.ri-spectrum-plot').boundingBox();
  expect(devBox?.height||0).toBeGreaterThanOrEqual(300);
  expect(await page.locator('#v2-dev-beeswarm .ri-spectrum-dot .ri-spectrum-label').count()).toBe(47);

  await page.locator('[data-ri-tab="indicator"]').click();
  await expect(page.locator('#v2-indicator-distribution')).toBeVisible({timeout:10000});
  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport+1);
  expect(uncaught,'uncaught runtime errors on mobile').toEqual([]);
});
