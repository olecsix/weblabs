import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'node prisma/seed.js' },
  // Generate/validate працюють і до створення .env. Сервер перевіряє URL окремо.
  datasource: {
    url: process.env.DATABASE_URL ?? 'postgresql://lab:lab_local_password@localhost:5432/task_manager',
  },
});
