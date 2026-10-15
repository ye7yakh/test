// The platform's /admin (and /login) on its landing page. Owners who type
// salonak.app/admin are looking for their own salon's dashboard, which lives on their
// salon's link: they type that link here and go straight to its sign-in. The
// platform's own dashboard is only ever reached by its own hostname, so this page
// never mentions it. One small form, no scripts.
import crypto from 'node:crypto';
import { config } from './config.js';
import { requestProto, type Ctx } from './http.js';
import { FONTS, paletteFor, SVG } from './legal.js';
import { findSalonLink } from './tenancy.js';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ARROW = '<svg class="arrow" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

const STYLE = `*{box-sizing:border-box}html,body{margin:0}
body{position:relative;isolation:isolate;min-height:100dvh;display:grid;place-items:center;padding:28px 16px;overflow-x:hidden;background:var(--bg);color:var(--text);font:16px/1.7 Readex,system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;text-align:center;-webkit-font-smoothing:antialiased}
.glow{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none}
.glow i{position:absolute;width:72vmax;height:72vmax;border-radius:50%}
.glow i:first-child{top:-44vmax;inset-inline-end:-28vmax;background:radial-gradient(closest-side,rgb(168 85 247 / .26),transparent)}
.glow i:last-child{bottom:-48vmax;inset-inline-start:-30vmax;background:radial-gradient(closest-side,rgb(59 130 246 / .2),transparent)}
.card{width:100%;min-width:0;max-width:440px;padding:38px 24px 24px;border-radius:30px;background:var(--card);border:1px solid var(--line);box-shadow:0 40px 80px -34px rgb(0 0 0 / .7),inset 0 1px 0 rgb(255 255 255 / .05);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}
.mark{width:88px;height:88px;margin:0 auto 22px;display:grid;place-items:center;border-radius:26px;background:var(--grad);color:var(--on-grad);box-shadow:0 22px 50px -18px rgb(139 92 246 / .7),0 0 0 1px rgb(255 255 255 / .12)}
.pill{display:inline-flex;align-items:center;gap:8px;margin:0 0 12px;padding:2px 12px;border-radius:999px;background:var(--chip);color:var(--text-2);font-size:13px}
.pill::before{content:'';width:7px;height:7px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 3px rgb(180 165 255 / .2)}
h1{margin:0 0 8px;font-size:clamp(23px,6vw,27px);line-height:1.4}
.lead{margin:0;color:var(--text-2)}
form{margin-top:24px;text-align:start}
label{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:2px 12px;margin:0 4px 8px;font-size:14.5px;font-weight:600}
label span{color:var(--text-2);font-size:13px;font-weight:400}
.field{display:flex;align-items:center;gap:6px;min-height:58px;padding:5px;padding-inline-start:16px;border-radius:18px;background:rgb(0 0 0 / .3);border:1px solid var(--line);transition:border-color .2s,box-shadow .2s}
.field:focus-within{border-color:rgb(180 165 255 / .7);box-shadow:0 0 0 4px rgb(139 92 246 / .22)}
.field.bad{border-color:rgb(248 113 113 / .7)}
.field.bad:focus-within{box-shadow:0 0 0 4px rgb(248 113 113 / .2)}
.field input{flex:1;width:0;min-width:0;height:46px;margin:0;padding:0;border:0;background:none;color:var(--text);font:600 17px/1.2 ui-monospace,'SF Mono',Menlo,Consolas,monospace;caret-color:var(--accent);outline:none}
.field input::placeholder{color:rgb(228 224 255 / .32)}
.sfx{flex:none;max-width:52%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:9px 12px;border-radius:13px;background:var(--chip);color:var(--text-2);font:500 14px/1.4 ui-monospace,'SF Mono',Menlo,Consolas,monospace}
.hint{margin:9px 4px 0;color:var(--text-2);font-size:13.5px}
.hint bdi,.err bdi{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:var(--text)}
.err{display:flex;align-items:flex-start;gap:9px;margin:10px 2px 0;padding:10px 14px;border-radius:14px;background:rgb(248 113 113 / .1);color:#fecaca;font-size:14px;line-height:1.6}
.err::before{content:'';flex:none;width:8px;height:8px;margin-top:7px;border-radius:50%;background:#f87171;box-shadow:0 0 0 3px rgb(248 113 113 / .2)}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:54px;margin-top:16px;padding:0 22px;border:0;border-radius:17px;background:var(--grad);color:var(--on-grad);font:inherit;font-weight:600;text-decoration:none;cursor:pointer;box-shadow:0 16px 34px -14px rgb(139 92 246 / .8),inset 0 1px 0 rgb(255 255 255 / .22);transition:transform .2s,box-shadow .2s}
.btn:hover{transform:translateY(-1px);box-shadow:0 20px 40px -14px rgb(139 92 246 / .9),inset 0 1px 0 rgb(255 255 255 / .22)}
.two{display:flex;flex-direction:column;align-items:center;line-height:1.35}
.btn .two{padding-block:8px}
.btn-en{font-size:13px;font-weight:500;opacity:.8}
.ghost .two{padding-block:7px}
.ghost-en{font-size:13px;color:var(--text-2)}
[dir=rtl] .btn .arrow{transform:scaleX(-1)}
.ghost{display:flex;align-items:center;justify-content:center;gap:9px;min-height:50px;margin-top:10px;padding:0 18px;border-radius:16px;background:var(--chip);border:1px solid var(--line);color:var(--text);font-size:15px;font-weight:500;text-decoration:none;transition:background-color .2s}
.ghost:hover{background:rgb(255 255 255 / .1)}
.ghost svg{flex:none;color:#25d366}
.en{margin-top:22px;padding-top:18px;border-top:1px solid var(--line);font-size:14px;line-height:1.6;color:var(--text-2)}
.en p{margin:0}
.en .eg{margin-top:6px}
.en bdi{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;color:var(--text)}
.en b{display:block;margin-bottom:2px;color:var(--text);font-weight:600}
.home{display:flex;flex-wrap:wrap;justify-content:center;gap:4px 18px;margin-top:12px}
.home a{color:var(--accent);font-weight:600;text-decoration:none}
.home a:hover{text-decoration:underline;text-underline-offset:3px}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
@media (prefers-reduced-motion:no-preference){.card{animation:rise .7s cubic-bezier(.16,1,.3,1) both}.mark{animation:float 6s ease-in-out .7s infinite}}
@keyframes rise{from{opacity:0;transform:translateY(16px)}}
@keyframes float{50%{transform:translateY(-7px)}}`;

/**
 * GET /admin on the landing page: the form, or (with ?salon=) the way to that salon's
 * dashboard. A link nobody has comes back to the form, kept as typed, with the reason.
 */
export async function ownerDoor(ctx: Ctx): Promise<void> {
  const { tenant, port } = ctx.host;
  const proto = requestProto(ctx.req, config.trustProxy);
  const portPart = port ? `:${port}` : '';
  const typed = (ctx.url.searchParams.get('salon') ?? '').trim().slice(0, 120);
  if (typed) {
    // A suspended salon's link says so itself.
    const subdomain = await findSalonLink(tenant, typed);
    if (subdomain) {
      ctx.res.writeHead(302, { Location: `${proto}://${subdomain}.${tenant.domain}${portPart}/admin`, 'Cache-Control': 'no-store' });
      ctx.res.end();
      return;
    }
  }
  const failed = !!typed;
  const brandAr = tenant.name_ar || tenant.name;
  const domain = escapeHtml(`.${tenant.domain}`);
  const example = escapeHtml(`elite.${tenant.domain}`);
  const colors = paletteFor(null);
  const nonce = crypto.randomBytes(16).toString('base64');
  const contact = tenant.contact_phone
    ? `<a class="ghost" href="https://wa.me/${tenant.contact_phone.replace(/\D/g, '')}" rel="noopener">${SVG.chat}<span class="two"><span>نسيت الرابط؟ راسلنا على واتساب</span><span class="ghost-en" lang="en" dir="ltr">Forgot it? WhatsApp us</span></span></a>`
    : '';
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex">
<meta name="theme-color" content="${colors['--bg']}"><title>لوحة تحكم صالونك · Your salon's dashboard · ${escapeHtml(brandAr)}</title>
<link rel="icon" href="/icons/icon-192.png"><style nonce="${nonce}">${FONTS}
:root{${Object.entries(colors).map(([k, v]) => `${k}:${v}`).join(';')}}
${STYLE}</style></head><body>
<div class="glow" aria-hidden="true"><i></i><i></i></div>
<main class="card" aria-labelledby="door-h">
<div class="mark">${SVG.sparkles}</div>
<p class="pill">لأصحاب الصالونات</p>
<h1 id="door-h">لوحة تحكم صالونك</h1>
<p class="lead">لكل صالون رابطه الخاص، ولوحة إدارته عليه. اكتب رابط صالونك وننقلك إلى الدخول.</p>
<form method="get" action="/admin">
<label for="salon">رابط صالونك <span lang="en" dir="ltr">Your salon's link</span></label>
<div class="field${failed ? ' bad' : ''}" dir="ltr"><input id="salon" name="salon" type="text" inputmode="url" autocomplete="off" autocapitalize="none" autocorrect="off" spellcheck="false" required maxlength="120" placeholder="your-salon" value="${escapeHtml(typed)}" aria-describedby="${failed ? 'door-err' : 'door-hint'}"${failed ? ' aria-invalid="true" autofocus' : ''}><span class="sfx" aria-hidden="true">${domain}</span></div>
${failed
    ? `<p class="err" id="door-err" role="alert"><span>لا يوجد صالون بهذا الرابط. اكتبه كما وصلك منا، مثل <bdi dir="ltr">${example}</bdi></span></p>`
    : `<p class="hint" id="door-hint">مثل <bdi dir="ltr">${example}</bdi> أو <bdi dir="ltr">elite</bdi> فقط</p>`}
<button class="btn" type="submit"><span class="two"><span>إلى لوحة صالوني</span><span class="btn-en" lang="en" dir="ltr">Open my dashboard</span></span>${ARROW}</button>
</form>
${contact}
<div class="en" lang="en" dir="ltr"><p><b>Your salon's dashboard</b>${failed
    ? 'No salon has the link you typed. Check the spelling, or type it as we sent it to you.'
    : "Every salon has its own link, and its dashboard lives there. Type your salon's link to sign in."}</p>
<p class="eg">For example <bdi>${example}</bdi>, or just <bdi>elite</bdi>.</p>
<p class="home"><a href="/" lang="ar" dir="rtl">الرجوع إلى ${escapeHtml(brandAr)}</a><a href="/">Back to ${escapeHtml(tenant.name)} →</a></p></div>
</main></body></html>`;
  ctx.res.writeHead(failed ? 404 : 200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    // The form leads (by a redirect) to a salon's own link.
    'Content-Security-Policy': `default-src 'none'; style-src 'nonce-${nonce}'; font-src 'self'; img-src 'self'; form-action 'self' ${proto}://*.${tenant.domain}${portPart}; base-uri 'none'; frame-ancestors 'none'`,
  });
  ctx.res.end(ctx.req.method === 'HEAD' ? undefined : html);
}
