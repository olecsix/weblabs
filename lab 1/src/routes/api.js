import { Router } from 'express';
import { resources } from '../utils/validation.js';
import { resourceModel } from '../models/resource.js';
import { memberModel } from '../models/member.js';
import { resourceController } from '../controllers/resourceController.js';
import { memberController } from '../controllers/memberController.js';

export function apiRoutes(prisma) {
  const api = Router();
  const members = memberController(memberModel(prisma));
  api.route('/projects/:projectId/members').get(members.list).post(members.create);
  api.route('/projects/:projectId/members/:userId').get(members.get).patch(members.update).delete(members.remove);
  for (const [path, schemas] of Object.entries(resources)) {
    const router = Router();
    const controller = resourceController(resourceModel(prisma, schemas.model), schemas);
    router.route('/').get(controller.list).post(controller.create);
    router.route('/:id').get(controller.get).patch(controller.update).delete(controller.remove);
    api.use(`/${path}`, router);
  }
  return api;
}
