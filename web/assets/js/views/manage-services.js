// Services: the menu with duration, price and who performs each service. New salons
// start from a ready menu for their type and only set their prices.
import { api } from '../api.js';
import { avatar, busy, chips, clear, confirmDelete, field, h, icon, input, markInvalid, sheet, stagger, switchRow, toast } from '../dom.js';
import { currencySymbol, fmtDuration, fmtPrice, pick, t, westernDigits } from '../i18n.js';
import { SALON_TYPES, SERVICE_TEMPLATES } from '../templates.js';

const DURATIONS = [15, 20, 30, 45, 60, 90, 120];
const PRICE = /^\d{1,7}(\.\d{1,3})?$/;

/** Links changed, so each member's own list of services did too. */
function withServices(store, services) {
  return {
    services,
    staff: store.staff.map((m) => ({ ...m, service_ids: services.filter((s) => s.staff_ids.includes(m.id)).map((s) => s.id) })),
  };
}

function priceInput(value, attrs = {}) {
  const el = h('input', { name: 'price', inputmode: 'decimal', autocomplete: 'off', value, placeholder: '0', ...attrs });
  el.addEventListener('input', () => {
    el.value = westernDigits(el.value).replace(/[^\d.]/g, '');
  });
  return el;
}

function openEditor(store, service, onSaved) {
  const isNew = !service;
  const icons = store.options.service_icons;
  const s = service ?? { name_ar: '', name_en: '', description_ar: '', duration_min: 30, price: '', price_is_from: false, active: true, icon: icons[0], staff_ids: store.staff.map((m) => m.id) };
  let chosenIcon = s.icon;
  let duration = s.duration_min;

  const iconPicker = h('div', { class: 'scroller emoji-picker', role: 'radiogroup', 'aria-label': t('services.icon') });
  const renderIcons = () => clear(iconPicker, icons.map((e) => h('button', {
    class: `emoji-opt ${e === chosenIcon ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': String(e === chosenIcon), text: e,
    onclick: () => { chosenIcon = e; renderIcons(); },
  })));
  renderIcons();

  const nameAr = input({ name: 'name_ar', value: s.name_ar, maxlength: 80 });
  const nameEn = input({ name: 'name_en', value: s.name_en, maxlength: 80, dir: 'ltr' });
  const desc = input({ name: 'description_ar', value: s.description_ar, maxlength: 300 });

  const durationValue = h('span', { class: 'v num' });
  const durationChips = h('div', { class: 'scroller' });
  const renderDuration = () => {
    durationValue.textContent = fmtDuration(duration);
    clear(durationChips, DURATIONS.map((m) => h('button', { class: `chip-btn num ${m === duration ? 'on' : ''}`, type: 'button', text: t('unit.min_short', { n: m }), onclick: () => { duration = m; renderDuration(); } })));
  };
  const step = (d) => () => {
    duration = Math.min(600, Math.max(5, duration + d));
    renderDuration();
  };
  renderDuration();

  const price = priceInput(s.price ? String(Number(s.price)) : '');
  const from = switchRow(t('services.from'), t('services.from_sub'), s.price_is_from);
  const active = switchRow(t('services.bookable'), t('services.bookable_sub'), s.active);
  const who = chips(store.staff.map((m) => ({ id: m.id, label: pick(m, 'name'), img: m.photo_url })), s.staff_ids);

  const form = h(
    'form',
    { novalidate: true },
    h('span', { class: 'field-label', text: t('services.icon') }),
    iconPicker,
    h('div', { style: { marginTop: '18px' } }, field(t('services.name'), nameAr), field(t('services.name_en'), nameEn, { optional: true }), field(t('services.desc'), desc, { optional: true })),
    h('span', { class: 'field-label', text: t('services.duration') }),
    durationChips,
    h('div', { class: 'row', style: { marginTop: '10px' } }, h('span', { class: 'small muted grow', text: t('services.custom') }), h('div', { class: 'stepper' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '-5', onclick: step(-5) }, icon('minus')), durationValue, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '+5', onclick: step(5) }, icon('plus')))),
    h('span', { class: 'field-label', text: t('services.price') }),
    h('label', { class: 'price-field' }, price, h('span', { class: 'cur', text: currencySymbol(store.salon.currency) })),
    h('div', { style: { marginTop: '6px' } }, from.el, active.el),
    h('span', { class: 'field-label', text: t('services.who') }),
    store.staff.length ? who.el : h('p', { class: 'small muted', text: t('services.no_team') }),
  );

  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const del = isNew ? null : h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': t('delete') }, icon('trash'));
  const panel = sheet({ title: isNew ? t('services.add') : t('services.edit'), body: form, actions: [del, save], tall: true });

  const submit = () => busy(save, async () => {
    const body = {
      icon: chosenIcon,
      name_ar: nameAr.value,
      name_en: nameEn.value,
      description_ar: desc.value,
      duration_min: duration,
      price: price.value.trim() || '0',
      price_is_from: from.input.checked,
      active: active.input.checked,
      staff_ids: who.value(),
    };
    try {
      const res = isNew ? await api('POST', '/api/manage/services', body) : await api('PATCH', `/api/manage/services/${s.id}`, body);
      panel.close();
      onSaved(res.services);
      toast(t('saved'));
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  });
  save.addEventListener('click', submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit();
  });
  del?.addEventListener('click', async () => {
    if (!(await confirmDelete())) return;
    busy(del, async () => {
      const res = await api('DELETE', `/api/manage/services/${s.id}`);
      panel.close();
      onSaved(res.services);
    });
  });
}

/** A ready menu for one salon type: tick what you offer, type your prices, add them all. */
function openTemplates(store, typeId, onSaved) {
  const allowed = new Set(store.options.service_icons);
  const existing = new Set(store.services.map((s) => s.name_ar.trim()));
  const rows = SERVICE_TEMPLATES[typeId].map((tpl) => {
    const check = h('input', { type: 'checkbox', checked: !existing.has(tpl.ar), 'aria-label': tpl.ar });
    const price = priceInput('', { class: 'price-mini', 'aria-label': t('services.tpl_price'), placeholder: t('services.tpl_price') });
    const row = h(
      'div',
      { class: 'tpl-row' },
      h('label', { class: 'check' }, check, h('span', null, icon('check'))),
      h('div', { class: 'tile emoji-tile', text: tpl.icon }),
      h('div', { class: 'grow' }, h('div', { style: { fontWeight: '500' }, text: pick({ name_ar: tpl.ar, name_en: tpl.en }, 'name') }), h('div', { class: 'small muted', text: fmtDuration(tpl.min) })),
      price,
    );
    const sync = () => {
      row.classList.toggle('off', !check.checked);
      update();
    };
    check.addEventListener('change', sync);
    price.addEventListener('input', () => {
      price.classList.remove('invalid');
      if (price.value && !check.checked) {
        check.checked = true;
        sync();
      }
    });
    return { tpl, check, price, row, sync };
  });

  const add = h('button', { class: 'btn btn-primary', type: 'button' });
  const update = () => {
    const n = rows.filter((r) => r.check.checked).length;
    add.textContent = t('services.tpl_add', { n });
    add.disabled = n === 0;
  };
  const panel = sheet({
    title: t(`type.${typeId}`),
    body: h('div', null, h('p', { class: 'muted small', style: { marginBottom: '8px' }, text: t('services.tpl_sub') }), rows.map((r) => r.row)),
    actions: [add],
    tall: true,
  });
  rows.forEach((r) => r.sync());

  add.addEventListener('click', () => busy(add, async () => {
    const picked = rows.filter((r) => r.check.checked);
    const bad = picked.filter((r) => !PRICE.test(r.price.value.trim()));
    bad.forEach((r) => r.price.classList.add('invalid'));
    if (bad.length) {
      bad[0].price.focus();
      return;
    }
    const res = await api('POST', '/api/manage/services/bulk', {
      services: picked.map(({ tpl, price }) => ({
        name_ar: tpl.ar,
        name_en: tpl.en,
        duration_min: tpl.min,
        price: price.value.trim(),
        price_is_from: !!tpl.from,
        icon: allowed.has(tpl.icon) ? tpl.icon : store.options.service_icons[0],
      })),
    });
    panel.close();
    onSaved(res.services);
    toast(t('services.added'));
  }));
}

export function servicesPage(store) {
  let reordering = false;
  const el = h('div');

  const setServices = (services) => {
    store.set(withServices(store, services));
    render();
  };

  async function move(index, delta) {
    const ids = store.services.map((s) => s.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + delta, 0, id);
    const res = await api('PUT', '/api/manage/services/order', { ids });
    store.set({ services: res.services });
    render();
  }

  const typeButtons = (cls) => SALON_TYPES.map((type) => h(
    'button',
    { class: cls, type: 'button', onclick: () => openTemplates(store, type.id, setServices) },
    h('span', { class: 'emoji', text: type.emoji }),
    h('span', { class: 'nm', text: t(`type.${type.id}`) }),
  ));

  function render() {
    const services = store.services;
    const staffById = new Map(store.staff.map((m) => [m.id, m]));
    const add = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('services.add'), title: t('services.add'), onclick: () => openEditor(store, null, setServices) }, icon('plus'));
    const head = h(
      'div',
      { class: 's-head' },
      h('div', { class: 'grow' }, h('h1', { class: 's-title' }, t('services.title'), services.length ? h('span', { class: 'count num', text: String(services.length) }) : null), h('p', { class: 's-sub', text: t('services.sub') })),
      services.length > 1 ? h('button', { class: `icon-btn ${reordering ? 'on' : ''}`, type: 'button', 'aria-pressed': String(reordering), 'aria-label': t('services.reorder'), title: t('services.reorder'), onclick: () => { reordering = !reordering; render(); } }, icon(reordering ? 'check' : 'sort')) : null,
      add,
    );

    if (!services.length) {
      clear(el, head, h(
        'section',
        { class: 'card glow quick rise' },
        h('div', { class: 'tile', style: { marginBottom: '14px' } }, icon('wand')),
        h('h2', { text: t('services.quick') }),
        h('p', { text: t('services.quick_sub') }),
        h('div', { class: 'type-grid' }, stagger(typeButtons('type-card'), 2)),
        h('button', { class: 'link-btn', type: 'button', style: { marginTop: '16px' }, onclick: () => openEditor(store, null, setServices) }, icon('plus'), t('services.manual')),
      ));
      return;
    }

    const list = h('div', { class: 'card flush' }, h('ul', { class: 'list' }, stagger(services.map((s, i) => h(
      'li',
      { class: 'svc-row' },
      h(
        'button',
        { class: `svc ${s.active ? '' : 'off'}`, type: 'button', disabled: reordering, onclick: () => openEditor(store, s, setServices) },
        h('div', { class: 'tile emoji-tile', text: s.icon }),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'name truncate', text: pick(s, 'name') }),
          h(
            'div',
            { class: 'meta' },
            h('span', { class: 'num', text: fmtDuration(s.duration_min) }),
            s.active ? null : h('span', { class: 'pill off', text: t('services.hidden') }),
            h('span', { class: 'avatar-stack' }, s.staff_ids.slice(0, 4).map((id) => staffById.get(id) && avatar(staffById.get(id).photo_url, pick(staffById.get(id), 'name')))),
          ),
        ),
        h('div', { class: 'price num' }, s.price_is_from ? h('small', { text: t('pub.from') }) : null, fmtPrice(s.price, store.salon.currency)),
      ),
      reordering
        ? h(
            'div',
            { class: 'reorder' },
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': '↑', disabled: i === 0, onclick: (e) => busy(e.currentTarget, () => move(i, -1)) }, icon('up')),
            h('button', { class: 'icon-btn', type: 'button', 'aria-label': '↓', disabled: i === services.length - 1, onclick: (e) => busy(e.currentTarget, () => move(i, 1)) }, icon('down')),
          )
        : null,
    )))));

    clear(
      el,
      head,
      list,
      h(
        'section',
        { class: 'section' },
        h('div', { class: 'section-head' }, h('h2', { class: 'row', style: { gap: '8px' } }, icon('wand'), t('services.more'))),
        h('div', { class: 'scroller' }, typeButtons('chip-btn')),
      ),
    );
  }

  render();
  return el;
}
