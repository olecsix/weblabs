import { test, expect } from '@playwright/test';

test('публічні маршрути, адаптивність і збереження теми', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Від плану до готового.' })).toBeVisible();
  if (process.env.LAB_SCREENSHOTS)
    await page.screenshot({ path: `${process.env.LAB_SCREENSHOTS}/home.png`, fullPage: true });
  await page.getByRole('link', { name: 'Про проєкт' }).click();
  await expect(
    page.getByRole('heading', { name: 'Один простір для спільної роботи' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Темна тема' }).click();
  await page.reload();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('navigation', { name: 'Головна навігація' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  if (process.env.LAB_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.LAB_SCREENSHOTS}/mobile-dark.png`,
      fullPage: true,
    });
  await page.goto('/unknown-page');
  await expect(page.getByRole('heading', { name: 'Сторінку не знайдено' })).toBeVisible();
});
