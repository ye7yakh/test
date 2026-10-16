// The owner's studio: header, navigation (floating tab bar on phones, sidebar on
// desktop), the current page, and a live preview of the salon's app. All pages share
// one store, so the setup progress, badges and preview follow every save. A barber
// signed in with his own login gets the same studio with his schedule only.
import { api } from '../api.js';
import { appIcon, appReady, clear, h, icon, sheet } from '../dom.js';
import { errorText, pick, t } from '../i18n.js';
import { homeScreen, miniApp, phone } from '../preview.js';
import { applyColors } from '../theme.js';
import { homePage } from './manage-home.js';
import { brandPage } from './manage-brand.js';
import { servicesPage } from './manage-services.js';
import { teamPage } from './manage-team.js';
import { hoursPage } from './manage-hours.js';
import { openSettings } from './manage-settings.js';
import { bookingsPage } from './manage-bookings.js';

export const PAGES = [
  { id: 'home', icon: 'home', render: homePage },
  { id: 'bookings', icon: 'calendar', render: bookingsPage },
  { id: 'services', icon: 'scissors', render: servicesPage },
  { id: 'team', icon: 'users', render: teamPage },
  { id: 'hours', icon: 'clock', render: hoursPage },
  { id: 'brand', icon: 'palette', render: brandPage },
];

/** The pages someone may open: all of them for the owner, his schedule for a barber. */
export const pagesFor = (role) => (role === 'staff' ? PAGES.filter((p) => p.id === 'bookings') : PAGES);

let cache = null;

// ---------------------------------------------------------------- live updates
// One stream for the whole studio; the current page subscribes while it is shown.
// The browser retries a dropped connection by itself, but gives up for good on an
// error response (a proxy's 502 during a restart, a lapsed session): then we retry
// with backoff. After any gap the listeners get { resync: true } and reload, so
// bookings that arrived meanwhile are not missed.
let events = null;
let retryTimer = null;
let retryDelay = 2000;
let stale = false;
const listeners = new Set();
const emit = (data) => {
  for (const fn of listeners) fn(data);
};
function connectEvents() {
  if (events || retryTimer || typeof EventSource === 'undefined') return;
  const es = (events = new EventSource('/api/manage/events'));
  es.addEventListener('booking', (e) => {
    try {
      emit(JSON.parse(e.data));
    } catch {}
  });
  es.addEventListener('open', () => {
    retryDelay = 2000;
    if (stale) {
      stale = false;
      emit({ resync: true });
    }
  });
  es.addEventListener('error', () => {
    stale = true;
    if (es.readyState !== EventSource.CLOSED) return; // a drop: the browser reconnects
    es.close();
    if (events === es) events = null;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connectEvents();
    }, retryDelay);
    retryDelay = Math.min(retryDelay * 2, 60_000);
  });
}

export const clearManageCache = () => {
  cache = null;
  clearTimeout(retryTimer);
  retryTimer = null;
  stale = false;
  retryDelay = 2000;
  events?.close();
  events = null;
};

/** How many deposits wait for the owner, for the Bookings badge. */
let attention = 0;
async function loadAttention(staffMode = false) {
  if (staffMode) {
    attention = 0; // deposits are the owner's (and the owner may have used this tab before)
    return;
  }
  try {
    attention = (await api('GET', '/api/manage/bookings/overview?days=1')).attention.filter((b) => b.status === 'payment_sent').length;
  } catch {
    attention = 0;
  }
}

async function load() {
  const [salon, services, staff] = await Promise.all([
    api('GET', '/api/manage/salon'),
    api('GET', '/api/manage/services'),
    api('GET', '/api/manage/staff'),
  ]);
  return { salon: salon.salon, hours: salon.hours, options: salon.options, services: services.services, staff: staff.staff };
}

/** The four things that make the app ready, in the order owners do them. */
export function setupSteps(store) {
  const active = store.staff.filter((s) => s.active);
  return [
    { id: 'brand', page: 'brand', icon: 'palette', done: !!store.salon.logo_url },
    { id: 'services', page: 'services', icon: 'scissors', done: store.services.some((s) => s.active) },
    { id: 'team', page: 'team', icon: 'users', done: active.length > 0 },
    { id: 'photos', page: 'team', icon: 'camera', done: active.length > 0 && active.every((s) => s.photo_url) },
  ];
}

/** Segmented "App / Icon" switch with a phone underneath. */
function previewPanel(store, scaleFor) {
  let mode = 'app';
  const holder = h('div', { class: 'pv-phone' });
  const tabs = h(
    'div',
    { class: 'segmented preview-tabs', role: 'radiogroup' },
    ['app', 'icon'].map((m) => {
      const radio = h('input', { type: 'radio', name: `pv-${Math.random().toString(36).slice(2)}`, value: m, checked: m === mode });
      radio.addEventListener('change', () => {
        mode = m;
        render();
      });
      return h('label', null, radio, h('span', { text: t(`preview.${m}`) }));
    }),
  );
  function render() {
    const state = store.previewState();
    clear(holder, phone(mode === 'app' ? miniApp(state) : homeScreen(state), { scale: scaleFor() }));
  }
  render();
  return { el: h('div', null, tabs, holder), render };
}

export function openPreview(store) {
  const panel = previewPanel(store, () => Math.max(0.5, Math.min(0.82, (innerHeight - 310) / 630)));
  sheet({
    title: t('preview.title'),
    body: h('div', { class: 'center' }, panel.el),
    actions: [h('a', { class: 'btn btn-primary', href: '/', target: '_blank', rel: 'noopener' }, icon('external'), t('preview.open'))],
  });
}

let scrollBound = false;
function bindHeaderScroll() {
  if (scrollBound) return;
  scrollBound = true;
  addEventListener('scroll', () => document.querySelector('.s-header')?.classList.toggle('scrolled', scrollY > 6), { passive: true });
}

function skeleton() {
  return h(
    'div',
    { class: 'stack' },
    h('div', { class: 'skel', style: { height: '18px', width: '40%', marginTop: '16px' } }),
    h('div', { class: 'skel', style: { height: '34px', width: '65%' } }),
    h('div', { class: 'skel', style: { height: '200px', marginTop: '22px', borderRadius: '22px' } }),
    h('div', { class: 'skel', style: { height: '64px', borderRadius: '22px' } }),
    h('div', { class: 'skel', style: { height: '64px', borderRadius: '22px' } }),
  );
}

export function manageView(app, pageId) {
  const staffMode = app.ctx.user?.role === 'staff';
  const pages = pagesFor(app.ctx.user?.role);
  const page = pages.find((p) => p.id === pageId) ?? pages[0];
  bindHeaderScroll();

  const store = {
    ...(cache ?? {}),
    draftSalon: null,
    /** Pages call this after saving; progress, badges, identity and preview follow. */
    set(partial) {
      Object.assign(store, partial);
      cache = { ...cache, ...partial };
      refresh();
    },
    /** Unsaved brand edits, shown live in the preview. */
    preview(draft) {
      store.draftSalon = draft;
      refreshPreview();
    },
    previewState() {
      return { salon: { ...store.salon, ...(store.draftSalon ?? {}) }, services: store.services, staff: store.staff, hours: store.hours };
    },
    /** Called with { id, status } whenever a booking changes, while this view is shown. */
    onBooking(fn) {
      listeners.add(fn);
      app.onUnmount(() => listeners.delete(fn));
    },
    refreshBadges: () => loadAttention(staffMode).then(refresh),
  };
  connectEvents();
  store.onBooking(() => store.refreshBadges());

  const identities = [];
  const identity = () => {
    const el = h('div', { class: 'identity' });
    identities.push(el);
    return el;
  };
  const navLinks = [];
  const navLink = (p, cls) => {
    const a = h(
      'a',
      { class: `${cls} ${p.id === page.id ? 'active' : ''}`, href: p.id === 'home' ? '/admin' : `/admin/${p.id}`, 'aria-current': p.id === page.id ? 'page' : null, 'data-page': p.id },
      p.id === page.id ? h('span', { class: 'nav-pill', 'aria-hidden': 'true' }) : null,
      icon(p.icon),
      h('span', { text: t(staffMode && p.id === 'bookings' ? 'nav.my_schedule' : `nav.${p.id}`) }),
    );
    navLinks.push(a);
    return a;
  };

  const content = h('div', null, skeleton());
  const previewHolder = h('div');
  let preview = null;

  const settingsBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('nav.settings'), title: t('nav.settings'), onclick: () => store.salon && openSettings(store, app) }, icon('gear'));
  const previewBtn = staffMode ? null : h('button', { class: 'icon-btn only-mobile', type: 'button', 'aria-label': t('nav.preview'), title: t('nav.preview'), onclick: () => store.salon && openPreview(store) }, icon('eye'));

  const view = h(
    'div',
    { class: `studio${staffMode ? ' staff-mode' : ''}`, 'data-page': page.id },
    h(
      'aside',
      { class: 's-side' },
      identity(),
      pages.map((p) => navLink(p, 'nav')),
      h('div', { class: 'spacer' }),
      h('a', { class: 'nav', href: '#', onclick: (e) => { e.preventDefault(); if (store.salon) openSettings(store, app); } }, icon('gear'), h('span', { text: t('nav.settings') })),
      h('a', { class: 'nav', href: '/', target: '_blank', rel: 'noopener' }, icon('external'), h('span', { text: t('preview.open') })),
    ),
    h(
      'div',
      { class: 's-main' },
      h('header', { class: 's-header' }, identity(), previewBtn, settingsBtn),
      h('main', { class: 's-page' }, content),
    ),
    // A barber has one page and no salon to set up: no preview, no tab bar.
    staffMode ? null : h('aside', { class: 's-preview', 'aria-label': t('preview.live') }, h('div', { class: 'eyebrow', text: t('preview.live') }), previewHolder),
    staffMode ? null : h('nav', { class: 's-tabbar', 'aria-label': t('nav.sections') }, pages.map((p) => navLink(p, 's-tab'))),
  );

  function refreshIdentity() {
    const salon = { ...store.salon, ...(store.draftSalon ?? {}) };
    for (const el of identities) {
      // A barber sees whose studio it is: his name under the salon's.
      const me = staffMode ? store.staff?.find((m) => m.id === app.ctx.user.staff_id) : null;
      clear(el, appIcon(salon.logo_url), h('div', { class: 'grow' }, h('div', { class: 'name truncate', text: pick(salon, 'name') }), me ? h('div', { class: 'sub truncate', text: pick(me, 'name') }) : h('div', { class: 'sub ltr truncate', text: location.host })));
    }
  }

  function refreshPreview() {
    if (!store.salon) return;
    refreshIdentity();
    if (staffMode || !matchMedia('(min-width: 1080px)').matches) return;
    if (!preview) {
      preview = previewPanel(store, () => Math.min(1, (innerHeight - 150) / 630));
      clear(previewHolder, preview.el);
    } else preview.render();
  }

  function refresh() {
    app.ctx.salon = { ...app.ctx.salon, ...store.salon };
    // Setting the salon up is the owner's: a barber sees no reminders.
    const steps = staffMode ? [] : setupSteps(store);
    const needs = new Set(steps.filter((s) => !s.done).map((s) => s.page));
    for (const link of navLinks) {
      link.querySelector('.badge-dot, .badge-count')?.remove();
      if (link.dataset.page === 'bookings' && attention) link.append(h('span', { class: 'badge-count num', text: String(attention) }));
      else if (needs.has(link.dataset.page)) link.append(h('span', { class: 'badge-dot', 'aria-hidden': 'true' }));
    }
    refreshPreview();
  }

  // A quick tab change while the first load is in flight replaces this screen before
  // the data arrives: then nothing here may draw (or start a page's timers and listeners).
  let alive = true;
  app.onUnmount(() => {
    alive = false;
  });

  function show() {
    if (!alive) return;
    applyColors(store.salon.color_primary, store.salon.color_accent);
    refresh();
    clear(content, page.render(store, app));
    appReady();
  }

  const onResize = () => {
    preview = null;
    refreshPreview();
  };
  addEventListener('resize', onResize);
  app.onUnmount(() => removeEventListener('resize', onResize));

  // The first load: on failure, say why and offer to try again in place (an installed
  // app has no reload button). Later refreshes keep the screen and only toast.
  function start() {
    clear(content, skeleton());
    Promise.all([load(), loadAttention(staffMode)])
      .then(([data]) => {
        cache = data;
        Object.assign(store, data);
        show();
      })
      .catch((err) => {
        if (!alive) return;
        const retry = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: start }, icon('undo'), t('retry'));
        clear(content, h('div', { class: 'card empty load-error rise', role: 'alert' }, h('div', { class: 'tile' }, icon('alert')), h('p', { text: errorText(err) }), retry));
        appReady();
      });
  }
  // Back online after a failed first load: try again by itself.
  const onOnline = () => content.querySelector('.load-error') && start();
  addEventListener('online', onOnline);
  app.onUnmount(() => removeEventListener('online', onOnline));
  if (cache) queueMicrotask(show);
  else start();
  return view;
}
