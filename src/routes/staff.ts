// Salon owner: the team (barbers / stylists), their photos, services and hours.
import { requireOwner } from '../auth.js';
import { one, pool, query, tx, type Db } from '../db.js';
import { formatWeek, parseWeek, saveStaffWeek, type HoursRow } from '../hours.js';
import { HttpError, ok, readJson, type Ctx, type Router } from '../http.js';
import { deleteMedia, intakeImage, loadMediaBytes, mediaUrl, readImageUpload, renderPortrait, saveMedia } from '../media.js';
import type { PhotoStyle } from '../tenancy.js';
import { bool, idList, Input, parseId, text } from '../validate.js';
import { setLinks } from './services.js';

async function listStaff(db: Db, salonId: number) {
  const [rows, hours] = await Promise.all([
    query(
      `select st.id, st.name_ar, st.name_en, st.title_ar, st.title_en, st.photo_id, st.photo_original_id,
              st.custom_hours, st.active, st.sort_order,
              coalesce(array_agg(ss.service_id order by ss.service_id) filter (where ss.service_id is not null), '{}') as service_ids
         from staff st
         left join staff_services ss on ss.staff_id = st.id
        where st.salon_id = $1
        group by st.id
        order by st.sort_order, st.id`,
      [salonId],
      db,
    ),
    query<HoursRow & { staff_id: number }>('select staff_id, weekday, open_min, close_min from staff_hours where salon_id = $1', [salonId], db),
  ]);
  return rows.map(({ photo_id, photo_original_id, ...s }) => ({
    ...s,
    photo_url: mediaUrl(photo_id),
    original_photo_url: mediaUrl(photo_original_id),
    hours: s.custom_hours ? formatWeek(hours.filter((h) => h.staff_id === s.id)) : null,
  }));
}

function readStaff(b: Input, creating: boolean) {
  return {
    name_ar: creating ? b.req('name_ar', text(60, 1)) : b.opt('name_ar', text(60, 1)),
    name_en: b.opt('name_en', text(60)),
    title_ar: b.opt('title_ar', text(60)),
    title_en: b.opt('title_en', text(60)),
    active: b.opt('active', bool),
    custom_hours: b.opt('custom_hours', bool),
  };
}

async function createStaff(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const b = new Input(await readJson(ctx));
  const f = readStaff(b, true);
  const serviceIds = b.opt('service_ids', idList);
  const hours = f.custom_hours ? parseWeek(b.req('hours', (v) => v)) : null;
  const id = await tx(async (db) => {
    const row = await one<{ id: number }>(
      `insert into staff (salon_id, name_ar, name_en, title_ar, title_en, active, custom_hours, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, (select coalesce(max(sort_order), 0) + 1 from staff where salon_id = $1))
       returning id`,
      [salonId, f.name_ar, f.name_en ?? '', f.title_ar ?? '', f.title_en ?? '', f.active ?? true, f.custom_hours ?? false],
      db,
    );
    // By default a new team member offers every service.
    const ids = serviceIds ?? (await query<{ id: number }>('select id from services where salon_id = $1', [salonId], db)).map((s) => s.id);
    await setLinks(db, salonId, { staffId: row!.id }, ids);
    if (hours) await saveStaffWeek(db, salonId, row!.id, hours);
    return row!.id;
  });
  ok(ctx, { staff: await listStaff(pool, salonId), id }, 201);
}

async function updateStaff(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const id = parseId(ctx.params.id);
  const b = new Input(await readJson(ctx));
  const f = readStaff(b, false);
  const serviceIds = b.opt('service_ids', idList);
  const rawHours = b.opt('hours', (v) => v);
  const hours = rawHours == null ? null : parseWeek(rawHours);
  const entries = Object.entries(f).filter(([, v]) => v !== undefined);
  await tx(async (db) => {
    const current = await one<{ custom_hours: boolean }>('select custom_hours from staff where salon_id = $1 and id = $2 for update', [salonId, id], db);
    if (!current) throw new HttpError(404, 'not_found');
    const custom = f.custom_hours ?? current.custom_hours;
    // Switching to their own hours needs the hours themselves.
    if (custom && !current.custom_hours && !hours) throw new HttpError(400, 'required', 'hours');
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 3}`).join(', ');
      await query(`update staff set ${sets}, updated_at = now() where salon_id = $1 and id = $2`, [salonId, id, ...entries.map(([, v]) => v)], db);
    }
    if (serviceIds) await setLinks(db, salonId, { staffId: id }, serviceIds);
    if (custom && hours) await saveStaffWeek(db, salonId, id, hours);
    if (!custom) await query('delete from staff_hours where salon_id = $1 and staff_id = $2', [salonId, id], db);
  });
  ok(ctx, { staff: await listStaff(pool, salonId) });
}

async function deleteStaff(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const id = parseId(ctx.params.id);
  await tx(async (db) => {
    const row = await one<{ photo_id: string | null; photo_original_id: string | null }>(
      'delete from staff where salon_id = $1 and id = $2 returning photo_id, photo_original_id',
      [salonId, id],
      db,
    );
    if (!row) throw new HttpError(404, 'not_found');
    await deleteMedia(db, salonId, [row.photo_id, row.photo_original_id]);
  });
  ok(ctx, { staff: await listStaff(pool, salonId) });
}

async function reorderStaff(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const ids = new Input(await readJson(ctx)).req('ids', idList);
  await query(
    `update staff s set sort_order = o.pos
       from unnest($2::bigint[]) with ordinality as o(id, pos)
      where s.salon_id = $1 and s.id = o.id`,
    [salonId, ids],
  );
  ok(ctx, { staff: await listStaff(pool, salonId) });
}

// ---------------------------------------------------------------- photos

async function uploadPhoto(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const salon = ctx.host.salon!;
  const id = parseId(ctx.params.id);
  const original = await intakeImage(await readImageUpload(ctx), 300);
  // Render before taking any locks: this is the slow part.
  const styled = await renderPortrait(original.bytes, salon.photo_style, salon.color_accent);
  await tx(async (db) => {
    const current = await one<{ photo_id: string | null; photo_original_id: string | null }>(
      'select photo_id, photo_original_id from staff where salon_id = $1 and id = $2 for update',
      [salonId, id],
      db,
    );
    if (!current) throw new HttpError(404, 'not_found');
    const originalId = await saveMedia(db, salonId, original);
    const styledId = await saveMedia(db, salonId, styled);
    await query('update staff set photo_original_id = $3, photo_id = $4, updated_at = now() where salon_id = $1 and id = $2', [
      salonId,
      id,
      originalId,
      styledId,
    ], db);
    await deleteMedia(db, salonId, [current.photo_id, current.photo_original_id]);
  });
  ok(ctx, { staff: await listStaff(pool, salonId) });
}

async function removePhoto(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const id = parseId(ctx.params.id);
  await tx(async (db) => {
    const current = await one<{ photo_id: string | null; photo_original_id: string | null }>(
      'select photo_id, photo_original_id from staff where salon_id = $1 and id = $2 for update',
      [salonId, id],
      db,
    );
    if (!current) throw new HttpError(404, 'not_found');
    await query('update staff set photo_original_id = null, photo_id = null, updated_at = now() where salon_id = $1 and id = $2', [salonId, id], db);
    await deleteMedia(db, salonId, [current.photo_id, current.photo_original_id]);
  });
  ok(ctx, { staff: await listStaff(pool, salonId) });
}

/** Re-renders every team photo from its original, after the salon's photo style or accent changes. */
export async function rerenderTeamPhotos(db: Db, salonId: number, style: PhotoStyle, accent: string): Promise<void> {
  const rows = await query<{ id: number; photo_id: string | null; photo_original_id: string }>(
    'select id, photo_id, photo_original_id from staff where salon_id = $1 and photo_original_id is not null for update',
    [salonId],
    db,
  );
  for (const row of rows) {
    const original = await loadMediaBytes(db, salonId, row.photo_original_id);
    if (!original) continue;
    const styledId = await saveMedia(db, salonId, await renderPortrait(original, style, accent));
    await query('update staff set photo_id = $3, updated_at = now() where salon_id = $1 and id = $2', [salonId, row.id, styledId], db);
    await deleteMedia(db, salonId, [row.photo_id]);
  }
}

export function staffRoutes(r: Router) {
  r.get('/api/manage/staff', async (ctx) => ok(ctx, { staff: await listStaff(pool, requireOwner(ctx)) }));
  r.post('/api/manage/staff', createStaff);
  r.put('/api/manage/staff/order', reorderStaff);
  r.patch('/api/manage/staff/:id', updateStaff);
  r.delete('/api/manage/staff/:id', deleteStaff);
  r.put('/api/manage/staff/:id/photo', uploadPhoto);
  r.delete('/api/manage/staff/:id/photo', removePhoto);
}
