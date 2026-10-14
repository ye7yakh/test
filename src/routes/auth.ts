import {
  assertLoginAllowed,
  checkNewPassword,
  createSession,
  destroySession,
  DUMMY_HASH,
  hashPassword,
  loginSucceeded,
  normalizePhone,
  verifyPassword,
} from '../auth.js';
import { one, query } from '../db.js';
import { HttpError, ok, readJson, type Ctx, type Router } from '../http.js';
import { salonSummary } from './public.js';

function contextBody(ctx: Ctx) {
  const s = ctx.session;
  const tenant = ctx.host.tenant;
  return {
    // The platform's bare domain is its landing page; admin. is its dashboard.
    kind: ctx.host.salon ? 'salon' : ctx.host.site === 'admin' ? 'platform' : 'landing',
    tenant: {
      name: tenant.name,
      name_ar: tenant.name_ar || tenant.name,
      name_en: tenant.name,
      domain: tenant.domain,
      calling_code: tenant.default_calling_code,
      contact_phone: tenant.contact_phone,
    },
    salon: ctx.host.salon ? salonSummary(ctx.host.salon) : null,
    user: s ? { id: s.user.id, name: s.user.name, phone: s.user.phone, role: s.role, must_change_password: s.user.must_change_password } : null,
  };
}

async function login(ctx: Ctx) {
  // The landing page has nobody to sign in; the platform's dashboard is on admin.
  if (ctx.host.site === 'landing') throw new HttpError(404, 'not_found');
  const body = await readJson(ctx);
  const tenant = ctx.host.tenant;
  const phone = normalizePhone(body.phone, tenant.default_calling_code);
  const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
  const limitKey = `${tenant.id}:${phone ?? String(body.phone ?? '').slice(0, 40)}`;
  // Counts this attempt now, before the slow password check, so parallel guesses are limited too.
  assertLoginAllowed(ctx.ip, limitKey);

  const user = phone
    ? await one<{ id: number; password_hash: string; is_super_admin: boolean }>(
        'select id, password_hash, is_super_admin from users where tenant_id = $1 and phone = $2',
        [tenant.id, phone],
      )
    : undefined;
  const passwordOk = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  // The platform host is for the super admin only.
  if (!user || !passwordOk || (!ctx.host.salon && !user.is_super_admin)) {
    // Already counted when the attempt began.
    throw new HttpError(401, 'bad_credentials');
  }
  loginSucceeded(ctx.ip, limitKey);
  if (ctx.session) await destroySession(ctx);
  await createSession(ctx.res, user.id, ctx.host);
  ok(ctx, { ok: true });
}

async function changePassword(ctx: Ctx) {
  if (!ctx.session) throw new HttpError(401, 'login_required');
  const body = await readJson(ctx);
  const next = checkNewPassword(body.next);
  // Guessing the current password here is guessing the login: same limits, same
  // account key, so the two together give no more tries than the login alone, and
  // the admin's password reset clears both.
  const limitKey = `${ctx.host.tenant.id}:${ctx.session.user.phone}`;
  assertLoginAllowed(ctx.ip, limitKey);
  const row = await one<{ password_hash: string }>('select password_hash from users where id = $1', [ctx.session.user.id]);
  if (!row || typeof body.current !== 'string' || !(await verifyPassword(body.current, row.password_hash))) {
    throw new HttpError(400, 'wrong_password', 'current');
  }
  loginSucceeded(ctx.ip, limitKey);
  // Their own password now, so any temporary one the admin set is gone.
  await query('update users set password_hash = $2, must_change_password = false where id = $1', [ctx.session.user.id, await hashPassword(next)]);
  // Sign out every other device.
  await query('delete from sessions where user_id = $1 and token_hash <> $2', [ctx.session.user.id, ctx.session.tokenHash]);
  ok(ctx);
}

export function authRoutes(r: Router) {
  r.get('/api/context', (ctx) => ok(ctx, contextBody(ctx)));
  r.post('/api/auth/login', login);
  r.post('/api/auth/logout', async (ctx) => {
    await destroySession(ctx);
    ok(ctx);
  });
  r.post('/api/auth/password', changePassword);
}
