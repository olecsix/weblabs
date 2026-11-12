import { z } from 'zod';
import { HttpError } from './errors.js';

export const uuid = z.uuid();
const text = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => text(max).nullable().optional();
const dateTime = z.iso.datetime({ offset: true }).nullable().optional();
export const statuses = ['TODO', 'IN_PROGRESS', 'DONE'];
export const priorities = ['LOW', 'MEDIUM', 'HIGH'];
export const roles = ['MEMBER', 'MANAGER'];
export const pagination = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
};

const definitions = {
  users: {
    model: 'user', name: 'User',
    fields: { name: text(100), email: z.email().max(254).trim().toLowerCase() },
    filters: {},
  },
  projects: {
    model: 'project', name: 'Project',
    fields: { name: text(150), description: optionalText(2000), ownerId: uuid },
    filters: { ownerId: uuid.optional() },
  },
  tasks: {
    model: 'task', name: 'Task',
    fields: {
      title: text(200), description: optionalText(5000), projectId: uuid,
      assigneeId: uuid.nullable().optional(), status: z.enum(statuses).optional(),
      priority: z.enum(priorities).optional(), dueDate: dateTime,
    },
    filters: { projectId: uuid.optional(), assigneeId: uuid.optional(), status: z.enum(statuses).optional() },
  },
  comments: {
    model: 'comment', name: 'Comment',
    fields: { body: text(3000), taskId: uuid, authorId: uuid },
    filters: { taskId: uuid.optional(), authorId: uuid.optional() },
  },
  attachments: {
    model: 'attachment', name: 'Attachment',
    fields: {
      fileName: text(255), mimeType: text(100).regex(/^[\w.+-]+\/[\w.+-]+$/),
      size: z.number().int().min(1).max(10485760),
      url: z.url({ protocol: /^https?$/ }).max(2048), taskId: uuid, uploadedById: uuid,
    },
    filters: { taskId: uuid.optional(), uploadedById: uuid.optional() },
  },
};

export const resources = Object.fromEntries(Object.entries(definitions).map(([path, definition]) => {
  const create = z.strictObject(definition.fields);
  return [path, {
    ...definition, create,
    patch: create.partial().refine((data) => Object.keys(data).length > 0, { message: 'Передайте хоча б одне поле' }),
    query: z.strictObject({ ...pagination, ...definition.filters,
      q: z.string().trim().max(100).optional(),
      sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
    }),
  }];
}));

export const memberCreate = z.strictObject({ userId: uuid, role: z.enum(roles).optional() });
export const memberPatch = z.strictObject({ role: z.enum(roles) });
export const memberQuery = z.strictObject(pagination);

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Перевірте вхідні дані',
      result.error.issues.map(({ path, message }) => ({ path: path.join('.'), message })));
  }
  return result.data;
}

export const idParams = z.strictObject({ id: uuid });
export const projectParams = z.strictObject({ projectId: uuid });
export const memberParams = z.strictObject({ projectId: uuid, userId: uuid });
