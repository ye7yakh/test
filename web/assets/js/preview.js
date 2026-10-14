// A live picture of the salon's app, drawn from the owner's data: a phone showing
// the app itself, and a phone home screen with the salon's icon among the others.
// Everything reads the salon colours from CSS variables, so previews follow edits.
import { appIcon, h, icon, salonIcon } from './dom.js';
import { fmtDuration, fmtPrice, pick, t } from './i18n.js';
import { nowIn, openStatus } from './time.js';

/** Wraps screen content in a phone frame, scaled to fit where it is shown. */
export function phone(screen, { scale = 1 } = {}) {
  return h(
    'div',
    { class: 'phone-wrap', style: { '--scale': String(scale) } },
    h(
      'div',
      { class: 'phone', 'aria-hidden': 'true' },
      h(
        'div',
        { class: 'phone-screen' },
        h('div', { class: 'phone-island' }),
        h('div', { class: 'phone-status' }, h('span', { text: '9:41' }), h('span', { class: 'bars' }, h('b'), h('i'))),
        screen,
      ),
    ),
  );
}

/** The salon's customer app, in miniature. */
export function miniApp({ salon, services, staff, hours }) {
  const name = pick(salon, 'name');
  const about = pick(salon, 'about');
  const status = openStatus(hours, nowIn(salon.timezone));
  const active = services.filter((s) => s.active !== false);
  const team = staff.filter((m) => m.active !== false);
  return h(
    'div',
    { class: `mini ${salon.page_theme === 'day' ? 'day' : ''}` },
    h(
      'div',
      { class: `mini-hero ${salon.cover_url ? 'has-cover' : ''}` },
      salon.cover_url ? h('img', { class: 'cover', src: salon.cover_url, alt: '' }) : null,
      h('div', { class: 'mini-mirror' }, appIcon(salon.logo_url)),
      h('div', { class: 't', text: name }),
      about ? h('div', { class: 'a', text: about }) : null,
      h('div', { class: `st ${status.open ? '' : 'closed'}`, text: status.open ? t('preview.open_now') : t('preview.closed') }),
    ),
    h(
      'div',
      { class: 'mini-body' },
      h('div', { class: 'mini-h', text: t('preview.services') }),
      active.length
        ? active.slice(0, 3).map((s) => h(
            'div',
            { class: 'mini-svc' },
            h('div', { class: 'e', text: s.icon || '✂️' }),
            h('div', null, h('div', { class: 'n', text: pick(s, 'name') }), h('div', { class: 'd', text: fmtDuration(s.duration_min) })),
            h('div', { class: 'p', text: fmtPrice(s.price, salon.currency) }),
          ))
        : h('div', { class: 'mini-empty', text: t('preview.empty') }),
      team.length
        ? [
            h('div', { class: 'mini-h', style: { marginTop: '14px' }, text: t('preview.team') }),
            h('div', { class: 'mini-team' }, team.slice(0, 3).map((m) => h(
              'div',
              null,
              m.photo_url ? h('img', { src: m.photo_url, alt: '' }) : h('div', { class: 'ph' }, icon('user')),
              h('div', { class: 'nm truncate', text: pick(m, 'name') }),
            ))),
          ]
        : null,
    ),
    h('div', { class: 'mini-cta', text: t('preview.book') }),
  );
}

/** A phone home screen with the salon's app installed. */
export function homeScreen({ salon }) {
  const ghost = () => h('div', null, h('div', { class: 'ghost' }), h('div', { class: 'lbl' }));
  const mine = h('div', { class: 'mine' }, salonIcon(salon), h('div', { class: 'nm', text: pick(salon, 'name') }));
  const apps = Array.from({ length: 12 }, (_, i) => (i === 5 ? mine : ghost()));
  return h(
    'div',
    { class: 'home-screen' },
    h('div', { class: 'home-grid' }, apps),
    h('div', { class: 'home-dock' }, Array.from({ length: 4 }, () => h('div', { class: 'ghost' }))),
  );
}

/** The launch screen as the installed app opens: the icon in a ring of lights, and the name. */
export function splashScreen({ salon }) {
  return h(
    'div',
    { class: `mini-splash ${salon.page_theme === 'day' ? 'day' : ''}` },
    h('div', { class: 'mk' }, salonIcon(salon)),
    h('div', { class: 'nm', text: pick(salon, 'name') }),
  );
}
