// API harness: starts its own api on a spare port against the local Postgres, sets
// up a throwaway tenant ("test.localhost"), exercises the owner setup flow and the
// security edges (tenant isolation, CSRF, uploads, rate limits), then cleans up.
//
//   npm run migrate && npm run test:api
import { spawn } from 'node:child_process';
import http from 'node:http';
import sharp from 'sharp';
import { hashPassword } from '../src/auth.js';
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
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'development' },
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
     values ($1, 'Test Brand', '966', 'Asia/Riyadh', 'SAR') returning id`,
    [DOMAIN],
  ))[0]!;
  const admin = { phone: '+966511111111', password: 'admin-test-pass' };
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
  const phoneA = `05${String(Date.now()).slice(-8)}`;
  const phoneB = `05${String(Date.now() + 7).slice(-8)}`;

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
  expectStatus(await admin.post(PLATFORM, '/api/admin/salons', { subdomain: `c${run}`, name_ar: 'x', owner_phone: '0599999990', owner_password: 'short' }), 400, 'weak owner password', 'weak_password');
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
  expectStatus(await ownerB.login(B, phoneB, 'owner-b-pass'), 200, 'owner B logs in');

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
  expect(html.includes('data-theme="public"') && /--studio-brand:#[0-9a-f]{6}/.test(html) && csp.includes(`script-src 'self' 'nonce-${nonce}'`), 'salon host starts on the public theme, with the studio accent ready');
  const platformIndex = await anon.get(PLATFORM, '/');
  const platformCsp = String(platformIndex.headers['content-security-policy']);
  expect(platformIndex.body.toString('utf8').includes('data-theme="studio" data-platform="1"') && platformCsp.includes(`img-src 'self' blob: data: http://*.${DOMAIN}:${PORT}`), 'platform host is the studio and may show salon icons');
  const manifest = await anon.get(A, '/manifest.webmanifest');
  const m = JSON.parse(manifest.body.toString('utf8'));
  expect(m.name === 'صالون أ' && m.theme_color === '#0f3d3e' && m.dir === 'rtl' && m.icons.length === 3, 'per-salon manifest', m);
  const icon = await anon.get(A, m.icons[2].src);
  const iconMeta = icon.status === 200 ? await sharp(icon.body).metadata() : null;
  expect(icon.headers['content-type'] === 'image/png' && iconMeta?.width === 512, 'maskable icon rendered from the logo', { status: icon.status });
  expectStatus(await anon.get(B, '/icons/icon-192.png'), 200, 'salon without a logo gets the default icon');

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
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
