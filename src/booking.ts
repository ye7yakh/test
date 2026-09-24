// Availability and booking. All clock maths happens in the salon's time zone inside
// Postgres: a slot is "minutes after local midnight of the chosen date", which may
// run past 1440 for a range that goes on after midnight.
import crypto from 'node:crypto';
import { one, query, type Db } from './db.js';
import { HttpError } from './http.js';
import { publish } from './events.js';
import type { Salon } from './tenancy.js';

export const HOLDING = ['pending_payment', 'payment_sent', 'confirmed'] as const;
export const STEP_MIN = 15;
/** Customers book at least this far ahead; the owner can book right away. */
export const LEAD_MIN = 30;
export const DAYS_AHEAD = 14;

export type BookingStatus = 'pending_payment' | 'payment_sent' | 'confirmed' | 'completed' | 'no_show' | 'cancelled' | 'expired';

export interface Slot {
  min: number;
  staff: number[];
}

export function parseDate(v: unknown, field = 'date'): string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new HttpError(400, 'invalid', field);
  const [y, m, d] = v.split('-').map(Number) as [number, number, number];
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) throw new HttpError(400, 'invalid', field);
  return v;
}

export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const clock = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

export async function salonToday(db: Db, timezone: string): Promise<string> {
  return (await one<{ d: string }>(`select to_char(now() at time zone $1, 'YYYY-MM-DD') as d`, [timezone], db))!.d;
}

/** Releases deposit holds whose time ran out. Returns the salons that changed. */
export async function expireHolds(db: Db, salonId?: number): Promise<number[]> {
  const rows = await query<{ salon_id: number; id: number }>(
    `update bookings set status = 'expired', updated_at = now()
      where status = 'pending_payment' and expires_at <= now() ${salonId ? 'and salon_id = $1' : ''}
      returning salon_id, id`,
    salonId ? [salonId] : [],
    db,
  );
  for (const r of rows) publish(r.salon_id, 'booking', { id: r.id, status: 'expired' });
  return [...new Set(rows.map((r) => r.salon_id))];
}

interface AvailabilityInput {
  serviceId: number;
  staffId: number | null;
  date: string;
  lead: number;
}

export async function availability(db: Db, salon: Salon, input: AvailabilityInput) {
  const service = await one<{ id: number; duration_min: number; price: string }>(
    `select id, duration_min, trim_scale(price)::text as price from services where salon_id = $1 and id = $2 and active`,
    [salon.id, input.serviceId],
    db,
  );
  if (!service) throw new HttpError(404, 'not_found', 'service_id');

  const staff = await query<{ id: number; custom_hours: boolean }>(
    `select st.id, st.custom_hours
       from staff st join staff_services ss on ss.staff_id = st.id and ss.service_id = $2
      where st.salon_id = $1 and st.active ${input.staffId ? 'and st.id = $3' : ''}
      order by st.sort_order, st.id`,
    input.staffId ? [salon.id, service.id, input.staffId] : [salon.id, service.id],
    db,
  );
  if (input.staffId && !staff.length) throw new HttpError(400, 'invalid', 'staff_id');
  if (!staff.length) return { service, slots: [] as Slot[] };

  const weekday = weekdayOf(input.date);
  const staffIds = staff.map((s) => s.id);
  // One after another: inside a transaction they share a single connection.
  const salonRanges = await query<{ open_min: number; close_min: number }>(
      'select open_min, close_min from salon_hours where salon_id = $1 and weekday = $2 order by open_min',
      [salon.id, weekday],
      db,
    );
  const ownRanges = await query<{ staff_id: number; open_min: number; close_min: number }>(
      'select staff_id, open_min, close_min from staff_hours where salon_id = $1 and weekday = $2 and staff_id = any($3::bigint[])',
      [salon.id, weekday, staffIds],
      db,
    );
  const busy = await query<{ staff_id: number; s: string; e: string }>(
      `select staff_id,
              extract(epoch from (start_at at time zone $2) - $3::timestamp) / 60 as s,
              extract(epoch from (end_at at time zone $2) - $3::timestamp) / 60 as e
         from bookings
        where salon_id = $1 and staff_id = any($4::bigint[])
          and status in ('pending_payment', 'payment_sent', 'confirmed')
          and (status <> 'pending_payment' or expires_at > now())
          and start_at < (($3::date + 2)::timestamp at time zone $2)
          and end_at > ($3::timestamp at time zone $2)`,
      [salon.id, salon.timezone, input.date, staffIds],
      db,
    );
  const nowRow = await one<{ now_min: string }>(`select extract(epoch from (now() at time zone $1) - $2::timestamp) / 60 as now_min`, [salon.timezone, input.date], db);

  const earliest = Number(nowRow!.now_min) + input.lead;
  const dur = service.duration_min;
  const free = new Map<number, number[]>();
  for (const st of staff) {
    const ranges = st.custom_hours ? ownRanges.filter((r) => r.staff_id === st.id) : salonRanges;
    const taken = busy.filter((b) => b.staff_id === st.id).map((b) => [Number(b.s), Number(b.e)] as const);
    for (const r of ranges) {
      for (let t = Math.ceil(r.open_min / STEP_MIN) * STEP_MIN; t + dur <= r.close_min; t += STEP_MIN) {
        if (t < earliest) continue;
        if (taken.some(([s, e]) => t < e && t + dur > s)) continue;
        const list = free.get(t) ?? [];
        list.push(st.id);
        free.set(t, list);
      }
    }
  }
  const slots: Slot[] = [...free.entries()].sort((a, b) => a[0] - b[0]).map(([min, ids]) => ({ min, staff: ids }));
  return { service, slots };
}

interface CreateInput extends AvailabilityInput {
  min: number;
  name: string;
  phone: string;
  source: 'online' | 'owner';
}

/** Books a slot. Runs inside the caller's transaction; the database refuses overlaps. */
export async function createBooking(db: Db, salon: Salon, input: CreateInput): Promise<{ id: number; token: string }> {
  await expireHolds(db, salon.id);
  const { service, slots } = await availability(db, salon, input);
  const slot = slots.find((s) => s.min === input.min);
  if (!slot) throw new HttpError(409, 'slot_taken', 'time');

  let staffId = input.staffId ?? slot.staff[0]!;
  if (!input.staffId && slot.staff.length > 1) {
    // "Anyone": give it to whoever has the fewest bookings that day.
    const loads = await query<{ staff_id: number; n: number }>(
      `select staff_id, count(*)::int as n from bookings
        where salon_id = $1 and staff_id = any($2::bigint[]) and status in ('pending_payment', 'payment_sent', 'confirmed')
          and start_at >= ($3::timestamp at time zone $4) and start_at < (($3::date + 1)::timestamp at time zone $4)
        group by staff_id`,
      [salon.id, slot.staff, input.date, salon.timezone],
      db,
    );
    const load = new Map(loads.map((l) => [l.staff_id, l.n]));
    staffId = [...slot.staff].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0]!;
  }

  const customer = await one<{ id: number }>(
    `insert into customers (salon_id, phone, name) values ($1, $2, $3)
     on conflict (salon_id, phone) do update set name = excluded.name
     returning id`,
    [salon.id, input.phone, input.name],
    db,
  );

  if (input.source === 'online') {
    // A handful of upcoming bookings per phone is plenty; more looks like abuse.
    const open = await one<{ n: number }>(
      `select count(*)::int as n from bookings
        where salon_id = $1 and customer_id = $2 and start_at > now() and status in ('pending_payment', 'payment_sent', 'confirmed')`,
      [salon.id, customer!.id],
      db,
    );
    if (open!.n >= 3) throw new HttpError(429, 'too_many_bookings');
  }

  const token = crypto.randomBytes(18).toString('base64url');
  const needsDeposit = input.source === 'online' && salon.cliq_required;
  try {
    const row = await one<{ id: number; status: string }>(
      `insert into bookings (salon_id, customer_id, staff_id, service_id, start_at, end_at, status, price, deposit, expires_at, source, token_hash)
       select $1, $2, $3, $4, t.start_at, t.start_at + make_interval(mins => $7),
              case when d.deposit > 0 then 'pending_payment' else 'confirmed' end,
              $8::numeric, d.deposit,
              case when d.deposit > 0 then now() + make_interval(mins => $12) end,
              $13, $14
         from (select ($5::timestamp + make_interval(mins => $6)) at time zone $15 as start_at) t,
              (select case when $9 then (case when $10 = 'full' then $8::numeric else least($11::numeric, $8::numeric) end) else 0 end as deposit) d
       returning id, status`,
      [salon.id, customer!.id, staffId, service.id, input.date, input.min, service.duration_min, service.price,
        needsDeposit, salon.deposit_kind, salon.deposit_amount, salon.payment_window_min, input.source, hashToken(token), salon.timezone],
      db,
    );
    publish(salon.id, 'booking', { id: row!.id, status: row!.status });
    return { id: row!.id, token };
  } catch (err) {
    if ((err as { code?: string }).code === '23P01') throw new HttpError(409, 'slot_taken', 'time');
    throw err;
  }
}

export function hashToken(token: string): Buffer {
  return crypto.createHash('sha256').update(token).digest();
}

/** A booking as the owner and the customer see it. Status reads "expired" as soon as a hold runs out. */
export function bookingSelect(where: string): string {
  return `
    select b.id,
           case when b.status = 'pending_payment' and b.expires_at <= now() then 'expired' else b.status end as status,
           b.source, trim_scale(b.price)::text as price, trim_scale(b.deposit)::text as deposit, b.payment_note, b.payment_rejected,
           -- Changes when the screenshot is replaced, so the image URL does too (no stale cache).
           floor(extract(epoch from p.created_at) * 1000)::bigint::text as proof_v,
           greatest(0, floor(extract(epoch from b.expires_at - now())))::int as expires_in_s,
           to_char(b.start_at at time zone s.timezone, 'YYYY-MM-DD') as date,
           to_char(b.start_at at time zone s.timezone, 'HH24:MI') as start,
           to_char(b.end_at at time zone s.timezone, 'HH24:MI') as "end",
           (extract(epoch from b.end_at - b.start_at) / 60)::int as duration_min,
           b.start_at > now() as upcoming,
           b.created_at,
           c.id as customer_id, c.name as customer_name, c.phone as customer_phone,
           st.id as staff_id, st.name_ar as staff_name_ar, st.name_en as staff_name_en, st.photo_id as staff_photo_id,
           sv.id as service_id, sv.name_ar as service_name_ar, sv.name_en as service_name_en, sv.icon as service_icon
      from bookings b
      join salons s on s.id = b.salon_id
      join customers c on c.id = b.customer_id
      join staff st on st.id = b.staff_id
      join services sv on sv.id = b.service_id
      left join booking_proofs p on p.booking_id = b.id
     where ${where}`;
}

export function shapeBooking(r: Record<string, any>, mediaUrl: (id: string | null) => string | null) {
  return {
    id: r.id,
    status: r.status as BookingStatus,
    source: r.source,
    price: r.price,
    deposit: r.deposit,
    payment_note: r.payment_note,
    payment_rejected: r.payment_rejected,
    // The owner's view of the screenshot; the customer's page swaps in its own link.
    proof_url: r.proof_v ? `/api/manage/bookings/${r.id}/proof?v=${r.proof_v}` : null,
    expires_in_s: r.status === 'pending_payment' ? r.expires_in_s : null,
    date: r.date,
    start: r.start,
    end: r.end,
    duration_min: r.duration_min,
    upcoming: r.upcoming,
    created_at: r.created_at,
    customer: { id: r.customer_id, name: r.customer_name, phone: r.customer_phone },
    staff: { id: r.staff_id, name_ar: r.staff_name_ar, name_en: r.staff_name_en, photo_url: mediaUrl(r.staff_photo_id) },
    service: { id: r.service_id, name_ar: r.service_name_ar, name_en: r.service_name_en, icon: r.service_icon },
  };
}

/** Payment screenshots hold bank details: gone a week after the booking is decided. */
export async function purgeProofs(db: Db): Promise<number> {
  const rows = await query(
    `delete from booking_proofs p using bookings b
      where b.id = p.booking_id
        and (b.status not in ('pending_payment', 'payment_sent') or (b.status = 'pending_payment' and b.expires_at <= now()))
        and b.updated_at < now() - interval '7 days'
      returning p.booking_id`,
    [],
    db,
  );
  return rows.length;
}
