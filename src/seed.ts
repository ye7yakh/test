// Sets up a brand (tenant) and its super admin, plus an optional demo salon.
// Idempotent: run it as often as you like.
//
//   SEED_DOMAIN=localhost SEED_ADMIN_PHONE=+962790000000 SEED_ADMIN_PASSWORD=... npm run seed
import sharp from 'sharp';
import { hashPassword } from './auth.js';
import { one, pool, query, tx } from './db.js';
import { defaultWeek, saveSalonWeek } from './hours.js';
import { intakeImage, renderPortrait, saveMedia } from './media.js';

const env = process.env;
const isProd = env.NODE_ENV === 'production';
// Dev defaults are for a laptop only: production must name its admin explicitly.
if (isProd && (!env.SEED_DOMAIN || !env.SEED_ADMIN_PHONE || !env.SEED_ADMIN_PASSWORD)) {
  console.error('In production set SEED_DOMAIN, SEED_ADMIN_PHONE and SEED_ADMIN_PASSWORD.');
  process.exit(1);
}
const domain = (env.SEED_DOMAIN ?? 'localhost').toLowerCase();
const brandName = env.SEED_BRAND_NAME ?? 'Salonak';
const brandNameAr = env.SEED_BRAND_NAME_AR ?? 'صالونك';
const adminPhone = env.SEED_ADMIN_PHONE ?? '+962790000000';
// The landing page's WhatsApp button; the admin can change it later in the dashboard.
const contactPhone = env.SEED_CONTACT_PHONE ?? adminPhone;
const adminPassword = env.SEED_ADMIN_PASSWORD ?? 'admin-pass-123';
const demo = (env.SEED_DEMO ?? (isProd ? 'false' : 'true')) === 'true';

async function main() {
  const tenant = await one<{ id: number; default_timezone: string; default_currency: string }>(
    `insert into tenants (domain, name, name_ar, contact_phone, default_calling_code, default_timezone, default_currency)
     values ($1, $2, $3, $4, $5, $6, $7)
     on conflict (domain) do update set name = excluded.name, name_ar = excluded.name_ar,
       contact_phone = case when tenants.contact_phone = '' then excluded.contact_phone else tenants.contact_phone end
     returning id, default_timezone, default_currency`,
    [domain, brandName, brandNameAr, contactPhone, env.SEED_CALLING_CODE ?? '962', env.SEED_TIMEZONE ?? 'Asia/Amman', env.SEED_CURRENCY ?? 'JOD'],
  );
  await query(
    `insert into users (tenant_id, phone, name, password_hash, is_super_admin)
     values ($1, $2, 'Platform admin', $3, true)
     on conflict (tenant_id, phone) do update set is_super_admin = true`,
    [tenant!.id, adminPhone, await hashPassword(adminPassword)],
  );
  console.log(`tenant ${domain}; super admin ${adminPhone}`);
  if (demo) await seedDemoSalon(tenant!);
}

// Placeholder portraits that disagree on purpose (size, framing, colour cast) so the
// unified rendering has something to fix.
function portraitSvg(w: number, h: number, bg: [string, string], skin: string, shirt: string, cx: number) {
  const head = Math.min(w, h) * 0.17;
  const cy = h * 0.42;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#g)"/>
    <ellipse cx="${cx}" cy="${cy + head * 3.2}" rx="${head * 2.3}" ry="${head * 1.9}" fill="${shirt}"/>
    <rect x="${cx - head * 0.45}" y="${cy + head * 0.6}" width="${head * 0.9}" height="${head}" fill="${skin}"/>
    <circle cx="${cx}" cy="${cy}" r="${head}" fill="${skin}"/>
    <path d="M${cx - head} ${cy - head * 0.1} Q${cx} ${cy - head * 1.6} ${cx + head} ${cy - head * 0.1} Q${cx} ${cy - head * 0.8} ${cx - head} ${cy - head * 0.1}Z" fill="#2b1d14"/>
  </svg>`);
}

async function seedDemoSalon(tenant: { id: number; default_timezone: string; default_currency: string }) {
  if (await one('select 1 from salons where tenant_id = $1 and subdomain = $2', [tenant.id, 'demo'])) {
    console.log('demo salon already exists');
    return;
  }
  const ownerPhone = env.SEED_OWNER_PHONE ?? '+962790000001';
  const ownerPassword = env.SEED_OWNER_PASSWORD ?? 'owner-pass-123';

  const photos = await Promise.all(
    [
      portraitSvg(900, 1200, ['#f4c38a', '#e08a3c'], '#c68642', '#1d3557', 450),
      portraitSvg(1400, 900, ['#9fc5e8', '#3d6d99'], '#e0ac69', '#6a040f', 520),
      portraitSvg(800, 800, ['#b7d7a8', '#4b7f3a'], '#8d5524', '#222222', 430),
    ].map(async (svg) => intakeImage(await sharp(svg).jpeg().toBuffer())),
  );

  await tx(async (db) => {
    const owner = await one<{ id: number }>(
      `insert into users (tenant_id, phone, name, password_hash) values ($1, $2, 'صاحب الصالون', $3)
       on conflict (tenant_id, phone) do update set name = users.name returning id`,
      [tenant.id, ownerPhone, await hashPassword(ownerPassword)],
      db,
    );
    const salon = await one<{ id: number; color_accent: string }>(
      `insert into salons (tenant_id, subdomain, name_ar, name_en, about_ar, timezone, currency, phone, address, photo_style)
       values ($1, 'demo', 'صالون النخبة', 'Elite Barbers', 'حلاقة رجالية وعناية بالبشرة منذ 2010', $2, $3,
               '+962 79 000 0001', 'عمّان، عبدون', 'mono')
       returning id, color_accent`,
      [tenant.id, tenant.default_timezone, tenant.default_currency],
      db,
    );
    const salonId = salon!.id;
    await query(`insert into salon_members (salon_id, user_id, role) values ($1, $2, 'owner')`, [salonId, owner!.id], db);
    await saveSalonWeek(db, salonId, defaultWeek());

    const services: [string, string, number, string, boolean, string][] = [
      ['قص شعر', 'Haircut', 30, '6', false, '✂️'],
      ['حلاقة ذقن', 'Beard trim', 20, '3', false, '🧔'],
      ['قص شعر مع ذقن', 'Haircut & beard', 45, '8', false, '💈'],
      ['صبغة شعر', 'Hair colour', 60, '15', true, '🎨'],
      ['تنظيف بشرة', 'Facial', 40, '10', false, '🧖'],
    ];
    const serviceIds: number[] = [];
    for (const [i, [ar, en, min, price, from, icon]] of services.entries()) {
      const row = await one<{ id: number }>(
        `insert into services (salon_id, name_ar, name_en, duration_min, price, price_is_from, icon, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [salonId, ar, en, min, price, from, icon, i + 1],
        db,
      );
      serviceIds.push(row!.id);
    }

    const team: [string, string, string, string][] = [
      ['أحمد', 'Ahmad', 'حلاق أول', 'Senior barber'],
      ['خالد', 'Khalid', 'حلاق', 'Barber'],
      ['يوسف', 'Yousef', 'أخصائي عناية', 'Grooming specialist'],
    ];
    for (const [i, [ar, en, titleAr, titleEn]] of team.entries()) {
      const original = photos[i]!;
      const originalId = await saveMedia(db, salonId, original);
      const styledId = await saveMedia(db, salonId, await renderPortrait(original.bytes, 'mono', salon!.color_accent));
      const staff = await one<{ id: number }>(
        `insert into staff (salon_id, name_ar, name_en, title_ar, title_en, photo_original_id, photo_id, sort_order)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [salonId, ar, en, titleAr, titleEn, originalId, styledId, i + 1],
        db,
      );
      // Everyone cuts hair; only Yousef does facials and colour.
      const offered = i === 2 ? serviceIds : serviceIds.slice(0, 3);
      await query(
        'insert into staff_services (salon_id, staff_id, service_id) select $1, $2, unnest($3::bigint[])',
        [salonId, staff!.id, offered],
        db,
      );
    }
  });
  console.log(`demo salon at demo.${domain}; owner ${ownerPhone}`);
}

main()
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
