import { Router } from 'express';
import { z } from 'zod';
import { idParams, memberCreate, memberParams, memberPatch, memberQuery, parse, projectParams, resources } from '../utils/validation.js';
import { assertAssignee, ensureAllowed, missing, projectAccess, visibility } from '../utils/access.js';
import { publicUser, requireAdmin } from '../utils/security.js';

export const attachmentFields = { id: true, fileName: true, mimeType: true, size: true, url: true,
  taskId: true, uploadedById: true, createdAt: true, updatedAt: true };
const definitions = {
  users: { search: ['name', 'email'], select: publicUser },
  projects: { search: ['name', 'description'], derived: 'ownerId' },
  tasks: { search: ['title', 'description'], parent: 'projectId' },
  comments: { search: ['body'], derived: 'authorId', parent: 'taskId' },
  attachments: { search: ['fileName'], derived: 'uploadedById', parent: 'taskId', select: attachmentFields },
};

export function resourceSchemas(key) {
  const { derived, parent } = definitions[key];
  const { fields, query } = resources[key];
  const create = z.strictObject(Object.fromEntries(Object.entries(fields).filter(([name]) => name !== derived)));
  const patch = z.strictObject(Object.fromEntries(Object.entries(create.partial().shape).filter(([name]) => name !== parent)))
    .refine((data) => Object.keys(data).length > 0, { message: 'Передайте хоча б одне поле' });
  return { create, patch, query };
}

export async function recipients(db, projectId) {
  if (!projectId) return [];
  const project = await db.project.findUnique({ where: { id: projectId }, select: { ownerId: true, members: { select: { userId: true } } } });
  return project ? [...new Set([project.ownerId, ...project.members.map(({ userId }) => userId)])] : [];
}

const readTx = { isolationLevel: 'RepeatableRead' };
export const writeTx = { isolationLevel: 'Serializable' };
const pageOf = (data, total, page, limit) => ({ data, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } });

export async function taskProject(db, taskId) {
  const task = await db.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
  if (!task) throw missing();
  return task.projectId;
}

async function projectForRecord(db, key, record) {
  if (key === 'users') return null;
  if (key === 'projects') return record.id ?? null;
  return key === 'tasks' ? record.projectId : taskProject(db, record.taskId);
}

async function authorizeChange(db, key, record, actor, action, data) {
  const projectId = await projectForRecord(db, key, record);
  if (!projectId) return null;
  const access = await projectAccess(db, projectId, actor);
  if (key === 'tasks') {
    if (action === 'delete') ensureAllowed(access.manage);
    await assertAssignee(db, projectId, data?.assigneeId);
  }
  if (key === 'projects') ensureAllowed(action === 'delete' ? access.owner : access.manage);
  if (action !== 'create' && ['comments', 'attachments'].includes(key)) {
    ensureAllowed(access.manage || record[definitions[key].derived] === actor.id);
  }
  if (action === 'update' && key === 'attachments' && record.url.startsWith('/api/files/')) {
    ensureAllowed(Object.keys(data).every((field) => field === 'fileName'));
  }
  return projectId;
}

function publish(onChange, resource, action, id, projectId, audience, actor, assigneeId) {
  onChange({ resource, action, id, projectId, audience: [...new Set([actor.id, ...audience])], actorId: actor.id, assigneeId });
}

export function apiRoutes(prisma, onChange) {
  const api = Router();
  for (const [key, entry] of Object.entries(resources)) {
    const router = Router();
    const schema = resourceSchemas(key);
    const { search, select, derived } = definitions[key];
    if (key === 'users') router.use(requireAdmin);
    router.get('/', async (req, res) => {
      const { page, limit, q, sort, ...filters } = parse(schema.query, req.query);
      const where = { AND: [visibility(key, req.user), filters,
        q ? { OR: search.map((field) => ({ [field]: { contains: q, mode: 'insensitive' } })) } : {}] };
      const order = sort === 'oldest' ? 'asc' : 'desc';
      const orderBy = sort === 'name' ? [{ [search[0]]: 'asc' }, { id: 'asc' }]
        : [{ createdAt: order }, { id: order }];
      const model = prisma[entry.model];
      const [data, total] = await prisma.$transaction([
        model.findMany({ where, orderBy, skip: (page - 1) * limit, take: limit, select }), model.count({ where }),
      ], readTx);
      res.json(pageOf(data, total, page, limit));
    });
    router.post('/', async (req, res) => {
      const input = parse(schema.create, req.body);
      if (derived) input[derived] = req.user.id;
      const { data, projectId, audience } = await prisma.$transaction(async (db) => {
        const authorizedProject = await authorizeChange(db, key, input, req.user, 'create', input);
        const data = await db[entry.model].create({ data: input, select });
        const projectId = key === 'projects' ? data.id : authorizedProject;
        return { data, projectId, audience: await recipients(db, projectId) };
      }, writeTx);
      publish(onChange, key, 'create', data.id, projectId, audience, req.user, data.assigneeId);
      res.location(`${req.baseUrl}/${data.id}`).status(201).json({ data });
    });
    router.get('/:id', async (req, res) => {
      const { id } = parse(idParams, req.params);
      const data = await prisma[entry.model].findFirst({ where: { AND: [{ id }, visibility(key, req.user)] }, select });
      if (!data) throw missing();
      res.json({ data });
    });
    for (const [method, action] of [['patch', 'update'], ['delete', 'delete']]) {
      router[method]('/:id', async (req, res) => {
        const { id } = parse(idParams, req.params);
        const input = action === 'update' ? parse(schema.patch, req.body) : undefined;
        const { data, projectId, audience } = await prisma.$transaction(async (db) => {
          const model = db[entry.model];
          const record = await model.findFirst({ where: { AND: [{ id }, visibility(key, req.user)] }, select });
          if (!record) throw missing();
          const projectId = await authorizeChange(db, key, record, req.user, action, input);
          const audience = await recipients(db, projectId);
          const data = action === 'update' ? await model.update({ where: { id }, data: input, select })
            : await model.delete({ where: { id }, select });
          return { data, projectId, audience };
        }, writeTx);
        publish(onChange, key, action, id, projectId, audience, req.user, data.assigneeId);
        if (action === 'delete') return res.status(204).end();
        res.json({ data });
      });
    }
    api.use(`/${key}`, router);
  }

  const path = '/projects/:projectId/members';
  api.get(path, async (req, res) => {
    const { projectId } = parse(projectParams, req.params);
    const { page, limit } = parse(memberQuery, req.query);
    const result = await prisma.$transaction(async (db) => {
      await projectAccess(db, projectId, req.user);
      const where = { projectId };
      const data = await db.projectMember.findMany({ where, include: { user: { select: { id: true, name: true } } },
        skip: (page - 1) * limit, take: limit, orderBy: { userId: 'asc' } });
      return pageOf(data, await db.projectMember.count({ where }), page, limit);
    }, readTx);
    res.json(result);
  });
  api.get(`${path}/:userId`, async (req, res) => {
    const key = parse(memberParams, req.params);
    const data = await prisma.$transaction(async (db) => {
      await projectAccess(db, key.projectId, req.user);
      return db.projectMember.findUniqueOrThrow({ where: { projectId_userId: key } });
    }, readTx);
    res.json({ data });
  });
  for (const [method, action] of [['post', 'create'], ['patch', 'update'], ['delete', 'delete']]) {
    api[method](action === 'create' ? path : `${path}/:userId`, async (req, res) => {
      const key = action === 'create' ? { ...parse(projectParams, req.params), ...parse(memberCreate, req.body) }
        : parse(memberParams, req.params);
      const input = action === 'update' ? parse(memberPatch, req.body) : undefined;
      const { data, audience } = await prisma.$transaction(async (db) => {
        ensureAllowed((await projectAccess(db, key.projectId, req.user)).owner);
        const where = { projectId_userId: { projectId: key.projectId, userId: key.userId } };
        const before = await recipients(db, key.projectId);
        const data = action === 'create' ? await db.projectMember.create({ data: key })
          : action === 'update' ? await db.projectMember.update({ where, data: input }) : await db.projectMember.delete({ where });
        if (action === 'delete') {
          const project = await db.project.findUniqueOrThrow({ where: { id: key.projectId }, select: { ownerId: true } });
          if (project.ownerId !== key.userId) await db.task.updateMany({ where: { projectId: key.projectId, assigneeId: key.userId }, data: { assigneeId: null } });
        }
        return { data, audience: [...before, key.userId] };
      }, writeTx);
      publish(onChange, 'members', action, key.userId, key.projectId, audience, req.user);
      if (action === 'delete') return res.status(204).end();
      if (action === 'create') res.location(`${req.baseUrl}/projects/${key.projectId}/members/${key.userId}`).status(201);
      res.json({ data });
    });
  }
  return api;
}
