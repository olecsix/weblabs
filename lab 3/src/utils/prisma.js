import { PrismaClient } from '../../generated/prisma/index.js';
import { PrismaPg } from '@prisma/adapter-pg';

export function createPrisma(databaseUrl) {
  const schema = new URL(databaseUrl).searchParams.get('schema') ?? 'public';
  const adapter = new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000, max: 10 }, { schema });
  return new PrismaClient({ adapter });
}
