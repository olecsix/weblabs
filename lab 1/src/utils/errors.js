export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    Object.assign(this, { status, code, details });
  }
}

export function errorHandler(error, req, res, next) {
  if (res.headersSent) return next(error);
  let { status = 500, code = 'INTERNAL_ERROR', message = 'Внутрішня помилка сервера', details } =
    error instanceof HttpError ? error : {};

  const prismaErrors = {
    P2002: [409, 'CONFLICT', 'Запис з таким унікальним значенням уже існує'],
    P2003: [409, 'RELATION_CONFLICT', 'Пов’язаний запис відсутній або видалення заборонено зв’язками'],
    P2025: [404, 'NOT_FOUND', 'Запис не знайдено'],
    P1001: [503, 'DATABASE_UNAVAILABLE', 'База даних недоступна'],
    P1002: [503, 'DATABASE_UNAVAILABLE', 'Перевищено час підключення до бази даних'],
    P2024: [503, 'DATABASE_UNAVAILABLE', 'Немає вільного підключення до бази даних'],
  };
  if (prismaErrors[error.code]) [status, code, message] = prismaErrors[error.code];
  if (error.type === 'entity.parse.failed') {
    [status, code, message] = [400, 'INVALID_JSON', 'Некоректний JSON'];
  }
  if (error.type === 'entity.too.large') {
    [status, code, message] = [413, 'PAYLOAD_TOO_LARGE', 'Тіло запиту перевищує 100 КБ'];
  }
  if (status >= 500) console.error(`[${req.id}]`, error.message);
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}), requestId: req.id } });
}
