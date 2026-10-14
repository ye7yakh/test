// The salon's own page, as customers see it: a night-lit hero in the salon's
// colours with its app icon in a ring of mirror lights, then services, team, hours
// and how to reach them, with booking one tap away from anywhere on the page. On a
// phone it reads as the salon's app; on a wide screen as its website, with the hours
// and contact details held beside the menu.
import { api } from '../api.js';
import { myBookings, openBooking, waNumber } from './booking.js';
import { appReady, avatar, clear, h, icon, legalLinks, sheet, tilt, toast } from '../dom.js';
import { DAY_ORDER, dayName, errorText, fmtDuration, fmtHour, fmtPrice, fmtTime, pick, t } from '../i18n.js';
import { homeScreen, phone } from '../preview.js';
import { fmtDate } from '../slots.js';
import { applyColors, reducedMotion } from '../theme.js';
import { nowIn, openStatus, toMin } from '../time.js';

export function salonPage(app, { book = false } = {}) {
  const el = h('div', { class: 'p-page' }, h('div', { class: 'boot' }, h('div', { class: 'spinner' })));
  api('GET', '/api/public/salon')
    .then((data) => {
      // Left before the salon answered: this page is gone, and nothing of it (its
      // colours, its listeners, the booking sheet) belongs on the screen shown now.
      if (!el.isConnected) return;
      clear(el, render(app, data));
      requestAnimationFrame(() => el.isConnected && watchScroll(app, el, data.salon));
      // The salon's booking link (/book) opens the booking sheet over its page; the
      // address goes back to the page itself once the sheet closes.
      if (book && location.pathname === '/book') {
        const leave = () => history.replaceState(null, '', '/');
        if (data.salon.booking_enabled && data.services.length) openBooking(app, data, { onClose: leave });
        else leave();
      }
    })
    .catch((err) => clear(el, h('div', { class: 'boot p-fail' }, h(
      'div',
      { class: 'stack center' },
      h('span', { class: 'p-fail-ic', 'aria-hidden': 'true' }, icon('alert')),
      h('p', { text: errorText(err) }),
      h('button', { class: 'btn btn-primary', type: 'button', text: t('retry'), onclick: () => location.reload() }),
    ))))
    .finally(appReady);
  return el;
}

/** The salon's app icon exactly as the server draws it (launch screen, home screen). */
const appMark = (salon, cls, size) => h('img', { class: cls, src: `/icons/icon-${size}.png?v=${salon.icon_v}`, alt: '' });

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

/** Smooth scroll to a section (instant when motion is reduced), focus on its title. */
function jumpTo(id) {
  return (e) => {
    e.preventDefault();
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'start' });
    target.querySelector('h2')?.focus({ preventScroll: true });
  };
}

/**
 * Sections drift in as they scroll into view; the glass bar (with the section tabs)
 * shows once the hero is gone. By day the phone's toolbar takes the hero's colour
 * at the top and the page's once the light sheet is under it.
 */
function watchScroll(app, root, salon) {
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

  const meta = document.querySelector('meta[name="theme-color"]');
  const day = document.documentElement.dataset.page === 'day';
  const tone = (onPage) => {
    if (!day || !meta) return;
    const page = getComputedStyle(document.documentElement).getPropertyValue('--day').trim();
    meta.setAttribute('content', onPage && page ? page : salon.color_primary);
  };
  tone(false);

  const bar = root.querySelector('.p-bar');
  const anchor = root.querySelector('.p-hero h1');
  if (bar && anchor && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver(([e]) => {
      const on = !e.isIntersecting && e.boundingClientRect.top < 0;
      bar.classList.toggle('on', on);
      bar.inert = !on;
      tone(on);
    });
    io.observe(anchor);
    app.onUnmount(() => io.disconnect());
  }
  sectionSpy(app, root);
  heroDepth(root);
}

/** The bar's tabs follow the section being read; one highlight slides between them. */
function sectionSpy(app, root) {
  const nav = root.querySelector('.p-tabs');
  if (!nav) return;
  const ind = nav.querySelector('.p-tabs-ind');
  const links = [...nav.querySelectorAll('a[data-for]')];
  let current = null;
  const show = (link) => {
    for (const a of links) {
      a.classList.toggle('on', a === link);
      if (a === link) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    }
    ind.classList.toggle('on', !!link);
    if (!link) return;
    ind.style.width = `${link.offsetWidth}px`;
    ind.style.transform = `translateX(${link.offsetLeft}px)`;
    if (nav.scrollWidth > nav.clientWidth) {
      nav.scrollTo({ left: link.offsetLeft + link.offsetWidth / 2 - nav.clientWidth / 2, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  };
  // The section being read is the last one whose top has come up into the top part
  // of the screen; at the very end of the page, the last one.
  let frame = 0;
  const update = () => {
    frame = 0;
    const shown = links.filter((a) => a.offsetParent !== null);
    const line = Math.max(140, innerHeight * 0.4);
    const atEnd = innerHeight + scrollY >= document.documentElement.scrollHeight - 4;
    let link = null;
    for (const a of shown) {
      const target = document.getElementById(a.dataset.for);
      if (target && target.getBoundingClientRect().top <= line) link = a;
    }
    if (atEnd && shown.length) link = shown[shown.length - 1];
    if (link !== current) {
      current = link;
      show(link);
    }
  };
  const onScroll = () => {
    frame ||= requestAnimationFrame(update);
  };
  const onResize = () => {
    current = null;
    onScroll();
  };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', onResize);
  update();
  app.onUnmount(() => {
    removeEventListener('scroll', onScroll);
    removeEventListener('resize', onResize);
  });
}

/** With a mouse, the hero's layers shift with the pointer at different depths. */
function heroDepth(root) {
  const hero = root.querySelector('.p-hero');
  if (!hero || reducedMotion() || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  let frame = 0;
  let x = 0;
  let y = 0;
  const paint = () => {
    frame = 0;
    hero.style.setProperty('--px', x.toFixed(3));
    hero.style.setProperty('--py', y.toFixed(3));
  };
  hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    x = (e.clientX - r.left) / r.width - 0.5;
    y = (e.clientY - r.top) / r.height - 0.5;
    frame ||= requestAnimationFrame(paint);
  });
  hero.addEventListener('pointerleave', () => {
    x = 0;
    y = 0;
    frame ||= requestAnimationFrame(paint);
  });
}

/**
 * "Install the app": the browser's own prompt where it offers one (Android, desktop
 * Chrome), and on iPhone the two taps in Safari, shown on the salon's own icon.
 */
function installButton(app, salon) {
  const btn = h(
    'button',
    { class: 'p-glass-btn p-install', type: 'button', hidden: true },
    appMark(salon, 'p-glass-icon', 192),
    h('span', { text: t('install.app') }),
  );
  const sync = () => {
    btn.hidden = app.installed() || !(app.canInstall() || app.isIOS);
  };
  btn.addEventListener('click', async () => {
    if (app.canInstall()) {
      await app.install();
      sync();
    } else if (app.isIOS) iosInstall(salon);
  });
  sync();
  addEventListener('install-ready', sync);
  app.onUnmount(() => removeEventListener('install-ready', sync));
  return btn;
}

function iosInstall(salon) {
  const step = (n, glyph, text) => h(
    'li',
    { class: 'p-step' },
    h('span', { class: 'p-step-n', text: String(n) }),
    h('span', { class: 'grow', text }),
    h('span', { class: 'p-step-g', 'aria-hidden': 'true' }, glyph),
  );
  sheet({
    title: t('install.app'),
    body: h(
      'div',
      { class: 'p-ios' },
      h('div', { class: 'p-ios-stage' }, phone(homeScreen({ salon }), { scale: 0.46 })),
      h('p', { class: 'p-ios-sub', text: t('pub.install_sub') }),
      h(
        'ol',
        { class: 'p-steps' },
        step(1, icon('share'), t('pub.install_share')),
        step(2, h('span', { class: 'p-plus' }, icon('plus')), t('pub.install_add')),
        step(3, appMark(salon, 'p-step-icon', 192), t('pub.install_open', { name: pick(salon, 'name') })),
      ),
    ),
  });
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

// ---------------------------------------------------------------- this device's visits

const LIVE = new Set(['pending_payment', 'payment_sent']);

/**
 * Upcoming visits booked on this device, as tickets that open their own pages. The
 * space opens smoothly once they have loaded, so nothing below jumps.
 */
function myVisits(salon, head) {
  const list = myBookings(salon.id);
  if (!list.length) return null;
  const body = h('div', { class: 'p-ticket-body' });
  const wrap = h('section', { class: 'p-ticket-wrap', 'aria-labelledby': 'mine-t' }, h('div', { class: 'p-ticket-clip' }, body));
  Promise.all(list.slice(0, 5).map((item) => api('GET', `/api/public/bookings/${item.token}`).then((r) => ({ token: item.token, b: r.booking })).catch(() => null)))
    .then((rows) => {
      const live = rows.filter((r) => r && (r.b.upcoming || LIVE.has(r.b.status)) && !['cancelled', 'expired'].includes(r.b.status));
      if (!live.length) return wrap.remove();
      const title = head('mine', t('book.mine'), live.length);
      title.classList.add('in');
      clear(body, title, h('div', { class: 'p-tickets' }, live.map(({ token, b }) => ticket(token, b))));
      requestAnimationFrame(() => wrap.classList.add('in'));
    });
  return wrap;
}

function ticket(token, b) {
  const staffName = b.staff?.name_ar ? pick(b.staff, 'name') : '';
  return h(
    'a',
    { class: 'p-ticket', href: `/b/${token}` },
    h(
      'div',
      { class: 'p-ticket-date' },
      h('small', { text: fmtDate(b.date, { weekday: 'short' }) }),
      h('b', { text: fmtDate(b.date, { day: 'numeric' }) }),
      h('small', { text: fmtDate(b.date, { month: 'short' }) }),
    ),
    h(
      'div',
      { class: 'grow' },
      h('div', { class: 'n' }, h('span', { class: 'e', 'aria-hidden': 'true', text: b.service.icon || '✂️' }), h('bdi', { text: pick(b.service, 'name') })),
      h('div', { class: 'm' }, fmtTime(b.start), staffName ? [' · ', h('bdi', { text: staffName })] : null),
      h('span', { class: `pill status-${b.status}`, text: b.status === 'payment_sent' ? t('bk.payment_sent') : t(`status.${b.status}`) }),
    ),
    icon('chevron', 'flip-ltr faint'),
  );
}

// ---------------------------------------------------------------- the page

function render(app, data) {
  const { salon, services, staff, hours } = data;
  const canBook = salon.booking_enabled && services.length > 0;
  const book = (serviceId) => (canBook ? openBooking(app, data, { serviceId }) : null);
  const name = pick(salon, 'name');
  const about = pick(salon, 'about');
  const now = nowIn(salon.timezone);
  const hasHours = DAY_ORDER.some((d) => (hours[d] ?? []).length > 0);
  const status = openStatus(hours, now);
  const staffById = new Map(staff.map((s) => [s.id, s]));
  applyColors(salon.color_primary, salon.color_accent); // drop any unsaved preview from the dashboard

  const tel = salon.phone ? salon.phone.replace(/[^\d+]/g, '') : '';
  const wa = salon.phone ? waNumber(salon.phone) : '';
  const map = salon.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${name} ${salon.address}`)}` : '';
  const closedNote = salon.booking_enabled ? t('pub.book') : t('book.closed');

  const head = (id, title, count, ...extra) => h(
    'div',
    { class: 'p-head reveal' },
    h('h2', { id: `${id}-t`, tabindex: '-1', text: title }),
    count ? h('span', { class: 'count num', text: String(count) }) : null,
    ...extra,
  );
  const section = (id, title, count, body, extra) => h('section', { class: 'p-section', id, 'aria-labelledby': `${id}-t` }, head(id, title, count, extra), body);

  // ---- services
  const multiStaff = staff.length > 1;
  const serviceCard = (s, i) => {
    // Who does it, only when that narrows things down.
    const who = multiStaff && s.staff_ids.length < staff.length ? s.staff_ids.map((id) => staffById.get(id)).filter(Boolean) : [];
    const desc = pick(s, 'description');
    return h(
      canBook ? 'button' : 'div',
      { class: 'p-svc reveal', type: canBook ? 'button' : null, style: { '--i': String(i % 6) }, onclick: canBook ? () => book(s.id) : null },
      h('div', { class: 'p-svc-e', 'aria-hidden': 'true', text: s.icon || '✂️' }),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'n' }, h('bdi', { text: pick(s, 'name') })),
        desc ? h('div', { class: 'd' }, h('bdi', { text: desc })) : null,
        h(
          'div',
          { class: 'm' },
          h('span', { class: 'chip' }, icon('clock'), fmtDuration(s.duration_min)),
          who.length === 1 ? h('span', { class: 'p-svc-who' }, avatar(who[0].photo_url, pick(who[0], 'name')), h('bdi', { text: pick(who[0], 'name') })) : null,
          who.length > 1 ? h('span', { class: 'avatar-stack' }, who.slice(0, 3).map((m) => avatar(m.photo_url, pick(m, 'name')))) : null,
        ),
      ),
      h('div', { class: 'p-svc-p' }, s.price_is_from ? h('small', { text: t('pub.from') }) : null, h('b', { text: fmtPrice(s.price, salon.currency) })),
      canBook ? h('span', { class: 'p-svc-go', 'aria-hidden': 'true' }, t('pub.book_short'), icon('arrow', 'flip-ltr')) : null,
    );
  };
  const servicesSection = services.length ? section('svc', t('pub.services'), services.length, h('div', { class: 'p-services' }, services.map(serviceCard))) : null;

  // ---- team: portraits; tapping one books with that person
  const offers = (m) => services.some((s) => s.staff_ids.includes(m.id));
  // The sheet narrows the menu to what they do and skips "with whom?".
  const bookWith = (m) => openBooking(app, data, { staffId: m.id });
  const photo = (m, alt) => (m.photo_url ? h('img', { src: m.photo_url, alt, loading: 'lazy' }) : h('div', { class: 'placeholder' }, icon('user')));
  const member = (m, i) => {
    const can = canBook && offers(m);
    const label = pick(m, 'name');
    return h(
      can ? 'button' : 'div',
      { class: 'p-member reveal', type: can ? 'button' : null, style: { '--i': String(i % 6) }, 'aria-label': can ? t('pub.book_with', { name: label }) : null, onclick: can ? () => bookWith(m) : null },
      // The portrait tilts towards the pointer; the card itself only slides in.
      tilt(h(
        'div',
        { class: 'portrait' },
        photo(m, can ? '' : label),
        can ? h('span', { class: 'p-member-book', 'aria-hidden': 'true' }, icon('calendar')) : null,
        h('div', { class: 'info' }, h('div', { class: 'n' }, h('bdi', { text: label })), pick(m, 'title') ? h('div', { class: 'r' }, h('bdi', { text: pick(m, 'title') })) : null),
      ), 6),
    );
  };
  const solo = (m) => {
    const can = canBook && offers(m);
    const label = pick(m, 'name');
    return h(
      can ? 'button' : 'div',
      { class: 'p-member solo reveal', type: can ? 'button' : null, onclick: can ? () => bookWith(m) : null },
      h('div', { class: 'portrait' }, photo(m, '')),
      h(
        'div',
        { class: 'grow' },
        h('div', { class: 'n' }, h('bdi', { text: label })),
        pick(m, 'title') ? h('div', { class: 'r' }, h('bdi', { text: pick(m, 'title') })) : null,
        can ? h('span', { class: 'p-solo-cta' }, icon('calendar'), t('pub.book_with', { name: label })) : null,
      ),
    );
  };
  let teamSection = null;
  if (staff.length === 1) teamSection = section('team', t('pub.team'), 0, solo(staff[0]));
  else if (staff.length === 2) teamSection = section('team', t('pub.team'), 2, h('div', { class: 'p-team few' }, staff.map(member)));
  else if (staff.length) {
    const scroller = h('div', { class: 'scroller p-team' }, staff.map(member));
    teamSection = section('team', t('pub.team'), staff.length, scroller, teamArrows(app, scroller));
  }

  // ---- hours: the week as day bars, today lit, with a tick at the time now
  const pct = (min) => `${(min / 14.4).toFixed(3)}%`;
  // "9 ص – 1 م" for whole hours, so a split day still fits on one line.
  const clock = (hhmm) => (hhmm.endsWith(':00') ? fmtHour(Number(hhmm.slice(0, 2))) : fmtTime(hhmm));
  const segments = (d) => {
    const out = [];
    for (const r of hours[d] ?? []) {
      const open = toMin(r.open);
      const close = toMin(r.close);
      out.push([open, close <= open ? 1440 : close]);
    }
    // Last night's late hours run on past midnight.
    for (const r of hours[(d + 6) % 7] ?? []) {
      const close = toMin(r.close);
      if (close <= toMin(r.open) && close > 0) out.push([0, close]);
    }
    return out;
  };
  const hoursSection = hasHours
    ? section('hours', t('pub.hours'), 0, h(
        'div',
        { class: 'p-card p-hours reveal' },
        h('div', { class: 'p-scale', 'aria-hidden': 'true' }, [6, 12, 18].map((hr) => h('span', { style: { insetInlineStart: pct(hr * 60) }, text: fmtHour(hr) }))),
        DAY_ORDER.map((d, row) => {
          const ranges = hours[d] ?? [];
          const today = d === now.weekday;
          return h(
            'div',
            { class: `p-hour ${today ? 'today' : ''} ${ranges.length ? '' : 'off'}`, style: { '--row': String(row) } },
            h('span', { class: 'd' }, dayName(d), today ? h('span', { class: 'p-today', text: t('pub.today') }) : null),
            h('span', { class: 'v' }, ranges.length
              ? ranges.map((r, i) => [i ? h('span', { class: 'sep', 'aria-hidden': 'true', text: '·' }) : null, h('span', { class: 'r', text: `${clock(r.open)} – ${clock(r.close)}` })])
              : t('pub.closed')),
            h(
              'div',
              { class: 'p-track', 'aria-hidden': 'true' },
              segments(d).map(([open, close]) => h('i', { class: 'p-seg', style: { insetInlineStart: pct(open), width: pct(close - open) } })),
              today ? h('b', { class: 'p-now', style: { insetInlineStart: pct(now.minutes) } }) : null,
            ),
          );
        }),
      ))
    : null;

  // ---- contact
  const contactSection = tel || salon.address
    ? section('contact', t('pub.contact'), 0, h(
        'div',
        { class: 'p-card p-contact reveal' },
        tel ? h('a', { class: 'p-line', href: `tel:${tel}` }, h('span', { class: 'ic' }, icon('phone')), h('span', { class: 'grow' }, h('span', { class: 'ltr', text: salon.phone })), icon('chevron', 'flip-ltr faint')) : null,
        wa ? h('a', { class: 'p-line', href: `https://wa.me/${wa}`, target: '_blank', rel: 'noopener' }, h('span', { class: 'ic' }, icon('chat')), h('span', { class: 'grow', text: t('pub.wa_chat') }), icon('external', 'faint')) : null,
        salon.address ? h('a', { class: 'p-line', href: map, target: '_blank', rel: 'noopener' }, h('span', { class: 'ic' }, icon('pin')), h('span', { class: 'grow' }, h('bdi', { text: salon.address })), icon('external', 'faint')) : null,
      ))
    : null;

  // ---- the page's sections, for the tabs in the bar (and the hero's links on a wide screen)
  const tabs = [
    [servicesSection, 'svc', t('pub.services'), false],
    [teamSection, 'team', t('pub.team'), false],
    [hoursSection, 'hours', t('pub.hours'), true],
    [contactSection, 'contact', t('pub.contact'), true],
  ].filter(([s]) => s);

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
  // Share on its own is a small button up top rather than a lone circle mid-hero.
  const shareOnly = actions.length === 1;
  const glass = (iconName, label, onclick) => h('button', { class: 'p-glass-btn round', type: 'button', 'aria-label': label, title: label, onclick }, icon(iconName));
  const opening = status.open ? null : nextOpening(hours, now);

  const hero = h(
    'header',
    { class: `p-hero ${salon.cover_url ? 'has-cover' : ''}` },
    // The salon's own photo across the top, when it has one.
    salon.cover_url ? h('img', { class: 'cover', src: salon.cover_url, alt: '', fetchpriority: 'high' }) : null,
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h(
      'div',
      { class: 'p-top' },
      app.canManage ? h('a', { class: 'p-glass-btn', href: '/admin' }, icon('sliders'), h('span', { text: t('pub.manage') })) : h('span'),
      tabs.length > 1
        ? h('nav', { class: 'p-top-nav', 'aria-label': t('pub.sections') }, tabs.map(([, id, label]) => h('a', { href: `#${id}`, onclick: jumpTo(id), text: label })))
        : null,
      h(
        'div',
        { class: 'p-top-end' },
        installButton(app, salon),
        shareOnly ? glass('share', t('pub.share'), () => share(salon)) : null,
        glass('globe', t('app.lang'), () => app.toggleLang()),
      ),
    ),
    h(
      'div',
      { class: 'p-hero-content' },
      h('div', { class: 'p-mirror' }, h('div', { class: 'p-lights', 'aria-hidden': 'true' }, Array.from({ length: 18 }, (_, i) => h('i', { style: { '--i': String(i) } }))), appMark(salon, 'p-logo', 512)),
      h('h1', { dir: 'auto', text: name }),
      about ? h('p', { class: 'p-about', dir: 'auto', text: about }) : null,
      hasHours
        ? h(
            'div',
            { class: `p-status ${status.open ? 'open' : ''}` },
            h('span', { class: 'dot', 'aria-hidden': 'true' }),
            h('span', { text: status.open ? t('pub.open_now', { time: fmtTime(status.until) }) : [t('pub.closed_now'), opening].filter(Boolean).join(' · ') }),
          )
        : null,
      // On a wide screen the hero carries the booking button (the phone has it pinned below).
      canBook
        ? h('button', { class: 'btn btn-primary sheen p-hero-book', type: 'button', onclick: () => book() }, icon('calendar'), t('book.cta'))
        : h('div', { class: 'p-hero-note' }, icon('clock'), h('span', { text: closedNote })),
      shareOnly ? null : h('div', { class: 'p-actions' }, actions),
    ),
    servicesSection ? h('a', { class: 'p-cue', href: '#svc', 'aria-label': t('pub.explore'), onclick: jumpTo('svc') }, icon('down')) : null,
  );

  // ---- the page under the hero: on a wide screen, the menu beside the details
  const visits = myVisits(salon, head);
  const col = visits || servicesSection || teamSection ? h('div', { class: 'p-col' }, visits, servicesSection, teamSection) : null;
  const aside = hoursSection || contactSection ? h('aside', { class: 'p-aside' }, hoursSection, contactSection) : null;
  const split = !!(servicesSection || teamSection) && !!aside;

  const footer = h(
    'footer',
    { class: 'p-foot' },
    h(
      'div',
      { class: 'p-foot-brand' },
      appMark(salon, 'p-foot-mark', 192),
      h('div', null, h('b', null, h('bdi', { text: name })), salon.address ? h('span', null, h('bdi', { text: salon.address })) : null),
    ),
    legalLinks(),
    h('div', { class: 'p-powered' }, icon('sparkles'), h('span', { text: t('pub.powered', { brand: pick(app.ctx.tenant, 'name') }) })),
    app.canManage ? null : h('a', { class: 'p-owner', href: '/admin', text: t('pub.owner_login') }),
  );

  // ---- floating: the glass bar with the section tabs, and the book button below
  const bar = h(
    'div',
    { class: `p-bar ${split ? 'split' : ''}`, inert: true },
    h(
      'div',
      { class: 'p-bar-inner' },
      h('div', { class: 'p-bar-id' }, appMark(salon, 'p-bar-logo', 192), h('span', { class: 'truncate' }, h('bdi', { text: name }))),
      tabs.length > 1
        ? h(
            'nav',
            { class: 'p-tabs', 'aria-label': t('pub.sections') },
            h('span', { class: 'p-tabs-ind', 'aria-hidden': 'true' }),
            tabs.map(([, id, label, side]) => h('a', { href: `#${id}`, class: side ? 'side' : null, 'data-for': id, onclick: jumpTo(id), text: label })),
          )
        : null,
      canBook ? h('button', { class: 'btn btn-primary btn-sm p-bar-book', type: 'button', onclick: () => book() }, icon('calendar'), t('pub.book_short')) : null,
    ),
  );
  const contactBtn = wa || tel
    ? h('a', { class: 'btn btn-secondary btn-sm', href: wa ? `https://wa.me/${wa}` : `tel:${tel}`, target: wa ? '_blank' : null, rel: wa ? 'noopener' : null }, icon(wa ? 'chat' : 'phone'), t(wa ? 'pub.whatsapp' : 'pub.call'))
    : null;
  const cta = h('div', { class: 'p-cta' }, h('div', { class: 'p-cta-inner' }, canBook
    ? h('button', { class: 'btn btn-primary btn-block sheen p-book', type: 'button', onclick: () => book() }, icon('calendar'), t('book.cta'))
    : h('div', { class: 'p-cta-note' }, icon('clock'), h('span', { class: 'grow', text: closedNote }), contactBtn)));

  return h(
    'div',
    { class: 'p-root' },
    bar,
    hero,
    h(
      'div',
      { class: 'p-sheet' },
      h(
        'main',
        { class: `p-main ${split ? 'split' : ''}` },
        !services.length && !staff.length ? h('div', { class: 'p-card p-empty reveal' }, h('span', { class: 'ic', 'aria-hidden': 'true' }, icon('sparkles')), h('p', { text: t('pub.empty') })) : null,
        // Its own box, so the details card stays in view only as far as the menu goes.
        col || aside ? h('div', { class: 'p-body' }, col, aside) : null,
        footer,
      ),
    ),
    cta,
  );
}

/** Previous / next buttons for the team carousel, for mouse users (CSS shows them). */
function teamArrows(app, scroller) {
  const step = (dir) => () => {
    const rtl = getComputedStyle(scroller).direction === 'rtl';
    scroller.scrollBy({ left: dir * (rtl ? -1 : 1) * scroller.clientWidth * 0.8, behavior: reducedMotion() ? 'auto' : 'smooth' });
  };
  const prev = h('button', { class: 'icon-btn p-nav-btn', type: 'button', 'aria-label': t('pub.prev'), onclick: step(-1) }, icon('chevron', 'flip-rtl'));
  const next = h('button', { class: 'icon-btn p-nav-btn', type: 'button', 'aria-label': t('pub.next'), onclick: step(1) }, icon('chevron', 'flip-ltr'));
  const nav = h('div', { class: 'p-team-nav' }, prev, next);
  const sync = () => {
    const max = scroller.scrollWidth - scroller.clientWidth;
    const at = Math.abs(scroller.scrollLeft);
    nav.hidden = max < 4;
    prev.disabled = at < 4;
    next.disabled = at > max - 4;
  };
  scroller.addEventListener('scroll', sync, { passive: true });
  requestAnimationFrame(sync);
  addEventListener('resize', sync);
  app.onUnmount(() => removeEventListener('resize', sync));
  return nav;
}
