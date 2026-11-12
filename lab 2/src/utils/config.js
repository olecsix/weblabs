import 'dotenv/config';
import { z } from 'zod';

const environment = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  JWT_SECRET: z.string().min(32),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  FRONTEND_URL: z.url({ protocol: /^https?$/ }).default('http://localhost:5173'),
  MAX_FILE_SIZE: z.coerce.number().int().min(1).max(5242880).default(5242880),
  TRUST_PROXY: z.coerce.number().int().min(0).max(4).default(0),
}).refine((config) => config.JWT_SECRET !== config.REFRESH_TOKEN_SECRET, { path: ['REFRESH_TOKEN_SECRET'], message: 'Секрети мають відрізнятися' });

export function loadConfig() {
  const result = environment.safeParse(process.env);
  if (!result.success) {
    // Не виводимо значення DATABASE_URL або пароль у повідомленнях.
    throw new Error(`Помилка конфігурації: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  return result.data;
}
