// The single-page app. index.html is rendered per host so the title, theme colour,
// manifest and CSS colour variables are the salon's own from the first paint.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from './config.js';
import { HttpError, requestProto, type Ctx } from './http.js';

const TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

interface CachedFile {
  mtimeMs: number;
  body: Buffer;
  etag: string;
}
const files = new Map<string, CachedFile>();

async function readCached(file: string): Promise<CachedFile | null> {
  let stat;
  try {
    stat = await fs.stat(file);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const hit = files.get(file);
  if (hit && hit.mtimeMs === stat.mtimeMs) return hit;
  const body = await fs.readFile(file);
  const entry = { mtimeMs: stat.mtimeMs, body, etag: `"${crypto.createHash('sha1').update(body).digest('base64url')}"` };
  files.set(file, entry);
  return entry;
}

export async function serveAsset(ctx: Ctx): Promise<boolean> {
  const { pathname } = ctx.url;
  if (!pathname.startsWith('/assets/') && pathname !== '/sw.js') return false;
  if (ctx.req.method !== 'GET' && ctx.req.method !== 'HEAD') throw new HttpError(405, 'method_not_allowed');
  const file = path.resolve(config.webDir, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(config.webDir + path.sep)) throw new HttpError(404, 'not_found');
  const type = TYPES[path.extname(file)];
  const entry = type ? await readCached(file) : null;
  if (!entry) throw new HttpError(404, 'not_found');
  // No fingerprinted names: browsers revalidate and get a 304 when nothing changed.
  const headers = { 'Content-Type': type!, ETag: entry.etag, 'Cache-Control': 'no-cache' };
  if (ctx.req.headers['if-none-match'] === entry.etag) {
    ctx.res.writeHead(304, headers);
    ctx.res.end();
  } else {
    ctx.res.writeHead(200, { ...headers, 'Content-Length': entry.body.length });
    ctx.res.end(ctx.req.method === 'HEAD' ? undefined : entry.body);
  }
  return true;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Black or white, whichever reads better on the given background. */
export function onColor(hex: string): string {
  const L = luminance(hex);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111111' : '#ffffff';
}

// Owner screens (and the whole platform host) use the dark studio theme; the
// salon's public page is light. Set before first paint so there is no flash.
const BOOT_SCRIPT = `(function(){var s=/^#\\/(manage|login)/.test(location.hash)||document.documentElement.dataset.platform==='1';
if(s){document.documentElement.dataset.theme='studio';document.querySelector('meta[name=theme-color]').content='#0a0918';}})();`;

export async function serveIndex(ctx: Ctx): Promise<void> {
  const template = await readCached(path.join(config.webDir, 'index.html'));
  if (!template) throw new HttpError(500, 'missing_index');
  const salon = ctx.host.salon;
  const primary = salon?.color_primary ?? '#1f2a37';
  const accent = salon?.color_accent ?? '#c8a15a';
  const title = salon ? salon.name_ar : ctx.host.tenant.name;
  const head = salon
    ? `<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icons/icon-192.png?v=${salon.logo_media_id ?? 'default'}">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png?v=${salon.logo_media_id ?? 'default'}">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="${escapeHtml(title)}">`
    : '';
  const nonce = crypto.randomBytes(16).toString('base64');
  const vars = `:root{--primary:${primary};--on-primary:${onColor(primary)};--accent:${accent};--on-accent:${onColor(accent)}}`;
  const html = template.body
    .toString('utf8')
    .replace('data-theme="{{mode}}"', salon ? 'data-theme="public"' : 'data-theme="studio" data-platform="1"')
    .replaceAll('{{title}}', escapeHtml(title))
    .replaceAll('{{theme}}', salon ? primary : '#0a0918')
    .replace('{{head}}', head)
    .replace('{{vars}}', `<style nonce="${nonce}">${vars}</style>`)
    .replace('{{boot}}', `<script nonce="${nonce}">${BOOT_SCRIPT}</script>`);
  // The platform host shows each salon's app icon, served from the salon's own subdomain.
  const port = ctx.host.port ? `:${ctx.host.port}` : '';
  const salonIcons = salon ? '' : ` ${requestProto(ctx.req, config.trustProxy)}://*.${ctx.host.tenant.domain}${port}`;
  ctx.res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${nonce}'`,
      `style-src 'self' 'nonce-${nonce}'`,
      `img-src 'self' blob: data:${salonIcons}`,
      "font-src 'self'",
      "connect-src 'self'",
      "manifest-src 'self'",
      "worker-src 'self'",
      "frame-ancestors 'none'",
      "base-uri 'none'",
      "form-action 'self'",
      "object-src 'none'",
    ].join('; '),
  });
  ctx.res.end(ctx.req.method === 'HEAD' ? undefined : html);
}
