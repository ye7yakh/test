import { api } from '../api.js';
import { field, h, icon, input, markInvalid } from '../dom.js';
import { errorText, pick, t } from '../i18n.js';

export function loginView(app) {
  const ctx = app.ctx;
  const salon = ctx.salon;
  const phone = input({ type: 'tel', name: 'phone', autocomplete: 'username', inputmode: 'tel', required: true });
  const password = input({ type: 'password', name: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const submit = h('button', { class: 'btn btn-primary btn-block', type: 'submit', text: t('login.submit') });

  const form = h(
    'form',
    { class: 'card stack', novalidate: true },
    field(t('login.phone'), phone),
    field(t('login.password'), password),
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
      if (ctx.kind === 'salon') app.go(app.canManage ? '#/manage' : '#/');
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
    { class: 'page login-wrap' },
    h(
      'div',
      { class: 'login-card' },
      h(
        'div',
        { class: 'login-brand' },
        h('div', { class: 'logo' }, salon?.logo_url ? h('img', { src: salon.logo_url, alt: '' }) : name.charAt(0)),
        h('h1', { text: name }),
        h('p', { class: 'muted', text: salon ? t('login.title') : t('login.platform') }),
      ),
      form,
      h(
        'div',
        { class: 'row between', style: { marginTop: '12px' } },
        salon ? h('a', { class: 'link-btn', href: '#/', text: t('login.back') }) : h('span'),
        h('button', { class: 'link-btn', type: 'button', onclick: () => app.toggleLang() }, icon('globe'), t('app.lang')),
      ),
    ),
  );
}
