// Owner dashboard: a top bar, the setup progress, the current tab and a bottom tab bar.
// Data for all tabs is loaded once and kept in `store`, so switching tabs is instant
// and tabs can see each other's data (services need the team, and the other way round).
import { api } from '../api.js';
import { clear, h, icon, toastError } from '../dom.js';
import { pick, t } from '../i18n.js';
import { applyColors } from '../theme.js';
import { salonTab } from './manage-salon.js';
import { servicesTab } from './manage-services.js';
import { teamTab } from './manage-team.js';
import { hoursTab } from './manage-hours.js';

const TABS = [
  { id: 'salon', icon: 'store', render: salonTab },
  { id: 'services', icon: 'scissors', render: servicesTab },
  { id: 'team', icon: 'users', render: teamTab },
  { id: 'hours', icon: 'clock', render: hoursTab },
];

let cache = null;

async function load(salonId) {
  const [salon, services, staff] = await Promise.all([
    api('GET', '/api/manage/salon'),
    api('GET', '/api/manage/services'),
    api('GET', '/api/manage/staff'),
  ]);
  return { salonId, salon: salon.salon, hours: salon.hours, options: salon.options, services: services.services, staff: staff.staff };
}

function setupSteps(store) {
  const active = store.staff.filter((s) => s.active);
  return {
    salon: !!store.salon.logo_url,
    services: store.services.some((s) => s.active),
    team: active.length > 0,
    photos: active.length > 0 && active.every((s) => s.photo_url),
  };
}

export function manageView(app, tabId) {
  const tab = TABS.find((x) => x.id === tabId) ?? TABS[0];
  const title = h('div', { class: 'title', text: pick(app.ctx.salon, 'name') });
  const progress = h('div', { class: 'card stack', hidden: true });
  const content = h('div', null, h('div', { class: 'boot' }, h('div', { class: 'spinner' })));
  const tabLinks = TABS.map((x) => h(
    'a',
    { class: `tab ${x.id === tab.id ? 'active' : ''}`, href: `#/manage/${x.id}`, 'aria-current': x.id === tab.id ? 'page' : null },
    icon(x.icon),
    h('span', { text: t(`tab.${x.id}`) }),
  ));

  const store = {
    ...cache,
    /** Tabs call this after saving so the progress, title and colours stay in step. */
    set(partial) {
      Object.assign(store, partial);
      cache = { ...cache, ...partial };
      refreshChrome();
    },
  };

  function refreshChrome() {
    title.textContent = pick(store.salon, 'name');
    app.ctx.salon = { ...app.ctx.salon, ...store.salon };
    const steps = setupSteps(store);
    const done = Object.values(steps).filter(Boolean).length;
    progress.hidden = false;
    clear(
      progress,
      h('div', { class: 'row between' }, h('span', { class: 'small', text: done === 4 ? t('manage.setup_done') : t('manage.setup', { done }) })),
      h('div', { class: 'setup' }, Object.values(steps).map((ok) => h('div', { class: `setup-step ${ok ? 'done' : ''}` }))),
    );
    const needs = { salon: !steps.salon, services: !steps.services, team: !steps.team || !steps.photos, hours: false };
    tabLinks.forEach((link, i) => {
      link.querySelector('.dot')?.remove();
      if (needs[TABS[i].id]) link.append(h('span', { class: 'dot', 'aria-hidden': 'true' }));
    });
  }

  function show() {
    applyColors(store.salon.color_primary, store.salon.color_accent);
    refreshChrome();
    clear(content, tab.render(store, app));
  }

  if (cache && cache.salonId === app.ctx.salon.id) {
    queueMicrotask(show);
  } else {
    load(app.ctx.salon.id)
      .then((data) => {
        cache = data;
        Object.assign(store, data);
        show();
      })
      .catch(toastError);
  }

  return h(
    'div',
    null,
    h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'topbar-inner' },
        title,
        h('a', { class: 'icon-btn', href: '#/', 'aria-label': t('manage.view_page'), title: t('manage.view_page') }, icon('external')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('app.lang'), title: t('app.lang'), onclick: () => app.toggleLang() }, icon('globe')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('logout'), title: t('logout'), onclick: () => { cache = null; app.logout(); } }, icon('logout', 'flip-rtl')),
      ),
    ),
    h('main', { class: 'page with-tabbar stack' }, progress, content),
    h('nav', { class: 'tabbar' }, h('div', { class: 'tabbar-inner' }, tabLinks)),
  );
}
