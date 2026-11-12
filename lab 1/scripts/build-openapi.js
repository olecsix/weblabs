import { mkdirSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { resources, memberCreate, memberPatch, memberQuery } from '../src/utils/validation.js';

const schema = (value) => z.toJSONSchema(value, { target: 'openapi-3.0', io: 'input' });
const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
const json = (value) => ({ 'application/json': { schema: value } });
const response = (description, value) => ({ description, ...(value ? { content: json(value) } : {}) });
const body = (name) => ({ required: true, content: json(ref(name)) });
const param = (name) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
const envelope = (name) => ({ type: 'object', required: ['data'], properties: { data: ref(name) } });
const listEnvelope = (name) => ({ type: 'object', required: ['data', 'meta'], properties: {
  data: { type: 'array', items: ref(name) }, meta: ref('Pagination'),
} });
const errors = Object.fromEntries([400, 404, 409, 413, 415, 500, 503].map((status) =>
  [status, response('Помилка; докладні значення кодів у docs/api.md', ref('Error'))]));
const queryParams = (query) => Object.entries(schema(query).properties).map(([name, value]) =>
  ({ name, in: 'query', required: false, schema: value }));
const document = {
  openapi: '3.0.3',
  info: { title: 'Task Manager API — Лабораторна робота 1', version: '1.0.0',
    description: 'Навчальний CRUD backend. Авторизація, передавання файлів і WebSocket заплановані для наступних робіт. Attachment зберігає лише метадані.' },
  servers: [{ url: '/' }],
  paths: {
    '/health': { get: { tags: ['System'], summary: 'Перевірка HTTP та PostgreSQL', responses: {
      200: response('База доступна', { type: 'object', properties: { status: { type: 'string', enum: ['ok'] }, database: { type: 'string', enum: ['connected'] } } }),
      503: errors[503],
    } } },
  },
  components: { schemas: {
    Pagination: { type: 'object', required: ['page', 'limit', 'total', 'totalPages'], properties: {
      page: { type: 'integer', minimum: 1 }, limit: { type: 'integer', minimum: 1, maximum: 100 },
      total: { type: 'integer', minimum: 0 }, totalPages: { type: 'integer', minimum: 0 },
    } },
    Error: { type: 'object', required: ['error'], properties: { error: {
      type: 'object', required: ['code', 'message', 'requestId'], properties: {
        code: { type: 'string' }, message: { type: 'string' }, requestId: { type: 'string', format: 'uuid' },
        details: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, message: { type: 'string' } } } },
      },
    } } },
  } },
};

for (const [path, entry] of Object.entries(resources)) {
  const name = entry.name;
  const create = schema(entry.create);
  document.components.schemas[`${name}Create`] = create;
  document.components.schemas[`${name}Patch`] = { ...schema(entry.patch), minProperties: 1 };
  const properties = {
    ...create.properties, id: { type: 'string', format: 'uuid', readOnly: true },
    createdAt: { type: 'string', format: 'date-time', readOnly: true },
    updatedAt: { type: 'string', format: 'date-time', readOnly: true },
  };
  document.components.schemas[name] = { type: 'object', properties, required: Object.keys(properties) };
  document.paths[`/api/${path}`] = {
    get: { tags: [name], summary: `Список ${name}`, parameters: queryParams(entry.query),
      responses: { ...errors, 200: response('Сторінка результатів', listEnvelope(name)) } },
    post: { tags: [name], summary: `Створити ${name}`, requestBody: body(`${name}Create`),
      responses: { ...errors, 201: { ...response('Створено', envelope(name)), headers: { Location: { schema: { type: 'string' }, description: 'Адреса нового ресурсу' } } } } },
  };
  document.paths[`/api/${path}/{id}`] = {
    parameters: [param('id')],
    get: { tags: [name], summary: `Отримати ${name}`, responses: { ...errors, 200: response('Знайдено', envelope(name)) } },
    patch: { tags: [name], summary: `Частково оновити ${name}`, requestBody: body(`${name}Patch`),
      responses: { ...errors, 200: response('Оновлено', envelope(name)) } },
    delete: { tags: [name], summary: `Видалити ${name}`, responses: { ...errors, 204: response('Видалено; тіло відповіді відсутнє') } },
  };
}

document.components.schemas.MemberCreate = schema(memberCreate);
document.components.schemas.MemberPatch = schema(memberPatch);
document.components.schemas.Member = {
  type: 'object', required: ['projectId', 'userId', 'role', 'createdAt'], properties: {
    projectId: { type: 'string', format: 'uuid' }, userId: { type: 'string', format: 'uuid' },
    role: { type: 'string', enum: ['MEMBER', 'MANAGER'] }, createdAt: { type: 'string', format: 'date-time' },
  },
};
document.paths['/api/projects/{projectId}/members'] = {
  parameters: [param('projectId')],
  get: { tags: ['Member'], summary: 'Учасники проєкту', parameters: queryParams(memberQuery), responses: {
    ...errors, 200: response('Сторінка учасників', listEnvelope('Member')),
  } },
  post: { tags: ['Member'], summary: 'Додати учасника', requestBody: body('MemberCreate'), responses: {
    ...errors, 201: response('Додано', envelope('Member')),
  } },
};
document.paths['/api/projects/{projectId}/members/{userId}'] = {
  parameters: [param('projectId'), param('userId')],
  get: { tags: ['Member'], summary: 'Отримати учасника', responses: { ...errors, 200: response('Знайдено', envelope('Member')) } },
  patch: { tags: ['Member'], summary: 'Оновити роль', requestBody: body('MemberPatch'), responses: { ...errors, 200: response('Оновлено', envelope('Member')) } },
  delete: { tags: ['Member'], summary: 'Видалити учасника', responses: { ...errors, 204: response('Видалено') } },
};
mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
writeFileSync(new URL('../docs/openapi.json', import.meta.url), `${JSON.stringify(document, null, 2)}\n`);
console.log(`OpenAPI: ${Object.keys(document.paths).length} шляхів`);
