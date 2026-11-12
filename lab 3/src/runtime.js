import { createServer } from 'node:http';
import { createApp } from './app.js';
import { createRealtime } from './realtime.js';
import { liveRoutes } from './routes/live.js';

export async function createRuntime(env) {
  let app;
  const server = createServer((req, res) => app(req, res));
  const realtime = await createRealtime(server, env);
  app = createApp({ ...env, onChange: realtime.onChange, onSessionEnd: realtime.onSessionEnd,
    installRoutes: liveRoutes(env.prisma, realtime) });
  return { server, app, close: realtime.close };
}
