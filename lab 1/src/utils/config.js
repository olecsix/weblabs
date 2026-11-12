import 'dotenv/config';
import { z } from 'zod';

const environment = z.object({
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().min(1).default('127.0.0.1'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
});

export function loadConfig() {
  const result = environment.safeParse(process.env);
  if (!result.success) {
    // Не виводимо значення DATABASE_URL або пароль у повідомленнях.
    throw new Error(`Помилка конфігурації: ${result.error.issues.map((i) => i.path.join('.')).join(', ')}`);
  }
  return result.data;
}
