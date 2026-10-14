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

function readCookie(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=') || null;
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
  const row = await one<{ id: number; name: string; phone: string; is_super_admin: boolean; must_change_password: boolean; role: string | null }>(
    `select u.id, u.name, u.phone, u.is_super_admin, u.must_change_password, m.role
       from sessions s
       join users u on u.id = s.user_id
       left join salon_members m on m.user_id = u.id and m.salon_id = s.salon_id
      where s.token_hash = $1 and s.expires_at > now()
        and s.tenant_id = $2 and s.salon_id is not distinct from $3`,
    [tokenHash, host.tenant.id, host.salon?.id ?? null],
  );
  if (!row) return null;
  const role: Role = row.is_super_admin ? 'admin' : row.role === 'owner' ? 'owner' : row.role === 'staff' ? 'staff' : 'customer';
  if (!host.salon && role !== 'admin') return null;
  if (host.salon && (role === 'owner' || role === 'staff')) touchLastSeen(host.salon.id, row.id);
  return {
    tokenHash,
    user: { id: row.id, name: row.name, phone: row.phone, is_super_admin: row.is_super_admin, must_change_password: row.must_change_password },
    role,
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

// ---------------------------------------------------------------- login rate limit

// Password guesses within a window, counted per client address, per address and
// account together, and per account from anywhere. In memory because the API runs
// as one process; a restart only forgives recent failures.
//
// The tight limit is on the (address, account) pair, so someone guessing at a number
// blocks only themselves, never the real owner signing in from their own phone. The
// per-account limit across all addresses is a loose backstop against guessing spread
// over many addresses. A correct password never skips a limit that has been reached:
// that would let guessing go on without any cap.
const WINDOW_MS = 15 * 60 * 1000;
const LIMITS = { ip: 30, ipPhone: 8, phone: 100 };
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

const limitKeys = (ip: string, phoneKey: string) =>
  [
    [`ip:${ip}`, LIMITS.ip],
    [`ipphone:${ip}|${phoneKey}`, LIMITS.ipPhone],
    [`phone:${phoneKey}`, LIMITS.phone],
  ] as const;

/**
 * Refuses an attempt once a limit is reached, otherwise counts it straight away,
 * before the caller awaits the (slow) password check: a burst of parallel guesses
 * cannot all pass the check before the first failure is recorded. A wrong password
 * then needs nothing more; a right one gives the attempt back (loginSucceeded).
 */
export function assertLoginAllowed(ip: string, phoneKey: string): void {
  const buckets = limitKeys(ip, phoneKey).map(([key, max]) => ({ b: bucket(key), max }));
  const full = buckets.filter(({ b, max }) => b.count >= max);
  if (full.length) {
    const retry = Math.ceil((Math.max(...full.map(({ b }) => b.resetAt)) - Date.now()) / 1000);
    throw Object.assign(new HttpError(429, 'too_many_attempts'), { retryAfter: retry });
  }
  for (const { b } of buckets) b.count++;
}

/** The password was right: this attempt was no guess, and this address's earlier misses for the account are forgiven. */
export function loginSucceeded(ip: string, phoneKey: string): void {
  for (const key of [`ip:${ip}`, `phone:${phoneKey}`]) {
    const b = failures.get(key);
    if (b && b.count > 0) b.count--;
  }
  failures.delete(`ipphone:${ip}|${phoneKey}`);
}

/** Forgives every failure for an account, from every address (the admin has just reset its password). */
export function clearLoginFailures(phoneKey: string): void {
  failures.delete(`phone:${phoneKey}`);
  const suffix = `|${phoneKey}`;
  for (const key of failures.keys()) if (key.startsWith('ipphone:') && key.endsWith(suffix)) failures.delete(key);
}

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of failures) if (b.resetAt < now) failures.delete(k);
}, 60_000).unref();

