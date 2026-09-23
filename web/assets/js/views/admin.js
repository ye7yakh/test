// Platform owner: every salon on this brand, and creating new ones.
import { api } from '../api.js';
import { busy, clear, field, h, icon, input, markInvalid, sheet, switchEl, toast, toastError } from '../dom.js';
import { pick, t } from '../i18n.js';

function openCreate(app, onCreated) {
  const baseHost = location.host.replace(/^(admin|www)\./, '');
  const f = {
    subdomain: input({ name: 'subdomain', dir: 'ltr', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', maxlength: 32 }),
    name_ar: input({ name: 'name_ar', maxlength: 80 }),
    name_en: input({ name: 'name_en', maxlength: 80, dir: 'ltr' }),
    owner_name: input({ name: 'owner_name', maxlength: 60 }),
    owner_phone: input({ name: 'owner_phone', type: 'tel', inputmode: 'tel' }),
    owner_password: input({ name: 'owner_password', type: 'text', autocomplete: 'off', dir: 'ltr' }),
  };
  const preview = h('span', { class: 'hint ltr', text: `${location.protocol}//….${baseHost}` });
  f.subdomain.addEventListener('input', () => {
    f.subdomain.value = f.subdomain.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    preview.textContent = `${location.protocol}//${f.subdomain.value || '…'}.${baseHost}`;
  });
  const form = h(
    'form',
    { novalidate: true },
    field(t('admin.name_ar'), f.name_ar),
    field(t('admin.name_en'), f.name_en, { optional: true }),
    h('label', { class: 'field' }, h('span', { class: 'label', text: t('admin.subdomain') }), f.subdomain, preview, h('span', { class: 'hint', text: t('admin.subdomain_hint') })),
    field(t('admin.owner_name'), f.owner_name, { optional: true }),
    field(t('admin.owner_phone'), f.owner_phone),
    field(t('admin.owner_password'), f.owner_password, { hint: t('admin.owner_password_hint') }),
  );
  const create = h('button', { class: 'btn btn-primary', type: 'button', text: t('admin.create') });
  const panel = sheet({ title: t('admin.new'), body: form, actions: [create] });
  create.addEventListener('click', () => busy(create, async () => {
    const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
    try {
      await api('POST', '/api/admin/salons', body);
      panel.close();
      toast(t('admin.created'));
      onCreated();
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));
}

export function adminView(app) {
  const list = h('div', null, h('div', { class: 'boot' }, h('div', { class: 'spinner' })));

  async function load() {
    try {
      const { salons } = await api('GET', '/api/admin/salons');
      clear(list, salons.length
        ? h('div', { class: 'card flush' }, h('ul', { class: 'list' }, salons.map((s) => {
            const sw = switchEl(s.active);
            sw.input.setAttribute('aria-label', t('admin.active'));
            sw.input.addEventListener('change', async () => {
              try {
                await api('PATCH', `/api/admin/salons/${s.id}`, { active: sw.input.checked });
                load();
              } catch (err) {
                sw.input.checked = !sw.input.checked;
                toastError(err);
              }
            });
            return h(
              'li',
              { class: 'list-item', style: { cursor: 'default' } },
              h(
                'div',
                { class: 'grow stack', style: { gap: '2px' } },
                h('div', { class: 'row', style: { gap: '8px' } }, h('h3', { text: pick(s, 'name') }), h('span', { class: `badge ${s.active ? 'accent' : ''}`, text: s.active ? t('admin.active') : t('admin.suspended') })),
                h('a', { class: 'meta ltr', href: s.url, target: '_blank', rel: 'noopener', text: s.url.replace(/^https?:\/\//, '') }),
                s.owners.map((o) => h('div', { class: 'meta' }, `${t('admin.owners')}: ${o.name ? `${o.name} · ` : ''}`, h('span', { class: 'ltr', text: o.phone }))),
              ),
              sw.el,
            );
          })))
        : h('p', { class: 'card empty', text: t('admin.empty') }));
    } catch (err) {
      toastError(err);
    }
  }
  load();

  return h(
    'div',
    null,
    h(
      'header',
      { class: 'topbar' },
      h(
        'div',
        { class: 'topbar-inner' },
        h('div', { class: 'title', text: app.ctx.tenant.name }),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('app.lang'), onclick: () => app.toggleLang() }, icon('globe')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('logout'), onclick: () => app.logout() }, icon('logout', 'flip-rtl')),
      ),
    ),
    h(
      'main',
      { class: 'page stack' },
      h('div', { class: 'section-title' }, h('h1', { text: t('admin.title') }), h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openCreate(app, load) }, icon('plus'), t('admin.new'))),
      list,
    ),
  );
}
