# Лабораторна робота 1 — Task Manager API

Готовий навчальний backend системи керування завданнями: **Node.js + Express 5 + PostgreSQL + Prisma 7**.

Завдання: [lab-01.md](https://github.com/olroi421/course-web/blob/main/labs/lab-01.md).
Предметна область обрана самостійно відповідно до умов. Усі пояснення — українською.

## Що реалізовано

- 6 пов’язаних моделей: `User`, `Project`, `ProjectMember`, `Task`, `Comment`, `Attachment`.
- Зв’язки 1:N та M:N через складений ключ `(projectId, userId)`.
- 30 операцій CRUD, пагінація та фільтрація списків.
- PostgreSQL, початкова SQL-міграція, ідемпотентне наповнення прикладами.
- Строга валідація Zod, контроль UUID, enum, email, URL, дат, розмірів і невідомих полів.
- JSON-помилки, HTTP-коди, `X-Request-Id`, ліміт тіла 100 КБ, базові заголовки Helmet.
- Swagger UI `/docs/`, OpenAPI `/openapi.json`, [опис API](docs/api.md), [HTTP-запити](requests/lab-01.http).
- Інтеграційні тести з окремою реальною PostgreSQL, [звіт](reports/lab1-report.md), докази перевірки.

У цій лабораторній `ProjectMember.role` — дані для майбутнього розмежування доступу. Входу в систему й перевірки прав ще немає. `Attachment` зберігає метадані та HTTP(S)-посилання; передавання й обробка бінарних файлів та real-time є можливостями розвитку предметної області, а не реалізованими функціями лабораторної 1. API призначене для локальної навчальної демонстрації; будь-який локальний клієнт може змінювати записи. Власник проєкту та його учасники задаються окремо; виконавцем може бути будь-який наявний користувач.

## Запуск

Потрібні Node.js **22.12+ у гілці 22 або 24.x**, npm, Docker із Docker Compose. Замість Docker можна використати власну PostgreSQL, див. [example-config.md](example-config.md).

Відкрийте термінал у папці з цим `README.md`.

### 1. Конфігурація

PowerShell:

```powershell
Copy-Item .env.example .env
```

Linux / macOS:

```bash
cp .env.example .env
```

`.env` не потрапляє до Git. Якщо файл уже існує, перевірте його замість повторного копіювання.

### 2. Залежності, база та міграція

```bash
npm ci
npm run db:generate
docker compose up -d --wait db
npm run db:migrate
npm run db:seed
npm start
```

Відкрийте:

- [Swagger UI](http://127.0.0.1:3000/docs/) — інтерактивна документація з `Try it out`.
- [Health](http://127.0.0.1:3000/health) — `{"status":"ok","database":"connected"}`.
- [OpenAPI JSON](http://127.0.0.1:3000/openapi.json).

`npm run dev` перезапускає сервер після змін. `Ctrl+C` зупиняє сервер. `docker compose stop db` зупиняє БД зі збереженням записів.

### 3. Перевірка

В іншому терміналі:

```bash
npm test
```

Тести автоматично піднімають власний тимчасовий PostgreSQL на вільному порту, застосовують міграцію, перевіряють API й повторний seed, зупиняють кластер і видаляють лише створену ними тестову папку. Робочий `DATABASE_URL` не використовується для тестових операцій. Docker для тестів не потрібен. Використано пакет `embedded-postgres`; npm має дозволяти його штатні installation scripts. Запускайте тести від звичайного користувача, не `root`.

```bash
npm run check
```

Ця команда перевіряє Prisma-схему, перебудовує OpenAPI з актуальних схем валідації та виконує тести. Фактичні запити й відповіді останнього тестового запуску зберігаються в `reports/verification.json`.

Для ручної демонстрації відкрийте `requests/lab-01.http` у VS Code із REST Client і виконуйте запити згори вниз або використайте Swagger. Послідовність створює користувача → проєкт → учасника → завдання → коментар → метадані вкладення, а потім видаляє створені записи. Для повторної демонстрації після неповного запуску змініть email у першому запиті.

Швидкий приклад PowerShell:

```powershell
$body = @{ name = 'Марія'; email = 'maria@example.com' } | ConvertTo-Json
$user = Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3000/api/users' -ContentType 'application/json' -Body ([System.Text.Encoding]::UTF8.GetBytes($body))
Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/users/$($user.data.id)"
```

## Структура

```text
src/
  app.js                   Express, middleware, Swagger, маршрути
  server.js                конфігурація, запуск, завершення
  controllers/             HTTP-запити та відповіді
  models/                  CRUD через Prisma
  routes/                  REST-маршрути
  utils/                   валідація, конфігурація, помилки, Prisma
prisma/
  schema.prisma            моделі та зв’язки
  migrations/              готова початкова SQL-міграція
  seed.js                  демонстраційні дані
docs/                      API, OpenAPI, архітектура
requests/lab-01.http       готова послідовність запитів
scripts/build-openapi.js   побудова специфікації з Zod
tests/api.test.js          інтеграційні сценарії
reports/                   звіт, результати, скріншоти
compose.yaml               локальна PostgreSQL
.env.example               зразок конфігурації
prisma.config.ts           конфігурація Prisma 7
```

`generated/prisma` створюється командою `db:generate`, `node_modules` — командою `npm ci`. В архів їх не включено. У Prisma 7 URL БД розміщено в `prisma.config.ts`, а клієнт використовує адаптер `@prisma/adapter-pg`; це свідомий вибір версії, а не конфігурація Prisma 6.

## Здавання роботи

1. Заповніть ПІБ і групу в `reports/lab1-report.md`.
2. Перевірте запуск і результати тестів; за потреби оновіть власні скріншоти.
3. Створіть свій порожній GitHub-репозиторій, додайте його адресу у звіт.
4. Локальний Git уже ініціалізовано; якщо переносите лише архів, виконайте `git init -b main`.
5. Налаштуйте власні `git config user.name` та `git config user.email`, якщо вони ще не задані, і виконайте:

```bash
git add .
git commit -m "Complete lab 1: task manager backend"
git remote add origin <URL_ВАШОГО_РЕПОЗИТОРІЮ>
```

Push не виконано. Після власного рішення опублікувати роботу виконайте `git push -u origin main`, а посилання подайте в Moodle. GitHub-репозиторій, персональні дані та подання в LMS неможливо заповнити достовірно без ваших даних; програмна частина та матеріали для здавання підготовлені локально.
