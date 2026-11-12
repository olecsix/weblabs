import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createPrisma } from '../src/utils/prisma.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);
const traces = [];
let pg, prisma, api, clusterDir, databaseUrl;
const missing = randomUUID();
let user, project, task, comment, attachment;

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function call(method, url, payload, expected) {
  let pending = api[method](url);
  if (payload !== undefined) pending = pending.send(payload);
  const result = await pending;
  traces.push({ method: method.toUpperCase(), url, ...(payload !== undefined ? { request: payload } : {}),
    expected, status: result.status, response: result.body });
  assert.equal(result.status, expected, `${method.toUpperCase()} ${url}: ${JSON.stringify(result.body)}`);
  return result;
}

before(async () => {
  try {
  const base = path.join(root, '.test-data');
  await mkdir(base, { recursive: true });
  clusterDir = await mkdtemp(path.join(base, 'pg-'));
  const port = await freePort();
  const password = randomUUID();
  databaseUrl = `postgresql://testuser:${password}@127.0.0.1:${port}/lab_test`;
  pg = new EmbeddedPostgres({ databaseDir: clusterDir, user: 'testuser', password, port,
    persistent: true, postgresFlags: ['-h', '127.0.0.1'], initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {}, onError: (message) => console.error(String(message)) });
  await pg.initialise();
  await pg.start();
  const admin = pg.getPgClient('postgres', '127.0.0.1');
  try {
    await admin.connect();
    await admin.query('CREATE DATABASE lab_test');
  } finally {
    await admin.end();
  }
  await exec(process.execPath, [path.join(root, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 60000 });
  prisma = createPrisma(databaseUrl);
  await prisma.$connect();
  api = request(createApp({ prisma }));
  } catch (error) {
    console.error('Не вдалося підготувати тестову БД:', error);
    throw error;
  }
}, { timeout: 180000 });

after(async () => {
  await mkdir(path.join(root, 'reports'), { recursive: true });
  await writeFile(path.join(root, 'reports/verification.json'), JSON.stringify({
    database: 'PostgreSQL (embedded-postgres, ізольований тимчасовий кластер)',
    executedAt: new Date().toISOString(), requests: traces,
  }, null, 2));
  await prisma?.$disconnect();
  await pg?.stop();
  // Видаляємо виключно створений цим запуском тимчасовий кластер.
  const base = path.resolve(root, '.test-data') + path.sep;
  if (clusterDir && path.resolve(clusterDir).startsWith(base)) {
    await rm(clusterDir, { recursive: true, force: true });
  }
});

test('01. Health перевіряє реальну PostgreSQL', async () => {
  const res = await call('get', '/health', undefined, 200);
  assert.equal(res.body.database, 'connected');
});

test('02. CREATE: усі п’ять ресурсів і зв’язок багато-до-багатьох', async () => {
  user = (await call('post', '/api/users', { name: 'Олена', email: 'OLENA@example.com' }, 201)).body.data;
  assert.equal(user.email, 'olena@example.com');
  project = (await call('post', '/api/projects', { name: 'Лабораторна 1', ownerId: user.id }, 201)).body.data;
  const member = await call('post', `/api/projects/${project.id}/members`, { userId: user.id, role: 'MANAGER' }, 201);
  assert.equal(member.body.data.role, 'MANAGER');
  task = (await call('post', '/api/tasks', { title: 'Створити API', projectId: project.id, assigneeId: user.id }, 201)).body.data;
  assert.equal(task.status, 'TODO');
  assert.equal(task.priority, 'MEDIUM');
  comment = (await call('post', '/api/comments', { body: 'Перевірити CRUD', taskId: task.id, authorId: user.id }, 201)).body.data;
  attachment = (await call('post', '/api/attachments', { fileName: 'plan.txt', mimeType: 'text/plain', size: 100,
    url: 'https://example.com/plan.txt', taskId: task.id, uploadedById: user.id }, 201)).body.data;
});

test('03. READ: кожен ресурс і учасник за ключем', async () => {
  for (const [name, row] of Object.entries({ users: user, projects: project, tasks: task, comments: comment, attachments: attachment })) {
    const res = await call('get', `/api/${name}/${row.id}`, undefined, 200);
    assert.equal(res.body.data.id, row.id);
  }
  await call('get', `/api/projects/${project.id}/members/${user.id}`, undefined, 200);
});

test('04. LIST: пагінація, фільтри та учасники', async () => {
  for (const name of ['users', 'projects', 'tasks', 'comments', 'attachments']) {
    const res = await call('get', `/api/${name}?page=1&limit=1`, undefined, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.meta.total, 1);
    assert.equal(res.body.meta.totalPages, 1);
  }
  const res = await call('get', `/api/tasks?projectId=${project.id}&status=TODO`, undefined, 200);
  assert.equal(res.body.data[0].id, task.id);
  assert.equal((await call('get', '/api/tasks?status=DONE', undefined, 200)).body.meta.total, 0);
  assert.equal((await call('get', '/api/tasks?page=2&limit=1', undefined, 200)).body.data.length, 0);
  await call('get', `/api/projects/${project.id}/members`, undefined, 200);
});

test('05. UPDATE: часткове оновлення всіх сутностей', async () => {
  const cases = [
    ['users', user, { name: 'Олена Коваль' }], ['projects', project, { description: 'REST API' }],
    ['tasks', task, { status: 'IN_PROGRESS', priority: 'HIGH', dueDate: '2026-11-10T12:00:00+02:00' }],
    ['comments', comment, { body: 'CRUD працює' }], ['attachments', attachment, { fileName: 'requirements.txt' }],
  ];
  for (const [name, row, data] of cases) {
    const res = await call('patch', `/api/${name}/${row.id}`, data, 200);
    for (const [key, value] of Object.entries(data)) {
      if (key === 'dueDate') assert.equal(new Date(res.body.data[key]).valueOf(), new Date(value).valueOf());
      else assert.equal(res.body.data[key], value);
    }
  }
  assert.equal((await call('patch', `/api/projects/${project.id}/members/${user.id}`, { role: 'MEMBER' }, 200)).body.data.role, 'MEMBER');
});

test('06. Валідація: email, UUID, enum, дата, числа, невідомі поля', async () => {
  const cases = [
    ['post', '/api/users', { name: ' ', email: 'bad' }],
    ['get', '/api/tasks/not-a-uuid', undefined],
    ['post', '/api/projects', { name: 'Без власника' }],
    ['patch', `/api/tasks/${task.id}`, { status: 'INVALID' }],
    ['patch', `/api/tasks/${task.id}`, { dueDate: 'tomorrow' }],
    ['patch', `/api/tasks/${task.id}`, {}],
    ['patch', `/api/tasks/${task.id}`, { id: missing }],
    ['patch', `/api/attachments/${attachment.id}`, { size: -1 }],
    ['patch', `/api/attachments/${attachment.id}`, { url: 'javascript:alert(1)' }],
    ['patch', `/api/projects/${project.id}/members/${user.id}`, { role: 'ADMIN' }],
    ['get', '/api/users?limit=101', undefined],
    ['get', '/api/users?page=0', undefined],
    ['get', '/api/users?limit=1&limit=2', undefined],
    ['get', '/api/tasks?unexpected=true', undefined],
  ];
  for (const [method, url, data] of cases) {
    const res = await call(method, url, data, 400);
    assert.equal(res.body.error.code, 'VALIDATION_ERROR');
    assert.ok(res.body.error.details.length);
  }
});

test('07. Конфлікти унікальності та зовнішніх ключів', async () => {
  await call('post', '/api/users', { name: 'Дублікат', email: 'olena@example.com' }, 409);
  await call('post', `/api/projects/${project.id}/members`, { userId: user.id }, 409);
  await call('post', '/api/tasks', { title: 'Сирота', projectId: missing }, 409);
  await call('delete', `/api/users/${user.id}`, undefined, 409);
});

test('08. Відсутні записи, маршрут та порожній список учасників', async () => {
  for (const name of ['users', 'projects', 'tasks', 'comments', 'attachments']) {
    await call('get', `/api/${name}/${missing}`, undefined, 404);
    await call('delete', `/api/${name}/${missing}`, undefined, 404);
  }
  await call('patch', `/api/tasks/${missing}`, { title: 'Оновлення' }, 404);
  await call('get', `/api/projects/${missing}/members`, undefined, 404);
  await call('get', `/api/projects/${project.id}/members/${missing}`, undefined, 404);
  await call('get', '/unknown', undefined, 404);
});

test('09. Невалідний JSON, тип та ліміт тіла', async () => {
  const malformed = await api.post('/api/users').set('Content-Type', 'application/json').send('{');
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
  const type = await api.post('/api/users').set('Content-Type', 'text/plain').send('hello');
  assert.equal(type.status, 415);
  const large = await api.post('/api/users').send({ name: 'x'.repeat(110000), email: 'big@example.com' });
  assert.equal(large.status, 413);
});

test('10. Помилки не розкривають SQL і мають ідентифікатор запиту', async () => {
  const res = await call('get', `/api/tasks/${missing}`, undefined, 404);
  assert.equal(res.body.error.requestId, res.headers['x-request-id']);
  assert.equal(res.body.error.stack, undefined);
  assert.equal(res.body.error.meta, undefined);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('11. Документація: специфікація та інтерфейс Swagger', async () => {
  const spec = await call('get', '/openapi.json', undefined, 200);
  assert.equal(spec.body.openapi, '3.0.3');
  assert.equal(Object.keys(spec.body.paths).length, 13);
  assert.equal((await api.get('/docs/')).status, 200);
  assert.equal((await api.get('/docs/swagger-ui-bundle.js')).status, 200);
});

test('12. DELETE: кожен ресурс, 204 та подальший 404', async () => {
  for (const [name, row] of [['attachments', attachment], ['comments', comment], ['tasks', task]]) {
    const res = await call('delete', `/api/${name}/${row.id}`, undefined, 204);
    assert.equal(res.text, '');
    await call('get', `/api/${name}/${row.id}`, undefined, 404);
  }
  await call('delete', `/api/projects/${project.id}/members/${user.id}`, undefined, 204);
  await call('get', `/api/projects/${project.id}/members/${user.id}`, undefined, 404);
  await call('delete', `/api/projects/${project.id}`, undefined, 204);
  await call('delete', `/api/users/${user.id}`, undefined, 204);
});

test('13. Каскадне видалення проєкту та SetNull виконавця', async () => {
  const owner = (await call('post', '/api/users', { name: 'Власник', email: 'owner@example.com' }, 201)).body.data;
  const worker = (await call('post', '/api/users', { name: 'Виконавець', email: 'worker@example.com' }, 201)).body.data;
  const p = (await call('post', '/api/projects', { name: 'Каскад', ownerId: owner.id }, 201)).body.data;
  await call('post', `/api/projects/${p.id}/members`, { userId: worker.id }, 201);
  const t = (await call('post', '/api/tasks', { title: 'Каскад', projectId: p.id, assigneeId: worker.id }, 201)).body.data;
  const c = (await call('post', '/api/comments', { body: 'Приклад', taskId: t.id, authorId: owner.id }, 201)).body.data;
  const a = (await call('post', '/api/attachments', { fileName: 'test.txt', mimeType: 'text/plain', size: 1,
    url: 'https://example.com/test.txt', taskId: t.id, uploadedById: owner.id }, 201)).body.data;
  await call('delete', `/api/users/${worker.id}`, undefined, 204);
  assert.equal((await call('get', `/api/tasks/${t.id}`, undefined, 200)).body.data.assigneeId, null);
  await call('delete', `/api/projects/${p.id}`, undefined, 204);
  for (const [name, row] of [['tasks', t], ['comments', c], ['attachments', a]]) {
    await call('get', `/api/${name}/${row.id}`, undefined, 404);
  }
  assert.equal(await prisma.projectMember.count({ where: { projectId: p.id } }), 0);
  await call('delete', `/api/users/${owner.id}`, undefined, 204);
});

test('14. Seed повторний та ідемпотентний', async () => {
  for (let i = 0; i < 2; i++) {
    await exec(process.execPath, ['prisma/seed.js'], { cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 30000 });
  }
  assert.equal(await prisma.user.count(), 2);
  assert.equal(await prisma.project.count(), 1);
  assert.equal(await prisma.projectMember.count(), 2);
  assert.equal(await prisma.task.count(), 1);
  assert.equal(await prisma.comment.count(), 1);
  assert.equal(await prisma.attachment.count(), 1);
});

test('15. Health повертає 503 при відмові БД', async () => {
  const unavailable = request(createApp({ prisma: { $queryRaw: async () => { throw new Error('connection refused'); } } }));
  const result = await unavailable.get('/health');
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, 'DATABASE_UNAVAILABLE');
});
