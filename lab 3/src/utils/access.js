import { HttpError } from './errors.js';
import { forbidden } from './security.js';

export const missing = () => new HttpError(404, 'NOT_FOUND', 'Запис не знайдено');

export function visibleProjects(actor) {
  return actor.role === 'ADMIN' ? {} : { OR: [{ ownerId: actor.id }, { members: { some: { userId: actor.id } } }] };
}

export function visibility(resource, actor) {
  const project = visibleProjects(actor);
  if (resource === 'projects') return project;
  if (resource === 'tasks') return { project };
  if (resource === 'comments' || resource === 'attachments') return { task: { project } };
  return {};
}

export async function projectAccess(db, id, actor) {
  const project = await db.project.findFirst({ where: { AND: [{ id }, visibleProjects(actor)] }, select: {
    id: true, ownerId: true, members: { where: { userId: actor.id }, select: { role: true } },
  } });
  if (!project) throw missing();
  const owner = actor.role === 'ADMIN' || project.ownerId === actor.id;
  return { owner, manage: owner || project.members[0]?.role === 'MANAGER' };
}

export async function assertAssignee(db, projectId, userId) {
  if (!userId) return;
  const visible = await db.project.count({ where: { id: projectId, OR: [{ ownerId: userId }, { members: { some: { userId } } }] } });
  if (!visible) throw new HttpError(400, 'INVALID_ASSIGNEE', 'Виконавець має належати до проєкту');
}

export function ensureAllowed(allowed) {
  if (!allowed) throw forbidden();
}
