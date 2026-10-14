import http from 'node:http';
import { config } from './config.js';
import { loadSession, purgeExpiredSessions } from './auth.js';
import { pool } from './db.js';
import { baseSecurityHeaders, clientIp, HttpError, requestProto, Router, sendJson, type Ctx } from './http.js';
import { notFoundPage, unavailablePage } from './pages.js';
import { hostOrigin, pageFor, serveAsset, serveIndex } from './static.js';
import { offlineHost, resolveHost } from './tenancy.js';
import { adminRoutes } from './routes/admin.js';
import { bookingRoutes } from './routes/bookings.js';
import { expireHolds, purgeProofs } from './booking.js';
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
bookingRoutes(router);

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
    const offline = await offlineHost(req.headers.host);
    if (offline?.kind === 'moved' && SAFE_METHODS.has(method)) {
      // The salon's earlier link: same page on its current link. Temporary (302), so a
      // later rename back cannot leave browsers stuck on a cached redirect.
      const proto = requestProto(req, config.trustProxy);
      const port = offline.port ? `:${offline.port}` : '';
      res.writeHead(302, { Location: `${proto}://${offline.subdomain}.${offline.tenant.domain}${port}${url.pathname}${url.search}`, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (offline?.kind === 'suspended') {
      if (url.pathname.startsWith('/api/')) sendJson(res, 404, { error: 'suspended' });
      else if (SAFE_METHODS.has(method) && (url.pathname === '/' || url.pathname === '/index.html')) unavailablePage(res, offline);
      else sendJson(res, 404, { error: 'not_found' });
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found / غير موجود');
    return;
  }

  const ctx: Ctx = { req, res, url, params: {}, host, ip: clientIp(req, config.trustProxy), session: null };
  if (host.site === 'www') {
    // One address for the platform: www. goes to the bare domain, same path.
    res.writeHead(308, { Location: `${hostOrigin(ctx, host.tenant.domain)}${url.pathname}${url.search}` });
    res.end();
    return;
  }
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
    const page = SAFE_METHODS.has(method) ? pageFor(ctx) : null;
    if (page && 'redirect' in page) {
      res.writeHead(302, { Location: page.redirect, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    if (page) return await serveIndex(ctx, page.page);
    // A mistyped address in a browser gets a page with the way home, not raw JSON.
    if (SAFE_METHODS.has(method) && !url.pathname.startsWith('/api/') && req.headers.accept?.includes('text/html')) {
      notFoundPage(res);
      return;
    }
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
  // A service or team member that bookings still point at.
  if ((err as { code?: string }).code === '23503') {
    sendJson(res, 409, { error: 'in_use' });
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

const purge = setInterval(() => {
  purgeExpiredSessions().catch((e) => console.error('session purge', e));
  purgeProofs(pool).catch((e) => console.error('proof purge', e));
}, 3600_000);
purge.unref();
// Unpaid deposit holds give their slot back.
const sweep = setInterval(() => expireHolds(pool).catch((e) => console.error('expire holds', e)), 60_000);
sweep.unref();

// ECS stops tasks with SIGTERM: finish in-flight requests, then exit.
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 10_000).unref();
  });
}
