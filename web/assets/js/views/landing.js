// The platform's front door (the bare domain), for salon owners: what their salon
// gets, shown on a phone that cycles through example salons in their own colours,
// and one way to start: a WhatsApp message.
import { appReady, clear, h, icon, tilt } from '../dom.js';
import { fmtPrice, fmtTime, pick, t } from '../i18n.js';
import { homeScreen, miniApp, phone, splashScreen } from '../preview.js';
import { brandVars, reducedMotion } from '../theme.js';
import { waNumber } from './booking.js';

// Keeps a Latin address in one left-to-right piece inside Arabic text.
const ltr = (s) => `\u2066${s}\u2069`;
const ALWAYS_OPEN = Array.from({ length: 7 }, () => [{ open: '00:00', close: '24:00' }]);
const svc = (icon_, name_ar, name_en, duration_min, price) => ({ icon: icon_, name_ar, name_en, duration_min, price, active: true });

// Example salons (made up) the hero phone shows, each in its own colours.
const SAMPLES = [
  {
    sub: 'lamar', name_ar: 'صالون لمار', name_en: 'Lamar Salon', about_ar: 'شعر، مكياج وعناية', about_en: 'Hair, makeup and care',
    primary: '#5b2245', accent: '#e8b4c8', deposit: 5, at: '10:30',
    services: [svc('✂️', 'قص وسشوار', 'Cut and blow-dry', 60, 15), svc('🎨', 'صبغة كاملة', 'Full colour', 120, 45), svc('💄', 'مكياج سهرة', 'Evening makeup', 60, 35)],
  },
  {
    sub: 'barber-house', name_ar: 'بيت الحلاقة', name_en: 'Barber House', about_ar: 'قصّات ولحية على أصولها', about_en: 'Cuts and beards, done right',
    primary: '#1d2b36', accent: '#d4a24c', deposit: 2, at: '18:00',
    services: [svc('✂️', 'قص شعر', 'Haircut', 30, 7), svc('🧔', 'تشذيب لحية', 'Beard trim', 20, 4), svc('💈', 'قص ولحية', 'Cut and beard', 45, 10)],
  },
  {
    sub: 'rana-nails', name_ar: 'أظافر رنا', name_en: 'Rana Nails', about_ar: 'مناكير وبديكير وتركيب', about_en: 'Manicure, pedicure and extensions',
    primary: '#2b2a63', accent: '#8fe3d2', deposit: 5, at: '13:15',
    services: [svc('💅', 'مناكير جل', 'Gel manicure', 45, 12), svc('✨', 'بديكير', 'Pedicure', 50, 15), svc('💎', 'تركيب أظافر', 'Nail extensions', 90, 25)],
  },
];

function sampleSalon(s) {
  return {
    name_ar: s.name_ar, name_en: s.name_en, about_ar: s.about_ar, about_en: s.about_en,
    logo_url: null, cover_url: null, icon_url: null, icon_bg: 'auto',
    page_theme: 'night', currency: 'JOD', timezone: 'Asia/Amman',
  };
}

/** The example salon's colours, on the element that holds its phone. */
function paint(el, s) {
  for (const [k, v] of Object.entries(brandVars(s.primary, s.accent))) el.style.setProperty(k, v);
}

/** Reveals sections as they scroll into view (once). */
function watchReveal(root) {
  const items = [...root.querySelectorAll('.l-reveal')];
  if (reducedMotion() || !('IntersectionObserver' in window)) {
    items.forEach((x) => x.classList.add('in'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('in');
      io.unobserve(e.target);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  items.forEach((x) => io.observe(x));
}

export function landingView(app) {
  const tenant = app.ctx.tenant;
  const brand = pick(tenant, 'name');
  const domain = tenant.domain;
  const wa = tenant.contact_phone ? `https://wa.me/${waNumber(tenant.contact_phone)}?text=${encodeURIComponent(t('land.wa_text'))}` : null;
  const timers = [];
  app.onUnmount(() => timers.forEach(clearInterval));

  const cta = (cls = '') => (wa
    ? h('a', { class: `btn btn-primary sheen ${cls}`, href: wa, target: '_blank', rel: 'noopener' }, icon('chat'), t('land.cta'))
    : null);

  // ---- hero: the phone, the example salon's link above it, live notifications beside it
  let index = 0;
  const stage = h('div', { class: 'l-stage' });
  const screen = h('div', { class: 'l-screen' });
  // Decoration around the phone: screen readers get the same story from the text.
  const urlChip = h('div', { class: 'l-chip l-url ltr', 'aria-hidden': 'true' }, icon('link'), h('span'));
  const bookingChip = h('div', { class: 'l-chip l-note', 'aria-hidden': 'true' }, h('div', { class: 'tile' }, icon('calendar')), h('div', null, h('b', { text: t('land.chip_booking') }), h('span')));
  const paidChip = h('div', { class: 'l-chip l-note paid', 'aria-hidden': 'true' }, h('div', { class: 'tile' }, icon('checkCircle')), h('div', null, h('b', { text: t('land.chip_paid') }), h('span')));

  function show(i, animate) {
    const s = SAMPLES[i];
    const salon = sampleSalon(s);
    paint(stage, s);
    const swap = () => {
      clear(screen, miniApp({ salon, services: s.services, staff: [], hours: ALWAYS_OPEN }));
      urlChip.lastChild.textContent = `${s.sub}.${domain}`;
      bookingChip.querySelector('span').textContent = `${pick(s.services[0], 'name')} · ${fmtTime(s.at)}`;
      paidChip.querySelector('span').textContent = `${t('land.cliq')} · ${fmtPrice(s.deposit, 'JOD')}`;
    };
    if (!animate) return swap();
    stage.classList.add('swap');
    setTimeout(() => {
      swap();
      stage.classList.remove('swap');
    }, 380);
  }
  show(0, false);
  if (!reducedMotion()) {
    timers.push(setInterval(() => {
      if (document.hidden) return;
      index = (index + 1) % SAMPLES.length;
      show(index, true);
    }, 4800));
  }
  // The notifications ride on the phone (and tilt with it), placed over its quiet areas.
  stage.append(tilt(h('div', { class: 'l-phone' }, phone(screen, { scale: 1 }), bookingChip, paidChip, urlChip)));

  const hero = h(
    'section',
    { class: 'l-hero' },
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('div', { class: 'l-grid', 'aria-hidden': 'true' }),
    h(
      'div',
      { class: 'l-hero-inner' },
      h(
        'div',
        { class: 'l-copy' },
        h('div', { class: 'l-eyebrow rise' }, h('i', { class: 'dot' }), t('land.for')),
        h('h1', { class: 'l-title rise', style: { '--i': '1' } }, h('span', { text: t('land.title_1') }), h('span', { class: 'shine', text: t('land.title_2') })),
        h('p', { class: 'l-sub rise', style: { '--i': '2' }, text: t('land.sub') }),
        h(
          'div',
          { class: 'l-actions rise', style: { '--i': '3' } },
          cta('l-cta'),
          h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => view.querySelector('#how')?.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth' }) }, t('land.how_btn')),
        ),
      ),
      stage,
    ),
  );

  // ---- what a salon gets
  const FEATURES = [
    ['phone', 'app'], ['calendar', 'book'], ['wallet', 'cliq'], ['palette', 'brand'], ['sliders', 'dash'], ['link', 'link'],
  ];
  const features = h(
    'section',
    { class: 'l-section' },
    h('div', { class: 'l-head l-reveal' }, h('h2', { text: t('land.features') }), h('p', { text: t('land.features_sub') })),
    h('div', { class: 'l-features' }, FEATURES.map(([ic, key], i) => h(
      'article',
      { class: 'l-feature l-reveal', style: { '--i': String(i % 3) } },
      h('div', { class: 'tile' }, icon(ic)),
      h('h3', { text: t(`land.f_${key}`) }),
      h('p', { text: t(`land.f_${key}_sub`) }),
    ))),
  );

  // ---- the app on a customer's phone: icon, launch screen, booking page
  const showSample = SAMPLES[0];
  const showSalon = sampleSalon(showSample);
  const trio = h(
    'div',
    { class: 'l-trio' },
    [
      ['show_home', homeScreen({ salon: showSalon })],
      ['show_splash', splashScreen({ salon: showSalon })],
      ['show_app', miniApp({ salon: showSalon, services: showSample.services, staff: [], hours: ALWAYS_OPEN })],
    ].map(([key, content], i) => h('figure', { class: 'l-reveal', style: { '--i': String(i) } }, phone(content, { scale: 0.62 }), h('figcaption', { text: t(`land.${key}`) }))),
  );
  paint(trio, showSample);
  const showcase = h(
    'section',
    { class: 'l-section l-show' },
    h('div', { class: 'l-head l-reveal' }, h('h2', { text: t('land.show_title') }), h('p', { text: t('land.show_sub') })),
    trio,
  );

  // ---- the salon's own link, typed out
  const typed = h('span', { class: 'typed' });
  const bar = h(
    'div',
    { class: 'l-bar ltr l-reveal', 'aria-hidden': 'true' },
    h('span', { class: 'lock' }, icon('lock')),
    h('span', { class: 'scheme', text: 'https://' }),
    typed,
    h('span', { class: 'caret', 'aria-hidden': 'true' }),
    h('span', { class: 'domain', text: `.${domain}` }),
  );
  if (reducedMotion()) {
    typed.textContent = SAMPLES[0].sub;
  } else {
    let word = 0;
    let len = 0;
    let dir = 1;
    let hold = 0;
    timers.push(setInterval(() => {
      const target = SAMPLES[word].sub;
      if (hold > 0) {
        hold--;
        return;
      }
      len += dir;
      if (len >= target.length) {
        len = target.length;
        dir = -1;
        hold = 18;
      } else if (len <= 0) {
        len = 0;
        dir = 1;
        word = (word + 1) % SAMPLES.length;
        hold = 3;
      }
      typed.textContent = target.slice(0, len);
    }, 90));
  }
  const link = h(
    'section',
    { class: 'l-section l-link' },
    h('div', { class: 'l-head l-reveal' }, h('h2', { text: t('land.link_title') }), h('p', { text: t('land.link_sub', { domain: ltr(`.${domain}`) }) })),
    bar,
  );

  // ---- how it starts
  const steps = h(
    'section',
    { class: 'l-section', id: 'how' },
    h('div', { class: 'l-head l-reveal' }, h('h2', { text: t('land.steps') })),
    h('ol', { class: 'l-steps' }, [1, 2, 3].map((n) => h(
      'li',
      { class: 'l-reveal', style: { '--i': String(n - 1) } },
      h('span', { class: 'n num', text: String(n) }),
      h('h3', { text: t(`land.s${n}`) }),
      h('p', { text: t(`land.s${n}_sub`) }),
    ))),
  );

  const final = h(
    'section',
    { class: 'l-final l-reveal' },
    h('div', { class: 'l-final-glow', 'aria-hidden': 'true' }),
    h('h2', { text: t('land.final') }),
    h('p', { text: wa ? t('land.final_sub') : t('land.final_soon') }),
    cta('l-cta'),
  );

  const top = h(
    'header',
    { class: 'l-top' },
    h('div', { class: 'l-brand' }, h('div', { class: 'app-icon studio-mark' }, icon('sparkles')), h('span', { text: brand })),
    h('div', { class: 'grow' }),
    h('button', { class: 'link-btn', type: 'button', onclick: () => app.toggleLang() }, icon('globe'), t('app.lang')),
    wa ? h('a', { class: 'btn btn-secondary btn-sm', href: wa, target: '_blank', rel: 'noopener' }, icon('chat'), t('land.contact')) : null,
  );

  const view = h(
    'div',
    { class: 'land' },
    top,
    hero,
    h('main', null, features, showcase, link, steps, final),
    h(
      'footer',
      { class: 'l-foot' },
      h('div', { class: 'l-brand small' }, h('div', { class: 'app-icon studio-mark' }, icon('sparkles')), h('span', { text: brand })),
      h('p', { class: 'faint', text: t('land.owner_hint', { path: ltr('/admin') }) }),
      h('p', { class: 'faint', text: `© ${new Date().getFullYear()} ${brand}` }),
    ),
  );
  requestAnimationFrame(() => {
    watchReveal(view);
    appReady();
  });
  return view;
}
