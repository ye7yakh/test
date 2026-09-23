// Salon tab: details, look (logo, colours, team photo style), region, account.
import { api, pickImage, prepareImage } from '../api.js';
import { busy, clear, field, h, icon, input, markInvalid, toast } from '../dom.js';
import { t } from '../i18n.js';
import { applyColors } from '../theme.js';

// Ready palettes: [primary, accent].
const PALETTES = [
  ['#1f2a37', '#c8a15a'],
  ['#111111', '#d4af37'],
  ['#0f3d3e', '#e2b714'],
  ['#5b1a2a', '#e8c4b8'],
  ['#1d3557', '#e76f51'],
  ['#2d2a26', '#9bb89a'],
  ['#ffffff', '#1f2a37'],
];

const TIMEZONES = [
  'Asia/Riyadh', 'Asia/Dubai', 'Asia/Qatar', 'Asia/Kuwait', 'Asia/Bahrain', 'Asia/Muscat', 'Asia/Amman',
  'Asia/Baghdad', 'Asia/Beirut', 'Asia/Damascus', 'Asia/Hebron', 'Africa/Cairo', 'Africa/Casablanca',
  'Africa/Tunis', 'Africa/Algiers', 'Europe/Istanbul', 'Europe/London', 'UTC',
];

// Rough in-browser previews of each style; the server does the real rendering.
const STYLE_FILTERS = {
  natural: 'contrast(1.05) saturate(1.05)',
  warm: 'sepia(.25) saturate(1.15) contrast(1.05)',
  mono: 'grayscale(1) contrast(1.15)',
  brand: 'grayscale(1) contrast(1.1)',
};

function saveButton() {
  return h('button', { class: 'btn btn-primary', type: 'submit', text: t('save') });
}

function infoCard(store) {
  const s = store.salon;
  const f = {
    name_ar: input({ name: 'name_ar', value: s.name_ar, maxlength: 80, required: true }),
    name_en: input({ name: 'name_en', value: s.name_en, maxlength: 80, dir: 'ltr' }),
    about_ar: h('textarea', { class: 'input', name: 'about_ar', maxlength: 600, rows: 2, text: s.about_ar }),
    about_en: h('textarea', { class: 'input', name: 'about_en', maxlength: 600, rows: 2, dir: 'ltr', text: s.about_en }),
    phone: input({ name: 'phone', type: 'tel', value: s.phone, maxlength: 30 }),
    address: input({ name: 'address', value: s.address, maxlength: 200 }),
  };
  const submit = saveButton();
  const form = h(
    'form',
    { class: 'card', novalidate: true },
    h('h2', { text: t('salon.info') }),
    field(t('salon.name_ar'), f.name_ar),
    field(t('salon.name_en'), f.name_en, { optional: true }),
    field(t('salon.about_ar'), f.about_ar, { optional: true }),
    field(t('salon.about_en'), f.about_en, { optional: true }),
    field(t('salon.phone'), f.phone, { optional: true }),
    field(t('salon.address'), f.address, { optional: true }),
    h('div', { style: { marginTop: '16px' } }, submit),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(submit, async () => {
      const body = Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value]));
      try {
        const res = await api('PATCH', '/api/manage/salon', body);
        store.set({ salon: res.salon });
        markInvalid(form, null);
        toast(t('saved'));
      } catch (err) {
        markInvalid(form, err);
        throw err;
      }
    });
  });
  return form;
}

function logoRow(store) {
  const box = h('div', { class: 'logo-box' });
  const actions = h('div', { class: 'stack grow' });
  const render = () => {
    const url = store.salon.logo_url;
    clear(box, url ? h('img', { src: url, alt: t('salon.logo') }) : icon('camera'));
    const upload = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('camera'), url ? t('salon.logo_change') : t('salon.logo_upload'));
    upload.addEventListener('click', async () => {
      const file = await pickImage();
      if (!file) return;
      busy(upload, async () => {
        const res = await api('PUT', '/api/manage/salon/logo', await prepareImage(file, 1024));
        store.set({ salon: res.salon });
        render();
      });
    });
    const remove = url
      ? h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: t('salon.logo_remove') })
      : null;
    remove?.addEventListener('click', () => busy(remove, async () => {
      const res = await api('DELETE', '/api/manage/salon/logo');
      store.set({ salon: res.salon });
      render();
    }));
    clear(actions, h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } }, upload, remove), h('p', { class: 'muted small', text: t('salon.logo_hint') }));
  };
  render();
  return h('div', { class: 'field' }, h('span', { class: 'label', text: t('salon.logo') }), h('div', { class: 'row' }, box, actions));
}

function lookCard(store) {
  const s = store.salon;
  let primary = s.color_primary;
  let accent = s.color_accent;
  let style = s.photo_style;

  const primaryInput = h('input', { type: 'color', value: primary, 'aria-label': t('salon.color_primary') });
  const accentInput = h('input', { type: 'color', value: accent, 'aria-label': t('salon.color_accent') });
  const primaryHex = h('span', { class: 'ltr small muted', text: primary });
  const accentHex = h('span', { class: 'ltr small muted', text: accent });

  const swatches = PALETTES.map(([p, a]) => h(
    'button',
    { class: 'swatch', type: 'button', 'aria-label': `${p} ${a}`, onclick: () => setColors(p, a) },
    h('span', { style: { background: p } }),
    h('span', { style: { background: a } }),
  ));

  function setColors(p, a) {
    primary = p;
    accent = a;
    primaryInput.value = p;
    accentInput.value = a;
    primaryHex.textContent = p;
    accentHex.textContent = a;
    swatches.forEach((sw, i) => sw.classList.toggle('selected', PALETTES[i][0] === p && PALETTES[i][1] === a));
    applyColors(p, a); // live preview across the dashboard
    styleTiles.forEach((tile) => tile.refresh());
  }
  primaryInput.addEventListener('input', () => setColors(primaryInput.value, accent));
  accentInput.addEventListener('input', () => setColors(primary, accentInput.value));

  // Style picker, previewed on the first team photo we have.
  const sample = store.staff.find((m) => m.original_photo_url)?.original_photo_url;
  const styleTiles = store.options.photo_styles.map((id) => {
    const radio = h('input', { type: 'radio', name: 'photo_style', value: id, checked: id === style });
    radio.addEventListener('change', () => { style = id; });
    const img = sample ? h('img', { src: sample, alt: '' }) : null;
    const tint = id === 'brand' ? h('div', { style: { position: 'absolute', inset: '0', mixBlendMode: 'color', opacity: '.55' } }) : null;
    const portrait = h('div', { class: 'portrait' }, img ?? h('div', { class: 'placeholder' }, icon('user')), tint);
    const tile = h('label', { class: 'style-option' }, radio, portrait, h('span', { text: t(`style.${id}`) }));
    tile.refresh = () => {
      if (img) img.style.filter = STYLE_FILTERS[id];
      if (tint) tint.style.background = accent;
    };
    tile.refresh();
    return tile;
  });

  const submit = saveButton();
  const form = h(
    'form',
    { class: 'card', novalidate: true },
    h('h2', { text: t('salon.look') }),
    h('p', { class: 'card-help', text: t('salon.look_help') }),
    logoRow(store),
    h('div', { class: 'field' }, h('span', { class: 'label', text: t('salon.palettes') }), h('div', { class: 'swatches' }, swatches)),
    h(
      'div',
      { class: 'field-row', style: { marginTop: '14px' } },
      h('div', { class: 'field' }, h('span', { class: 'label', text: t('salon.color_primary') }), h('div', { class: 'color-field' }, primaryInput, primaryHex)),
      h('div', { class: 'field' }, h('span', { class: 'label', text: t('salon.color_accent') }), h('div', { class: 'color-field' }, accentInput, accentHex)),
    ),
    h(
      'div',
      { class: 'field', style: { marginTop: '18px' } },
      h('span', { class: 'label', text: t('salon.photo_style') }),
      h('p', { class: 'card-help', style: { margin: '0 0 10px' }, text: t('salon.photo_style_help') }),
      h('div', { class: 'style-grid' }, styleTiles),
    ),
    h('div', { style: { marginTop: '16px' } }, submit),
  );
  setColors(primary, accent);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(submit, async () => {
      const styleChanged = style !== store.salon.photo_style || (style === 'brand' && accent !== store.salon.color_accent);
      const res = await api('PATCH', '/api/manage/salon', { color_primary: primary, color_accent: accent, photo_style: style });
      store.set({ salon: res.salon });
      // Team photos were re-rendered in the new style.
      if (styleChanged) store.set({ staff: (await api('GET', '/api/manage/staff')).staff });
      toast(t('saved'));
    });
  });
  return form;
}

function regionCard(store) {
  const s = store.salon;
  const zones = TIMEZONES.includes(s.timezone) ? TIMEZONES : [s.timezone, ...TIMEZONES];
  const tz = h('select', { class: 'input', name: 'timezone' }, zones.map((z) => h('option', { value: z, text: z, selected: z === s.timezone })));
  const currency = h('select', { class: 'input', name: 'currency' }, Object.keys(store.options.currencies).map((c) => h('option', { value: c, text: c, selected: c === s.currency })));
  const submit = saveButton();
  const form = h(
    'form',
    { class: 'card', novalidate: true },
    h('h2', { text: t('salon.region') }),
    h('div', { class: 'field-row' }, field(t('salon.timezone'), tz), field(t('salon.currency'), currency)),
    h('div', { style: { marginTop: '16px' } }, submit),
  );
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(submit, async () => {
      const res = await api('PATCH', '/api/manage/salon', { timezone: tz.value, currency: currency.value });
      store.set({ salon: res.salon });
      toast(t('saved'));
    });
  });
  return form;
}

function accountCard() {
  const current = input({ type: 'password', name: 'current', autocomplete: 'current-password' });
  const next = input({ type: 'password', name: 'next', autocomplete: 'new-password', minlength: 8 });
  const submit = h('button', { class: 'btn btn-ghost', type: 'submit', text: t('salon.password_change') });
  const form = h('form', { class: 'card', novalidate: true }, h('h2', { text: t('salon.account') }), field(t('salon.password_current'), current), field(t('salon.password_next'), next), h('div', { style: { marginTop: '16px' } }, submit));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    busy(submit, async () => {
      try {
        await api('POST', '/api/auth/password', { current: current.value, next: next.value });
        current.value = '';
        next.value = '';
        markInvalid(form, null);
        toast(t('salon.password_changed'));
      } catch (err) {
        markInvalid(form, err);
        throw err;
      }
    });
  });
  return form;
}

export function salonTab(store) {
  return h('div', { class: 'stack-lg' }, infoCard(store), lookCard(store), regionCard(store), accountCard());
}
