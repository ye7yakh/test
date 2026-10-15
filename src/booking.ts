// Availability and booking. All clock maths happens in the salon's time zone inside
// Postgres: a slot is "minutes after local midnight of the chosen date", which may
// run past 1440 for a range that goes on after midnight.
import crypto from 'node:crypto';
import { one, query, type Db } from './db.js';
import { HttpError } from './http.js';
import { publish } from './events.js';
import type { Salon } from './tenancy.js';
import { describeLook } from './tryon.js';

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
  // Busy time in real instants (minutes since the epoch), not wall-clock minutes: on a
  // night the clocks change, wall-clock maths would shrink or stretch a booking.
  // A visit marked done ("Arrived", which the owner taps as it starts) still holds the
  // chair until its end: the customer is sitting in it, and Undo must be able to bring
  // it back to confirmed. The exclusion constraint leaves 'completed' out on purpose
  // (older rows may overlap one): every new booking comes through here, and Undo
  // (ownerUpdate) checks visits marked done itself, so neither can land on one.
  const busy = await query<{ staff_id: number; s: string; e: string }>(
      `select staff_id, extract(epoch from start_at) / 60 as s, extract(epoch from end_at) / 60 as e
         from bookings
        where salon_id = $1 and staff_id = any($4::bigint[])
          and status in ('pending_payment', 'payment_sent', 'confirmed', 'completed')
          and (status <> 'pending_payment' or expires_at > now())
          and start_at < (($3::date + 2)::timestamp at time zone $2)
          and end_at > ($3::timestamp at time zone $2)`,
      [salon.id, salon.timezone, input.date, staffIds],
      db,
    );
  // Each possible start (wall-clock minutes after the date's midnight) as a real
  // instant, and whether that wall-clock time exists at all: when clocks go forward
  // an hour is skipped, and its times would land on the hour after (a "free" 02:00
  // that books as 03:00, or always fails). The same mapping createBooking stores.
  const instants = await query<{ m: number; inst: string; real: boolean; now_at: string }>(
      `select m, extract(epoch from inst) / 60 as inst, (inst at time zone $1) = wall as real, extract(epoch from now()) / 60 as now_at
         from (select m, wall, wall at time zone $1 as inst
                 from (select m, $2::timestamp + make_interval(mins => m) as wall from generate_series(0, 2880 - $3::int, $3::int) m) w) l
        order by m`,
      [salon.timezone, input.date, STEP_MIN],
      db,
    );
  const instantOf = new Map(instants.map((r) => [r.m, r.real ? Number(r.inst) : null]));

  const earliest = Number(instants[0]!.now_at) + input.lead;
  const dur = service.duration_min;
  const free = new Map<number, number[]>();
  for (const st of staff) {
    const ranges = st.custom_hours ? ownRanges.filter((r) => r.staff_id === st.id) : salonRanges;
    const taken = busy.filter((b) => b.staff_id === st.id).map((b) => [Number(b.s), Number(b.e)] as const);
    for (const r of ranges) {
      // Opening hours are wall-clock; the overlap test is in real time.
      for (let t = Math.ceil(r.open_min / STEP_MIN) * STEP_MIN; t + dur <= r.close_min; t += STEP_MIN) {
        const at = instantOf.get(t);
        if (at == null || at < earliest) continue;
        if (taken.some(([s, e]) => at < e && at + dur > s)) continue;
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
  /** The look tried on in the AI mirror (catalogue ids, checked by parseLook). */
  look?: string | null;
}

/** Books a slot. Runs inside the caller's transaction; the database refuses overlaps. */
export async function createBooking(db: Db, salon: Salon, input: CreateInput): Promise<{ id: number; token: string }> {
  // One booking at a time per salon, until this transaction ends. Two people asking
  // for "anyone" at the same moment would otherwise both be given the same barber
  // (worked out from what was committed before either of them), and the second
  // would be told the time is taken while another barber is free. Waiting in turn,
  // the second sees the first booking and gets someone else. (Its own key space,
  // apart from the migration lock's single key.)
  await query('select pg_advisory_xact_lock(727002, $1::int)', [salon.id], db);
  await expireHolds(db, salon.id);
  const { service, slots } = await availability(db, salon, input);
  const slot = slots.find((s) => s.min === input.min);
  if (!slot) throw new HttpError(409, 'slot_taken', 'time');

  let staffId = input.staffId ?? slot.staff[0]!;
  if (!input.staffId && slot.staff.length > 1) {
    // "Anyone": give it to whoever has the fewest bookings that day, visits already
    // done included. (Run-out holds were expired above, under the salon's lock.)
    const loads = await query<{ staff_id: number; n: number }>(
      `select staff_id, count(*)::int as n from bookings
        where salon_id = $1 and staff_id = any($2::bigint[]) and status in ('pending_payment', 'payment_sent', 'confirmed', 'completed')
          and start_at >= ($3::timestamp at time zone $4) and start_at < (($3::date + 1)::timestamp at time zone $4)
        group by staff_id`,
      [salon.id, slot.staff, input.date, salon.timezone],
      db,
    );
    const load = new Map(loads.map((l) => [l.staff_id, l.n]));
    staffId = [...slot.staff].sort((a, b) => (load.get(a) ?? 0) - (load.get(b) ?? 0))[0]!;
  }

  // The phone is not verified, so an online booking never renames someone the salon
  // already knows by this number; the owner's own entry does. Either way the name
  // given is kept on this booking (customer_name), and that is what is shown for it.
  const customer = await one<{ id: number }>(
    `insert into customers (salon_id, phone, name) values ($1, $2, $3)
     on conflict (salon_id, phone) do update set name = case when $4 = 'owner' then excluded.name else customers.name end
     returning id`,
    [salon.id, input.phone, input.name, input.source],
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
      // The deposit hold never outlives the appointment's start: nobody should be
      // paying for a visit that has begun (online slots start at least LEAD_MIN out).
      `insert into bookings (salon_id, customer_id, staff_id, service_id, start_at, end_at, status, price, deposit, expires_at, source, token_hash, customer_name, look)
       select $1, $2, $3, $4, t.start_at, t.start_at + make_interval(mins => $7),
              case when d.deposit > 0 then 'pending_payment' else 'confirmed' end,
              $8::numeric, d.deposit,
              case when d.deposit > 0 then least(now() + make_interval(mins => $12), t.start_at) end,
              $13, $14, $16, $17
         from (select ($5::timestamp + make_interval(mins => $6)) at time zone $15 as start_at) t,
              (select case when $9 then (case when $10 = 'full' then $8::numeric else least($11::numeric, $8::numeric) end) else 0 end as deposit) d
       returning id, status`,
      [salon.id, customer!.id, staffId, service.id, input.date, input.min, service.duration_min, service.price,
        needsDeposit, salon.deposit_kind, salon.deposit_amount, salon.payment_window_min, input.source, hashToken(token), salon.timezone, input.name, input.look ?? null],
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
           b.source, trim_scale(b.price)::text as price, trim_scale(b.deposit)::text as deposit, b.payment_note, b.payment_rejected, b.look,
           -- Changes when the screenshot is replaced, so the image URL does too (no stale cache).
           floor(extract(epoch from p.created_at) * 1000)::bigint::text as proof_v,
           greatest(0, floor(extract(epoch from b.expires_at - now())))::int as expires_in_s,
           -- The hold's whole length: the salon's payment window, or less when the visit
           -- starts sooner (expires_at is written once, with created_at, at booking).
           floor(extract(epoch from b.expires_at - b.created_at))::int as hold_s,
           to_char(b.start_at at time zone s.timezone, 'YYYY-MM-DD') as date,
           to_char(b.start_at at time zone s.timezone, 'HH24:MI') as start,
           to_char(b.end_at at time zone s.timezone, 'HH24:MI') as "end",
           (extract(epoch from b.end_at - b.start_at) / 60)::int as duration_min,
           b.start_at > now() as upcoming,
           b.created_at,
           -- The name given for this booking; older rows fall back to the customer's.
           c.id as customer_id, coalesce(b.customer_name, c.name) as customer_name, c.phone as customer_phone,
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
    // The haircut tried on in the AI mirror before booking, in words.
    look: describeLook(r.look),
    // The owner's view of the screenshot; the customer's page swaps in its own link.
    proof_url: r.proof_v ? `/api/manage/bookings/${r.id}/proof?v=${r.proof_v}` : null,
    expires_in_s: r.status === 'pending_payment' ? r.expires_in_s : null,
    hold_s: r.status === 'pending_payment' ? r.hold_s : null,
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

/**
 * Payment screenshots hold bank details: gone a week after the booking is decided
 * or runs out of time. A payment the owner never decided on runs out a week after
 * the visit (its updated_at does not move while it waits, so the visit is the clock);
 * the booking itself stays for the owner to settle.
 */
export async function purgeProofs(db: Db): Promise<number> {
  const rows = await query(
    `delete from booking_proofs p using bookings b
      where b.id = p.booking_id
        and (
          ((b.status not in ('pending_payment', 'payment_sent') or (b.status = 'pending_payment' and b.expires_at <= now()))
            and b.updated_at < now() - interval '7 days')
          or (b.status = 'payment_sent' and b.end_at < now() - interval '7 days')
        )
      returning p.booking_id`,
    [],
    db,
  );
  return rows.length;
}
