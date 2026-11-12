export function memberModel(prisma) {
  const key = (projectId, userId) => ({ projectId_userId: { projectId, userId } });
  return {
    async list(projectId, { page, limit }) {
      const [data, total] = await prisma.$transaction(async (tx) => {
        await tx.project.findUniqueOrThrow({ where: { id: projectId } });
        return Promise.all([
          tx.projectMember.findMany({ where: { projectId }, skip: (page - 1) * limit, take: limit,
            orderBy: [{ createdAt: 'desc' }, { userId: 'desc' }] }),
          tx.projectMember.count({ where: { projectId } }),
        ]);
      }, { isolationLevel: 'RepeatableRead' });
      return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    },
    get: (projectId, userId) => prisma.projectMember.findUniqueOrThrow({ where: key(projectId, userId) }),
    create: (projectId, data) => prisma.projectMember.create({ data: { ...data, projectId } }),
    update: (projectId, userId, data) => prisma.projectMember.update({ where: key(projectId, userId), data }),
    remove: (projectId, userId) => prisma.projectMember.delete({ where: key(projectId, userId) }),
  };
}
