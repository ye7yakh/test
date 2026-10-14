// Platform owner (super admin): create salons, hand them to their owners, and keep
// an eye on them: who is set up, who is busy, who went quiet.
import crypto from 'node:crypto';
import { checkNewPassword, clearLoginFailures, hashPassword, normalizePhone, requireSuperAdmin } from '../auth.js';
import { one, query, tx, type Db } from '../db.js';
import { defaultWeek, saveSalonWeek } from '../hours.js';
import { HttpError, ok, readJson, requestProto, type Ctx, type Router } from '../http.js';
import { config } from '../config.js';
import { clearTenantCache, RESERVED_SUBDOMAINS, salonUrl } from '../tenancy.js';
import { bool, Input, parseId, text } from '../validate.js';

const subdomain = (v: unknown) => {
  const s = text(32, 1)(v).toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,30}[a-z0-9])?$/.test(s) || RESERVED_SUBDOMAINS.has(s)) throw new HttpError(400, 'invalid', 'subdomain');
  return s;
};

/** Free for this salon: not another salon's link, and not another salon's earlier link. */
async function assertSubdomainFree(db: Db, tenantId: number, sub: string, salonId: number | null) {
  const taken = await one(
    `select 1 from salons where tenant_id = $1 and subdomain = $2 and id is distinct from $3
     union all
     select 1 from salon_aliases where tenant_id = $1 and subdomain = $2 and salon_id is distinct from $3`,
    [tenantId, sub, salonId],
    db,
  );
  if (taken) throw new HttpError(409, 'subdomain_taken', 'subdomain');
}

// A booking that was really made: everything but deposit holds that ran out.
const MADE = `(b.status <> 'expired' and not (b.status = 'pending_payment' and b.expires_at <= now()))`;
const UPCOMING = `(b.start_at > now() and (b.status in ('confirmed', 'payment_sent') or (b.status = 'pending_payment' and b.expires_at > now())))`;

interface SalonRow {
  id: number;
  subdomain: string;
  name_ar: string;
  name_en: string;
  active: boolean;
  created_at: Date;
  has_logo: boolean;
  services: number;
  team: number;
  team_without_photo: number;
  bookings_30d: number;
  upcoming: number;
  customers: number;
  owners: { id: number; name: string; phone: string; must_change_password: boolean; last_seen_at: string | null }[];
}

async function salonRows(tenantId: number, salonId: number | null = null): Promise<SalonRow[]> {
  return query<SalonRow>(
    `select s.id, s.subdomain, s.name_ar, s.name_en, s.active, s.created_at, s.logo_media_id is not null as has_logo,
            (select count(*) from services v where v.salon_id = s.id and v.active)::int as services,
            (select count(*) from staff t where t.salon_id = s.id and t.active)::int as team,
            (select count(*) from staff t where t.salon_id = s.id and t.active and t.photo_id is null)::int as team_without_photo,
            (select count(*) from bookings b where b.salon_id = s.id and b.created_at > now() - interval '30 days' and ${MADE})::int as bookings_30d,
            (select count(*) from bookings b where b.salon_id = s.id and ${UPCOMING})::int as upcoming,
            (select count(*) from customers c where c.salon_id = s.id)::int as customers,
            coalesce((select json_agg(json_build_object(
                        'id', u.id, 'name', u.name, 'phone', u.phone,
                        'must_change_password', u.must_change_password, 'last_seen_at', m.last_seen_at) order by m.created_at)
                        from salon_members m join users u on u.id = m.user_id
                       where m.salon_id = s.id and m.role = 'owner'), '[]') as owners
       from salons s
      where s.tenant_id = $1 and ($2::bigint is null or s.id = $2)
      order by s.created_at desc`,
    [tenantId, salonId],
  );
}

/** The four steps the owner's studio walks them through, as the admin sees them. */
function shape(ctx: Ctx, r: SalonRow) {
  const url = salonUrl(requestProto(ctx.req, config.trustProxy), ctx.host, r.subdomain);
  const setup = {
    brand: r.has_logo,
    services: r.services > 0,
    team: r.team > 0,
    photos: r.team > 0 && r.team_without_photo === 0,
  };
  return {
    id: r.id,
    subdomain: r.subdomain,
    name_ar: r.name_ar,
    name_en: r.name_en,
    active: r.active,
    created_at: r.created_at,
    url,
    icon_url: `${url}/icons/icon-192.png`,
    owners: r.owners,
    stats: { bookings_30d: r.bookings_30d, upcoming: r.upcoming, services: r.services, team: r.team, customers: r.customers },
    setup,
    ready: Object.values(setup).every(Boolean),
  };
}

async function listSalons(ctx: Ctx) {
  requireSuperAdmin(ctx);
  const tenant = ctx.host.tenant;
  const salons = (await salonRows(tenant.id)).map((r) => shape(ctx, r));
  // New bookings per day across the platform, last 30 days, in the brand's time zone.
  const series = await query<{ date: string; n: number }>(
    `select to_char(d::date, 'YYYY-MM-DD') as date, coalesce(x.n, 0)::int as n
       from generate_series((now() at time zone $2)::date - 29, (now() at time zone $2)::date, interval '1 day') d
       left join (
         select (b.created_at at time zone $2)::date as day, count(*) as n
           from bookings b join salons s on s.id = b.salon_id
          where s.tenant_id = $1 and b.created_at > now() - interval '31 days' and ${MADE}
          group by 1
       ) x on x.day = d::date
      order by d`,
    [tenant.id, tenant.default_timezone],
  );
  const active = salons.filter((s) => s.active);
  ok(ctx, {
    salons,
    totals: {
      salons: salons.length,
      active: active.length,
      suspended: salons.length - active.length,
      ready: active.filter((s) => s.ready).length,
      bookings_30d: salons.reduce((n, s) => n + s.stats.bookings_30d, 0),
      upcoming: salons.reduce((n, s) => n + s.stats.upcoming, 0),
      customers: salons.reduce((n, s) => n + s.stats.customers, 0),
    },
    series,
  });
}

async function salonDetail(ctx: Ctx, id: number) {
  const [row] = await salonRows(ctx.host.tenant.id, id);
  if (!row) throw new HttpError(404, 'not_found');
  const aliases = await query<{ subdomain: string }>('select subdomain from salon_aliases where salon_id = $1 order by created_at desc', [id]);
  const proto = requestProto(ctx.req, config.trustProxy);
  return { ...shape(ctx, row), old_links: aliases.map((a) => salonUrl(proto, ctx.host, a.subdomain)) };
}

async function getSalon(ctx: Ctx) {
  requireSuperAdmin(ctx);
  ok(ctx, { salon: await salonDetail(ctx, parseId(ctx.params.id)) });
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
    await assertSubdomainFree(db, tenant.id, sub, null);

    let owner = await one<{ id: number }>('select id from users where tenant_id = $1 and phone = $2', [tenant.id, ownerPhone], db);
    const ownerCreated = !owner;
    if (!owner) {
      // New owners start with the password the admin sets, and are asked to pick their own.
      const password = checkNewPassword(b.req('owner_password', (v) => v));
      owner = await one<{ id: number }>(
        `insert into users (tenant_id, phone, name, password_hash, must_change_password)
         values ($1, $2, $3, $4, true) returning id`,
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

/** Suspend or bring back, rename, or move to a new link (the old one keeps redirecting). */
async function updateSalon(ctx: Ctx) {
  requireSuperAdmin(ctx);
  const tenant = ctx.host.tenant;
  const id = parseId(ctx.params.id);
  const b = new Input(await readJson(ctx));
  const fields = {
    active: b.opt('active', bool),
    name_ar: b.opt('name_ar', text(80, 1)),
    name_en: b.opt('name_en', text(80)),
    subdomain: b.opt('subdomain', subdomain),
  };
  await tx(async (db) => {
    const current = await one<{ subdomain: string }>('select subdomain from salons where tenant_id = $1 and id = $2 for update', [tenant.id, id], db);
    if (!current) throw new HttpError(404, 'not_found');
    if (fields.subdomain !== undefined && fields.subdomain !== current.subdomain) {
      await assertSubdomainFree(db, tenant.id, fields.subdomain, id);
      // Moving back to one of its own earlier links: that link is live again.
      await query('delete from salon_aliases where tenant_id = $1 and subdomain = $2', [tenant.id, fields.subdomain], db);
      await query(
        'insert into salon_aliases (tenant_id, subdomain, salon_id) values ($1, $2, $3) on conflict (tenant_id, subdomain) do nothing',
        [tenant.id, current.subdomain, id],
        db,
      );
    }
    // Keys come from the object above, never from the request.
    const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${k} = $${i + 3}`).join(', ');
      await query(`update salons set ${sets}, updated_at = now() where tenant_id = $1 and id = $2`, [tenant.id, id, ...entries.map(([, v]) => v)], db);
    }
    // A suspended salon's owner is signed out everywhere.
    if (fields.active === false) await query('delete from sessions where salon_id = $1', [id], db);
  });
  ok(ctx, { salon: await salonDetail(ctx, id) });
}

// Easy to read out or type: no 0/o, 1/l/i. Three groups of four.
const READABLE = 'abcdefghjkmnpqrstuvwxyz23456789';
function temporaryPassword(): string {
  const chars = Array.from({ length: 12 }, () => READABLE[crypto.randomInt(READABLE.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join('')).join('-');
}

/** For an owner who forgot their password: a new temporary one, shown to the admin once. */
async function resetOwnerPassword(ctx: Ctx) {
  requireSuperAdmin(ctx);
  const tenant = ctx.host.tenant;
  const id = parseId(ctx.params.id);
  const owner = await one<{ id: number; name: string; phone: string }>(
    `select u.id, u.name, u.phone
       from salons s
       join salon_members m on m.salon_id = s.id and m.role = 'owner'
       join users u on u.id = m.user_id
      where s.tenant_id = $1 and s.id = $2 and not u.is_super_admin
      order by m.created_at
      limit 1`,
    [tenant.id, id],
  );
  if (!owner) throw new HttpError(404, 'not_found');
  const password = temporaryPassword();
  await tx(async (db) => {
    await query('update users set password_hash = $2, must_change_password = true where id = $1', [owner.id, await hashPassword(password)], db);
    // Whoever was signed in with the old password is out.
    await query('delete from sessions where user_id = $1', [owner.id], db);
  });
  // A locked-out owner can use the new password straight away.
  clearLoginFailures(`${tenant.id}:${owner.phone}`);
  ok(ctx, { password, owner: { name: owner.name, phone: owner.phone } });
}

/** The platform's own settings: where salon owners reach it from the landing page. */
function platformBody(ctx: Ctx) {
  const t = ctx.host.tenant;
  return { name: t.name, name_ar: t.name_ar, domain: t.domain, contact_phone: t.contact_phone };
}

async function updatePlatform(ctx: Ctx) {
  requireSuperAdmin(ctx);
  const tenant = ctx.host.tenant;
  const b = new Input(await readJson(ctx));
  const raw = b.opt('contact_phone', text(30));
  if (raw !== undefined) {
    // Empty hides the landing page's WhatsApp buttons.
    const phone = raw.trim() ? normalizePhone(raw, tenant.default_calling_code) : '';
    if (phone === null) throw new HttpError(400, 'invalid', 'contact_phone');
    await query('update tenants set contact_phone = $2 where id = $1', [tenant.id, phone]);
    tenant.contact_phone = phone;
    clearTenantCache();
  }
  ok(ctx, platformBody(ctx));
}

export function adminRoutes(r: Router) {
  r.get('/api/admin/platform', (ctx) => {
    requireSuperAdmin(ctx);
    ok(ctx, platformBody(ctx));
  });
  r.patch('/api/admin/platform', updatePlatform);
  r.get('/api/admin/salons', listSalons);
  r.post('/api/admin/salons', createSalon);
  r.get('/api/admin/salons/:id', getSalon);
  r.patch('/api/admin/salons/:id', updateSalon);
  r.post('/api/admin/salons/:id/reset-password', resetOwnerPassword);
}
