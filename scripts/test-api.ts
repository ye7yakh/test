// API harness: starts its own api on a spare port against the local Postgres, sets
// up a throwaway tenant ("test.localhost"), exercises the owner setup flow and the
// security edges (tenant isolation, CSRF, uploads, rate limits), then cleans up.
//
//   npm run migrate && npm run test:api
import { spawn } from 'node:child_process';
import http from 'node:http';
import sharp from 'sharp';
import { hashPassword } from '../src/auth.js';
import { addDays, availability, clock, createBooking, purgeProofs } from '../src/booking.js';
import { nightBase } from '../src/colors.js';
import { pool, query, tx } from '../src/db.js';
import { renderPortrait } from '../src/media.js';
import type { Salon } from '../src/tenancy.js';

const PORT = Number(process.env.TEST_PORT ?? 3457);
// TEST_DOMAIN and TEST_PORT let two runs share a machine without touching each other.
const DOMAIN = process.env.TEST_DOMAIN ?? 'test.localhost';
// The bare domain is the platform's landing page; its dashboard lives on admin.
const LANDING = `${DOMAIN}:${PORT}`;
const PLATFORM = `admin.${DOMAIN}:${PORT}`;
const run = Date.now().toString(36).slice(-5);
const hostOf = (sub: string) => `${sub}.${DOMAIN}:${PORT}`;

// The platform's mark (sparkles), and the scissors that are only a salon's default icon.
const SPARKLES = '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>';
const SCISSORS = '<circle cx="6" cy="6" r="3"/>';

// ---------------------------------------------------------------- tiny client

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  json: any;
}

class Client {
  cookies = new Map<string, string>(); // host -> the Cookie header ("sid=...; dev=...")

  request(host: string, method: string, path: string, opts: { json?: unknown; raw?: Buffer; type?: string; headers?: Record<string, string> } = {}): Promise<Res> {
    const headers: Record<string, string> = { Host: host, ...opts.headers };
    let payload: Buffer | undefined;
    if (opts.json !== undefined) {
      payload = Buffer.from(JSON.stringify(opts.json));
      headers['Content-Type'] = opts.type ?? 'application/json';
    } else if (opts.raw) {
      payload = opts.raw;
      headers['Content-Type'] = opts.type ?? 'application/octet-stream';
    }
    const cookie = this.cookies.get(host);
    if (cookie) headers.Cookie = cookie;
    return new Promise((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port: PORT, method, path, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const body = Buffer.concat(chunks);
          // A small jar: each cookie by name, an empty value removes it.
          for (const set of res.headers['set-cookie'] ?? []) {
            const pair = set.split(';')[0]!;
            const name = pair.slice(0, pair.indexOf('='));
            const jar = new Map((this.cookies.get(host) ?? '').split('; ').filter(Boolean).map((p) => [p.slice(0, p.indexOf('=')), p] as const));
            if (pair === `${name}=`) jar.delete(name);
            else jar.set(name, pair);
            if (jar.size) this.cookies.set(host, [...jar.values()].join('; '));
            else this.cookies.delete(host);
          }
          let json: any = null;
          if (res.headers['content-type']?.includes('json')) json = JSON.parse(body.toString('utf8') || 'null');
          resolve({ status: res.statusCode!, headers: res.headers, body, json });
        });
      });
      req.on('error', reject);
      req.end(payload);
    });
  }

  get = (host: string, path: string, headers?: Record<string, string>) => this.request(host, 'GET', path, { headers });
  post = (host: string, path: string, json?: unknown) => this.request(host, 'POST', path, { json: json ?? {} });
  patch = (host: string, path: string, json: unknown) => this.request(host, 'PATCH', path, { json });
  put = (host: string, path: string, json: unknown) => this.request(host, 'PUT', path, { json });
  del = (host: string, path: string) => this.request(host, 'DELETE', path);
  upload = (host: string, path: string, raw: Buffer, type = 'image/jpeg') => this.request(host, 'PUT', path, { raw, type });
  login = (host: string, phone: string, password: string) => this.post(host, '/api/auth/login', { phone, password });
}

/** The same client, seen as coming from its own address (the test api trusts X-Forwarded-For). */
function fromAddress(c: Client, addr: string): Client {
  const request = c.request.bind(c);
  c.request = (host, method, path, opts = {}) => request(host, method, path, { ...opts, headers: { 'X-Forwarded-For': addr, ...opts.headers } });
  return c;
}

// ---------------------------------------------------------------- tiny test runner

let passed = 0;
const failures: string[] = [];

function expect(cond: unknown, what: string, detail?: unknown): void {
  if (cond) {
    passed++;
    console.log(`  ✓ ${what}`);
  } else {
    failures.push(what);
    console.log(`  ✗ ${what}${detail === undefined ? '' : `  → ${JSON.stringify(detail).slice(0, 300)}`}`);
  }
}

function expectStatus(res: Res, status: number, what: string, error?: string): void {
  const ok = res.status === status && (!error || res.json?.error === error);
  expect(ok, `${what} → ${status}${error ? ` ${error}` : ''}`, ok ? undefined : { status: res.status, body: res.json ?? res.body.toString('utf8').slice(0, 200) });
}

const section = (name: string) => console.log(`\n${name}`);

// ---------------------------------------------------------------- fixtures

async function portraitJpeg(w: number, h: number, bg = '#e08a3c'): Promise<Buffer> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <circle cx="${w / 2}" cy="${h * 0.4}" r="${Math.min(w, h) * 0.18}" fill="#c68642"/>
    <ellipse cx="${w / 2}" cy="${h}" rx="${w * 0.4}" ry="${h * 0.3}" fill="#1d3557"/></svg>`;
  return sharp(Buffer.from(svg)).jpeg().toBuffer();
}

const WEEK = (open: string, close: string) => Array.from({ length: 7 }, () => [{ open, close }]);

// ---------------------------------------------------------------- main

async function startServer(): Promise<() => void> {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    // Trust X-Forwarded-For so each test can act as its own client address.
    // The AI mirror draws with the built-in stand-in, and allows three tries per address.
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', TRUST_PROXY: 'true', AI_TRYON_PROVIDER: 'mock', AI_TRYON_API_KEY: '', AI_TRYON_PER_ADDRESS_10M: '3' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('api did not start')), 20_000);
    child.stdout!.on('data', (d: Buffer) => {
      if (d.toString().includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`api exited with ${code}`)));
  });
  return () => child.kill('SIGTERM');
}

async function setupTenant() {
  await cleanup();
  const tenant = (await query<{ id: number }>(
    `insert into tenants (domain, name, name_ar, contact_phone, default_calling_code, default_timezone, default_currency)
     values ($1, 'Test Brand', 'علامة تجربة', '+962790001122', '962', 'Asia/Amman', 'JOD') returning id`,
    [DOMAIN],
  ))[0]!;
  const admin = { phone: '+962791111111', password: 'admin-test-pass' };
  await query(`insert into users (tenant_id, phone, name, password_hash, is_super_admin) values ($1, $2, 'Test admin', $3, true)`, [
    tenant.id,
    admin.phone,
    await hashPassword(admin.password),
  ]);
  return admin;
}

async function cleanup() {
  const t = await query<{ id: number }>('select id from tenants where domain = $1', [DOMAIN]);
  if (!t[0]) return;
  await query('delete from salons where tenant_id = $1', [t[0].id]);
  await query('delete from users where tenant_id = $1', [t[0].id]);
  await query('delete from tenants where id = $1', [t[0].id]);
}

async function main() {
  const admin = await setupTenant();
  const stop = await startServer();
  try {
    await tests(admin);
  } finally {
    stop();
    await cleanup();
    await pool.end();
  }
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(failures.map((f) => `  - ${f}`).join('\n'));
    process.exit(1);
  }
}

async function tests(adminCreds: { phone: string; password: string }) {
  const admin = new Client();
  const ownerA = new Client();
  const ownerB = new Client();
  const anon = new Client();
  const subA = `a${run}`;
  const subB = `b${run}`;
  const A = hostOf(subA);
  const B = hostOf(subB);
  const phoneA = `07${String(Date.now()).slice(-8)}`;
  const phoneB = `07${String(Date.now() + 7).slice(-8)}`;

  section('Hosts');
  expectStatus(await anon.get('nothing.example:1', '/healthz'), 200, 'health check needs no tenant');
  expectStatus(await anon.get(hostOf('nosuchsalon'), '/api/context'), 404, 'unknown salon subdomain', 'not_found');
  const typo = await anon.get(hostOf('nosuchsalon'), '/book', { Accept: 'text/html' });
  const typoHtml = typo.body.toString('utf8');
  expect(typo.status === 404 && String(typo.headers['content-type']).startsWith('text/html') && typoHtml.includes('لا يوجد صالون بهذا الرابط') && typoHtml.includes(`href="http://${LANDING}/"`), "a mistyped salon link in a browser: a page that says so, with the way to the platform", { status: typo.status, type: typo.headers['content-type'] });
  const typoBare = await anon.get(hostOf('nosuchsalon'), '/book');
  expect(typoBare.status === 404 && typoBare.body.toString('utf8').includes('لا يوجد صالون بهذا الرابط'), 'the same page for a request that does not say it wants HTML (a link preview)', { status: typoBare.status, type: typoBare.headers['content-type'] });
  expect(typoHtml.includes('href="https://wa.me/962790001122"') && typoHtml.includes('تواصل معنا على واتساب') && typoHtml.includes('lang="en" dir="ltr">Message us on WhatsApp<'), 'its WhatsApp button says so in Arabic and in English');
  expect(typoHtml.includes(SPARKLES) && !typoHtml.includes(SCISSORS), "it wears the platform's mark (the sparkles of its dashboard), not a salon's scissors");
  expectStatus(await anon.get(hostOf('nosuchsalon'), '/icons/icon-192.png'), 404, "a file on a mistyped link: a plain answer, not the page", 'not_found');
  expect(String((await anon.get('nothing.example', '/', { Accept: 'text/html' })).headers['content-type']).startsWith('text/plain'), 'a host on no platform still gets the plain answer');
  expectStatus(await anon.get(`x.y.${DOMAIN}`, '/api/context'), 404, 'nested subdomain');
  const pctx = await anon.get(PLATFORM, '/api/context');
  expect(pctx.json?.kind === 'platform' && pctx.json.user === null, 'admin. is the platform dashboard', pctx.json);
  const lctx = await anon.get(LANDING, '/api/context');
  expect(lctx.json?.kind === 'landing' && lctx.json.tenant.name_ar === 'علامة تجربة' && lctx.json.tenant.contact_phone === '+962790001122', "the bare domain is the platform's landing page, with its name and contact", lctx.json);
  const www = await anon.get(`www.${DOMAIN}:${PORT}`, '/x?y=1');
  expect(www.status === 308 && www.headers.location === `http://${LANDING}/x?y=1`, 'www. goes to the bare domain, same path', www.headers.location);
  expectStatus(await anon.post(LANDING, '/api/auth/login', { phone: '+962791111111', password: 'admin-test-pass' }), 404, 'nobody signs in on the landing page', 'not_found');

  section('Super admin');
  expectStatus(await admin.login(PLATFORM, adminCreds.phone, 'wrong'), 401, 'wrong password', 'bad_credentials');
  expectStatus(await anon.get(PLATFORM, '/api/admin/salons'), 401, 'salon list needs login');
  expectStatus(await admin.login(PLATFORM, adminCreds.phone, adminCreds.password), 200, 'admin login');
  const created = await admin.post(PLATFORM, '/api/admin/salons', { subdomain: subA, name_ar: 'صالون أ', owner_phone: phoneA, owner_password: 'owner-a-pass' });
  expectStatus(created, 201, 'create salon A');
  expect(created.json?.url === `http://${A}`, 'salon URL is its subdomain', created.json);
  expectStatus(
    await admin.post(PLATFORM, '/api/admin/salons', { subdomain: subB, name_ar: 'صالون ب', owner_phone: phoneB, owner_password: 'owner-b-pass' }),
    201,
    'create salon B',
  );
  expectStatus(await admin.post(PLATFORM, '/api/admin/salons', { subdomain: subA, name_ar: 'x', owner_phone: phoneA }), 409, 'duplicate subdomain', 'subdomain_taken');
  expectStatus(await admin.post(PLATFORM, '/api/admin/salons', { subdomain: 'admin', name_ar: 'x', owner_phone: phoneA }), 400, 'reserved subdomain', 'invalid');
  expectStatus(await admin.post(PLATFORM, '/api/admin/salons', { subdomain: `c${run}`, name_ar: 'x', owner_phone: '0799999990', owner_password: 'short' }), 400, 'weak owner password', 'weak_password');
  expectStatus(await admin.get(A, '/api/manage/salon'), 401, "platform session does not work on a salon's host");

  section('Owner login and tenant isolation');
  expectStatus(await ownerA.login(PLATFORM, phoneA, 'owner-a-pass'), 401, 'owners cannot log in on the platform host');
  // Arabic-Indic digits, as typed on an Arabic keyboard.
  const arabicPhone = phoneA.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d)));
  const login = await ownerA.login(A, arabicPhone, 'owner-a-pass');
  expectStatus(login, 200, 'owner logs in with Arabic-Indic digits');
  const setCookie = login.headers['set-cookie']?.[0] ?? '';
  expect(/HttpOnly/.test(setCookie) && /SameSite=Lax/.test(setCookie) && !/Domain=/i.test(setCookie), 'session cookie is HttpOnly, SameSite, host-only', setCookie);
  const ctxA = await ownerA.get(A, '/api/context');
  expect(ctxA.json?.user?.role === 'owner' && ctxA.json.salon.subdomain === subA, 'context says owner of salon A', ctxA.json);
  expect(ctxA.json?.user?.must_change_password === true, "the admin's password is temporary: the owner is asked to choose their own");
  expectStatus(await ownerB.login(B, phoneB, 'owner-b-pass'), 200, 'owner B logs in');
  const fresh = (await ownerB.get(B, '/api/manage/salon')).json;
  expect(fresh?.salon.currency === 'JOD' && fresh.salon.timezone === 'Asia/Amman', 'new salons are in JD on Amman time', fresh?.salon);
  expect(fresh?.hours[1].length === 0 && fresh.hours.filter((d: unknown[]) => d.length).length === 6, 'Monday is off by default', fresh?.hours);
  expect((await ownerB.get(B, '/api/context')).json?.user?.phone?.startsWith('+9627'), 'Jordanian mobile numbers normalise to +962');

  // Owner A's cookie, replayed against salon B's host.
  const stolen = new Client();
  stolen.cookies.set(B, ownerA.cookies.get(A)!);
  expectStatus(await stolen.get(B, '/api/manage/salon'), 401, "A's session is rejected on B's host");
  // Owner A logging in on B's host is just a customer there.
  const aOnB = new Client();
  await aOnB.login(B, phoneA, 'owner-a-pass');
  expect((await aOnB.get(B, '/api/context')).json?.user?.role === 'customer', 'owner A is only a customer on B');
  expectStatus(await aOnB.get(B, '/api/manage/salon'), 403, "owner A cannot manage B", 'forbidden');

  section('CSRF guards');
  expectStatus(await ownerA.request(A, 'PATCH', '/api/manage/salon', { json: { name_ar: 'x' }, headers: { Origin: 'http://evil.example' } }), 403, 'foreign Origin', 'bad_origin');
  expectStatus(await ownerA.request(A, 'PATCH', '/api/manage/salon', { json: { name_ar: 'x' }, headers: { Origin: `http://${B}` } }), 403, "another salon's origin", 'bad_origin');
  expectStatus(await ownerA.request(A, 'PATCH', '/api/manage/salon', { json: { name_ar: 'x' }, type: 'text/plain' }), 415, 'form-style content type', 'json_required');

  section('Salon profile and look');
  const patched = await ownerA.patch(A, '/api/manage/salon', { name_en: 'Salon A', color_primary: '#0F3D3E', color_accent: '#e2b714', currency: 'JOD', phone: '+962 79 000 0000' });
  expectStatus(patched, 200, 'update profile');
  expect(patched.json?.salon.color_primary === '#0f3d3e' && patched.json.salon.currency === 'JOD', 'colours normalised, currency saved', patched.json?.salon);
  expectStatus(await ownerA.patch(A, '/api/manage/salon', { color_primary: 'red' }), 400, 'bad colour', 'invalid');
  expectStatus(await ownerA.patch(A, '/api/manage/salon', { timezone: 'Mars/Olympus' }), 400, 'unknown timezone', 'invalid');
  expectStatus(await ownerA.patch(A, '/api/manage/salon', { photo_style: 'sepia' }), 400, 'unknown photo style', 'invalid');
  expectStatus(await ownerA.patch(A, '/api/manage/salon', { name_ar: '   ' }), 400, 'blank name', 'invalid');
  const logo = await ownerA.upload(A, '/api/manage/salon/logo', await portraitJpeg(400, 400, '#ffffff'));
  expectStatus(logo, 200, 'upload logo');
  const index = await anon.get(A, '/');
  const html = index.body.toString('utf8');
  const csp = String(index.headers['content-security-policy']);
  const nonce = /nonce-([^']+)'/.exec(csp)?.[1];
  expect(html.includes('<title>صالون أ</title>') && html.includes('--primary:#0f3d3e') && !!nonce && html.includes(`<style nonce="${nonce}">`) && html.includes(`<script type="application/ld+json" nonce="${nonce}">`), 'index.html carries salon title, colours and a CSP nonce');
  expect(html.includes('data-theme="public"') && csp.includes(`script-src 'self' 'nonce-${nonce}'`), "the salon's link opens the customers' app on the public theme");
  const platformIndex = await anon.get(PLATFORM, '/');
  const platformCsp = String(platformIndex.headers['content-security-policy']);
  expect(platformIndex.body.toString('utf8').includes('data-theme="studio" data-platform="1"') && platformCsp.includes(`img-src 'self' blob: data: http://*.${DOMAIN}:${PORT}`), 'platform host is the studio and may show salon icons');
  const manifest = await anon.get(A, '/manifest.webmanifest');
  const m = JSON.parse(manifest.body.toString('utf8'));
  // The app opens on the salon's night page, so the splash screen and bars match it.
  expect(m.name === 'صالون أ' && m.theme_color === nightBase('#0f3d3e') && m.background_color === m.theme_color && m.dir === 'rtl' && m.icons.length === 3, 'per-salon manifest', m);
  const icon = await anon.get(A, m.icons[2].src);
  const iconMeta = icon.status === 200 ? await sharp(icon.body).metadata() : null;
  expect(icon.headers['content-type'] === 'image/png' && iconMeta?.width === 512, 'maskable icon rendered from the logo', { status: icon.status });
  expectStatus(await anon.get(B, '/icons/icon-192.png'), 200, 'salon without a logo gets the default icon');

  section('Brand kit and the two apps');
  const pngSize = async (res: Res) => (res.status === 200 ? sharp(res.body).metadata().then((x) => `${x.width}x${x.height}`) : `status ${res.status}`);
  expectStatus(await ownerA.patch(A, '/api/manage/salon', { page_theme: 'dusk' }), 400, 'unknown page look', 'invalid');
  expectStatus(await ownerA.patch(A, '/api/manage/salon', { icon_bg: 'pink' }), 400, 'unknown icon background', 'invalid');
  const looks = await ownerA.patch(A, '/api/manage/salon', { page_theme: 'day', studio_theme: 'brand', icon_bg: 'night' });
  expect(looks.status === 200 && looks.json.salon.page_theme === 'day' && looks.json.salon.studio_theme === 'brand' && looks.json.salon.icon_bg === 'night', 'the owner picks the customer look, the dashboard look and the icon background', looks.json?.salon);
  const cover = await ownerA.upload(A, '/api/manage/salon/cover', await portraitJpeg(1600, 900, '#334455'));
  expect(cover.status === 200 && /^\/media\//.test(cover.json.salon.cover_url ?? ''), 'a cover banner for the customer page', cover.json?.salon);
  expectStatus(await anon.get(A, cover.json?.salon.cover_url), 200, 'the banner is served like other salon pictures');
  const before = cover.json?.salon.icon_v;
  const ownIcon = await ownerA.upload(A, '/api/manage/salon/icon', await sharp({ create: { width: 512, height: 512, channels: 3, background: '#aa3366' } }).png().toBuffer(), 'image/png');
  expect(ownIcon.status === 200 && !!ownIcon.json.salon.icon_url && ownIcon.json.salon.icon_v !== before, 'a separate app icon; the icon version changes so phones fetch it again', ownIcon.json?.salon);
  expectStatus(await ownerA.upload(A, '/api/manage/salon/icon', await portraitJpeg(120, 120, '#ffffff')), 422, 'an icon needs at least 192px', 'image_too_small');
  const brandPub = (await anon.get(A, '/api/public/salon')).json?.salon;
  expect(brandPub?.page_theme === 'day' && brandPub.cover_url === cover.json?.salon.cover_url && brandPub.icon_v === ownIcon.json?.salon.icon_v, 'customers get the look, the banner and the icon version', brandPub);
  const dayManifest = JSON.parse((await anon.get(A, '/manifest.webmanifest')).body.toString('utf8'));
  // By day the app opens on its hero in the salon's main colour, so the launch screen and bars wear it.
  expect(dayManifest.background_color === '#0f3d3e' && dayManifest.theme_color === '#0f3d3e' && dayManifest.icons[0].src.includes(`v=${brandPub?.icon_v}`), "the customers' app launches on the day hero, in the salon's main colour", dayManifest);
  const ownerManifest = JSON.parse((await anon.get(A, '/admin.webmanifest')).body.toString('utf8'));
  expect(ownerManifest.id === '/admin' && ownerManifest.start_url === '/admin' && ownerManifest.scope === '/admin' && ownerManifest.name === 'إدارة صالون أ' && ownerManifest.background_color === nightBase('#0f3d3e') && ownerManifest.icons.every((i: any) => i.src.startsWith('/icons/owner-')), "the owner's app: its own id, name, scope, colours and icons", ownerManifest);
  const plainIcon = await anon.get(A, '/icons/icon-512.png');
  const ownerIcon = await anon.get(A, '/icons/owner-icon-512.png');
  expect((await pngSize(plainIcon)) === '512x512' && (await pngSize(ownerIcon)) === '512x512' && !plainIcon.body.equals(ownerIcon.body), "the owner's icon carries a badge so the two apps are told apart");
  expect((await pngSize(await anon.get(A, '/icons/owner-apple-touch-icon.png'))) === '180x180', 'owner icon for iPhone home screens');
  const iconBurst = await Promise.all(Array.from({ length: 6 }, () => anon.get(A, '/icons/owner-maskable-512.png')));
  expect(iconBurst.every((r) => r.status === 200 && r.body.equals(iconBurst[0]!.body)), 'six requests at once for an icon not made yet: all served, the same picture');
  expectStatus(await anon.get(A, '/icons/owner-favicon.ico'), 404, 'no owner favicon');
  const ownerIndex = await anon.get(A, '/admin');
  const ownerHtml = ownerIndex.body.toString('utf8');
  expect(ownerIndex.status === 200 && ownerHtml.includes('data-theme="studio"') && ownerHtml.includes('data-app="owner"') && ownerHtml.includes('href="/admin.webmanifest"') && ownerHtml.includes('/icons/owner-apple-touch-icon.png') && ownerHtml.includes('/splash/owner-1290x2796.png') && ownerHtml.includes('content="noindex"'), "/admin opens the owner's app on the studio theme, with its manifest, icon and launch screens, out of search results");
  expect(ownerHtml.includes('data-title-ar="إدارة صالون أ"') && /data-title-en="[^"]+ dashboard"/.test(ownerHtml), "the owner's app has its tab title in English too, for when that is its language");
  const customerHtml = (await anon.get(A, '/')).body.toString('utf8');
  expect(customerHtml.includes('data-page="day"') && customerHtml.includes('class="boot splash"') && customerHtml.includes('apple-touch-startup-image') && customerHtml.includes('--accent-ink:'), "the customers' app: day page, a splash with the salon's icon, iOS launch screens");
  const launch = await anon.get(A, `/splash/1179x2556.png?v=${brandPub?.icon_v}`);
  expect((await pngSize(launch)) === '1179x2556' && /max-age=31536000/.test(String(launch.headers['cache-control'])), 'an iPhone launch screen at the exact size');
  const launchCorner = launch.status === 200 ? [...(await sharp(launch.body).extract({ left: 0, top: 0, width: 1, height: 1 }).removeAlpha().raw().toBuffer())].join() : '';
  expect(launchCorner === '15,61,62' && customerHtml.includes(`.png?v=${brandPub?.icon_v}-0f3d3e"`), "by day the launch screen is the hero's main colour, and its address says so", launchCorner);
  expect((await pngSize(await anon.get(A, '/splash/owner-2048x2732.png'))) === '2048x2732', "an iPad launch screen for the owner's app");
  expectStatus(await anon.get(A, '/splash/1000x1000.png'), 404, 'only real screen sizes');
  expectStatus(await anon.get(PLATFORM, '/admin'), 404, 'no owner app on the platform dashboard');
  const noIcon = await ownerA.del(A, '/api/manage/salon/icon');
  const noCover = await ownerA.del(A, '/api/manage/salon/cover');
  expect(noIcon.json?.salon.icon_url === null && noCover.json?.salon.cover_url === null && noCover.json.salon.logo_url, 'icon and banner can be removed; the logo stays', noCover.json?.salon);
  expectStatus(await anon.get(A, cover.json?.salon.cover_url), 404, 'a removed banner is deleted');
  await ownerA.patch(A, '/api/manage/salon', { page_theme: 'night', studio_theme: 'studio', icon_bg: 'auto' });

  section('Opening hours');
  const split = WEEK('10:00', '14:00').map((d) => [...d, { open: '16:00', close: '02:00' }]);
  split[5] = [];
  split[6] = [{ open: '03:00', close: '12:00' }];
  const hours = await ownerA.put(A, '/api/manage/hours', { hours: split });
  expectStatus(hours, 200, 'split shifts with a range past midnight');
  expect(hours.json?.hours[5].length === 0 && hours.json.hours[0][1].close === '02:00', 'hours read back as saved', hours.json?.hours);
  const overlap = WEEK('10:00', '14:00').map((d) => [...d, { open: '13:00', close: '18:00' }]);
  expectStatus(await ownerA.put(A, '/api/manage/hours', { hours: overlap }), 400, 'overlapping ranges', 'hours_overlap');
  const spill = WEEK('10:00', '22:00');
  spill[1] = [{ open: '20:00', close: '11:00' }]; // Monday night into Tuesday 10:00
  const spillRes = await ownerA.put(A, '/api/manage/hours', { hours: spill });
  expectStatus(spillRes, 400, 'overnight range running into the next day', 'hours_overlap');
  expect(spillRes.json?.field === 'hours.2', 'error points at the day it runs into', spillRes.json);
  expectStatus(await ownerA.put(A, '/api/manage/hours', { hours: WEEK('25:00', '26:00') }), 400, 'impossible time', 'invalid');
  expectStatus(await ownerA.put(A, '/api/manage/hours', { hours: [[]] }), 400, 'not seven days', 'invalid');

  section('Team');
  const ahmad = await ownerA.post(A, '/api/manage/staff', { name_ar: 'أحمد', title_ar: 'حلاق أول' });
  expectStatus(ahmad, 201, 'add team member');
  const ahmadId = ahmad.json?.id;
  const khalid = await ownerA.post(A, '/api/manage/staff', { name_ar: 'خالد', custom_hours: true, hours: WEEK('12:00', '20:00') });
  expectStatus(khalid, 201, 'add member with own hours');
  const khalidId = khalid.json?.id;
  expect(khalid.json?.staff.find((s: any) => s.id === khalidId)?.hours?.[0]?.[0]?.open === '12:00', 'own hours returned');
  expectStatus(await ownerA.patch(A, `/api/manage/staff/${ahmadId}`, { custom_hours: true }), 400, 'own hours without the hours', 'required');
  expectStatus(await ownerA.patch(A, `/api/manage/staff/${khalidId}`, { custom_hours: false }), 200, 'back to salon hours');
  const bStaff = await ownerB.post(B, '/api/manage/staff', { name_ar: 'سامي' });
  expectStatus(await ownerA.patch(A, `/api/manage/staff/${bStaff.json?.id}`, { name_ar: 'x' }), 404, "cannot edit B's staff from A");

  section('Services');
  const cut = await ownerA.post(A, '/api/manage/services', { name_ar: 'قص شعر', duration_min: 30, price: '7.5' });
  expectStatus(cut, 201, 'add service');
  const cutId = cut.json?.id;
  const cutRow = cut.json?.services.find((s: any) => s.id === cutId);
  expect(cutRow?.price === '7.5' && cutRow.staff_ids.length === 2, 'new service offered by the whole team by default', cutRow);
  const beard = await ownerA.post(A, '/api/manage/services', { name_ar: 'ذقن', duration_min: 20, price: '5.250', staff_ids: [ahmadId] });
  expectStatus(beard, 201, 'add service for one barber (3-decimal JOD price)');
  const beardId = beard.json?.id;
  expectStatus(await ownerA.post(A, '/api/manage/services', { name_ar: 'x', duration_min: 30, price: '1.2345' }), 400, 'too many decimals for the currency', 'invalid');
  expectStatus(await ownerA.post(A, '/api/manage/services', { name_ar: 'x', duration_min: 3, price: '1' }), 400, 'duration below 5 minutes', 'invalid');
  expectStatus(await ownerA.post(A, '/api/manage/services', { name_ar: 'x', price: '1' }), 400, 'missing duration', 'required');
  expectStatus(await ownerA.patch(A, `/api/manage/services/${cutId}`, { staff_ids: [bStaff.json?.id] }), 400, "B's barber on A's service", 'invalid');
  const order = await ownerA.put(A, '/api/manage/services/order', { ids: [beardId, cutId] });
  expect(order.json?.services?.[0]?.id === beardId, 'reorder services', order.json?.services?.map((s: any) => s.id));
  const staffList = await ownerA.get(A, '/api/manage/staff');
  expect(staffList.json?.staff.find((s: any) => s.id === khalidId)?.service_ids.join() === String(cutId), 'links visible from the team side');
  expectStatus(await ownerA.patch(A, `/api/manage/services/${beardId}`, { active: false }), 200, 'hide a service');

  section('Service icons and ready menus');
  const withIcon = await ownerA.post(A, '/api/manage/services', { name_ar: 'حلاقة أطفال', duration_min: 20, price: '4', icon: '👦' });
  expectStatus(withIcon, 201, 'service with an emoji icon');
  expect(withIcon.json?.services.find((s: any) => s.id === withIcon.json.id)?.icon === '👦', 'icon saved');
  expectStatus(await ownerA.post(A, '/api/manage/services', { name_ar: 'x', duration_min: 20, price: '4', icon: '💩' }), 400, 'icon outside the set', 'invalid');
  const salonOptions = (await ownerA.get(A, '/api/manage/salon')).json?.options;
  expect(Array.isArray(salonOptions?.service_icons) && salonOptions.service_icons.includes('💇‍♀️'), 'the icon set is offered to the owner');
  const beforeBulk = (await ownerA.get(A, '/api/manage/services')).json.services.length;
  const bulk = await ownerA.post(A, '/api/manage/services/bulk', {
    services: [
      { name_ar: 'استشوار', name_en: 'Blow-dry', duration_min: 45, price: '8', icon: '✨' },
      { name_ar: 'صبغة', duration_min: 120, price: '30', price_is_from: true, icon: '🎨' },
      { name_ar: 'مانيكير', duration_min: 45, price: '6.500', icon: '💅' },
    ],
  });
  expectStatus(bulk, 201, 'add a ready menu in one go');
  const added = bulk.json?.services.slice(-3) ?? [];
  expect(bulk.json?.services.length === beforeBulk + 3 && added.every((s: any) => s.staff_ids.length === 2) && added[1]?.price_is_from === true, 'menu services added in order, offered by the whole team', added);
  const badBulk = await ownerA.post(A, '/api/manage/services/bulk', { services: [{ name_ar: 'أ', duration_min: 30, price: '5' }, { name_ar: 'ب', duration_min: 30, price: 'free' }] });
  expectStatus(badBulk, 400, 'one bad price rejects the whole menu', 'invalid');
  expect(badBulk.json?.field === 'services.1.price', 'error points at the item and field', badBulk.json);
  expect((await ownerA.get(A, '/api/manage/services')).json.services.length === beforeBulk + 3, 'nothing half-added');
  expectStatus(await ownerA.post(A, '/api/manage/services/bulk', { services: [] }), 400, 'empty menu', 'invalid');
  expectStatus(await ownerB.post(A, '/api/manage/services/bulk', { services: [{ name_ar: 'x', duration_min: 30, price: '5' }] }), 401, "B's session cannot add to A");

  section('Photos');
  const upload = await ownerA.upload(A, `/api/manage/staff/${ahmadId}/photo`, await portraitJpeg(1400, 900));
  expectStatus(upload, 200, 'upload a landscape photo');
  const withPhoto = upload.json?.staff.find((s: any) => s.id === ahmadId);
  expect(withPhoto?.photo_url && withPhoto.original_photo_url, 'styled and original photo urls', withPhoto);
  const photo = await anon.get(A, withPhoto?.photo_url);
  const photoMeta = photo.status === 200 ? await sharp(photo.body).metadata() : null;
  expect(photoMeta?.format === 'webp' && photoMeta.width === 800 && photoMeta.height === 1000, 'unified to an 800x1000 portrait', photoMeta && { f: photoMeta.format, w: photoMeta.width, h: photoMeta.height });
  expect(
    photo.headers['content-type'] === 'image/webp' &&
      photo.headers['x-content-type-options'] === 'nosniff' &&
      /sandbox/.test(String(photo.headers['content-security-policy'])),
    'media served with nosniff and a sandbox CSP',
    photo.headers,
  );
  expectStatus(await anon.get(B, withPhoto?.photo_url), 404, "A's photo is not served on B's host");
  expectStatus(await anon.get(A, `/media/${'-'.repeat(36)}`), 404, 'a media id that is not a uuid is simply not found', 'not_found');
  expectStatus(await ownerA.upload(A, `/api/manage/staff/${ahmadId}/photo`, Buffer.from('<?php echo 1; ?>')), 415, 'text posing as a JPEG', 'unsupported_image');
  const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('<script>alert(1)</script>')]);
  expectStatus(await ownerA.upload(A, `/api/manage/staff/${ahmadId}/photo`, fakePng, 'image/png'), 415, 'PNG header with junk after it', 'unsupported_image');
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  expectStatus(await ownerA.upload(A, `/api/manage/staff/${ahmadId}/photo`, svg, 'image/svg+xml'), 415, 'SVG refused', 'unsupported_image');
  const jpegAsPng = await ownerA.upload(A, `/api/manage/staff/${ahmadId}/photo`, await sharp({ create: { width: 500, height: 500, channels: 3, background: '#888' } }).png().toBuffer(), 'image/jpeg');
  expectStatus(jpegAsPng, 200, 'type is judged by bytes, not the header');
  const tiny = await sharp({ create: { width: 60, height: 60, channels: 3, background: '#888' } }).jpeg().toBuffer();
  expectStatus(await ownerA.upload(A, `/api/manage/staff/${ahmadId}/photo`, tiny), 422, 'too small for a portrait', 'image_too_small');
  const oldPhoto = (await ownerA.get(A, '/api/manage/staff')).json.staff.find((s: any) => s.id === ahmadId).photo_url;
  const restyled = await ownerA.patch(A, '/api/manage/salon', { photo_style: 'brand' });
  expectStatus(restyled, 200, 'switch the salon to the brand photo style');
  const newPhoto = (await ownerA.get(A, '/api/manage/staff')).json.staff.find((s: any) => s.id === ahmadId).photo_url;
  expect(newPhoto && newPhoto !== oldPhoto, 'team photos re-rendered in the new style');
  expectStatus(await anon.get(A, oldPhoto), 404, 'old rendering deleted');
  // Rendering happens outside any transaction; each photo is swapped in only if the
  // style it was drawn in is still the salon's.
  await ownerA.upload(A, `/api/manage/staff/${khalidId}/photo`, await portraitJpeg(800, 1100, '#557799'));
  const [warmed, monoed] = await Promise.all([ownerA.patch(A, '/api/manage/salon', { photo_style: 'warm' }), ownerA.patch(A, '/api/manage/salon', { photo_style: 'mono' })]);
  const look = (await ownerA.get(A, '/api/manage/salon')).json?.salon;
  const photographed = ((await ownerA.get(A, '/api/manage/staff')).json?.staff ?? []).filter((s: any) => s.photo_url);
  let inStyle = 0;
  for (const s of photographed) {
    const [styled, original] = await Promise.all([anon.get(A, s.photo_url), anon.get(A, s.original_photo_url)]);
    if ((await renderPortrait(original.body, look.photo_style, look.color_accent)).bytes.equals(styled.body)) inStyle++;
  }
  const leftOver = (await query<{ n: number }>(
    `select count(*)::int as n from media m where m.salon_id = $1
        and not exists (select 1 from staff s where m.id in (s.photo_id, s.photo_original_id))
        and not exists (select 1 from salons x where m.id in (x.logo_media_id, x.cover_media_id, x.icon_media_id))`,
    [created.json?.id],
  ))[0]?.n;
  expect(warmed.status === 200 && monoed.status === 200 && photographed.length === 2 && inStyle === 2 && leftOver === 0, 'two style changes at once: every photo ends in the style saved last, nothing left over', { style: look?.photo_style, photos: photographed.length, inStyle, leftOver });

  section('Public page');
  expectStatus(await ownerA.patch(A, `/api/manage/staff/${khalidId}`, { active: false }), 200, 'pause a team member');
  const pub = await anon.get(A, '/api/public/salon');
  expectStatus(pub, 200, 'public salon data needs no login');
  expect(!pub.json?.services.some((s: any) => s.id === beardId) && pub.json?.services.some((s: any) => s.id === cutId), 'hidden services left out', pub.json?.services?.map((s: any) => s.id));
  expect(pub.json?.services.every((s: any) => typeof s.icon === 'string'), 'public services carry their icon');
  expect(pub.json?.staff.length === 1 && pub.json.staff[0].id === ahmadId, 'paused members left out', pub.json?.staff);
  expect(pub.json?.services.find((s: any) => s.id === cutId)?.staff_ids.join() === String(ahmadId), "paused members left out of a service's team");
  expect(!('tenant_id' in (pub.json?.salon ?? {})), 'no internal fields in public data');

  section('Addresses and link previews');
  const someToken = 'x'.repeat(24);
  for (const path of ['/book', `/b/${someToken}`, '/admin', '/admin/login', '/admin/bookings']) {
    expectStatus(await anon.get(A, path), 200, `${path} opens the app`);
  }
  // One address per page: a trailing slash leads to it, query kept, never off this host.
  for (const [from, to] of [['/book/', '/book'], ['/admin/', '/admin'], ['/admin/bookings/', '/admin/bookings'], [`/b/${someToken}/`, `/b/${someToken}`], ['/privacy/?lang=en', '/privacy?lang=en'], ['/terms//', '/terms'], ['/.//evil.example/', '/evil.example']]) {
    const moved = await anon.get(A, from!);
    expect(moved.status === 301 && moved.headers.location === to, `${from} leads to ${to}`, { status: moved.status, location: moved.headers.location });
  }
  const bookingIndex = (await anon.get(A, `/b/${someToken}`)).body.toString('utf8');
  expect(bookingIndex.includes('content="noindex"') && !bookingIndex.includes('og:title'), "a customer's own booking stays out of search results and link previews");
  const oldOwner = await anon.get(A, '/manage');
  expect(oldOwner.status === 302 && oldOwner.headers.location === '/admin', "the owner's app moved from /manage to /admin", oldOwner.headers.location);
  const oldLogin = await anon.get(A, '/login');
  expect(oldLogin.status === 302 && oldLogin.headers.location === '/admin/login', 'owners sign in at /admin/login', oldLogin.headers.location);
  const missing = await anon.get(A, '/no-such-page', { Accept: 'text/html' });
  expect(missing.status === 404 && String(missing.headers['content-type']).startsWith('text/html') && missing.body.toString('utf8').includes('href="/"'), 'a mistyped address in a browser gets a page with the way home');
  expectStatus(await anon.get(A, '/no-such-page'), 404, 'other clients get JSON', 'not_found');
  const salonHtml = (await anon.get(A, '/')).body.toString('utf8');
  const og = (prop: string) => new RegExp(`<meta property="og:${prop}" content="([^"]*)">`).exec(salonHtml)?.[1];
  const shareUrl = og('image') ?? '';
  expect(og('title') === 'صالون أ' && og('url') === `http://${A}/` && shareUrl.startsWith(`http://${A}/share.jpg?v=`) && salonHtml.includes('<meta name="description"') && salonHtml.includes(`<link rel="canonical" href="http://${A}/">`), "a shared salon link shows the salon's name, a description and a picture", { title: og('title'), image: shareUrl });
  const ld = JSON.parse(/<script type="application\/ld\+json" nonce="[^"]+">(.*?)<\/script>/s.exec(salonHtml)?.[1] ?? 'null');
  expect(ld?.['@type'] === 'HealthAndBeautyBusiness' && ld.name === 'صالون أ' && ld.url === `http://${A}/` && ld.openingHoursSpecification?.length > 0, 'search engines get the salon as a local business with its opening hours', ld);
  const ldOf = (html: string) => JSON.parse(/<script type="application\/ld\+json" nonce="[^"]+">(.*?)<\/script>/s.exec(html)?.[1] ?? 'null');
  const hoursOf = (data: any, day: string) => (data?.openingHoursSpecification ?? []).filter((s: any) => s.dayOfWeek.endsWith(day)).map((s: any) => `${s.opens}-${s.closes}`).join(',');
  expect(hoursOf(ld, 'Sunday') === '10:00-14:00,16:00-02:00', 'a range past midnight closes at its real time (16:00–02:00), not 23:59', hoursOf(ld, 'Sunday'));
  const roundTheClock = WEEK('10:00', '14:00');
  roundTheClock[0] = [{ open: '00:00', close: '00:00' }];
  roundTheClock[1] = [{ open: '18:00', close: '00:00' }];
  await ownerA.put(A, '/api/manage/hours', { hours: roundTheClock });
  const clockLd = ldOf((await anon.get(A, '/')).body.toString('utf8'));
  expect(hoursOf(clockLd, 'Sunday') === '00:00-23:59' && hoursOf(clockLd, 'Monday') === '18:00-23:59', 'open all day reads 00:00–23:59, and closing at midnight 23:59', [hoursOf(clockLd, 'Sunday'), hoursOf(clockLd, 'Monday')]);
  await ownerA.put(A, '/api/manage/hours', { hours: split });
  // What a salon writes goes into the page as written: "$'" or "{{head}}" are not patterns.
  const tricky = `قص من 5$' و$& و$\` و$$ {{head}} {{splash}}`;
  await ownerA.patch(A, '/api/manage/salon', { about_ar: tricky, name_en: 'Salon $&$1 A' });
  const trickyHtml = (await anon.get(A, '/')).body.toString('utf8');
  const trickyLd = ldOf(trickyHtml);
  const escaped = tricky.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
  const times = (s: string) => trickyHtml.split(s).length - 1;
  expect(
    trickyLd?.description === tricky && trickyLd.alternateName === 'Salon $&$1 A' && trickyHtml.includes(`<meta name="description" content="${escaped}">`) &&
      trickyHtml.includes('<title>صالون أ</title>') && /<style nonce="[^"]+">:root\{/.test(trickyHtml) && trickyHtml.includes('<div id="app"><div class="boot splash">') &&
      times('<script type="module"') === 1 && times('</html>') === 1,
    "a salon's text with $ signs and {{…}} goes into the page exactly as written, and the page stays whole",
    { description: trickyLd?.description },
  );
  await ownerA.patch(A, '/api/manage/salon', { about_ar: '', name_en: 'Salon A' });
  const shareLink = new URL(shareUrl || 'http://x/');
  const share = await anon.get(A, shareLink.pathname + shareLink.search);
  const shareMeta = share.status === 200 ? await sharp(share.body).metadata() : null;
  expect(share.headers['content-type'] === 'image/jpeg' && shareMeta?.width === 1200 && shareMeta.height === 630, 'the shared-link picture is a 1200x630 JPEG', { status: share.status, size: shareMeta && `${shareMeta.width}x${shareMeta.height}` });
  const robots = async (host: string) => (await anon.get(host, '/robots.txt')).body.toString('utf8');
  const salonRobots = await robots(A);
  // The salon page and the landing page draw themselves from the API: crawlers may fetch those two calls.
  const fetchable = (txt: string) => txt.includes('Allow: /api/context\n') && txt.includes('Allow: /api/public/salon\n') && txt.includes('Disallow: /api/\n');
  expect(salonRobots.includes('Disallow: /b/') && fetchable(salonRobots) && !salonRobots.includes('Disallow: /admin'), "search engines skip customers' bookings and the rest of the API, but can render the salon page; /admin is left to its noindex", salonRobots);
  expect((await robots(PLATFORM)).includes('Disallow: /\n') && !(await robots(LANDING)).includes('Disallow: /\n') && fetchable(await robots(LANDING)), 'and the whole platform dashboard, but not the landing page');
  expect((await anon.get(A, '/api/public/salon')).headers['x-robots-tag'] === 'noindex', 'API answers are never search results themselves');
  const landing = await anon.get(LANDING, '/');
  const landingHtml = landing.body.toString('utf8');
  expect(landing.status === 200 && landingHtml.includes('data-site="landing"') && landingHtml.includes('og:title') && landingHtml.includes(`content="http://${LANDING}/share.jpg"`), 'the landing page, with its own link preview');
  const platformShare = await anon.get(LANDING, '/share.jpg');
  expect(platformShare.status === 200 && (await sharp(platformShare.body).metadata()).width === 1200, "the platform's own shared-link picture");
  // Owners who type the platform's /admin are looking for their own salon's dashboard.
  const door = await anon.get(LANDING, '/admin');
  const doorHtml = door.body.toString('utf8');
  const doorCsp = String(door.headers['content-security-policy']);
  expect(door.status === 200 && doorHtml.includes('<form method="get" action="/admin">') && doorHtml.includes('name="salon"') && doorHtml.includes('content="noindex"') && !doorHtml.includes(`admin.${DOMAIN}`) && !door.headers.location,
    "the landing page's /admin asks for the salon's link, and never leads to the platform's dashboard", { status: door.status, location: door.headers.location });
  expect(!doorCsp.includes('unsafe-inline') && doorCsp.includes(`form-action 'self' http://*.${DOMAIN}:${PORT}`) && !doorHtml.includes('<script'), 'a page with no scripts and a nonce for its style');
  expect(doorHtml.includes(SPARKLES) && !doorHtml.includes(SCISSORS) && doorHtml.includes("Your salon's dashboard · علامة تجربة</title>"), "the platform's mark, and a title in both languages");
  for (const typed of [subA, `${subA.toUpperCase()}.${DOMAIN}`, `http://${A}/admin`]) {
    const go = await anon.get(LANDING, `/admin?salon=${encodeURIComponent(typed)}`);
    expect(go.status === 302 && go.headers.location === `http://${A}/admin`, `"${typed}" leads to that salon's dashboard`, { status: go.status, location: go.headers.location });
  }
  const nobody = await anon.get(LANDING, '/admin?salon=nobody-here');
  const nobodyHtml = nobody.body.toString('utf8');
  expect(nobody.status === 404 && nobodyHtml.includes('value="nobody-here"') && nobodyHtml.includes('role="alert"') && nobodyHtml.includes('aria-invalid="true"'), 'a link nobody has: the form again, as typed, with the reason');
  expect((await anon.get(LANDING, '/login')).status === 200 && (await anon.get(LANDING, '/admin/login')).status === 200, '/login and /admin/login on the landing page show the same');
  const dashboardHtml = (await anon.get(PLATFORM, '/')).body.toString('utf8');
  expect(dashboardHtml.includes('data-site="admin"') && dashboardHtml.includes('content="noindex"'), 'the dashboard stays out of search results');
  expect(dashboardHtml.includes('data-title-ar="علامة تجربة · الإدارة" data-title-en="Test Brand · Admin"') && !(await anon.get(LANDING, '/')).body.toString('utf8').includes('data-title-'), "the dashboard's tab title in both languages (the landing page's already has both names)");
  const settings = await admin.get(PLATFORM, '/api/admin/platform');
  expect(settings.status === 200 && settings.json.contact_phone === '+962790001122' && settings.json.domain === DOMAIN, 'the admin sees the platform settings', settings.json);
  expectStatus(await admin.patch(PLATFORM, '/api/admin/platform', { contact_phone: '12' }), 400, 'the contact must be a phone number', 'invalid');
  const contact = await admin.patch(PLATFORM, '/api/admin/platform', { contact_phone: '0795551234' });
  expect(contact.json?.contact_phone === '+962795551234' && (await anon.get(LANDING, '/api/context')).json?.tenant.contact_phone === '+962795551234', 'a local number is stored in full, and the landing page uses it at once', contact.json);
  const doorBoth = (await anon.get(LANDING, '/admin')).body.toString('utf8');
  expect(doorBoth.includes('href="https://wa.me/962795551234"') && ['إلى لوحة صالوني', 'Open my dashboard', 'نسيت الرابط؟', 'Forgot it? WhatsApp us', 'مثل <bdi', 'For example <bdi'].every((s) => doorBoth.includes(s)),
    "the owners' /admin says its button, its WhatsApp link and its example in Arabic and in English");
  expectStatus(await anon.patch(PLATFORM, '/api/admin/platform', { contact_phone: '' }), 401, 'only the admin changes it');
  expectStatus(await ownerA.patch(A, '/api/admin/platform', { contact_phone: '' }), 404, "no platform settings on a salon's link", 'not_found');
  expectStatus(await anon.get(LANDING, '/api/admin/salons'), 404, 'nor any admin tools on the landing page', 'not_found');

  section('Privacy policy and terms');
  const privacyAr = await anon.get(LANDING, '/privacy');
  const pa = privacyAr.body.toString('utf8');
  expect(privacyAr.status === 200 && String(privacyAr.headers['content-type']).startsWith('text/html') && pa.includes('<html lang="ar" dir="rtl">') && pa.includes('<h1>سياسة الخصوصية</h1>') && pa.includes('علامة تجربة') && !pa.includes('noindex') && pa.includes(`<link rel="canonical" href="http://${LANDING}/privacy">`), 'the privacy policy on the landing page, in Arabic, for search engines');
  expect(pa.includes('href="https://wa.me/962795551234"') && String(privacyAr.headers['content-security-policy']).startsWith("default-src 'none'"), "with the platform's WhatsApp number, and no scripts at all");
  const termsEn = (await anon.get(LANDING, '/terms?lang=en')).body.toString('utf8');
  expect(termsEn.includes('<html lang="en" dir="ltr">') && termsEn.includes('<h1>Terms of use</h1>') && termsEn.includes('Test Brand') && termsEn.includes('href="/privacy?lang=en"'), 'the terms in English, linked to the English privacy policy');
  const salonPrivacy = (await anon.get(A, '/privacy')).body.toString('utf8');
  expect(salonPrivacy.includes('صالون أ') && salonPrivacy.includes('class="note"') && salonPrivacy.includes('content="noindex"') && salonPrivacy.includes(`<link rel="canonical" href="http://${LANDING}/privacy">`), "on a salon's link: the salon's name and colours, one address for search engines");
  expectStatus(await anon.get(PLATFORM, '/terms'), 200, 'on the dashboard too');
  await admin.patch(PLATFORM, '/api/admin/platform', { contact_phone: '' });
  const noContact = (await anon.get(LANDING, '/privacy')).body.toString('utf8');
  expect(!noContact.includes('wa.me') && noContact.includes('حقوقك') && !noContact.includes('{contact}'), 'without a contact number, the sentences pointing to it are left out');
  await admin.patch(PLATFORM, '/api/admin/platform', { contact_phone: '0795551234' });

  section('Seeding a brand');
  // The contact is public (landing page, legal pages, /api/context); the admin's phone is the dashboard's username.
  const seedDomain = `seed-${DOMAIN}`;
  const seed = (extra: Record<string, string> = {}) => new Promise<number>((resolve) => {
    const env = { ...process.env, NODE_ENV: 'production', SEED_DOMAIN: seedDomain, SEED_ADMIN_PHONE: '+962791230000', SEED_ADMIN_PASSWORD: 'seed-admin-pass-1', SEED_DEMO: 'false', SEED_CONTACT_PHONE: '', ...extra };
    spawn(process.execPath, ['--import', 'tsx', 'src/seed.ts'], { env, stdio: 'ignore' }).on('exit', (code) => resolve(code ?? 1));
  });
  const seededContact = async () => (await query<{ contact_phone: string }>('select contact_phone from tenants where domain = $1', [seedDomain]))[0]?.contact_phone;
  const dropSeeded = async () => {
    await query('delete from users where tenant_id in (select id from tenants where domain = $1)', [seedDomain]);
    await query('delete from tenants where domain = $1', [seedDomain]);
  };
  await dropSeeded();
  try {
    expect((await seed()) === 0 && (await seededContact()) === '', "a production seed does not publish the super admin's sign-in number");
    expect((await seed({ SEED_CONTACT_PHONE: '0795550101' })) === 0 && (await seededContact()) === '+962795550101', 'SEED_CONTACT_PHONE sets the contact, stored in full');
    await query("update tenants set contact_phone = '' where domain = $1", [seedDomain]);
    expect((await seed()) === 0 && (await seededContact()) === '', 'a contact the admin removed stays removed on the next seed');
  } finally {
    await dropSeeded();
  }

  section('Deleting');
  expectStatus(await ownerA.del(A, `/api/manage/services/${beardId}`), 200, 'delete a service');
  const photoOriginal = (await ownerA.get(A, '/api/manage/staff')).json.staff.find((s: any) => s.id === ahmadId).original_photo_url;
  expectStatus(await ownerA.del(A, `/api/manage/staff/${ahmadId}`), 200, 'delete a team member');
  expectStatus(await anon.get(A, photoOriginal), 404, "their photos are deleted too");
  expectStatus(await ownerA.del(A, `/api/manage/services/${beardId}`), 404, 'deleting twice');

  section('Passwords and sessions');
  const second = new Client();
  await second.login(A, phoneA, 'owner-a-pass');
  expectStatus(await ownerA.post(A, '/api/auth/password', { current: 'nope', next: 'new-pass-123' }), 400, 'wrong current password', 'wrong_password');
  expectStatus(await ownerA.post(A, '/api/auth/password', { current: 'owner-a-pass', next: 'new-pass-123' }), 200, 'change password');
  expectStatus(await second.get(A, '/api/manage/salon'), 401, 'other devices signed out');
  expectStatus(await ownerA.get(A, '/api/manage/salon'), 200, 'this device stays signed in');
  expectStatus(await ownerA.post(A, '/api/auth/logout'), 200, 'log out');
  expectStatus(await ownerA.get(A, '/api/manage/salon'), 401, 'logged out');

  section('Login rate limit');
  const target = new Client();
  for (let i = 0; i < 8; i++) await target.login(A, phoneA, `guess-${i}`);
  expectStatus(await target.login(A, phoneA, 'new-pass-123'), 429, 'locked after 8 failures, even with the right password', 'too_many_attempts');
  // The lock is on that address and that account: whoever guesses cannot lock the owner out.
  expectStatus(await fromAddress(new Client(), '10.7.0.1').login(A, phoneA, 'new-pass-123'), 200, 'the owner still signs in from their own address');
  // Guesses fired all at once are counted as each one starts, not when its slow password check fails.
  const burst = fromAddress(new Client(), '10.7.0.2');
  const volley = await Promise.all(Array.from({ length: 20 }, (_, i) => burst.login(A, '0790000777', `volley-${i}`)));
  const wrong = volley.filter((r) => r.status === 401).length;
  const refused = volley.filter((r) => r.status === 429 && r.json?.error === 'too_many_attempts').length;
  expect(wrong === 8 && refused === 12, '20 parallel guesses: 8 are checked, the rest refused', { wrong, refused });
  // Guessing the current password while signed in counts like guessing at the login.
  const guessing = { 'X-Forwarded-For': '10.7.0.3' };
  for (let i = 0; i < 8; i++) await ownerB.request(B, 'POST', '/api/auth/password', { json: { current: `guess-${i}`, next: 'owner-b-new-1' }, headers: guessing });
  expectStatus(await ownerB.request(B, 'POST', '/api/auth/password', { json: { current: 'owner-b-pass', next: 'owner-b-new-1' }, headers: guessing }), 429, 'changing the password: 8 wrong current passwords, then locked', 'too_many_attempts');
  expectStatus(await ownerB.request(B, 'POST', '/api/auth/password', { json: { current: 'nope', next: 'owner-b-new-1' }, headers: { 'X-Forwarded-For': '10.7.0.4' } }), 400, 'only from that address', 'wrong_password');
  // Guesses spread over many addresses meet the account's own limit (20 in all)...
  for (let a = 1; a <= 3; a++) {
    const spread = fromAddress(new Client(), `10.8.0.${a}`);
    for (let i = 0; i < 8; i++) await spread.login(A, phoneA, `spread-${a}-${i}`);
  }
  expectStatus(await fromAddress(new Client(), '10.8.0.9').login(A, phoneA, 'new-pass-123'), 429, 'guesses spread over many addresses: then the account is locked from anywhere', 'too_many_attempts');
  // ...but that does not lock out a browser that has signed in to it before: it holds
  // a mark only the password could earn (ownerA changed the password above).
  expect(/(?:^|; )dev=[\w-]{43}(?:;|$)/.test(ownerA.cookies.get(A) ?? ''), 'signing in (or changing the password) leaves a device mark', ownerA.cookies.get(A));
  const forged = fromAddress(new Client(), '10.8.0.10');
  forged.cookies.set(A, `dev=${'x'.repeat(43)}`);
  expectStatus(await forged.login(A, phoneA, 'new-pass-123'), 429, 'a made-up mark does not get past the lock', 'too_many_attempts');
  expectStatus(await ownerA.request(A, 'POST', '/api/auth/login', { json: { phone: phoneA, password: 'new-pass-123' }, headers: { 'X-Forwarded-For': '10.8.0.11' } }), 200, "the owner's own browser still signs in, from a new address too");
  // An IPv6 address counts by its /64: hopping to another address in it gives no fresh guesses.
  const v6 = (addr: string, password: string) => fromAddress(new Client(), addr).login(A, '0790000666', password);
  for (let i = 0; i < 8; i++) await v6('2001:db8:7:7::1', `v6-${i}`);
  expectStatus(await v6('2001:db8:7:7:ffff:1:2:3', 'v6-next'), 429, 'IPv6: another address in the same /64 is still locked', 'too_many_attempts');
  expectStatus(await v6('2001:db8:7:8::1', 'v6-other'), 401, 'another /64 is not', 'bad_credentials');

  section('Suspending a salon');
  expectStatus(await admin.patch(PLATFORM, `/api/admin/salons/${created.json?.id}`, { active: false }), 200, 'suspend salon A');
  expectStatus(await anon.get(A, '/api/public/salon'), 404, 'suspended salon is offline');
  expectStatus(await admin.patch(PLATFORM, `/api/admin/salons/${created.json?.id}`, { active: true }), 200, 'reactivate');
  expectStatus(await anon.get(A, '/api/public/salon'), 200, 'back online');
  const list = await admin.get(PLATFORM, '/api/admin/salons');
  expect(list.json?.salons.length === 2 && list.json.salons.every((s: any) => s.owners.length === 1), 'admin sees both salons with owners', list.json);

  section('Admin tools');
  const idA = created.json?.id as number;
  const rowA = list.json?.salons.find((s: any) => s.id === idA);
  expect(list.json?.series.length === 30 && list.json.totals.salons === 2 && list.json.totals.active === 2, 'platform totals and 30 days of new bookings', list.json?.totals);
  expect(typeof rowA?.stats.bookings_30d === 'number' && typeof rowA.setup.brand === 'boolean' && rowA.icon_url === `http://${A}/icons/icon-192.png`, 'each salon with its activity and setup progress', rowA);
  expect(!!rowA?.owners[0]?.last_seen_at, "when the owner last used the studio", rowA?.owners);
  const detail = await admin.get(PLATFORM, `/api/admin/salons/${idA}`);
  expect(detail.status === 200 && detail.json.salon.id === idA && detail.json.salon.old_links.length === 0, 'salon detail', detail.json);
  expectStatus(await admin.get(PLATFORM, '/api/admin/salons/999999999'), 404, 'unknown salon');
  expectStatus(await anon.get(PLATFORM, `/api/admin/salons/${idA}`), 401, 'detail needs the admin');

  const subA2 = `a2${run}`;
  const A2 = hostOf(subA2);
  expectStatus(await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { subdomain: subB }), 409, "another salon's link", 'subdomain_taken');
  expectStatus(await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { subdomain: 'www' }), 400, 'a reserved link', 'invalid');
  expectStatus(await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { name_ar: '' }), 400, 'a salon needs a name', 'invalid');
  const moved = await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { subdomain: subA2.toUpperCase(), name_ar: 'صالون أ الجديد' });
  expect(moved.status === 200 && moved.json.salon.subdomain === subA2 && moved.json.salon.name_ar === 'صالون أ الجديد' && moved.json.salon.old_links.includes(`http://${A}`), 'move to a new link and rename', moved.json?.salon);
  expectStatus(await anon.get(A2, '/api/public/salon'), 200, 'the new link works');
  const redirect = await anon.get(A, '/some/page?x=1');
  expect(redirect.status === 302 && redirect.headers.location === `http://${A2}/some/page?x=1` && redirect.headers['cache-control'] === 'no-store', 'the old link sends people to the same page on the new one', { status: redirect.status, location: redirect.headers.location });
  expectStatus(await anon.request(A, 'POST', '/api/public/bookings', { json: {} }), 404, 'writes to an old link are not redirected', 'not_found');
  const doorOld = await anon.get(LANDING, `/admin?salon=${subA}`);
  expect(doorOld.status === 302 && doorOld.headers.location === `http://${A2}/admin`, "an owner who types the salon's earlier link reaches its dashboard on the new one", doorOld.headers.location);
  expectStatus(await admin.post(PLATFORM, '/api/admin/salons', { subdomain: subA, name_ar: 'x', owner_phone: '0790001234', owner_password: 'whatever-123' }), 409, 'an old link is not given to another salon', 'subdomain_taken');
  const back = await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { subdomain: subA });
  expect(back.status === 200 && back.json.salon.subdomain === subA && back.json.salon.old_links.includes(`http://${A2}`) && !back.json.salon.old_links.includes(`http://${A}`), 'moving back to its own earlier link', back.json?.salon?.old_links);
  expectStatus(await anon.get(A, '/api/public/salon'), 200, 'the original link works again');

  await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { active: false });
  const page = await anon.get(A, '/');
  expect(page.status === 503 && page.body.toString().includes('صالون أ الجديد') && /no-store/.test(String(page.headers['cache-control'])), 'customers see a calm "unavailable" page while suspended', { status: page.status });
  expectStatus(await anon.get(A, '/api/public/salon'), 404, 'and the API is closed', 'suspended');
  // Every page a browser opens there says the same, not raw JSON: the shared /book link,
  // a customer's booking link from WhatsApp, the owner's installed app.
  for (const path of ['/book', `/b/${someToken}`, '/admin', '/admin/login']) {
    const r = await anon.get(A, path, { Accept: 'text/html' });
    expect(r.status === 503 && String(r.headers['content-type']).startsWith('text/html') && r.body.toString('utf8').includes('صالون أ الجديد') && r.headers['retry-after'] === '3600', `${path} in a browser: the same calm page`, { status: r.status, type: r.headers['content-type'] });
  }
  // Also when nothing says HTML (a link preview fetching the shared link) and for HEAD.
  const bare = await anon.get(A, `/b/${someToken}`, { Accept: '*/*' });
  const head = await anon.request(A, 'HEAD', '/book');
  expect(bare.status === 503 && String(bare.headers['content-type']).startsWith('text/html') && head.status === 503 && head.body.length === 0 && String(head.headers['content-type']).startsWith('text/html'), 'a page asked for without text/html, or with HEAD: the same calm page, not JSON', { bare: bare.status, head: head.status });
  expectStatus(await anon.get(A, '/api/public/salon', { Accept: 'text/html' }), 404, 'the API answers in JSON even when asked for HTML', 'suspended');
  const suspendedPolicy = await anon.get(A, '/privacy?lang=en');
  expect(suspendedPolicy.status === 302 && suspendedPolicy.headers.location === `http://${LANDING}/privacy?lang=en`, "the policies are read on the platform's own domain", suspendedPolicy.headers.location);
  expectStatus(await anon.get(A, '/icons/icon-192.png'), 404, 'icons and other files are simply gone', 'not_found');
  expectStatus(await anon.get(A2, '/'), 302, 'an old link still leads there');
  await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { active: true });

  const reset1 = await admin.post(PLATFORM, `/api/admin/salons/${idA}/reset-password`);
  const temp1 = reset1.json?.password as string;
  const readable = /^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/;
  expect(reset1.status === 200 && readable.test(temp1) && reset1.json.owner.phone.endsWith(phoneA.slice(1)), 'a readable temporary password for the owner', reset1.json);
  expectStatus(await new Client().login(A, phoneA, 'new-pass-123'), 401, 'the old password stops working', 'bad_credentials');
  const rescued = new Client();
  expectStatus(await rescued.login(A, phoneA, temp1), 200, 'the owner signs in with it, even after being locked out');
  expect((await rescued.get(A, '/api/context')).json?.user?.must_change_password === true, 'and is asked to choose their own');
  const temp2 = (await admin.post(PLATFORM, `/api/admin/salons/${idA}/reset-password`)).json?.password;
  expect(temp2 && temp2 !== temp1, 'every reset gives a different password');
  expectStatus(await rescued.get(A, '/api/manage/salon'), 401, 'a reset signs the owner out everywhere');
  await rescued.login(A, phoneA, temp2);
  expectStatus(await rescued.post(A, '/api/auth/password', { current: temp2, next: 'owner-a-final-1' }), 200, 'they pick their own');
  expect((await rescued.get(A, '/api/context')).json?.user?.must_change_password === false, 'no longer temporary');
  expectStatus(await anon.post(PLATFORM, `/api/admin/salons/${idA}/reset-password`), 401, 'only the admin can reset passwords');

  await bookingTests(admin, { B, ownerB });
}

/** Opens the owner's live event stream and collects what arrives. */
function openEvents(host: string, cookie: string) {
  const received: string[] = [];
  const req = http.request({ host: '127.0.0.1', port: PORT, path: '/api/manage/events', headers: { Host: host, Cookie: cookie } }, (res) => {
    res.setEncoding('utf8');
    res.on('data', (chunk: string) => received.push(chunk));
  });
  req.on('error', () => {});
  req.end();
  return {
    async waitFor(text: string, ms = 1500) {
      const until = Date.now() + ms;
      while (Date.now() < until) {
        if (received.join('').includes(text)) return true;
        await new Promise((r) => setTimeout(r, 50));
      }
      return false;
    },
    close: () => req.destroy(),
  };
}

async function bookingTests(admin: Client, other: { B: string; ownerB: Client }) {
  // A fresh salon open around the clock, so tomorrow's slots do not depend on the time the tests run.
  const sub = `k${run}`;
  const K = hostOf(sub);
  const ownerPhone = `07${String(Date.now() + 99).slice(-8)}`;
  const createdK = await admin.post(PLATFORM, '/api/admin/salons', { subdomain: sub, name_ar: 'صالون ك', owner_phone: ownerPhone, owner_password: 'owner-k-pass' });
  const owner = new Client();
  await owner.login(K, ownerPhone, 'owner-k-pass');
  const sami = (await owner.post(K, '/api/manage/staff', { name_ar: 'سامي' })).json?.id;
  const rami = (await owner.post(K, '/api/manage/staff', { name_ar: 'رامي' })).json?.id;
  const cut = (await owner.post(K, '/api/manage/services', { name_ar: 'قص', duration_min: 30, price: '5' })).json?.id;
  const color = (await owner.post(K, '/api/manage/services', { name_ar: 'صبغة', duration_min: 60, price: '1.500', staff_ids: [sami] })).json?.id;
  await owner.put(K, '/api/manage/hours', { hours: WEEK('00:00', '00:00') });

  section('Availability');
  // Each customer gets their own address so the per-address booking limit stays out of the way.
  let ip = 10;
  const customer = () => fromAddress(new Client(), `10.9.0.${ip++}`);
  const guest = customer();
  const days = await guest.get(K, `/api/public/days?service_id=${cut}`);
  expectStatus(days, 200, 'next two weeks');
  expect(days.json?.days.length === 14 && days.json.days[1].slots > 0, 'every day has slots when open around the clock', days.json?.days?.slice(0, 2));
  const tomorrow = days.json?.days[1].date as string;
  // A whole day is checked two days out: in the last half hour before midnight, the
  // booking lead time rightly keeps tomorrow's 00:00 off the list.
  const avail = await guest.get(K, `/api/public/availability?service_id=${cut}&date=${days.json?.days[2].date}`);
  const first = avail.json?.slots?.[0];
  expect(first?.time === '00:00' && first.staff.length === 2 && avail.json.slots.length === 96 - 1, '15-minute slots across the day, both barbers free', { first, n: avail.json?.slots?.length });
  const colourSlots = await guest.get(K, `/api/public/availability?service_id=${color}&date=${tomorrow}`);
  expect(colourSlots.json?.slots.every((s: any) => s.staff.join() === String(sami)), 'only the barber who does colour is offered');
  expectStatus(await guest.get(K, `/api/public/availability?service_id=${cut}&staff_id=${rami}&date=2020-01-01`), 400, 'dates in the past', 'invalid');
  const late = days.json?.days[13].date;
  expectStatus(await guest.get(K, `/api/public/availability?service_id=${cut}&date=${late}`), 200, 'two weeks ahead is fine');
  expectStatus(await guest.get(K, `/api/public/availability?service_id=${cut}&date=2099-01-01`), 400, 'beyond two weeks', 'invalid');
  expectStatus(await guest.get(K, `/api/public/availability?service_id=999999&date=${tomorrow}`), 404, 'unknown service', 'not_found');

  section('Booking without a deposit');
  const book = (c: Client, body: Record<string, unknown>) => c.post(K, '/api/public/bookings', { service_id: cut, date: tomorrow, time: 600, name: 'محمد', phone: '0791234567', ...body });
  const events = openEvents(K, owner.cookies.get(K)!);
  const b1 = await book(customer(), {});
  expectStatus(b1, 201, 'book 10:00 with anyone');
  expect(b1.json?.booking.status === 'confirmed' && b1.json.booking.start === '10:00' && b1.json.booking.end === '10:30' && b1.json.booking.deposit === '0', 'confirmed straight away', b1.json?.booking);
  expect(b1.json?.booking.customer.phone === '+962791234567' && b1.json.booking.salon.name_ar === 'صالون ك', 'phone normalised, salon details included');
  expect(await events.waitFor('event: booking'), 'owner sees it live (server-sent events)');
  events.close();
  const b2 = await book(customer(), { name: 'علي', phone: '0781111111' });
  expect(b2.status === 201 && b2.json.booking.staff.id !== b1.json.booking.staff.id, 'the same time goes to the other barber', b2.json);
  expectStatus(await book(customer(), { name: 'سعد', phone: '0772222222' }), 409, 'nobody left at 10:00', 'slot_taken');
  // Two people asking for "anyone" at the very same moment: each gets a barber.
  const [twinA, twinB] = await Promise.all([
    book(customer(), { time: 1320, name: 'منى', phone: '0791230001' }),
    book(customer(), { time: 1320, name: 'لينا', phone: '0791230002' }),
  ]);
  expect(twinA.status === 201 && twinB.status === 201 && twinA.json.booking.staff.id !== twinB.json.booking.staff.id, '"anyone" twice at the same moment: both booked, one barber each', [twinA.json, twinB.json]);
  // Someone else books with a number the salon knows, under another name.
  const sameNumber = await book(customer(), { time: 1380, name: 'أحمد', phone: '0781111111' });
  const b2Later = (await owner.get(K, `/api/manage/bookings?date=${tomorrow}`)).json?.bookings.find((b: any) => b.id === b2.json?.booking.id);
  const knownAs = async () => (await query<{ name: string }>(`select c.name from customers c join salons s on s.id = c.salon_id where s.subdomain = $1 and c.phone = '+962781111111'`, [sub]))[0]?.name;
  expect(sameNumber.status === 201 && sameNumber.json.booking.customer.name === 'أحمد' && b2Later?.customer.name === 'علي' && (await knownAs()) === 'علي', "a booking with a known number does not rename that customer's other bookings", { b2: b2Later?.customer, now: sameNumber.json?.booking?.customer });
  const byOwner = await owner.post(K, '/api/manage/bookings', { service_id: cut, date: tomorrow, time: 1410, name: 'علي سالم', phone: '0781111111' });
  const b2Again = (await owner.get(K, `/api/manage/bookings?date=${tomorrow}`)).json?.bookings.find((b: any) => b.id === b2.json?.booking.id);
  expect(byOwner.status === 201 && (await knownAs()) === 'علي سالم' && b2Again?.customer.name === 'علي', "the owner's own entry updates the customer, earlier bookings keep their names", { owner: byOwner.json?.booking?.customer, b2: b2Again?.customer });
  const after = await guest.get(K, `/api/public/availability?service_id=${cut}&date=${tomorrow}`);
  expect(!after.json?.slots.some((s: any) => s.min === 600) && after.json.slots.some((s: any) => s.min === 630), '10:00 is gone, 10:30 is still free');
  expect(!after.json?.slots.some((s: any) => s.min === 585), 'a 30-minute service cannot start at 9:45 either');
  expectStatus(await book(customer(), { time: 605, phone: '0773333333' }), 409, 'a time that is not a slot', 'slot_taken');
  expectStatus(await book(customer(), { name: '', phone: '0774444444' }), 400, 'name is required', 'invalid');
  expectStatus(await book(customer(), { time: 660, phone: '123' }), 400, 'bad phone', 'invalid');
  const view = await guest.get(K, `/api/public/bookings/${b1.json?.token}`);
  expect(view.status === 200 && view.json.booking.id === b1.json.booking.id, 'the private link shows the booking');
  expectStatus(await guest.get(other.B, `/api/public/bookings/${b1.json?.token}`), 404, "the link does not work on another salon's host");
  expectStatus(await guest.get(K, '/api/public/bookings/not-a-real-token-at-all-000'), 404, 'unknown link');
  const cancelled = await guest.post(K, `/api/public/bookings/${b1.json?.token}/cancel`);
  expect(cancelled.status === 200 && cancelled.json.booking.status === 'cancelled', 'the customer can cancel');
  expectStatus(await guest.post(K, `/api/public/bookings/${b1.json?.token}/cancel`), 409, 'cancelling twice', 'cannot_cancel');
  const back = await guest.get(K, `/api/public/availability?service_id=${cut}&date=${tomorrow}`);
  expect(back.json?.slots.some((s: any) => s.min === 600), 'a cancelled booking frees its slot');

  section('CliQ deposit');
  expectStatus(await owner.patch(K, '/api/manage/salon', { cliq_required: true }), 400, 'CliQ needs an alias first', 'required');
  const withCliq = await owner.patch(K, '/api/manage/salon', { cliq_required: true, cliq_alias: 'SALONK', cliq_name: 'صالون ك', deposit_kind: 'fixed', deposit_amount: '2' });
  expectStatus(withCliq, 200, 'turn on CliQ deposits');
  expect(withCliq.json?.salon.cliq_alias === 'SALONK' && withCliq.json.salon.deposit_amount === '2', 'settings saved', withCliq.json?.salon);
  const pub = await guest.get(K, '/api/public/salon');
  expect(pub.json?.salon.cliq_required === true && pub.json.salon.deposit_amount === '2', 'customers are told a deposit is needed');
  const d1 = await book(customer(), { time: 720, name: 'نور', phone: '0795555555' });
  const pending = d1.json?.booking;
  expect(d1.status === 201 && pending?.status === 'pending_payment' && pending.deposit === '2' && pending.expires_in_s > 1700 && pending.expires_in_s <= 1800, 'held for 30 minutes pending a 2 JD deposit', pending);
  expect(pending?.hold_s === 1800, "the hold's whole length comes with it (for the countdown ring)", pending?.hold_s);
  expect(pending?.salon.cliq_alias === 'SALONK' && pending.salon.cliq_name === 'صالون ك', 'the customer sees where to send it');
  const colourBooking = await book(customer(), { service_id: color, time: 900, name: 'هبة', phone: '0796666666' });
  expect(colourBooking.json?.booking.deposit === '1.5', 'the deposit never exceeds the price', colourBooking.json?.booking);
  const held = await guest.get(K, `/api/public/availability?service_id=${cut}&staff_id=${pending?.staff.id}&date=${tomorrow}`);
  expect(!held.json?.slots.some((s: any) => s.min === 720), 'a held slot is not offered to anyone else');
  // A long payment window on a visit that starts soon: the hold ends when the visit starts.
  // (The first time a customer can take is 30-45 minutes away; late at night, the next
  // midnight, up to an hour away.)
  await owner.patch(K, '/api/manage/salon', { payment_window_min: 120 });
  const soonDay = (await guest.get(K, `/api/public/days?service_id=${cut}`)).json?.days.find((d: any) => d.slots > 0)?.date;
  const soonSlot = (await guest.get(K, `/api/public/availability?service_id=${cut}&date=${soonDay}`)).json?.slots[0];
  const soon = await book(customer(), { date: soonDay, time: soonSlot?.min, name: 'سريع', phone: '0795550123' });
  const soonHold = (await query<{ gap: string }>('select extract(epoch from start_at - expires_at) as gap from bookings where id = $1', [soon.json?.booking.id]))[0];
  expect(soon.status === 201 && soon.json.booking.status === 'pending_payment' && Number(soonHold?.gap) === 0 && soon.json.booking.expires_in_s <= 60 * 60, 'a 2-hour payment window ends when a visit within the hour starts', { hold: soonHold, booking: soon.json?.booking });
  const soonB = soon.json?.booking;
  expect(soonB?.hold_s <= 60 * 60 && soonB.hold_s >= soonB.expires_in_s && soonB.hold_s - soonB.expires_in_s < 30, 'and its whole length says so, not the 2 hours', { hold_s: soonB?.hold_s, expires_in_s: soonB?.expires_in_s });
  await guest.post(K, `/api/public/bookings/${soon.json?.token}/cancel`);
  await owner.patch(K, '/api/manage/salon', { payment_window_min: 30 });

  section('Payment screenshot');
  const t1 = d1.json?.token;
  const receipt = await sharp({ create: { width: 390, height: 844, channels: 3, background: '#f4f4f4' } }).png().toBuffer();
  expectStatus(await guest.post(K, `/api/public/bookings/${t1}/sent`, { note: 'نور' }), 400, 'no "sent" without a screenshot', 'required');
  expectStatus(await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: Buffer.from('%PDF-1.4 not an image'), type: 'image/png' }), 415, 'a file that is not an image', 'unsupported_image');
  expectStatus(await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: receipt, type: 'text/plain' }), 415, 'a non-image content type', 'unsupported_image');
  const up = await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: receipt, type: 'image/png' });
  expect(up.status === 200 && up.json.booking.proof_url?.startsWith(`/api/public/bookings/${t1}/proof?v=`) && up.json.booking.status === 'payment_sent' && up.json.booking.expires_in_s === null, 'customer uploads the transfer screenshot: in time, it holds the booking for the owner to check', up.json);
  const mine = await guest.get(K, up.json?.booking.proof_url);
  expect(mine.status === 200 && mine.headers['content-type'] === 'image/webp' && /private/.test(String(mine.headers['cache-control'])), 'the customer can see their upload, re-encoded and privately cached', mine.headers);
  const sent = await guest.post(K, `/api/public/bookings/${t1}/sent`, { note: 'نور أحمد - بنك الإسكان' });
  expect(sent.status === 200 && sent.json.booking.status === 'payment_sent' && sent.json.booking.payment_note === 'نور أحمد - بنك الإسكان', 'customer says the transfer is sent');
  const twice = await guest.post(K, `/api/public/bookings/${t1}/sent`, { note: 'نور أحمد - بنك الإسكان' });
  expect(twice.status === 200 && twice.json.booking.status === 'payment_sent', 'saying it again only updates the note', twice.json);
  // The deadline passes between the upload (the slow request) and the "sent" after it.
  const race = await book(customer(), { time: 1050, name: 'دانة', phone: '0795550456' });
  const raceUp = await guest.request(K, 'PUT', `/api/public/bookings/${race.json?.token}/proof`, { raw: receipt, type: 'image/png' });
  await query(`update bookings set expires_at = now() - interval '1 second' where id = $1`, [race.json?.booking.id]);
  const lateSent = await guest.post(K, `/api/public/bookings/${race.json?.token}/sent`, { note: 'دانة' });
  expect(raceUp.status === 200 && lateSent.status === 200 && lateSent.json.booking.status === 'payment_sent' && lateSent.json.booking.payment_note === 'دانة', 'a receipt uploaded in time keeps the booking, even when "sent" arrives after the deadline', lateSent.json);
  const overview = await owner.get(K, '/api/manage/bookings/overview');
  const waitingRow = overview.json?.attention.find((b: any) => b.id === pending.id);
  expect(waitingRow?.status === 'payment_sent' && overview.json.counts[tomorrow] >= 3, 'the owner sees what needs checking and the day counts', overview.json);
  expect(overview.json?.attention.some((b: any) => b.id === race.json?.booking.id), 'including the payment whose "sent" came late');
  const order = (overview.json?.attention ?? []).map((b: any) => `${b.status} ${b.date} ${b.start}`);
  const lastSent = order.map((x: string) => x.startsWith('payment_sent')).lastIndexOf(true);
  const firstHold = order.findIndex((x: string) => x.startsWith('pending_payment'));
  const sentOnly = order.slice(0, lastSent + 1);
  expect(firstHold > lastSent && lastSent >= 1 && sentOnly.every((x: string, i: number) => i === 0 || sentOnly[i - 1]! <= x), 'transfers to check come first, soonest first, then unpaid holds', order);
  expect(waitingRow?.proof_url === `/api/manage/bookings/${pending.id}/proof?v=${up.json?.booking.proof_url.split('v=')[1]}`, 'with a link to the screenshot', waitingRow);
  const ownerView = await owner.get(K, waitingRow?.proof_url);
  expect(ownerView.status === 200 && ownerView.headers['content-type'] === 'image/webp' && ownerView.body.equals(mine.body), 'the owner opens the screenshot to review it');
  expectStatus(await guest.get(K, waitingRow?.proof_url), 401, 'the screenshot is not public');
  expectStatus(await other.ownerB.get(other.B, `/api/manage/bookings/${pending.id}/proof`), 404, "another salon's owner cannot see it");
  expectStatus(await guest.get(other.B, `/api/public/bookings/${t1}/proof`), 404, "nor through another salon's host");
  const tall = await sharp({ create: { width: 1179, height: 2556, channels: 3, background: '#e8f5e9' } }).jpeg().toBuffer();
  const replaced = await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: tall, type: 'image/jpeg' });
  const size = await sharp((await owner.get(K, `/api/manage/bookings/${pending.id}/proof`)).body).metadata();
  expect(replaced.status === 200 && replaced.json.booking.proof_url !== up.json?.booking.proof_url && size.height! > size.width! * 2, 'a wrong picture can be replaced while under review, tall screenshots stay tall', { url: replaced.json?.booking.proof_url, size: [size.width, size.height] });

  const confirmed = await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'confirmed' });
  expect(confirmed.status === 200 && confirmed.json.booking.status === 'confirmed', 'owner confirms the money arrived');
  expect((await guest.get(K, `/api/public/bookings/${d1.json?.token}`)).json?.booking.status === 'confirmed', 'the customer sees it confirmed');
  // Tomorrow's visit: a stray tap must not free its chair for someone else.
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'no_show' }), 409, "tomorrow's visit cannot be marked a no-show", 'bad_transition');
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'completed' }), 409, 'nor done', 'bad_transition');
  const stillHeld = await guest.get(K, `/api/public/availability?service_id=${cut}&staff_id=${pending.staff.id}&date=${tomorrow}`);
  expect(!stillHeld.json?.slots.some((s: any) => s.min === 720), 'so its time stays taken');
  // As if the day had come and gone.
  await query(`update bookings set start_at = start_at - interval '3 days', end_at = end_at - interval '3 days' where id = $1`, [pending.id]);
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'no_show' }), 200, 'a visit that has begun can be a no-show');
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'confirmed' }), 200, 'undo');
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'completed' }), 200, 'mark as done');
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'cancelled' }), 409, 'done bookings cannot be cancelled', 'bad_transition');
  // Someone who arrives early can be marked done up to an hour before their time.
  const soonFree = (await owner.get(K, `/api/manage/availability?service_id=${cut}&date=${soonDay}`)).json?.slots[0];
  const early = await owner.post(K, '/api/manage/bookings', { service_id: cut, date: soonDay, time: soonFree?.min, name: 'مبكر', phone: '0790000456' });
  expect(early.status === 201 && (await owner.patch(K, `/api/manage/bookings/${early.json.booking.id}`, { status: 'completed' })).status === 200, 'a visit starting within the hour can be marked done (an early arrival)', early.json);
  expectStatus(await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: receipt, type: 'image/png' }), 409, 'no new screenshot once decided', 'not_pending');

  section('Rejected payment');
  const r1 = await book(customer(), { time: 750, name: 'سلمى', phone: '0795550000' });
  await guest.request(K, 'PUT', `/api/public/bookings/${r1.json?.token}/proof`, { raw: receipt, type: 'image/png' });
  await guest.post(K, `/api/public/bookings/${r1.json?.token}/sent`, { note: 'سلمى' });
  const rejected = await owner.patch(K, `/api/manage/bookings/${r1.json?.booking.id}`, { status: 'cancelled' });
  expect(rejected.status === 200 && rejected.json.booking.status === 'cancelled' && rejected.json.booking.payment_rejected === true, 'the owner rejects a payment that did not arrive');
  const told = (await guest.get(K, `/api/public/bookings/${r1.json?.token}`)).json?.booking;
  expect(told?.status === 'cancelled' && told.payment_rejected === true, 'the customer is told the payment was not found', told);
  const freedAgain = await guest.get(K, `/api/public/availability?service_id=${cut}&staff_id=${r1.json?.booking.staff.id}&date=${tomorrow}`);
  expect(freedAgain.json?.slots.some((s: any) => s.min === 750), 'and the time is free again');
  await query(`update bookings set updated_at = now() - interval '8 days' where id = $1`, [r1.json?.booking.id]);
  const purged = await purgeProofs(pool);
  expect(purged >= 1 && (await owner.get(K, `/api/manage/bookings/${r1.json?.booking.id}/proof`)).status === 404, 'screenshots are deleted a week after the decision', { purged });
  expectStatus(await owner.get(K, `/api/manage/bookings/${pending.id}/proof`), 200, 'recent ones are kept');

  section('Payments nobody decided');
  // The race booking above is still waiting for the owner. Its visit came and went.
  const raceId = race.json?.booking.id;
  await query(`update bookings set start_at = start_at - interval '2 days', end_at = end_at - interval '2 days' where id = $1`, [raceId]);
  const stillThere = (await owner.get(K, '/api/manage/bookings/overview')).json?.attention.find((b: any) => b.id === raceId);
  expect(stillThere?.status === 'payment_sent' && stillThere.upcoming === false, 'a payment still to check stays in the list after the visit, until the owner decides', stillThere);
  expectStatus(await guest.request(K, 'PUT', `/api/public/bookings/${race.json?.token}/proof`, { raw: receipt, type: 'image/png' }), 409, 'no new screenshot once the visit has begun', 'not_pending');
  await query(`update bookings set start_at = start_at - interval '8 days', end_at = end_at - interval '8 days' where id = $1`, [raceId]);
  await purgeProofs(pool);
  const afterWeek = (await owner.get(K, '/api/manage/bookings/overview')).json?.attention.find((b: any) => b.id === raceId);
  expect((await owner.get(K, `/api/manage/bookings/${raceId}/proof`)).status === 404 && afterWeek?.proof_url === null, "a week after the visit its bank screenshot is deleted; the booking stays for the owner to settle", afterWeek);

  section('Holds that run out');
  const d2 = await book(customer(), { time: 780, name: 'ليث', phone: '0797777777' });
  await query(`update bookings set expires_at = now() - interval '1 minute' where id = $1`, [d2.json?.booking.id]);
  expect((await guest.get(K, `/api/public/bookings/${d2.json?.token}`)).json?.booking.status === 'expired', 'reads as expired the moment time is up');
  expectStatus(await guest.post(K, `/api/public/bookings/${d2.json?.token}/sent`, {}), 409, 'too late to say it was sent', 'not_pending');
  const freed = await guest.get(K, `/api/public/availability?service_id=${cut}&staff_id=${d2.json?.booking.staff.id}&date=${tomorrow}`);
  expect(freed.json?.slots.some((s: any) => s.min === 780), 'and the slot is free again');
  const rebook = await book(customer(), { time: 780, staff_id: d2.json?.booking.staff.id, name: 'زيد', phone: '0798888888' });
  expectStatus(rebook, 201, 'someone else can take it');
  expectStatus(await owner.patch(K, `/api/manage/bookings/${d2.json?.booking.id}`, { status: 'confirmed' }), 409, 'an expired hold cannot be confirmed', 'bad_transition');
  await owner.patch(K, '/api/manage/salon', { deposit_kind: 'full' });
  const full = await book(customer(), { time: 840, name: 'رنا', phone: '0799999991' });
  expect(full.json?.booking.deposit === '5', 'or the full price as deposit', full.json?.booking);

  section('Owner bookings');
  const manual = await owner.post(K, '/api/manage/bookings', { service_id: cut, staff_id: rami, date: tomorrow, time: 1200, name: 'زبون هاتفي', phone: '0790000123' });
  expect(manual.status === 201 && manual.json.booking.status === 'confirmed' && manual.json.booking.deposit === '0' && manual.json.booking.source === 'owner', 'owner books a phone customer, no deposit', manual.json);
  const day = await owner.get(K, `/api/manage/bookings?date=${tomorrow}`);
  expect(day.status === 200 && day.json.bookings.length >= 6 && day.json.bookings.every((b: any, i: number, a: any[]) => i === 0 || a[i - 1].start <= b.start), "the day's bookings, in time order", day.json?.bookings?.map((b: any) => b.start));
  expect(!day.json?.bookings.some((b: any) => b.status === 'expired'), 'expired holds stay off the schedule');
  expectStatus(await other.ownerB.patch(other.B, `/api/manage/bookings/${manual.json?.booking.id}`, { status: 'cancelled' }), 404, "another salon's owner cannot touch it");
  expectStatus(await guest.get(K, `/api/manage/bookings?date=${tomorrow}`), 401, 'the schedule needs the owner');
  expectStatus(await owner.del(K, `/api/manage/staff/${rami}`), 409, 'a barber with bookings cannot be deleted (pause instead)', 'in_use');
  // "Arrived" is tapped as the visit starts: the customer sits in the chair until it
  // ends, so that time is not offered to anyone else, and Undo can bring it back.
  // (A salon of its own, open around the clock, with one barber and an hour's service.)
  const m = await smallSalon(admin, 'm', WEEK('00:00', '00:00'), 60);
  const mToday = (await guest.get(m.host, `/api/public/days?service_id=${m.serviceId}`)).json?.today as string;
  const ownerFirst = async (date: string) => (await m.owner.get(m.host, `/api/manage/availability?service_id=${m.serviceId}&date=${date}`)).json?.slots?.[0];
  let visitDate = mToday;
  let visitAt = await ownerFirst(visitDate);
  // Too late tonight for an hour's visit: the first is at midnight, still within the hour.
  if (!visitAt) {
    visitDate = addDays(mToday, 1);
    visitAt = await ownerFirst(visitDate);
  }
  const visitStart = visitAt?.min as number;
  const visit = await m.owner.post(m.host, '/api/manage/bookings', { service_id: m.serviceId, date: visitDate, time: visitStart, name: 'حاضر', phone: '0790000789' });
  const arrived = await m.owner.patch(m.host, `/api/manage/bookings/${visit.json?.booking.id}`, { status: 'completed' });
  expect(visit.status === 201 && arrived.status === 200 && arrived.json.booking.status === 'completed', 'the owner marks a visit starting now as arrived', arrived.json ?? visit.json);
  const during = await guest.get(m.host, `/api/public/availability?service_id=${m.serviceId}&staff_id=${m.staffId}&date=${visitDate}`);
  expect(during.status === 200 && !during.json.slots.some((s: any) => s.min < visitStart + 60 && s.min + 60 > visitStart),
    'the chair stays taken until the visit ends', { start: visitStart, slots: during.json?.slots?.slice(0, 3).map((s: any) => s.time) });
  expectStatus(await customer().post(m.host, '/api/public/bookings', { service_id: m.serviceId, date: visitDate, time: visitStart + 30, name: 'متأخر', phone: '0790000790' }), 409, 'nobody can book into it', 'slot_taken');
  const undone = await m.owner.patch(m.host, `/api/manage/bookings/${visit.json?.booking.id}`, { status: 'confirmed' });
  expect(undone.status === 200 && undone.json.booking.status === 'confirmed', 'and Undo brings the visit back', undone.json);
  // A no-show frees the chair; a walk-in seated in it and marked done keeps it. Undo
  // on the no-show must not put the first visit back on top of the walk-in.
  const visitId = visit.json?.booking.id;
  await query(`update bookings set start_at = now() - interval '10 minutes', end_at = now() + interval '50 minutes' where id = $1`, [visitId]);
  expectStatus(await m.owner.patch(m.host, `/api/manage/bookings/${visitId}`, { status: 'no_show' }), 200, 'the visit, begun, is marked a no-show');
  const walkAt = await ownerFirst(visitDate);
  const walkIn = await m.owner.post(m.host, '/api/manage/bookings', { service_id: m.serviceId, date: visitDate, time: walkAt?.min, name: 'عابر', phone: '0790000791' });
  const walkDone = await m.owner.patch(m.host, `/api/manage/bookings/${walkIn.json?.booking.id}`, { status: 'completed' });
  expect(walkIn.status === 201 && walkDone.status === 200, 'a walk-in takes the freed chair and is marked done', walkDone.json ?? walkIn.json);
  // The no-show's own time, which the walk-in now sits in.
  await query(`update bookings v set start_at = w.start_at - interval '15 minutes', end_at = w.end_at - interval '15 minutes' from bookings w where v.id = $1 and w.id = $2`, [visitId, walkIn.json?.booking.id]);
  expectStatus(await m.owner.patch(m.host, `/api/manage/bookings/${visitId}`, { status: 'confirmed' }), 409, 'Undo on the no-show would double-book the chair', 'slot_taken');
  // "Anyone" goes to whoever has the least that day, counting visits already done.
  const second = (await m.owner.post(m.host, '/api/manage/staff', { name_ar: 'سامر' })).json?.id as number;
  const loadDay = addDays(mToday, 3);
  const doneEarlier = await m.owner.post(m.host, '/api/manage/bookings', { service_id: m.serviceId, staff_id: m.staffId, date: loadDay, time: 600, name: 'صباحي', phone: '0790000792' });
  await query(`update bookings set status = 'completed' where id = $1`, [doneEarlier.json?.booking.id]);
  const anyone = await m.owner.post(m.host, '/api/manage/bookings', { service_id: m.serviceId, date: loadDay, time: 840, name: 'أي حلاق', phone: '0790000793' });
  expect(anyone.status === 201 && anyone.json.booking.staff.id === second, '"anyone" goes to the barber who has not worked yet, not the one whose visits are done', { anyone: anyone.json?.booking?.staff, first: m.staffId, second });

  await lateNightTests(admin, customer);
  await clockChangeTests(admin);

  await tryonTests(K, owner, customer, { cut, tomorrow });

  section('Booking limits');
  const busy = customer();
  const same = { phone: '0791112233', name: 'تجربة' };
  for (const time of [60, 120, 180]) await book(busy, { ...same, time });
  expectStatus(await book(busy, { ...same, time: 240 }), 429, 'a fourth upcoming booking for one phone', 'too_many_bookings');
  const spam = customer();
  for (let i = 0; i < 10; i++) await book(spam, { time: 300 + i * 15, phone: `07900${String(i).padStart(5, '0')}` });
  expectStatus(await book(spam, { time: 480, phone: '0790099999' }), 429, 'too many bookings from one address', 'too_many_bookings');
  await owner.patch(K, '/api/manage/salon', { booking_enabled: false });
  expectStatus(await guest.get(K, `/api/public/availability?service_id=${cut}&date=${tomorrow}`), 403, 'online booking switched off', 'booking_closed');
  expect(createdK.status === 201, 'booking salon was created');
}

/** The AI mirror: the owner's switch, the catalogue, the picture, its limits, and the look booked. */
async function tryonTests(K: string, owner: Client, customer: () => Client, { cut, tomorrow }: { cut: number; tomorrow: string }) {
  section('AI mirror');
  const guest = customer();
  const tryOn = (c: Client, q: string, body: Buffer, type = 'image/jpeg') => c.request(K, 'POST', `/api/public/tryon?${q}`, { raw: body, type });
  const selfie = await portraitJpeg(600, 800);
  expectStatus(await guest.get(K, '/api/public/tryon/styles'), 404, 'off until the owner turns it on', 'not_found');
  expectStatus(await tryOn(guest, 'style=skin_fade', selfie), 404, 'no pictures while it is off', 'not_found');
  expect((await guest.get(K, '/api/public/salon')).json?.salon?.tryon === null, 'the salon page does not offer it');
  expect((await owner.get(K, '/api/manage/salon')).json?.options?.tryon_available === true, 'the owner is told the platform can draw');
  expectStatus(await owner.patch(K, '/api/manage/salon', { tryon: 'sideways' }), 400, 'an unknown setting', 'invalid');
  const on = await owner.patch(K, '/api/manage/salon', { tryon: 'men' });
  expect(on.status === 200 && on.json?.salon?.tryon === 'men', "the owner offers men's cuts", on.json?.salon?.tryon);
  expect((await guest.get(K, '/api/public/salon')).json?.salon?.tryon === 'men', 'the salon page offers the mirror');
  const styles = await guest.get(K, '/api/public/tryon/styles');
  expect(styles.status === 200 && styles.json.audience === 'men' && styles.json.styles.length > 0 && styles.json.styles.every((x: any) => x.audience === 'men'), "only men's cuts in the catalogue", styles.json);
  expect(styles.json?.shades?.some((x: any) => x.id === 'black' && x.men) && styles.json.shades.some((x: any) => x.id === 'honey' && !x.men), 'colours say which suit the men\'s cuts');
  expectStatus(await tryOn(guest, 'style=bob', selfie), 400, "a women's cut when only men's are offered", 'invalid');
  expectStatus(await tryOn(guest, 'style=nope', selfie), 400, 'an unknown cut', 'invalid');
  expectStatus(await tryOn(guest, 'style=skin_fade&shade=honey', selfie), 400, "a colour the men's cuts do not offer", 'invalid');
  expectStatus(await tryOn(guest, 'style=skin_fade&shade=nope', selfie), 400, 'an unknown colour', 'invalid');
  expectStatus(await tryOn(guest, 'style=skin_fade', Buffer.from('hello'), 'text/plain'), 415, 'not an image type', 'unsupported_image');
  expectStatus(await tryOn(guest, 'style=skin_fade', Buffer.from('definitely not a jpeg at all')), 415, 'bytes that are not a picture', 'unsupported_image');
  expectStatus(await tryOn(guest, 'style=skin_fade', await portraitJpeg(120, 160)), 422, 'a photo too small to draw on', 'image_too_small');
  const drawn = await tryOn(guest, 'style=skin_fade&shade=black', selfie);
  const meta = drawn.status === 200 ? await sharp(drawn.body).metadata() : null;
  expect(drawn.status === 200 && drawn.headers['content-type'] === 'image/jpeg' && meta?.format === 'jpeg' && meta.width === 600 && meta.height === 800, 'the look comes back as a plain JPEG, same shape', { status: drawn.status, meta: meta && { format: meta.format, w: meta.width, h: meta.height }, body: drawn.json });
  expect(drawn.headers['cache-control'] === 'no-store' && String(drawn.headers['content-security-policy']).includes('sandbox'), 'never cached, and sandboxed if opened on its own');
  const big = await tryOn(guest, 'style=crop', await portraitJpeg(2400, 3200));
  const bigMeta = big.status === 200 ? await sharp(big.body).metadata() : null;
  expect(big.status === 200 && Math.max(bigMeta?.width ?? 0, bigMeta?.height ?? 0) <= 1024, 'a large photo comes back at most 1024 pixels', bigMeta && { w: bigMeta.width, h: bigMeta.height });
  expectStatus(await tryOn(guest, 'style=buzz', selfie), 200, 'a third try');
  expectStatus(await tryOn(guest, 'style=buzz', selfie), 429, 'too many tries from one address', 'too_many_attempts');
  expectStatus(await tryOn(customer(), 'style=buzz', selfie, 'image/png'), 200, 'another customer can still try (a JPEG sent as PNG is read by its bytes)');

  // The look tried rides along with the booking.
  const book = (c: Client, body: Record<string, unknown>) => c.post(K, '/api/public/bookings', { service_id: cut, date: tomorrow, ...body });
  const withLook = await book(customer(), { time: 900, name: 'زيد', phone: '0795550001', look: 'skin_fade:black' });
  expect(withLook.status === 201 && withLook.json.booking.look?.style === 'skin_fade' && withLook.json.booking.look.name_en === 'Skin fade' && withLook.json.booking.look.shade?.id === 'black', 'a booking keeps the cut and colour tried', withLook.json);
  const seen = (await owner.get(K, `/api/manage/bookings?date=${tomorrow}`)).json?.bookings.find((b: any) => b.id === withLook.json?.booking.id);
  expect(seen?.look?.id === 'skin_fade:black' && seen.look.shade?.hex, 'the owner sees the requested cut', seen?.look);
  const plain = await book(customer(), { time: 930, name: 'باسل', phone: '0795550002' });
  expect(plain.status === 201 && plain.json.booking.look === null, 'a booking without one has none');
  expectStatus(await book(customer(), { time: 960, name: 'هاني', phone: '0795550003', look: 'skin_fade:honey' }), 400, "a men's cut with a colour it does not offer", 'invalid');
  expectStatus(await book(customer(), { time: 960, name: 'هاني', phone: '0795550003', look: "x'; drop table bookings;--" }), 400, 'a look that is not in the catalogue', 'invalid');
  expectStatus(await book(customer(), { time: 960, name: 'هاني', phone: '0795550003', look: 42 }), 400, 'a look that is not text', 'invalid');
  const both = await owner.patch(K, '/api/manage/salon', { tryon: 'all' });
  const all = await guest.get(K, '/api/public/tryon/styles');
  expect(both.status === 200 && all.json?.styles.some((x: any) => x.audience === 'women') && all.json.styles.some((x: any) => x.audience === 'men'), 'both menus when the owner offers all');
  await owner.patch(K, '/api/manage/salon', { tryon: 'off' });
  expectStatus(await guest.get(K, '/api/public/tryon/styles'), 404, 'off again', 'not_found');
}

/** A new salon with one barber and a 30- (or other) minute service, open on `week`. */
async function smallSalon(admin: Client, prefix: string, week: { open: string; close: string }[][], durationMin = 30) {
  const sub = `${prefix}${run}`;
  const host = hostOf(sub);
  const phone = `07${String(Date.now() + prefix.charCodeAt(0)).slice(-8)}`;
  await admin.post(PLATFORM, '/api/admin/salons', { subdomain: sub, name_ar: `صالون ${prefix}`, owner_phone: phone, owner_password: `owner-${prefix}-pass` });
  const owner = new Client();
  await owner.login(host, phone, `owner-${prefix}-pass`);
  const staffId = (await owner.post(host, '/api/manage/staff', { name_ar: 'باسل' })).json?.id as number;
  const serviceId = (await owner.post(host, '/api/manage/services', { name_ar: 'قص', duration_min: durationMin, price: '5' })).json?.id as number;
  await owner.put(host, '/api/manage/hours', { hours: week });
  return { sub, host, owner, staffId, serviceId };
}

/** Bookings for the rest of a late opening, once the clock has passed midnight. */
async function lateNightTests(admin: Client, customer: () => Client) {
  section('After midnight');
  // A time zone where it is just past midnight right now, so "now" is real and not faked
  // (one the database knows too: Node also lists old names some tz databases leave out).
  const known = new Set((await query<{ name: string }>('select name from pg_timezone_names')).map((r) => r.name));
  const zone = Intl.supportedValuesOf('timeZone').filter((z) => known.has(z)).find((z) => {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: z, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
    return hour === 0 || hour === 1;
  });
  const n = await smallSalon(admin, 'n', WEEK('18:00', '04:00'));
  const moved = await n.owner.patch(n.host, '/api/manage/salon', { timezone: zone });
  expect(!!zone && moved.status === 200, `a salon open 18:00–04:00 in ${zone}, where it is past midnight now`, moved.json);
  const guest = customer();
  const days = await guest.get(n.host, `/api/public/days?service_id=${n.serviceId}`);
  const today = days.json?.today as string;
  const night = days.json?.days[0];
  expect(days.status === 200 && night?.date === addDays(today, -1) && night.slots > 0 && night.late_night === true && days.json.days[1].date === today,
    'the days start with what is left of last night, marked as such', days.json?.days?.slice(0, 2));
  // Still fourteen chips (two even rows): the last day ahead gives way, but can be booked.
  expect(days.json?.days.length === 14 && days.json.days[13].date === addDays(today, 12), 'the strip keeps its fourteen days', days.json?.days?.map((d: any) => d.date));
  expectStatus(await guest.get(n.host, `/api/public/availability?service_id=${n.serviceId}&date=${addDays(today, 13)}`), 200, 'the day it left out is still open for booking');
  const tail = await guest.get(n.host, `/api/public/availability?service_id=${n.serviceId}&date=${night?.date}`);
  expect(tail.status === 200 && tail.json.slots.length > 0 && tail.json.slots.every((s: any) => s.next_day && s.min >= 1440 && s.min + 30 <= 1680),
    'only its times after midnight, up to closing', { status: tail.status, slots: tail.json?.slots?.map((s: any) => s.time) });
  const first = tail.json?.slots?.[0];
  const late = await guest.post(n.host, '/api/public/bookings', { service_id: n.serviceId, date: night?.date, time: first?.min, name: 'سهران', phone: '0791239876' });
  expect(late.status === 201 && late.json.booking.date === today && late.json.booking.start === clock(first?.min ?? 0),
    "a customer books tonight's time; it reads as today's date", late.json);
  const ownerSlots = await n.owner.get(n.host, `/api/manage/availability?service_id=${n.serviceId}&date=${night?.date}`);
  const walkInAt = ownerSlots.json?.slots?.[0];
  const walkIn = await n.owner.post(n.host, '/api/manage/bookings', { service_id: n.serviceId, date: night?.date, time: walkInAt?.min, name: 'زبون ليلي', phone: '0791239875' });
  expect(ownerSlots.status === 200 && walkIn.status === 201 && walkIn.json.booking.date === today, 'the owner records a walk-in in the same late hours', walkIn.json ?? ownerSlots.json);
  expectStatus(await guest.get(n.host, `/api/public/availability?service_id=${n.serviceId}&date=${addDays(today, -2)}`), 400, 'the night before last is gone', 'invalid');
  expectStatus(await n.owner.post(n.host, '/api/manage/bookings', { service_id: n.serviceId, date: addDays(today, -2), time: 1500, name: 'قديم', phone: '0791239874' }), 400, 'for the owner too', 'invalid');
}

/** Salons where clocks change: slots are real instants, and every one offered can be booked. */
async function clockChangeTests(admin: Client) {
  section('Clock changes');
  const d = await smallSalon(admin, 'd', WEEK('20:00', '04:00'), 60);
  await d.owner.patch(d.host, '/api/manage/salon', { timezone: 'Europe/Berlin' });
  const salon = (await query<Salon>('select * from salons where subdomain = $1', [d.sub]))[0]!;
  // The Saturday before the last Sunday of March (clocks go forward at 02:00) and of
  // October (back at 03:00), whichever come next.
  const saturdayBefore = (month: number) => {
    const soon = addDays(new Date().toISOString().slice(0, 10), 2);
    for (let y = new Date().getUTCFullYear(); ; y++) {
      const last = new Date(Date.UTC(y, month, 0));
      const sunday = addDays(last.toISOString().slice(0, 10), -last.getUTCDay());
      if (addDays(sunday, -1) > soon) return addDays(sunday, -1);
    }
  };
  const slotsOn = async (date: string) => (await availability(pool, salon, { serviceId: d.serviceId, staffId: null, date, lead: 0 })).slots.map((s) => s.min);
  const bookAt = (date: string, min: number) =>
    tx((db) => createBooking(db, salon, { serviceId: d.serviceId, staffId: null, date, min, name: 'ساعة', phone: `+96279${String(min).padStart(7, '0')}`, source: 'owner', lead: 0 }));
  const tryAt = async (date: string, min: number) => {
    // Books in a transaction that is then undone: does the database accept this slot?
    const undo = new Error('undo');
    try {
      await tx(async (db) => {
        await createBooking(db, salon, { serviceId: d.serviceId, staffId: null, date, min, name: 'تجربة', phone: '+962790001111', source: 'owner', lead: 0 });
        throw undo;
      });
    } catch (err) {
      return err === undo ? 'ok' : (err as { code?: string }).code ?? String(err);
    }
    return 'kept';
  };
  const allBookable = async (date: string) => {
    const failed: string[] = [];
    for (const min of await slotsOn(date)) {
      const r = await tryAt(date, min);
      if (r !== 'ok') failed.push(`${clock(min)} ${r}`);
    }
    return failed;
  };

  const spring = saturdayBefore(3);
  const before = await slotsOn(spring);
  expect([1560, 1575, 1590, 1605].every((m) => !before.includes(m)) && before.includes(1545) && before.includes(1620),
    `${spring}, clocks go forward: 02:00–02:59 do not exist and are not offered`, before.filter((m) => m >= 1500).map(clock));
  const at3 = await bookAt(spring, 1620);
  const springAfter = await slotsOn(spring);
  const shown = (await query<{ start: string }>(`select to_char(start_at at time zone 'Europe/Berlin', 'HH24:MI') as start from bookings where id = $1`, [at3.id]))[0]?.start;
  expect(shown === '03:00' && !springAfter.includes(1545) && springAfter.includes(1500),
    'with 03:00 booked, 01:45 (an hour later is 03:45) is taken; 01:00 still fits', { shown, slots: springAfter.filter((m) => m >= 1440).map(clock) });
  const springBad = await allBookable(spring);
  expect(springBad.length === 0, 'every time offered that night can really be booked', springBad);

  const autumn = saturdayBefore(10);
  await bookAt(autumn, 1530); // 01:30 summer time, for an hour: until the first 02:30
  const autumnSlots = await slotsOn(autumn);
  expect(autumnSlots.includes(1560) && !autumnSlots.includes(1500) && autumnSlots.includes(1470),
    `${autumn}, clocks go back: the second 02:00 is free after a booking that ends at the first 02:30`, autumnSlots.filter((m) => m >= 1440).map(clock));
  const autumnBad = await allBookable(autumn);
  expect(autumnBad.length === 0, 'and every time offered can really be booked', autumnBad);
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
