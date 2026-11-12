import { mkdir, writeFile } from 'node:fs/promises';
import { fixture } from '../tests/fixture.js';

const env = await fixture();
const db = env.prisma;
try {
  const owner = await db.user.create({ data: { name: 'Benchmark', email: 'benchmark@example.test' } });
  const project = await db.project.create({ data: { name: 'Target', ownerId: owner.id } });
  // All rows and DDL live in the fresh, disposable fixture database.
  await db.$executeRaw`INSERT INTO "Project" (id, name, "ownerId", "updatedAt")
    SELECT gen_random_uuid(), 'Project ' || n, ${owner.id}::uuid, now() FROM generate_series(1, 199) n`;
  await db.$executeRaw`INSERT INTO "Task" (id, title, "projectId", "createdAt", "updatedAt", position)
    SELECT gen_random_uuid(), 'Task ' || n, project.id, now() - n * interval '1 second', now(), n
    FROM "Project" project CROSS JOIN generate_series(1, 100) n`;
  await db.$executeRaw`ANALYZE "Task"`;
  async function explain() {
    const [row] = await db.$queryRaw`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
      SELECT id, title, status FROM "Task" WHERE "projectId" = ${project.id}::uuid ORDER BY "createdAt" DESC, id DESC LIMIT 20`;
    const [detail] = row['QUERY PLAN'];
    const collect = (plan) => [{ node: plan['Node Type'], index: plan['Index Name'], rows: plan['Actual Rows'],
      sharedHits: plan['Shared Hit Blocks'] }, ...(plan.Plans ?? []).flatMap(collect)];
    return { executionMs: detail['Execution Time'], plan: collect(detail.Plan) };
  }
  const after = await explain();
  await db.$executeRaw`DROP INDEX "Task_projectId_createdAt_id_idx"`;
  const before = await explain();
  const report = { dataset: { projects: 200, tasks: 20000, tasksPerProject: 100 }, query: '20 latest tasks for one project', before, after };
  await mkdir(new URL('../reports/', import.meta.url), { recursive: true });
  await writeFile(new URL('../reports/query-plan.json', import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally { await env.close(); }
