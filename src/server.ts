import http from 'node:http';
import { config } from './config.js';
import { loadSession, purgeExpiredSessions } from './auth.js';
import { pool } from './db.js';
import { baseSecurityHeaders, clientIp, HttpError, Router, sendJson, type Ctx } from './http.js';
import { serveAsset, serveIndex } from './static.js';
import { resolveHost } from './tenancy.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { publicRoutes } from './routes/public.js';
import { salonRoutes } from './routes/salon.js';
import { serviceRoutes } from './routes/services.js';
import { staffRoutes } from './routes/staff.js';

const router = new Router();
authRoutes(router);
adminRoutes(router);
publicRoutes(router);
salonRoutes(router);
serviceRoutes(router);
staffRoutes(router);

const SAFE_METHODS = new Set(['GET', 'HEAD']);

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  baseSecurityHeaders(res, config.isProd);
  const url = new URL(req.url ?? '/', 'http://localhost');
  const method = req.method ?? 'GET';

  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('ok');
    return;
  }

  const host = await resolveHost(req.headers.host);
  if (!host) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found / غير موجود');
    return;
  }

  const ctx: Ctx = { req, res, url, params: {}, host, ip: clientIp(req, config.trustProxy), session: null };
  try {
    if (await serveAsset(ctx)) return;

    if (!SAFE_METHODS.has(method)) {
      // Writes must come from this same host (each salon is its own origin).
      const origin = req.headers.origin;
      if (origin && origin !== 'null') {
        let originHost = '';
        try {
          originHost = new URL(origin).host;
        } catch {}
        if (originHost !== req.headers.host) throw new HttpError(403, 'bad_origin');
      } else if (origin === 'null' || req.headers['sec-fetch-site'] === 'cross-site') {
        throw new HttpError(403, 'bad_origin');
      }
    }

    const match = router.match(method, url.pathname);
    if (match === 'method') throw new HttpError(405, 'method_not_allowed');
    if (match) {
      if (url.pathname.startsWith('/api/')) ctx.session = await loadSession(req.headers.cookie, host);
      ctx.params = match.params;
      await match.handler(ctx);
      return;
    }
    if (url.pathname === '/' && SAFE_METHODS.has(method)) return await serveIndex(ctx);
    throw new HttpError(404, 'not_found');
  } catch (err) {
    sendError(ctx, err);
  }
}

function sendError(ctx: Ctx, err: unknown): void {
  const { res } = ctx;
  if (res.headersSent) {
    res.destroy();
    return;
  }
  if (err instanceof HttpError) {
    const retryAfter = (err as HttpError & { retryAfter?: number }).retryAfter;
    if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
    sendJson(res, err.status, { error: err.code, ...(err.field ? { field: err.field } : {}) });
    return;
  }
  if (err instanceof URIError) {
    sendJson(res, 400, { error: 'bad_request' });
    return;
  }
  if ((err as { code?: string }).code === '23505') {
    sendJson(res, 409, { error: 'conflict' });
    return;
  }
  console.error(`${ctx.req.method} ${ctx.url.pathname}`, err);
  sendJson(res, 500, { error: 'server_error' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error(err);
    if (!res.headersSent) sendJson(res, 500, { error: 'server_error' });
    else res.destroy();
  });
});
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;

server.listen(config.port, () => console.log(`listening on :${config.port}`));

const purge = setInterval(() => purgeExpiredSessions().catch((e) => console.error('session purge', e)), 3600_000);
purge.unref();

// ECS stops tasks with SIGTERM: finish in-flight requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
