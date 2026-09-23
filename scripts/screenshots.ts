// Renders the app at phone width and presses through the owner setup flow and the
// super admin screen, saving a screenshot at each step to screenshots/.
// Fails on any page error, console error or CSP violation, or a missing element.
//
// Needs the api running (npm run dev) against a seeded database (npm run seed).
//   BASE_HOST=localhost:3000 CHROME_PATH=/path/to/chrome npm run screenshots
import fs from 'node:fs';
import path from 'node:path';
import puppeteer, { type Browser, type ElementHandle, type Page } from 'puppeteer-core';

const BASE_HOST = process.env.BASE_HOST ?? 'localhost:3000';
const SALON = `http://demo.${BASE_HOST}`;
const PLATFORM = `http://${BASE_HOST}`;
const OUT = path.resolve('screenshots');
const OWNER = { phone: process.env.SEED_OWNER_PHONE ?? '0500000001', password: process.env.SEED_OWNER_PASSWORD ?? 'owner-pass-123' };
const ADMIN = { phone: process.env.SEED_ADMIN_PHONE ?? '+966500000000', password: process.env.SEED_ADMIN_PASSWORD ?? 'admin-pass-123' };

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/opt/pw-browsers/chromium',
  '/usr/bin/chromium',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter((p): p is string => !!p);
const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('No Chrome found; set CHROME_PATH');

fs.mkdirSync(OUT, { recursive: true });
const problems: string[] = [];
// Failures the flow provokes on purpose.
const expectedFailures = ['POST /api/auth/login 401'];
let shot = 0;

const VIEWPORT = { width: 400, height: 860, deviceScaleFactor: 1, isMobile: true, hasTouch: true };

async function snap(page: Page, name: string, fullPage = true) {
  await new Promise((r) => setTimeout(r, 250)); // let animations settle
  const file = path.join(OUT, `${String(++shot).padStart(2, '0')}-${name}.png`);
  if (fullPage) {
    // Grow the viewport to the whole page so sticky/fixed bars sit where a user
    // scrolled to the end would see them, instead of floating mid-page.
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    await page.setViewport({ ...VIEWPORT, height: Math.max(VIEWPORT.height, height) });
    await page.screenshot({ path: file });
    await page.setViewport(VIEWPORT);
  } else {
    await page.screenshot({ path: file });
  }
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

async function clickText(page: Page, selector: string, text: string) {
  const handle = await page.waitForFunction(
    (sel, txt) => [...document.querySelectorAll(sel)].find((el) => el.textContent?.includes(txt)),
    { timeout: 5000 },
    selector,
    text,
  );
  const el = handle.asElement() as ElementHandle<Element>;
  // Centre it first so fixed bars (tab bar, sheet footer) are not in the way.
  await el.evaluate((node) => node.scrollIntoView({ block: 'center' }));
  await el.click();
}

async function expectToast(page: Page, text: string) {
  await page.waitForFunction((txt) => document.querySelector('.toast')?.textContent?.includes(txt), { timeout: 8000 }, text);
}

async function newPage(browser: Browser) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);
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

async function main() {
  const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  try {
    // ---- customer view of the salon
    const page = await newPage(browser);
    await page.goto(`${SALON}/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.hero h1');
    await snap(page, 'salon-page');

    // ---- owner logs in
    await page.goto(`${SALON}/#/login`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('input[name=phone]');
    await snap(page, 'login', false);
    await page.type('input[name=password]', 'wrong-password');
    await page.type('input[name=phone]', OWNER.phone);
    await page.click('button[type=submit]');
    await page.waitForSelector('.form-error:not([hidden])');
    await snap(page, 'login-error', false);
    await page.$eval('input[name=password]', (el) => { (el as HTMLInputElement).value = ''; });
    await page.type('input[name=password]', OWNER.password);
    await page.click('button[type=submit]');
    await page.waitForSelector('.tabbar');
    await page.waitForSelector('.style-grid');
    await snap(page, 'manage-salon');

    // Pick a palette, save look; team photos get re-rendered server-side.
    await page.click('.swatches .swatch:nth-child(3)');
    await clickText(page, 'input[name=photo_style] ~ span', 'بلون الصالون');
    await page.evaluate(() => document.querySelectorAll('form')[1]!.requestSubmit());
    await expectToast(page, 'تم الحفظ');
    await snap(page, 'manage-salon-saved', false);

    // ---- services
    await page.goto(`${SALON}/#/manage/services`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.list');
    await snap(page, 'services');
    await clickText(page, 'button', 'خدمة جديدة');
    await page.waitForSelector('.sheet input[name=name_ar]');
    await page.type('.sheet input[name=name_ar]', 'حلاقة أطفال');
    await clickText(page, '.sheet button', '15');
    await page.type('.sheet input[name=price]', '٣٥'); // Arabic-Indic digits are accepted
    await snap(page, 'service-editor', false);
    await clickText(page, '.sheet-foot button', 'حفظ');
    await expectToast(page, 'تم الحفظ');
    await page.waitForFunction(() => document.body.textContent?.includes('حلاقة أطفال'));
    await snap(page, 'services-added');
    await clickText(page, 'button', 'ترتيب');
    await snap(page, 'services-reorder', false);

    // ---- team
    await page.goto(`${SALON}/#/manage/team`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.team-grid img');
    await snap(page, 'team');
    await page.click('.team-grid .team-card');
    await page.waitForSelector('.sheet .photo-compare');
    await snap(page, 'team-editor', false);
    await clickText(page, '.sheet .segmented span', 'أوقات خاصة');
    await page.waitForSelector('.sheet .days');
    await page.evaluate(() => document.querySelector('.sheet-body')!.scrollTo(0, 99999));
    await snap(page, 'team-editor-hours', false);
    await clickText(page, '.sheet-foot button', 'حفظ');
    await expectToast(page, 'تم الحفظ');

    // ---- hours: add an evening range to Saturday, save
    await page.goto(`${SALON}/#/manage/hours`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.days');
    await page.click('.day[data-day="6"] .link-btn');
    await page.select('.day[data-day="6"] .range:nth-child(1) select:nth-of-type(2)', '13:00');
    await snap(page, 'hours');
    await clickText(page, 'button', 'حفظ');
    await expectToast(page, 'تم الحفظ');

    // ---- English
    await page.goto(`${SALON}/#/manage/services`, { waitUntil: 'networkidle0' });
    await page.click('.topbar button[aria-label="English"]');
    await page.waitForFunction(() => document.documentElement.dir === 'ltr');
    await snap(page, 'services-en');
    await page.click('.topbar button[aria-label="العربية"]');

    // ---- the salon page after setup
    await page.goto(`${SALON}/`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('.team-grid img');
    await snap(page, 'salon-page-after');

    // ---- super admin on the platform host
    const admin = await newPage(browser);
    await admin.goto(`${PLATFORM}/`, { waitUntil: 'networkidle0' });
    await admin.waitForSelector('input[name=phone]');
    await admin.type('input[name=phone]', ADMIN.phone);
    await admin.type('input[name=password]', ADMIN.password);
    await admin.click('button[type=submit]');
    await admin.waitForSelector('.list');
    await snap(admin, 'admin');
    await clickText(admin, 'button', 'صالون جديد');
    await admin.waitForSelector('.sheet input[name=subdomain]');
    await admin.type('.sheet input[name=name_ar]', 'صالون الأناقة');
    await admin.type('.sheet input[name=subdomain]', `Salon${Date.now() % 100000}`);
    await admin.type('.sheet input[name=owner_phone]', '0551234567');
    await admin.type('.sheet input[name=owner_password]', 'temp-pass-123');
    await snap(admin, 'admin-create', false);
    await clickText(admin, '.sheet-foot button', 'إنشاء');
    await expectToast(admin, 'تم إنشاء');
    await snap(admin, 'admin-created');
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
