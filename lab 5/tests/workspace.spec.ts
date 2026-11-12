import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.LAB_FULL_STACK, 'Запустіть npm run test:e2e з лабораторною 3');

export async function signup(page: Page, email: string, name: string) {
  await page.goto('/register');
  await page.getByLabel('Ім’я', { exact: true }).fill(name);
  await page.getByLabel('Електронна пошта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Password-2026!');
  await page.getByLabel('Повторіть пароль').fill('Password-2026!');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByRole('heading', { name: 'Огляд команди' })).toBeVisible();
}

test('захищений маршрут, реєстрація, CRUD проєктів і завдань, коментар, файл та вихід', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1365, height: 900 });
  await page.goto('/tasks');
  await expect(page).toHaveURL(/\/login$/);
  if (process.env.LAB_SCREENSHOTS)
    await page.screenshot({ path: `${process.env.LAB_SCREENSHOTS}/login.png`, fullPage: true });
  await signup(page, 'workspace@example.test', 'Олексій Тест');
  if (process.env.LAB_SCREENSHOTS)
    await page.screenshot({ path: `${process.env.LAB_SCREENSHOTS}/dashboard.png`, fullPage: true });
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
  if (process.env.LAB_SCREENSHOTS)
    await page.screenshot({ path: `${process.env.LAB_SCREENSHOTS}/task-form.png`, fullPage: true });
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
