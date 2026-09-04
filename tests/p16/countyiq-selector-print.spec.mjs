import { test, expect } from '@playwright/test';

test('CountyIQ county selector updates county-bound surfaces, persists state and exposes print', async ({ page }) => {
  const uncaught=[];
  page.on('pageerror',error=>uncaught.push(error.message));

  await page.setViewportSize({width:1440,height:900});
  await page.goto('/#/countyiq',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toHaveAttribute('data-view','countyiq');

  const picker=page.locator('#ciq-county-select');
  await expect(picker).toBeVisible({timeout:15000});
  await expect(picker.locator('option')).toHaveCount(47,{timeout:15000});

  await picker.selectOption('KEN-C041');
  await expect(page.locator('#ciq-county-title')).toHaveText('Siaya');
  await expect(page).toHaveURL(/county=KEN-C041/);
  await expect(page.locator('#ciq-place-facts')).toContainText('Siaya at a glance',{timeout:10000});
  await expect(page.locator('#ciq-evidence-note')).toContainText('Siaya',{timeout:10000});
  await expect(page.locator('#opportunity-list')).toContainText('Siaya',{timeout:10000});

  await picker.selectOption('KEN-C042');
  await expect(page.locator('#ciq-county-title')).toHaveText('Kisumu');
  await expect(page).toHaveURL(/county=KEN-C042/);
  await expect(page.locator('#ciq-place-facts')).toContainText('Kisumu at a glance',{timeout:10000});
  await expect(page.locator('#ciq-evidence-note')).toContainText('Kisumu',{timeout:10000});

  await page.reload({waitUntil:'domcontentloaded'});
  await expect(page.locator('#ciq-county-title')).toHaveText('Kisumu',{timeout:15000});
  await expect(page.locator('#ciq-county-select')).toHaveValue('KEN-C042');
  await expect(page.locator('.ciq-print-button')).toBeVisible();
  await expect(page.locator('.ciq-jump-nav')).toBeVisible();

  const alignment=await page.locator('.ciq-jump-nav').evaluate(node=>{
    const rect=node.getBoundingClientRect();
    return {center:rect.left+rect.width/2,viewport:document.documentElement.clientWidth/2};
  });
  expect(Math.abs(alignment.center-alignment.viewport)).toBeLessThanOrEqual(2);
  expect(uncaught,'uncaught runtime errors on CountyIQ county switching').toEqual([]);
});
