import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { apiRoutes } from './routes/api.js';
import { HttpError, errorHandler } from './utils/errors.js';

const openapi = JSON.parse(readFileSync(new URL('../docs/openapi.json', import.meta.url), 'utf8'));

export function createApp({ prisma }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(helmet({ contentSecurityPolicy: {
    directives: { 'script-src': ["'self'", "'unsafe-inline'"], 'upgrade-insecure-requests': null },
  } }));
  app.use((req, res, next) => {
    if (['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json')) {
      throw new HttpError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Використайте Content-Type: application/json');
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  app.get('/health', async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      throw new HttpError(503, 'DATABASE_UNAVAILABLE', 'База даних недоступна');
    }
  });
  app.get('/openapi.json', (req, res) => res.json(openapi));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi, { customSiteTitle: 'Task Manager — API' }));
  app.get('/', (req, res) => res.redirect('/docs/'));
  app.use('/api', apiRoutes(prisma));
  app.use((req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'Маршрут не знайдено')));
  app.use(errorHandler);
  return app;
}
