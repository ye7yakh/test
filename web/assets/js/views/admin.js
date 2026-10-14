// Platform owner: every salon on this brand at a glance, and the controls to run
// them: create and hand over, rename or move to a new link, suspend, reset an
// owner's password. Leads with the one number that says the platform is alive:
// bookings coming in.
import { api } from '../api.js';
import { areaChart } from '../chart.js';
import { avatar, busy, clear, confetti, confirmDelete, countUp, field, h, icon, input, markInvalid, scissorsMark, sheet, stagger, switchRow, toast, toastError } from '../dom.js';
import { getLang, pick, t, westernDigits } from '../i18n.js';
import { fmtDate } from '../slots.js';
import { waNumber } from './booking.js';

const LOCALE = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-u-nu-latn');
const fmtNumber = (n) => new Intl.NumberFormat(LOCALE()).format(n);
const SETUP = ['brand', 'services', 'team', 'photos'];
const FILTERS = ['all', 'active', 'setup', 'suspended'];
const baseHost = () => location.host.replace(/^(admin|www)\./, '');
const bare = (url) => url.replace(/^https?:\/\//, '');
// Keeps "+18%" in one piece inside Arabic text.
const isolate = (s) => `⁦${s}⁩`;

const statusOf = (s) => (!s.active ? 'suspended' : s.ready ? 'ready' : 'setup');
const setupDone = (s) => SETUP.filter((k) => s.setup[k]).length;

/** "3 hours ago", "yesterday". Last-seen is written hourly, so nothing finer. */
function relative(iso) {
  if (!iso) return null;
  const seconds = (Date.parse(iso) - Date.now()) / 1000;
  const rtf = new Intl.RelativeTimeFormat(LOCALE(), { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 86400) return rtf.format(Math.round(seconds / 3600), 'hour');
  if (abs < 86400 * 45) return rtf.format(Math.round(seconds / 86400), 'day');
  return rtf.format(Math.round(seconds / (86400 * 30)), 'month');
}

async function copy(text) {
  await navigator.clipboard?.writeText(text).catch(() => {});
  toast(t('copied'));
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
  const last7 = sum(series.slice(-7));
  const prev7 = sum(series.slice(-14, -7));
  let dir = 'flat';
  let delta = t('admin.same_week');
  if (last7 !== prev7) {
    dir = last7 > prev7 ? 'up' : 'down';
    const value = prev7 === 0 ? `+${fmtNumber(last7)}` : `${dir === 'up' ? '+' : '−'}${Math.abs(Math.round(((last7 - prev7) / prev7) * 100))}%`;
    delta = t('admin.vs_week', { delta: isolate(value) });
  }
  const peak = series.reduce((m, p) => (p.n > m.n ? p : m), series[0]);
  const chart = areaChart({
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
  return h(
    'section',
    { class: 'card glow trend-card' },
    h(
      'div',
      { class: 'trend-head' },
      h('div', null, h('div', { class: 'eyebrow', text: t('admin.bookings_30') }), countUp(h('div', { class: 'hero-figure' }), total, { format: fmtNumber, duration: 1200 })),
      h('span', { class: `delta ${dir}` }, icon(dir === 'flat' ? 'minus' : 'trend', dir === 'down' ? 'flip-v' : ''), h('span', { text: delta })),
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

function salonCard(s, open) {
  const owner = s.owners[0];
  const status = statusOf(s);
  const seen = relative(owner?.last_seen_at);
  return h(
    'button',
    { class: `salon-card ${status}`, type: 'button', onclick: () => open(s.id) },
    h(
      'div',
      { class: 'sc-top' },
      h('div', { class: 'sc-avatar' }, salonIcon(s), h('span', { class: 'live-dot', 'aria-hidden': 'true' })),
      h('div', { class: 'grow' }, h('div', { class: 'name truncate', text: pick(s, 'name') }), h('div', { class: 'link truncate', text: bare(s.url) })),
      h('span', {
        class: `pill ${status === 'suspended' ? 'off' : status === 'ready' ? 'ok' : 'warn'}`,
        text: status === 'suspended' ? t('admin.f_suspended') : status === 'ready' ? t('admin.ready') : t('admin.setup_n', { n: setupDone(s) }),
      }),
    ),
    h('div', { class: 'sc-setup', 'aria-hidden': 'true' }, SETUP.map((k) => h('i', { class: s.setup[k] ? 'on' : '' }))),
    h('div', { class: 'sc-meta' }, h('span', null, icon('calendar'), t('admin.b30', { n: s.stats.bookings_30d })), h('span', null, icon('clock'), t('admin.upcoming_n', { n: s.stats.upcoming }))),
    owner
      ? h(
          'div',
          { class: 'sc-owner' },
          icon('user'),
          h('span', { class: 'truncate', text: owner.name || owner.phone }),
          h('span', { class: 'faint', text: '·' }),
          h('span', { class: 'truncate', text: seen ? t('admin.seen', { when: seen }) : t('admin.never') }),
          owner.must_change_password ? h('span', { class: 'pill warn tiny', text: t('admin.temp_pw') }) : null,
        )
      : null,
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
  const chips = h('div', { class: 'scroller filter-row', role: 'tablist' });
  const grid = h('div', { class: 'salon-grid' });

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
      h('span', { class: 'chip-count num', text: String(counts[f]) }),
    )));
  }
  function renderGrid() {
    const list = salons.filter((s) => keep[view.filter](s) && matches(s));
    clear(grid, list.length ? stagger(list.map((s) => salonCard(s, open))) : h('p', { class: 'empty small', text: t('admin.no_match') }));
  }
  search.addEventListener('input', () => {
    view.query = search.value.trim();
    renderGrid();
  });
  renderChips();
  renderGrid();
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', null, t('admin.title'), h('span', { class: 'count num', style: { marginInlineStart: '8px' }, text: String(salons.length) }))),
    h('label', { class: 'search-box' }, icon('search'), search),
    chips,
    grid,
  );
}

// ---------------------------------------------------------------- sheets

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
  const panel = sheet({ title, body: h('div', null, intro ? h('p', { class: 'muted', style: { marginBottom: '14px' }, text: intro }) : null, list), actions: [done, wa] });
  done.addEventListener('click', () => panel.close());
  if (celebrate) setTimeout(() => confetti(['#a855f7', '#6366f1', '#3b82f6', '#ffffff', '#f5d06f']), 250);
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
  const form = h(
    'form',
    { novalidate: true },
    field(t('admin.name_ar'), f.name_ar),
    field(t('admin.name_en'), f.name_en, { optional: true }),
    h('div', { style: { marginTop: '12px' } }, field(t('admin.subdomain'), f.subdomain, { hint: t('admin.subdomain_hint') }), url),
    h('div', { class: 'f-row', style: { marginTop: '18px' } }, field(t('admin.owner_phone'), f.owner_phone), field(t('admin.owner_name'), f.owner_name, { optional: true })),
    field(t('admin.owner_password'), f.owner_password, { hint: t('admin.owner_password_hint') }),
  );
  form.addEventListener('submit', (e) => e.preventDefault());
  const create = h('button', { class: 'btn btn-primary', type: 'button', text: t('admin.create') });
  const panel = sheet({ title: t('admin.new'), body: form, actions: [create] });
  create.addEventListener('click', () => busy(create, async () => {
    try {
      const res = await api('POST', '/api/admin/salons', Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])));
      panel.close();
      onCreated();
      const link = `${res.url}/#/login`;
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
      h('a', { class: 'btn btn-secondary btn-sm', href: `${salon.url}/#/login`, target: '_blank', rel: 'noopener' }, icon('sliders'), t('admin.open_studio')),
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

    const stat = (value, label) => h('div', { class: 'sd-stat' }, h('b', { text: value }), h('span', { text: label }));
    const statsGrid = h(
      'div',
      { class: 'sd-stats' },
      stat(fmtNumber(stats.bookings_30d), t('admin.s_bookings')),
      stat(fmtNumber(stats.upcoming), t('admin.s_upcoming')),
      stat(fmtNumber(stats.customers), t('admin.s_customers')),
      stat(fmtNumber(stats.services), t('admin.s_services')),
      stat(fmtNumber(stats.team), t('admin.s_team')),
      stat(relative(owner?.last_seen_at) ?? '—', t('admin.s_seen')),
    );

    const setup = h(
      'div',
      { class: 'sd-block' },
      h('div', { class: 'eyebrow', text: `${t('admin.setup')} · ${setupDone(salon)}/4` }),
      h('div', { class: 'sd-setup' }, SETUP.map((k) => h('div', { class: `sd-step ${salon.setup[k] ? 'done' : ''}` }, icon(salon.setup[k] ? 'checkCircle' : 'clock'), h('span', { text: t(`step.${k}`) })))),
    );

    let ownerBlock = null;
    if (owner) {
      const reset = h('button', { class: 'btn btn-secondary btn-block', type: 'button' }, icon('key'), t('admin.reset'));
      reset.addEventListener('click', async () => {
        if (!(await confirmDelete({ title: t('admin.reset'), message: t('admin.reset_confirm'), yesText: t('admin.reset_yes') }))) return;
        busy(reset, async () => {
          const res = await api('POST', `/api/admin/salons/${salon.id}/reset-password`);
          const link = `${salon.url}/#/login`;
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
      { class: 'sd-block', novalidate: true, onsubmit: (e) => e.preventDefault() },
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

    clear(body, ...stagger([hero, links, live.el, statsGrid, setup, ownerBlock, form].filter(Boolean)));
  }
  render();
}

// ---------------------------------------------------------------- page

export function adminView(app) {
  const view = { filter: 'all', query: '' };
  const body = h(
    'div',
    null,
    h('div', { class: 'skel', style: { height: '260px', borderRadius: '22px' } }),
    h('div', { class: 'skel', style: { height: '120px', marginTop: '12px', borderRadius: '22px' } }),
  );

  async function load() {
    try {
      const data = await api('GET', '/api/admin/salons');
      clear(
        body,
        stagger([trendCard(data.series)]),
        kpis(data.totals),
        data.salons.length
          ? salonsSection(data.salons, view, (id) => openSalon(id, load))
          : h('div', { class: 'card empty', style: { marginTop: '24px' } }, h('div', { class: 'tile' }, icon('store')), h('p', { text: t('admin.empty') })),
      );
    } catch (err) {
      toastError(err);
    }
  }
  load();

  return h(
    'div',
    { class: 'studio admin' },
    h(
      'div',
      { class: 's-main' },
      h(
        'header',
        { class: 's-header' },
        h('div', { class: 'identity' }, h('div', { class: 'app-icon studio-mark', style: { '--s': '38px' } }, icon('sparkles')), h('div', { class: 'grow' }, h('div', { class: 'name', text: app.ctx.tenant.name }), h('div', { class: 'sub', text: t('login.platform') }))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('app.lang'), title: t('app.lang'), onclick: () => app.toggleLang() }, icon('globe')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('logout'), title: t('logout'), onclick: () => app.logout() }, icon('logout', 'flip-rtl')),
      ),
      h(
        'main',
        { class: 's-page', style: { paddingBottom: '48px' } },
        h(
          'div',
          { class: 's-head' },
          h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('admin.dash_title') }), h('p', { class: 's-sub', text: t('admin.dash_sub') })),
          h('button', { class: 'btn btn-primary btn-sm sheen', type: 'button', onclick: () => openCreate(load) }, icon('plus'), t('admin.new')),
        ),
        body,
      ),
    ),
  );
}
