import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { fixture } from './fixture.js';
import { createApp } from '../src/app.js';

const password = 'Test password 2026!';
let env, api;
before(async () => { env = await fixture(); api = request(createApp(env)); }, { timeout: 120_000 });
after(async () => { await env?.close(); });
const authenticate = (response) => `Bearer ${response.body.tokens.accessToken}`;
const register = (email) => api.post('/api/auth/register').send({ name: 'Тестовий користувач', email, password }).expect(201);

test('реєстрація хешує пароль, JWT розрізняє токени, middleware захищає API', async () => {
  await api.post('/api/auth/register').send({ name: 'x', email: 'bad', password: '1' }).expect(400);
  const user = await register('auth@example.test');
  assert.equal(user.body.user.role, 'USER');
  assert.equal(user.body.user.passwordHash, undefined);
  assert.match((await env.prisma.user.findUnique({ where: { id: user.body.user.id } })).passwordHash, /^\$argon2id\$/);
  await api.get('/api/projects').expect(401);
  await api.get('/api/projects').set('Authorization', `Bearer ${user.body.tokens.refreshToken}`).expect(401);
  await api.get('/api/users').set('Authorization', authenticate(user)).expect(403);
  await env.prisma.user.update({ where: { id: user.body.user.id }, data: { role: 'ADMIN' } });
  const admin = await api.get('/api/users').set('Authorization', authenticate(user)).expect(200);
  assert.ok(admin.body.data.every((row) => row.passwordHash === undefined));
  await api.post('/api/auth/register').send({ name: 'Test', email: 'auth@example.test', password }).expect(409);
  await api.get('/docs/').expect(200);
  const spec = await api.get('/openapi.json').expect(200);
  assert.equal(spec.body.components.securitySchemes.bearerAuth.scheme, 'bearer');
});

test('login, ротація refresh, зміна пароля та відкликання сесії', async () => {
  await register('sessions@example.test');
  await api.post('/api/auth/login').send({ email: 'sessions@example.test', password: 'Wrong password' }).expect(401);
  const login = await api.post('/api/auth/login').send({ email: 'sessions@example.test', password }).expect(200);
  const input = { refreshToken: login.body.tokens.refreshToken };
  const rotated = await api.post('/api/auth/refresh').send(input).expect(200);
  assert.notEqual(rotated.body.tokens.refreshToken, input.refreshToken);
  await api.post('/api/auth/refresh').send(input).expect(401);
  await api.get('/api/auth/me').set('Authorization', authenticate(login)).expect(401);
  await api.patch('/api/auth/password').set('Authorization', authenticate(rotated)).send({ currentPassword: password, newPassword: 'Updated password 2026!' }).expect(204);
  await api.get('/api/auth/me').set('Authorization', authenticate(rotated)).expect(401);
  const next = await api.post('/api/auth/login').send({ email: 'sessions@example.test', password: 'Updated password 2026!' }).expect(200);
  await api.post('/api/auth/logout').set('Authorization', authenticate(next)).expect(204);
  await api.post('/api/auth/refresh').send({ refreshToken: next.body.tokens.refreshToken }).expect(401);
});

test('CRUD та пошук обмежені проєктом, вкладення зберігаються і замінюються', async () => {
  const [owner, member] = await Promise.all([register('owner@example.test'), register('member@example.test')]);
  const ownerAuth = authenticate(owner);
  const memberAuth = authenticate(member);
  const project = (await api.post('/api/projects').set('Authorization', ownerAuth).send({ name: 'Курсова дошка' }).expect(201)).body.data;
  const task = (await api.post('/api/tasks').set('Authorization', ownerAuth).send({ title: 'Завдання API', projectId: project.id }).expect(201)).body.data;
  await api.get(`/api/tasks/${task.id}`).set('Authorization', memberAuth).expect(404);
  const hidden = await api.get('/api/tasks').set('Authorization', memberAuth).expect(200);
  assert.equal(hidden.body.meta.total, 0);
  await api.post(`/api/projects/${project.id}/members`).set('Authorization', ownerAuth).send({ userId: member.body.user.id }).expect(201);
  const page = await api.get('/api/tasks').query({ q: 'api', status: 'TODO', limit: 1, page: 1 }).set('Authorization', memberAuth).expect(200);
  assert.equal(page.body.data[0].id, task.id);
  assert.equal(page.body.meta.total, 1);
  await api.patch(`/api/tasks/${task.id}`).set('Authorization', memberAuth).send({ status: 'DONE' }).expect(200);
  await api.delete(`/api/tasks/${task.id}`).set('Authorization', memberAuth).expect(403);
  await api.post('/api/comments').set('Authorization', memberAuth).send({ taskId: task.id, body: 'Готово' }).expect(201);
  const files = await api.post('/api/files').set('Authorization', memberAuth).field('taskId', task.id)
    .attach('files', Buffer.from('sample'), { filename: 'notes.txt', contentType: 'text/plain' }).expect(201);
  const file = files.body.data[0];
  assert.equal(file.content, undefined);
  assert.equal((await api.get(file.url).set('Authorization', ownerAuth).expect(200)).text, 'sample');
  await api.patch(file.url).set('Authorization', memberAuth).attach('file', Buffer.from('next'), { filename: 'next.txt', contentType: 'text/plain' }).expect(200);
  assert.equal((await api.get(file.url).set('Authorization', ownerAuth).expect(200)).text, 'next');
  await api.post('/api/files').set('Authorization', memberAuth).field('taskId', task.id)
    .attach('files', Buffer.from('not png'), { filename: 'image.png', contentType: 'image/png' }).expect(415);
  await api.delete(`/api/attachments/${file.id}`).set('Authorization', memberAuth).expect(204);
  await api.get(file.url).set('Authorization', ownerAuth).expect(404);
  await api.delete(`/api/projects/${project.id}/members/${member.body.user.id}`).set('Authorization', ownerAuth).expect(204);
  await api.get(`/api/tasks/${task.id}`).set('Authorization', memberAuth).expect(404);
});
