import { loadConfig } from '../src/utils/config.js';
import { createPrisma } from '../src/utils/prisma.js';

const prisma = createPrisma(loadConfig().DATABASE_URL);
try {
  const data = await prisma.$transaction(async (tx) => {
    const owner = await tx.user.upsert({ where: { email: 'olena@example.com' }, update: {},
      create: { name: 'Олена Коваль', email: 'olena@example.com' } });
    const member = await tx.user.upsert({ where: { email: 'andrii@example.com' }, update: {},
      create: { name: 'Андрій Мельник', email: 'andrii@example.com' } });
    const project = await tx.project.upsert({ where: { id: '10000000-0000-4000-8000-000000000001' }, update: {},
      create: { id: '10000000-0000-4000-8000-000000000001', name: 'Навчальний вебзастосунок',
        description: 'Розроблення backend у межах лабораторної роботи 1', ownerId: owner.id } });
    for (const [userId, role] of [[owner.id, 'MANAGER'], [member.id, 'MEMBER']]) {
      await tx.projectMember.upsert({ where: { projectId_userId: { projectId: project.id, userId } }, update: {},
        create: { projectId: project.id, userId, role } });
    }
    const task = await tx.task.upsert({ where: { id: '20000000-0000-4000-8000-000000000001' }, update: {},
      create: { id: '20000000-0000-4000-8000-000000000001', title: 'Реалізувати REST API',
        status: 'IN_PROGRESS', priority: 'HIGH', projectId: project.id, assigneeId: member.id } });
    await tx.comment.upsert({ where: { id: '30000000-0000-4000-8000-000000000001' }, update: {},
      create: { id: '30000000-0000-4000-8000-000000000001', body: 'Додай валідацію та документацію API.',
        taskId: task.id, authorId: owner.id } });
    await tx.attachment.upsert({ where: { id: '40000000-0000-4000-8000-000000000001' }, update: {},
      create: { id: '40000000-0000-4000-8000-000000000001', fileName: 'requirements.txt', mimeType: 'text/plain',
        size: 128, url: 'https://example.com/requirements.txt', taskId: task.id, uploadedById: owner.id } });
    return { ownerId: owner.id, memberId: member.id, projectId: project.id, taskId: task.id };
  });
  console.log('Демонстраційні дані готові (URL вкладення — навчальний приклад):');
  console.log(JSON.stringify(data, null, 2));
} finally {
  await prisma.$disconnect();
}
