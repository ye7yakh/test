// Sign-in for salon owners (on the salon's subdomain) and the platform admin.
import { api } from '../api.js';
import { appIcon, appReady, field, h, icon, input, markInvalid } from '../dom.js';
import { errorText, pick, t } from '../i18n.js';

export function loginView(app) {
  queueMicrotask(appReady);
  const ctx = app.ctx;
  const salon = ctx.salon;
  const phone = input({ type: 'tel', name: 'phone', autocomplete: 'username', inputmode: 'tel', required: true });
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
    h('div', { class: 'phone-input' }, h('div', { class: 'cc', text: `+${ctx.tenant.calling_code}` }), field(t('login.phone'), phone)),
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
      await api('POST', '/api/auth/login', { phone: phone.value, password: password.value });
      await app.reload();
      // Owners land in their own app (/manage), so adding it to the home screen installs the dashboard.
      if (ctx.kind === 'salon' && app.canManage && !app.ownerApp) location.assign('/manage');
      else if (ctx.kind === 'salon') app.go(app.canManage ? '#/manage' : '#/');
    } catch (err) {
      error.textContent = errorText(err);
      error.hidden = false;
      markInvalid(form, err);
    } finally {
      submit.classList.remove('busy');
      submit.disabled = false;
    }
  });

  const name = salon ? pick(salon, 'name') : ctx.tenant.name;
  return h(
    'div',
    { class: 'login' },
    h('div', { class: 'aurora', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h(
      'div',
      { class: 'login-inner' },
      h(
        'div',
        { class: 'login-brand rise' },
        salon ? appIcon(salon.logo_url) : h('div', { class: 'app-icon studio-mark' }, icon('sparkles')),
        h('h1', { text: t('login.welcome') }),
        h('p', { text: salon ? t('login.studio', { name }) : `${name} · ${t('login.platform')}` }),
      ),
      h('div', { class: 'rise', style: { '--i': '1' } }, form),
      h(
        'div',
        { class: 'login-foot rise', style: { '--i': '2' } },
        salon ? h('a', { class: 'link-btn', href: app.ownerApp ? '/' : '#/' }, icon('arrow', 'flip-rtl'), t('login.back')) : h('span'),
        h('button', { class: 'link-btn', type: 'button', onclick: () => app.toggleLang() }, icon('globe'), t('app.lang')),
      ),
    ),
  );
}
