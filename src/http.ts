import type { IncomingMessage, ServerResponse } from 'node:http';
import type { HostContext } from './tenancy.js';
import type { Session } from './auth.js';

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    public field?: string,
  ) {
    super(code);
  }
}

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
  host: HostContext;
  ip: string;
  session: Session | null;
}

export type Handler = (ctx: Ctx) => Promise<void> | void;

interface Route {
  method: string;
  regex: RegExp;
  keys: string[];
  handler: Handler;
}

export class Router {
  private routes: Route[] = [];

  add(method: string, pattern: string, handler: Handler): this {
    const keys: string[] = [];
    const source = pattern.replace(/:(\w+)/g, (_, key: string) => {
      keys.push(key);
      return '([^/]+)';
    });
    this.routes.push({ method, regex: new RegExp(`^${source}$`), keys, handler });
    return this;
  }

  get(p: string, h: Handler) { return this.add('GET', p, h); }
  post(p: string, h: Handler) { return this.add('POST', p, h); }
  put(p: string, h: Handler) { return this.add('PUT', p, h); }
  patch(p: string, h: Handler) { return this.add('PATCH', p, h); }
  delete(p: string, h: Handler) { return this.add('DELETE', p, h); }

  match(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | 'method' | null {
    let pathMatched = false;
    for (const route of this.routes) {
      const m = route.regex.exec(pathname);
      if (!m) continue;
      pathMatched = true;
      if (route.method !== method && !(method === 'HEAD' && route.method === 'GET')) continue;
      const params: Record<string, string> = {};
      route.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(m[i + 1] ?? '');
      });
      return { handler: route.handler, params };
    }
    return pathMatched ? 'method' : null;
  }
}

export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

export function ok(ctx: Ctx, body: unknown = { ok: true }, status = 200): void {
  sendJson(ctx.res, status, body);
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > limit) throw new HttpError(413, 'too_large');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new HttpError(413, 'too_large');
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

// JSON bodies only: a cross-site HTML form cannot send application/json, which
// (with SameSite cookies and the Origin check in server.ts) closes off CSRF.
export async function readJson(ctx: Ctx): Promise<Record<string, unknown>> {
  const type = ctx.req.headers['content-type'] ?? '';
  if (!type.startsWith('application/json')) throw new HttpError(415, 'json_required');
  const raw = await readBody(ctx.req, 256 * 1024);
  let data: unknown;
  try {
    data = JSON.parse(raw.toString('utf8'));
  } catch {
    throw new HttpError(400, 'bad_json');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'bad_json');
  return data as Record<string, unknown>;
}

export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

export function requestProto(req: IncomingMessage, trustProxy: boolean): 'http' | 'https' {
  if (trustProxy && req.headers['x-forwarded-proto'] === 'https') return 'https';
  return (req.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http';
}

export function baseSecurityHeaders(res: ServerResponse, hsts: boolean): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // The camera is for the AI mirror's selfie, on this origin only.
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  if (hsts) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}
