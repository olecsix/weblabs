import { parse, projectParams, memberParams, memberCreate, memberPatch, memberQuery } from '../utils/validation.js';

export function memberController(model) {
  return {
    list: async (req, res) => {
      const { projectId } = parse(projectParams, req.params);
      res.json(await model.list(projectId, parse(memberQuery, req.query)));
    },
    get: async (req, res) => {
      const { projectId, userId } = parse(memberParams, req.params);
      res.json({ data: await model.get(projectId, userId) });
    },
    create: async (req, res) => {
      const { projectId } = parse(projectParams, req.params);
      const data = await model.create(projectId, parse(memberCreate, req.body));
      res.location(`/api/projects/${projectId}/members/${data.userId}`).status(201).json({ data });
    },
    update: async (req, res) => {
      const { projectId, userId } = parse(memberParams, req.params);
      res.json({ data: await model.update(projectId, userId, parse(memberPatch, req.body)) });
    },
    remove: async (req, res) => {
      const { projectId, userId } = parse(memberParams, req.params);
      await model.remove(projectId, userId);
      res.status(204).end();
    },
  };
}
