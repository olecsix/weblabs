import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import request from 'supertest';
import { fixture } from './fixture.js';
import { createRuntime } from '../src/runtime.js';

let env, runtime, api, base;
const sockets = [];
before(async () => {
  env = await fixture();
  runtime = await createRuntime(env);
  runtime.server.listen(0, '127.0.0.1');
  await once(runtime.server, 'listening');
  base = `http://127.0.0.1:${runtime.server.address().port}`;
  api = request(base);
}, { timeout: 120_000 });
after(async () => {
  for (const socket of sockets) socket.disconnect();
  await runtime?.close();
  await env?.close();
});

function socket(token) {
  const client = io(base, { auth: { token }, transports: ['websocket'], reconnection: false, timeout: 3000, autoConnect: false });
  sockets.push(client);
  return client;
}
async function account(email) {
  const { body } = await api.post('/api/auth/register').send({ name: 'Користувач', email, password: 'Test-password-2026' }).expect(201);
  return { ...body.user, token: body.tokens.accessToken, header: `Bearer ${body.tokens.accessToken}` };
}
function event(client, name) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.off(name, received); reject(new Error(`Немає події ${name}`)); }, 3500);
    function received(payload) { clearTimeout(timer); resolve(payload); }
    client.once(name, received);
  });
}
async function connect(user) {
  const client = socket(user.token);
  const connected = event(client, 'connect');
  client.connect();
  await connected;
  return client;
}

test('WebSocket відхиляє підключення без JWT', async () => {
  const client = socket('invalid');
  const failure = event(client, 'connect_error');
  client.connect();
  assert.equal((await failure).message, 'UNAUTHORIZED');
});

test('кімнати ізолюють проєкти, сповіщення доступні після перепідключення, logout закриває сокет', async () => {
  const owner = await account('owner@socket.test');
  const member = await account('member@socket.test');
  const outsider = await account('outsider@socket.test');
  const project = (await api.post('/api/projects').set('Authorization', owner.header).send({ name: 'Команда' }).expect(201)).body.data;
  await api.post(`/api/projects/${project.id}/members`).set('Authorization', owner.header).send({ userId: member.id }).expect(201);
  const [ownerSocket, memberSocket, outsiderSocket] = await Promise.all([connect(owner), connect(member), connect(outsider)]);
  const online = await ownerSocket.timeout(2000).emitWithAck('presence:project', project.id);
  assert.deepEqual(new Set(online.onlineIds), new Set([owner.id, member.id]));
  assert.equal((await outsiderSocket.timeout(2000).emitWithAck('presence:project', project.id)).error, 'NOT_FOUND');
  let leaked = false;
  outsiderSocket.on('resource:changed', () => { leaked = true; });
  const changed = event(memberSocket, 'resource:changed');
  const notified = event(memberSocket, 'notification');
  const task = (await api.post('/api/tasks').set('Authorization', owner.header).send({ title: 'Перевірити події', projectId: project.id, assigneeId: member.id }).expect(201)).body.data;
  assert.equal((await changed).id, task.id);
  const notification = await notified;
  assert.equal(notification.priority, 'HIGH');
  assert.equal(notification.userId, member.id);
  assert.equal(leaked, false);
  memberSocket.disconnect();
  const comment = await api.post('/api/comments').set('Authorization', owner.header).send({ taskId: task.id, body: 'Перевірка офлайн' }).expect(201);
  assert.ok(comment.body.data.id);
  let inbox;
  for (let attempts = 0; attempts < 20; attempts++) {
    inbox = (await api.get('/api/notifications').set('Authorization', member.header).expect(200)).body;
    if (inbox.data.some((row) => row.type === 'comments')) break;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  assert.ok(inbox.data.some((row) => row.type === 'comments'));
  await api.patch(`/api/notifications/${notification.id}`).set('Authorization', outsider.header).send({}).expect(404);
  await api.patch(`/api/notifications/${notification.id}`).set('Authorization', member.header).send({}).expect(204);
  const newSocket = await connect(member);
  const disconnected = event(newSocket, 'disconnect');
  await api.post('/api/auth/logout').set('Authorization', member.header).expect(204);
  assert.equal(await disconnected, 'io server disconnect');
});

test('порядок зберігається в PostgreSQL, статистика відповідає статусам', async () => {
  const user = await account('order@socket.test');
  const projectId = (await api.post('/api/projects').set('Authorization', user.header).send({ name: 'Порядок' }).expect(201)).body.data.id;
  const first = (await api.post('/api/tasks').set('Authorization', user.header).send({ projectId, title: 'Перше' }).expect(201)).body.data.id;
  const second = (await api.post('/api/tasks').set('Authorization', user.header).send({ projectId, title: 'Друге', status: 'DONE' }).expect(201)).body.data.id;
  await api.patch(`/api/projects/${projectId}/task-order`).set('Authorization', user.header).send({ ids: [first] }).expect(409);
  await api.patch(`/api/projects/${projectId}/task-order`).set('Authorization', user.header).send({ ids: [second, first] }).expect(204);
  const ordered = (await api.get('/api/tasks').query({ projectId, sort: 'position' }).set('Authorization', user.header).expect(200)).body.data;
  assert.deepEqual(ordered.map(({ id }) => id), [second, first]);
  const stats = (await api.get(`/api/projects/${projectId}/stats`).set('Authorization', user.header).expect(200)).body.data;
  assert.deepEqual(stats, { TODO: 1, IN_PROGRESS: 0, DONE: 1 });
});
