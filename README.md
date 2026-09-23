# Salon booking platform

One codebase, many salons. Each salon gets its own branded app on a subdomain
(`elite.brand.com`), installable on customers' phones with the salon's own name,
icon and colours.

Three kinds of users:

| Who | Where | What they do today |
| --- | --- | --- |
| Platform owner (super admin) | `brand.com` / `admin.brand.com` | Create salons, hand them to owners, suspend them |
| Salon owner | `salon.brand.com/#/manage` | Set up the salon: details, logo and colours, services and prices, team with photos, opening hours |
| Customer | `salon.brand.com` | See the salon page: services, team, hours, open/closed now. Booking comes next |

## What the first slice covers: salon setup

- **Salon details and look**: Arabic and English name, intro, contact, logo, main and
  accent colours (ready palettes or a colour picker, previewed live), time zone and currency.
  The colours and logo drive the salon's PWA manifest, app icons and theme colour.
- **Services**: name, description, duration, price (decimals follow the currency, so JOD
  and KWD get 3), a "price starts from" flag, hidden/bookable, display order, and which
  team members offer each one.
- **Team**: barbers and stylists with name, title, photo, the services they offer, their
  own working hours or the salon's, and paused/active.
- **Opening hours**: per weekday, several ranges per day (morning and evening shifts),
  ranges that run past midnight, and "apply to all days". Saturday comes first.
- **Unified team photos**: every photo is cropped the same way (4:5 portrait centred on
  the person), its levels are normalised so dark and bright shots match, and it gets
  the salon's style: natural, warm, black and white, or a duotone in the salon's accent
  colour, plus the same soft vignette. The original is kept, so changing the style
  re-renders every photo. This is deterministic image processing (sharp/libvips), not
  generative AI. See *Next steps* for the AI option.

## Stack

- Node.js 20 + TypeScript, plain `http` server (no framework), `tsx` in dev, `tsc` build.
- PostgreSQL through `pg` with plain SQL. Numbered migrations in `migrations/` are
  idempotent and recorded in `schema_migrations`. Run them with `npm run migrate` before each deploy.
- Frontend: one Arabic-first RTL single-page app in vanilla HTML/CSS/JS (`web/`). All UI
  text is in one string table (`web/assets/js/i18n.js`, ar/en). Digits are always Western,
  and Arabic-Indic digits typed by users are converted. Mobile-first. Minified with terser at build.
  The font (IBM Plex Sans Arabic, OFL) is self-hosted.
- Images: `sharp`. Stored in Postgres (`media` table) as re-encoded WebP.

## Multi-tenancy

The `Host` header decides everything (`src/tenancy.ts`):

- `brand.com`, `www.brand.com`, `admin.brand.com` → the platform host (super admin).
- `<sub>.brand.com` → that salon; unknown or suspended subdomains get a 404.
- Several brands can share the deployment: each row in `tenants` is a brand domain.

Every query is scoped to the salon from the host. Child tables carry `salon_id` with
composite foreign keys, so the database itself refuses a service linked to another
salon's barber, or a photo from another salon.

## Security notes

- Phone + password login. Passwords use scrypt. Session tokens are random, only
  their SHA-256 is stored, and the cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in
  production, and host-only. A session is bound to the host that created it, so a cookie
  from one salon is useless on another. Changing the password signs out other devices.
- Login is rate-limited per phone (8 failures / 15 min) and per client address (30 / 15 min).
- Writes need JSON (or a raw image body) and a same-host `Origin`, which blocks CSRF.
- Uploads are judged by their bytes (JPEG/PNG/WebP magic numbers and a real decode),
  never by the declared type. They are auto-rotated, stripped of metadata and re-encoded
  before storage, and served with `nosniff` and `Content-Security-Policy: sandbox`.
- The app has a strict CSP: scripts from self only, and a per-request nonce for the one
  inline style block that carries the salon's colours.

## Run it locally

```sh
npm install
docker compose up -d          # Postgres 16 on :5432 (or use your own; see .env.example)
npm run migrate
npm run seed                  # brand "localhost", super admin, and a demo salon
npm run dev                   # http://localhost:3000
```

- Salon page: http://demo.localhost:3000. Owner login: `0500000001` / `owner-pass-123`.
- Platform admin: http://localhost:3000. Login: `+966500000000` / `admin-pass-123`.

Chrome and Firefox resolve `*.localhost` to your machine, so subdomains work with no setup.

## Checks

```sh
npm run typecheck
npm run test:api       # starts its own api on :3457 against local Postgres; 94 checks
npm run screenshots    # needs `npm run dev`; renders and presses through the UI at 400px
```

`test:api` covers the setup flow and the security edges: tenant isolation, CSRF, upload
validation, rate limits and session revocation. `screenshots` drives Chrome through the
owner flow and the super admin flow. It writes one PNG per step to `screenshots/` and
fails on any page error, console error, CSP violation or unexpected failed request. It
finds Chrome at `CHROME_PATH` or in the usual places.

## Build and deploy

```sh
npm run build          # dist/ (server) + dist/web/ (minified app)
docker build -t salon-api .
docker run salon-api node dist/migrate.js   # migrate task
docker run -p 3000:3000 salon-api           # api
```

In production set `NODE_ENV=production` (Secure cookies, HSTS, trust Caddy's
`X-Forwarded-*`, serve `dist/web`) and `DATABASE_URL`. `/healthz` is the health check.
Seed a production brand with `SEED_DOMAIN`, `SEED_ADMIN_PHONE` and
`SEED_ADMIN_PASSWORD`; the demo salon is off by default in production.

## Layout

```
migrations/            numbered SQL, idempotent
src/server.ts          http server, routing, Origin check, errors
src/tenancy.ts         Host -> brand + salon
src/auth.ts            passwords, sessions, roles, login rate limit, phone normalising
src/media.ts           upload validation, photo styles, app icons
src/hours.ts           weekly hours parsing/validation
src/routes/            auth, admin, public (page data, manifest, icons, media), salon, services, staff
web/index.html         rendered per host (title, theme colour, manifest, CSS colours)
web/assets/js/         app.js (boot + routes), i18n.js (all text), dom.js, api.js, views/
scripts/               build-web.mjs, test-api.ts, screenshots.ts
```

## Next steps

1. **Booking**: customer sign-up (phone + password), available slots from staff hours and
   service durations, booking and cancelling, the owner's day view. Live updates over SSE.
2. **Notifications**: Web Push (VAPID) for new and changed bookings. The service worker is already registered.
3. **Infra**: Terraform for ECR, ECS on one EC2 host, RDS, Route 53, and Caddy with a
   wildcard certificate (DNS challenge), plus the build → migrate → roll deploy script.
4. **AI photo backgrounds** (optional): a background-removal / relighting model would put
   every barber on the same studio backdrop in the salon's colours. It would slot in as one
   more step before `renderPortrait` in `src/media.ts`, with the original kept as it is today.
