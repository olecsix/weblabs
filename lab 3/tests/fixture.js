import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import EmbeddedPostgres from 'embedded-postgres';
import { createPrisma } from '../src/utils/prisma.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const exec = promisify(execFile);

export async function fixture() {
  const base = path.resolve(root, '.test-data');
  await mkdir(base, { recursive: true });
  const dir = await mkdtemp(path.join(base, 'pg-'));
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  const password = randomUUID();
  const databaseUrl = `postgresql://lab_test:${password}@127.0.0.1:${port}/postgres`;
  const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'lab_test', password, port, persistent: true,
    postgresFlags: ['-h', '127.0.0.1'], initdbFlags: ['--encoding=UTF8', '--locale=C'], onLog: () => {} });
  let prisma;
  async function close() {
    await prisma?.$disconnect();
    if (process.platform === 'win32' && pg.process?.exitCode === null) {
      const { pg_ctl } = await import('@embedded-postgres/windows-x64');
      await exec(pg_ctl, ['-D', dir, '-m', 'fast', '-w', '-t', '10', 'stop'], { timeout: 15_000 });
      pg.process = undefined;
    } else if (pg.process?.exitCode === null) {
      await pg.stop();
    }
    if (path.resolve(dir).startsWith(base + path.sep)) await rm(dir, { recursive: true, force: true });
  }
  try {
    await pg.initialise();
    await pg.start();
    await exec(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'deploy'], {
      cwd: root, env: { ...process.env, DATABASE_URL: databaseUrl }, timeout: 60_000,
    });
    prisma = createPrisma(databaseUrl);
    await prisma.$queryRaw`SELECT 1`;
    return { prisma, close, config: { NODE_ENV: 'test', DATABASE_URL: databaseUrl,
      FRONTEND_URL: 'http://localhost:5173', JWT_SECRET: randomUUID(), REFRESH_TOKEN_SECRET: randomUUID(), MAX_FILE_SIZE: 5242880 } };
  } catch (error) {
    await close();
    throw error;
  }
}
