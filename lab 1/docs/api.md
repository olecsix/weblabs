# API: контракти та приклади

Базова адреса: `http://127.0.0.1:3000`. JSON-кодування UTF-8. Усі POST/PATCH потребують `Content-Type: application/json`.
Машиночитана специфікація: [openapi.json](openapi.json), інтерактивний Swagger — `/docs/`.

## Маршрути

Для кожного `R` із `users`, `projects`, `tasks`, `comments`, `attachments` реалізовано:

| Метод | Шлях | Результат |
|---|---|---|
| POST | `/api/R` | 201, `{ "data": запис }`, заголовок Location |
| GET | `/api/R` | 200, `{ "data": [...], "meta": {...} }` |
| GET | `/api/R/:id` | 200, `{ "data": запис }` |
| PATCH | `/api/R/:id` | 200, частково оновлений запис |
| DELETE | `/api/R/:id` | 204, порожнє тіло |

Додаткові 5 операцій для зв’язку M:N:

| Метод | Шлях | Тіло / результат |
|---|---|---|
| POST | `/api/projects/:projectId/members` | `{ "userId": "UUID", "role": "MEMBER" }`, 201 |
| GET | `/api/projects/:projectId/members` | Список із пагінацією, 200 |
| GET | `/api/projects/:projectId/members/:userId` | Один учасник, 200 |
| PATCH | `/api/projects/:projectId/members/:userId` | `{ "role": "MANAGER" }`, 200 |
| DELETE | `/api/projects/:projectId/members/:userId` | 204 |

`GET /health` перевіряє `SELECT 1` у PostgreSQL: 200 при доступності, 503 при відмові. Невідомий маршрут дає 404. Для відсутнього проєкту список учасників дає 404; для наявного без учасників — порожній список. Власник не додається до учасників автоматично.

## Поля створення

`*` — обов’язкове. UUID — UUID існуючого пов’язаного запису. `id`, `createdAt`, `updatedAt` створює сервер; клієнт не може їх задавати.

| Ресурс | Поля |
|---|---|
| users | `name*` 1–100 символів; `email*` коректна адреса до 254 символів, нормалізується до нижнього регістру й унікальна |
| projects | `name*` 1–150; `ownerId*` UUID; `description` 1–2000 або null |
| tasks | `title*` 1–200; `projectId*` UUID; `description` 1–5000 або null; `assigneeId` UUID або null; `status` TODO / IN_PROGRESS / DONE, стандартно TODO; `priority` LOW / MEDIUM / HIGH, стандартно MEDIUM; `dueDate` ISO 8601 datetime із Z або часовим поясом, або null |
| comments | `body*` 1–3000; `taskId*` UUID; `authorId*` UUID |
| attachments | `fileName*` 1–255; `mimeType*` MIME-тип до 100; `size*` ціле число байтів 1–10485760; `url*` HTTP(S) URL до 2048; `taskId*` UUID; `uploadedById*` UUID |
| members | `userId*` UUID; `role` MEMBER / MANAGER, стандартно MEMBER |

PATCH приймає будь-яку непорожню підмножину полів створення. Учаснику змінюється лише `role`. У `ProjectMember` немає окремого `id` та `updatedAt`, ключ складений. Текст обрізається по краях; порожні рядки й невідомі поля заборонено. `size` у JSON має бути числом. `dueDate` у відповіді нормалізується до UTC.

## Списки

`page` — ціле число 1–100000, стандартно 1; `limit` — 1–100, стандартно 20. Сортування від новіших `createdAt` до старіших, додатково за ключем для стабільності. `totalPages = ceil(total / limit)`; для порожнього списку 0. Результати не містять вкладених ресурсів — використовуйте фільтри.

| Список | Додаткові фільтри, точна відповідність |
|---|---|
| projects | `ownerId` |
| tasks | `projectId`, `assigneeId`, `status` |
| comments | `taskId`, `authorId` |
| attachments | `taskId`, `uploadedById` |
| users / members | Немає |

Приклад: `GET /api/tasks?projectId=10000000-0000-4000-8000-000000000001&status=IN_PROGRESS&page=1&limit=10`.

## Помилки

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Перевірте вхідні дані",
    "details": [{ "path": "email", "message": "Invalid email address" }],
    "requestId": "44b4b8ec-e217-4c7c-adf5-61d74407b89d"
  }
}
```

Повідомлення `details` надає Zod; вони можуть бути англійською. `details` є лише за наявності. Для кореляції відповідь також має `X-Request-Id`.

| HTTP | Код | Значення |
|---|---|---|
| 400 | VALIDATION_ERROR | Поле, параметр шляху або query не відповідає схемі |
| 400 | INVALID_JSON | Помилка синтаксису JSON |
| 404 | NOT_FOUND | Запис або маршрут відсутній |
| 409 | CONFLICT | Неунікальний email або повторний учасник проєкту |
| 409 | RELATION_CONFLICT | Наявні залежності забороняють видалення або пов’язаний UUID не існує |
| 413 | PAYLOAD_TOO_LARGE | JSON понад 100 КБ |
| 415 | UNSUPPORTED_MEDIA_TYPE | Потрібний application/json |
| 500 | INTERNAL_ERROR | Неочікувана помилка; SQL і stack не повертаються клієнту |
| 503 | DATABASE_UNAVAILABLE | Відмова health або відомі помилки доступності/таймауту Prisma |

## Правила видалення

- Видалення проєкту каскадно видаляє учасників і завдання; разом із завданнями — коментарі та метадані вкладень.
- Видалення завдання каскадно видаляє коментарі та метадані вкладень.
- Користувача-власника проєктів, автора коментарів або завантажувача вкладень видалити не можна до усунення цих залежностей: 409.
- Видалення іншого користувача видаляє його участь у проєктах і встановлює `assigneeId = null` у завданнях.
- Видалення учасника не змінює завдання та власника: в цій моделі призначення завдань не залежить від членства.
- Фізичні файли API не зберігає; DELETE Attachment видаляє лише метадані.
