// The salon's own page, as customers see it. Booking comes in the next step.
import { api } from '../api.js';
import { avatar, clear, h, icon } from '../dom.js';
import { DAY_ORDER, dayName, errorText, fmtDuration, fmtPrice, fmtTime, pick, t } from '../i18n.js';
import { applyColors } from '../theme.js';
import { nowIn, openStatus } from '../time.js';

export function hoursTable(hours, today) {
  return h(
    'table',
    { class: 'hours-table' },
    h('tbody', null, DAY_ORDER.map((d) => h(
      'tr',
      { class: d === today ? 'today' : '' },
      h('td', { text: dayName(d) }),
      h('td', null, hours[d].length
        ? hours[d].map((r, i) => h('div', { text: `${fmtTime(r.open)} – ${fmtTime(r.close)}`, class: i ? 'small' : '' }))
        : h('span', { class: 'muted', text: t('pub.closed') })),
    ))),
  );
}

export function salonPage(app) {
  const el = h('div', null, h('div', { class: 'boot' }, h('div', { class: 'spinner' })));
  api('GET', '/api/public/salon')
    .then((data) => clear(el, render(app, data)))
    .catch((err) => clear(el, h('div', { class: 'page' }, h('p', { class: 'empty', text: errorText(err) }))));
  return el;
}

function render(app, { salon, services, staff, hours }) {
  const name = pick(salon, 'name');
  const about = pick(salon, 'about');
  const now = nowIn(salon.timezone);
  const status = openStatus(hours, now);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  applyColors(salon.color_primary, salon.color_accent); // drop any unsaved preview from the dashboard

  const hero = h(
    'header',
    { class: 'hero' },
    h(
      'div',
      { class: 'hero-top' },
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('app.lang'), onclick: () => app.toggleLang(), style: { color: 'var(--on-primary)' } }, icon('globe')),
    ),
    h(
      'div',
      { class: 'hero-inner' },
      salon.logo_url ? h('img', { class: 'logo', src: salon.logo_url, alt: '' }) : h('div', { class: 'logo', text: name.charAt(0) }),
      h('h1', { text: name }),
      about ? h('p', { text: about }) : null,
      h('span', {
        class: `status-pill ${status.open ? 'open' : ''}`,
        text: status.open ? t('pub.open_now', { time: fmtTime(status.until) }) : t('pub.closed_now'),
      }),
      app.canManage
        ? h('div', { class: 'hero-actions' }, h('a', { class: 'btn btn-accent btn-sm', href: '#/manage', text: t('pub.manage') }))
        : null,
    ),
  );

  const servicesCard = services.length
    ? h(
        'section',
        null,
        h('div', { class: 'section-title' }, h('h2', { text: t('pub.services') })),
        h('div', { class: 'card flush' }, h('ul', { class: 'list' }, services.map((s) => h(
          'li',
          { class: 'service-line' },
          h(
            'div',
            { class: 'grow' },
            h('h3', { text: pick(s, 'name') }),
            pick(s, 'description') ? h('p', { class: 'muted small', text: pick(s, 'description') }) : null,
            h(
              'div',
              { class: 'row', style: { gap: '8px', marginTop: '4px' } },
              h('span', { class: 'muted small', text: fmtDuration(s.duration_min) }),
              h('span', { class: 'avatar-stack' }, s.staff_ids.slice(0, 4).map((id) => {
                const m = staffById.get(id);
                return m ? avatar(m.photo_url, pick(m, 'name')) : null;
              })),
            ),
          ),
          h('div', { class: 'price' }, s.price_is_from ? h('span', { class: 'from', text: t('pub.from') }) : null, fmtPrice(s.price, salon.currency)),
        )))),
      )
    : null;

  const teamSection = staff.length
    ? h(
        'section',
        null,
        h('div', { class: 'section-title' }, h('h2', { text: t('pub.team') })),
        h('div', { class: 'team-grid' }, staff.map((m) => h(
          'div',
          { class: 'team-card' },
          h('div', { class: 'portrait' }, m.photo_url
            ? h('img', { src: m.photo_url, alt: pick(m, 'name'), loading: 'lazy' })
            : h('div', { class: 'placeholder' }, icon('user'))),
          h('div', { class: 'name', text: pick(m, 'name') }),
          pick(m, 'title') ? h('div', { class: 'role', text: pick(m, 'title') }) : null,
        ))),
      )
    : null;

  const contact = salon.phone || salon.address
    ? h(
        'section',
        null,
        h('div', { class: 'section-title' }, h('h2', { text: t('pub.contact') })),
        h(
          'div',
          { class: 'card stack' },
          salon.phone
            ? h('a', { class: 'row', href: `tel:${salon.phone.replace(/[^\d+]/g, '')}` }, icon('phone'), h('span', { class: 'ltr', text: salon.phone }))
            : null,
          salon.address ? h('div', { class: 'row' }, icon('pin'), h('span', { text: salon.address })) : null,
        ),
      )
    : null;

  return h(
    'div',
    null,
    hero,
    h(
      'main',
      { class: 'page stack-lg' },
      !services.length && !staff.length ? h('p', { class: 'empty', text: t('pub.empty') }) : null,
      servicesCard,
      teamSection,
      h('section', null, h('div', { class: 'section-title' }, h('h2', { text: t('pub.hours') })), h('div', { class: 'card' }, hoursTable(hours, now.weekday))),
      contact,
      app.canManage ? null : h('p', { class: 'small', style: { textAlign: 'center' } }, h('a', { class: 'muted', href: '#/login', text: t('pub.owner_login') })),
    ),
    h('div', { class: 'cta-bar' }, h('div', { class: 'cta-bar-inner' }, h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, text: t('pub.book') }))),
  );
}
