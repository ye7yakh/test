// Platform owner: every salon on this brand, and creating new ones.
import { api } from '../api.js';
import { busy, clear, field, h, icon, input, markInvalid, sheet, stagger, switchEl, toast, toastError } from '../dom.js';
import { pick, t } from '../i18n.js';

function openCreate(onCreated) {
  const baseHost = location.host.replace(/^(admin|www)\./, '');
  const f = {
    name_ar: input({ name: 'name_ar', maxlength: 80 }),
    name_en: input({ name: 'name_en', maxlength: 80, dir: 'ltr' }),
    subdomain: input({ name: 'subdomain', dir: 'ltr', autocapitalize: 'off', autocomplete: 'off', spellcheck: 'false', maxlength: 32 }),
    owner_name: input({ name: 'owner_name', maxlength: 60 }),
    owner_phone: input({ name: 'owner_phone', type: 'tel', inputmode: 'tel' }),
    owner_password: input({ name: 'owner_password', autocomplete: 'off', dir: 'ltr' }),
  };
  const url = h('div', { class: 'url-preview', text: `${location.protocol}//….${baseHost}` });
  f.subdomain.addEventListener('input', () => {
    f.subdomain.value = f.subdomain.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
    url.textContent = `${location.protocol}//${f.subdomain.value || '…'}.${baseHost}`;
  });
  const form = h(
    'form',
    { novalidate: true },
    field(t('admin.name_ar'), f.name_ar),
    field(t('admin.name_en'), f.name_en, { optional: true }),
    h('div', { style: { marginTop: '12px' } }, field(t('admin.subdomain'), f.subdomain, { hint: t('admin.subdomain_hint') }), url),
    h('div', { class: 'f-row', style: { marginTop: '18px' } }, field(t('admin.owner_phone'), f.owner_phone), field(t('admin.owner_name'), f.owner_name, { optional: true })),
    field(t('admin.owner_password'), f.owner_password, { hint: t('admin.owner_password_hint') }),
  );
  form.addEventListener('submit', (e) => e.preventDefault());
  const create = h('button', { class: 'btn btn-primary', type: 'button', text: t('admin.create') });
  const panel = sheet({ title: t('admin.new'), body: form, actions: [create] });
  create.addEventListener('click', () => busy(create, async () => {
    try {
      await api('POST', '/api/admin/salons', Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])));
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
  const body = h('div', null, h('div', { class: 'skel', style: { height: '84px', borderRadius: '22px' } }), h('div', { class: 'skel', style: { height: '240px', marginTop: '12px', borderRadius: '22px' } }));

  async function load() {
    try {
      const { salons } = await api('GET', '/api/admin/salons');
      const active = salons.filter((s) => s.active).length;
      clear(
        body,
        stagger([
          h(
            'div',
            { class: 'stats' },
            [[salons.length, t('admin.total')], [active, t('admin.active')], [salons.length - active, t('admin.suspended')]].map(([n, label]) => h('div', { class: 'card' }, h('b', { class: 'num', text: String(n) }), h('span', { text: label }))),
          ),
          salons.length
            ? h('div', { class: 'card flush', style: { marginTop: '12px' } }, h('ul', { class: 'list' }, salons.map((s) => {
                const sw = switchEl(s.active, t('admin.active'));
                sw.input.addEventListener('change', async () => {
                  try {
                    await api('PATCH', `/api/admin/salons/${s.id}`, { active: sw.input.checked });
                    load();
                  } catch (err) {
                    sw.input.checked = !sw.input.checked;
                    toastError(err);
                  }
                });
                const owner = s.owners[0];
                return h(
                  'li',
                  { class: 'admin-salon' },
                  // Each salon's own app icon, straight from its subdomain.
                  h('div', { class: 'app-icon', style: { background: 'var(--surface-3)' } }, h('img', { src: `${s.url}/icons/icon-192.png`, alt: '', loading: 'lazy', style: { width: '100%', height: '100%' } })),
                  h(
                    'div',
                    { class: 'grow' },
                    h('div', { class: 'row', style: { gap: '8px' } }, h('span', { class: 'name truncate', text: pick(s, 'name') }), s.active ? null : h('span', { class: 'pill off', text: t('admin.suspended') })),
                    h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.url.replace(/^https?:\/\//, '') }),
                    owner ? h('div', { class: 'owner' }, `${t('admin.owner')}: ${owner.name ? `${owner.name} · ` : ''}`, h('span', { class: 'ltr', text: owner.phone })) : null,
                  ),
                  sw.el,
                );
              })))
            : h('div', { class: 'card empty', style: { marginTop: '12px' } }, h('div', { class: 'tile' }, icon('store')), h('p', { text: t('admin.empty') })),
        ]),
      );
    } catch (err) {
      toastError(err);
    }
  }
  load();

  return h(
    'div',
    { class: 'studio admin' },
    h(
      'div',
      { class: 's-main' },
      h(
        'header',
        { class: 's-header' },
        h('div', { class: 'identity' }, h('div', { class: 'app-icon', style: { '--s': '38px' } }, icon('sparkles')), h('div', { class: 'grow' }, h('div', { class: 'name', text: app.ctx.tenant.name }), h('div', { class: 'sub', text: t('login.platform') }))),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('app.lang'), title: t('app.lang'), onclick: () => app.toggleLang() }, icon('globe')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('logout'), title: t('logout'), onclick: () => app.logout() }, icon('logout', 'flip-rtl')),
      ),
      h(
        'main',
        { class: 's-page', style: { paddingBottom: '48px' } },
        h(
          'div',
          { class: 's-head' },
          h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('admin.title') }), h('p', { class: 's-sub', text: t('admin.sub') })),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openCreate(load) }, icon('plus'), t('admin.new')),
        ),
        body,
      ),
    ),
  );
}
