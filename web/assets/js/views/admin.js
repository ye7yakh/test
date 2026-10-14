// Platform owner: every salon on this brand at a glance, and the controls to run
// them: create and hand over, rename or move to a new link, suspend, reset an
// owner's password. Leads with the one number that says the platform is alive:
// bookings coming in. Salons that need a nudge come first.
import { api } from '../api.js';
import { barChart } from '../chart.js';
import { appReady, avatar, busy, clear, confetti, confirmDelete, countUp, field, h, icon, input, markInvalid, scissorsMark, sheet, stagger, switchRow, toast, toastError } from '../dom.js';
import { errorText, getLang, pick, t, westernDigits } from '../i18n.js';
import { fmtDate } from '../slots.js';
import { waNumber } from './booking.js';

const LOCALE = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-u-nu-latn');
const fmtNumber = (n) => new Intl.NumberFormat(LOCALE(), { maximumFractionDigits: 1 }).format(n);
const SETUP = ['brand', 'services', 'team', 'photos'];
const FILTERS = ['all', 'active', 'setup', 'suspended'];
const baseHost = () => location.host.replace(/^(admin|www)\./, '');
const bare = (url) => url.replace(/^https?:\/\//, '');
/** The link as people will type it: no scheme, no dev port. */
const shortLink = (url) => bare(url).replace(/:\d+$/, '');
// Keeps "+18%" in one piece inside Arabic text.
const isolate = (s) => `⁦${s}⁩`;
const SVG_NS = 'http://www.w3.org/2000/svg';
const LAYOUT_KEY = 'admin-layout';

const statusOf = (s) => (!s.active ? 'suspended' : s.ready ? 'ready' : 'setup');
const setupDone = (s) => SETUP.filter((k) => s.setup[k]).length;
/** Live salons that are stuck: setup unfinished, still on a temporary password, or never opened. */
const needsAttention = (s) => {
  const owner = s.owners[0];
  return s.active && (!s.ready || !owner || owner.must_change_password || !owner.last_seen_at);
};

/** "3 hours ago", "yesterday". Last-seen is written hourly, so nothing finer than "just now". */
function relative(iso) {
  if (!iso) return null;
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 3600) return t('admin.just_now');
  const rtf = new Intl.RelativeTimeFormat(LOCALE(), { numeric: 'auto' });
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 45) return rtf.format(Math.round(seconds / 86400), 'day');
  return rtf.format(Math.round(seconds / (86400 * 30)), 'month');
}

async function copy(text) {
  await navigator.clipboard?.writeText(text).catch(() => {});
  toast(t('copied'));
}

const savedLayout = () => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
};
const saveLayout = (layout) => {
  try {
    localStorage.setItem(LAYOUT_KEY, layout);
  } catch {}
};

/** Two small glyphs the shared icon set does not have: cards and rows. */
function glyph(kind) {
  const el = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'aria-hidden': 'true', class: 'icon' })) el.setAttribute(k, v);
  const shapes = kind === 'grid'
    ? [['rect', { x: 4, y: 4, width: 6.5, height: 6.5, rx: 2 }], ['rect', { x: 13.5, y: 4, width: 6.5, height: 6.5, rx: 2 }], ['rect', { x: 4, y: 13.5, width: 6.5, height: 6.5, rx: 2 }], ['rect', { x: 13.5, y: 13.5, width: 6.5, height: 6.5, rx: 2 }]]
    : [['path', { d: 'M9.5 6.5H20M9.5 12H20M9.5 17.5H20' }], ['circle', { cx: 5, cy: 6.5, r: 1.2 }], ['circle', { cx: 5, cy: 12, r: 1.2 }], ['circle', { cx: 5, cy: 17.5, r: 1.2 }]];
  for (const [tag, attrs] of shapes) {
    const s = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, String(v));
    el.append(s);
  }
  return el;
}

/** The salon's own app icon, or the platform mark while it is offline. */
function salonIcon(s) {
  const box = h('div', { class: 'sc-icon' });
  const fallback = () => clear(box, h('div', { class: 'mark' }, scissorsMark()));
  if (!s.active) fallback();
  else {
    const img = h('img', { src: s.icon_url, alt: '', loading: 'lazy' });
    img.addEventListener('error', fallback, { once: true });
    box.append(img);
  }
  return box;
}

// ---------------------------------------------------------------- the numbers

function trendCard(series) {
  const sum = (list) => list.reduce((n, p) => n + p.n, 0);
  const total = sum(series);
  // The pill speaks for its own window: the last 7 days against the 7 before.
  const last7 = sum(series.slice(-7));
  const prev7 = sum(series.slice(-14, -7));
  let dir = 'flat';
  let value = t('admin.no_change');
  if (last7 !== prev7) {
    dir = last7 > prev7 ? 'up' : 'down';
    value = prev7 === 0 ? `+${fmtNumber(last7)}` : `${dir === 'up' ? '+' : '−'}${Math.abs(Math.round(((last7 - prev7) / prev7) * 100))}%`;
  }
  const peak = series.reduce((m, p) => (p.n > m.n ? p : m), series[0]);
  const chart = barChart({
    points: series,
    fmtTick: (d) => fmtDate(d, { day: 'numeric', month: 'short' }),
    fmtDay: (d) => fmtDate(d, { weekday: 'long', day: 'numeric', month: 'long' }),
    fmtValue: fmtNumber,
    labels: {
      summary: t('admin.chart_summary', { total: fmtNumber(total), peak: fmtNumber(peak.n), day: fmtDate(peak.date, { day: 'numeric', month: 'long' }) }),
      table: t('admin.table'),
      chart: t('admin.chart'),
      date: t('admin.day'),
      value: t('admin.bookings'),
    },
  });
  const delta = h(
    'span',
    { class: `delta ${dir}` },
    h('span', { class: 'sr-only', text: t('admin.last7_sr', { n: fmtNumber(last7), prev: fmtNumber(prev7) }) }),
    h('span', { class: 'delta-in', 'aria-hidden': 'true' }, icon(dir === 'flat' ? 'minus' : 'trend', dir === 'down' ? 'flip-v' : ''), h('span', { text: t('admin.last7') }), h('b', { text: isolate(value) })),
  );
  // A quiet second reading for wide screens: the busiest day and the daily pace.
  const side = total
    ? h(
        'dl',
        { class: 'trend-side' },
        h('div', null, h('dt', { text: t('admin.busiest') }), h('dd', null, h('b', { class: 'num', text: fmtNumber(peak.n) }), h('span', { text: fmtDate(peak.date, { weekday: 'long', day: 'numeric', month: 'long' }) }))),
        h('div', null, h('dt', { text: t('admin.daily_avg') }), h('dd', null, h('b', { class: 'num', text: fmtNumber(Math.round((total / series.length) * 10) / 10) }), h('span', { text: t('admin.per_day') }))),
      )
    : null;
  return h(
    'section',
    { class: 'card glow trend-card' },
    h(
      'div',
      { class: 'trend-head' },
      h(
        'div',
        { class: 'trend-main' },
        h('h2', { class: 'eyebrow', text: t('admin.bookings_30') }),
        h('div', { class: 'trend-row' }, countUp(h('div', { class: 'hero-figure' }), total, { format: fmtNumber, duration: 1200 }), delta),
      ),
      side,
    ),
    chart,
  );
}

function kpis(totals) {
  const tile = (name, value, label, sub, extra = null) => h(
    'div',
    { class: 'kpi' },
    h('div', { class: 'kpi-top' }, h('span', { class: 'kpi-icon' }, icon(name)), h('span', { class: 'kpi-label', text: label })),
    countUp(h('div', { class: 'kpi-value' }), value, { format: fmtNumber }),
    h('div', { class: 'kpi-sub', text: sub }),
    extra,
  );
  const share = totals.active ? totals.ready / totals.active : 0;
  return h(
    'div',
    { class: 'kpis' },
    stagger([
      tile('store', totals.active, t('admin.k_active'), `${t('admin.k_of', { n: fmtNumber(totals.salons) })}${totals.suspended ? ` · ${fmtNumber(totals.suspended)} ${t('admin.f_suspended')}` : ''}`),
      tile('checkCircle', totals.ready, t('admin.k_ready'), t('admin.k_ready_sub'), h('div', { class: 'meter', 'aria-hidden': 'true' }, h('i', { style: { '--v': String(share) } }))),
      tile('calendar', totals.upcoming, t('admin.k_upcoming'), t('admin.k_upcoming_sub')),
      tile('users', totals.customers, t('admin.k_customers'), t('admin.k_customers_sub')),
    ], 1),
  );
}

// ---------------------------------------------------------------- salons

/**
 * One salon, compact: icon, name and link, status; the setup bar only while it is
 * being set up; then one line with its bookings and its owner's last visit. In the
 * list layout (wide screens) the same pieces line up as columns.
 */
function salonCard(s, open) {
  const owner = s.owners[0];
  const status = statusOf(s);
  const done = setupDone(s);
  const seen = relative(owner?.last_seen_at);
  const bookings = [t('admin.b30', { n: s.stats.bookings_30d })];
  if (s.stats.upcoming) bookings.push(t('admin.upcoming_n', { n: s.stats.upcoming }));
  return h(
    'button',
    { class: `salon-card ${status}`, type: 'button', onclick: () => open(s.id) },
    h('div', { class: 'sc-avatar' }, salonIcon(s), h('span', { class: 'live-dot', 'aria-hidden': 'true' })),
    h('div', { class: 'sc-id' }, h('div', { class: 'name truncate', text: pick(s, 'name') }), h('div', { class: 'link truncate', text: shortLink(s.url) })),
    h('span', {
      class: `pill sc-status ${status === 'suspended' ? 'off' : status === 'ready' ? 'ok' : 'warn'}`,
      text: status === 'suspended' ? t('admin.f_suspended') : status === 'ready' ? t('admin.ready') : t('admin.setup_n', { n: done }),
    }),
    h('div', { class: 'sc-setup', 'aria-hidden': 'true' }, h('span', { class: 'segs' }, SETUP.map((k) => h('i', { class: s.setup[k] ? 'on' : '' }))), h('b', { class: 'num', text: `${done}/4` })),
    h(
      'div',
      { class: 'sc-line' },
      h('span', { class: 'sc-book' }, icon('calendar'), h('span', { class: 'truncate', text: bookings.join(' · ') })),
      h(
        'span',
        { class: 'sc-seen' },
        icon('user'),
        // Name and time apart: the name truncates, the time always shows in full.
        ...(owner
          ? [
              // dir=auto: an Arabic name in English (or a Latin one in Arabic) is cut at its own end.
              h('span', { class: 'truncate sc-who', dir: 'auto', text: owner.name || owner.phone }),
              h('span', { class: 'sc-when' }, h('span', { class: 'sc-sep', text: getLang() === 'ar' ? '، ' : '· ' }), seen ?? t('admin.never')),
            ]
          : [h('span', { class: 'truncate', text: t('admin.no_owner') })]),
        owner?.must_change_password ? h('span', { class: 'pill warn tiny', text: t('admin.temp_pw') }) : null,
      ),
    ),
  );
}

function salonsSection(salons, view, open) {
  const counts = {
    all: salons.length,
    active: salons.filter((s) => s.active).length,
    setup: salons.filter((s) => statusOf(s) === 'setup').length,
    suspended: salons.filter((s) => !s.active).length,
  };
  const keep = {
    all: () => true,
    active: (s) => s.active,
    setup: (s) => statusOf(s) === 'setup',
    suspended: (s) => !s.active,
  };
  const search = h('input', { type: 'search', class: 'search-input', value: view.query, placeholder: t('admin.search'), 'aria-label': t('admin.search'), autocomplete: 'off', enterkeyhint: 'search' });
  const chips = h('div', { class: 'scroller filter-row', role: 'tablist', 'aria-label': t('admin.title') });
  const results = h('div', { class: 'salon-results' });

  // Cards or rows (wide screens only); remembered on this device.
  const layoutBtn = (kind) => {
    const btn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t(`admin.view_${kind}`), title: t(`admin.view_${kind}`), 'aria-pressed': String(view.layout === kind) }, glyph(kind));
    btn.addEventListener('click', () => {
      view.layout = kind;
      saveLayout(kind);
      for (const b of layoutBtns.children) b.setAttribute('aria-pressed', String(b === btn));
      for (const g of results.querySelectorAll('.salon-grid')) g.classList.toggle('list', kind === 'list');
    });
    return btn;
  };
  const layoutBtns = h('div', { class: 'layout-toggle', role: 'group', 'aria-label': t('admin.view') }, layoutBtn('grid'), layoutBtn('list'));

  function matches(s) {
    const q = westernDigits(view.query).toLowerCase().replace(/\s+/g, '');
    if (!q) return true;
    const owner = s.owners[0];
    return [s.name_ar, s.name_en, s.subdomain, owner?.name, owner?.phone].some((v) => (v ?? '').toLowerCase().replace(/\s+/g, '').includes(q));
  }
  function renderChips() {
    clear(chips, FILTERS.map((f) => h(
      'button',
      { class: `chip-btn ${view.filter === f ? 'on' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(view.filter === f), onclick: () => { view.filter = f; renderChips(); renderGrid(); } },
      t(`admin.f_${f}`),
      // An empty filter needs no "0" badge; it keeps the four filters within a phone's width.
      counts[f] || f === 'all' ? h('span', { class: 'chip-count num', text: String(counts[f]) }) : null,
    )));
  }
  const listHead = () => h(
    'div',
    { class: 'salon-list-head', 'aria-hidden': 'true' },
    h('span'),
    h('span', { text: t('admin.col_salon') }),
    h('span', { text: t('admin.setup') }),
    h('span', { text: t('admin.col_bookings') }),
    h('span', { text: t('admin.s_seen') }),
    h('span', { text: t('admin.col_status') }),
  );
  function group(label, items, start, cls = '') {
    return h(
      'div',
      { class: `salon-group ${cls}` },
      label,
      h('div', { class: `salon-grid ${view.layout === 'list' ? 'list' : ''}` }, listHead(), stagger(items.map((s) => salonCard(s, open)), Math.min(start, 8))),
    );
  }
  function renderGrid() {
    const list = salons.filter((s) => keep[view.filter](s) && matches(s));
    if (!list.length) {
      clear(results, h('p', { class: 'empty small', text: t('admin.no_match') }));
      return;
    }
    const byBookings = (a, b) => b.stats.bookings_30d - a.stats.bookings_30d || b.stats.upcoming - a.stats.upcoming;
    const urgent = list.filter(needsAttention).sort((a, b) => setupDone(a) - setupDone(b) || byBookings(a, b));
    const rest = list.filter((s) => !needsAttention(s)).sort(byBookings);
    const label = (text, n, cls) => h('h3', { class: `group-label ${cls}` }, h('span', { text }), h('span', { class: 'chip-count num', text: String(n) }));
    clear(
      results,
      urgent.length ? group(label(t('admin.attention'), urgent.length, 'warn'), urgent, 0, 'urgent') : null,
      rest.length ? group(urgent.length ? label(t('admin.by_bookings'), rest.length, '') : null, rest, urgent.length) : null,
    );
  }
  search.addEventListener('input', () => {
    view.query = search.value.trim();
    renderGrid();
  });
  renderChips();
  renderGrid();
  return h(
    'section',
    { class: 'section salons' },
    h('div', { class: 'section-head' }, h('h2', null, t('admin.title'), h('span', { class: 'count num', text: String(salons.length) }))),
    h('label', { class: 'search-box' }, icon('search'), search),
    h('div', { class: 'salon-tools' }, chips, layoutBtns),
    results,
  );
}

// ---------------------------------------------------------------- sheets

/** Keeps the confetti off a sheet: the canvas is clipped to everything around it. */
function keepConfettiOff(canvas, panel) {
  // Layout box, not the animated one: the sheet may still be sliding in.
  const x = panel.offsetLeft;
  const y = panel.offsetTop;
  const w = panel.offsetWidth;
  const ht = panel.offsetHeight;
  canvas.style.clipPath = `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${x}px ${y}px, ${x + w}px ${y}px, ${x + w}px ${y + ht}px, ${x}px ${y + ht}px, ${x}px ${y}px)`;
}

/** Sign-in details to pass on: each copyable, all of it sendable on WhatsApp. */
function credentialsSheet({ title, intro, rows, waPhone, waText, celebrate = false }) {
  const list = h('div', { class: 'cred' }, rows.map((r) => {
    const btn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': `${t('copy')}: ${r.label}`, title: t('copy') }, icon('copy'));
    btn.addEventListener('click', () => copy(r.value));
    return h('div', { class: `cred-row ${r.secret ? 'secret' : ''} ${r.link ? 'link' : ''}` }, h('div', { class: 'grow' }, h('div', { class: 'eyebrow', text: r.label }), h('div', { class: 'v ltr', text: r.value })), btn);
  }));
  const done = h('button', { class: 'btn btn-secondary', type: 'button', text: t('admin.done') });
  const wa = waPhone
    ? h('a', { class: 'btn btn-primary sheen', href: `https://wa.me/${waNumber(waPhone)}?text=${encodeURIComponent(waText)}`, target: '_blank', rel: 'noopener' }, icon('chat'), t('admin.send_wa'))
    : null;
  const panel = sheet({ title, body: h('div', null, intro ? h('p', { class: 'muted cred-intro', text: intro }) : null, list), actions: [done, wa] });
  done.addEventListener('click', () => panel.close());
  if (celebrate) {
    setTimeout(() => {
      if (!panel.el.isConnected) return;
      confetti(['#a855f7', '#6366f1', '#3b82f6', '#ffffff', '#f5d06f']);
      const canvas = document.body.lastElementChild;
      if (canvas?.matches('canvas.confetti')) keepConfettiOff(canvas, panel.el);
    }, 250);
  }
}

/** The platform's own settings: its landing page, the WhatsApp number salons reach it on, signing out. */
async function openPlatform(app) {
  let res;
  try {
    res = await api('GET', '/api/admin/platform');
  } catch (err) {
    toastError(err);
    return;
  }
  const landing = `${location.protocol}//${baseHost()}`;
  const phone = input({ name: 'contact_phone', type: 'tel', inputmode: 'tel', value: res.contact_phone, autocomplete: 'off', enterkeyhint: 'done' });
  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  // Enter in the number saves (a form with one field would otherwise submit itself as a GET).
  const form = h(
    'form',
    { novalidate: true, onsubmit: (e) => { e.preventDefault(); save.click(); } },
    h(
      'a',
      { class: 'card platform-link', href: landing, target: '_blank', rel: 'noopener' },
      h('div', { class: 'app-icon studio-mark', style: { '--s': '44px' } }, icon('sparkles')),
      h('div', { class: 'grow' }, h('div', { class: 'name', text: t('admin.landing') }), h('div', { class: 'sub', text: isolate(bare(landing)) })),
      icon('external', 'faint'),
    ),
    h('div', { style: { marginTop: '16px' } }, field(t('admin.contact_phone'), phone, { hint: t('admin.contact_phone_hint') })),
  );
  const out = h('button', { class: 'platform-out', type: 'button' }, h('span', { class: 'tile' }, icon('logout', 'flip-rtl')), h('span', { class: 'grow', text: t('logout') }));
  const panel = sheet({ title: t('admin.platform'), body: h('div', null, form, out), actions: [save] });
  out.addEventListener('click', () => {
    panel.close();
    app.logout();
  });
  save.addEventListener('click', () => busy(save, async () => {
    try {
      const saved = await api('PATCH', '/api/admin/platform', { contact_phone: phone.value });
      app.ctx.tenant.contact_phone = saved.contact_phone;
      toast(t('saved'));
      panel.close();
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));
}

function openCreate(onCreated) {
  const f = {
    name_ar: input({ name: 'name_ar', maxlength: 80 }),
    name_en: input({ name: 'name_en', maxlength: 80, dir: 'ltr' }),
    subdomain: input({ name: 'subdomain', dir: 'ltr', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', maxlength: 32 }),
    owner_name: input({ name: 'owner_name', maxlength: 60 }),
    owner_phone: input({ name: 'owner_phone', type: 'tel', inputmode: 'tel' }),
    owner_password: input({ name: 'owner_password', autocomplete: 'off', dir: 'ltr' }),
  };
  const url = h('div', { class: 'url-preview', text: `${location.protocol}//….${baseHost()}` });
  f.subdomain.addEventListener('input', () => {
    f.subdomain.value = f.subdomain.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    url.textContent = `${location.protocol}//${f.subdomain.value || '…'}.${baseHost()}`;
  });
  const create = h('button', { class: 'btn btn-primary', type: 'button', text: t('admin.create') });
  const form = h(
    'form',
    { class: 'create-form', novalidate: true, onsubmit: (e) => { e.preventDefault(); create.click(); } },
    field(t('admin.name_ar'), f.name_ar),
    field(t('admin.name_en'), f.name_en, { optional: true }),
    h('div', { style: { marginTop: '12px' } }, field(t('admin.subdomain'), f.subdomain, { hint: t('admin.subdomain_hint') }), url),
    h('div', { class: 'f-row', style: { marginTop: '18px' } }, field(t('admin.owner_phone'), f.owner_phone), field(t('admin.owner_name'), f.owner_name, { optional: true })),
    field(t('admin.owner_password'), f.owner_password, { hint: t('admin.owner_password_hint') }),
  );
  const panel = sheet({ title: t('admin.new'), body: form, actions: [create] });
  create.addEventListener('click', () => busy(create, async () => {
    try {
      const res = await api('POST', '/api/admin/salons', Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])));
      panel.close();
      onCreated();
      const link = `${res.url}/admin`;
      const name = f.owner_name.value.trim();
      credentialsSheet({
        title: t('admin.handover'),
        intro: res.owner_created ? t('admin.handover_sub') : t('admin.existing_owner'),
        rows: [
          { label: t('admin.studio_link'), value: link, link: true },
          { label: t('admin.login_phone'), value: f.owner_phone.value.trim() },
          res.owner_created ? { label: t('admin.temp_password'), value: f.owner_password.value, secret: true } : null,
        ].filter(Boolean),
        waPhone: f.owner_phone.value,
        waText: res.owner_created
          ? t('admin.wa_welcome', { name, link, phone: f.owner_phone.value.trim(), password: f.owner_password.value })
          : t('admin.wa_welcome_existing', { name, link }),
        celebrate: true,
      });
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));
}

async function openSalon(id, onChange) {
  let salon;
  try {
    salon = (await api('GET', `/api/admin/salons/${id}`)).salon;
  } catch (err) {
    toastError(err);
    return;
  }
  const body = h('div', { class: 'sd' });
  const panel = sheet({ title: pick(salon, 'name'), body, tall: true });
  // On a wide screen the salon opens in a drawer beside the list, not over it.
  panel.el.classList.add('drawer');
  const title = panel.el.querySelector('.sheet-head h2');
  const update = (next) => {
    salon = next;
    render();
    onChange();
  };

  function render() {
    title.textContent = pick(salon, 'name');
    const owner = salon.owners[0];
    const stats = salon.stats;
    const status = statusOf(salon);
    const done = setupDone(salon);

    const copyLink = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('copy'), title: t('copy'), onclick: () => copy(salon.url) }, icon('copy'));
    const hero = h(
      'div',
      { class: `sd-hero ${status}` },
      h('div', { class: 'sd-icon' }, salonIcon(salon)),
      h('div', { class: 'grow' }, h('div', { class: 'link ltr truncate', text: bare(salon.url) }), h('div', { class: 'small faint', text: t('admin.created_on', { date: new Intl.DateTimeFormat(LOCALE(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(salon.created_at)) }) })),
      copyLink,
    );
    const links = h(
      'div',
      { class: 'sd-links' },
      h('a', { class: 'btn btn-secondary btn-sm', href: salon.url, target: '_blank', rel: 'noopener' }, icon('external'), t('admin.open_page')),
      h('a', { class: 'btn btn-secondary btn-sm', href: `${salon.url}/admin`, target: '_blank', rel: 'noopener' }, icon('sliders'), t('admin.open_studio')),
    );

    const live = switchRow(t('admin.live'), t('admin.live_sub'), salon.active);
    live.el.classList.add('sd-live');
    live.input.addEventListener('change', async () => {
      const on = live.input.checked;
      if (!on && !(await confirmDelete({ title: t('admin.suspend_title'), message: t('admin.suspend_msg'), yesText: t('admin.suspend_yes') }))) {
        live.input.checked = true;
        return;
      }
      try {
        const res = await api('PATCH', `/api/admin/salons/${salon.id}`, { active: on });
        toast(t(on ? 'admin.activated_toast' : 'admin.suspended_toast'));
        update(res.salon);
      } catch (err) {
        live.input.checked = !on;
        toastError(err);
      }
    });

    // A brand-new salon has nothing to count yet: one calm line (and a nudge) instead of a grid of zeros.
    const quiet = !stats.bookings_30d && !stats.upcoming && !stats.customers && !stats.services && !stats.team;
    let statsBlock;
    if (quiet) {
      const link = `${salon.url}/admin`;
      statsBlock = h(
        'div',
        { class: 'sd-quiet' },
        h('span', { class: 'sd-quiet-ic', 'aria-hidden': 'true' }, icon('sparkles')),
        h('div', { class: 'grow' }, h('b', { text: t('admin.no_activity', { n: done }) }), h('span', { text: t('admin.no_activity_sub') })),
        owner
          ? h('a', {
              class: 'btn btn-secondary btn-sm',
              href: `https://wa.me/${waNumber(owner.phone)}?text=${encodeURIComponent(t('admin.wa_nudge', { name: owner.name || '', salon: pick(salon, 'name'), n: done, link }))}`,
              target: '_blank',
              rel: 'noopener',
            }, icon('chat'), t('admin.nudge'))
          : null,
      );
    } else {
      const stat = (value, label, text = false) => h('div', { class: 'sd-stat' }, h('b', { class: text ? 'text' : 'num', text: value }), h('span', { text: label }));
      statsBlock = h(
        'div',
        { class: 'sd-stats' },
        stat(fmtNumber(stats.bookings_30d), t('admin.s_bookings')),
        stat(fmtNumber(stats.upcoming), t('admin.s_upcoming')),
        stat(fmtNumber(stats.customers), t('admin.s_customers')),
        stat(fmtNumber(stats.services), t('admin.s_services')),
        stat(fmtNumber(stats.team), t('admin.s_team')),
        stat(relative(owner?.last_seen_at) ?? t('admin.never'), t('admin.s_seen'), true),
      );
    }

    const setup = h(
      'div',
      { class: 'sd-block' },
      h('div', { class: 'eyebrow', text: `${t('admin.setup')} · ${done}/4` }),
      h('div', { class: 'sd-setup' }, SETUP.map((k) => h('div', { class: `sd-step ${salon.setup[k] ? 'done' : ''}` }, icon(salon.setup[k] ? 'checkCircle' : 'clock'), h('span', { text: t(`step.${k}`) })))),
    );

    let ownerBlock = null;
    if (owner) {
      const reset = h('button', { class: 'btn btn-secondary btn-block', type: 'button' }, icon('key'), t('admin.reset'));
      reset.addEventListener('click', async () => {
        if (!(await confirmDelete({ title: t('admin.reset'), message: t('admin.reset_confirm'), yesText: t('admin.reset_yes') }))) return;
        busy(reset, async () => {
          const res = await api('POST', `/api/admin/salons/${salon.id}/reset-password`);
          const link = `${salon.url}/admin`;
          credentialsSheet({
            title: t('admin.reset_done'),
            intro: t('admin.reset_once'),
            rows: [{ label: t('admin.temp_password'), value: res.password, secret: true }, { label: t('admin.studio_link'), value: link, link: true }],
            waPhone: res.owner.phone,
            waText: t('admin.wa_reset', { name: res.owner.name, password: res.password, link }),
          });
          update((await api('GET', `/api/admin/salons/${salon.id}`)).salon);
        });
      });
      ownerBlock = h(
        'div',
        { class: 'sd-block' },
        h('div', { class: 'eyebrow', text: t('admin.owner') }),
        h(
          'div',
          { class: 'sd-owner' },
          avatar(null, owner.name || '؟'),
          h(
            'div',
            { class: 'grow' },
            h('div', { class: 'name truncate', text: owner.name || t('admin.owner') }),
            h('div', { class: 'small muted ltr', text: owner.phone }),
            owner.must_change_password ? h('span', { class: 'pill warn tiny', text: t('admin.temp_pw') }) : null,
          ),
          h('a', { class: 'icon-btn', href: `tel:${owner.phone}`, 'aria-label': t('sched.call'), title: t('sched.call') }, icon('phone')),
          h('a', { class: 'icon-btn wa', href: `https://wa.me/${waNumber(owner.phone)}`, target: '_blank', rel: 'noopener', 'aria-label': t('sched.whatsapp'), title: t('sched.whatsapp') }, icon('chat')),
        ),
        reset,
      );
    }

    // Name and link. Moving the link keeps the old one working.
    const f = {
      name_ar: input({ name: 'name_ar', value: salon.name_ar, maxlength: 80 }),
      name_en: input({ name: 'name_en', value: salon.name_en, maxlength: 80, dir: 'ltr' }),
      subdomain: input({ name: 'subdomain', value: salon.subdomain, dir: 'ltr', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', maxlength: 32 }),
    };
    const preview = h('div', { class: 'url-preview' });
    const warn = h('div', { class: 'notice', hidden: true }, icon('link'), h('span', { text: t('admin.link_warn') }));
    const save = h('button', { class: 'btn btn-primary btn-block', type: 'button', text: t('save') });
    const sync = () => {
      f.subdomain.value = f.subdomain.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
      preview.textContent = `${location.protocol}//${f.subdomain.value || '…'}.${baseHost()}`;
      warn.hidden = f.subdomain.value === salon.subdomain;
      save.disabled = f.name_ar.value === salon.name_ar && f.name_en.value === salon.name_en && f.subdomain.value === salon.subdomain;
    };
    Object.values(f).forEach((el) => el.addEventListener('input', sync));
    const form = h(
      'form',
      { class: 'sd-block', novalidate: true, onsubmit: (e) => { e.preventDefault(); if (!save.disabled) save.click(); } },
      h('div', { class: 'eyebrow', text: t('admin.edit') }),
      field(t('admin.name_ar'), f.name_ar),
      field(t('admin.name_en'), f.name_en, { optional: true }),
      h('div', { style: { marginTop: '12px' } }, field(t('admin.subdomain'), f.subdomain, { hint: t('admin.subdomain_hint') }), preview),
      warn,
      h('div', { style: { marginTop: '14px' } }, save),
      salon.old_links.length ? h('div', { class: 'old-links' }, h('div', { class: 'small faint', text: t('admin.old_links') }), salon.old_links.map((u) => h('div', { class: 'small muted ltr', text: bare(u) }))) : null,
    );
    save.addEventListener('click', () => busy(save, async () => {
      const changes = {};
      for (const k of ['name_ar', 'name_en', 'subdomain']) if (f[k].value !== salon[k]) changes[k] = f[k].value;
      try {
        const res = await api('PATCH', `/api/admin/salons/${salon.id}`, changes);
        toast(t('admin.saved'));
        update(res.salon);
      } catch (err) {
        markInvalid(form, err);
        throw err;
      }
    }));
    sync();

    clear(body, ...stagger([hero, links, live.el, statsBlock, setup, ownerBlock, form].filter(Boolean)));
  }
  render();
}

// ---------------------------------------------------------------- page

export function adminView(app) {
  const view = { filter: 'all', query: '', layout: savedLayout() };
  const skeleton = () => [
    h('div', { class: 'skel', style: { height: '300px', borderRadius: '22px' } }),
    h('div', { class: 'skel', style: { height: '120px', marginTop: '12px', borderRadius: '22px' } }),
  ];
  const body = h('div', null, ...skeleton());
  let loaded = false;

  async function load() {
    try {
      const data = await api('GET', '/api/admin/salons');
      loaded = true;
      clear(
        body,
        stagger([trendCard(data.series)]),
        kpis(data.totals),
        data.salons.length
          ? salonsSection(data.salons, view, (id) => openSalon(id, load))
          : h('div', { class: 'card empty admin-empty' }, h('div', { class: 'tile' }, icon('store')), h('p', { text: t('admin.empty') })),
      );
    } catch (err) {
      // A refresh after an edit keeps the dashboard; a first load that fails says so, with a way to try again.
      if (loaded) toastError(err);
      else {
        clear(body, h(
          'div',
          { class: 'card empty load-fail' },
          h('div', { class: 'tile' }, icon('alert')),
          h('p', { text: errorText(err) }),
          h('button', { class: 'btn btn-primary', type: 'button', text: t('retry'), onclick: () => { clear(body, ...skeleton()); load(); } }),
        ));
      }
    }
    appReady();
  }
  load();

  const header = h(
    'header',
    { class: 's-header' },
    h('div', { class: 'identity' }, h('div', { class: 'app-icon studio-mark', style: { '--s': '38px' } }, icon('sparkles')), h('div', { class: 'grow' }, h('div', { class: 'name', text: pick(app.ctx.tenant, 'name') }), h('div', { class: 'sub', text: t('login.platform') }))),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('admin.platform'), title: t('admin.platform'), onclick: () => openPlatform(app) }, icon('gear')),
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('app.lang'), title: t('app.lang'), onclick: () => app.toggleLang() }, icon('globe')),
  );
  // The bar turns to glass once the page moves under it.
  const onScroll = () => header.classList.toggle('scrolled', scrollY > 6);
  addEventListener('scroll', onScroll, { passive: true });
  app.onUnmount(() => removeEventListener('scroll', onScroll));

  return h(
    'div',
    { class: 'studio admin' },
    h(
      'div',
      { class: 's-main' },
      header,
      h(
        'main',
        { class: 's-page' },
        h(
          'div',
          { class: 's-head' },
          h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('admin.dash_title') }), h('p', { class: 's-sub', text: t('admin.dash_sub') })),
          // On a phone this floats at the bottom, in reach while the list scrolls.
          h('button', { class: 'btn btn-primary btn-sm sheen new-salon', type: 'button', onclick: () => openCreate(load) }, icon('plus'), t('admin.new')),
        ),
        body,
      ),
    ),
  );
}
