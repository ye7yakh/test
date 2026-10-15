// Settings sheet: contact details, password, language, sign out. Every salon is in
// Jordan, so time zone and currency (Amman, JD) are set for them.
import { api } from '../api.js';
import { busy, field, h, icon, input, legalLinks, markInvalid, sheet, switchRow, toast, toastError } from '../dom.js';
import { getLang, t, westernDigits } from '../i18n.js';
import { clearManageCache } from './manage.js';

/** "790000001" → "79 000 0001" (mobile), "65551234" → "6 555 1234" (landline). */
function group(d) {
  if (d.length === 9) return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
  if (d.length === 8) return `${d[0]} ${d.slice(1, 4)} ${d.slice(4)}`;
  return d;
}

/** The stored number without the country code, for the field beside "+962". */
function toLocal(phone, cc) {
  const value = (phone ?? '').trim();
  const compact = value.replace(/[\s()-]/g, '');
  for (const prefix of [`+${cc}`, `00${cc}`]) {
    if (compact.startsWith(prefix)) return group(compact.slice(prefix.length).replace(/\D/g, '').replace(/^0+/, ''));
  }
  return value; // a number from somewhere else stays as it was typed
}

/** What the owner typed, stored the way customers dial it: "+962 79 000 0001". */
function toIntl(local, cc) {
  const raw = westernDigits(local).trim();
  if (!raw || raw.startsWith('+')) return raw;
  if (raw.startsWith('00')) return `+${raw.slice(2)}`;
  const digits = raw.replace(/\D/g, '').replace(/^0+/, '');
  return digits ? `+${cc} ${group(digits)}` : '';
}

/** A floating-label field with an icon at its start. */
function iconField(name, label, control, opts) {
  const el = field(label, control, opts);
  el.classList.add('has-icon');
  el.append(h('span', { class: 'f-icon', 'aria-hidden': 'true' }, icon(name)));
  return el;
}

export function openSettings(store, app, { focusPassword = false } = {}) {
  const s = store.salon;
  const cc = app.ctx.tenant?.calling_code ?? '962';
  const f = {
    phone: input({ name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'tel-national', value: toLocal(s.phone, cc), maxlength: 24 }),
    address: input({ name: 'address', value: s.address, maxlength: 200, autocomplete: 'street-address' }),
    about_ar: h('textarea', { name: 'about_ar', maxlength: 600, rows: 3, dir: 'rtl', text: s.about_ar }),
    about_en: h('textarea', { name: 'about_en', maxlength: 600, rows: 3, dir: 'ltr', text: s.about_en }),
  };
  const initial = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
  const contactDirty = () => Object.entries(f).some(([k, el]) => el.value !== initial[k]);

  // ---- password, behind its own row
  const current = input({ type: 'password', name: 'current', autocomplete: 'current-password' });
  const next = input({ type: 'password', name: 'next', autocomplete: 'new-password' });
  const changePw = h('button', { class: 'btn btn-secondary btn-block', type: 'button' }, icon('lock'), t('settings.password_change'));
  const pwFold = h('div', { class: `fold ${focusPassword ? 'open' : ''}`, id: 'pw-fold' }, h('div', { class: 'fold-inner pw-fields' }, field(t('settings.password_current'), current), field(t('settings.password_next'), next), changePw));
  pwFold.inert = !focusPassword;
  const pwRow = h(
    'button',
    { class: `disclosure ${focusPassword ? 'open' : ''}`, type: 'button', 'aria-expanded': String(focusPassword), 'aria-controls': 'pw-fold' },
    h('div', { class: 'tile' }, icon('key')),
    h('div', { class: 'grow' }, h('div', { class: 'title', text: t('settings.password_change') }), h('div', { class: 'sub', text: t('settings.password_sub') })),
    icon('down', 'chev'),
  );
  const setPwOpen = (open) => {
    pwFold.classList.toggle('open', open);
    pwRow.classList.toggle('open', open);
    pwRow.setAttribute('aria-expanded', String(open));
    pwFold.inert = !open;
  };
  pwRow.addEventListener('click', () => {
    const open = !pwFold.classList.contains('open');
    setPwOpen(open);
    if (open) setTimeout(() => current.focus({ preventScroll: true }), 60);
  });

  // ---- language: switching keeps contact edits (saved first), then redraws
  const langs = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': t('settings.language') },
    [['ar', 'العربية'], ['en', 'English']].map(([code, label]) => {
      const radio = h('input', { type: 'radio', name: 'lang', value: code, checked: getLang() === code });
      radio.addEventListener('change', async () => {
        if (contactDirty()) {
          try {
            await saveContact();
          } catch (err) {
            markInvalid(form, err);
            toastError(err);
            langs.querySelector(`input[value="${getLang()}"]`).checked = true;
            return;
          }
        }
        panel.close();
        app.toggleLang();
      });
      return h('label', null, radio, h('span', { text: label }));
    }),
  );

  // ---- the AI mirror: customers try men's cuts on their own photo before booking
  // (offered only when the platform has an AI image model)
  const mirror = store.options?.tryon_available ? switchRow(t('settings.tryon_on'), t('settings.tryon_sub'), s.tryon === 'on') : null;
  mirror?.input.addEventListener('change', async () => {
    const on = mirror.input.checked;
    try {
      const res = await api('PATCH', '/api/manage/salon', { tryon: on ? 'on' : 'off' });
      store.set({ salon: res.salon });
      toast(t(on ? 'settings.tryon_saved' : 'settings.tryon_saved_off'));
    } catch (err) {
      toastError(err);
      mirror.input.checked = !on;
    }
  });

  const group_ = (title, ...children) => h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: title })), h('div', { class: 'card' }, children));
  const logout = h('button', { class: 'btn btn-ghost btn-sm logout-btn', type: 'button', onclick: () => { panel.close(); clearManageCache(); app.logout(); } }, icon('logout', 'flip-rtl'), t('logout'));
  const form = h(
    'form',
    { novalidate: true, class: 'settings-form', style: { marginTop: '-20px' } },
    group_(
      t('settings.contact'),
      h('div', { class: 'phone-input' }, h('div', { class: 'cc', text: `+${cc}` }), field(t('settings.phone'), f.phone, { optional: true })),
      iconField('pin', t('settings.address'), f.address, { optional: true }),
      iconField('store', t('settings.about'), f.about_ar, { optional: true }),
      iconField('globe', t('settings.about_en'), f.about_en, { optional: true }),
    ),
    group_(
      t('settings.account'),
      h('div', { class: 'row account-row' }, h('div', { class: 'tile' }, icon('user')), h('div', { class: 'grow' }, h('div', { class: 'small muted', text: t('settings.signed_in') }), h('div', { class: 'ltr phone-line', text: app.ctx.user?.phone ?? '' }))),
      pwRow,
      pwFold,
    ),
    mirror ? group_(t('settings.tryon'), mirror.el) : null,
    group_(t('settings.language'), langs),
    h('div', { class: 'settings-end' }, logout, legalLinks('in-sheet')),
  );
  form.addEventListener('submit', (e) => e.preventDefault());

  changePw.addEventListener('click', () => busy(changePw, async () => {
    try {
      await api('POST', '/api/auth/password', { current: current.value, next: next.value });
      current.value = '';
      next.value = '';
      markInvalid(form, null);
      setPwOpen(false);
      // busy() disabled the button and the fold is now inert: focus goes back to the row.
      pwRow.focus({ preventScroll: true });
      toast(t('settings.password_changed'));
      // Their own password now: the temporary-password reminder goes.
      if (app.ctx.user) app.ctx.user.must_change_password = false;
      document.querySelector('.temp-pw')?.remove();
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));

  async function saveContact() {
    const res = await api('PATCH', '/api/manage/salon', {
      phone: toIntl(f.phone.value, cc), address: f.address.value, about_ar: f.about_ar.value, about_en: f.about_en.value,
    });
    store.set({ salon: res.salon });
    for (const [k, el] of Object.entries(f)) initial[k] = el.value;
  }

  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const panel = sheet({ title: t('settings.title'), body: form, actions: [save], tall: true });
  if (focusPassword) {
    requestAnimationFrame(() => {
      current.scrollIntoView({ block: 'center' });
      current.focus({ preventScroll: true });
    });
  }
  save.addEventListener('click', () => busy(save, async () => {
    try {
      await saveContact();
      panel.close();
      toast(t('saved'));
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));
}
