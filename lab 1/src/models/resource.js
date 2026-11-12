export function resourceModel(prisma, name) {
  const delegate = prisma[name];
  return {
    async list({ page, limit, ...where }) {
      const [data, total] = await prisma.$transaction([
        delegate.findMany({ where, skip: (page - 1) * limit, take: limit, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
        delegate.count({ where }),
      ], { isolationLevel: 'RepeatableRead' });
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    },
    get: (id) => delegate.findUniqueOrThrow({ where: { id } }),
    create: (data) => delegate.create({ data }),
    update: (id, data) => delegate.update({ where: { id }, data }),
    remove: (id) => delegate.delete({ where: { id } }),
  };
}
