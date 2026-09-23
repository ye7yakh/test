// What customers (and anyone) can see on a salon's subdomain: the salon page data,
// the per-salon PWA manifest and icons, and the salon's images.
import { loadSalonWeek } from '../hours.js';
import { one, query, pool } from '../db.js';
import { HttpError, ok, type Ctx, type Router } from '../http.js';
import { loadMediaBytes, mediaUrl, renderIcon } from '../media.js';
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

function manifest(ctx: Ctx) {
  const salon = requireSalon(ctx);
  const v = `${salon.logo_media_id ?? 'default'}-${salon.color_primary.slice(1)}`;
  const body = {
    id: '/',
    name: salon.name_ar,
    short_name: salon.name_ar.length > 12 && salon.name_en ? salon.name_en : salon.name_ar,
    lang: 'ar',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: salon.color_primary,
    icons: [
      { src: `/icons/icon-192.png?v=${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: `/icons/icon-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: `/icons/maskable-512.png?v=${v}`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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

// Rendered icons, keyed by everything that affects them. Small and bounded.
const iconCache = new Map<string, Buffer>();

const PLATFORM_COLOR = '#1f2a37';

// The salon's icon; the platform host (no salon) gets the default mark.
async function icon(ctx: Ctx, name = ctx.params.name ?? '') {
  const salon = ctx.host.salon;
  const spec = ICONS[name];
  if (!spec || (!salon && name !== 'favicon.ico')) throw new HttpError(404, 'not_found');
  const primary = salon?.color_primary ?? PLATFORM_COLOR;
  const key = `${salon?.id ?? 0}:${salon?.logo_media_id}:${primary}:${name}`;
  let png = iconCache.get(key);
  if (!png) {
    const logo = salon?.logo_media_id ? await loadMediaBytes(pool, salon.id, salon.logo_media_id) : null;
    png = await renderIcon(spec.size, primary, logo, spec.padding);
    if (iconCache.size > 500) iconCache.delete(iconCache.keys().next().value!);
    iconCache.set(key, png);
  }
  ctx.res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': png.length,
    'Cache-Control': 'public, max-age=86400',
  });
  ctx.res.end(png);
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
  r.get('/manifest.webmanifest', manifest);
  r.get('/icons/:name', (ctx) => icon(ctx));
  r.get('/favicon.ico', (ctx) => icon(ctx, 'favicon.ico'));
  r.get('/media/:id', media);
}
