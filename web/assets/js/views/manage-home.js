// Home: where the owner lands. How ready the app is, what to do next, a glance at
// the salon, and the link to share once it is ready.
import { api } from '../api.js';
import { avatar, clear, confetti, countUp, h, icon, stagger, toast } from '../dom.js';
import { fmtTime, pick, t } from '../i18n.js';
import { miniApp, phone } from '../preview.js';
import { nowIn, openStatus, toMin } from '../time.js';
import { openPreview, setupSteps } from './manage.js';
import { openSettings } from './manage-settings.js';

function greeting(store, app) {
  const hour = Math.floor(nowIn(store.salon.timezone).minutes / 60);
  const name = app.ctx.user?.name || pick(store.salon, 'name');
  return h(
    'div',
    { class: 'greeting' },
    h('div', { class: 'eyebrow', text: `${hour >= 4 && hour < 12 ? t('home.morning') : t('home.evening')} 👋` }),
    h('h1', { text: name }),
  );
}

/** Shares the salon's link (the system sheet on phones), or copies it. */
export async function shareLink(store) {
  const url = location.origin;
  const text = t('home.share_text', { name: pick(store.salon, 'name') });
  if (navigator.share) {
    try {
      await navigator.share({ title: pick(store.salon, 'name'), text, url });
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(url).catch(() => {});
  toast(t('copied'));
}

function heroCard(store, app, steps) {
  const done = steps.filter((s) => s.done).length;
  const ready = done === steps.length;
  const next = steps.find((s) => !s.done);
  const content = ready
    ? h(
        'div',
        { class: 'content' },
        h('div', { class: 'tile', style: { width: '52px', height: '52px', borderRadius: '16px', marginBottom: '14px' } }, icon('sparkles')),
        h('h2', { text: t('home.ready') }),
        h('p', { text: t('home.ready_sub') }),
        h(
          'div',
          { class: 'actions' },
          h('button', { class: 'btn btn-primary btn-sm sheen', type: 'button', onclick: () => shareLink(store) }, icon('share'), t('share')),
          h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => openPreview(store) }, icon('eye'), t('nav.preview')),
        ),
      )
    : h(
        'div',
        { class: 'content' },
        // Four steps, four bars: what is done and what is left, at a glance.
        h(
          'div',
          { class: 'setup-meter', role: 'progressbar', 'aria-label': t('home.progress'), 'aria-valuemin': '0', 'aria-valuemax': String(steps.length), 'aria-valuenow': String(done), 'aria-valuetext': `${done}/${steps.length}` },
          h('div', { class: 'bars', 'aria-hidden': 'true' }, steps.map((s, i) => h('i', { class: i < done ? 'on' : i === done ? 'next' : '', style: { '--i': String(i) } }))),
          h('b', { class: 'num', 'aria-hidden': 'true', text: `${done}/${steps.length}` }),
        ),
        h('h2', { text: t('home.progress') }),
        h('p', { text: t('home.left', { n: steps.length - done }) }),
        h(
          'div',
          { class: 'actions' },
          h('a', { class: 'btn btn-primary btn-sm sheen', href: `/admin/${next.page}`, 'aria-label': t('home.next_step', { step: t(`step.${next.id}`) }) }, icon(next.icon), h('span', { class: 'truncate', text: t(`step.${next.id}`) }), icon('arrow', 'flip-ltr')),
        ),
      );
  return h(
    'section',
    { class: 'card glow hero-card' },
    content,
    h('div', { class: 'mini-phone' }, phone(miniApp(store.previewState()), { scale: 0.44 })),
  );
}

/** The setup steps, numbered; the next one stands out, done ones step back. */
function stepsCard(steps) {
  const next = steps.find((s) => !s.done);
  return h(
    'section',
    { class: 'section steps-section' },
    h('div', { class: 'section-head' }, h('h2', { text: t('home.steps') }), h('span', { class: 'count num', text: `${steps.filter((s) => s.done).length}/${steps.length}` })),
    h('ol', { class: 'card flush steps' }, stagger(steps.map((s, i) => h(
      'li',
      null,
      h(
        'a',
        { class: `step ${s.done ? 'done' : ''} ${s === next ? 'next' : ''}`, href: `/admin/${s.page}`, 'aria-current': s === next ? 'step' : null },
        h('div', { class: 'tile' }, icon(s.done ? 'check' : s.icon), s.done ? null : h('span', { class: 'step-n num', 'aria-hidden': 'true', text: String(i + 1) })),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'title' }, h('span', { text: t(`step.${s.id}`) }), s === next ? h('span', { class: 'next-pill', text: t('home.next_pill') }) : null),
          h('div', { class: 'sub', text: t(`step.${s.id}_sub`) }),
        ),
        s.done ? null : h('span', { class: 'state' }, icon('chevron', 'flip-ltr')),
      ),
    )), 1)),
  );
}

function glance(store, app) {
  const services = store.services.filter((s) => s.active);
  const team = store.staff.filter((m) => m.active);
  const status = openStatus(store.hours, nowIn(store.salon.timezone));
  const go = (page) => () => app.go(`/admin/${page}`);
  return h(
    'section',
    { class: 'section glance-section' },
    h('div', { class: 'section-head' }, h('h2', { text: t('home.glance') })),
    h(
      'div',
      { class: 'glance' },
      stagger([
        h(
          'div',
          { class: 'card', role: 'link', tabindex: '0', onclick: go('services') },
          h('div', { class: 'tile' }, icon('scissors')),
          h('div', null, countUp(h('div', { class: 'big num' }), services.length), h('div', { class: 'label', text: t('home.services', { n: services.length }) })),
        ),
        h(
          'div',
          { class: 'card', role: 'link', tabindex: '0', onclick: go('team') },
          h('div', { class: 'row between' }, h('div', { class: 'tile' }, icon('users')), h('div', { class: 'avatar-stack' }, team.slice(0, 3).map((m) => avatar(m.photo_url, pick(m, 'name'))))),
          h('div', null, countUp(h('div', { class: 'big num' }), team.length), h('div', { class: 'label', text: t('home.members', { n: team.length }) })),
        ),
        h(
          'div',
          { class: 'card wide', role: 'link', tabindex: '0', onclick: go('hours') },
          h('div', { class: 'tile' }, icon('clock')),
          h('div', { class: 'grow' }, h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: `dot ${status.open ? 'ok' : ''}` }), h('b', { text: status.open ? t('home.open_now') : t('home.closed_now') })), status.open ? h('div', { class: 'label num', text: t('home.until', { time: fmtTime(status.until) }) }) : null),
          icon('chevron', 'flip-ltr faint'),
        ),
      ], 5),
    ),
  );
}

/** Today's visits, the next one, and deposits waiting for a check. Filled in once loaded. */
function todayCard(store) {
  const card = h('a', { class: 'card today-card', href: '/admin/bookings' }, h('div', { class: 'skel', style: { height: '52px' } }));
  const section = h('section', { class: 'section today-section' }, h('div', { class: 'section-head' }, h('h2', { text: t('home.today') }), h('a', { class: 'link-btn', href: '/admin/bookings', text: t('home.open_schedule') })), card);
  Promise.all([api('GET', '/api/manage/bookings'), api('GET', '/api/manage/bookings/overview?days=1')])
    .then(([day, overview]) => {
      const live = day.bookings.filter((b) => ['pending_payment', 'payment_sent', 'confirmed', 'completed'].includes(b.status));
      const now = nowIn(store.salon.timezone).minutes;
      const next = live.find((b) => b.status !== 'completed' && toMin(b.start) >= now);
      const waiting = overview.attention.filter((b) => b.status === 'payment_sent').length;
      const big = countUp(h('span', { class: 'big num' }), live.length);
      clear(
        card,
        h(
          'div',
          { class: 'head' },
          h('div', { class: 'tile' }, icon('calendar')),
          h('div', { class: 'grow' }, live.length ? big : null, h('div', { class: 'muted small', text: live.length ? t('sched.count', { n: live.length }) : t('home.today_empty') })),
          icon('chevron', 'flip-ltr faint'),
        ),
        next
          ? h('div', { class: 'next' }, avatar(next.staff.photo_url, pick(next.staff, 'name')), h('span', { class: 'grow truncate', text: t('home.next', { name: next.customer.name, time: fmtTime(next.start) }) }), h('span', { class: 'emoji', text: next.service.icon || '✂️' }))
          : live.length ? h('div', { class: 'next', text: t('home.today_done') }) : null,
        waiting ? h('div', { class: 'today-alert' }, h('span', { class: 'dot' }), h('span', { text: t('home.waiting', { n: waiting }) })) : null,
      );
    })
    .catch(() => section.remove());
  return section;
}

/** The owner's dashboard as an app on their phone: one tap on Android, a tip on iPhone. */
function installCard(store, app) {
  if (!app.ownerApp || app.installed()) return null;
  const key = `install-later:${store.salon.id}`;
  try {
    if (localStorage.getItem(key) === '1') return null;
  } catch {}
  const actions = h('div', { class: 'row actions' });
  const sub = h('div', { class: 'card-sub' });
  const card = h(
    'section',
    { class: 'card install-card rise' },
    h('img', { class: 'app-icon', src: `/icons/owner-icon-192.png?v=${store.salon.icon_v}`, alt: '' }),
    h('div', { class: 'grow' }, h('div', { class: 'card-title', text: t('install.owner') }), sub),
    actions,
  );
  const later = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('later') });
  later.addEventListener('click', () => {
    try {
      localStorage.setItem(key, '1');
    } catch {}
    card.remove();
  });
  const render = () => {
    sub.textContent = app.canInstall() ? t('install.owner_sub') : t('install.ios');
    const install = app.canInstall() ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: t('install.button') }) : null;
    install?.addEventListener('click', async () => {
      if (await app.install()) card.remove();
      else render();
    });
    clear(actions, install, later);
    card.hidden = !app.canInstall() && !app.isIOS;
  };
  render();
  addEventListener('install-ready', render);
  app.onUnmount(() => removeEventListener('install-ready', render));
  return card;
}

function linkCard(store) {
  const copy = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('copy') }, icon('copy'));
  copy.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(location.origin).catch(() => {});
    toast(t('copied'));
  });
  const share = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('share'), onclick: () => shareLink(store) }, icon('share'));
  return h(
    'section',
    { class: 'section link-section' },
    h('div', { class: 'section-head' }, h('h2', { text: t('home.link') })),
    h(
      'div',
      { class: 'card stack' },
      h('div', { class: 'row' }, h('div', { class: 'tile' }, icon('link')), h('div', { class: 'grow card-sub', text: t('home.link_sub') })),
      h('div', { class: 'link-box' }, h('span', { class: 'url', text: location.host }), copy, share),
    ),
  );
}

export function homePage(store, app) {
  const steps = setupSteps(store);
  const ready = steps.every((s) => s.done);
  if (ready) {
    // Celebrate the first time the app is complete on this device.
    const key = `celebrated:${store.salon.id}`;
    let seen = true;
    try {
      seen = localStorage.getItem(key) === '1';
      if (!seen) localStorage.setItem(key, '1');
    } catch {}
    if (!seen) setTimeout(() => confetti([getComputedStyle(document.documentElement).getPropertyValue('--brand').trim() || '#c8a15a', '#ffffff', '#f5d06f', '#7dd3fc']), 400);
  }
  // The admin set this password; the owner should pick their own.
  const tempPassword = app.ctx.user?.must_change_password
    ? h(
        'section',
        { class: 'card temp-pw rise' },
        h('div', { class: 'tile' }, icon('lock')),
        h('div', { class: 'grow' }, h('div', { class: 'card-title', text: t('home.temp_pw') }), h('div', { class: 'card-sub', text: t('home.temp_pw_sub') })),
        h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: t('home.temp_pw_btn'), onclick: () => openSettings(store, app, { focusPassword: true }) }),
      )
    : null;
  const today = store.services.some((s) => s.active) ? todayCard(store) : null;
  // Setting up: what is next and nothing else in the way. Ready: today first and the
  // link to share right after it (they sit side by side on a wide screen, so the DOM,
  // focus and reading order match what is seen), then the salon at a glance.
  const parts = ready
    ? [today, linkCard(store), tempPassword, installCard(store, app), glance(store, app)]
    : [tempPassword, stepsCard(steps), today, installCard(store, app)];
  return h('div', { class: `home-bento ${ready ? 'is-ready' : 'is-setup'}` }, stagger([greeting(store, app), heroCard(store, app, steps)]), parts);
}
