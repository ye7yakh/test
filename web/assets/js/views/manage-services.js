// Services tab: the menu, with duration, price and who performs each service.
import { api } from '../api.js';
import { avatar, busy, chips, clear, confirmDelete, field, h, icon, input, markInvalid, sheet, switchEl, toast } from '../dom.js';
import { fmtDuration, fmtPrice, pick, t, westernDigits } from '../i18n.js';

const QUICK_DURATIONS = [15, 30, 45, 60, 90];

function openEditor(store, service, onSaved) {
  const isNew = !service;
  const s = service ?? { name_ar: '', name_en: '', description_ar: '', duration_min: 30, price: '', price_is_from: false, active: true, staff_ids: store.staff.map((m) => m.id) };
  const f = {
    name_ar: input({ name: 'name_ar', value: s.name_ar, maxlength: 80, required: true }),
    name_en: input({ name: 'name_en', value: s.name_en, maxlength: 80, dir: 'ltr' }),
    description_ar: input({ name: 'description_ar', value: s.description_ar, maxlength: 300 }),
    duration_min: input({ name: 'duration_min', class: 'input num', value: String(s.duration_min), inputmode: 'numeric' }),
    price: input({ name: 'price', class: 'input num', value: s.price ? String(Number(s.price)) : '', inputmode: 'decimal', placeholder: '0' }),
  };
  // Show Western digits as people type, whatever their keyboard sends.
  for (const el of [f.duration_min, f.price]) el.addEventListener('input', () => { el.value = westernDigits(el.value); });
  const quick = h('div', { class: 'chips', style: { marginTop: '8px' } }, QUICK_DURATIONS.map((m) => h('button', {
    class: 'btn btn-ghost btn-sm', type: 'button', text: String(m), onclick: () => { f.duration_min.value = String(m); },
  })));
  const from = switchEl(s.price_is_from);
  const active = switchEl(s.active);
  const staffPick = chips(store.staff.map((m) => ({ id: m.id, label: pick(m, 'name') })), s.staff_ids);

  const form = h(
    'form',
    { novalidate: true },
    field(t('services.name_ar'), f.name_ar),
    field(t('services.name_en'), f.name_en, { optional: true }),
    field(t('services.description_ar'), f.description_ar, { optional: true }),
    h('div', { class: 'field-row', style: { marginTop: '14px' } }, field(t('services.duration'), f.duration_min), field(`${t('services.price')} (${store.salon.currency})`, f.price)),
    quick,
    h('div', { class: 'switch-row', style: { marginTop: '10px' } }, h('span', { class: 'small', text: t('services.price_is_from') }), from.el),
    h('div', { class: 'switch-row' }, h('span', { class: 'small', text: t('services.active') }), active.el),
    h(
      'div',
      { class: 'field', style: { marginTop: '14px' } },
      h('span', { class: 'label', text: t('services.staff') }),
      store.staff.length ? staffPick.el : h('p', { class: 'muted small', text: t('services.no_staff') }),
    ),
  );

  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const del = isNew ? null : h('button', { class: 'btn btn-danger', type: 'button' }, icon('trash'), t('delete'));
  const panel = sheet({ title: isNew ? t('services.add') : t('services.edit'), body: form, actions: [del, save].filter(Boolean) });

  const submit = () => busy(save, async () => {
    const body = {
      name_ar: f.name_ar.value,
      name_en: f.name_en.value,
      description_ar: f.description_ar.value,
      duration_min: Number(westernDigits(f.duration_min.value)) || 0,
      price: westernDigits(f.price.value).trim() || '0',
      price_is_from: from.input.checked,
      active: active.input.checked,
      staff_ids: staffPick.value(),
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
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  del?.addEventListener('click', async () => {
    if (!(await confirmDelete())) return;
    busy(del, async () => {
      const res = await api('DELETE', `/api/manage/services/${s.id}`);
      panel.close();
      onSaved(res.services);
    });
  });
}

export function servicesTab(store) {
  let reordering = false;
  const el = h('div');
  const staffById = () => new Map(store.staff.map((m) => [m.id, m]));

  const setServices = (services) => {
    // Links changed, so each member's service list did too.
    store.set({
      services,
      staff: store.staff.map((m) => ({ ...m, service_ids: services.filter((s) => s.staff_ids.includes(m.id)).map((s) => s.id) })),
    });
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

  function render() {
    const services = store.services;
    const byId = staffById();
    const add = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openEditor(store, null, setServices) }, icon('plus'), t('services.add'));
    const reorder = services.length > 1
      ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: () => { reordering = !reordering; render(); } },
          reordering ? t('services.reorder_done') : h('span', { class: 'row', style: { gap: '6px' } }, icon('sort'), t('services.reorder')))
      : null;

    const list = services.length
      ? h('div', { class: 'card flush' }, h('ul', { class: 'list' }, services.map((s, i) => h(
          'li',
          { class: 'row', style: { gap: '0' } },
          h(
            'button',
            { class: 'list-item', type: 'button', disabled: reordering, onclick: () => openEditor(store, s, setServices) },
            h(
              'div',
              { class: 'grow' },
              h('div', { class: 'row', style: { gap: '8px' } }, h('h3', { text: pick(s, 'name') }), s.active ? null : h('span', { class: 'badge', text: t('services.hidden') })),
              h('div', { class: 'meta' }, `${fmtDuration(s.duration_min)} · ${s.price_is_from ? `${t('pub.from')} ` : ''}${fmtPrice(s.price, store.salon.currency)}`),
            ),
            h('span', { class: 'avatar-stack' }, s.staff_ids.slice(0, 4).map((id) => (byId.get(id) ? avatar(byId.get(id).photo_url, pick(byId.get(id), 'name')) : null))),
          ),
          reordering
            ? h(
                'div',
                { class: 'row', style: { gap: '0', paddingInlineEnd: '8px' } },
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': '↑', disabled: i === 0, onclick: (e) => busy(e.currentTarget, () => move(i, -1)) }, icon('up')),
                h('button', { class: 'icon-btn', type: 'button', 'aria-label': '↓', disabled: i === services.length - 1, onclick: (e) => busy(e.currentTarget, () => move(i, 1)) }, icon('down')),
              )
            : null,
        ))))
      : h('div', { class: 'card empty' }, icon('scissors'), h('p', { text: t('services.empty') }), h('div', { style: { marginTop: '12px' } }, h('button', {
          class: 'btn btn-primary', type: 'button', onclick: () => openEditor(store, null, setServices),
        }, icon('plus'), t('services.add'))));

    clear(el, h('div', { class: 'section-title' }, h('h2', { text: t('services.title') }), h('div', { class: 'row', style: { gap: '8px' } }, reorder, services.length ? add : null)), list);
  }

  render();
  return el;
}
