// What customers (and anyone) can see on a salon's subdomain: the salon page data,
// the per-salon PWA manifest and icons, the salon's images, the picture its shared
// link shows, and what search engines may read.
import { iconBackground, iconVersion, pageColor, shareVersion, SPLASH_SIZES, splashVersion, STUDIO_BG, studioColor } from '../brand.js';
import { accentForDark } from '../colors.js';
import { loadSalonWeek } from '../hours.js';
import { one, query, pool } from '../db.js';
import { HttpError, ok, type Ctx, type Router } from '../http.js';
import { addOwnerBadge, loadMediaBytes, mediaUrl, renderIcon, renderPlatformIcon, renderShareCard, renderSplash } from '../media.js';
import type { Salon } from '../tenancy.js';

export function salonSummary(s: Salon) {
  return {
    id: s.id,
    subdomain: s.subdomain,
    name_ar: s.name_ar,
    name_en: s.name_en,
    color_primary: s.color_primary,
    color_accent: s.color_accent,
    currency: s.currency,
    logo_url: mediaUrl(s.logo_media_id),
    cover_url: mediaUrl(s.cover_media_id),
    icon_url: mediaUrl(s.icon_media_id),
    icon_bg: s.icon_bg,
    icon_v: iconVersion(s),
    page_theme: s.page_theme,
    studio_theme: s.studio_theme,
    booking_enabled: s.booking_enabled,
    cliq_required: s.cliq_required,
    deposit_kind: s.deposit_kind,
    deposit_amount: s.deposit_amount,
    payment_window_min: s.payment_window_min,
  };
}

function requireSalon(ctx: Ctx): Salon {
  if (!ctx.host.salon) throw new HttpError(404, 'not_found');
  return ctx.host.salon;
}

async function publicSalon(ctx: Ctx) {
  const salon = requireSalon(ctx);
  const [services, staff, hours] = await Promise.all([
    query(
      `select s.id, s.name_ar, s.name_en, s.description_ar, s.description_en, s.duration_min, trim_scale(s.price)::text as price, s.price_is_from, s.icon,
              coalesce(array_agg(st.id order by st.sort_order, st.id) filter (where st.id is not null), '{}') as staff_ids
         from services s
         left join staff_services ss on ss.service_id = s.id
         left join staff st on st.id = ss.staff_id and st.active
        where s.salon_id = $1 and s.active
        group by s.id
        order by s.sort_order, s.id`,
      [salon.id],
    ),
    query(
      `select id, name_ar, name_en, title_ar, title_en, photo_id
         from staff where salon_id = $1 and active
        order by sort_order, id`,
      [salon.id],
    ),
    loadSalonWeek(pool, salon.id),
  ]);
  ok(ctx, {
    salon: {
      ...salonSummary(salon),
      about_ar: salon.about_ar,
      about_en: salon.about_en,
      phone: salon.phone,
      address: salon.address,
      timezone: salon.timezone,
    },
    services,
    staff: staff.map(({ photo_id, ...s }) => ({ ...s, photo_url: mediaUrl(photo_id) })),
    hours,
  });
}

/**
 * Two installable apps per salon: the customers' (the salon's link) and the owner's
 * (/admin, its own name, icon badge and colours), so both can sit on one phone.
 */
function manifest(ctx: Ctx, owner: boolean) {
  const salon = requireSalon(ctx);
  const v = iconVersion(salon);
  const prefix = owner ? 'owner-' : '';
  const color = owner ? studioColor(salon) : pageColor(salon);
  const short = salon.name_ar.length > 12 && salon.name_en ? salon.name_en : salon.name_ar;
  const body = {
    id: owner ? '/admin' : '/',
    name: owner ? `إدارة ${salon.name_ar}` : salon.name_ar,
    short_name: owner ? (salon.name_ar.length <= 8 ? `إدارة ${salon.name_ar}` : 'إدارة الصالون') : short,
    description: owner ? 'لوحة تحكم الصالون: المواعيد والخدمات والفريق.' : `احجز موعدك في ${salon.name_ar}`,
    lang: 'ar',
    dir: 'rtl',
    start_url: owner ? '/admin' : '/',
    scope: owner ? '/admin' : '/',
    display: 'standalone',
    orientation: 'portrait',
    // The launch screen and bars match the page the app opens on.
    background_color: color,
    theme_color: color,
    icons: [
      { src: `/icons/${prefix}icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icons/${prefix}icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icons/${prefix}maskable-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
  const payload = JSON.stringify(body);
  ctx.res.writeHead(200, {
    'Content-Type': 'application/manifest+json; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  ctx.res.end(payload);
}

const ICONS: Record<string, { size: number; padding: number }> = {
  'favicon.ico': { size: 48, padding: 0.04 },
  'icon-192.png': { size: 192, padding: 0.08 },
  'icon-512.png': { size: 512, padding: 0.08 },
  'maskable-512.png': { size: 512, padding: 0.2 },
  'apple-touch-icon.png': { size: 180, padding: 0.12 },
};

// Rendered icons and launch screens, keyed by everything that affects them. Bounded.
const imageCache = new Map<string, Buffer>();
async function cached(key: string, make: () => Promise<Buffer>): Promise<Buffer> {
  let png = imageCache.get(key);
  if (!png) {
    png = await make();
    if (imageCache.size > 400) imageCache.delete(imageCache.keys().next().value!);
    imageCache.set(key, png);
  }
  return png;
}

/** The salon's icon at a size, with the dashboard badge for the owner's app. */
async function salonIcon(salon: Salon, name: string, owner: boolean): Promise<Buffer> {
  const spec = ICONS[name]!;
  return cached(`icon:${salon.id}:${iconVersion(salon)}:${name}:${owner}`, async () => {
    const mediaId = salon.icon_media_id ?? salon.logo_media_id;
    const art = mediaId ? await loadMediaBytes(pool, salon.id, mediaId) : null;
    const png = await renderIcon(spec.size, { bg: iconBackground(salon), art, fill: !!salon.icon_media_id, padding: spec.padding });
    return owner ? addOwnerBadge(png, spec.size, name.startsWith('maskable')) : png;
  });
}

function sendImage(ctx: Ctx, bytes: Buffer, maxAge: number, type = 'image/png') {
  ctx.res.writeHead(200, { 'Content-Type': type, 'Content-Length': bytes.length, 'Cache-Control': `public, max-age=${maxAge}` });
  ctx.res.end(bytes);
}

// The salon's icon; the platform's own hosts get the platform's mark.
async function icon(ctx: Ctx, file = ctx.params.name ?? '') {
  const owner = file.startsWith('owner-');
  const name = owner ? file.slice(6) : file;
  const salon = ctx.host.salon;
  if (!ICONS[name] || (owner && (!salon || name === 'favicon.ico'))) throw new HttpError(404, 'not_found');
  const png = salon
    ? await salonIcon(salon, name, owner)
    : await cached(`platform:${name}`, () => renderPlatformIcon(ICONS[name]!.size, name.startsWith('maskable') ? 0.1 : 0));
  sendImage(ctx, png, 86400);
}

/** The picture a shared link shows: the salon's (cover or icon), or the platform's. */
async function shareImage(ctx: Ctx) {
  const salon = ctx.host.salon;
  const jpg = salon
    ? await cached(`share:${salon.id}:${shareVersion(salon)}`, async () => {
        const night = salon.page_theme !== 'day';
        return renderShareCard({
          bg: pageColor(salon),
          glows: night ? [accentForDark(salon.color_accent), accentForDark(salon.color_primary)] : [salon.color_accent, salon.color_primary],
          icon: await salonIcon(salon, 'icon-512.png', false),
          cover: salon.cover_media_id ? await loadMediaBytes(pool, salon.id, salon.cover_media_id) : null,
        });
      })
    : await cached('share:platform', async () => renderShareCard({ bg: STUDIO_BG, glows: ['#8b5cf6', '#3b82f6'], icon: await renderPlatformIcon(512), cover: null }));
  sendImage(ctx, jpg, 86400, 'image/jpeg');
}

/** Salon pages and the landing page are for search engines; dashboards and bookings are not. */
function robots(ctx: Ctx) {
  const rules =
    ctx.host.site === 'admin' ? ['Disallow: /']
    : ctx.host.salon ? ['Disallow: /admin', 'Disallow: /b/', 'Disallow: /api/']
    : ['Disallow: /api/'];
  ctx.res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' });
  ctx.res.end(['User-agent: *', ...rules, ''].join('\n'));
}

/** iOS launch screens: the app's background with its icon. */
async function splash(ctx: Ctx) {
  const salon = requireSalon(ctx);
  const m = /^(owner-)?(\d{3,4})x(\d{3,4})\.png$/.exec(ctx.params.name ?? '');
  if (!m || !SPLASH_SIZES.has(`${m[2]}x${m[3]}`)) throw new HttpError(404, 'not_found');
  const owner = !!m[1];
  const [width, height] = [Number(m[2]), Number(m[3])];
  const png = await cached(`splash:${salon.id}:${splashVersion(salon, owner)}:${width}x${height}`, async () =>
    renderSplash(width, height, owner ? studioColor(salon) : pageColor(salon), await salonIcon(salon, 'icon-512.png', false)),
  );
  // The URL carries a version of everything in the picture.
  sendImage(ctx, png, 31536000);
}

async function media(ctx: Ctx) {
  const salon = requireSalon(ctx);
  const id = ctx.params.id ?? '';
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new HttpError(404, 'not_found');
  const row = await one<{ content_type: string; bytes: Buffer }>(
    'select content_type, bytes from media where salon_id = $1 and id = $2',
    [salon.id, id],
  );
  if (!row) throw new HttpError(404, 'not_found');
  // A new upload always gets a new id, so these bytes never change.
  ctx.res.writeHead(200, {
    'Content-Type': row.content_type,
    'Content-Length': row.bytes.length,
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Security-Policy': "default-src 'none'; sandbox",
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  ctx.res.end(row.bytes);
}

export function publicRoutes(r: Router) {
  r.get('/api/public/salon', publicSalon);
  r.get('/manifest.webmanifest', (ctx) => manifest(ctx, false));
  r.get('/admin.webmanifest', (ctx) => manifest(ctx, true));
  r.get('/share.jpg', shareImage);
  r.get('/robots.txt', robots);
  r.get('/icons/:name', (ctx) => icon(ctx));
  r.get('/splash/:name', splash);
  r.get('/favicon.ico', (ctx) => icon(ctx, 'favicon.ico'));
  r.get('/media/:id', media);
}
