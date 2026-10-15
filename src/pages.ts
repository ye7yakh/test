// Small server-rendered pages for when the app itself cannot open: an address that
// does not exist, a salon link nobody has, a suspended salon. Calm, in both
// languages, no scripts. Each wears the look of the host it is on: a salon's
// own icon and night or day colours on its link, the platform's studio elsewhere,
// and the app's own typeface.
import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { iconVersion } from './brand.js';
import { config } from './config.js';
import { one } from './db.js';
import { requestProto, type Ctx } from './http.js';
import { FONTS, fontFaces, paletteFor, SVG } from './legal.js';
import { resolveHost, type HostContext, type OfflineHost, type Salon, type Tenant } from './tenancy.js';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** A link the page offers, in Arabic (the button) and English (the line under it). */
export interface PageLink {
  href: string;
  ar: string;
  en: string;
}
type Suspended = Extract<OfflineHost, { kind: 'suspended' }>;
type Look = Pick<Salon, 'page_theme' | 'color_primary' | 'color_accent'>;

interface Page {
  status: number;
  headers?: Record<string, string>;
  title: string;
  /** Escaped HTML. */
  ar: string;
  en: { title: string; text: string };
  mark: string;
  colors: Record<string, string>;
  /** Off its own host the page cannot load the font files: they travel inside it. */
  offline: boolean;
  pill?: string;
  extra?: string;
  primary?: PageLink;
  /** Plain text: a button with the Arabic over the English. */
  whatsapp?: { href: string; ar: string; en: string };
}

let embedded: string | null = null;
/** Readex as data: URLs, read once, for hosts that cannot serve /assets (a suspended or unknown salon link). */
function embeddedFonts(): string {
  if (embedded === null) {
    try {
      embedded = fontFaces((f) => `data:font/woff2;base64,${fs.readFileSync(path.join(config.webDir, 'assets', 'fonts', `readex-${f}.woff2`)).toString('base64')}`);
    } catch {
      embedded = '';
    }
  }
  return embedded;
}

const STYLE = `*{box-sizing:border-box}html,body{margin:0}
body{position:relative;isolation:isolate;min-height:100dvh;display:grid;place-items:center;padding:28px 18px;overflow-x:hidden;background:var(--bg);color:var(--text);font:16px/1.7 Readex,system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;text-align:center;-webkit-font-smoothing:antialiased}
.glow{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.glow i{position:absolute;width:72vmax;height:72vmax;border-radius:50%;background:radial-gradient(closest-side,color-mix(in srgb,var(--accent) 24%,transparent),transparent)}
.glow i:first-child{top:-42vmax;inset-inline-end:-26vmax}
.glow i:last-child{bottom:-48vmax;inset-inline-start:-30vmax;opacity:.65}
.card{width:100%;max-width:420px;padding:38px 26px 26px;border-radius:30px;background:var(--card);border:1px solid var(--line);box-shadow:0 40px 80px -34px rgb(0 0 0 / .7),inset 0 1px 0 rgb(255 255 255 / .05)}
.mark{width:88px;height:88px;margin:0 auto 22px;display:grid;place-items:center;overflow:hidden;border-radius:26px;background:var(--grad);color:var(--on-grad);box-shadow:0 22px 50px -18px color-mix(in srgb,var(--accent) 65%,transparent),0 0 0 1px rgb(255 255 255 / .12)}
.mark img{display:block;width:100%;height:100%;object-fit:cover}
.mark .mono{font-size:40px;font-weight:700;line-height:1}
.mark.muted{filter:grayscale(1);opacity:.8;box-shadow:0 18px 40px -20px rgb(0 0 0 / .8),0 0 0 1px rgb(255 255 255 / .1)}
.pill{display:inline-flex;align-items:center;gap:8px;margin:0 0 12px;padding:2px 12px;border-radius:999px;background:var(--chip);color:var(--text-2);font-size:13px}
.pill::before{content:'';width:7px;height:7px;border-radius:50%;background:#fbbf24;box-shadow:0 0 0 3px rgb(251 191 36 / .18)}
h1{margin:0 0 8px;font-size:24px;line-height:1.4}
p{margin:0;color:var(--text-2)}
.host{display:inline-block;max-width:100%;margin-top:14px;padding:4px 12px;border-radius:10px;background:var(--chip);color:var(--text);font:500 14px/1.6 ui-monospace,'SF Mono',Menlo,Consolas,monospace;direction:ltr;unicode-bidi:isolate;overflow-wrap:anywhere}
.acts{display:grid;gap:10px;margin-top:24px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:50px;padding:0 22px;border-radius:16px;background:var(--grad);color:var(--on-grad);font-weight:600;text-decoration:none;box-shadow:0 14px 30px -14px color-mix(in srgb,var(--accent) 75%,transparent),inset 0 1px 0 rgb(255 255 255 / .2);transition:transform .2s,box-shadow .2s}
.btn:hover{transform:translateY(-1px)}
.btn.ghost{background:var(--chip);color:var(--text);border:1px solid var(--line);box-shadow:none}
.btn.ghost svg{flex:none;color:#25d366}
.two{display:flex;flex-direction:column;align-items:center;line-height:1.35;padding-block:7px}
.ghost-en{font-size:13px;font-weight:500;color:var(--text-2)}
.en{margin-top:24px;padding-top:18px;border-top:1px solid var(--line);font-size:14px;line-height:1.6}
.en b{display:block;margin-bottom:2px;color:var(--text);font-weight:600}
.en a{display:inline-flex;margin-top:10px;color:var(--accent);font-weight:600;text-decoration:none}
.en a:hover{text-decoration:underline;text-underline-offset:3px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media (prefers-reduced-motion:no-preference){.card{animation:rise .7s cubic-bezier(.16,1,.3,1) both}.mark{animation:float 6s ease-in-out .7s infinite}}
@keyframes rise{from{opacity:0;transform:translateY(16px)}}
@keyframes float{50%{transform:translateY(-7px)}}`;

function html(p: Page): string {
  const fonts = p.offline ? embeddedFonts() : FONTS;
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<meta name="theme-color" content="${p.colors['--bg']}"><title>${p.title}</title><style>${fonts}
:root{${Object.entries(p.colors).map(([k, v]) => `${k}:${v}`).join(';')}}
${STYLE}</style></head><body>
<div class="glow" aria-hidden="true"><i></i><i></i></div>
<main class="card">
${p.mark}
${p.pill ? `<p class="pill">${p.pill}</p>` : ''}
<h1>${p.title}</h1><p>${p.ar}</p>${p.extra ?? ''}
${p.primary || p.whatsapp ? `<div class="acts">${p.primary ? `<a class="btn" href="${escapeHtml(p.primary.href)}">${p.primary.ar}</a>` : ''}${p.whatsapp ? `<a class="btn ghost" href="${escapeHtml(p.whatsapp.href)}" rel="noopener">${SVG.chat}<span class="two"><span>${escapeHtml(p.whatsapp.ar)}</span><span class="ghost-en" lang="en" dir="ltr">${escapeHtml(p.whatsapp.en)}</span></span></a>` : ''}</div>` : ''}
<div class="en" lang="en" dir="ltr"><p><b>${p.en.title}</b>${p.en.text}</p>${p.primary ? `<a href="${escapeHtml(p.primary.href)}">${p.primary.en} →</a>` : ''}</div>
</main></body></html>`;
}

function send(res: http.ServerResponse, p: Page): void {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(p.status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': `default-src 'none'; style-src 'unsafe-inline'; font-src ${p.offline ? 'data:' : "'self'"}; img-src ${p.offline ? "'none'" : "'self'"}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
    ...p.headers,
  });
  res.end(res.req?.method === 'HEAD' ? undefined : html(p));
}

/** Builds the page (it may look things up), and falls back to the plain one if that fails. */
function respond(res: http.ServerResponse, build: () => Promise<Page>, fallback: () => Page): void {
  build()
    .catch((err) => {
      console.error('page', err);
      return fallback();
    })
    .then((p) => send(res, p))
    .catch(() => res.destroy());
}

const isCtx = (x: Ctx | http.ServerResponse): x is Ctx => 'host' in x && 'res' in x;
const hostname = (header: string | undefined) => (header ?? '').trim().toLowerCase().replace(/\.?(:\d{1,5})?$/, '');
const portOf = (header: string | undefined) => /:(\d{1,5})$/.exec((header ?? '').trim())?.[1] ?? '';
const waLink = (phone: string) => `https://wa.me/${phone.replace(/\D/g, '')}`;

/** The salon's own app icon, or the platform's, as this host serves it. */
function iconMark(host: HostContext): string {
  const src = host.salon ? `/icons/icon-192.png?v=${iconVersion(host.salon)}` : '/icons/icon-192.png';
  return `<div class="mark"><img src="${src}" alt=""></div>`;
}

/** The platform's mark (the sparkles of its dashboard and landing page), drawn inline: an unknown link's page may load no images. */
const platformMark = () => `<div class="mark">${SVG.sparkles}</div>`;

// ---------------------------------------------------------------- not found

function notFoundFor(host: HostContext | null, home?: PageLink): Page {
  const salon = host?.salon ?? null;
  const tenant = host?.tenant;
  const brandAr = tenant ? tenant.name_ar || tenant.name : '';
  const link: PageLink = home ?? (salon
    ? { href: '/', ar: `الرجوع إلى ${salon.name_ar}`, en: `Back to ${salon.name_en || salon.name_ar}` }
    : { href: '/', ar: brandAr ? `الرجوع إلى ${brandAr}` : 'الصفحة الرئيسية', en: tenant ? `Back to ${tenant.name}` : 'Home' });
  return {
    status: 404,
    title: 'الصفحة غير موجودة',
    ar: 'الرابط غير صحيح أو أن الصفحة لم تعد موجودة.',
    en: { title: 'Page not found', text: 'This page does not exist. The link may be mistyped.' },
    mark: host ? iconMark(host) : platformMark(),
    colors: paletteFor(salon),
    offline: !host,
    primary: { href: link.href, ar: escapeHtml(link.ar), en: escapeHtml(link.en) },
  };
}

// ---------------------------------------------------------------- a salon link nobody has

function unknownFor(tenant: Tenant, port: string, proto: string, typed: string): Page {
  const home = `${proto}://${tenant.domain}${port ? `:${port}` : ''}/`;
  const brandAr = tenant.name_ar || tenant.name;
  return {
    status: 404,
    title: 'لا يوجد صالون بهذا الرابط',
    ar: 'تأكد من كتابة الرابط بشكل صحيح، أو اطلبه من الصالون مباشرة.',
    extra: typed ? `<p><span class="host">${escapeHtml(typed)}</span></p>` : '',
    en: { title: 'No salon at this link', text: 'Check the spelling, or ask the salon for its link.' },
    mark: platformMark(),
    colors: paletteFor(null),
    offline: true,
    primary: { href: home, ar: escapeHtml(`اذهب إلى ${brandAr}`), en: escapeHtml(`Go to ${tenant.name}`) },
    whatsapp: tenant.contact_phone ? { href: waLink(tenant.contact_phone), ar: 'تواصل معنا على واتساب', en: 'Message us on WhatsApp' } : undefined,
  };
}

// ---------------------------------------------------------------- suspended

function unavailableFor(salon: Suspended, look: Look | null): Page {
  const nameEn = salon.name_en ? escapeHtml(salon.name_en) : '';
  const initial = [...(salon.name_ar || salon.name_en || '؟').trim()][0] ?? '؟';
  return {
    status: 503,
    headers: { 'Retry-After': '3600' },
    title: escapeHtml(salon.name_ar),
    pill: 'متوقفة مؤقتًا',
    ar: 'صفحة الحجز غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
    en: { title: nameEn || 'Temporarily unavailable', text: 'Booking is not available right now. Please try again later.' },
    mark: `<div class="mark muted"><span class="mono">${escapeHtml(initial)}</span></div>`,
    colors: paletteFor(look),
    offline: true,
  };
}

/** The suspended salon's colours, from its link (the host the customer opened). */
async function suspendedLook(req: http.IncomingMessage, tenant: Tenant): Promise<Look | null> {
  const name = hostname(req.headers.host);
  const suffix = `.${tenant.domain}`;
  if (!name.endsWith(suffix)) return null;
  return (await one<Look>(
    'select page_theme, color_primary, color_accent from salons where tenant_id = $1 and subdomain = $2',
    [tenant.id, name.slice(0, -suffix.length)],
  )) ?? null;
}

/** The platform that owns a salon-shaped host (typo.brand.com → brand.com), if any. */
async function parentTenant(header: string | undefined): Promise<Tenant | null> {
  const name = hostname(header);
  const dot = name.indexOf('.');
  if (dot < 0) return null;
  const port = portOf(header);
  const parent = await resolveHost(`${name.slice(dot + 1)}${port ? `:${port}` : ''}`);
  return parent?.site === 'landing' ? parent.tenant : null;
}

// ---------------------------------------------------------------- exports

/**
 * An address that does not exist, with the way back. With the request's Ctx it wears
 * that host's look at once; with only the response it looks the host up itself (a
 * salon link nobody has gets the "no salon here" page). `home` overrides the link.
 */
export function notFoundPage(target: Ctx | http.ServerResponse, home?: PageLink): void {
  if (isCtx(target)) {
    send(target.res, notFoundFor(target.host, home));
    return;
  }
  const res = target;
  const req = res.req;
  respond(
    res,
    async () => {
      const host = await resolveHost(req.headers.host);
      if (host) return notFoundFor(host, home);
      const tenant = await parentTenant(req.headers.host);
      if (tenant) return unknownFor(tenant, portOf(req.headers.host), requestProto(req, config.trustProxy), hostname(req.headers.host));
      return notFoundFor(null, home);
    },
    () => notFoundFor(null, home),
  );
}

/** A salon link that matches no salon on this platform: check the spelling, or go to the platform. */
export function unknownSalonPage(res: http.ServerResponse, tenant: Tenant, port: string, proto: string): void {
  send(res, unknownFor(tenant, port, proto, hostname(res.req?.headers.host)));
}

/** What customers see while the platform has a salon suspended: calm, in its colours, not a bare error. */
export function unavailablePage(target: Ctx | http.ServerResponse, salon: Suspended): void {
  const res = isCtx(target) ? target.res : target;
  respond(res, async () => unavailableFor(salon, await suspendedLook(res.req, salon.tenant)), () => unavailableFor(salon, null));
}
