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
  // The AI mirror's image model (src/tryon.ts): gemini or openai with an API key. Without
  // a key it is off in production; in development a stand-in draws so the flow works.
  tryon: {
    provider: (env.AI_TRYON_PROVIDER ?? (env.AI_TRYON_API_KEY ? 'gemini' : isProd ? 'none' : 'mock')) as 'gemini' | 'openai' | 'mock' | 'none',
    apiKey: env.AI_TRYON_API_KEY ?? '',
    model: env.AI_TRYON_MODEL ?? '',
    // Each picture costs a few cents: caps per address, per salon and platform-wide per day.
    perAddress10m: Number(env.AI_TRYON_PER_ADDRESS_10M ?? 6),
    perAddressDaily: Number(env.AI_TRYON_PER_ADDRESS_DAILY ?? 25),
    salonDaily: Number(env.AI_TRYON_SALON_DAILY ?? 150),
    platformDaily: Number(env.AI_TRYON_DAILY ?? 1500),
  },
};
