// Renders the app at phone width (and desktop) and presses through the whole
// owner journey on a brand-new salon, saving a screenshot at each step to
// screenshots/. Fails on any page error, console error, CSP violation, failed
// request or missing element.
//
// Needs the api running (npm run dev) against a seeded database (npm run seed).
//   BASE_HOST=localhost:3000 CHROME_PATH=/path/to/chrome npm run screenshots
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import puppeteer, { type Browser, type BrowserContext, type ElementHandle, type Page } from 'puppeteer-core';

const BASE_HOST = process.env.BASE_HOST ?? 'localhost:3000';
// The platform's landing page is the bare domain; its dashboard is admin.
const LANDING = `http://${BASE_HOST}`;
const PLATFORM = `http://admin.${BASE_HOST}`;
const OUT = path.resolve('screenshots');
const ADMIN = { phone: process.env.SEED_ADMIN_PHONE ?? '+962790000000', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin-pass-123' };
const PHONE = { width: 400, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true };
const DESKTOP = { width: 1440, height: 900, deviceScaleFactor: 1 };

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => !!p);
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('No Chrome found; set CHROME_PATH');

const problems: string[] = [];
// Failures the flow provokes on purpose.
const expectedFailures = ['POST /api/auth/login 401'];
let shot = 0;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function settle(page: Page, ms = 700) {
  await page.evaluate(() => document.fonts.ready);
  await sleep(ms); // entrance animations and view transitions
}

async function snap(page: Page, name: string, { full = false, wait = 700 } = {}) {
  await settle(page, wait);
  const file = path.join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`);
  const viewport = page.viewport()!;
  if (full) {
    // Grow the viewport to the whole page so fixed bars sit where they would at the end of a scroll.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ ...viewport, height: Math.max(viewport.height, height) });
    await sleep(1100); // sections slide in as they come into view
  }
  await page.screenshot({ path: file });
  if (full) await page.setViewport(viewport);
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

async function find(page: Page, selector: string, text: string): Promise<ElementHandle<Element>> {
  const handle = await page.waitForFunction(
    (sel, txt) => [...document.querySelectorAll(sel)].find((el) => el.textContent?.includes(txt)),
    { timeout: 6000 },
    selector,
    text,
  );
  return handle.asElement() as ElementHandle<Element>;
}

async function clickText(page: Page, selector: string, text: string) {
  const el = await find(page, selector, text);
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await el.click();
}

async function upload(page: Page, trigger: string, file: string) {
  await page.$eval(trigger, (node) => node.scrollIntoView({ block: 'center' }));
  const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(trigger)]);
  await chooser.accept([file]);
}

const ownerPath = (p: string) => p === '/admin' || p.startsWith('/admin/');
// The app's own screens; anything else (the privacy policy, the terms) is a server page.
const APP_PATH = /^\/(?:book|b\/[\w-]+|admin(?:\/[a-z]+)?)?\/?$/;

async function go(page: Page, url: string, selector: string) {
  const from = new URL(page.url());
  const to = new URL(url);
  if (from.origin === to.origin && APP_PATH.test(from.pathname) && APP_PATH.test(to.pathname) && ownerPath(from.pathname) === ownerPath(to.pathname) && from.pathname !== to.pathname) {
    // Same app, another screen: what a tap on one of its links does.
    await page.evaluate((path) => {
      history.pushState(null, '', path);
      dispatchEvent(new PopStateEvent('popstate'));
    }, to.pathname);
  } else {
    // The studio keeps one live stream open, so wait for "almost" idle.
    await page.goto(url, { waitUntil: 'networkidle2' });
  }
  await page.waitForSelector(selector);
  await settle(page);
}

async function newPage(browser: Browser | BrowserContext, viewport: typeof PHONE | typeof DESKTOP = PHONE) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (err) => problems.push(`pageerror: ${(err as Error).message}`));
  page.on('console', (msg) => {
    // Failed requests are reported with their URL by the response handler below.
    if (msg.type() === 'error' && !msg.text().startsWith('Failed to load resource')) problems.push(`console: ${msg.text()}`);
  });
  page.on('response', (res) => {
    if (res.status() < 400) return;
    const key = `${res.request().method()} ${new URL(res.url()).pathname} ${res.status()}`;
    const i = expectedFailures.indexOf(key);
    if (i >= 0) expectedFailures.splice(i, 1);
    else problems.push(`http: ${key}`);
  });
  return page;
}

async function login(page: Page, base: string, phone: string, password: string, path = '/') {
  await go(page, `${base}${path}`, 'input[name=phone]');
  await page.type('input[name=phone]', phone);
  await page.type('input[name=password]', password);
  await page.click('button[type=submit]');
}

/** Test portraits that disagree on purpose (framing, colour cast), plus a logo. */
async function fixtures(dir: string) {
  const portrait = (w: number, h: number, bg: [string, string], skin: string, shirt: string, cx: number) => {
    const head = Math.min(w, h) * 0.17;
    const cy = h * 0.42;
    return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
      <rect width="${w}" height="${h}" fill="url(#g)"/>
      <ellipse cx="${cx}" cy="${cy + head * 3.2}" rx="${head * 2.3}" ry="${head * 1.9}" fill="${shirt}"/>
      <rect x="${cx - head * 0.45}" y="${cy + head * 0.6}" width="${head * 0.9}" height="${head}" fill="${skin}"/>
      <circle cx="${cx}" cy="${cy}" r="${head}" fill="${skin}"/>
      <path d="M${cx - head} ${cy - head * 0.1} Q${cx} ${cy - head * 1.6} ${cx + head} ${cy - head * 0.1} Q${cx} ${cy - head * 0.8} ${cx - head} ${cy - head * 0.1}Z" fill="#2b1d14"/>
    </svg>`);
  };
  const files = { p1: path.join(dir, 'p1.jpg'), p2: path.join(dir, 'p2.jpg'), logo: path.join(dir, 'logo.png'), receipt: path.join(dir, 'receipt.png'), cover: path.join(dir, 'cover.jpg') };
  // A salon at night: a row of mirrors with their lights.
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2c3a36"/><stop offset="1" stop-color="#0b1211"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/>${Array.from({ length: 9 }, (_, i) => `<rect x="${120 + i * 160}" y="170" width="110" height="420" rx="14" fill="#d9b45a" opacity="${0.14 + (i % 3) * 0.08}"/><circle cx="${175 + i * 160}" cy="128" r="24" fill="#ffe7b3" opacity=".85"/>`).join('')}<rect y="640" width="1600" height="260" fill="#0e1514"/></svg>`)).jpeg().toFile(files.cover);
  // A made-up transfer receipt in no real bank's style, shaped like a phone screenshot.
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="780" height="1688">
    <rect width="780" height="1688" fill="#f3f4f6"/><rect width="780" height="150" fill="#334155"/>
    <circle cx="390" cy="420" r="92" fill="#16a34a"/><path d="M345 420 l32 32 l62 -66" fill="none" stroke="#fff" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"/>
    <g font-family="DejaVu Sans, sans-serif" text-anchor="middle" fill="#111827">
      <text x="390" y="600" font-size="44" font-weight="bold">Transfer sent</text>
      <text x="390" y="700" font-size="76" font-weight="bold">2.000 JOD</text>
    </g>
    <g font-family="DejaVu Sans, sans-serif" font-size="30" fill="#374151">
      <rect x="60" y="780" width="660" height="420" rx="24" fill="#fff"/>
      <text x="100" y="860">To</text><text x="680" y="860" text-anchor="end" font-weight="bold">LUXSALON</text>
      <text x="100" y="960">From</text><text x="680" y="960" text-anchor="end">SAMI KHALED</text>
      <text x="100" y="1060">Reference</text><text x="680" y="1060" text-anchor="end">TX 48213907</text>
      <text x="100" y="1160">Time</text><text x="680" y="1160" text-anchor="end">09:12</text>
    </g></svg>`)).png().toFile(files.receipt);
  await sharp(portrait(1000, 1300, ['#9fd3c7', '#3f7f73'], '#d4a373', '#582f0e', 520)).jpeg().toFile(files.p1);
  await sharp(portrait(1500, 1000, ['#ffd6a5', '#ff9f68'], '#8d5524', '#1b263b', 620)).jpeg().toFile(files.p2);
  await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600">
    <circle cx="300" cy="300" r="260" fill="#0e3b36"/><circle cx="300" cy="300" r="230" fill="none" stroke="#d9b45a" stroke-width="10"/>
    <g fill="none" stroke="#d9b45a" stroke-width="22" stroke-linecap="round"><circle cx="240" cy="380" r="48"/><circle cx="360" cy="380" r="48"/>
    <path d="M272 346 L380 190"/><path d="M328 346 L220 190"/></g></svg>`)).png().toFile(files.logo);
  return files;
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(path.join(OUT, 'fixtures'), { recursive: true });
  const files = await fixtures(path.join(OUT, 'fixtures'));
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const sub = `s${Date.now().toString(36).slice(-6)}`;
  const owner = { phone: `07${String(Date.now()).slice(-8)}`, password: 'owner-pass-777' };
  const SALON = `http://${sub}.${BASE_HOST}`;
  // The owner's own installable app.
  const STUDIO = `${SALON}/admin`;
  try {
    // ---- the platform's landing page, for salon owners
    const landDesk = await newPage(browser, DESKTOP);
    await go(landDesk, `${LANDING}/`, '.l-title');
    await snap(landDesk, 'landing-desktop', { wait: 2600 });
    await landDesk.close();
    const land = await newPage(browser);
    await go(land, `${LANDING}/`, '.l-title');
    await snap(land, 'landing', { full: true, wait: 2600 });
    await land.close();

    // ---- the platform owner creates a salon
    const admin = await newPage(browser);
    await login(admin, PLATFORM, ADMIN.phone, 'wrong-password');
    await admin.waitForSelector('.form-error:not([hidden])');
    await admin.$eval('input[name=password]', (el) => { (el as HTMLInputElement).value = ''; });
    await admin.type('input[name=password]', ADMIN.password);
    await admin.click('button[type=submit]');
    await admin.waitForSelector('.trend-card svg .line');
    await snap(admin, 'admin', { full: true, wait: 2400 });
    // The platform's own settings: its landing page and contact number.
    await admin.click('.s-header .icon-btn[aria-label="إعدادات المنصة"]');
    await admin.waitForSelector('.sheet input[name=contact_phone]');
    await snap(admin, 'admin-platform');
    await admin.click('.sheet .sheet-head .icon-btn');
    await admin.waitForFunction(() => !document.querySelector('.sheet'));
    await clickText(admin, 'button', 'صالون جديد');
    await admin.waitForSelector('.sheet input[name=subdomain]');
    await admin.type('.sheet input[name=name_ar]', 'صالون لوكس');
    await admin.type('.sheet input[name=name_en]', 'Lux Salon');
    await admin.type('.sheet input[name=subdomain]', sub);
    await admin.type('.sheet input[name=owner_phone]', owner.phone);
    await admin.type('.sheet input[name=owner_name]', 'أبو فهد');
    await admin.type('.sheet input[name=owner_password]', owner.password);
    await snap(admin, 'admin-create');
    await clickText(admin, '.sheet-foot button', 'إنشاء');
    await admin.waitForSelector('.sheet .cred-row.secret');
    await snap(admin, 'admin-handover', { wait: 1400 });
    await clickText(admin, '.sheet-foot button', 'تم');
    await admin.waitForFunction(() => !document.querySelector('.sheet'));
    // The new salon's sheet: its numbers, setup, owner, name and link.
    await clickText(admin, '.salon-card', sub);
    await admin.waitForSelector('.sheet .sd-stats');
    await snap(admin, 'admin-salon', { wait: 900 });
    // The owner forgot their password: a new temporary one, shown once.
    await clickText(admin, '.sheet button', 'إعادة تعيين كلمة المرور');
    await admin.waitForSelector('.sheet .btn-danger');
    await settle(admin, 500); // let the confirmation finish sliding in
    await admin.click('.sheet .btn-danger');
    await admin.waitForSelector('.sheet .cred-row.secret');
    owner.password = await admin.$eval('.sheet .cred-row.secret .v', (el) => el.textContent!.trim());
    await snap(admin, 'admin-reset-password', { wait: 700 });

    // ---- the salon owner's first visit
    const page = await newPage(browser);
    await login(page, SALON, owner.phone, owner.password, '/admin/login');
    await page.waitForSelector('.hero-card');
    await snap(page, 'home-empty', { full: true, wait: 1500 });
    // First thing: their own password instead of the temporary one.
    await page.click('.temp-pw .btn-primary');
    await page.waitForSelector('.sheet input[name=current]');
    await page.type('.sheet input[name=current]', owner.password);
    owner.password = 'owner-pass-888';
    await page.type('.sheet input[name=next]', owner.password);
    await clickText(page, '.sheet button', 'تغيير كلمة المرور');
    await find(page, '.toast', 'تم تغيير كلمة المرور');
    await page.waitForFunction(() => !document.querySelector('.temp-pw'));
    await page.keyboard.press('Escape');
    await settle(page, 400);

    // Services: a ready menu for a barbershop, priced in one sheet.
    await go(page, `${STUDIO}/services`, '.type-card');
    await snap(page, 'services-empty');
    await page.click('.type-card');
    await page.waitForSelector('.sheet .tpl-row');
    await settle(page, 400);
    const prices = ['6', '3', '8', '4', '5', '15', '10', '3.500'];
    const inputs = await page.$$('.sheet .price-mini');
    for (const [i, el] of inputs.entries()) await el.type(prices[i] ?? '20');
    await snap(page, 'services-ready-menu');
    await clickText(page, '.sheet-foot button', 'إضافة');
    await page.waitForSelector('.svc');
    await snap(page, 'services', { full: true, wait: 1200 });
    await page.click('.svc');
    await page.waitForSelector('.sheet .emoji-picker');
    await snap(page, 'service-editor');
    await page.click('.sheet .emoji-opt:nth-child(2)');
    await clickText(page, '.sheet .chip-btn', '45');
    await clickText(page, '.sheet-foot button', 'حفظ');
    await page.waitForFunction(() => !document.querySelector('.sheet'));

    // Team: a new barber with a photo, then a new photo with the studio touch.
    await go(page, `${STUDIO}/team`, '.add-member');
    await page.click('.add-member');
    await page.waitForSelector('.sheet .drop');
    await settle(page, 400);
    await page.type('.sheet input[name=name_ar]', 'فهد');
    await page.type('.sheet input[name=title_ar]', 'حلاق أول');
    await upload(page, '.sheet .drop', files.p1);
    await page.waitForSelector('.sheet .photo-stage img');
    await snap(page, 'team-new-member');
    await clickText(page, '.sheet-foot button', 'حفظ');
    await page.waitForSelector('.member .portrait img');
    await snap(page, 'team', { wait: 1200 });
    await page.click('.member');
    await page.waitForSelector('.sheet .portrait.finished');
    await settle(page, 500);
    await upload(page, '.sheet .photo-actions .btn-secondary', files.p2);
    await page.waitForSelector('.sheet .processing');
    await sleep(250);
    await snap(page, 'team-studio-touch-processing', { wait: 0 });
    await page.waitForSelector('.sheet .portrait.finished.revealing');
    await snap(page, 'team-studio-touch-sparkles', { wait: 380 });
    await snap(page, 'team-studio-touch-done', { wait: 1400 });
    await page.keyboard.press('Escape');
    await settle(page, 400);

    // Brand: logo, a palette; the save bar and live preview follow.
    await go(page, `${STUDIO}/brand`, '.logo-drop');
    await upload(page, '.logo-drop .btn-secondary', files.logo);
    await page.waitForSelector('.logo-drop .app-icon.logo');
    await page.$eval('.palette[data-id="emerald"]', (el) => el.scrollIntoView({ block: 'center' }));
    await page.click('.palette[data-id="emerald"]');
    await page.waitForSelector('.savebar');
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, 'brand-unsaved', { wait: 900 });
    await snap(page, 'brand', { full: true });
    await page.click('.savebar .btn-primary');
    await find(page, '.toast', 'تم حفظ الهوية');
    await page.waitForFunction(() => !document.querySelector('.savebar'));

    // Hours: a preset, one day opened, saved.
    await go(page, `${STUDIO}/hours`, '.day-row');
    await clickText(page, '.chip-btn', 'فترتين');
    await page.waitForSelector('.savebar');
    await page.click('.day-row[data-day="6"] .day-line');
    await page.waitForSelector('.day-editor');
    await snap(page, 'hours-editing');
    await page.click('.savebar .btn-primary');
    await find(page, '.toast', 'تم حفظ أوقات العمل');
    await snap(page, 'hours', { full: true });

    // Home when everything is done: the celebration, then the settled page.
    await go(page, STUDIO, '.hero-card');
    await snap(page, 'home-ready-celebration', { wait: 300 });
    await snap(page, 'home-ready', { full: true, wait: 2600 });

    // Preview sheet and settings.
    await page.click('.s-header .icon-btn[aria-label="معاينة"]');
    await page.waitForSelector('.sheet .phone');
    await snap(page, 'preview-app');
    await clickText(page, '.sheet .segmented span', 'الأيقونة');
    await snap(page, 'preview-icon');
    await page.keyboard.press('Escape');
    await settle(page, 400);
    await page.click('.s-header .icon-btn[aria-label="الإعدادات"]');
    await page.waitForSelector('.sheet .segmented');
    await snap(page, 'settings');
    await page.evaluate(() => ([...document.querySelectorAll<HTMLInputElement>('.sheet .segmented input')].find((i) => i.value === 'en')!).click());
    await page.waitForFunction(() => document.documentElement.dir === 'ltr');
    await snap(page, 'home-english', { full: true, wait: 1200 });
    await go(page, `${STUDIO}/hours`, '.day-row');
    await snap(page, 'hours-english');
    await page.evaluate(() => { try { localStorage.setItem('lang', 'ar'); } catch {} });

    // Desktop: sidebar, page and live preview side by side.
    // Same browser, so the owner is still signed in: the sign-in address goes straight to the dashboard.
    const desk = await newPage(browser, DESKTOP);
    await go(desk, `${STUDIO}/login`, '.hero-card');
    if (new URL(desk.url()).pathname !== '/admin') problems.push(`signed-in owner at /admin/login stayed on ${desk.url()}`);
    await snap(desk, 'desktop-home', { wait: 1500 });
    await go(desk, `${STUDIO}/brand`, '.palette');
    await desk.click('.palette[data-id="rose"]');
    await snap(desk, 'desktop-brand-live-preview', { wait: 900 });
    await go(desk, `${STUDIO}/team`, '.member');
    await snap(desk, 'desktop-team');

    // The salon's public page still renders in its own light theme.
    const pub = await newPage(browser);
    await go(pub, `${SALON}/`, '.p-hero h1');
    await snap(pub, 'public-page', { full: true });

    // ---- bookings: the owner asks for a CliQ deposit
    await page.bringToFront();
    await go(page, `${STUDIO}/bookings`, '.sched-summary');
    // Back to Arabic (set above).
    await page.reload({ waitUntil: 'networkidle2' });
    await page.waitForSelector('.sched-summary');
    await snap(page, 'bookings-empty', { wait: 1000 });
    await page.click('.s-head .icon-btn[aria-label="إعدادات الحجز"]');
    await page.waitForSelector('.sheet input[name=cliq_alias]');
    await clickText(page, '.sheet .switch-row', 'CliQ');
    await page.waitForSelector('.sheet .fold.open');
    await page.type('.sheet input[name=cliq_alias]', 'LUXSALON');
    await page.type('.sheet input[name=cliq_name]', 'فهد العلي');
    await snap(page, 'booking-settings', { wait: 900 });
    await clickText(page, '.sheet-foot button', 'حفظ');
    await find(page, '.toast', 'تم حفظ إعدادات الحجز');

    // ---- a customer, on their own phone, books from the salon page
    const customer = await browser.createBrowserContext();
    const cust = await newPage(customer);
    await go(cust, `${SALON}/`, '.p-hero h1');
    await clickText(cust, 'button', 'احجز موعدك');
    await cust.waitForSelector('.sheet .svc');
    await snap(cust, 'book-service');
    await cust.click('.sheet .svc');
    await cust.waitForSelector('.sheet .pick-card');
    await snap(cust, 'book-staff');
    await cust.click('.sheet .pick-card.anyone');
    await cust.waitForSelector('.sheet .slot');
    await cust.click('.sheet .slot');
    await snap(cust, 'book-time');
    await clickText(cust, '.sheet-foot button', 'التالي');
    await cust.waitForSelector('.sheet input[name=name]');
    await cust.type('.sheet input[name=name]', 'سامي خالد');
    await cust.type('.sheet input[name=phone]', `079${String(Date.now()).slice(-7)}`);
    await snap(cust, 'book-details');
    await clickText(cust, '.sheet-foot button', 'تأكيد الحجز');
    await cust.waitForSelector('.cliq-card');
    await snap(cust, 'booking-cliq', { full: true });
    await upload(cust, '.proof-drop', files.receipt);
    await cust.waitForSelector('.proof-drop.has img');
    await cust.$eval('.proof-drop', (el) => el.scrollIntoView({ block: 'center' }));
    await snap(cust, 'booking-proof-picked');
    await clickText(cust, 'button', 'أرسلت الحوالة');
    await cust.waitForSelector('.status-icon.pulse');
    await cust.waitForSelector('.proof-card .proof-img');
    await snap(cust, 'booking-sent', { full: true });

    // ---- the owner sees it arrive live, opens the screenshot and approves
    await page.bringToFront();
    await page.waitForSelector('.att-row.sent .proof-strip');
    await snap(page, 'bookings-deposit-to-check', { wait: 1200 });
    await page.click('.att-row.sent .proof-strip');
    await page.waitForSelector('.proof-viewer .pv-stage img');
    await page.waitForFunction(() => (document.querySelector('.proof-viewer img') as HTMLImageElement)?.complete);
    await snap(page, 'owner-review-screenshot', { wait: 900 });
    await clickText(page, '.proof-viewer .pv-actions button', 'استلمت الدفعة');
    await find(page, '.toast', 'تم تأكيد الحجز');
    await page.waitForFunction(() => !document.querySelector('.att-row') && !document.querySelector('.proof-viewer'));
    await cust.bringToFront();
    await cust.waitForSelector('.status-icon.ok', { timeout: 20_000 });
    await snap(cust, 'booking-confirmed', { wait: 1200 });

    // ---- another customer's transfer is not found: rejected from the review
    // Sent as source text: tsx would wrap named helpers in a function the page lacks.
    const token2 = (await cust.evaluate(`(async () => {
      const json = (r) => r.json();
      const post = (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(json);
      const { services } = await fetch('/api/public/salon').then(json);
      const svc = services[0].id;
      const { days } = await fetch('/api/public/days?service_id=' + svc).then(json);
      const date = days.find((d) => d.slots > 0).date;
      const { slots } = await fetch('/api/public/availability?service_id=' + svc + '&date=' + date).then(json);
      const made = await post('/api/public/bookings', { service_id: svc, staff_id: null, date, time: slots[slots.length - 1].min, name: 'رامي', phone: '0781234500' });
      const canvas = Object.assign(document.createElement('canvas'), { width: 600, height: 1200 });
      canvas.getContext('2d').fillRect(0, 0, 600, 1200);
      const blob = await new Promise((done) => canvas.toBlob(done, 'image/png'));
      await fetch('/api/public/bookings/' + made.token + '/proof', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: blob });
      await post('/api/public/bookings/' + made.token + '/sent', { note: 'رامي' });
      return made.token;
    })()`)) as string;
    await page.bringToFront();
    await page.waitForSelector('.att-row.sent .proof-strip');
    await page.click('.att-row.sent .proof-strip');
    await page.waitForSelector('.proof-viewer .pv-actions');
    await clickText(page, '.proof-viewer .pv-actions button', 'رفض');
    await page.waitForSelector('.sheet .btn-danger');
    await snap(page, 'owner-reject-confirm');
    await page.click('.sheet .btn-danger');
    await find(page, '.toast', 'رُفضت الدفعة');
    await page.waitForFunction(() => !document.querySelector('.proof-viewer'));
    await cust.bringToFront();
    await go(cust, `${SALON}/b/${token2}`, '.status-hero h1');
    await snap(cust, 'booking-rejected', { wait: 1000 });
    // The salon's booking link (for its Instagram bio) opens straight into booking.
    await go(cust, `${SALON}/book`, '.sheet .svc');
    await snap(cust, 'book-link');
    // The privacy policy, in the salon's colours on its link.
    await go(cust, `${SALON}/privacy`, 'main h1');
    await snap(cust, 'privacy');

    // ---- a booking taken by phone, on the same day
    await page.bringToFront();
    await page.$eval('.day-chip .badge', (el) => (el.closest('.day-chip') as HTMLElement).click());
    await page.waitForSelector('.appt');
    await page.click('.s-head .primary-icon');
    await page.waitForSelector('.sheet .slot');
    await page.$$eval('.sheet .slot', (els) => (els[Math.min(4, els.length - 1)] as HTMLElement).click());
    await page.type('.sheet input[name=name]', 'ليث');
    await page.type('.sheet input[name=phone]', '0791234567');
    await snap(page, 'bookings-new');
    await clickText(page, '.sheet-foot button', 'احفظ الحجز');
    await find(page, '.toast', 'تم الحجز');
    await page.waitForFunction(() => document.querySelectorAll('.appt').length >= 2);
    await snap(page, 'bookings-day', { full: true, wait: 1200 });
    await page.click('.appt.s-confirmed');
    await page.waitForSelector('.sheet .customer-box');
    await snap(page, 'booking-detail');
    await page.keyboard.press('Escape');
    await settle(page, 400);
    await go(page, STUDIO, '.today-card .head');
    await snap(page, 'home-today', { full: true, wait: 1500 });
    await desk.bringToFront();
    await go(desk, `${STUDIO}/bookings`, '.sched-summary');
    await desk.$eval('.day-chip .badge', (el) => (el.closest('.day-chip') as HTMLElement).click());
    await desk.waitForSelector('.appt');
    await snap(desk, 'desktop-bookings', { wait: 1200 });

    // ---- the salon's look, its way: a cover photo, its page by day, the dashboard in its colours
    await page.bringToFront();
    await go(page, `${STUDIO}/brand`, '.look-grid');
    await upload(page, '.cover-drop .btn-secondary', files.cover);
    await page.waitForSelector('.cover-frame.has img');
    await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.look-card')].find((c) => c.textContent!.includes('نهاري'))!.click());
    await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('.look-card')].find((c) => c.textContent!.includes('ألوان صالونك'))!.click());
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, 'brand-looks', { full: true, wait: 1200 });
    await page.evaluate(() => (document.querySelector('.savebar .btn-primary') as HTMLElement).click());
    await find(page, '.toast', 'تم حفظ الهوية');
    await go(page, STUDIO, '.hero-card');
    await snap(page, 'home-salon-colours', { wait: 1500 });
    // A customer opens the app: the splash holds until the salon's page has its data.
    const visitor = await newPage(await browser.createBrowserContext());
    await visitor.setRequestInterception(true);
    visitor.on('request', (r) => {
      if (r.url().includes('/api/public/salon')) setTimeout(() => r.continue(), 1500);
      else r.continue();
    });
    await visitor.goto(`${SALON}/`, { waitUntil: 'domcontentloaded' });
    await visitor.waitForSelector('.splash.overlay');
    await snap(visitor, 'customer-splash', { wait: 500 });
    await visitor.waitForSelector('.p-hero.has-cover h1');
    await snap(visitor, 'public-day', { full: true, wait: 1600 });
  } finally {
    await browser.close();
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n${problems.join('\n')}`);
    process.exit(1);
  }
  console.log(`\n${shot} screenshots, no page errors`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
