// Salon owner: the team (barbers / stylists), their photos, services and hours, and
// each barber's own sign-in to see his schedule.
import { clearLoginFailures, hashPassword, normalizePhone, requireMember, requireOwner, temporaryPassword } from '../auth.js';
import { one, pool, query, tx, type Db } from '../db.js';
import { formatWeek, parseWeek, saveStaffWeek, type HoursRow } from '../hours.js';
import { HttpError, ok, readJson, type Ctx, type Router } from '../http.js';
import { deleteMedia, intakeImage, mediaUrl, readImageUpload, renderPortrait, saveMedia } from '../media.js';
import type { PhotoStyle } from '../tenancy.js';
import { bool, idList, Input, parseId, text } from '../validate.js';
import { setLinks } from './services.js';

async function listStaff(db: Db, salonId: number) {
  const [rows, hours] = await Promise.all([
    query(
      `select st.id, st.name_ar, st.name_en, st.title_ar, st.title_en, st.photo_id, st.photo_original_id,
              st.custom_hours, st.active, st.sort_order,
              coalesce(array_agg(ss.service_id order by ss.service_id) filter (where ss.service_id is not null), '{}') as service_ids,
              -- His own sign-in, if the owner gave him one.
              (select json_build_object('phone', u.phone, 'last_seen_at', m.last_seen_at, 'must_change_password', u.must_change_password)
                 from salon_members m join users u on u.id = m.user_id
                where m.salon_id = st.salon_id and m.staff_id = st.id) as login
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
    // His sign-in goes with him: his sessions here, the membership (it cascades), and
    // the account made for it.
    const login = await one<{ user_id: number }>('select user_id from salon_members where salon_id = $1 and staff_id = $2', [salonId, id], db);
    if (login) await query('delete from sessions where salon_id = $1 and user_id = $2', [salonId, login.user_id], db);
    const row = await one<{ photo_id: string | null; photo_original_id: string | null }>(
      'delete from staff where salon_id = $1 and id = $2 returning photo_id, photo_original_id',
      [salonId, id],
      db,
    );
    if (!row) throw new HttpError(404, 'not_found');
    if (login) await dropOrphanAccount(db, login.user_id);
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
    // The salon's look now, under a lock a change of style waits for. A style saved
    // while this photo was rendering is applied here (rare, so rendering again inside
    // the transaction is fine); one saved after this commits finds the photo and
    // restyles it with the rest (salon.ts).
    const look = await one<{ photo_style: PhotoStyle; color_accent: string }>(
      'select photo_style, color_accent from salons where id = $1 for share',
      [salonId],
      db,
    );
    const current = await one<{ photo_id: string | null; photo_original_id: string | null }>(
      'select photo_id, photo_original_id from staff where salon_id = $1 and id = $2 for update',
      [salonId, id],
      db,
    );
    if (!look || !current) throw new HttpError(404, 'not_found');
    const stale = look.photo_style !== salon.photo_style || (look.photo_style === 'brand' && look.color_accent !== salon.color_accent);
    const originalId = await saveMedia(db, salonId, original);
    const styledId = await saveMedia(db, salonId, stale ? await renderPortrait(original.bytes, look.photo_style, look.color_accent) : styled);
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

// ---------------------------------------------------------------- a barber's own sign-in

/**
 * A barber's account exists for his sign-in here, so it goes when that does: unless the
 * platform admin has since made him a salon owner too.
 */
async function dropOrphanAccount(db: Db, userId: number) {
  await query(
    `delete from users where id = $1 and not is_super_admin and not exists (select 1 from salon_members where user_id = $1)`,
    [userId],
    db,
  );
}

/**
 * Gives a barber his own sign-in: his phone number, and a temporary password the owner
 * hands him (he sets his own at first sign-in). The account is always a new one made
 * here: a number that already has an account on the platform (an owner, a barber at
 * another salon, the admin) is refused, so no owner ever holds or sets the password of
 * an account someone else uses.
 */
async function giveLogin(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const tenant = ctx.host.tenant;
  const id = parseId(ctx.params.id);
  const phone = normalizePhone(new Input(await readJson(ctx)).req('phone', text(30, 1)), tenant.default_calling_code);
  if (!phone) throw new HttpError(400, 'invalid', 'phone');
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  await tx(async (db) => {
    // "for update": two taps at once give one sign-in, not a database error.
    const member = await one<{ name_ar: string }>('select name_ar from staff where salon_id = $1 and id = $2 for update', [salonId, id], db);
    if (!member) throw new HttpError(404, 'not_found');
    // One sign-in per barber: the owner removes the old one first.
    if (await one('select 1 from salon_members where salon_id = $1 and staff_id = $2', [salonId, id], db)) throw new HttpError(409, 'phone_in_use', 'phone');
    const user = await one<{ id: number }>(
      `insert into users (tenant_id, phone, name, password_hash, must_change_password) values ($1, $2, $3, $4, true)
       on conflict (tenant_id, phone) do nothing returning id`,
      [tenant.id, phone, member.name_ar, hash],
      db,
    );
    if (!user) throw new HttpError(409, 'phone_in_use', 'phone');
    await query(`insert into salon_members (salon_id, user_id, role, staff_id) values ($1, $2, 'staff', $3)`, [salonId, user.id, id], db);
  });
  ok(ctx, { staff: await listStaff(pool, salonId), password }, 201);
}

/**
 * A new temporary password for a barber who forgot his. Only for an account that is
 * his alone here: one the platform admin has since made a salon owner is not this
 * owner's to reset.
 */
async function resetLogin(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const tenant = ctx.host.tenant;
  const id = parseId(ctx.params.id);
  const password = temporaryPassword();
  const hash = await hashPassword(password);
  const phone = await tx(async (db) => {
    const user = await one<{ id: number; phone: string; elsewhere: boolean }>(
      `select u.id, u.phone, u.is_super_admin or exists (select 1 from salon_members o where o.user_id = u.id and o.salon_id <> $1) as elsewhere
         from salon_members m join users u on u.id = m.user_id
        where m.salon_id = $1 and m.staff_id = $2
        for update of u`,
      [salonId, id],
      db,
    );
    if (!user) throw new HttpError(404, 'not_found');
    if (user.elsewhere) throw new HttpError(409, 'password_elsewhere');
    await query('update users set password_hash = $2, must_change_password = true where id = $1', [user.id, hash], db);
    // Whoever was signed in with the old password is out.
    await query('delete from sessions where user_id = $1', [user.id], db);
    return user.phone;
  });
  clearLoginFailures(`${tenant.id}:${phone}`);
  ok(ctx, { staff: await listStaff(pool, salonId), password });
}

/** Takes a barber's sign-in away (he left, or the number was wrong); he is signed out here. */
async function removeLogin(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const id = parseId(ctx.params.id);
  await tx(async (db) => {
    const row = await one<{ user_id: number }>('delete from salon_members where salon_id = $1 and staff_id = $2 returning user_id', [salonId, id], db);
    if (!row) throw new HttpError(404, 'not_found');
    await query('delete from sessions where user_id = $1 and salon_id = $2', [row.user_id, salonId], db);
    await dropOrphanAccount(db, row.user_id);
  });
  ok(ctx, { staff: await listStaff(pool, salonId) });
}

export function staffRoutes(r: Router) {
  r.get('/api/manage/staff', async (ctx) => {
    const { salonId, staffId } = requireMember(ctx);
    const staff = await listStaff(pool, salonId);
    // A barber sees his colleagues, not their sign-ins.
    ok(ctx, { staff: staffId == null ? staff : staff.map(({ login: _login, ...s }) => s) });
  });
  r.put('/api/manage/staff/:id/login', giveLogin);
  r.post('/api/manage/staff/:id/login/reset', resetLogin);
  r.delete('/api/manage/staff/:id/login', removeLogin);
  r.post('/api/manage/staff', createStaff);
  r.put('/api/manage/staff/order', reorderStaff);
  r.patch('/api/manage/staff/:id', updateStaff);
  r.delete('/api/manage/staff/:id', deleteStaff);
  r.put('/api/manage/staff/:id/photo', uploadPhoto);
  r.delete('/api/manage/staff/:id/photo', removePhoto);
}
