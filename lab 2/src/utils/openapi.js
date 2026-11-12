import { z } from 'zod';
import { resourceSchemas } from '../routes/resources.js';
import { memberCreate, memberPatch, memberQuery, resources } from './validation.js';

const success = { description: 'Успішна відповідь' };
const failures = Object.fromEntries([400, 401, 403, 404, 409, 413, 415, 429, 500, 503].map((status) => [status, {
  description: 'Помилка API', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
}]));
const json = (schema) => ({ required: true, content: { 'application/json': { schema } } });
const convert = (schema) => z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'input' });
const params = (query) => Object.entries(convert(query).properties).map(([name, schema]) => ({ name, in: 'query', schema }));
const pathId = (name) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const operation = (summary, status = 200, options = {}) => ({ summary, responses: { [status]: success, ...failures }, ...options });
const fields = (properties, required = Object.keys(properties)) => ({ type: 'object', additionalProperties: false, properties, required });
const string = { type: 'string' };
const email = { ...string, format: 'email' };
const password = { ...string, format: 'password', minLength: 8, maxLength: 128 };
const binary = { ...string, format: 'binary' };
const publicOperation = { security: [] };

export function openApi() {
  const paths = {
    '/health': { get: operation('Перевірка з’єднання з PostgreSQL', 200, publicOperation) },
    '/api/auth/register': { post: operation('Зареєструватися', 201, { ...publicOperation, requestBody: json(fields({ name: string, email, password })) }) },
    '/api/auth/login': { post: operation('Увійти', 200, { ...publicOperation, requestBody: json(fields({ email, password })) }) },
    '/api/auth/refresh': { post: operation('Оновити пару токенів', 200, { ...publicOperation, requestBody: json(fields({ refreshToken: string })) }) },
    '/api/auth/me': { get: operation('Поточний профіль') },
    '/api/auth/logout': { post: operation('Відкликати поточну сесію', 204) },
    '/api/auth/password': { patch: operation('Змінити пароль', 204, { requestBody: json(fields({ currentPassword: password, newPassword: password })) }) },
    '/api/files': { post: operation('Додати до чотирьох файлів', 201, { requestBody: { required: true, content: {
      'multipart/form-data': { schema: fields({ taskId: { ...string, format: 'uuid' }, files: { type: 'array', items: binary, maxItems: 4 } }) },
    } } }) },
    '/api/files/{id}': { parameters: [pathId('id')], get: operation('Завантажити файл'),
      patch: operation('Замінити файл', 200, { requestBody: { required: true, content: { 'multipart/form-data': { schema: fields({ file: binary }) } } } }) },
    '/api/projects/{projectId}/members': { parameters: [pathId('projectId')],
      get: operation('Список учасників', 200, { parameters: params(memberQuery) }),
      post: operation('Додати учасника', 201, { requestBody: json(convert(memberCreate)) }) },
    '/api/projects/{projectId}/members/{userId}': { parameters: [pathId('projectId'), pathId('userId')],
      get: operation('Учасник'), patch: operation('Змінити роль', 200, { requestBody: json(convert(memberPatch)) }), delete: operation('Видалити учасника', 204) },
  };
  for (const key of Object.keys(resources)) {
    const { create, patch, query } = resourceSchemas(key);
    const tags = [key];
    paths[`/api/${key}`] = { get: operation('Список', 200, { tags, parameters: params(query) }),
      post: operation('Створити запис', 201, { tags, requestBody: json(convert(create)) }) };
    paths[`/api/${key}/{id}`] = { parameters: [pathId('id')], get: operation('Отримати запис', 200, { tags }),
      patch: operation('Оновити запис', 200, { tags, requestBody: json({ ...convert(patch), minProperties: 1 }) }),
      delete: operation('Видалити запис', 204, { tags }) };
  }
  return { openapi: '3.0.3', info: { title: 'Task Manager API', version: '2.0.0' }, paths,
    security: [{ bearerAuth: [] }], components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: { Error: fields({ error: fields({ code: string, message: string, requestId: string }, ['code', 'message']) }) } } };
}
