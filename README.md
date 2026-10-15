# Salonak (صالونك)

One codebase, many salons. Each salon gets its own branded app on a subdomain
(`elite.salonak.app`), installable on customers' phones with the salon's own name,
icon and colours. The domain is a setting: any brand domain works the same way.

| Address | Who | What it is |
| --- | --- | --- |
| `salonak.app` | Salon owners we sell to | The landing page: a salon magazine whose cover star is the reader's own salon, and a WhatsApp button |
| `salonak.app/admin` | Salon owners looking for their dashboard | Asks for the salon's link and sends them to its sign-in |
| `admin.salonak.app` | Platform owner (super admin) | See every salon's activity and setup, create salons and hand them over, rename them or move them to a new link, suspend them, reset owners' passwords, set the platform's contact number |
| `elite.salonak.app` | Customers | The salon's own website and app: its page, booking a service with anyone or a chosen barber, a CliQ deposit when the salon asks for one, following or cancelling the booking |
| `elite.salonak.app/book` | Customers | Straight into booking (for the salon's Instagram bio and WhatsApp) |
| `elite.salonak.app/admin` | Salon owner | Its own installable app: set up the salon (details, logo, app icon, cover photo, colours, how their page and their dashboard look, services and prices, team with photos, opening hours), run the day's bookings, check CliQ deposits |

`www.salonak.app` goes to `salonak.app`; `salonak.app/admin` asks salon owners for their
salon's link and sends them to `<salon>.salonak.app/admin` (`src/owner-door.ts`). The
platform dashboard is only at `admin.salonak.app`. Each customer's booking has its own
page at `elite.salonak.app/b/<token>`. Addresses have no trailing slash: `/admin/bookings/`
or `/privacy/` answer with a 301 to the same address without it.

## The owner studio

The salon owner's workspace (`elite.salonak.app/admin`) is designed to impress
on first open. It's a deep indigo studio lit in violet and blue, with glass
surfaces, a floating tab bar and plenty of motion: drifting background light, a
light circling the main card, a tab highlight that slides between tabs, gradient
headings and numbers, and buttons with a sheen. On desktop it has a sidebar and a
live preview of the salon's app. The studio's colours are its own; each salon's
colours appear in its app (the previews and the icon).

- **Home**: a greeting, a readiness ring that counts up, the four setup steps
  with the next one as a button, numbers at a glance, open/closed now, and the app
  link to copy or share, laid out as a bento grid on desktop. A tilted phone shows the
  salon's app as it looks right now. When every step is done, the page celebrates
  (once) and becomes a share-your-app card.
- **Brand**: name, logo, colours and team photo style, with a live preview and a
  menu to jump between its sections.
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
- **Bookings**: deposits waiting for a check come first (with the customer's
  transfer screenshot, reviewed full screen; one nobody decided stays until it is,
  with its date), then a day strip with counts and paging by week, and the day as a
  timeline: the visits, the free time between them (tap it to add a booking there)
  and a line at the current time. A summary gives the day's visits, expected takings,
  arrivals and free time; on desktop it sits in a side column with the deposits and
  the open visit. Each visit's sheet shows its progress (booked, deposit sent,
  confirmed, arrived) with call, WhatsApp, arrived, no-show, cancel and undo;
  "arrived" opens an hour before the visit and "no-show" once it has started. Then
  bookings taken by phone, booking settings, and a question before anything that
  cannot be undone. New bookings and sent deposits arrive live; the live line
  reconnects by itself and catches up on what it missed, and keyboard focus stays
  where it was when the day redraws.
- **Settings** (sheet): contact details, password,
  language, sign out. Owners still on a temporary password the admin set see a
  reminder on Home until they choose their own.
- **Login and platform admin** use the same design: a violet and blue aurora
  behind login, and each salon's real app icon in the admin dashboard. On desktop the
  login sits beside a showcase (on a salon's link, its own app); "forgot your
  password?" opens a WhatsApp message to the platform.

Arabic first and fully mirrored in English. The typeface is Readex Pro
(self-hosted, OFL). Motion respects `prefers-reduced-motion`. Sheets take focus and
make the page behind them inert; Escape or the phone's Back closes the top one, and
changing screens closes them all.

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
(tap one to book it), a carousel of team portraits (tap one to book with that
person), the week's hours with today lit, and contact details. Upcoming visits
booked on this device show as tickets near the top. A glass bar with the salon's
name and tabs for its sections slides in once the hero scrolls away, sections drift
in as they come into view, and a glowing book button stays at hand. On a phone it
reads as the salon's app; on a desktop as its website, with the hours and contact
details held in a column beside the menu. The owner's live previews show the same
page in miniature.

Booking takes four steps (service, with whom, day and time, name and mobile); "with
whom" is skipped when only one person does the service. Times are grouped by part of
the day, and after midnight the rest of last night's late opening is offered as
"tonight". When the salon asks for a CliQ deposit, the booking holds its slot (never
past the visit's start) while the customer sends it and uploads the transfer
screenshot; a screenshot that arrives in time secures the booking. The owner checks
the bank app, looks at the screenshot and confirms or rejects. Screenshots are private
(only the salon's owner and the customer's own booking link can open them), can be
uploaded or replaced only before the visit starts and until the owner decides, and are
deleted a week after the booking last changes (a week after the visit if the owner
never decides). The booking's own page follows its status live, keeps the deposit
countdown in step with the server, and offers add to calendar, directions and book
again. Two bookings for the same barber can never overlap: the database refuses it.

## The landing page

`salonak.app` sells the platform to salon owners, in Arabic and English, as "The Cover
Issue": a luxury salon magazine whose cover star is the reader's own salon, in ink,
bone paper and warm mirror-bulb light. Every colour on the page belongs to a salon; the
platform's violet and blue show only in its small mark. The scenes play as you scroll,
with parallax and pinned spreads (transforms and opacity only): the cover, the
editor's letter, a white-label anatomy spread (eight numbered parts around a live
phone: name and logo, colours, cover, app icon, launch screen, link, link preview and
dashboard, and a lens on the one small line that is ours: "your name on the cover,
ours in the fine print"), a collection of three made-up salons, try it on your salon
(type its name, pick a palette and a night or day look, and the app dresses itself in
them), the app in a customer's pocket, a whole booking with a CliQ deposit, the
owner's dashboard backstage, three steps to start and the finale. The WhatsApp
buttons open a chat with the platform's number; without one they are hidden and the
page says "coming soon".

It has three modes: full; lite (Save-Data, low-memory phones, or frames running slow
while scrolling), with fewer moving parts; and still (reduced motion, landscape
phones, browsers missing what the scenes need, or any error), a calm and complete
page. Its script, its words and its stylesheet (`landing.css`) load on the landing
page only.

## Link previews and search

A salon's link shared on WhatsApp, Instagram or Facebook shows its name, its about
text and a 1200×630 picture (`/share.jpg`): its cover photo, or its icon on its page
colour. Search engines get the salon as a local business (name, address, phone,
opening hours, including closing times past midnight) in JSON-LD. Dashboards and
customers' booking pages carry `noindex`, API answers carry `X-Robots-Tag: noindex`,
and each host serves its own `robots.txt`, which lets crawlers fetch the two API calls
the public pages draw themselves from. The landing page has its own preview.

## Privacy policy and terms

`/privacy` and `/terms`, in Arabic and English (`?lang=en`), on every host. They are
plain server pages (no scripts) that describe what the code actually does: what is
stored, who sees it (each salon only its own customers; payment screenshots only the
owner and the customer, uploaded only before the visit starts), how long it is kept
(screenshots a week after the booking last changes, or a week after the visit if the
owner never decides; sign-ins 30 days), no ads, no tracking, no analytics, and that
money never passes through the platform. On a salon's link they wear the salon's name
and colours and say that the salon provides the service while the platform runs the
page for it; search engines are pointed at the platform's copy. A contents list sits
beside the text on desktop and folds above it on phones. They are linked from the
salon page, the booking step ("by confirming you agree to…"), the landing page and
the owner's settings, and give the platform's WhatsApp number for requests when one
is set (without it, the sentences that point to it are left out). The text lives in
`src/legal.ts`; change it together with the code it describes. It is a careful draft,
not legal advice: have it reviewed by a lawyer in Jordan, and add the company's legal
name and an email address once the company is registered.

## The AI mirror (try a cut before booking)

A customer takes a selfie (or picks a photo), chooses one of 16 cuts (8 men's, 8
women's) and, if they like, one of 7 colours, and an AI image model redraws only the
hair on their own photo. They compare before and after with a slider, try more, save
the picture, and book the one they like in one tap: the booking carries the look
(`skin_fade` or `bob:honey`), and the owner sees "requested cut: Bob · Honey
balayage" on the schedule and in the booking, with the cut drawn and the colour
swatch. Only that name is stored, never a picture.

- **Owners choose** in Settings: off, men's cuts, women's cuts or both. The switch
  shows only when the platform has an AI provider configured; without one the mirror
  is off everywhere.
- **Privacy:** nothing is sent until the customer agrees; the photo and the result
  pass through the api in memory (`POST /api/public/tryon`, no storage, no logs of
  the image), come back as a metadata-free JPEG with `Cache-Control: no-store`, and
  live in the customer's tab until it closes. The privacy policy and terms describe it.
- **Providers** (`src/tryon.ts`): Google Gemini (default, `gemini-2.5-flash-image`,
  roughly US$0.04 a picture) or OpenAI (`gpt-image-2`, roughly US$0.05 at medium
  quality), chosen with `AI_TRYON_PROVIDER`; the prompt asks for a photorealistic
  edit that changes only the hair and keeps the face, beard, glasses, clothes,
  background and light. In development a built-in stand-in tints the hair so the whole
  flow works offline.
- **Cost control:** tries are capped per address (6 per 10 minutes, 25 a day), per
  salon (150 a day) and for the platform (1500 a day), with at most 6 drawing at once.
  All are settings (`AI_TRYON_*`). A photo smaller than 256 pixels is refused before it
  costs anything.
- **The camera:** the front camera in the page (`getUserMedia`, allowed by
  `Permissions-Policy: camera=(self)`), with an oval to frame the head; without it (or
  without permission) the phone's own camera through the file picker.

## The platform dashboard (admin)

Leads with new bookings across all salons over the last 30 days (the last 7 days
against the 7 before, the busiest day and the daily average on desktop, a readout that
snaps to a day and a table view), then active salons, salons ready to take bookings,
upcoming visits and customers. Salons are searchable, filterable cards or a list:
those that need attention first, then by bookings, each showing live status, setup
progress, recent bookings and when the owner last used the studio. On desktop a salon
opens in a drawer beside the list; a brand-new one shows one calm line and a WhatsApp
nudge for its owner instead of a grid of zeros. Each salon's sheet can suspend it
(customers see a calm "unavailable" page), change its name or link (earlier links
keep redirecting to the new one), call or message the owner, and reset the owner's
password: a readable temporary password, shown once and sendable on WhatsApp.
Creating a salon ends on a hand-over card with the dashboard link and sign-in details.

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
- Frontend: one Arabic-first RTL single-page app in vanilla HTML/CSS/JS (`web/`). The
  apps' text is in one string table (`web/assets/js/i18n.js`, ar/en, with Arabic
  plural forms).
  Digits are always Western, and Arabic-Indic digits typed by users are converted.
  Mobile-first. Minified with terser at build.
  One design system (`web/assets/app.css`) with two themes on shared tokens: the
  owner studio and the salon's night page. The landing page has its own stylesheet
  (`web/assets/landing.css`) and its own copy of its words, in `landing.js`.
- Images: `sharp`. Stored in Postgres (`media` table) as re-encoded WebP.

## Multi-tenancy

The `Host` header decides everything (`src/tenancy.ts`):

- `brand.com` → the platform's landing page, and at `/admin` the owners' door (type
  your salon's link, go to its sign-in; a renamed salon's earlier link works too);
  `admin.brand.com` → its dashboard (the super admin signs in and works only there);
  `www.brand.com` → redirects to `brand.com`.
- `<sub>.brand.com` → that salon: the customers' app at `/` (with `/book` and
  `/b/<token>`), the owner's app at `/admin`. A salon's earlier links (after the admin moves it)
  redirect to its current one. A suspended salon shows a calm "unavailable" page (503)
  on every page a browser opens, in its colours, and sends `/privacy` and `/terms` to
  the platform's. A link no salon has gets a "no salon here" page (404) with the way to
  the platform; the API answers `not_found`.
- Several brands can share the deployment: each row in `tenants` is a brand domain.

Every query is scoped to the salon from the host. Child tables carry `salon_id` with
composite foreign keys, so the database itself refuses a service linked to another
salon's barber, or a photo from another salon.

## Security notes

- Phone + password login. Passwords use scrypt. Session tokens are random, only
  their SHA-256 is stored, and the cookie is `HttpOnly`, `SameSite=Lax`, `Secure` in
  production, and host-only. A session is bound to the host that created it, so a cookie
  from one salon is useless on another. Changing the password signs out other devices.
- Login failures are limited per client address and account together (8 / 15 min), per
  client address (30 / 15 min) and per account from anywhere (20 / 15 min). IPv6 addresses
  count by their /64. A browser that has signed in to the account before carries an
  `HttpOnly` device mark (an HMAC of the password hash, so it dies with a password change)
  and is counted apart: guessing spread over many addresses locks the account for
  strangers, not for the owner on their own phone. Each attempt counts before the
  password check, so parallel guesses are limited too.
  Changing the password checks the current one under the same limits.
- Writes need JSON (or a raw image body) and a same-host `Origin`, which blocks CSRF.
- Uploads are judged by their bytes (JPEG/PNG/WebP magic numbers and a real decode),
  never by the declared type. They are auto-rotated, stripped of metadata and re-encoded
  before storage, and served with `nosniff` and `Content-Security-Policy: sandbox`.
- The app has a strict CSP: scripts from self only, and a per-request nonce for the one
  inline style block that carries the salon's colours.

## Robustness

- **Booking**: two "anyone" bookings at the same moment get two barbers instead of one
  failing; times stay right on nights the clocks change; after midnight the rest of a
  late opening can still be booked. "No-show" needs the visit to have started and
  "arrived" opens an hour before it, and an arrived visit keeps its chair until it ends.
- **Deposits**: the hold never runs past the visit's start; a screenshot that arrives in
  time secures the booking even if the hold ends during the upload; payments nobody
  decided stay at the top of the owner's list, and their screenshots are deleted a week
  after the visit.
- **Customers' names**: a booking made with a number the salon already knows keeps the
  name it was made under (migration 010) and never renames that customer.
- **Pictures**: a new photo style re-renders the team outside the database transaction,
  two at a time, and the last saved style wins; icons and share pictures render once
  per burst, from a cache with a byte budget.
- **Pages**: salon text with `$` or `{{…}}` goes in as written; a malformed id is a 400,
  not a 500; the default contact is never the admin's sign-in number.
- **In the app**: the owner's live updates reconnect and catch up; a failed first load
  offers Retry instead of endless skeletons; one failed poll no longer replaces a
  booking page; the deposit countdown re-syncs with the server; a taken time no longer
  leaves the booking sheet on a blank step; the hours editor keeps keyboard focus; a
  failed photo no longer duplicates a new team member; Enter in the platform settings
  saves instead of reloading.

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
npm run test:api       # starts its own api on :3457 against local Postgres; 391 checks
npm run screenshots    # needs `npm run dev`; a new salon's whole journey at 400px and 1440px
```

`test:api` covers the setup flow, booking and deposits (including after midnight, clock
changes and payments nobody decided), the admin tools, the addresses (landing,
dashboard, `www.`, the owners' door at `/admin`, `/book`, trailing slashes, redirects,
404s, unknown and suspended salons), seeding a brand, link previews, the privacy
policy and terms, the AI mirror (owner switch, catalogue, picture, limits and the
look on a booking), and the security edges: tenant isolation, CSRF, upload validation,
private payment screenshots, rate limits and session revocation. `screenshots` drives Chrome through the landing page and a
brand-new salon's whole journey: the admin creating and handing it over and resetting the owner's password, the
owner's first visit, ready menu, photos, brand, hours and bookings, a customer booking with
a CliQ deposit and screenshot, the owner approving one payment and rejecting another,
English and desktop, the owner turning on the AI mirror and a customer trying a cut on a
selfie and booking it, then a cover photo, the page by day and the dashboard in the salon's
colours, and the launch splash. It writes 86 PNGs to `screenshots/` (23 of them the landing page: two still full pages and its scroll beats on desktop and phone) and fails on any page error,
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
`SEED_ADMIN_PASSWORD` (the brand's names default to Salonak and صالونك); the demo salon
is off by default in production. The platform's contact (the landing page's WhatsApp
buttons and the legal pages) is not the admin's sign-in number, which would be
published: production has none until `SEED_CONTACT_PHONE` is set or the admin sets one
in the dashboard, and a re-seed changes it only when `SEED_CONTACT_PHONE` is set. A
laptop's dev seed uses the dev admin's. DNS needs the bare domain and a wildcard
(`*.salonak.app`) pointing at the server, and a wildcard certificate.

This version needs migration 010 (`bookings.customer_name`, backfilled): run the migrate
task before the new api starts.

## Layout

```
migrations/            numbered SQL, idempotent
src/server.ts          http server, routing, Origin check, errors
src/static.ts          index.html per host and path: which app, theme, manifest, link preview, JSON-LD
src/pages.ts           the small server pages: salon unavailable, page not found, a salon link nobody has
src/owner-door.ts      salonak.app/admin: owners type their salon's link and go to its sign-in
src/legal.ts           the privacy policy and the terms (Arabic and English)
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
web/assets/landing.css the landing page's scenes (loaded on the landing page only)
web/assets/js/         app.js (path routes), i18n.js (the apps' text), dom.js (toolkit), preview.js (phone
                       previews), chart.js, slots.js, hours-editor.js, templates.js (palettes,
                       ready menus), views/ (landing.js is the landing page, with its own words)
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
3. **AI photo processing**: a background-removal and relighting model would put every
   barber on the same studio backdrop in the salon's colours. It slots in as one more step
   before `renderPortrait` in `src/media.ts`. The studio-touch animation already frames
   it, and the original is kept as it is today.
4. Later: SMS or WhatsApp checks on customers' numbers, reminders, rescheduling, logins
   for barbers.
