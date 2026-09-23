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

## The owner studio

The salon owner's workspace (`salon.brand.com/#/manage`) is designed to impress
on first open. It's a deep indigo studio lit in violet and blue, with glass
surfaces, a floating tab bar and plenty of motion: drifting background light, a
light circling the main card, a tab highlight that slides between tabs, gradient
headings and numbers, and buttons with a sheen. On desktop it has a sidebar and a
live preview of the salon's app. The studio's colours are its own; each salon's
colours appear in its app (the previews and the icon).

- **Home**: a greeting, a readiness ring that counts up, the four setup steps,
  numbers at a glance, open/closed now, and the app link to copy or share. A
  tilted phone shows the salon's app as it looks right now. When every step is
  done, the page celebrates (once) and becomes a share-your-app card.
- **Brand**: name, logo, colours and team photo style, with a live preview.
  On phones the preview is a swipeable stage with the app and the salon's icon on a
  phone home screen; on desktop it's the side column. Choosing one of 13 ready
  palettes (or custom colours) re-colours the preview as you pick. Changes wait
  in a "you have unsaved changes" bar until saved.
- **Services**: an empty salon starts from a ready menu. Pick barbershop, ladies'
  salon or spa, tick the services, type prices, and they're all added at once.
  Each service has an emoji icon, duration chips with a stepper, a large price
  field, "price starts from", bookable on/off, and who offers it (chips with the
  team's photos).
- **Team**: magazine-style portrait cards that tilt towards the mouse on
  desktop. Adding a photo plays the "studio touch" (a scanning animation while
  the server renders), then the finished portrait arrives with a halo and a
  burst of little stars.
- **Hours**: each day is a 24-hour track with glowing open ranges, including
  ranges past midnight carried into the next morning, and a "now" marker on
  today. There are quick presets (all day, split shift, late nights, Friday after
  prayer); tap a day to edit it inline. The bars grow in when the page opens.
- **Settings** (sheet): contact details, time zone and currency, password,
  language, sign out.
- **Login and platform admin** use the same design: a violet and blue aurora
  behind login, and each salon's real app icon in the admin list.

Arabic first and fully mirrored in English. The typeface is Readex Pro
(self-hosted, OFL). Motion respects `prefers-reduced-motion`.

The customer-facing salon page (`salon.brand.com`) is intentionally left plain for
now; the customer experience will be designed separately.

**Unified team photos** are deterministic image processing (sharp/libvips), not
AI yet: the same 4:5 crop centred on the person, normalised levels, one of four
styles (natural, warm, black and white, or a duotone in the salon's accent) and
the same vignette. The original is kept, so a new style re-renders every photo.
Real AI (background replacement, relighting) is planned; see *Next steps*.

## Stack

- Node.js 20 + TypeScript, plain `http` server (no framework), `tsx` in dev, `tsc` build.
- PostgreSQL through `pg` with plain SQL. Numbered migrations in `migrations/` are
  idempotent and recorded in `schema_migrations`. Run them with `npm run migrate` before each deploy.
- Frontend: one Arabic-first RTL single-page app in vanilla HTML/CSS/JS (`web/`). All UI
  text is in one string table (`web/assets/js/i18n.js`, ar/en, with Arabic plural forms).
  Digits are always Western, and Arabic-Indic digits typed by users are converted.
  Mobile-first. Minified with terser at build.
  One design system (`web/assets/app.css`) with two themes on shared tokens: the dark
  owner studio and the light public page.
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
npm run test:api       # starts its own api on :3457 against local Postgres; 108 checks
npm run screenshots    # needs `npm run dev`; a new salon's whole journey at 400px and 1440px
```

`test:api` covers the setup flow and the security edges: tenant isolation, CSRF, upload
validation, rate limits and session revocation. `screenshots` drives Chrome through a
brand-new salon's whole journey, from the admin creating it to the owner's ready menu,
photo upload, brand, hours, the celebration, English and desktop. It writes 28 PNGs to
`screenshots/` and fails on any page error, console error, CSP violation or unexpected
failed request. It finds Chrome at `CHROME_PATH` or in the usual places.

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
web/index.html         rendered per host (title, theme, manifest, CSS colours)
web/assets/app.css     the design system (tokens, components, studio and public themes)
web/assets/js/         app.js (routes), i18n.js (all text), dom.js (toolkit), preview.js (phone
                       previews), hours-editor.js, templates.js (palettes, ready menus), views/
scripts/               build-web.mjs, test-api.ts, screenshots.ts
```

## Next steps

1. **Customer experience and booking** (to be designed): customer sign-up (phone + password), available slots from staff hours and
   service durations, booking and cancelling, the owner's day view. Live updates over SSE.
2. **Notifications**: Web Push (VAPID) for new and changed bookings. The service worker is already registered.
3. **Infra**: Terraform for ECR, ECS on one EC2 host, RDS, Route 53, and Caddy with a
   wildcard certificate (DNS challenge), plus the build → migrate → roll deploy script.
4. **AI photo processing**: a background-removal and relighting model would put every
   barber on the same studio backdrop in the salon's colours. It slots in as one more step
   before `renderPortrait` in `src/media.ts`. The studio-touch animation already frames
   it, and the original is kept as it is today.
