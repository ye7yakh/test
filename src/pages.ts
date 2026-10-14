// Small server-rendered pages for when the app itself cannot open: a suspended
// salon, or an address that does not exist. Calm, in both languages, no scripts.
import type http from 'node:http';
import type { OfflineHost } from './tenancy.js';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const SCISSORS = '<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M8.1 8.1 20 20M8.1 15.9 20 4"/></svg>';

function frame(p: { title: string; ar: string; en: string; link?: { href: string; ar: string; en: string } }): string {
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<meta name="theme-color" content="#0a0918"><title>${p.title}</title><style>
*{box-sizing:border-box}html,body{margin:0;height:100%}
body{display:grid;place-items:center;padding:24px;background:radial-gradient(120% 80% at 80% 0%,#2a1b5c 0%,transparent 60%),radial-gradient(90% 70% at 0% 100%,#0f2b5c 0%,transparent 55%),#0a0918;color:#f4f2ff;font:16px/1.6 system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;text-align:center}
.card{max-width:380px;width:100%;padding:36px 26px;border-radius:28px;background:rgb(21 18 44/.6);border:1px solid rgb(167 139 250/.18);box-shadow:0 30px 60px -24px #000}
.mark{width:72px;height:72px;margin:0 auto 20px;border-radius:22px;display:grid;place-items:center;background:linear-gradient(135deg,#a855f7,#6366f1 52%,#3b82f6)}
h1{margin:0 0 8px;font-size:22px}p{margin:0;color:rgb(228 224 255/.66)}.en{margin-top:18px;padding-top:18px;border-top:1px solid rgb(167 139 250/.14);font-size:14px;direction:ltr}
a{display:inline-block;margin-top:22px;padding:11px 22px;border-radius:14px;background:linear-gradient(135deg,#a855f7,#6366f1 52%,#3b82f6);color:#fff;text-decoration:none;font-weight:600}
</style></head><body><main class="card">
<div class="mark">${SCISSORS}</div>
<h1>${p.title}</h1><p>${p.ar}</p>
<p class="en">${p.en}</p>
${p.link ? `<a href="${p.link.href}">${p.link.ar} · ${p.link.en}</a>` : ''}
</main></body></html>`;
}

/** What customers see while the platform has a salon suspended: calm, not a bare error. */
export function unavailablePage(res: http.ServerResponse, salon: Extract<OfflineHost, { kind: 'suspended' }>): void {
  const nameEn = salon.name_en ? escapeHtml(salon.name_en) : '';
  res.writeHead(503, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Retry-After': '3600',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.end(frame({
    title: escapeHtml(salon.name_ar),
    ar: 'صفحة الحجز غير متاحة حاليًا. يرجى المحاولة لاحقًا.',
    en: `${nameEn ? `${nameEn}: ` : ''}booking is not available right now. Please try again later.`,
  }));
}

/** An address that does not exist on this host, with the way back to its home page. */
export function notFoundPage(res: http.ServerResponse): void {
  res.writeHead(404, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'",
  });
  res.end(frame({
    title: 'الصفحة غير موجودة',
    ar: 'الرابط غير صحيح أو أن الصفحة لم تعد موجودة.',
    en: 'This page does not exist. The link may be mistyped.',
    link: { href: '/', ar: 'الصفحة الرئيسية', en: 'Home' },
  }));
}
