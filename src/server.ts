import http from 'node:http';
import { config } from './config.js';
import { loadSession, purgeExpiredSessions } from './auth.js';
import { pool } from './db.js';
import { baseSecurityHeaders, clientIp, HttpError, requestProto, Router, sendJson, type Ctx } from './http.js';
import { serveAsset, serveIndex } from './static.js';
import { offlineHost, resolveHost, type OfflineHost } from './tenancy.js';
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

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** What customers see while the platform has a salon suspended: calm, not a bare error. */
function unavailablePage(res: http.ServerResponse, salon: Extract<OfflineHost, { kind: 'suspended' }>): void {
  const name = escapeHtml(salon.name_ar);
  const nameEn = salon.name_en ? escapeHtml(salon.name_en) : '';
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="theme-color" content="#0a0918"><title>${name}</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:grid;place-items:center;padding:24px;background:radial-gradient(120% 80% at 80% 0%,#2a1b5c 0%,transparent 60%),radial-gradient(90% 70% at 0% 100%,#0f2b5c 0%,transparent 55%),#0a0918;color:#f4f2ff;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;text-align:center}
.card{max-width:380px;width:100%;padding:36px 26px;border-radius:28px;background:rgb(21 18 44/.6);border:1px solid rgb(167 139 250/.18);box-shadow:0 30px 60px -24px #000}
.mark{width:72px;height:72px;margin:0 auto 20px;border-radius:22px;display:grid;place-items:center;background:linear-gradient(135deg,#a855f7,#6366f1 52%,#3b82f6)}
h1{margin:0 0 8px;font-size:22px}p{margin:0;color:rgb(228 224 255/.66)}.en{margin-top:18px;padding-top:18px;border-top:1px solid rgb(167 139 250/.14);font-size:14px;direction:ltr}
</style></head><body><main class="card">
<div class="mark"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/></svg></div>
<h1>${name}</h1><p>صفحة الحجز غير متاحة حاليًا. يرجى المحاولة لاحقًا.</p>
<p class="en">${nameEn ? `${nameEn}: ` : ''}booking is not available right now. Please try again later.</p>
</main></body></html>`;
  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': '3600',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.end(html);
}

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
    // The salon's link is the customers' app; /manage is the owner's (salons only).
    if ((url.pathname === '/' || (url.pathname === '/manage' && host.salon)) && SAFE_METHODS.has(method)) return await serveIndex(ctx);
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
