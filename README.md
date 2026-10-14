# Salonak (صالونك)

One codebase, many salons. Each salon gets its own branded app on a subdomain
(`elite.salonak.app`), installable on customers' phones with the salon's own name,
icon and colours. The domain is a setting: any brand domain works the same way.

| Address | Who | What it is |
| --- | --- | --- |
| `salonak.app` | Salon owners we sell to | The landing page: what a salon gets, on a live phone, and a WhatsApp button |
| `admin.salonak.app` | Platform owner (super admin) | See every salon's activity and setup, create salons and hand them over, rename them or move them to a new link, suspend them, reset owners' passwords, set the landing page's WhatsApp number |
| `elite.salonak.app` | Customers | The salon's own website and app: its page, booking a service with anyone or a chosen barber, a CliQ deposit when the salon asks for one, following or cancelling the booking |
| `elite.salonak.app/book` | Customers | Straight into booking (for the salon's Instagram bio and WhatsApp) |
| `elite.salonak.app/admin` | Salon owner | Its own installable app: set up the salon (details, logo, app icon, cover photo, colours, how their page and their dashboard look, services and prices, team with photos, opening hours), run the day's bookings, check CliQ deposits |

`www.salonak.app` goes to `salonak.app`, and `salonak.app/admin` to `admin.salonak.app`.
Each customer's booking has its own page at `elite.salonak.app/b/<token>`.

## The owner studio

The salon owner's workspace (`elite.salonak.app/admin`) is designed to impress
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
- **Bookings**: deposits waiting for a check (with the customer's transfer
  screenshot, reviewed full screen), a day strip with counts, the day's visits
  with a line at the current time, each visit's sheet (call, WhatsApp, arrived,
  no-show, cancel, undo), bookings taken by phone, and booking settings. New
  bookings and sent deposits arrive live.
- **Settings** (sheet): contact details, password,
  language, sign out. Owners still on a temporary password the admin set see a
  reminder on Home until they choose their own.
- **Login and platform admin** use the same design: a violet and blue aurora
  behind login, and each salon's real app icon in the admin dashboard.

Arabic first and fully mirrored in English. The typeface is Readex Pro
(self-hosted, OFL). Motion respects `prefers-reduced-motion`.

## The brand kit and the two apps

Each salon has two installable apps (PWAs) on its own link:

- **The customers' app** at `elite.salonak.app`: the salon's name, its icon, and its page.
- **The owner's app** at `elite.salonak.app/admin`: named "إدارة …", opening straight on the
  dashboard, with the salon's icon wearing a small dashboard badge so the two apps are
  told apart on a phone. Owners are sent there when they sign in, and Home offers
  one-tap install where the phone allows it (Android, desktop Chrome) or the "Add to
  Home Screen" tip on iPhone. Customers get an install button on the salon page where
  the phone allows it.

On the brand page the owner decides how both look, with a live preview:

- **Colours**: 13 ready palettes or their own main and accent colours.
- **The customer page**: **night** (dark, the main colour deep in near-black, lit by the
  accent) or **day** (light, a coloured hero and the page rising over it as a sheet).
  The accent is lightened or darkened automatically so it always reads.
- **The dashboard**: the studio's violet and blue, or **the salon's own colours**; the
  dashboard recolours live as they pick.
- **Cover photo** across the top of the customer page, under a scrim so text reads.
- **App icon**: made from the logo on a chosen background (auto, white, main colour or
  dark), or a separate square icon uploaded full bleed.
- **Launch screen**: the icon in a ring of lights with the salon's name, painted by the
  server so it shows before any script runs, and held until the first screen has its
  content. Android builds its launch screen from the manifest; iPhones and iPads get
  launch images rendered for every screen size.


Each salon's page is its own night: the salon's main colour deep in near-black,
lit by its accent (lightened automatically if it would not read on dark). The
hero is a slow aurora in those colours, with the logo in a ring of twinkling
"mirror lights", a live open/closed pill that says when the salon opens next,
and call, WhatsApp, directions and share buttons. Below are glass service cards
(tap one to book it), a carousel of team portraits, the week's hours with today
lit, and contact details. A glass bar with the salon's name slides in once the
hero scrolls away, sections drift in as they come into view, and a glowing book
button stays at hand. The owner's live previews show the same page in miniature.

Booking takes four steps (service, with whom, day and time, name and mobile). When
the salon asks for a CliQ deposit, the booking holds its slot while the customer
sends it, uploads the transfer screenshot and taps "sent"; the owner checks the
bank app, looks at the screenshot and confirms or rejects. Screenshots are private
(only the salon's owner and the customer's own booking link can open them) and are
deleted a week after the booking is decided. Two bookings for the same barber can
never overlap: the database refuses it.

## The landing page

`salonak.app` sells the platform to salon owners, in Arabic and English. A phone in
the hero cycles through three made-up salons (a ladies' salon, a barber, a nail
studio), each in its own colours, with a "new booking" and a "deposit received"
notification floating over it and the salon's link beneath. Then what a salon gets,
the app on a customer's phone (home-screen icon, launch screen, booking page), its
link being typed out, three steps to start, and a WhatsApp button that opens a chat
with the platform's number (set in the dashboard; empty hides the buttons).

## Link previews and search

A salon's link shared on WhatsApp, Instagram or Facebook shows its name, its about
text and a 1200×630 picture (`/share.jpg`): its cover photo, or its icon on its page
colour. Search engines get the salon as a local business (name, address, phone,
opening hours) in JSON-LD. Dashboards and customers' booking pages carry `noindex`
and each host serves its own `robots.txt`. The landing page has its own preview.

## The platform dashboard (admin)

Leads with new bookings across all salons over the last 30 days (with the change on
the week before, a crosshair readout and a table view), then active salons, salons
ready to take bookings, upcoming visits and customers. Salons are searchable,
filterable cards showing live status, setup progress, recent bookings and when the
owner last used the studio. Each salon's sheet can suspend it (customers see a calm
"unavailable" page), change its name or link (earlier links keep redirecting to the
new one), call or message the owner, and reset the owner's password: a readable
temporary password, shown once and sendable on WhatsApp. Creating a salon ends on a
hand-over card with the dashboard link and sign-in details.

**Unified team photos** are deterministic image processing (sharp/libvips), not
AI yet: the same 4:5 crop centred on the person, normalised levels, one of four
styles (natural, warm, black and white, or a duotone in the salon's accent) and
the same vignette. The original is kept, so a new style re-renders every photo.
Real AI (background replacement, relighting) is planned; see *Next steps*.

## Market: Jordan

Everything defaults to Jordan: prices in Jordanian dinars (3 decimal places,
shown as "6 د.أ." / "6 JD"), phone numbers as +962 (people can type 07…), and
Amman time. Salons are closed on Monday by default, and Friday opens at 14:00,
after the prayer. The server still supports other currencies and time zones per
brand (the `tenants` defaults), but owners never have to choose them.

## Stack

- Node.js 20 + TypeScript, plain `http` server (no framework), `tsx` in dev, `tsc` build.
- PostgreSQL through `pg` with plain SQL. Numbered migrations in `migrations/` are
  idempotent and recorded in `schema_migrations`. Run them with `npm run migrate` before each deploy.
- Frontend: one Arabic-first RTL single-page app in vanilla HTML/CSS/JS (`web/`). All UI
  text is in one string table (`web/assets/js/i18n.js`, ar/en, with Arabic plural forms).
  Digits are always Western, and Arabic-Indic digits typed by users are converted.
  Mobile-first. Minified with terser at build.
  One design system (`web/assets/app.css`) with two themes on shared tokens: the
  owner studio and the salon's night page.
- Images: `sharp`. Stored in Postgres (`media` table) as re-encoded WebP.

## Multi-tenancy

The `Host` header decides everything (`src/tenancy.ts`):

- `brand.com` → the platform's landing page; `admin.brand.com` → its dashboard (the
  super admin signs in and works only there); `www.brand.com` → redirects to `brand.com`.
- `<sub>.brand.com` → that salon: the customers' app at `/` (with `/book` and
  `/b/<token>`), the owner's app at `/admin`. A salon's earlier links (after the admin moves it)
  redirect to its current one; a suspended salon shows an "unavailable" page; unknown
  subdomains get a 404.
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
npm run seed                  # brand "localhost" (Salonak), super admin, and a demo salon
npm run dev                   # http://localhost:3000
```

- Landing page: http://localhost:3000.
- Salon page: http://demo.localhost:3000. Owner: http://demo.localhost:3000/admin, `0790000001` / `owner-pass-123`.
- Platform admin: http://admin.localhost:3000. Login: `0790000000` / `admin-pass-123`.

Chrome and Firefox resolve `*.localhost` to your machine, so subdomains work with no setup.

## Checks

```sh
npm run typecheck
npm run test:api       # starts its own api on :3457 against local Postgres; 263 checks
npm run screenshots    # needs `npm run dev`; a new salon's whole journey at 400px and 1440px
```

`test:api` covers the setup flow, booking and deposits, the admin tools, the addresses
(landing, dashboard, `www.`, `/admin`, `/book`, redirects, 404s), link previews and the
security edges: tenant isolation, CSRF, upload validation, private payment screenshots, rate
limits and session revocation. `screenshots` drives Chrome through the landing page and a
brand-new salon's whole journey: the admin creating and handing it over and resetting the owner's password, the
owner's first visit, ready menu, photos, brand, hours and bookings, a customer booking with
a CliQ deposit and screenshot, the owner approving one payment and rejecting another,
English and desktop, then a cover photo, the page by day and the dashboard in the salon's
colours, and the launch splash. It writes 57 PNGs to `screenshots/` and fails on any page error,
console error, CSP violation or unexpected failed request. It finds Chrome at `CHROME_PATH`
or in the usual places.

## Build and deploy

```sh
npm run build          # dist/ (server) + dist/web/ (minified app)
docker build -t salon-api .
docker run salon-api node dist/migrate.js   # migrate task
docker run -p 3000:3000 salon-api           # api
```

In production set `NODE_ENV=production` (Secure cookies, HSTS, trust Caddy's
`X-Forwarded-*`, serve `dist/web`) and `DATABASE_URL`. `/healthz` is the health check.
Seed a production brand with `SEED_DOMAIN=salonak.app`, `SEED_ADMIN_PHONE` and
`SEED_ADMIN_PASSWORD` (the brand's names default to Salonak and صالونك; the landing
page's WhatsApp number defaults to the admin's phone); the demo salon is off by default
in production. DNS needs the bare domain and a wildcard (`*.salonak.app`) pointing at
the server, and a wildcard certificate.

## Layout

```
migrations/            numbered SQL, idempotent
src/server.ts          http server, routing, Origin check, errors
src/static.ts          index.html per host and path: which app, theme, manifest, link preview, JSON-LD
src/pages.ts           the small server pages: salon unavailable, page not found
src/tenancy.ts         Host -> brand + site (landing, admin, salon) + salon (and earlier links, suspended salons)
src/brand.ts           the two apps: icon backgrounds and versions, launch screens, app colours
src/booking.ts         availability, booking, deposit holds
src/colors.ts          salon colour maths (night base, readable accent)
src/auth.ts            passwords, sessions, roles, login rate limit, phone normalising
src/media.ts           upload validation, photo styles, app icons, the shared-link picture
src/hours.ts           weekly hours parsing/validation
src/routes/            auth, admin, public (page data, manifest, icons, media), salon, services, staff, bookings
web/index.html         rendered per host and path (title, theme, manifest, CSS colours, previews)
web/assets/app.css     the design system (tokens, components, studio and public themes)
web/assets/js/         app.js (path routes), i18n.js (all text), dom.js (toolkit), preview.js (phone
                       previews), chart.js, slots.js, hours-editor.js, templates.js (palettes,
                       ready menus), views/
scripts/               build-web.mjs, test-api.ts, screenshots.ts
```

## Next steps

1. **Launch on AWS** at `salonak.app` (bought): Terraform for ECR, ECS on one EC2
   host, RDS (with automated backups), Route 53 for the domain (the bare domain and
   `*.salonak.app`), and Caddy with a wildcard certificate (DNS challenge) so every
   salon's subdomain has HTTPS, plus the build → migrate → roll deploy script. Run one
   api task at first: live updates and rate limits are kept in memory.
2. **Notifications**: Web Push (VAPID) so owners hear about new bookings and sent
   deposits with the studio closed. The service worker is already registered.
3. **Privacy policy and terms**, linked from the salon page and the booking flow.
4. **AI photo processing**: a background-removal and relighting model would put every
   barber on the same studio backdrop in the salon's colours. It slots in as one more step
   before `renderPortrait` in `src/media.ts`. The studio-touch animation already frames
   it, and the original is kept as it is today.
5. Later: SMS or WhatsApp checks on customers' numbers, reminders, rescheduling, logins
   for barbers.
