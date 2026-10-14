// The single-page app. index.html is rendered per host and path, so the theme, title,
// manifest, colours and link previews are the right app's from the first paint.
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { iconVersion, pageColor, shareVersion, startupImageLinks, STUDIO_BG, studioColor } from './brand.js';
import { brandVars } from './colors.js';
import { config } from './config.js';
import { query } from './db.js';
import { HttpError, requestProto, type Ctx } from './http.js';
import { SHARE_SIZE } from './media.js';
import type { Salon } from './tenancy.js';

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

/** The apps index.html can open: the salon's two, and the platform's two. */
export type Page = 'customer' | 'owner' | 'admin' | 'landing';

const BOOKING_PATH = /^\/b\/[A-Za-z0-9_-]{16,64}\/?$/;
const OWNER_PATH = /^\/admin(?:\/[a-z]*)?$/;

/** This request's scheme and port, for links to the platform's other hosts. */
export function hostOrigin(ctx: Ctx, hostname: string): string {
  const proto = requestProto(ctx.req, config.trustProxy);
  return `${proto}://${hostname}${ctx.host.port ? `:${ctx.host.port}` : ''}`;
}

/**
 * Which app a path opens, or where it lives now. A salon's link: the customers' app
 * (the salon page, /book, and each booking at /b/<token>) and the owner's at /admin.
 * The platform: its landing page on the bare domain, its dashboard on admin.
 */
export function pageFor(ctx: Ctx): { page: Page } | { redirect: string } | null {
  const path = ctx.url.pathname;
  const { site, tenant } = ctx.host;
  if (site === 'salon') {
    if (path === '/' || path === '/book' || path === '/book/' || BOOKING_PATH.test(path)) return { page: 'customer' };
    if (OWNER_PATH.test(path)) return { page: 'owner' };
    if (path === '/login') return { redirect: '/admin/login' };
    // Where the owner's app lived before it moved to /admin.
    if (path === '/manage' || path.startsWith('/manage/')) return { redirect: '/admin' };
    return null;
  }
  if (site === 'admin') return path === '/' ? { page: 'admin' } : null;
  if (path === '/') return { page: 'landing' };
  if (path === '/admin' || path === '/login') return { redirect: `${hostOrigin(ctx, `admin.${tenant.domain}`)}/` };
  return null;
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hhmm = (min: number) => (min >= 1440 ? '23:59' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
const COUNTRIES: Record<string, string> = { '962': 'JO', '966': 'SA', '971': 'AE', '965': 'KW', '974': 'QA', '973': 'BH', '968': 'OM', '20': 'EG' };

/** JSON for a <script> block: nothing in it can close the element. */
const scriptJson = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');

/** What a shared link shows (WhatsApp, Instagram, Facebook) and what search engines read. */
function linkPreview(p: { title: string; description: string; url: string; image: string; siteName?: string }): string[] {
  return [
    `<meta name="description" content="${escapeHtml(p.description)}">`,
    `<link rel="canonical" href="${escapeHtml(p.url)}">`,
    '<meta property="og:type" content="website">',
    p.siteName ? `<meta property="og:site_name" content="${escapeHtml(p.siteName)}">` : '',
    `<meta property="og:title" content="${escapeHtml(p.title)}">`,
    `<meta property="og:description" content="${escapeHtml(p.description)}">`,
    `<meta property="og:url" content="${escapeHtml(p.url)}">`,
    `<meta property="og:image" content="${escapeHtml(p.image)}">`,
    '<meta property="og:image:type" content="image/jpeg">',
    `<meta property="og:image:width" content="${SHARE_SIZE.width}">`,
    `<meta property="og:image:height" content="${SHARE_SIZE.height}">`,
    '<meta property="og:locale" content="ar_AR">',
    '<meta name="twitter:card" content="summary_large_image">',
  ].filter(Boolean);
}

/** The salon as a local business, so search engines know its address, phone and hours. */
async function salonDetails(ctx: Ctx, salon: Salon, origin: string, image: string, description: string): Promise<Record<string, unknown>> {
  const hours = await query<{ weekday: number; open_min: number; close_min: number }>(
    'select weekday, open_min, close_min from salon_hours where salon_id = $1 order by weekday, open_min',
    [salon.id],
  );
  const country = COUNTRIES[ctx.host.tenant.default_calling_code];
  return {
    '@context': 'https://schema.org',
    '@type': 'HealthAndBeautyBusiness',
    name: salon.name_ar,
    ...(salon.name_en ? { alternateName: salon.name_en } : {}),
    description,
    url: `${origin}/`,
    image,
    logo: `${origin}/icons/icon-512.png?v=${iconVersion(salon)}`,
    ...(salon.phone ? { telephone: salon.phone } : {}),
    ...(salon.address ? { address: { '@type': 'PostalAddress', streetAddress: salon.address, ...(country ? { addressCountry: country } : {}) } } : {}),
    currenciesAccepted: salon.currency,
    openingHoursSpecification: hours.map((r) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: `https://schema.org/${DAYS[r.weekday]}`,
      opens: hhmm(r.open_min),
      closes: hhmm(r.close_min),
    })),
  };
}

export async function serveIndex(ctx: Ctx, page: Page): Promise<void> {
  const template = await readCached(path.join(config.webDir, 'index.html'));
  if (!template) throw new HttpError(500, 'missing_index');
  const { salon, tenant } = ctx.host;
  const owner = page === 'owner';
  const origin = hostOrigin(ctx, salon ? `${salon.subdomain}.${tenant.domain}` : page === 'admin' ? `admin.${tenant.domain}` : tenant.domain);
  const brand = tenant.name_ar || tenant.name;
  const nonce = crypto.randomBytes(16).toString('base64');
  let title = page === 'landing' ? `${brand} · ${tenant.name}` : `${brand} · الإدارة`;
  let head: string[] = [];
  let attrs = `data-theme="studio" data-platform="1" data-site="${page}"`;
  let theme = STUDIO_BG;
  let splash = '<div class="boot"><div class="spinner"></div></div>';
  if (salon) {
    title = owner ? `إدارة ${salon.name_ar}` : salon.name_ar;
    const v = iconVersion(salon);
    const prefix = owner ? 'owner-' : '';
    const studio = studioColor(salon);
    theme = owner ? studio : pageColor(salon);
    attrs = [
      `data-theme="${owner ? 'studio' : 'public'}"`,
      `data-page="${salon.page_theme}"`,
      `data-studio="${salon.studio_theme}"`,
      owner ? 'data-app="owner"' : '',
    ].filter(Boolean).join(' ');
    // A dark page runs under the status bar; a light one keeps the bar its own.
    const statusBar = owner || salon.page_theme === 'night' ? 'black-translucent' : 'default';
    head = [
      `<link rel="manifest" href="/${owner ? 'admin' : 'manifest'}.webmanifest">`,
      `<link rel="icon" href="/icons/icon-192.png?v=${v}">`,
      `<link rel="apple-touch-icon" href="/icons/${prefix}apple-touch-icon.png?v=${v}">`,
      '<meta name="mobile-web-app-capable" content="yes">',
      '<meta name="apple-mobile-web-app-capable" content="yes">',
      `<meta name="apple-mobile-web-app-status-bar-style" content="${statusBar}">`,
      `<meta name="apple-mobile-web-app-title" content="${escapeHtml(owner ? 'إدارة الصالون' : salon.name_ar)}">`,
      startupImageLinks(salon, owner),
    ];
    if (page === 'customer' && !ctx.url.pathname.startsWith('/b/')) {
      const about = (salon.about_ar || salon.about_en).trim();
      const description = about ? about.slice(0, 240) : `احجز موعدك في ${salon.name_ar} أونلاين: الخدمات والأسعار والفريق وأوقات الدوام.`;
      const image = `${origin}/share.jpg?v=${shareVersion(salon)}`;
      head.push(...linkPreview({ title: salon.name_ar, description, url: `${origin}/`, image }));
      head.push(`<script type="application/ld+json" nonce="${nonce}">${scriptJson(await salonDetails(ctx, salon, origin, image, description))}</script>`);
    } else {
      // The owner's dashboard and each customer's own booking stay out of search results.
      head.push('<meta name="robots" content="noindex">');
    }
    // The first thing anyone sees: the salon's icon and name, until the app is ready.
    splash = `<div class="boot splash"><div class="splash-mark"><img src="/icons/icon-512.png?v=${v}" alt=""></div><div class="splash-name">${escapeHtml(salon.name_ar)}</div></div>`;
  } else {
    head = ['<link rel="icon" href="/icons/icon-192.png">', '<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">'];
    if (page === 'landing') {
      head.push(...linkPreview({
        title: `${brand}: صالونك صار له تطبيق`,
        description: 'صفحة وتطبيق باسم صالونك وألوانه، حجز على مدار الساعة، وعربون كليك بدون مكالمات. للصالونات ومحلات الحلاقة.',
        url: `${origin}/`,
        image: `${origin}/share.jpg`,
        siteName: brand,
      }));
    } else {
      head.push('<meta name="robots" content="noindex">');
    }
  }
  const colors = brandVars(salon?.color_primary ?? '#1f2a37', salon?.color_accent ?? '#c8a15a');
  const vars = `:root{${Object.entries(colors).map(([k, val]) => `${k}:${val}`).join(';')}}`;
  const html = template.body
    .toString('utf8')
    .replace('data-theme="{{mode}}"', attrs)
    .replaceAll('{{title}}', escapeHtml(title))
    .replaceAll('{{theme}}', theme)
    .replace('{{head}}', head.join('\n'))
    .replace('{{vars}}', `<style nonce="${nonce}">${vars}</style>`)
    .replace('{{splash}}', splash);
  // The platform's pages show each salon's app icon, served from the salon's own subdomain.
  const salonIcons = salon ? '' : ` ${requestProto(ctx.req, config.trustProxy)}://*.${tenant.domain}${ctx.host.port ? `:${ctx.host.port}` : ''}`;
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
