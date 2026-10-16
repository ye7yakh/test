// Salon owner: profile, look and feel, logo and opening hours.
import { requireMember, requireOwner } from '../auth.js';
import { one, pool, query, tx } from '../db.js';
import { loadSalonWeek, parseWeek, saveSalonWeek } from '../hours.js';
import { ok, readJson, type Ctx, type Router } from '../http.js';
import { deleteMedia, intakeImage, loadMediaBytes, mediaUrl, PHOTO_STYLES, readImageUpload, renderPortrait, saveMedia } from '../media.js';
import { iconVersion } from '../brand.js';
import { SALON_COLUMNS, type PhotoStyle, type Salon } from '../tenancy.js';
import { bool, color, currency, CURRENCIES, Input, int, oneOf, price, text, timezone } from '../validate.js';
import { HttpError } from '../http.js';
import { SERVICE_ICONS } from './services.js';
import { tryonProvider } from '../tryon.js';

async function salonBody(salonId: number) {
  const s = (await one<Salon>(`select ${SALON_COLUMNS} from salons where id = $1`, [salonId]))!;
  const { logo_media_id, cover_media_id, icon_media_id, tenant_id, active, updated_at, ...rest } = s;
  return {
    salon: { ...rest, logo_url: mediaUrl(logo_media_id), cover_url: mediaUrl(cover_media_id), icon_url: mediaUrl(icon_media_id), icon_v: iconVersion(s) },
    hours: await loadSalonWeek(pool, salonId),
    // tryon_available: the platform has an AI image model, so the owner can offer the mirror.
    options: { currencies: CURRENCIES, photo_styles: PHOTO_STYLES, service_icons: SERVICE_ICONS, tryon_available: tryonProvider() !== null },
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
    tryon: b.opt('tryon', oneOf(['off', 'on'] as const)),
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
  // The look the photos had, read under the same lock as the change, so two quick
  // changes in a row each compare with what the other left.
  const was = await tx(async (db) => {
    const row = await one<{ photo_style: PhotoStyle; color_accent: string }>('select photo_style, color_accent from salons where id = $1 for no key update', [salonId], db);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`).join(', ');
      await query(`update salons set ${sets}, updated_at = now() where id = $1`, [salonId, ...entries.map(([, v]) => v)], db);
    }
    return row!;
  });
  const style = fields.photo_style ?? was.photo_style;
  const accent = fields.color_accent ?? was.color_accent;
  // Saved first; the photos follow, outside that transaction, and the reply waits for them.
  if (style !== was.photo_style || (style === 'brand' && accent !== was.color_accent)) {
    await rerenderTeamPhotos(salonId, style, accent);
  }
  ok(ctx, await salonBody(salonId));
}

/**
 * Re-renders every team photo from its original after the salon's photo style or
 * accent changes. The rendering (a quarter of a second a photo) runs with no
 * transaction open and no locks held, two at a time; each finished photo is then
 * swapped in by its own short transaction, unless something newer got there first:
 * another change of style (that change renders its own), or a new photo or a removed
 * one for that team member.
 */
async function rerenderTeamPhotos(salonId: number, style: PhotoStyle, accent: string): Promise<void> {
  const rows = await query<{ id: number; photo_original_id: string }>(
    'select id, photo_original_id from staff where salon_id = $1 and photo_original_id is not null order by id',
    [salonId],
  );
  const restyle = async (row: (typeof rows)[number]) => {
    const original = await loadMediaBytes(pool, salonId, row.photo_original_id);
    if (!original) return;
    const styled = await renderPortrait(original, style, accent);
    await tx(async (db) => {
      const look = await one<{ photo_style: PhotoStyle; color_accent: string }>(
        'select photo_style, color_accent from salons where id = $1 for share',
        [salonId],
        db,
      );
      if (!look || look.photo_style !== style || (style === 'brand' && look.color_accent !== accent)) return;
      const member = await one<{ photo_id: string | null; photo_original_id: string | null }>(
        'select photo_id, photo_original_id from staff where salon_id = $1 and id = $2 for update',
        [salonId, row.id],
        db,
      );
      if (!member || member.photo_original_id !== row.photo_original_id) return;
      const styledId = await saveMedia(db, salonId, styled);
      await query('update staff set photo_id = $3, updated_at = now() where salon_id = $1 and id = $2', [salonId, row.id, styledId], db);
      await deleteMedia(db, salonId, [member.photo_id]);
    });
  };
  let next = 0;
  const worker = async () => {
    while (next < rows.length) {
      const row = rows[next++]!;
      // The style is saved already: one photo that fails keeps its earlier look, the rest go on.
      await restyle(row).catch((err) => console.error(`restyle photo of staff ${row.id}`, err));
    }
  };
  await Promise.all([worker(), worker()]);
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
  // Barbers read it too: their studio wears the salon's name, colours and hours.
  r.get('/api/manage/salon', async (ctx) => ok(ctx, await salonBody(requireMember(ctx).salonId)));
  r.patch('/api/manage/salon', updateSalon);
  for (const kind of Object.keys(BRAND_IMAGES) as BrandImage[]) {
    r.put(`/api/manage/salon/${kind}`, uploadBrandImage(kind));
    r.delete(`/api/manage/salon/${kind}`, removeBrandImage(kind));
  }
  r.put('/api/manage/hours', updateHours);
}
