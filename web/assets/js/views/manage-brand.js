// Brand studio: everything about how the salon looks, in its customers' app and in
// the owner's own dashboard. Name, logo, app icon and cover photo; colours; the
// customer page by night or by day; the dashboard in the studio's colours or the
// salon's; the team photo style. Previewed live while the owner edits; settings wait
// for save, pictures are saved straight away.
import { api, pickImage, prepareImage } from '../api.js';
import { appIcon, busy, clear, field, h, icon, input, markInvalid, salonIcon, savebar, stagger, toast } from '../dom.js';
import { t } from '../i18n.js';
import { homeScreen, miniApp, phone, splashScreen } from '../preview.js';
import { PALETTES } from '../templates.js';
import { applyColors, applyLooks } from '../theme.js';

const KEYS = ['name_ar', 'name_en', 'color_primary', 'color_accent', 'photo_style', 'icon_bg', 'page_theme', 'studio_theme'];
const ICON_BGS = ['auto', 'white', 'primary', 'night'];

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
    { id: 'splash', caption: t('brand.slide_splash'), screen: () => splashScreen(store.previewState()) },
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

/** Two big choices side by side, each with a little picture of what it means. */
function lookChoice(name, options, value, onPick) {
  const cards = options.map((o) => {
    const radio = h('input', { type: 'radio', name, value: o.id, checked: o.id === value });
    radio.addEventListener('change', () => onPick(o.id));
    const card = h('label', { class: 'look-card' }, radio, h('div', { class: `look-swatch sw-${o.swatch}`, 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('b', { text: o.title }), h('span', { text: o.sub }));
    card.refresh = (v) => {
      radio.checked = v === o.id;
    };
    return card;
  });
  const el = h('div', { class: 'look-grid', role: 'radiogroup' }, cards);
  el.refresh = (v) => cards.forEach((c) => c.refresh(v));
  return el;
}

/** A picture saved straight away (logo, icon, cover): upload, change, remove. */
async function uploadPicture(button, kind, store, after, maxSide) {
  const file = await pickImage();
  if (!file) return;
  await busy(button, async () => {
    const res = await api('PUT', `/api/manage/salon/${kind}`, await prepareImage(file, maxSide));
    store.set({ salon: { ...res.salon } });
    after();
    toast(t('saved'));
  });
}

async function removePicture(button, kind, store, after) {
  await busy(button, async () => {
    const res = await api('DELETE', `/api/manage/salon/${kind}`);
    store.set({ salon: { ...res.salon } });
    after();
  });
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
    applyLooks(store.salon);
  });

  const preview = stage(store);
  const pictures = () => {
    renderLogo();
    renderIcon();
    renderCover();
    preview.render();
  };

  // ---- name
  const nameAr = input({ name: 'name_ar', value: draft.name_ar, maxlength: 80 });
  const nameEn = input({ name: 'name_en', value: draft.name_en, maxlength: 80, dir: 'ltr' });
  nameAr.addEventListener('input', () => change({ name_ar: nameAr.value }));
  nameEn.addEventListener('input', () => change({ name_en: nameEn.value }));

  // ---- logo
  const logoBox = h('div', { class: 'logo-drop' });
  function renderLogo() {
    const url = store.salon.logo_url;
    const tile = url ? appIcon(url) : h('div', { class: 'app-icon empty-logo' }, icon('image'));
    const upload = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('camera'), url ? t('brand.logo_change') : t('brand.logo_upload'));
    const choose = () => uploadPicture(upload, 'logo', store, pictures, 1024);
    upload.addEventListener('click', choose);
    tile.addEventListener('click', choose);
    const remove = url ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('brand.logo_remove') }) : null;
    remove?.addEventListener('click', () => removePicture(remove, 'logo', store, pictures));
    clear(logoBox, tile, h('div', { class: 'grow stack-sm' }, h('div', { class: 'row wrap', style: { gap: '8px' } }, upload, remove), h('div', { class: 'small faint', text: t('brand.logo_hint') })));
  }

  // ---- app icon: its own picture, or the logo on a background
  const iconBox = h('div', { class: 'logo-drop' });
  const bgChips = h('div', { class: 'scroller icon-bgs' });
  function renderIcon() {
    const own = store.salon.icon_url;
    const tile = salonIcon({ ...store.salon, ...draft });
    const upload = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('image'), own ? t('brand.icon_change') : t('brand.icon_upload'));
    upload.addEventListener('click', () => uploadPicture(upload, 'icon', store, pictures, 1024));
    tile.addEventListener('click', () => upload.click());
    const remove = own ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('brand.icon_remove') }) : null;
    remove?.addEventListener('click', () => removePicture(remove, 'icon', store, pictures));
    clear(iconBox, tile, h('div', { class: 'grow stack-sm' }, h('div', { class: 'row wrap', style: { gap: '8px' } }, upload, remove), h('div', { class: 'small faint', text: t('brand.icon_hint') })));
    clear(bgChips, ICON_BGS.map((bg) => h(
      'button',
      { class: `chip-btn ${draft.icon_bg === bg ? 'on' : ''}`, type: 'button', onclick: () => change({ icon_bg: bg }) },
      bg === 'auto' ? icon('wand') : h('i', { class: `bg-dot ${bg}`, 'aria-hidden': 'true' }),
      t(`brand.bg_${bg}`),
    )));
  }

  // ---- cover photo across the top of the customer page
  const coverBox = h('div', { class: 'cover-drop' });
  function renderCover() {
    const url = store.salon.cover_url;
    const shot = url ? h('img', { src: url, alt: '' }) : h('div', { class: 'cover-empty' }, icon('image'), h('span', { text: t('brand.cover_sub') }));
    const upload = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('camera'), url ? t('brand.cover_change') : t('brand.cover_upload'));
    upload.addEventListener('click', () => uploadPicture(upload, 'cover', store, pictures, 2000));
    const remove = url ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('brand.cover_remove') }) : null;
    remove?.addEventListener('click', () => removePicture(remove, 'cover', store, pictures));
    const frame = h('button', { class: `cover-frame ${url ? 'has' : ''}`, type: 'button', 'aria-label': upload.textContent }, shot);
    frame.addEventListener('click', () => upload.click());
    clear(coverBox, frame, h('div', { class: 'row wrap', style: { gap: '8px', marginTop: '12px' } }, upload, remove));
  }

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

  // ---- the two looks
  const pageLook = lookChoice('page_theme', [
    { id: 'night', swatch: 'night', title: t('brand.look_night'), sub: t('brand.look_night_sub') },
    { id: 'day', swatch: 'day', title: t('brand.look_day'), sub: t('brand.look_day_sub') },
  ], draft.page_theme, (v) => change({ page_theme: v }));
  const studioLook = lookChoice('studio_theme', [
    { id: 'studio', swatch: 'studio', title: t('brand.look_studio'), sub: t('brand.look_studio_sub') },
    { id: 'brand', swatch: 'salon', title: t('brand.look_brand'), sub: t('brand.look_brand_sub') },
  ], draft.studio_theme, (v) => change({ studio_theme: v }));

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
    pageLook.refresh(draft.page_theme);
    studioLook.refresh(draft.studio_theme);
    renderIcon();
  }

  function change(partial) {
    draft = { ...draft, ...partial };
    applyColors(draft.color_primary, draft.color_accent);
    // The dashboard itself switches look as the owner picks.
    applyLooks({ studio_theme: draft.studio_theme });
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

  renderLogo();
  renderCover();
  const section = (title, sub, ...body) => h(
    'section',
    { class: 'section' },
    h('div', { class: 'section-head' }, h('div', null, h('h2', { text: title }), sub ? h('p', { text: sub }) : null)),
    ...body,
  );
  const form = h(
    'div',
    null,
    h('div', { class: 's-head' }, h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('brand.title') }), h('p', { class: 's-sub', text: t('brand.sub') }))),
    stagger([
      preview.el,
      h('section', { class: 'section' }, h('div', { class: 'card' }, field(t('brand.name'), nameAr), field(t('brand.name_en'), nameEn, { optional: true }))),
      section(t('brand.logo'), null, h('div', { class: 'card' }, logoBox)),
      section(t('brand.app_icon'), t('brand.app_icon_sub'), h('div', { class: 'card' }, iconBox, h('div', { class: 'eyebrow', style: { margin: '16px 2px 8px' }, text: t('brand.icon_bg') }), bgChips)),
      section(t('brand.cover'), null, coverBox),
      section(t('brand.colors'), t('brand.colors_sub'), h('div', { class: 'scroller' }, palettes), h('div', { style: { marginTop: '12px' } }, primaryRow, accentRow)),
      section(t('brand.page_look'), t('brand.page_look_sub'), pageLook),
      section(t('brand.studio_look'), t('brand.studio_look_sub'), studioLook),
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
