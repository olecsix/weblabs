import { parse, idParams } from '../utils/validation.js';

export function resourceController(model, schemas) {
  return {
    list: async (req, res) => res.json(await model.list(parse(schemas.query, req.query))),
    get: async (req, res) => res.json({ data: await model.get(parse(idParams, req.params).id) }),
    create: async (req, res) => {
      const data = await model.create(parse(schemas.create, req.body));
      res.location(`${req.baseUrl}/${data.id}`).status(201).json({ data });
    },
    update: async (req, res) => {
      const { id } = parse(idParams, req.params);
      res.json({ data: await model.update(id, parse(schemas.patch, req.body)) });
    },
    remove: async (req, res) => {
      await model.remove(parse(idParams, req.params).id);
      res.status(204).end();
    },
  };
}
