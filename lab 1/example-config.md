# Конфігурація і типові проблеми

## Змінні середовища

| Змінна | Значення у прикладі | Призначення |
|---|---|---|
| `DATABASE_URL` | `postgresql://lab:lab_local_password@localhost:5432/task_manager?schema=public` | Prisma CLI та сервер; PostgreSQL URL обов’язковий для сервера |
| `POSTGRES_PASSWORD` | `lab_local_password` | Пароль користувача `lab` у Docker Compose |
| `PORT` | `3000` | Ціле число 1–65535 |
| `HOST` | `127.0.0.1` | Інтерфейс HTTP-сервера |
| `NODE_ENV` | `development` | `development`, `test`, `production` |

Пароль у `POSTGRES_PASSWORD` і пароль у `DATABASE_URL` мають відповідати один одному. Спеціальні символи пароля в URL потрібно percent-encode. `.env.example` містить лише локальні демонстраційні значення.

## Власна PostgreSQL без Docker

Створіть користувача і базу від адміністратора PostgreSQL:

```sql
CREATE USER lab WITH PASSWORD 'lab_local_password';
CREATE DATABASE task_manager OWNER lab;
```

У `.env` задайте відповідний `DATABASE_URL`; далі виконайте `npm ci`, `npm run db:generate`, `npm run db:migrate`, `npm run db:seed`, `npm start`. Для застосування наявної міграції `migrate deploy` не потрібна shadow database.

Для створення **нових** міграцій під час зміни схеми використовуйте `npm run db:migrate:dev -- --name назва_зміни`; у цьому режимі PostgreSQL-користувачу потрібна можливість створити shadow database або її окреме налаштування. Початковий запуск використовує вже готову міграцію.

## Поширені ситуації

- **`npm` не знайдено:** встановіть Node.js із npm, перезапустіть термінал.
- **Порт БД 5432 зайнятий:** змініть лівий порт у `compose.yaml` на `5433` і порт у `DATABASE_URL` на `5433`.
- **HTTP-порт зайнятий:** змініть `PORT` у `.env`.
- **Не знайдено generated client:** виконайте `npm run db:generate`.
- **База недоступна:** перевірте `docker compose ps`, `docker compose logs db`, пароль і `DATABASE_URL`.
- **Зміна пароля в `.env` не діє на наявний Docker volume:** `POSTGRES_PASSWORD` задає пароль під час першої ініціалізації; змініть пароль SQL-командою в наявній БД та узгодьте URL.
- **409 на видалення користувача:** видаліть або перепризначте його проєкти, коментарі та вкладення; це очікуваний захист зовнішніх ключів.
- **400 на PATCH:** запит має містити хоча б одне відоме поле. Для очищення необов’язкових `description`, `assigneeId`, `dueDate` передайте `null`.
- **415:** задайте `Content-Type: application/json`.
- **Тести embedded-postgres не можуть запустити binary:** перевірте підтримку вашої ОС/архітектури та дозвіл на installation scripts. Windows x64 — перевірене середовище цієї роботи.

`docker compose stop db` зберігає дані. Для штатного запуску повторна ініціалізація або видалення volume не потрібні.
