import { once } from 'node:events';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const backend = path.resolve(root, process.env.LAB_BACKEND_DIR || '../lab 3');
const moduleAt = (file) => import(pathToFileURL(path.join(backend, file)));
const { fixture } = await moduleAt('tests/fixture.js');
const { createRuntime } = await moduleAt('src/runtime.js');
const env = await fixture();
let runtime, web;
try {
  const webPort = 5179;
  env.config.FRONTEND_URL = `http://127.0.0.1:${webPort}`;
  runtime = await createRuntime(env);
  runtime.server.listen(0, '127.0.0.1');
  await once(runtime.server, 'listening');
  const origin = `http://127.0.0.1:${runtime.server.address().port}`;
  web = await createServer({
    root,
    server: { host: '127.0.0.1', port: webPort, strictPort: true },
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(`${origin}/api`),
      'import.meta.env.VITE_SOCKET_URL': JSON.stringify(origin),
    },
  });
  await web.listen();
  const tests = spawn(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', ...process.argv.slice(2)],
    {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, LAB_BASE_URL: env.config.FRONTEND_URL, LAB_FULL_STACK: '1' },
    },
  );
  const [status] = await once(tests, 'exit');
  process.exitCode = status ?? 1;
} finally {
  await web?.close();
  await runtime?.close();
  await env.close();
}
