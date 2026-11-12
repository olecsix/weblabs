import { createRuntime } from './runtime.js';
import { loadConfig } from './utils/config.js';
import { createPrisma } from './utils/prisma.js';

let prisma, runtime;
try {
  const config = loadConfig();
  prisma = createPrisma(config.DATABASE_URL);
  await prisma.$connect();
  // Перевіряємо доступність БД до відкриття HTTP порту.
  await prisma.$queryRaw`SELECT 1`;
  runtime = await createRuntime({ prisma, config });
  const server = runtime.server.listen(config.PORT, config.HOST, () => {
    console.log(`API: http://${config.HOST}:${config.PORT}/docs/`);
  });
  server.on('error', async (error) => {
    console.error('Не вдалося відкрити HTTP порт:', error.code);
    await runtime.close();
    await prisma.$disconnect();
    process.exitCode = 1;
  });
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    const timer = setTimeout(() => process.exit(1), 10000).unref();
    try {
      await runtime.close();
      await prisma.$disconnect();
    } finally {
      clearTimeout(timer);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
} catch (error) {
  console.error('Помилка запуску:', error.code ?? (error.name === 'Error' ? error.message : error.name));
  await runtime?.close();
  await prisma?.$disconnect();
  process.exitCode = 1;
}
