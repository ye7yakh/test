// The salon's own page, as customers see it: a night-lit hero in the salon's
// colours with its logo in a ring of mirror lights, then services, team, hours and
// how to reach them, with booking one tap away from anywhere on the page.
import { api } from '../api.js';
import { myBookingsCard, openBooking, waNumber } from './booking.js';
import { appReady, avatar, clear, h, icon, tilt, toast } from '../dom.js';
import { DAY_ORDER, dayName, errorText, fmtDuration, fmtPrice, fmtTime, pick, t } from '../i18n.js';
import { applyColors, reducedMotion } from '../theme.js';
import { nowIn, openStatus, toMin } from '../time.js';

export function salonPage(app) {
  const el = h('div', { class: 'p-page' }, h('div', { class: 'boot' }, h('div', { class: 'spinner' })));
  api('GET', '/api/public/salon')
    .then((data) => {
      clear(el, render(app, data));
      requestAnimationFrame(() => watchScroll(app, el));
    })
    .catch((err) => clear(el, h('div', { class: 'page' }, h('p', { class: 'empty', text: errorText(err) }))))
    .finally(appReady);
  return el;
}

/** When the salon next opens, for the "closed now" pill: later today, tomorrow, or a weekday. */
function nextOpening(hours, now) {
  for (let ahead = 0; ahead < 7; ahead++) {
    const day = (now.weekday + ahead) % 7;
    const ranges = [...(hours[day] ?? [])].sort((a, b) => toMin(a.open) - toMin(b.open));
    const next = ranges.find((r) => ahead > 0 || toMin(r.open) > now.minutes);
    if (!next) continue;
    if (ahead === 0) return t('pub.opens_today', { time: fmtTime(next.open) });
    if (ahead === 1) return t('pub.opens_tomorrow', { time: fmtTime(next.open) });
    return t('pub.opens_day', { day: dayName(day), time: fmtTime(next.open) });
  }
  return null;
}

/** Sections drift in as they scroll into view; the glass bar shows once the hero is gone. */
function watchScroll(app, root) {
  const items = [...root.querySelectorAll('.reveal')];
  if (reducedMotion() || !('IntersectionObserver' in window)) items.forEach((x) => x.classList.add('in'));
  else {
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add('in');
        io.unobserve(e.target);
      }
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    items.forEach((x) => io.observe(x));
    app.onUnmount(() => io.disconnect());
  }
  const bar = root.querySelector('.p-bar');
  const anchor = root.querySelector('.p-hero h1');
  if (bar && anchor && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => bar.classList.toggle('on', !e.isIntersecting && e.boundingClientRect.top < 0));
    io.observe(anchor);
    app.onUnmount(() => io.disconnect());
  }
}

async function share(salon) {
  const name = pick(salon, 'name');
  const data = { title: name, text: t('home.share_text', { name }), url: location.origin };
  if (navigator.share) {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      if (err?.name === 'AbortError') return;
    }
  }
  await navigator.clipboard?.writeText(location.origin).catch(() => {});
  toast(t('copied'));
}

function render(app, data) {
  const { salon, services, staff, hours } = data;
  const canBook = salon.booking_enabled && services.length > 0;
  const book = (serviceId) => (canBook ? openBooking(app, data, { serviceId }) : null);
  const name = pick(salon, 'name');
  const about = pick(salon, 'about');
  const now = nowIn(salon.timezone);
  const status = openStatus(hours, now);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  applyColors(salon.color_primary, salon.color_accent); // drop any unsaved preview from the dashboard

  const logo = (cls) => (salon.logo_url ? h('img', { class: cls, src: salon.logo_url, alt: '' }) : h('div', { class: `${cls} letter`, text: name.charAt(0) }));
  const tel = salon.phone ? salon.phone.replace(/[^\d+]/g, '') : '';
  const wa = salon.phone ? waNumber(salon.phone) : '';
  const map = salon.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${salon.address}`)}` : '';

  // ---- hero
  const action = (iconName, label, attrs) => h(
    attrs.href ? 'a' : 'button',
    { class: 'p-action', ...(attrs.href ? { target: attrs.href.startsWith('http') ? '_blank' : null, rel: 'noopener' } : { type: 'button' }), ...attrs },
    h('span', { class: 'c' }, icon(iconName)),
    h('span', { class: 'l', text: label }),
  );
  const actions = [
    tel ? action('phone', t('pub.call'), { href: `tel:${tel}` }) : null,
    wa ? action('chat', t('pub.whatsapp'), { href: `https://wa.me/${wa}` }) : null,
    map ? action('pin', t('pub.map'), { href: map }) : null,
    action('share', t('pub.share'), { onclick: () => share(salon) }),
  ].filter(Boolean);
  const opening = status.open ? null : nextOpening(hours, now);

  const hero = h(
    'header',
    { class: 'p-hero' },
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h(
      'div',
      { class: 'p-top' },
      app.canManage ? h('a', { class: 'p-glass-btn', href: '/manage' }, icon('sliders'), h('span', { text: t('pub.manage') })) : h('span'),
      h('button', { class: 'p-glass-btn round', type: 'button', 'aria-label': t('app.lang'), title: t('app.lang'), onclick: () => app.toggleLang() }, icon('globe')),
    ),
    h(
      'div',
      { class: 'p-hero-content' },
      h('div', { class: 'p-mirror' }, h('div', { class: 'p-lights', 'aria-hidden': 'true' }, Array.from({ length: 18 }, (_, i) => h('i', { style: { '--i': String(i) } }))), logo('p-logo')),
      h('h1', { text: name }),
      about ? h('p', { class: 'p-about', text: about }) : null,
      h(
        'div',
        { class: `p-status ${status.open ? 'open' : ''}` },
        h('span', { class: 'dot', 'aria-hidden': 'true' }),
        h('span', { text: status.open ? t('pub.open_now', { time: fmtTime(status.until) }) : [t('pub.closed_now'), opening].filter(Boolean).join(' · ') }),
      ),
      h('div', { class: 'p-actions' }, actions),
    ),
  );

  // ---- services
  const serviceCard = (s, i) => h(
    canBook ? 'button' : 'div',
    { class: 'p-svc reveal', type: canBook ? 'button' : null, style: { '--i': String(i % 6) }, onclick: canBook ? () => book(s.id) : null },
    h('div', { class: 'p-svc-e', text: s.icon || '✂️' }),
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'n', text: pick(s, 'name') }),
      pick(s, 'description') ? h('div', { class: 'd', text: pick(s, 'description') }) : null,
      h(
        'div',
        { class: 'm' },
        h('span', { class: 'chip' }, icon('clock'), fmtDuration(s.duration_min)),
        h('span', { class: 'avatar-stack' }, s.staff_ids.slice(0, 3).map((id) => {
          const m = staffById.get(id);
          return m ? avatar(m.photo_url, pick(m, 'name')) : null;
        })),
      ),
    ),
    h(
      'div',
      { class: 'p-svc-p' },
      s.price_is_from ? h('small', { text: t('pub.from') }) : null,
      h('b', { text: fmtPrice(s.price, salon.currency) }),
      canBook ? h('span', { class: 'go', 'aria-hidden': 'true' }, icon('arrow', 'flip-ltr')) : null,
    ),
  );
  const head = (title, count) => h('div', { class: 'p-head reveal' }, h('h2', { text: title }), count ? h('span', { class: 'count num', text: String(count) }) : null);
  const servicesSection = services.length
    ? h('section', { class: 'p-section' }, head(t('pub.services'), services.length), h('div', { class: 'p-services' }, services.map(serviceCard)))
    : null;

  // ---- team: a carousel of portraits
  const teamSection = staff.length
    ? h(
        'section',
        { class: 'p-section' },
        head(t('pub.team'), staff.length),
        h('div', { class: 'scroller p-team' }, staff.map((m, i) => h(
          'div',
          { class: 'p-member reveal', style: { '--i': String(i % 6) } },
          // The portrait tilts towards the pointer; the card itself only slides in.
          tilt(h(
            'div',
            { class: 'portrait' },
            m.photo_url ? h('img', { src: m.photo_url, alt: pick(m, 'name'), loading: 'lazy' }) : h('div', { class: 'placeholder' }, icon('user')),
            h('div', { class: 'info' }, h('div', { class: 'n', text: pick(m, 'name') }), pick(m, 'title') ? h('div', { class: 'r', text: pick(m, 'title') }) : null),
          ), 6),
        ))),
      )
    : null;

  // ---- hours, today first in mind
  const hoursSection = h(
    'section',
    { class: 'p-section' },
    head(t('pub.hours')),
    h('div', { class: 'p-card p-hours reveal' }, DAY_ORDER.map((d) => {
      const ranges = hours[d] ?? [];
      const today = d === now.weekday;
      return h(
        'div',
        { class: `p-hour ${today ? 'today' : ''} ${ranges.length ? '' : 'off'}` },
        h('span', { class: 'd' }, dayName(d), today ? h('span', { class: 'p-today', text: t('pub.today') }) : null),
        h('span', { class: 'v' }, ranges.length ? ranges.map((r) => h('span', { text: `${fmtTime(r.open)} – ${fmtTime(r.close)}` })) : t('pub.closed')),
      );
    })),
  );

  const contactSection = tel || salon.address
    ? h(
        'section',
        { class: 'p-section' },
        head(t('pub.contact')),
        h(
          'div',
          { class: 'p-card p-contact reveal' },
          tel ? h('a', { class: 'p-line', href: `tel:${tel}` }, h('span', { class: 'ic' }, icon('phone')), h('span', { class: 'grow ltr', text: salon.phone }), icon('chevron', 'flip-ltr faint')) : null,
          salon.address ? h('a', { class: 'p-line', href: map, target: '_blank', rel: 'noopener' }, h('span', { class: 'ic' }, icon('pin')), h('span', { class: 'grow', text: salon.address }), icon('external', 'faint')) : null,
        ),
      )
    : null;

  // ---- floating bars
  const bar = h(
    'div',
    { class: 'p-bar', 'aria-hidden': 'true' },
    h('div', { class: 'p-bar-inner' }, logo('p-bar-logo'), h('span', { class: 'grow truncate', text: name }), canBook ? h('button', { class: 'btn btn-primary btn-sm', type: 'button', tabindex: '-1', onclick: () => book(), text: t('pub.book_short') }) : null),
  );
  const cta = h('div', { class: 'p-cta' }, h('div', { class: 'p-cta-inner' }, canBook
    ? h('button', { class: 'btn btn-primary btn-block sheen p-book', type: 'button', onclick: () => book() }, icon('calendar'), t('book.cta'))
    : h('button', { class: 'btn btn-primary btn-block', type: 'button', disabled: true, text: salon.booking_enabled ? t('pub.book') : t('book.closed') })));

  return h(
    'div',
    null,
    bar,
    hero,
    h(
      'main',
      { class: 'p-main' },
      !services.length && !staff.length ? h('p', { class: 'empty', text: t('pub.empty') }) : null,
      myBookingsCard(salon),
      servicesSection,
      teamSection,
      hoursSection,
      contactSection,
      h(
        'footer',
        { class: 'p-foot' },
        app.canManage ? null : h('a', { href: '/manage', text: t('pub.owner_login') }),
        h('div', { class: 'faint', text: t('pub.powered', { brand: app.ctx.tenant.name }) }),
      ),
    ),
    cta,
  );
}
