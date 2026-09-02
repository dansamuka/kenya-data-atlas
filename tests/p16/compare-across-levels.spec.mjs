import { test, expect } from '@playwright/test';

async function openAcross(page) {
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#/compare', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveAttribute('data-view','compare');
  const across=page.locator('[data-compare-mode="cross-level"]');
  await expect(across).toBeVisible({ timeout: 20000 });
  await across.click();
  const panel=page.locator('[data-compare-panel="cross-level"]');
  await expect(panel).toBeVisible();
  await expect(across).toHaveClass(/active/);
  await expect.poll(async()=>new URL(page.url()).hash).toContain('mode=cross-level');
  await expect(panel.locator('[data-xlevel-places] .xlevel-place')).toHaveCount(3);
  await expect(panel.locator('[data-xlevel-indicator]')).toBeVisible();
  await expect(panel.locator('[data-xlevel-output]')).toBeVisible();
  expect(errors).toEqual([]);
  return { across, panel, errors };
}

test('Across levels opens and remains the active Compare mode', async ({ page }) => {
  const { across, panel }=await openAcross(page);
  await page.waitForTimeout(250);
  await expect(panel).toBeVisible();
  await expect(across).toHaveClass(/active/);
});

test('Across levels survives place changes without falling back to Direct', async ({ page }) => {
  const { across, panel }=await openAcross(page);
  const level=panel.locator('[data-slot="1"] [data-slot-level]');
  await level.selectOption('constituency');
  await page.waitForTimeout(150);
  await expect(panel).toBeVisible();
  await expect(across).toHaveClass(/active/);
  await expect.poll(async()=>new URL(page.url()).hash).toContain('mode=cross-level');
});

test('Across levels deep link restores and mode switching remains reversible', async ({ page }) => {
  await page.goto('/#/compare?mode=cross-level', { waitUntil: 'domcontentloaded' });
  const across=page.locator('[data-compare-mode="cross-level"]');
  const panel=page.locator('[data-compare-panel="cross-level"]');
  await expect(across).toBeVisible({ timeout: 20000 });
  await expect(panel).toBeVisible({ timeout: 20000 });
  await expect(across).toHaveClass(/active/);

  const direct=page.locator('[data-compare-mode="direct"]');
  await direct.click();
  await expect(page.locator('[data-compare-panel="direct"]')).toBeVisible();
  await across.click();
  await expect(panel).toBeVisible();
  await expect(across).toHaveClass(/active/);
});

test('Across levels mobile display does not overflow the document', async ({ page }) => {
  await page.setViewportSize({ width:390, height:844 });
  await openAcross(page);
  const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.viewport+1);
});
