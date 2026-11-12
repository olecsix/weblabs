import { randomUUID } from 'node:crypto';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { apiRoutes } from './routes/resources.js';
import { authRoutes } from './routes/auth.js';
import { fileRoutes } from './routes/files.js';
import { openApi } from './utils/openapi.js';
import { tokenService, requireSession } from './utils/security.js';
import { HttpError, errorHandler } from './utils/errors.js';

export function createApp({ prisma, config, onChange = () => {}, onSessionEnd = () => {}, installRoutes = () => {} }) {
  const app = express();
  const tokens = tokenService(config);
  const session = requireSession(prisma, tokens);
  const openapi = openApi();
  app.set('trust proxy', config.TRUST_PROXY || false);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(helmet({ contentSecurityPolicy: {
    directives: { 'script-src': ["'self'", "'unsafe-inline'"], 'upgrade-insecure-requests': null },
  } }));
  app.use(cors({ origin: new URL(config.FRONTEND_URL).origin }));
  app.use((req, res, next) => {
    const noBody = req.path === '/api/auth/logout';
    const multipart = /^\/api\/files(?:\/|$)/.test(req.path) && req.is('multipart/form-data');
    if (!noBody && !multipart && ['POST', 'PATCH', 'PUT'].includes(req.method) && !req.is('application/json')) {
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
  app.use('/api/auth', authRoutes(prisma, tokens, session, onSessionEnd));
  app.use('/api', session, (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (['POST', 'PATCH', 'DELETE'].includes(req.method) && config.NODE_ENV !== 'test') {
      res.once('finish', () => console.info(JSON.stringify({ event: 'mutation', requestId: req.id,
        actorId: req.user.id, method: req.method, route: req.route?.path, status: res.statusCode })));
    }
    next();
  });
  installRoutes({ app, session, openapi });
  app.use('/api/files', fileRoutes(prisma, config, onChange));
  app.use('/api', apiRoutes(prisma, onChange));
  app.use((req, res, next) => next(new HttpError(404, 'NOT_FOUND', 'Маршрут не знайдено')));
  app.use(errorHandler);
  return app;
}
