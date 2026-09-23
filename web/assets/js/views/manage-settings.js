// Settings sheet: contact details, password, language, sign out. Every salon is in
// Jordan, so time zone and currency (Amman, JD) are set for them.
import { api } from '../api.js';
import { busy, field, h, icon, input, markInvalid, sheet, toast } from '../dom.js';
import { getLang, t } from '../i18n.js';
import { clearManageCache } from './manage.js';

export function openSettings(store, app) {
  const s = store.salon;
  const f = {
    phone: input({ name: 'phone', type: 'tel', value: s.phone, maxlength: 30 }),
    address: input({ name: 'address', value: s.address, maxlength: 200 }),
    about_ar: h('textarea', { name: 'about_ar', maxlength: 600, rows: 3, text: s.about_ar }),
    about_en: h('textarea', { name: 'about_en', maxlength: 600, rows: 3, dir: 'ltr', text: s.about_en }),
  };

  const current = input({ type: 'password', name: 'current', autocomplete: 'current-password' });
  const next = input({ type: 'password', name: 'next', autocomplete: 'new-password' });
  const changePw = h('button', { class: 'btn btn-secondary btn-block', type: 'button' }, icon('lock'), t('settings.password_change'));

  const langs = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': t('settings.language') },
    [['ar', 'العربية'], ['en', 'English']].map(([code, label]) => {
      const radio = h('input', { type: 'radio', name: 'lang', value: code, checked: getLang() === code });
      radio.addEventListener('change', () => {
        panel.close();
        app.toggleLang();
      });
      return h('label', null, radio, h('span', { text: label }));
    }),
  );

  const group = (title, ...children) => h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: title })), h('div', { class: 'card' }, children));
  const form = h(
    'form',
    { novalidate: true, style: { marginTop: '-20px' } },
    group(t('settings.contact'), field(t('settings.phone'), f.phone, { optional: true }), field(t('settings.address'), f.address, { optional: true }), field(t('settings.about'), f.about_ar, { optional: true }), field(t('settings.about_en'), f.about_en, { optional: true })),
    group(
      t('settings.account'),
      h('div', { class: 'row', style: { marginBottom: '14px' } }, h('div', { class: 'tile' }, icon('user')), h('div', { class: 'grow' }, h('div', { class: 'small muted', text: t('settings.signed_in') }), h('div', { class: 'ltr', style: { fontWeight: '600' }, text: app.ctx.user?.phone ?? '' }))),
      field(t('settings.password_current'), current),
      field(t('settings.password_next'), next),
      h('div', { style: { marginTop: '12px' } }, changePw),
    ),
    group(t('settings.language'), langs),
    h('div', { class: 'section' }, h('button', { class: 'btn btn-danger btn-block', type: 'button', onclick: () => { panel.close(); clearManageCache(); app.logout(); } }, icon('logout', 'flip-rtl'), t('logout'))),
  );
  form.addEventListener('submit', (e) => e.preventDefault());

  changePw.addEventListener('click', () => busy(changePw, async () => {
    try {
      await api('POST', '/api/auth/password', { current: current.value, next: next.value });
      current.value = '';
      next.value = '';
      markInvalid(form, null);
      toast(t('settings.password_changed'));
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));

  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const panel = sheet({ title: t('settings.title'), body: form, actions: [save], tall: true });
  save.addEventListener('click', () => busy(save, async () => {
    try {
      const res = await api('PATCH', '/api/manage/salon', {
        phone: f.phone.value, address: f.address.value, about_ar: f.about_ar.value, about_en: f.about_en.value,
      });
      store.set({ salon: res.salon });
      panel.close();
      toast(t('saved'));
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));
}
