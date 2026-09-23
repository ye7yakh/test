// Platform owner (super admin): create salons and hand them to their owners.
import { checkNewPassword, hashPassword, normalizePhone, requireSuperAdmin } from '../auth.js';
import { one, query, tx } from '../db.js';
import { defaultWeek, saveSalonWeek } from '../hours.js';
import { HttpError, ok, readJson, requestProto, type Ctx, type Router } from '../http.js';
import { config } from '../config.js';
import { RESERVED_SUBDOMAINS, salonUrl } from '../tenancy.js';
import { bool, Input, parseId, text } from '../validate.js';

const subdomain = (v: unknown) => {
  const s = text(32, 1)(v).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(s) || RESERVED_SUBDOMAINS.has(s)) throw new HttpError(400, 'invalid', 'subdomain');
  return s;
};

async function listSalons(ctx: Ctx) {
  requireSuperAdmin(ctx);
  const rows = await query(
    `select s.id, s.subdomain, s.name_ar, s.name_en, s.active, s.created_at,
            coalesce(json_agg(json_build_object('name', u.name, 'phone', u.phone))
                     filter (where u.id is not null), '[]') as owners
       from salons s
       left join salon_members m on m.salon_id = s.id and m.role = 'owner'
       left join users u on u.id = m.user_id
      where s.tenant_id = $1
      group by s.id
      order by s.created_at desc`,
    [ctx.host.tenant.id],
  );
  const proto = requestProto(ctx.req, config.trustProxy);
  ok(ctx, { salons: rows.map((s) => ({ ...s, url: salonUrl(proto, ctx.host, s.subdomain) })) });
}

async function createSalon(ctx: Ctx) {
  requireSuperAdmin(ctx);
  const tenant = ctx.host.tenant;
  const b = new Input(await readJson(ctx));
  const sub = b.req('subdomain', subdomain);
  const nameAr = b.req('name_ar', text(80, 1));
  const nameEn = b.opt('name_en', text(80)) ?? '';
  const ownerName = b.opt('owner_name', text(60)) ?? '';
  const ownerPhone = normalizePhone(b.req('owner_phone', text(30, 1)), tenant.default_calling_code);
  if (!ownerPhone) throw new HttpError(400, 'invalid', 'owner_phone');

  const result = await tx(async (db) => {
    const taken = await one('select 1 from salons where tenant_id = $1 and subdomain = $2', [tenant.id, sub], db);
    if (taken) throw new HttpError(409, 'subdomain_taken', 'subdomain');

    let owner = await one<{ id: number }>('select id from users where tenant_id = $1 and phone = $2', [tenant.id, ownerPhone], db);
    const ownerCreated = !owner;
    if (!owner) {
      // New owners get the password the admin sets and can change it from their dashboard.
      const password = checkNewPassword(b.req('owner_password', (v) => v));
      owner = await one<{ id: number }>(
        'insert into users (tenant_id, phone, name, password_hash) values ($1, $2, $3, $4) returning id',
        [tenant.id, ownerPhone, ownerName, await hashPassword(password)],
        db,
      );
    }
    const salon = await one<{ id: number }>(
      `insert into salons (tenant_id, subdomain, name_ar, name_en, timezone, currency)
       values ($1, $2, $3, $4, $5, $6) returning id`,
      [tenant.id, sub, nameAr, nameEn, tenant.default_timezone, tenant.default_currency],
      db,
    );
    await query(`insert into salon_members (salon_id, user_id, role) values ($1, $2, 'owner')`, [salon!.id, owner!.id], db);
    await saveSalonWeek(db, salon!.id, defaultWeek());
    return { id: salon!.id, ownerCreated };
  });
  const proto = requestProto(ctx.req, config.trustProxy);
  ok(ctx, { id: result.id, subdomain: sub, url: salonUrl(proto, ctx.host, sub), owner_created: result.ownerCreated }, 201);
}

async function updateSalon(ctx: Ctx) {
  requireSuperAdmin(ctx);
  const id = parseId(ctx.params.id);
  const b = new Input(await readJson(ctx));
  const active = b.req('active', bool);
  const row = await one('update salons set active = $3, updated_at = now() where tenant_id = $1 and id = $2 returning id', [
    ctx.host.tenant.id,
    id,
    active,
  ]);
  if (!row) throw new HttpError(404, 'not_found');
  if (!active) await query('delete from sessions where salon_id = $1', [id]);
  ok(ctx);
}

export function adminRoutes(r: Router) {
  r.get('/api/admin/salons', listSalons);
  r.post('/api/admin/salons', createSalon);
  r.patch('/api/admin/salons/:id', updateSalon);
}
