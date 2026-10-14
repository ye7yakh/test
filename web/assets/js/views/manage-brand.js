// Brand studio: name, logo, colours and the team photo style, with the salon's app
// previewed live while the owner edits. Nothing is saved until they press save.
import { api, pickImage, prepareImage } from '../api.js';
import { appIcon, busy, clear, field, h, icon, input, markInvalid, savebar, stagger, toast } from '../dom.js';
import { t } from '../i18n.js';
import { homeScreen, miniApp, phone } from '../preview.js';
import { PALETTES } from '../templates.js';
import { applyColors } from '../theme.js';

const KEYS = ['name_ar', 'name_en', 'color_primary', 'color_accent', 'photo_style'];

// Rough in-browser previews of each style; the server does the real rendering.
const STYLE_FILTERS = {
  natural: 'contrast(1.05) saturate(1.08)',
  warm: 'sepia(.28) saturate(1.2) contrast(1.05)',
  mono: 'grayscale(1) contrast(1.2)',
  brand: 'grayscale(1) contrast(1.15)',
};

function stage(store) {
  const slides = [
    { id: 'app', caption: t('brand.slide_app'), screen: () => miniApp(store.previewState()) },
    { id: 'home', caption: t('brand.slide_home'), screen: () => homeScreen(store.previewState()) },
  ];
  const holders = slides.map(() => h('div'));
  const track = h('div', { class: 'stage-track' }, slides.map((s, i) => h('div', { class: 'stage-slide' }, holders[i], h('div', { class: 'caption', text: s.caption }))));
  const dots = slides.map((s, i) => h('button', { type: 'button', class: i === 0 ? 'on' : '', 'aria-label': s.caption, onclick: () => track.children[i].scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }) }));
  track.addEventListener('scroll', () => {
    const i = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    dots.forEach((d, j) => d.classList.toggle('on', i === j));
  }, { passive: true });
  const render = () => slides.forEach((s, i) => clear(holders[i], phone(s.screen(), { scale: 0.62 })));
  render();
  return { el: h('section', { class: 'stage brand-stage' }, track, h('div', { class: 'stage-dots' }, dots)), render };
}

export function brandPage(store, app) {
  const saved = () => Object.fromEntries(KEYS.map((k) => [k, store.salon[k]]));
  let draft = saved();
  const dirty = () => KEYS.some((k) => draft[k] !== store.salon[k]);

  const bar = savebar({ onSave: save, onDiscard: discard });
  app.onUnmount(() => {
    bar.remove();
    store.preview(null);
    applyColors(store.salon.color_primary, store.salon.color_accent);
  });

  const preview = stage(store);

  // ---- name
  const nameAr = input({ name: 'name_ar', value: draft.name_ar, maxlength: 80 });
  const nameEn = input({ name: 'name_en', value: draft.name_en, maxlength: 80, dir: 'ltr' });
  nameAr.addEventListener('input', () => change({ name_ar: nameAr.value }));
  nameEn.addEventListener('input', () => change({ name_en: nameEn.value }));

  // ---- logo (saved straight away: it is a file, not a draft)
  const logoBox = h('div', { class: 'logo-drop' });
  function renderLogo() {
    const url = store.salon.logo_url;
    const tile = url ? appIcon(url) : h('div', { class: 'app-icon empty-logo' }, icon('image'));
    const upload = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('camera'), url ? t('brand.logo_change') : t('brand.logo_upload'));
    const choose = async () => {
      const file = await pickImage();
      if (!file) return;
      await busy(upload, async () => {
        const res = await api('PUT', '/api/manage/salon/logo', await prepareImage(file, 1024));
        store.set({ salon: { ...res.salon } });
        renderLogo();
        preview.render();
        toast(t('saved'));
      });
    };
    upload.addEventListener('click', choose);
    tile.addEventListener('click', choose);
    const remove = url ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('brand.logo_remove') }) : null;
    remove?.addEventListener('click', () => busy(remove, async () => {
      const res = await api('DELETE', '/api/manage/salon/logo');
      store.set({ salon: { ...res.salon } });
      renderLogo();
      preview.render();
    }));
    clear(logoBox, tile, h('div', { class: 'grow stack-sm' }, h('div', { class: 'row wrap', style: { gap: '8px' } }, upload, remove), h('div', { class: 'small faint', text: t('brand.logo_hint') })));
  }
  renderLogo();

  // ---- colours
  const palettes = PALETTES.map(([id, primary, accent]) => h(
    'button',
    { class: 'palette', type: 'button', 'data-id': id, onclick: () => change({ color_primary: primary, color_accent: accent }) },
    h('div', { class: 'sw', style: { background: primary } }, h('i', { style: { background: accent } })),
    h('span', { class: 'nm', text: t(`pal.${id}`) }),
  ));
  const colorRow = (key, title, sub) => {
    const swatch = h('div', { class: 'sw' });
    const picker = h('input', { type: 'color', 'aria-label': title });
    const hex = h('span', { class: 'hex' });
    picker.addEventListener('input', () => change({ [key]: picker.value }));
    const row = h('label', { class: 'color-row' }, h('div', { class: 'sw-wrap', style: { position: 'relative' } }, swatch, picker), h('div', { class: 'grow' }, h('div', { style: { fontWeight: '500' }, text: title }), h('div', { class: 'small muted', text: sub })), hex);
    row.refresh = () => {
      swatch.style.background = draft[key];
      picker.value = draft[key];
      hex.textContent = draft[key];
    };
    return row;
  };
  const primaryRow = colorRow('color_primary', t('brand.primary'), t('brand.primary_sub'));
  const accentRow = colorRow('color_accent', t('brand.accent'), t('brand.accent_sub'));

  // ---- photo style, previewed on the first team photo there is
  const sample = store.staff.find((m) => m.original_photo_url)?.original_photo_url;
  const styleCards = store.options.photo_styles.map((id) => {
    const radio = h('input', { type: 'radio', name: 'photo_style', value: id, checked: id === draft.photo_style });
    radio.addEventListener('change', () => change({ photo_style: id }));
    const img = sample ? h('img', { src: sample, alt: '', style: { filter: STYLE_FILTERS[id] } }) : null;
    const tint = id === 'brand' ? h('div', { class: 'tint' }) : null;
    const card = h('label', { class: 'style-card' }, radio, h('div', { class: 'portrait' }, img ?? h('div', { class: 'placeholder' }, icon('user')), tint), h('span', { class: 'nm', text: t(`style.${id}`) }));
    card.refresh = () => {
      radio.checked = draft.photo_style === id;
      if (tint) tint.style.background = draft.color_accent;
    };
    return card;
  });

  function refreshControls() {
    palettes.forEach((p, i) => p.classList.toggle('on', PALETTES[i][1] === draft.color_primary && PALETTES[i][2] === draft.color_accent));
    primaryRow.refresh();
    accentRow.refresh();
    styleCards.forEach((c) => c.refresh());
  }

  function change(partial) {
    draft = { ...draft, ...partial };
    applyColors(draft.color_primary, draft.color_accent);
    store.preview(draft);
    preview.render();
    refreshControls();
    bar.toggle(dirty());
  }

  async function save() {
    const styleChanged = draft.photo_style !== store.salon.photo_style || (draft.photo_style === 'brand' && draft.color_accent !== store.salon.color_accent);
    try {
      const res = await api('PATCH', '/api/manage/salon', draft);
      store.set({ salon: res.salon });
      // Team photos were re-rendered in the new style.
      if (styleChanged) store.set({ staff: (await api('GET', '/api/manage/staff')).staff });
      draft = saved();
      store.preview(null);
      bar.toggle(false);
      markInvalid(form, null);
      toast(t('brand.saved'));
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }

  function discard() {
    draft = saved();
    nameAr.value = draft.name_ar;
    nameEn.value = draft.name_en;
    change({});
  }

  const form = h(
    'div',
    null,
    h('div', { class: 's-head' }, h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('brand.title') }), h('p', { class: 's-sub', text: t('brand.sub') }))),
    stagger([
      preview.el,
      h('section', { class: 'section' }, h('div', { class: 'card' }, field(t('brand.name'), nameAr), field(t('brand.name_en'), nameEn, { optional: true }))),
      h('section', { class: 'section' }, h('div', { class: 'section-head' }, h('h2', { text: t('brand.logo') })), h('div', { class: 'card' }, logoBox)),
      h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('div', null, h('h2', { text: t('brand.colors') }), h('p', { text: t('brand.colors_sub') }))),
        h('div', { class: 'scroller' }, palettes),
        h('div', { style: { marginTop: '12px' } }, primaryRow, accentRow),
      ),
      h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('div', null, h('h2', { class: 'row', style: { gap: '8px' } }, icon('sparkles'), t('brand.style')), h('p', { text: t('brand.style_sub') }))),
        h('div', { class: 'style-grid' }, styleCards),
      ),
    ]),
  );
  refreshControls();
  return form;
}
