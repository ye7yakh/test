// Booking endpoints. Customers (public, on the salon's host) see free slots, book,
// and follow their booking through a private link. Owners see the day, confirm
// CliQ deposits, mark visits and add bookings themselves.
import { normalizePhone, requireOwner } from '../auth.js';
import {
  addDays, availability, bookingSelect, clock, createBooking, DAYS_AHEAD, expireHolds, hashToken, LEAD_MIN, parseDate,
  salonToday, shapeBooking, type BookingStatus,
} from '../booking.js';
import { one, pool, query, tx } from '../db.js';
import { publish, subscribe } from '../events.js';
import { HttpError, ok, readJson, type Ctx, type Router } from '../http.js';
import { mediaUrl } from '../media.js';
import type { Salon } from '../tenancy.js';
import { Input, int, oneOf, text } from '../validate.js';

// ---------------------------------------------------------------- shared

function requireBookableSalon(ctx: Ctx): Salon {
  const salon = ctx.host.salon;
  if (!salon) throw new HttpError(404, 'not_found');
  return salon;
}

const idParam = (ctx: Ctx, name: string, required = true): number | null => {
  const raw = ctx.url.searchParams.get(name);
  if (!raw || raw === 'any') {
    if (required) throw new HttpError(400, 'required', name);
    return null;
  }
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) throw new HttpError(400, 'invalid', name);
  return n;
};

const slotView = (s: { min: number; staff: number[] }) => ({ min: s.min, time: clock(s.min), next_day: s.min >= 1440, staff: s.staff });

async function checkDateWindow(salon: Salon, date: string, maxDays: number) {
  const today = await salonToday(pool, salon.timezone);
  if (date < today || date > addDays(today, maxDays)) throw new HttpError(400, 'invalid', 'date');
  return today;
}

// Bookings created per client address: generous for real people, tight for scripts.
const recent = new Map<string, number[]>();
function limitBookings(ip: string) {
  const now = Date.now();
  const list = (recent.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  if (list.length >= 10) throw new HttpError(429, 'too_many_bookings');
  list.push(now);
  recent.set(ip, list);
}
setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of recent) if (!list.some((t) => now - t < 10 * 60_000)) recent.delete(ip);
}, 60_000).unref();

// ---------------------------------------------------------------- public (customers)

async function publicAvailability(ctx: Ctx) {
  const salon = requireBookableSalon(ctx);
  if (!salon.booking_enabled) throw new HttpError(403, 'booking_closed');
  const date = parseDate(ctx.url.searchParams.get('date'));
  await checkDateWindow(salon, date, DAYS_AHEAD);
  const { slots } = await availability(pool, salon, { serviceId: idParam(ctx, 'service_id')!, staffId: idParam(ctx, 'staff_id', false), date, lead: LEAD_MIN });
  ok(ctx, { date, slots: slots.map(slotView) });
}

/** The next two weeks with how many free slots each day has, for the date strip. */
async function publicDays(ctx: Ctx) {
  const salon = requireBookableSalon(ctx);
  if (!salon.booking_enabled) throw new HttpError(403, 'booking_closed');
  const serviceId = idParam(ctx, 'service_id')!;
  const staffId = idParam(ctx, 'staff_id', false);
  const today = await salonToday(pool, salon.timezone);
  const days = [];
  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(today, i);
    const { slots } = await availability(pool, salon, { serviceId, staffId, date, lead: LEAD_MIN });
    days.push({ date, slots: slots.length });
  }
  ok(ctx, { today, days });
}

async function publicCreate(ctx: Ctx) {
  const salon = requireBookableSalon(ctx);
  if (!salon.booking_enabled) throw new HttpError(403, 'booking_closed');
  limitBookings(ctx.ip);
  const b = new Input(await readJson(ctx));
  const serviceId = b.req('service_id', int(1, Number.MAX_SAFE_INTEGER));
  const staffId = b.opt('staff_id', (v) => (v === null ? null : int(1, Number.MAX_SAFE_INTEGER)(v))) ?? null;
  const date = b.req('date', (v) => parseDate(v));
  const min = b.req('time', int(0, 2879));
  const name = b.req('name', text(60, 2));
  const phone = normalizePhone(b.req('phone', text(30, 1)), ctx.host.tenant.default_calling_code);
  if (!phone) throw new HttpError(400, 'invalid', 'phone');
  await checkDateWindow(salon, date, DAYS_AHEAD);
  const booking = await tx((db) => createBooking(db, salon, { serviceId, staffId, date, min, name, phone, source: 'online', lead: LEAD_MIN }));
  ok(ctx, { token: booking.token, booking: await publicBooking(salon, booking.token) }, 201);
}

async function publicBooking(salon: Salon, token: string) {
  const row = await one(bookingSelect('b.salon_id = $1 and b.token_hash = $2'), [salon.id, hashToken(token)]);
  if (!row) throw new HttpError(404, 'not_found');
  const booking = shapeBooking(row, mediaUrl);
  return {
    ...booking,
    // The customer sees their own name and number, nothing about anyone else.
    salon: {
      name_ar: salon.name_ar,
      name_en: salon.name_en,
      phone: salon.phone,
      currency: salon.currency,
      logo_url: mediaUrl(salon.logo_media_id),
      cliq_alias: salon.cliq_alias,
      cliq_name: salon.cliq_name,
      payment_window_min: salon.payment_window_min,
    },
  };
}

const tokenParam = (ctx: Ctx) => {
  const token = ctx.params.token ?? '';
  if (!/^[A-Za-z0-9_-]{20,40}$/.test(token)) throw new HttpError(404, 'not_found');
  return token;
};

async function publicGet(ctx: Ctx) {
  const salon = requireBookableSalon(ctx);
  ok(ctx, { booking: await publicBooking(salon, tokenParam(ctx)) });
}

/** The customer says the CliQ transfer is on its way; the owner checks their bank. */
async function publicSent(ctx: Ctx) {
  const salon = requireBookableSalon(ctx);
  const token = tokenParam(ctx);
  const note = new Input(await readJson(ctx)).opt('note', text(120)) ?? '';
  const row = await one<{ id: number }>(
    `update bookings set status = 'payment_sent', payment_note = $3, updated_at = now()
      where salon_id = $1 and token_hash = $2 and status = 'pending_payment' and expires_at > now()
      returning id`,
    [salon.id, hashToken(token), note],
  );
  if (!row) throw new HttpError(409, 'not_pending');
  publish(salon.id, 'booking', { id: row.id, status: 'payment_sent' });
  ok(ctx, { booking: await publicBooking(salon, token) });
}

async function publicCancel(ctx: Ctx) {
  const salon = requireBookableSalon(ctx);
  const token = tokenParam(ctx);
  const row = await one<{ id: number }>(
    `update bookings set status = 'cancelled', updated_at = now()
      where salon_id = $1 and token_hash = $2 and start_at > now()
        and status in ('pending_payment', 'payment_sent', 'confirmed')
      returning id`,
    [salon.id, hashToken(token)],
  );
  if (!row) throw new HttpError(409, 'cannot_cancel');
  publish(salon.id, 'booking', { id: row.id, status: 'cancelled' });
  ok(ctx, { booking: await publicBooking(salon, token) });
}

// ---------------------------------------------------------------- owner

async function ownerDay(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const salon = ctx.host.salon!;
  const date = ctx.url.searchParams.get('date') ? parseDate(ctx.url.searchParams.get('date')) : await salonToday(pool, salon.timezone);
  const rows = await query(
    `${bookingSelect(`b.salon_id = $1 and b.status <> 'expired'
       and b.start_at >= ($2::timestamp at time zone s.timezone) and b.start_at < (($2::date + 1)::timestamp at time zone s.timezone)`)}
     order by b.start_at, b.id`,
    [salonId, date],
  );
  ok(ctx, { date, bookings: rows.map((r) => shapeBooking(r, mediaUrl)).filter((b) => b.status !== 'expired') });
}

/** Counts per day around a date (for the day strip) and the deposits waiting on the owner. */
async function ownerOverview(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const salon = ctx.host.salon!;
  const today = await salonToday(pool, salon.timezone);
  const from = ctx.url.searchParams.get('from') ? parseDate(ctx.url.searchParams.get('from'), 'from') : addDays(today, -7);
  const days = Math.min(62, Math.max(1, Number(ctx.url.searchParams.get('days') ?? 28) || 28));
  const [counts, attention] = await Promise.all([
    query<{ date: string; n: number }>(
      `select to_char(b.start_at at time zone s.timezone, 'YYYY-MM-DD') as date, count(*)::int as n
         from bookings b join salons s on s.id = b.salon_id
        where b.salon_id = $1 and b.status in ('pending_payment', 'payment_sent', 'confirmed', 'completed', 'no_show')
          and (b.status <> 'pending_payment' or b.expires_at > now())
          and b.start_at >= ($2::timestamp at time zone s.timezone) and b.start_at < (($2::date + $3::int)::timestamp at time zone s.timezone)
        group by 1`,
      [salonId, from, days],
    ),
    query(
      `${bookingSelect(`b.salon_id = $1 and b.end_at > now() - interval '1 hour'
         and (b.status = 'payment_sent' or (b.status = 'pending_payment' and b.expires_at > now()))`)}
       order by b.status desc, b.start_at`,
      [salonId],
    ),
  ]);
  ok(ctx, { today, from, counts: Object.fromEntries(counts.map((c) => [c.date, c.n])), attention: attention.map((r) => shapeBooking(r, mediaUrl)) });
}

async function ownerAvailability(ctx: Ctx) {
  requireOwner(ctx);
  const salon = ctx.host.salon!;
  const date = parseDate(ctx.url.searchParams.get('date'));
  await checkDateWindow(salon, date, 90);
  const { slots } = await availability(pool, salon, { serviceId: idParam(ctx, 'service_id')!, staffId: idParam(ctx, 'staff_id', false), date, lead: 0 });
  ok(ctx, { date, slots: slots.map(slotView) });
}

/** A booking the owner takes by phone, WhatsApp or at the door. No deposit. */
async function ownerCreate(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const salon = ctx.host.salon!;
  const b = new Input(await readJson(ctx));
  const serviceId = b.req('service_id', int(1, Number.MAX_SAFE_INTEGER));
  const staffId = b.opt('staff_id', (v) => (v === null ? null : int(1, Number.MAX_SAFE_INTEGER)(v))) ?? null;
  const date = b.req('date', (v) => parseDate(v));
  const min = b.req('time', int(0, 2879));
  const name = b.req('name', text(60, 2));
  const phone = normalizePhone(b.req('phone', text(30, 1)), ctx.host.tenant.default_calling_code);
  if (!phone) throw new HttpError(400, 'invalid', 'phone');
  await checkDateWindow(salon, date, 90);
  const booking = await tx((db) => createBooking(db, salon, { serviceId, staffId, date, min, name, phone, source: 'owner', lead: 0 }));
  const row = await one(bookingSelect('b.salon_id = $1 and b.id = $2'), [salonId, booking.id]);
  ok(ctx, { booking: shapeBooking(row!, mediaUrl) }, 201);
}

// What the owner may do from each status.
const NEXT: Record<BookingStatus, BookingStatus[]> = {
  pending_payment: ['confirmed', 'cancelled'],
  payment_sent: ['confirmed', 'cancelled'],
  confirmed: ['completed', 'no_show', 'cancelled'],
  completed: ['confirmed'],
  no_show: ['confirmed'],
  cancelled: [],
  expired: [],
};

async function ownerUpdate(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  const id = Number(ctx.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) throw new HttpError(404, 'not_found');
  const status = new Input(await readJson(ctx)).req('status', oneOf(['confirmed', 'completed', 'no_show', 'cancelled'] as const));
  await tx(async (db) => {
    await expireHolds(db, salonId);
    const current = await one<{ status: BookingStatus }>('select status from bookings where salon_id = $1 and id = $2 for update', [salonId, id], db);
    if (!current) throw new HttpError(404, 'not_found');
    if (!NEXT[current.status].includes(status)) throw new HttpError(409, 'bad_transition');
    try {
      await query(`update bookings set status = $3, expires_at = null, updated_at = now() where salon_id = $1 and id = $2`, [salonId, id, status], db);
    } catch (err) {
      // Bringing back a cancelled-then-rebooked slot would double-book.
      if ((err as { code?: string }).code === '23P01') throw new HttpError(409, 'slot_taken');
      throw err;
    }
  });
  publish(salonId, 'booking', { id, status });
  const row = await one(bookingSelect('b.salon_id = $1 and b.id = $2'), [salonId, id]);
  ok(ctx, { booking: shapeBooking(row!, mediaUrl) });
}

/** Live updates for the studio: a line per change, and a ping to keep proxies open. */
function ownerEvents(ctx: Ctx) {
  const salonId = requireOwner(ctx);
  ctx.res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  ctx.res.write('retry: 5000\n\n');
  const off = subscribe(salonId, ctx.res);
  const ping = setInterval(() => ctx.res.write(': ping\n\n'), 25_000);
  ctx.req.on('close', () => {
    clearInterval(ping);
    off();
  });
}

export function bookingRoutes(r: Router) {
  r.get('/api/public/days', publicDays);
  r.get('/api/public/availability', publicAvailability);
  r.post('/api/public/bookings', publicCreate);
  r.get('/api/public/bookings/:token', publicGet);
  r.post('/api/public/bookings/:token/sent', publicSent);
  r.post('/api/public/bookings/:token/cancel', publicCancel);

  r.get('/api/manage/bookings', ownerDay);
  r.get('/api/manage/bookings/overview', ownerOverview);
  r.get('/api/manage/availability', ownerAvailability);
  r.post('/api/manage/bookings', ownerCreate);
  r.patch('/api/manage/bookings/:id', ownerUpdate);
  r.get('/api/manage/events', ownerEvents);
}
