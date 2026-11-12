import { z } from 'zod';
import { parse, pagination, projectParams, idParams, uuid } from '../utils/validation.js';
import { ensureAllowed, missing, projectAccess } from '../utils/access.js';
import { recipients, writeTx } from './resources.js';
import { requireAdmin } from '../utils/security.js';
import { HttpError } from '../utils/errors.js';

const reorder = z.strictObject({ ids: z.array(uuid).min(1).max(100).refine((ids) => ids.length === new Set(ids).size) });
const empty = z.strictObject({});

export function liveRoutes(prisma, realtime) {
  return ({ app, openapi }) => {
    app.use((req, res, next) => { realtime.metrics.requests++; next(); });
    app.get('/api/notifications', async (req, res) => {
      const { page, limit } = parse(z.strictObject(pagination), req.query);
      const where = { userId: req.user.id };
      const [data, total, unread] = await prisma.$transaction([
        prisma.notification.findMany({ where, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * limit, take: limit }),
        prisma.notification.count({ where }), prisma.notification.count({ where: { ...where, readAt: null } }),
      ], { isolationLevel: 'RepeatableRead' });
      res.json({ data, meta: { total, unread, page, limit, totalPages: Math.ceil(total / limit) } });
    });
    app.patch('/api/notifications/:id', async (req, res) => {
      const { id } = parse(idParams, req.params);
      parse(empty, req.body);
      const result = await prisma.notification.updateMany({ where: { id, userId: req.user.id }, data: { readAt: new Date() } });
      if (!result.count) throw missing();
      res.status(204).end();
    });
    app.get('/api/projects/:projectId/stats', async (req, res) => {
      const { projectId } = parse(projectParams, req.params);
      await projectAccess(prisma, projectId, req.user);
      const key = `lab:stats:${projectId}`;
      const cached = await realtime.cache?.get(key).catch(() => null);
      if (cached) return res.json({ data: JSON.parse(cached) });
      const rows = await prisma.task.groupBy({ by: ['status'], where: { projectId }, _count: { _all: true } });
      const data = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
      for (const row of rows) data[row.status] = row._count._all;
      await realtime.cache?.set(key, JSON.stringify(data), { EX: 30 }).catch(() => {});
      res.json({ data });
    });
    app.patch('/api/projects/:projectId/task-order', async (req, res) => {
      const { projectId } = parse(projectParams, req.params);
      const { ids } = parse(reorder, req.body);
      const audience = await prisma.$transaction(async (db) => {
        ensureAllowed((await projectAccess(db, projectId, req.user)).manage);
        const tasks = await db.task.findMany({ where: { projectId }, select: { id: true }, take: 101 });
        const actual = new Set(tasks.map((task) => task.id));
        if (actual.size !== ids.length || ids.some((id) => !actual.has(id))) {
          throw new HttpError(409, 'ORDER_MISMATCH', 'Оновіть список: потрібні всі завдання цього проєкту (до 100)');
        }
        await db.$executeRaw`
          UPDATE "Task" AS task
          SET position = items.ordinality::int - 1, "updatedAt" = CURRENT_TIMESTAMP
          FROM unnest(${ids}::uuid[]) WITH ORDINALITY AS items(id, ordinality)
          WHERE task.id = items.id AND task."projectId" = ${projectId}::uuid`;
        return recipients(db, projectId);
      }, writeTx);
      realtime.onChange({ audience: [...new Set([...audience, req.user.id])], actorId: req.user.id, id: projectId,
        projectId, resource: 'tasks', action: 'reorder' });
      res.status(204).end();
    });
    app.get('/api/metrics', requireAdmin, (req, res) => res.json({ data: realtime.metrics }));
    openapi.info.version = '3.0.0';
    const id = (name) => [{ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }];
    const op = (summary, code = 200) => ({ summary, tags: ['Realtime'], responses: { [code]: { description: 'Успішна відповідь' } } });
    const body = (schema) => ({ required: true, content: { 'application/json': { schema } } });
    Object.assign(openapi.paths, {
      '/api/notifications': { get: { ...op('Історія сповіщень'), parameters: ['page', 'limit'].map((name) => ({ name, in: 'query', schema: { type: 'integer' } })) } },
      '/api/notifications/{id}': { parameters: id('id'), patch: { ...op('Позначити прочитаним', 204), requestBody: body({ type: 'object', additionalProperties: false }) } },
      '/api/projects/{projectId}/stats': { parameters: id('projectId'), get: op('Підрахунок завдань за статусами') },
      '/api/projects/{projectId}/task-order': { parameters: id('projectId'), patch: {
        ...op('Змінити порядок завдань', 204), requestBody: body({ type: 'object', required: ['ids'], properties: { ids: { type: 'array', items: { type: 'string', format: 'uuid' } } } }),
      } },
      '/api/metrics': { get: op('Лічильники процесу, тільки ADMIN') },
    });
  };
}
