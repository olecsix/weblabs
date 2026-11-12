import { expect, test } from '@playwright/test';
import { signup } from './signup';

test.skip(!process.env.LAB_FULL_STACK, 'Запустіть npm run test:e2e');

test('два браузери бачать присутність, зміни та персональні сповіщення', async ({
  page,
  browser,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1365, height: 950 });
  const second = await browser.newContext({ baseURL: process.env.LAB_BASE_URL });
  try {
    const member = await second.newPage();
    await signup(page, 'manager-live@example.test', 'Менеджер Олексій');
    await signup(member, 'member-live@example.test', 'Учасник Тест');
    await expect(page.getByText('Наживо', { exact: true })).toBeVisible();
    await expect(member.getByText('Наживо', { exact: true })).toBeVisible();
    const memberId = await member.getByLabel('Мій ідентифікатор для запрошення').inputValue();
    await page.goto('/projects/new');
    await page.getByLabel('Назва проєкту').fill('Синхронізація команди');
    await page.getByRole('button', { name: 'Зберегти' }).click();
    await expect(page.getByRole('heading', { name: 'Синхронізація команди' })).toBeVisible();
    const projectUrl = page.url();
    await page.getByLabel('Ідентифікатор учасника').fill(memberId);
    await page.getByRole('button', { name: 'Додати учасника' }).click();
    await expect(page.getByText('Онлайн у проєкті: 2')).toBeVisible();
    await member.goto('/tasks');
    await expect(member.getByText('Завдань не знайдено.')).toBeVisible();

    await page.getByRole('link', { name: 'Додати завдання' }).click();
    await page.getByLabel('Назва завдання').fill('Оновлення наживо');
    await page.getByLabel('Опис', { exact: true }).fill('**Перевірено**');
    await page.getByRole('button', { name: 'Календар' }).click();
    await page.locator('.calendar-day').first().click();
    await page.getByLabel('Виконавець').selectOption(memberId);
    await page.getByRole('button', { name: 'Зберегти' }).click();
    await expect(page.getByRole('heading', { name: 'Оновлення наживо' })).toBeVisible();
    await expect(page.locator('.rich-text strong')).toHaveText('Перевірено');
    await expect(member.getByRole('link', { name: 'Оновлення наживо' })).toBeVisible();
    await member.getByRole('button', { name: /Сповіщення/ }).click();
    await expect(
      member.getByRole('region', { name: 'Сповіщення' }).getByText('Важливе'),
    ).toBeVisible();
    if (process.env.LAB_SCREENSHOTS)
      await member.screenshot({
        path: `${process.env.LAB_SCREENSHOTS}/notifications.png`,
        fullPage: true,
      });

    await page.getByText('Обрізати зображення перед завантаженням').click();
    await page.getByLabel('Зображення для обрізання').setInputFiles('public/icons/task-192.png');
    await expect(page.locator('canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Завантажити обрізане' }).click();
    await expect(page.getByRole('button', { name: /image-crop.png/ })).toBeVisible();
    await page.goto(projectUrl);
    await expect(
      page.getByRole('figure', { name: 'Кількість завдань за статусами' }),
    ).toBeVisible();
    if (process.env.LAB_SCREENSHOTS)
      await page.screenshot({
        path: `${process.env.LAB_SCREENSHOTS}/project-live.png`,
        fullPage: true,
      });
    await page.getByRole('tab', { name: 'Порядок завдань' }).click();
    await expect(page.getByRole('button', { name: 'Перемістити Оновлення наживо' })).toBeVisible();
    await page.goto('/stream');
    await page.getByRole('button', { name: /Проєкт · Усі проєкти/ }).click();
    await page.getByLabel('Пошук: Проєкт').fill('Синхронізація');
    await page.getByRole('button', { name: 'Синхронізація команди' }).click();
    await expect(page.getByRole('link', { name: 'Оновлення наживо' })).toBeVisible();
  } finally {
    await second.close();
  }
});

test('PWA відкриває публічну оболонку після втрати мережі', async ({ page, context }) => {
  test.skip(!process.env.LAB_PRODUCTION, 'Service Worker перевіряється у виробничій збірці');
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Від плану до готового.' })).toBeVisible();
    await expect(page.getByText(/Офлайн\. Для оновлення/)).toBeVisible();
    if (process.env.LAB_SCREENSHOTS)
      await page.screenshot({ path: `${process.env.LAB_SCREENSHOTS}/offline.png`, fullPage: true });
  } finally {
    await context.setOffline(false);
  }
});
