import crypto from 'node:crypto';
import { promisify } from 'node:util';
import type { ServerResponse } from 'node:http';
import { config } from './config.js';
import { one, query } from './db.js';
import { HttpError, type Ctx } from './http.js';
import type { HostContext } from './tenancy.js';

const scrypt = promisify(crypto.scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>;

// ---------------------------------------------------------------- passwords

const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 };

// Easy to read out or type: no 0/o, 1/l/i. Three groups of four.
const READABLE = 'abcdefghjkmnpqrstuvwxyz23456789';
/** A password handed to someone (a new owner, a barber), to be changed at first sign-in. */
export function temporaryPassword(): string {
  const chars = Array.from({ length: 12 }, () => READABLE[crypto.randomInt(READABLE.length)]);
  return [chars.slice(0, 4), chars.slice(4, 8), chars.slice(8)].map((g) => g.join('')).join('-');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const key = await scrypt(password, Buffer.from(saltB64, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return crypto.timingSafeEqual(key, expected);
}

// Verified against when the phone is unknown, so both paths cost the same.
export const DUMMY_HASH = await hashPassword(crypto.randomBytes(12).toString('hex'));

export function checkNewPassword(password: unknown): string {
  if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
    throw new HttpError(400, 'weak_password', 'password');
  }
  return password;
}

// ---------------------------------------------------------------- phones

const ARABIC_DIGITS = /[٠-٩۰-۹]/g;

/** Normalises what people type (Arabic-Indic digits, spaces, 00 or 0 prefixes) to E.164. */
export function normalizePhone(input: unknown, callingCode: string): string | null {
  if (typeof input !== 'string') return null;
  let s = input
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) & 0xf))
    .replace(/[\s\-().‎‏]/g, '');
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  else if (s.startsWith('0')) s = `+${callingCode}${s.slice(1)}`;
  else if (!s.startsWith('+')) s = `+${callingCode}${s}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

// ---------------------------------------------------------------- sessions

export type Role = 'admin' | 'owner' | 'staff' | 'customer';

export interface Session {
  tokenHash: Buffer;
  user: { id: number; name: string; phone: string; is_super_admin: boolean; must_change_password: boolean };
  role: Role;
  /** For a barber signed in to his salon: his place on the team. */
  staffId: number | null;
}

const COOKIE = 'sid';

function hashToken(token: string): Buffer {
  return crypto.createHash('sha256').update(token).digest();
}

function setCookie(res: ServerResponse, value: string, maxAge: number): void {
  // No Domain attribute: the cookie stays on the exact subdomain that set it.
  const parts = [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`];
  if (config.secureCookies) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function readCookie(header: string | undefined, name = COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

export async function createSession(res: ServerResponse, userId: number, host: HostContext): Promise<void> {
  const token = crypto.randomBytes(32).toString('base64url');
  const maxAge = config.sessionDays * 86400;
  await query(
    `insert into sessions (token_hash, user_id, tenant_id, salon_id, expires_at)
     values ($1, $2, $3, $4, now() + make_interval(secs => $5))`,
    [hashToken(token), userId, host.tenant.id, host.salon?.id ?? null, maxAge],
  );
  setCookie(res, token, maxAge);
}

export async function destroySession(ctx: Ctx): Promise<void> {
  if (ctx.session) await query('delete from sessions where token_hash = $1', [ctx.session.tokenHash]);
  setCookie(ctx.res, '', 0);
}

// "Last seen" for the admin: written at most once an hour per person and salon.
const seenWritten = new Map<string, number>();
function touchLastSeen(salonId: number, userId: number): void {
  const key = `${salonId}:${userId}`;
  if (Date.now() - (seenWritten.get(key) ?? 0) < 3600_000) return;
  seenWritten.set(key, Date.now());
  query('update salon_members set last_seen_at = now() where salon_id = $1 and user_id = $2', [salonId, userId]).catch((e) =>
    console.error('last seen', e),
  );
}

/** Loads the session for this request. It must have been created on this same host. */
export async function loadSession(cookieHeader: string | undefined, host: HostContext): Promise<Session | null> {
  const token = readCookie(cookieHeader);
  if (!token || token.length > 100) return null;
  const tokenHash = hashToken(token);
  const row = await one<{ id: number; name: string; phone: string; is_super_admin: boolean; must_change_password: boolean; role: string | null; staff_id: number | null; staff_active: boolean | null }>(
    `select u.id, u.name, u.phone, u.is_super_admin, u.must_change_password, m.role, m.staff_id, st.active as staff_active
       from sessions s
       join users u on u.id = s.user_id
       left join salon_members m on m.user_id = u.id and m.salon_id = s.salon_id
       left join staff st on st.id = m.staff_id
      where s.token_hash = $1 and s.expires_at > now()
        and s.tenant_id = $2 and s.salon_id is not distinct from $3`,
    [tokenHash, host.tenant.id, host.salon?.id ?? null],
  );
  if (!row) return null;
  // A barber the owner has hidden from the team (he left, say) has no studio either.
  const staff = row.role === 'staff' && row.staff_id != null && row.staff_active === true;
  const role: Role = row.is_super_admin ? 'admin' : row.role === 'owner' ? 'owner' : staff ? 'staff' : 'customer';
  if (!host.salon && role !== 'admin') return null;
  if (host.salon && (role === 'owner' || role === 'staff')) touchLastSeen(host.salon.id, row.id);
  return {
    tokenHash,
    user: { id: row.id, name: row.name, phone: row.phone, is_super_admin: row.is_super_admin, must_change_password: row.must_change_password },
    role,
    staffId: role === 'staff' ? row.staff_id : null,
  };
}

export async function purgeExpiredSessions(): Promise<void> {
  await query('delete from sessions where expires_at < now()');
}

// ---------------------------------------------------------------- guards

export function requireSuperAdmin(ctx: Ctx): Session {
  // The platform's tools exist only on its dashboard host (admin.).
  if (ctx.host.site !== 'admin') throw new HttpError(404, 'not_found');
  if (!ctx.session) throw new HttpError(401, 'login_required');
  if (ctx.session.role !== 'admin') throw new HttpError(403, 'forbidden');
  return ctx.session;
}

/** Salon owners, and the super admin when supporting a salon. Returns the salon id. */
export function requireOwner(ctx: Ctx): number {
  const salon = ctx.host.salon;
  if (!salon) throw new HttpError(404, 'not_found');
  if (!ctx.session) throw new HttpError(401, 'login_required');
  if (ctx.session.role !== 'owner' && ctx.session.role !== 'admin') throw new HttpError(403, 'forbidden');
  return salon.id;
}

/**
 * Anyone who works at the salon. The owner (and the super admin) see and do everything,
 * `staffId` null; a barber signed in with his own login gets his place on the team, and
 * each route keeps him to his own schedule.
 */
export function requireMember(ctx: Ctx): { salonId: number; staffId: number | null } {
  const salon = ctx.host.salon;
  if (!salon) throw new HttpError(404, 'not_found');
  if (!ctx.session) throw new HttpError(401, 'login_required');
  const { role, staffId } = ctx.session;
  if (role === 'owner' || role === 'admin') return { salonId: salon.id, staffId: null };
  if (role === 'staff' && staffId != null) return { salonId: salon.id, staffId };
  throw new HttpError(403, 'forbidden');
}

// ---------------------------------------------------------------- login rate limit

// Password guesses within a window, counted per client address, per address and
// account together, and per account from anywhere. In memory because the API runs
// as one process; a restart only forgives recent failures.
//
// The tight limit is on the (address, account) pair. The per-account limit across all
// addresses stops guessing spread over many addresses; on its own it would also let
// such guessing lock the real owner out, so a device that has signed in to the account
// before (it holds a mark only the password can earn, see deviceMark) is counted
// apart from everyone else. A correct password never skips a limit that has been
// reached: that would let guessing go on without any cap.
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { ip: 30, ipPhone: 8, phone: 20 };
const failures = new Map<string, { count: number; resetAt: number }>();

function bucket(key: string) {
  const now = Date.now();
  let b = failures.get(key);
  if (!b || b.resetAt < now) {
    b = { count: 0, resetAt: now + WINDOW_MS };
    failures.set(key, b);
  }
  return b;
}

/**
 * The address a limit counts by: an IPv4 address on its own (also when written as
 * IPv6, ::ffff:a.b.c.d), an IPv6 address by its /64. One subscriber is given a whole
 * /64, so counting single addresses would hand them a fresh limit per address.
 */
export function addressKey(ip: string): string {
  const addr = ip.trim().toLowerCase().replace(/%.*$/, '');
  const mapped = /^(?:0{0,4}:){0,5}:?ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(addr);
  if (mapped) return mapped[1]!;
  if (!addr.includes(':') || !/^[0-9a-f:.]+$/.test(addr)) return addr;
  const halves = addr.split('::');
  if (halves.length > 2) return addr;
  const groups = (part: string | undefined) => (part ? part.split(':') : []);
  // A dotted IPv4 tail fills the last two groups.
  const width = (gs: string[]) => gs.reduce((n, g) => n + (g.includes('.') ? 2 : 1), 0);
  const head = groups(halves[0]);
  const tail = groups(halves[1]);
  const full = halves.length === 2 ? [...head, ...Array<string>(Math.max(0, 8 - width(head) - width(tail))).fill('0'), ...tail] : head;
  return `${full.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

const accountKey = (phoneKey: string, knownDevice: boolean) => `${knownDevice ? 'known' : 'phone'}:${phoneKey}`;

const limitKeys = (ip: string, phoneKey: string, knownDevice: boolean) => {
  const addr = addressKey(ip);
  return [
    [`ip:${addr}`, LIMITS.ip],
    [`ipphone:${addr}|${phoneKey}`, LIMITS.ipPhone],
    [accountKey(phoneKey, knownDevice), LIMITS.phone],
  ] as const;
};

/**
 * Refuses an attempt once a limit is reached, otherwise counts it straight away,
 * before the caller awaits the (slow) password check: a burst of parallel guesses
 * cannot all pass the check before the first failure is recorded. A wrong password
 * then needs nothing more; a right one gives the attempt back (loginSucceeded).
 * `knownDevice` (the request carries the account's device mark) counts the attempt
 * against the account's own devices, not against everyone guessing at it.
 */
export function assertLoginAllowed(ip: string, phoneKey: string, knownDevice = false): void {
  const buckets = limitKeys(ip, phoneKey, knownDevice).map(([key, max]) => ({ b: bucket(key), max }));
  const full = buckets.filter(({ b, max }) => b.count >= max);
  if (full.length) {
    const retry = Math.ceil((Math.max(...full.map(({ b }) => b.resetAt)) - Date.now()) / 1000);
    throw Object.assign(new HttpError(429, 'too_many_attempts'), { retryAfter: retry });
  }
  for (const { b } of buckets) b.count++;
}

/** The password was right: this attempt was no guess, and this address's earlier misses for the account are forgiven. */
export function loginSucceeded(ip: string, phoneKey: string, knownDevice = false): void {
  const addr = addressKey(ip);
  for (const key of [`ip:${addr}`, accountKey(phoneKey, knownDevice)]) {
    const b = failures.get(key);
    if (b && b.count > 0) b.count--;
  }
  failures.delete(`ipphone:${addr}|${phoneKey}`);
}

/** Forgives every failure for an account, from every address (the admin has just reset its password). */
export function clearLoginFailures(phoneKey: string): void {
  failures.delete(`phone:${phoneKey}`);
  failures.delete(`known:${phoneKey}`);
  const suffix = `|${phoneKey}`;
  for (const key of failures.keys()) if (key.startsWith('ipphone:') && key.endsWith(suffix)) failures.delete(key);
}

// The device mark: proof that this browser once signed in to the account with its
// current password. Keyed on the password's hash, so nobody can make one without
// having had the password, it needs no secret of its own (and survives restarts), and
// changing or resetting the password retires every old one. Sent only to sign-in.
const DEVICE_COOKIE = 'dev';

const deviceMark = (passwordHash: string, phoneKey: string) =>
  crypto.createHmac('sha256', passwordHash).update(`device:${phoneKey}`).digest('base64url');

/** Whether the request carries the mark for this account (its current password hash). */
export function isKnownDevice(cookieHeader: string | undefined, passwordHash: string, phoneKey: string): boolean {
  const got = readCookie(cookieHeader, DEVICE_COOKIE);
  if (!got || got.length > 100) return false;
  const want = Buffer.from(deviceMark(passwordHash, phoneKey));
  const have = Buffer.from(got);
  return have.length === want.length && crypto.timingSafeEqual(have, want);
}

/** Marks this browser as one the account signs in from (after a correct password). */
export function rememberDevice(res: ServerResponse, passwordHash: string, phoneKey: string): void {
  const parts = [`${DEVICE_COOKIE}=${deviceMark(passwordHash, phoneKey)}`, 'Path=/api/auth', 'HttpOnly', 'SameSite=Strict', `Max-Age=${365 * 86400}`];
  if (config.secureCookies) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', [...(prev === undefined ? [] : Array.isArray(prev) ? prev : [String(prev)]), parts.join('; ')]);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of failures) if (b.resetAt < now) failures.delete(k);
}, 60_000).unref();

