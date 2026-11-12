import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import { Queue, Worker } from 'bullmq';
import { tokenService } from './utils/security.js';
import { projectAccess } from './utils/access.js';
import { recipients } from './routes/resources.js';
import { uuid } from './utils/validation.js';

const userRoom = (id) => `user:${id}`;
const sessionRoom = (id) => `session:${id}`;
const labels = { tasks: 'Завдання', projects: 'Проєкт', comments: 'Коментар', attachments: 'Вкладення', members: 'Учасник' };
const actionLabels = { create: 'додано', update: 'оновлено', delete: 'видалено', reorder: 'впорядковано' };

function queueConnection(url) {
  const parsed = new URL(url);
  return { host: parsed.hostname, port: Number(parsed.port || 6379),
    username: decodeURIComponent(parsed.username) || undefined, password: decodeURIComponent(parsed.password) || undefined,
    db: Number(parsed.pathname.slice(1) || 0), tls: parsed.protocol === 'rediss:' ? {} : undefined };
}

export async function createRealtime(server, { prisma, config }) {
  const origin = new URL(config.FRONTEND_URL).origin;
  const io = new Server(server, { cors: { origin }, maxHttpBufferSize: 16 * 1024,
    // WebSocket-only keeps connections on one instance without sticky polling sessions.
    transports: ['websocket'], allowRequest: (req, done) => done(null, !req.headers.origin || req.headers.origin === origin) });
  const token = tokenService(config);
  const metrics = { connections: 0, published: 0, notifications: 0, rateLimited: 0, requests: 0 };
  let pub, sub, queue, worker;
  if (config.REDIS_URL) {
    pub = createClient({ url: config.REDIS_URL });
    sub = pub.duplicate();
    for (const client of [pub, sub]) client.on('error', (e) => console.error('Redis:', e.name));
    await Promise.all([pub.connect(), sub.connect()]);
    io.adapter(createAdapter(pub, sub));
    const connection = queueConnection(config.REDIS_URL);
    queue = new Queue('task-manager-maintenance', { connection });
    worker = new Worker('task-manager-maintenance', () => prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } }), { connection });
    worker.on('error', (e) => console.error('Maintenance:', e.name));
    await queue.upsertJobScheduler('expired-sessions', { every: 24 * 60 * 60 * 1000 },
      { name: 'delete-expired-sessions', opts: { removeOnComplete: 10, removeOnFail: 10, attempts: 3 } });
  }
  io.use(async (socket, next) => {
    try {
      const raw = socket.handshake.auth.token;
      if (typeof raw !== 'string' || raw.length > 2048) return next(new Error('UNAUTHORIZED'));
      socket.data.session = await token.authenticate(prisma, raw);
      next();
    } catch { next(new Error('UNAUTHORIZED')); }
  });

  io.on('connection', async (socket) => {
    const { user, sid, expiresAt } = socket.data.session;
    const expiry = setTimeout(() => { socket.emit('session:expired'); socket.disconnect(true); }, Math.max(0, expiresAt - Date.now()));
    let windowStart = Date.now(), count = 0;
    metrics.connections++;
    socket.on('disconnect', () => {
      clearTimeout(expiry);
      metrics.connections--;
      io.emit('presence:changed');
    });
    await socket.join([userRoom(user.id), sessionRoom(sid)]);
    if (!socket.connected) return;
    io.emit('presence:changed');
    socket.use(async (_packet, next) => {
      if (Date.now() - windowStart >= 10_000) { windowStart = Date.now(); count = 0; }
      if (++count > 30) {
        metrics.rateLimited++;
        socket.disconnect(true);
        return;
      }
      try { socket.data.session = await token.authenticate(prisma, socket.handshake.auth.token); next(); }
      catch { socket.disconnect(true); }
    });
    socket.on('presence:project', async (projectId, reply) => {
      if (typeof reply !== 'function') return;
      if (!uuid.safeParse(projectId).success) return reply({ error: 'INVALID_ID' });
      try {
        await projectAccess(prisma, projectId, socket.data.session.user);
        const members = await recipients(prisma, projectId);
        const connected = await io.in(members.map(userRoom)).fetchSockets();
        reply({ onlineIds: [...new Set(connected.map((client) => client.data.session.user.id))] });
      } catch { reply({ error: 'NOT_FOUND' }); }
    });
    socket.on('error', () => socket.disconnect(true));
  });

  async function publish({ audience, actorId, assigneeId, ...event }) {
    if (pub && event.projectId && event.resource === 'tasks') await pub.del(`lab:stats:${event.projectId}`).catch(() => {});
    const rooms = audience.map(userRoom);
    if (!rooms.length) return;
    io.to(rooms).emit('resource:changed', event);
    metrics.published++;
    if (!event.projectId || !labels[event.resource]) return;
    const data = audience.filter((id) => id !== actorId).map((userId) => ({
      userId, type: event.resource, priority: userId === assigneeId && event.action !== 'delete' ? 'HIGH' : 'NORMAL',
      title: labels[event.resource], message: `Запис ${actionLabels[event.action] ?? 'змінено'}.`,
    }));
    if (!data.length) return;
    const notifications = await prisma.notification.createManyAndReturn({ data });
    for (const item of notifications) io.to(userRoom(item.userId)).emit('notification', item);
    metrics.notifications += notifications.length;
  }

  return {
    io, metrics, cache: pub,
    onChange(event) { void publish(event).catch((e) => console.error('Realtime event:', e.name)); },
    onSessionEnd({ sid, userId }) { io.in(sid ? sessionRoom(sid) : userRoom(userId)).disconnectSockets(true); },
    async close() {
      await io.close();
      await worker?.close();
      await queue?.close();
      if (sub?.isOpen) await sub.quit();
      if (pub?.isOpen) await pub.quit();
    },
  };
}
