// Salon owner: profile, look and feel, logo and opening hours.
import { requireOwner } from '../auth.js';
import { one, pool, query, tx } from '../db.js';
import { loadSalonWeek, parseWeek, saveSalonWeek } from '../hours.js';
import { ok, readJson, type Ctx, type Router } from '../http.js';
import { deleteMedia, intakeImage, mediaUrl, PHOTO_STYLES, readImageUpload, saveMedia } from '../media.js';
import { iconVersion } from '../brand.js';
import { SALON_COLUMNS, type Salon } from '../tenancy.js';
import { bool, color, currency, CURRENCIES, Input, int, oneOf, price, text, timezone } from '../validate.js';
import { HttpError } from '../http.js';
import { SERVICE_ICONS } from './services.js';
import { rerenderTeamPhotos } from './staff.js';

async function salonBody(salonId: number) {
  const s = (await one<Salon>(`select ${SALON_COLUMNS} from salons where id = $1`, [salonId]))!;
  const { logo_media_id, cover_media_id, icon_media_id, tenant_id, active, updated_at, ...rest } = s;
  return {
    salon: { ...rest, logo_url: mediaUrl(logo_media_id), cover_url: mediaUrl(cover_media_id), icon_url: mediaUrl(icon_media_id), icon_v: iconVersion(s) },
    hours: await loadSalonWeek(pool, salonId),
    options: { currencies: CURRENCIES, photo_styles: PHOTO_STYLES, service_icons: SERVICE_ICONS },
  };
}

async function updateSalon(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const current = ctx.host.salon!;
  const b = new Input(await readJson(ctx));
  const fields = {
    name_ar: b.opt('name_ar', text(80, 1)),
    name_en: b.opt('name_en', text(80)),
    about_ar: b.opt('about_ar', text(600)),
    about_en: b.opt('about_en', text(600)),
    phone: b.opt('phone', text(30)),
    address: b.opt('address', text(200)),
    timezone: b.opt('timezone', timezone),
    currency: b.opt('currency', currency),
    color_primary: b.opt('color_primary', color),
    color_accent: b.opt('color_accent', color),
    photo_style: b.opt('photo_style', oneOf(PHOTO_STYLES)),
    icon_bg: b.opt('icon_bg', oneOf(['auto', 'white', 'primary', 'night'] as const)),
    page_theme: b.opt('page_theme', oneOf(['night', 'day'] as const)),
    studio_theme: b.opt('studio_theme', oneOf(['studio', 'brand'] as const)),
    booking_enabled: b.opt('booking_enabled', bool),
    cliq_required: b.opt('cliq_required', bool),
    cliq_alias: b.opt('cliq_alias', text(60)),
    cliq_name: b.opt('cliq_name', text(80)),
    deposit_kind: b.opt('deposit_kind', oneOf(['fixed', 'full'] as const)),
    deposit_amount: b.opt('deposit_amount', price(3)),
    payment_window_min: b.opt('payment_window_min', int(5, 1440)),
  };
  // Customers need somewhere to send the deposit.
  const requiresCliq = fields.cliq_required ?? current.cliq_required;
  if (requiresCliq && !(fields.cliq_alias ?? current.cliq_alias)) throw new HttpError(400, 'required', 'cliq_alias');
  // Keys come from the object above, never from the request.
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  await tx(async (db) => {
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      await query(`update salons set ${sets}, updated_at = now() where id = $1`, [salonId, ...entries.map(([, v]) => v)], db);
    }
    const style = fields.photo_style ?? current.photo_style;
    const accent = fields.color_accent ?? current.color_accent;
    if (style !== current.photo_style || (style === 'brand' && accent !== current.color_accent)) {
      await rerenderTeamPhotos(db, salonId, style, accent);
    }
  });
  ok(ctx, await salonBody(salonId));
}

// The salon's pictures: logo, cover banner and its own app icon. Each is a file
// saved straight away (not part of the brand draft); the old one is deleted.
const BRAND_IMAGES = {
  logo: { column: 'logo_media_id', minSide: 64 },
  cover: { column: 'cover_media_id', minSide: 300 },
  icon: { column: 'icon_media_id', minSide: 192 },
} as const;
type BrandImage = keyof typeof BRAND_IMAGES;

function uploadBrandImage(kind: BrandImage) {
  return async (ctx: Ctx) => {
    const salonId = requireOwner(ctx);
    const { column, minSide } = BRAND_IMAGES[kind];
    const img = await intakeImage(await readImageUpload(ctx), minSide);
    await tx(async (db) => {
      const id = await saveMedia(db, salonId, img);
      const old = await one<Record<string, string | null>>(`select ${column} from salons where id = $1 for update`, [salonId], db);
      await query(`update salons set ${column} = $2, updated_at = now() where id = $1`, [salonId, id], db);
      await deleteMedia(db, salonId, [old?.[column]]);
    });
    ok(ctx, await salonBody(salonId));
  };
}

function removeBrandImage(kind: BrandImage) {
  return async (ctx: Ctx) => {
    const salonId = requireOwner(ctx);
    const { column } = BRAND_IMAGES[kind];
    await tx(async (db) => {
      const old = await one<Record<string, string | null>>(`select ${column} from salons where id = $1 for update`, [salonId], db);
      await query(`update salons set ${column} = null, updated_at = now() where id = $1`, [salonId], db);
      await deleteMedia(db, salonId, [old?.[column]]);
    });
    ok(ctx, await salonBody(salonId));
  };
}

async function updateHours(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const body = await readJson(ctx);
  const rows = parseWeek(body.hours);
  await tx((db) => saveSalonWeek(db, salonId, rows));
  ok(ctx, await salonBody(salonId));
}

export function salonRoutes(r: Router) {
  r.get('/api/manage/salon', async (ctx) => ok(ctx, await salonBody(requireOwner(ctx))));
  r.patch('/api/manage/salon', updateSalon);
  for (const kind of Object.keys(BRAND_IMAGES) as BrandImage[]) {
    r.put(`/api/manage/salon/${kind}`, uploadBrandImage(kind));
    r.delete(`/api/manage/salon/${kind}`, removeBrandImage(kind));
  }
  r.put('/api/manage/hours', updateHours);
}
