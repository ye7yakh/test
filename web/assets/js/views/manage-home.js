// Home: where the owner lands. How ready the app is, what to do next, a glance at
// the salon, and the link to share once it is ready.
import { api } from '../api.js';
import { avatar, clear, confetti, countUp, h, icon, ring, stagger, toast } from '../dom.js';
import { fmtTime, pick, t } from '../i18n.js';
import { miniApp, phone } from '../preview.js';
import { nowIn, openStatus, toMin } from '../time.js';
import { openPreview, setupSteps } from './manage.js';

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

async function shareLink(store) {
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
        ring(done / steps.length, { size: 84 }),
        h('h2', { text: t('home.progress') }),
        h('p', { text: t('home.left', { n: steps.length - done }) }),
        h('div', { class: 'actions' }, h('a', { class: 'btn btn-primary btn-sm sheen', href: `#/manage/${next.page}` }, t('home.continue'), icon('arrow', 'flip-ltr'))),
      );
  return h(
    'section',
    { class: 'card glow hero-card' },
    content,
    h('div', { class: 'mini-phone' }, phone(miniApp(store.previewState()), { scale: 0.44 })),
  );
}

function stepsCard(steps) {
  return h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('h2', { text: t('home.steps') }), h('span', { class: 'count', text: `${steps.filter((s) => s.done).length}/${steps.length}` })),
    h('div', { class: 'card flush steps' }, stagger(steps.map((s) => h(
      'a',
      { class: `step ${s.done ? 'done' : ''}`, href: `#/manage/${s.page}` },
      h('div', { class: 'tile' }, icon(s.done ? 'check' : s.icon)),
      h('div', { class: 'grow' }, h('div', { class: 'title', text: t(`step.${s.id}`) }), h('div', { class: 'sub', text: t(`step.${s.id}_sub`) })),
      h('span', { class: 'state' }, icon(s.done ? 'checkCircle' : 'chevron', s.done ? '' : 'flip-ltr')),
    )), 1)),
  );
}

function glance(store) {
  const services = store.services.filter((s) => s.active);
  const team = store.staff.filter((m) => m.active);
  const status = openStatus(store.hours, nowIn(store.salon.timezone));
  const go = (page) => () => {
    location.hash = `#/manage/${page}`;
  };
  return h(
    'section',
    { class: 'section' },
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
  const card = h('a', { class: 'card today-card', href: '#/manage/bookings' }, h('div', { class: 'skel', style: { height: '52px' } }));
  const section = h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: t('home.today') }), h('a', { class: 'link-btn', href: '#/manage/bookings', text: t('home.open_schedule') })), card);
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

function linkCard(store) {
  const copy = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('copy') }, icon('copy'));
  copy.addEventListener('click', async () => {
    await navigator.clipboard?.writeText(location.origin).catch(() => {});
    toast(t('copied'));
  });
  const share = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('share'), onclick: () => shareLink(store) }, icon('share'));
  return h(
    'section',
    { class: 'section' },
    h(
      'div',
      { class: 'card stack' },
      h('div', { class: 'row' }, h('div', { class: 'tile' }, icon('link')), h('div', { class: 'grow' }, h('div', { class: 'card-title', text: t('home.link') }), h('div', { class: 'card-sub', text: t('home.link_sub') }))),
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
  return h(
    'div',
    null,
    stagger([greeting(store, app), heroCard(store, app, steps)]),
    store.services.some((s) => s.active) ? todayCard(store) : null,
    ready ? linkCard(store) : stepsCard(steps),
    glance(store),
    ready ? stepsCard(steps) : linkCard(store),
  );
}
