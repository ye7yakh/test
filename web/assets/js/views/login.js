// Sign-in for salon owners (on the salon's subdomain) and the platform admin. On a
// wide screen the form shares the room with a showcase: on a salon's link, the
// salon's own app in its colours (what the owner is about to run); on the
// platform's dashboard, the constellation of salons it serves.
import { api } from '../api.js';
import { appIcon, appReady, clear, field, h, icon, input, legalLinks, markInvalid, scissorsMark } from '../dom.js';
import { errorText, getLang, iso, pick, t, westernDigits } from '../i18n.js';
import { miniApp, phone } from '../preview.js';
import { waNumber } from './booking.js';

const WIDE = '(min-width: 1024px)';
// Direction marks and isolates ride along when a number is copied out of a WhatsApp message.
const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g;

/** The salon's app as its customers see it, drawn from its live page data. */
function salonShowcase(salon) {
  const name = pick(salon, 'name');
  const stage = h('div', { class: 'ls-stage', 'aria-hidden': 'true' }, h('div', { class: 'ls-ring' }), h('div', { class: 'ls-phone ls-wait' }, phone(h('div', { class: 'ls-blank' }), { scale: 0.82 })));
  const panel = h(
    'aside',
    { class: 'login-show salon' },
    stage,
    h('div', { class: 'ls-caption' }, h('h2', { text: t('login.showcase_salon', { name }) }), h('p', { text: t('login.showcase_salon_sub') })),
  );
  let started = false;
  const load = () => {
    if (started) return;
    started = true;
    api('GET', '/api/public/salon')
      .then((data) => {
        const holder = stage.querySelector('.ls-phone');
        clear(holder, phone(miniApp(data), { scale: 0.82 }));
        holder.classList.remove('ls-wait');
      })
      .catch(() => {});
  };
  // Phones never see the panel, so they never fetch it.
  const wide = matchMedia(WIDE);
  if (wide.matches) load();
  else wide.addEventListener('change', (e) => e.matches && load(), { once: true });
  return panel;
}

/** The platform's dashboard: its mark at the centre, salons in orbit, bookings rising. */
function platformShowcase() {
  const tile = (i) => h('span', { class: `ls-sat s${i}` }, h('span', { class: 'app-icon' }, scissorsMark()));
  const bars = [32, 46, 28, 58, 40, 72, 52, 86, 64, 94, 78, 100];
  return h(
    'aside',
    { class: 'login-show platform' },
    h(
      'div',
      { class: 'ls-orbit', 'aria-hidden': 'true' },
      h('i', { class: 'orb r1' }),
      h('i', { class: 'orb r2' }),
      h('i', { class: 'orb r3' }),
      h('div', { class: 'ls-spin a' }, tile(1), tile(2)),
      h('div', { class: 'ls-spin b' }, tile(3), tile(4), tile(5)),
      h('div', { class: 'ls-core app-icon studio-mark' }, icon('sparkles')),
      h(
        'div',
        { class: 'ls-board' },
        h('div', { class: 'ls-board-top' }, h('i'), h('i'), h('b')),
        h('div', { class: 'ls-bars' }, bars.map((v, i) => h('i', { style: { '--v': String(v / 100), '--i': String(i) } }))),
      ),
    ),
    h('div', { class: 'ls-caption' }, h('h2', { text: t('admin.dash_title') }), h('p', { text: t('login.showcase_platform') })),
  );
}

export function loginView(app) {
  queueMicrotask(appReady);
  const ctx = app.ctx;
  const salon = ctx.salon;
  const phoneInput = input({ type: 'tel', name: 'phone', autocomplete: 'username', inputmode: 'tel', required: true });
  const password = input({ type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const reveal = h('button', { class: 'pw-toggle', type: 'button', 'aria-label': t('login.show'), 'aria-pressed': 'false' }, icon('eye'));
  reveal.addEventListener('click', () => {
    const show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    reveal.setAttribute('aria-pressed', String(show));
    reveal.replaceChildren(icon(show ? 'eyeOff' : 'eye'));
  });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: t('login.submit') });

  const pwField = field(t('login.password'), password);
  pwField.classList.add('has-toggle');
  pwField.append(reveal);

  const form = h(
    'form',
    { class: 'card', novalidate: true },
    h('div', { class: 'phone-input' }, h('div', { class: 'cc', text: `+${ctx.tenant.calling_code}` }), field(t('login.phone'), phoneInput)),
    h('div', { style: { marginTop: '12px' } }, pwField),
    error,
    submit,
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    submit.classList.add('busy');
    submit.disabled = true;
    try {
      await api('POST', '/api/auth/login', { phone: phoneInput.value.replace(BIDI, ''), password: password.value });
      await app.reload();
      // Owners land on their dashboard (/admin), the app their phone installs.
      if (ctx.kind === 'salon' && app.canManage) app.go('/admin', { replace: true });
      else if (ctx.kind === 'salon') location.assign('/');
    } catch (err) {
      error.textContent = errorText(err);
      error.hidden = false;
      markInvalid(form, err);
    } finally {
      submit.classList.remove('busy');
      submit.disabled = false;
    }
  });

  const name = pick(salon ?? ctx.tenant, 'name');
  // Owners get their passwords from the platform: a forgotten one is a WhatsApp
  // message to it, with the salon and the number already filled in.
  const contact = ctx.tenant.contact_phone;
  let forgot = null;
  if (salon && contact) {
    forgot = h('a', { class: 'link-btn forgot', target: '_blank', rel: 'noopener' }, icon('key'), t('login.forgot'));
    const sync = () => {
      // The number as the server reads it (+9627…), so the platform finds the owner by it.
      const cc = ctx.tenant.calling_code;
      let d = westernDigits(phoneInput.value).replace(/[^\d+]/g, '');
      if (d.startsWith('00')) d = `+${d.slice(2)}`;
      else if (d.startsWith('0')) d = `+${cc}${d.slice(1)}`;
      else if (d && !d.startsWith('+')) d = `+${cc}${d}`;
      // Isolated left to right: inside the Arabic message "+962…" would otherwise read "…962+".
      const text = t('login.forgot_wa', { salon: name, phone: d ? `\u2066${d}\u2069` : '—' });
      forgot.href = `https://wa.me/${waNumber(contact)}?text=${encodeURIComponent(text)}`;
    };
    sync();
    phoneInput.addEventListener('input', sync);
  }

  const show = salon ? salonShowcase(salon) : platformShowcase();
  return h(
    'div',
    { class: 'login has-show' },
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h(
      'div',
      { class: 'login-grid' },
      h(
        'main',
        { class: 'login-inner' },
        h(
          'div',
          { class: 'login-brand rise' },
          salon ? appIcon(salon.logo_url) : h('div', { class: 'app-icon studio-mark' }, icon('sparkles')),
          h('h1', { text: t('login.welcome') }),
          h('p', { text: salon ? t('login.studio', { name: iso(name) }) : `${name} · ${t('login.platform')}` }),
        ),
        h('div', { class: 'rise', style: { '--i': '1' } }, form),
        // A barber's password comes from his salon's owner, not the platform.
        salon ? h('div', { class: 'login-help rise', style: { '--i': '2' } }, forgot, h('p', { class: 'team-hint', text: t('login.team_hint') })) : null,
        h(
          'div',
          { class: 'login-foot rise', style: { '--i': '2' } },
          salon ? h('a', { class: 'link-btn', href: '/' }, icon('arrow', 'flip-rtl'), t('login.back')) : null,
          h('button', { class: 'link-btn', type: 'button', onclick: () => app.toggleLang() }, icon('globe'), h('span', { lang: getLang() === 'ar' ? 'en' : 'ar', text: t('app.lang') })),
        ),
        h('div', { class: 'login-legal rise', style: { '--i': '3' } }, legalLinks()),
      ),
      show,
    ),
  );
}
