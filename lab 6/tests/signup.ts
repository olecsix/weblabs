import { expect, type Page } from '@playwright/test';

export async function signup(page: Page, email: string, name: string) {
  await page.goto('/register');
  await page.getByLabel('Ім’я', { exact: true }).fill(name);
  await page.getByLabel('Електронна пошта').fill(email);
  await page.getByLabel('Пароль', { exact: true }).fill('Password-2026!');
  await page.getByLabel('Повторіть пароль').fill('Password-2026!');
  await page.getByRole('button', { name: 'Зареєструватися' }).click();
  await expect(page.getByRole('heading', { name: 'Огляд команди' })).toBeVisible();
}
