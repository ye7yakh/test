// Salon owner: profile, look and feel, logo and opening hours.
import { requireOwner } from '../auth.js';
import { one, pool, query, tx } from '../db.js';
import { loadSalonWeek, parseWeek, saveSalonWeek } from '../hours.js';
import { ok, readJson, type Ctx, type Router } from '../http.js';
import { deleteMedia, intakeImage, mediaUrl, PHOTO_STYLES, readImageUpload, saveMedia } from '../media.js';
import { SALON_COLUMNS, type Salon } from '../tenancy.js';
import { color, currency, CURRENCIES, Input, oneOf, text, timezone } from '../validate.js';
import { rerenderTeamPhotos } from './staff.js';

async function salonBody(salonId: number) {
  const s = (await one<Salon>(`select ${SALON_COLUMNS} from salons where id = $1`, [salonId]))!;
  const { logo_media_id, tenant_id, active, updated_at, ...rest } = s;
  return {
    salon: { ...rest, logo_url: mediaUrl(logo_media_id) },
    hours: await loadSalonWeek(pool, salonId),
    options: { currencies: CURRENCIES, photo_styles: PHOTO_STYLES },
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
  };
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

async function uploadLogo(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const img = await intakeImage(await readImageUpload(ctx), 64);
  await tx(async (db) => {
    const id = await saveMedia(db, salonId, img);
    const old = await one<{ logo_media_id: string | null }>('select logo_media_id from salons where id = $1 for update', [salonId], db);
    await query('update salons set logo_media_id = $2, updated_at = now() where id = $1', [salonId, id], db);
    await deleteMedia(db, salonId, [old?.logo_media_id]);
  });
  ok(ctx, await salonBody(salonId));
}

async function removeLogo(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  await tx(async (db) => {
    const old = await one<{ logo_media_id: string | null }>('select logo_media_id from salons where id = $1 for update', [salonId], db);
    await query('update salons set logo_media_id = null, updated_at = now() where id = $1', [salonId], db);
    await deleteMedia(db, salonId, [old?.logo_media_id]);
  });
  ok(ctx, await salonBody(salonId));
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
  r.put('/api/manage/salon/logo', uploadLogo);
  r.delete('/api/manage/salon/logo', removeLogo);
  r.put('/api/manage/hours', updateHours);
}
