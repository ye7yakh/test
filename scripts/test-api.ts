// API harness: starts its own api on a spare port against the local Postgres, sets
// up a throwaway tenant ("test.localhost"), exercises the owner setup flow and the
// security edges (tenant isolation, CSRF, uploads, rate limits), then cleans up.
//
//   npm run migrate && npm run test:api
import { spawn } from 'node:child_process';
import http from 'node:http';
import sharp from 'sharp';
import { hashPassword } from '../src/auth.js';
import { purgeProofs } from '../src/booking.js';
import { dayBase, nightBase } from '../src/colors.js';
import { pool, query } from '../src/db.js';

const PORT = Number(process.env.TEST_PORT ?? 3457);
const DOMAIN = 'test.localhost';
const PLATFORM = `${DOMAIN}:${PORT}`;
const run = Date.now().toString(36).slice(-5);
const hostOf = (sub: string) => `${sub}.${DOMAIN}:${PORT}`;

// ---------------------------------------------------------------- tiny client

interface Res {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
  json: any;
}

class Client {
  cookies = new Map<string, string>(); // host -> "sid=..."

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
          const set = res.headers['set-cookie']?.[0];
          if (set) {
            const pair = set.split(';')[0]!;
            if (pair === 'sid=') this.cookies.delete(host);
            else this.cookies.set(host, pair);
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

  get = (host: string, path: string) => this.request(host, 'GET', path);
  post = (host: string, path: string, json?: unknown) => this.request(host, 'POST', path, { json: json ?? {} });
  patch = (host: string, path: string, json: unknown) => this.request(host, 'PATCH', path, { json });
  put = (host: string, path: string, json: unknown) => this.request(host, 'PUT', path, { json });
  del = (host: string, path: string) => this.request(host, 'DELETE', path);
  upload = (host: string, path: string, raw: Buffer, type = 'image/jpeg') => this.request(host, 'PUT', path, { raw, type });
  login = (host: string, phone: string, password: string) => this.post(host, '/api/auth/login', { phone, password });
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
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development', TRUST_PROXY: 'true' },
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
    `insert into tenants (domain, name, default_calling_code, default_timezone, default_currency)
     values ($1, 'Test Brand', '962', 'Asia/Amman', 'JOD') returning id`,
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
  expectStatus(await anon.get(hostOf('nosuchsalon'), '/api/context'), 404, 'unknown salon subdomain');
  expectStatus(await anon.get(`x.y.${DOMAIN}`, '/api/context'), 404, 'nested subdomain');
  const pctx = await anon.get(PLATFORM, '/api/context');
  expect(pctx.json?.kind === 'platform' && pctx.json.user === null, 'bare domain is the platform host', pctx.json);

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
  expect(html.includes('<title>صالون أ</title>') && html.includes('--primary:#0f3d3e') && !!nonce && html.includes(`<style nonce="${nonce}">`) && html.includes(`<script nonce="${nonce}">`), 'index.html carries salon title, colours and a CSP nonce');
  expect(html.includes('data-theme="public"') && csp.includes(`script-src 'self' 'nonce-${nonce}'`), 'salon host starts on the public theme; owner screens switch before first paint');
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
  expect(dayManifest.background_color === dayBase('#0f3d3e') && dayManifest.icons[0].src.includes(`v=${brandPub?.icon_v}`), "the customers' app launches on the day page", dayManifest);
  const ownerManifest = JSON.parse((await anon.get(A, '/manage.webmanifest')).body.toString('utf8'));
  expect(ownerManifest.id === '/manage' && ownerManifest.start_url === '/manage' && ownerManifest.scope === '/manage' && ownerManifest.name === 'إدارة صالون أ' && ownerManifest.background_color === nightBase('#0f3d3e') && ownerManifest.icons.every((i: any) => i.src.startsWith('/icons/owner-')), "the owner's app: its own id, name, scope, colours and icons", ownerManifest);
  const plainIcon = await anon.get(A, '/icons/icon-512.png');
  const ownerIcon = await anon.get(A, '/icons/owner-icon-512.png');
  expect((await pngSize(plainIcon)) === '512x512' && (await pngSize(ownerIcon)) === '512x512' && !plainIcon.body.equals(ownerIcon.body), "the owner's icon carries a badge so the two apps are told apart");
  expect((await pngSize(await anon.get(A, '/icons/owner-apple-touch-icon.png'))) === '180x180', 'owner icon for iPhone home screens');
  expectStatus(await anon.get(A, '/icons/owner-favicon.ico'), 404, 'no owner favicon');
  const ownerIndex = await anon.get(A, '/manage');
  const ownerHtml = ownerIndex.body.toString('utf8');
  expect(ownerIndex.status === 200 && ownerHtml.includes('data-theme="studio"') && ownerHtml.includes('data-app="owner"') && ownerHtml.includes('href="/manage.webmanifest"') && ownerHtml.includes('/icons/owner-apple-touch-icon.png') && ownerHtml.includes('/splash/owner-1290x2796.png'), "/manage opens the owner's app on the studio theme, with its manifest, icon and launch screens");
  const customerHtml = (await anon.get(A, '/')).body.toString('utf8');
  expect(customerHtml.includes('data-page="day"') && customerHtml.includes('class="boot splash"') && customerHtml.includes('apple-touch-startup-image') && customerHtml.includes('--accent-ink:'), "the customers' app: day page, a splash with the salon's icon, iOS launch screens");
  const launch = await anon.get(A, `/splash/1179x2556.png?v=${brandPub?.icon_v}`);
  expect((await pngSize(launch)) === '1179x2556' && /max-age=31536000/.test(String(launch.headers['cache-control'])), 'an iPhone launch screen at the exact size');
  expect((await pngSize(await anon.get(A, '/splash/owner-2048x2732.png'))) === '2048x2732', "an iPad launch screen for the owner's app");
  expectStatus(await anon.get(A, '/splash/1000x1000.png'), 404, 'only real screen sizes');
  expectStatus(await anon.get(PLATFORM, '/manage'), 404, 'no owner app on the platform host');
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

  section('Public page');
  expectStatus(await ownerA.patch(A, `/api/manage/staff/${khalidId}`, { active: false }), 200, 'pause a team member');
  const pub = await anon.get(A, '/api/public/salon');
  expectStatus(pub, 200, 'public salon data needs no login');
  expect(!pub.json?.services.some((s: any) => s.id === beardId) && pub.json?.services.some((s: any) => s.id === cutId), 'hidden services left out', pub.json?.services?.map((s: any) => s.id));
  expect(pub.json?.services.every((s: any) => typeof s.icon === 'string'), 'public services carry their icon');
  expect(pub.json?.staff.length === 1 && pub.json.staff[0].id === ahmadId, 'paused members left out', pub.json?.staff);
  expect(pub.json?.services.find((s: any) => s.id === cutId)?.staff_ids.join() === String(ahmadId), "paused members left out of a service's team");
  expect(!('tenant_id' in (pub.json?.salon ?? {})), 'no internal fields in public data');

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
  expectStatus(await anon.request(A, 'POST', '/api/public/bookings', { json: {} }), 404, 'writes to an old link are not redirected');
  expectStatus(await admin.post(PLATFORM, '/api/admin/salons', { subdomain: subA, name_ar: 'x', owner_phone: '0790001234', owner_password: 'whatever-123' }), 409, 'an old link is not given to another salon', 'subdomain_taken');
  const back = await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { subdomain: subA });
  expect(back.status === 200 && back.json.salon.subdomain === subA && back.json.salon.old_links.includes(`http://${A2}`) && !back.json.salon.old_links.includes(`http://${A}`), 'moving back to its own earlier link', back.json?.salon?.old_links);
  expectStatus(await anon.get(A, '/api/public/salon'), 200, 'the original link works again');

  await admin.patch(PLATFORM, `/api/admin/salons/${idA}`, { active: false });
  const page = await anon.get(A, '/');
  expect(page.status === 503 && page.body.toString().includes('صالون أ الجديد') && /no-store/.test(String(page.headers['cache-control'])), 'customers see a calm "unavailable" page while suspended', { status: page.status });
  expectStatus(await anon.get(A, '/api/public/salon'), 404, 'and the API is closed', 'suspended');
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
  const customer = () => {
    const c = new Client();
    const addr = `10.9.0.${ip++}`;
    const request = c.request.bind(c);
    c.request = (host, method, path, opts = {}) => request(host, method, path, { ...opts, headers: { 'X-Forwarded-For': addr, ...opts.headers } });
    return c;
  };
  const guest = customer();
  const days = await guest.get(K, `/api/public/days?service_id=${cut}`);
  expectStatus(days, 200, 'next two weeks');
  expect(days.json?.days.length === 14 && days.json.days[1].slots > 0, 'every day has slots when open around the clock', days.json?.days?.slice(0, 2));
  const tomorrow = days.json?.days[1].date as string;
  const avail = await guest.get(K, `/api/public/availability?service_id=${cut}&date=${tomorrow}`);
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
  expect(pending?.salon.cliq_alias === 'SALONK' && pending.salon.cliq_name === 'صالون ك', 'the customer sees where to send it');
  const colourBooking = await book(customer(), { service_id: color, time: 900, name: 'هبة', phone: '0796666666' });
  expect(colourBooking.json?.booking.deposit === '1.5', 'the deposit never exceeds the price', colourBooking.json?.booking);
  const held = await guest.get(K, `/api/public/availability?service_id=${cut}&staff_id=${pending?.staff.id}&date=${tomorrow}`);
  expect(!held.json?.slots.some((s: any) => s.min === 720), 'a held slot is not offered to anyone else');

  section('Payment screenshot');
  const t1 = d1.json?.token;
  const receipt = await sharp({ create: { width: 390, height: 844, channels: 3, background: '#f4f4f4' } }).png().toBuffer();
  expectStatus(await guest.post(K, `/api/public/bookings/${t1}/sent`, { note: 'نور' }), 400, 'no "sent" without a screenshot', 'required');
  expectStatus(await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: Buffer.from('%PDF-1.4 not an image'), type: 'image/png' }), 415, 'a file that is not an image', 'unsupported_image');
  expectStatus(await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: receipt, type: 'text/plain' }), 415, 'a non-image content type', 'unsupported_image');
  const up = await guest.request(K, 'PUT', `/api/public/bookings/${t1}/proof`, { raw: receipt, type: 'image/png' });
  expect(up.status === 200 && up.json.booking.proof_url?.startsWith(`/api/public/bookings/${t1}/proof?v=`) && up.json.booking.status === 'pending_payment', 'customer uploads the transfer screenshot', up.json);
  const mine = await guest.get(K, up.json?.booking.proof_url);
  expect(mine.status === 200 && mine.headers['content-type'] === 'image/webp' && /private/.test(String(mine.headers['cache-control'])), 'the customer can see their upload, re-encoded and privately cached', mine.headers);
  const sent = await guest.post(K, `/api/public/bookings/${t1}/sent`, { note: 'نور أحمد - بنك الإسكان' });
  expect(sent.status === 200 && sent.json.booking.status === 'payment_sent' && sent.json.booking.payment_note === 'نور أحمد - بنك الإسكان', 'customer says the transfer is sent');
  expectStatus(await guest.post(K, `/api/public/bookings/${t1}/sent`, {}), 409, 'saying it twice', 'not_pending');
  const overview = await owner.get(K, '/api/manage/bookings/overview');
  const waitingRow = overview.json?.attention.find((b: any) => b.id === pending.id);
  expect(waitingRow?.status === 'payment_sent' && overview.json.counts[tomorrow] >= 3, 'the owner sees what needs checking and the day counts', overview.json);
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
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'completed' }), 200, 'mark as done');
  expectStatus(await owner.patch(K, `/api/manage/bookings/${pending.id}`, { status: 'cancelled' }), 409, 'done bookings cannot be cancelled', 'bad_transition');
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

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
