import { expect, test } from '@playwright/test';
import { signup } from './signup';

test.skip(!process.env.LAB_FULL_STACK, 'Запустіть npm run test:e2e з лабораторною 3');

test('захищений маршрут, реєстрація, CRUD проєктів і завдань, коментар, файл та вихід', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/login$/);
  await signup(page, 'workspace@example.test', 'Олексій Тест');
  await page.getByRole('link', { name: 'Переглянути проєкти' }).click();
  await page.getByRole('link', { name: /Новий проєкт/ }).click();
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByText('Введіть назву')).toBeVisible();
  await page.getByLabel('Назва проєкту').fill('Вебпроєкт команди');
  await page.getByLabel('Опис').fill('Розробка і тестування Task Manager');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByRole('heading', { name: 'Вебпроєкт команди' })).toBeVisible();
  await page.getByRole('link', { name: 'Додати завдання' }).click();
  await page.getByLabel('Назва завдання').fill('Перевірити інтерфейс');
  await page.getByLabel('Пріоритет').selectOption('HIGH');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByRole('heading', { name: 'Перевірити інтерфейс' })).toBeVisible();
  await page.getByLabel('Змінити статус').selectOption('IN_PROGRESS');
  await expect(page.locator('.badge').getByText('У роботі')).toBeVisible();
  await page.getByLabel('Коментар', { exact: true }).fill('Інтерфейс працює');
  await page.getByRole('button', { name: 'Додати коментар' }).click();
  await expect(page.getByText('Інтерфейс працює')).toBeVisible();
  await page
    .locator('input[name="files"]')
    .setInputFiles({
      name: 'notes.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('lab evidence'),
    });
  await page.getByRole('button', { name: 'Завантажити', exact: true }).click();
  await expect(page.getByRole('button', { name: /notes.txt/ })).toBeVisible();
  if (process.env.LAB_SCREENSHOTS)
    await page.screenshot({
      path: `${process.env.LAB_SCREENSHOTS}/task-details.png`,
      fullPage: true,
    });
  await page.getByRole('link', { name: 'Редагувати', exact: true }).click();
  await page.getByLabel('Назва завдання').fill('Перевірити CRUD');
  await page.getByRole('button', { name: 'Зберегти' }).click();
  await expect(page.getByRole('heading', { name: 'Перевірити CRUD' })).toBeVisible();
  await page
    .getByRole('navigation', { name: 'Робочий простір' })
    .getByRole('link', { name: 'Завдання' })
    .click();
  await page.getByLabel('Пошук').fill('CRUD');
  await expect(page.getByRole('link', { name: 'Перевірити CRUD' })).toBeVisible();
  if (process.env.LAB_SCREENSHOTS)
    await page.screenshot({ path: `${process.env.LAB_SCREENSHOTS}/tasks.png`, fullPage: true });
  await page.getByRole('link', { name: 'Перевірити CRUD' }).click();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Видалити', exact: true }).first().click();
  if (await page.getByRole('dialog').isVisible())
    await page.getByRole('button', { name: 'Підтвердити видалення' }).click();
  await expect(page).toHaveURL(/\/tasks$/);
  await page.getByRole('button', { name: 'Вийти' }).click();
  await expect(page).toHaveURL(/\/login$/);
});
