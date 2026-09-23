import path from 'node:path';

const env = process.env;
const isProd = env.NODE_ENV === 'production';

export const config = {
  isProd,
  port: Number(env.PORT ?? 3000),
  databaseUrl: env.DATABASE_URL ?? 'postgres://salon:salon@localhost:5432/salon',
  // In production the minified build in dist/web is served; in dev the sources.
  webDir: path.resolve(env.WEB_DIR ?? (isProd ? 'dist/web' : 'web')),
  migrationsDir: path.resolve(env.MIGRATIONS_DIR ?? 'migrations'),
  secureCookies: env.SECURE_COOKIES ? env.SECURE_COOKIES === 'true' : isProd,
  // Behind Caddy the client address and scheme come from X-Forwarded-* headers.
  trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY === 'true' : isProd,
  sessionDays: Number(env.SESSION_DAYS ?? 30),
  maxUploadBytes: Number(env.MAX_UPLOAD_MB ?? 8) * 1024 * 1024,
};
