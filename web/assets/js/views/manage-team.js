// Team tab: barbers and stylists, their photos (restyled server-side into the salon's
// unified look), the services they offer and their working hours.
import { api, pickImage, prepareImage } from '../api.js';
import { busy, chips, clear, confirmDelete, field, h, icon, input, markInvalid, sheet, switchEl, toast } from '../dom.js';
import { hoursEditor } from '../hours-editor.js';
import { pick, t } from '../i18n.js';

function portrait(url, name) {
  return h('div', { class: 'portrait' }, url ? h('img', { src: url, alt: name || '' }) : h('div', { class: 'placeholder' }, icon('camera')));
}

function openEditor(store, member, onSaved) {
  const isNew = !member;
  const m = member ?? { name_ar: '', name_en: '', title_ar: '', title_en: '', active: true, custom_hours: false, hours: null, service_ids: store.services.map((s) => s.id) };
  let pendingPhoto = null; // chosen before a new member is saved

  const f = {
    name_ar: input({ name: 'name_ar', value: m.name_ar, maxlength: 60, required: true }),
    title_ar: input({ name: 'title_ar', value: m.title_ar, maxlength: 60, placeholder: t('team.title_placeholder') }),
    name_en: input({ name: 'name_en', value: m.name_en, maxlength: 60, dir: 'ltr' }),
    title_en: input({ name: 'title_en', value: m.title_en, maxlength: 60, dir: 'ltr' }),
  };
  const active = switchEl(m.active);
  const servicePick = chips(store.services.map((s) => ({ id: s.id, label: pick(s, 'name') })), m.service_ids);

  // --- photo
  const photoBox = h('div');
  function renderPhoto(current) {
    const hasPhoto = !!current.photo_url || !!pendingPhoto;
    // Once there is a photo, show the owner's original next to the unified version.
    const styled = portrait(current.photo_url, pick(current, 'name'));
    const compare = !pendingPhoto && current.original_photo_url && current.photo_url
      ? h(
          'div',
          { class: 'photo-compare' },
          h('figure', null, portrait(current.original_photo_url), h('figcaption', { text: t('team.photo_original') })),
          h('figure', null, styled, h('figcaption', { text: t('team.photo_styled') })),
        )
      : null;
    const preview = compare ? styled : pendingPhoto ? portrait(URL.createObjectURL(pendingPhoto)) : styled;

    const choose = h('button', { class: 'btn btn-ghost btn-sm', type: 'button' }, icon('camera'), hasPhoto ? t('team.photo_change') : t('team.photo_upload'));
    choose.addEventListener('click', async () => {
      const file = await pickImage();
      if (!file) return;
      const blob = await prepareImage(file);
      if (isNew) {
        pendingPhoto = blob;
        renderPhoto(current);
        return;
      }
      preview.classList.add('busy');
      preview.append(h('div', { class: 'spinner' }));
      await busy(choose, async () => {
        const res = await api('PUT', `/api/manage/staff/${current.id}/photo`, blob);
        onSaved(res.staff);
        renderPhoto(res.staff.find((x) => x.id === current.id));
      });
      preview.classList.remove('busy');
      preview.querySelector('.spinner')?.remove();
    });
    const remove = current.photo_url && !isNew ? h('button', { class: 'btn btn-danger btn-sm', type: 'button', text: t('team.photo_remove') }) : null;
    remove?.addEventListener('click', () => busy(remove, async () => {
      const res = await api('DELETE', `/api/manage/staff/${current.id}/photo`);
      onSaved(res.staff);
      renderPhoto(res.staff.find((x) => x.id === current.id));
    }));

    const actions = h(
      'div',
      { class: 'stack' },
      h('p', { class: 'muted small', text: t('team.photo_hint') }),
      h('div', { class: 'row', style: { flexWrap: 'wrap', gap: '8px' } }, choose, remove),
    );
    if (compare) clear(photoBox, compare, h('div', { style: { marginTop: '12px' } }, actions));
    else clear(photoBox, h('div', { class: 'photo-edit' }, preview, actions));
  }
  renderPhoto(m);

  // --- hours
  const hoursBox = h('div', { style: { marginTop: '10px' } });
  let editor = null;
  const hoursMode = h(
    'div',
    { class: 'segmented', role: 'radiogroup' },
    ['salon', 'custom'].map((mode) => {
      const radio = h('input', { type: 'radio', name: 'hours_mode', value: mode, checked: (mode === 'custom') === m.custom_hours });
      radio.addEventListener('change', renderHours);
      return h('label', null, radio, h('span', { text: t(mode === 'salon' ? 'team.hours_salon' : 'team.hours_custom') }));
    }),
  );
  const isCustom = () => hoursMode.querySelector('input:checked')?.value === 'custom';
  function renderHours() {
    if (!isCustom()) {
      editor = null;
      clear(hoursBox);
      return;
    }
    editor = hoursEditor(m.hours ?? store.hours);
    clear(hoursBox, editor.el);
  }
  renderHours();

  const form = h(
    'form',
    { novalidate: true, class: 'stack-lg' },
    h('div', { class: 'field' }, h('span', { class: 'label', text: t('team.photo') }), photoBox),
    h(
      'div',
      null,
      field(t('team.name_ar'), f.name_ar),
      field(t('team.title_ar'), f.title_ar, { optional: true }),
      h('div', { class: 'field-row', style: { marginTop: '14px' } }, field(t('team.name_en'), f.name_en, { optional: true }), field(t('team.title_en'), f.title_en, { optional: true })),
    ),
    h('div', { class: 'field' }, h('span', { class: 'label', text: t('team.services') }), store.services.length ? servicePick.el : h('p', { class: 'muted small', text: t('team.no_services') })),
    h('div', { class: 'field' }, h('span', { class: 'label', text: t('team.hours') }), hoursMode, hoursBox),
    h('div', { class: 'switch-row' }, h('span', { text: t('team.active') }), active.el),
  );

  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const del = isNew ? null : h('button', { class: 'btn btn-danger', type: 'button' }, icon('trash'), t('delete'));
  const panel = sheet({ title: isNew ? t('team.add') : t('team.edit'), body: form, actions: [del, save].filter(Boolean) });

  save.addEventListener('click', () => busy(save, async () => {
    const body = {
      name_ar: f.name_ar.value,
      name_en: f.name_en.value,
      title_ar: f.title_ar.value,
      title_en: f.title_en.value,
      active: active.input.checked,
      service_ids: servicePick.value(),
      custom_hours: isCustom(),
      ...(isCustom() ? { hours: editor.value() } : {}),
    };
    try {
      let res = isNew ? await api('POST', '/api/manage/staff', body) : await api('PATCH', `/api/manage/staff/${m.id}`, body);
      if (isNew && pendingPhoto) res = await api('PUT', `/api/manage/staff/${res.id}/photo`, pendingPhoto);
      panel.close();
      onSaved(res.staff);
      toast(t('saved'));
    } catch (err) {
      markInvalid(form, err);
      editor?.showError(err);
      throw err;
    }
  }));
  del?.addEventListener('click', async () => {
    if (!(await confirmDelete())) return;
    busy(del, async () => {
      const res = await api('DELETE', `/api/manage/staff/${m.id}`);
      panel.close();
      onSaved(res.staff);
    });
  });
}

export function teamTab(store) {
  const el = h('div');

  const setStaff = (staff) => {
    // Links changed, so each service's team list did too.
    store.set({
      staff,
      services: store.services.map((s) => ({ ...s, staff_ids: staff.filter((m) => m.service_ids.includes(s.id)).map((m) => m.id) })),
    });
    render();
  };

  function render() {
    const staff = store.staff;
    const add = h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => openEditor(store, null, setStaff) }, icon('plus'), t('team.add'));
    const grid = staff.length
      ? h('div', { class: 'team-grid' }, staff.map((m) => h(
          'button',
          { class: 'team-card', type: 'button', style: { background: 'none', border: '0', padding: '0', textAlign: 'start', cursor: 'pointer' }, onclick: () => openEditor(store, m, setStaff) },
          portrait(m.photo_url, pick(m, 'name')),
          h('div', { class: 'name', text: pick(m, 'name') }),
          h('div', { class: 'role' }, pick(m, 'title') || t('team.services_count', { n: m.service_ids.length })),
          m.active ? null : h('span', { class: 'badge', text: t('team.inactive') }),
        )))
      : h('div', { class: 'card empty' }, icon('users'), h('p', { text: t('team.empty') }), h('div', { style: { marginTop: '12px' } }, h('button', {
          class: 'btn btn-primary', type: 'button', onclick: () => openEditor(store, null, setStaff),
        }, icon('plus'), t('team.add'))));
    clear(el, h('div', { class: 'section-title' }, h('h2', { text: t('team.title') }), staff.length ? add : null), grid);
  }

  render();
  return el;
}
