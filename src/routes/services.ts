// Salon owner: the service menu (name, duration, price) and who performs each service.
import { requireOwner } from '../auth.js';
import { one, pool, query, tx, type Db } from '../db.js';
import { HttpError, ok, readJson, type Ctx, type Router } from '../http.js';
import { bool, CURRENCIES, idList, Input, int, parseId, price, text, type Parser } from '../validate.js';

const SERVICE_SELECT = `
  select s.id, s.name_ar, s.name_en, s.description_ar, s.description_en, s.duration_min, trim_scale(s.price)::text as price,
         s.price_is_from, s.active, s.sort_order,
         coalesce(array_agg(ss.staff_id order by ss.staff_id) filter (where ss.staff_id is not null), '{}') as staff_ids
    from services s
    left join staff_services ss on ss.service_id = s.id`;

async function listServices(db: Db, salonId: number) {
  return query(`${SERVICE_SELECT} where s.salon_id = $1 group by s.id order by s.sort_order, s.id`, [salonId], db);
}

/** Replaces the rows of staff_services for one side, after checking every id belongs to this salon. */
export async function setLinks(
  db: Db,
  salonId: number,
  side: { serviceId: number } | { staffId: number },
  otherIds: number[],
): Promise<void> {
  const otherTable = 'serviceId' in side ? 'staff' : 'services';
  const field = 'serviceId' in side ? 'staff_ids' : 'service_ids';
  const found = await query<{ id: number }>(`select id from ${otherTable} where salon_id = $1 and id = any($2::bigint[])`, [
    salonId,
    otherIds,
  ], db);
  if (found.length !== otherIds.length) throw new HttpError(400, 'invalid', field);
  if ('serviceId' in side) {
    await query('delete from staff_services where salon_id = $1 and service_id = $2', [salonId, side.serviceId], db);
    await query(
      `insert into staff_services (salon_id, staff_id, service_id) select $1, unnest($3::bigint[]), $2`,
      [salonId, side.serviceId, otherIds],
      db,
    );
  } else {
    await query('delete from staff_services where salon_id = $1 and staff_id = $2', [salonId, side.staffId], db);
    await query(
      `insert into staff_services (salon_id, staff_id, service_id) select $1, $2, unnest($3::bigint[])`,
      [salonId, side.staffId, otherIds],
      db,
    );
  }
}

function readService(ctx: Ctx, b: Input, creating: boolean) {
  const decimals = CURRENCIES[ctx.host.salon!.currency] ?? 2;
  const pick = <T,>(key: string, parse: Parser<T>): T | undefined => (creating ? b.req(key, parse) : b.opt(key, parse));
  return {
    name_ar: pick('name_ar', text(80, 1)),
    name_en: b.opt('name_en', text(80)),
    description_ar: b.opt('description_ar', text(300)),
    description_en: b.opt('description_en', text(300)),
    duration_min: pick('duration_min', int(5, 600)),
    price: pick('price', price(decimals)),
    price_is_from: b.opt('price_is_from', bool),
    active: b.opt('active', bool),
  };
}

async function createService(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const b = new Input(await readJson(ctx));
  const f = readService(ctx, b, true);
  const staffIds = b.opt('staff_ids', idList);
  const id = await tx(async (db) => {
    const row = await one<{ id: number }>(
      `insert into services (salon_id, name_ar, name_en, description_ar, description_en, duration_min, price,
                             price_is_from, active, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9,
               (select coalesce(max(sort_order), 0) + 1 from services where salon_id = $1))
       returning id`,
      [salonId, f.name_ar, f.name_en ?? '', f.description_ar ?? '', f.description_en ?? '', f.duration_min, f.price,
        f.price_is_from ?? false, f.active ?? true],
      db,
    );
    // By default a new service is offered by the whole team.
    const ids = staffIds ?? (await query<{ id: number }>('select id from staff where salon_id = $1', [salonId], db)).map((s) => s.id);
    await setLinks(db, salonId, { serviceId: row!.id }, ids);
    return row!.id;
  });
  ok(ctx, { services: await listServices(pool, salonId), id }, 201);
}

async function updateService(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const id = parseId(ctx.params.id);
  const b = new Input(await readJson(ctx));
  const f = readService(ctx, b, false);
  const staffIds = b.opt('staff_ids', idList);
  const entries = Object.entries(f).filter(([, v]) => v !== undefined);
  await tx(async (db) => {
    const exists = await one('select 1 from services where salon_id = $1 and id = $2 for update', [salonId, id], db);
    if (!exists) throw new HttpError(404, 'not_found');
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 3}`).join(', ');
      await query(`update services set ${sets}, updated_at = now() where salon_id = $1 and id = $2`, [
        salonId,
        id,
        ...entries.map(([, v]) => v),
      ], db);
    }
    if (staffIds) await setLinks(db, salonId, { serviceId: id }, staffIds);
  });
  ok(ctx, { services: await listServices(pool, salonId) });
}

async function deleteService(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const id = parseId(ctx.params.id);
  const row = await one('delete from services where salon_id = $1 and id = $2 returning id', [salonId, id]);
  if (!row) throw new HttpError(404, 'not_found');
  ok(ctx, { services: await listServices(pool, salonId) });
}

async function reorderServices(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const ids = new Input(await readJson(ctx)).req('ids', idList);
  await query(
    `update services s set sort_order = o.pos
       from unnest($2::bigint[]) with ordinality as o(id, pos)
      where s.salon_id = $1 and s.id = o.id`,
    [salonId, ids],
  );
  ok(ctx, { services: await listServices(pool, salonId) });
}

export function serviceRoutes(r: Router) {
  r.get('/api/manage/services', async (ctx) => ok(ctx, { services: await listServices(pool, requireOwner(ctx)) }));
  r.post('/api/manage/services', createService);
  r.put('/api/manage/services/order', reorderServices);
  r.patch('/api/manage/services/:id', updateService);
  r.delete('/api/manage/services/:id', deleteService);
}
