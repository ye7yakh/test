// Team: barbers and stylists as portrait cards. Adding a photo plays the studio
// touch (the server's unified rendering) and reveals the finished portrait. Each one
// can have his own sign-in to see his schedule and record walk-ins.
import { api, pickImage, prepareImage } from '../api.js';
import { busy, chips, clear, confirmDelete, field, h, icon, input, markInvalid, sheet, sparkles, stagger, switchRow, tilt, toast, toastError } from '../dom.js';
import { hoursEditor } from '../hours-editor.js';
import { pick, t } from '../i18n.js';

/** The server needs 300px on the short side; say so before anything is uploaded. */
async function tooSmall(file) {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    bitmap.close();
    return side < 300;
  } catch {
    return false; // let the server decide
  }
}

function processing() {
  return h('div', { class: 'processing' }, h('div', { class: 'msg' }, icon('sparkles'), h('span', { text: t('team.processing') })));
}

/** The owner's message to a barber with his sign-in: where, which number, which password. */
function loginMessage(store, m, phone, password) {
  // The number isolated left to right: inside Arabic, "+962…" would otherwise read "…962+".
  return t('team.login_wa', { name: pick(m, 'name'), salon: pick(store.salon, 'name'), url: `${location.origin}/admin`, phone: `\u2066${phone}\u2069`, password });
}

/**
 * A barber's own sign-in: his phone number and a temporary password, shown once for the
 * owner to hand over (copy or WhatsApp). He chooses his own at first sign-in, sees only
 * his schedule, and records his walk-ins. The owner can give a new password or take the
 * sign-in away.
 */
function openLogin(store, app, member, onSaved) {
  let m = member;
  const body = h('div', { class: 'login-box' });
  const panel = sheet({ title: t('team.login_title', { name: pick(m, 'name') }), body });
  const cc = app.ctx.tenant?.calling_code ?? '962';

  const secret = (phone, password) => {
    const text = loginMessage(store, m, phone, password);
    const copy = h('button', { class: 'btn btn-secondary btn-sm', type: 'button' }, icon('copy'), t('team.login_copy'));
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(text);
        toast(t('team.login_copied'));
      } catch {
        toast(text);
      }
    });
    const digits = phone.replace(/\D/g, '');
    return h(
      'div',
      { class: 'login-box rise' },
      h('p', { class: 'hint', text: t('team.login_once') }),
      h('div', { class: 'secret' }, h('b', { text: password }), copy),
      h('a', { class: 'btn btn-primary btn-block', href: `https://wa.me/${digits}?text=${encodeURIComponent(text)}`, target: '_blank', rel: 'noopener' }, icon('chat'), t('team.login_send')),
    );
  };

  function render(password = null) {
    const login = m.login;
    if (!login) {
      const phone = input({ name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'off' });
      const give = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, icon('key'), t('team.login_give'));
      const form = h('form', { novalidate: true, class: 'login-box', onsubmit: (e) => e.preventDefault() },
        h('p', { class: 'hint', text: t('team.login_sub', { name: pick(m, 'name') }) }),
        h('div', { class: 'phone-input' }, h('div', { class: 'cc', text: `+${cc}` }), field(t('team.login_phone'), phone)),
        give);
      give.addEventListener('click', () => busy(give, async () => {
        try {
          const res = await api('PUT', `/api/manage/staff/${m.id}/login`, { phone: phone.value });
          m = res.staff.find((x) => x.id === m.id) ?? m;
          onSaved(res.staff);
          render(res.password);
        } catch (err) {
          markInvalid(form, err);
          throw err;
        }
      }));
      clear(body, form);
      return;
    }
    const seen = login.last_seen_at ? t('team.login_seen', { date: new Date(login.last_seen_at).toLocaleDateString(document.documentElement.lang === 'ar' ? 'ar-u-nu-latn' : 'en', { day: 'numeric', month: 'long' }) }) : t('team.login_never');
    const reset = h('button', { class: 'btn btn-secondary btn-block', type: 'button' }, icon('lock'), t('team.login_reset'));
    const remove = h('button', { class: 'link-btn danger-link center-link', type: 'button' }, icon('x'), t('team.login_remove'));
    reset.addEventListener('click', async () => {
      if (!(await confirmDelete({ title: t('team.login_reset'), message: t('team.login_reset_q', { name: pick(m, 'name') }), yesText: t('team.login_reset') }))) return;
      busy(reset, async () => {
        const res = await api('POST', `/api/manage/staff/${m.id}/login/reset`);
        m = res.staff.find((x) => x.id === m.id) ?? m;
        onSaved(res.staff);
        render(res.password);
      });
    });
    remove.addEventListener('click', async () => {
      if (!(await confirmDelete({ title: t('team.login_remove'), message: t('team.login_remove_q', { name: pick(m, 'name') }), yesText: t('team.login_remove') }))) return;
      busy(remove, async () => {
        const res = await api('DELETE', `/api/manage/staff/${m.id}/login`);
        m = res.staff.find((x) => x.id === m.id) ?? m;
        onSaved(res.staff);
        toast(t('team.login_removed'));
        render();
      });
    });
    clear(
      body,
      h(
        'div',
        { class: 'login-row' },
        h('div', { class: 'tile' }, icon('user')),
        h('div', { class: 'grow' }, h('bdi', { class: 'num', dir: 'ltr', text: login.phone }), h('div', { class: 'small muted', text: login.must_change_password && !password ? t('team.login_waiting') : seen })),
      ),
      // A new password is shown here once, to hand over.
      password ? secret(login.phone, password) : null,
      reset,
      remove,
    );
  }
  render();
  return panel;
}

function openEditor(store, app, member, onSaved) {
  // Once a new member is created, the editor edits them: a retry never adds a twin.
  let isNew = !member;
  let m = member ?? { name_ar: '', name_en: '', title_ar: '', title_en: '', active: true, custom_hours: false, hours: null, service_ids: store.services.map((s) => s.id) };
  let pending = null; // a photo chosen before a new member is saved

  // ---- photo stage
  const photo = h('div', { class: 'photo-stage' });
  function renderPhoto({ reveal = false } = {}) {
    const hasPhoto = !!m.photo_url || !!pending;
    let visual;
    if (pending) {
      visual = h('div', { class: 'portrait' }, h('img', { src: URL.createObjectURL(pending), alt: '' }));
    } else if (m.photo_url) {
      visual = h(
        'div',
        { class: 'photo-frame' },
        h(
          'div',
          { class: `portrait finished ${reveal ? 'revealing' : ''}` },
          h('img', { src: m.photo_url, alt: pick(m, 'name'), class: reveal ? 'photo-reveal' : '' }),
          h('span', { class: 'studio-badge' }, icon('sparkles'), t('team.studio')),
        ),
      );
      if (reveal) requestAnimationFrame(() => sparkles(visual));
    } else {
      visual = h('button', { class: 'drop', type: 'button', onclick: choose }, h('div', { class: 'tile' }, icon('camera')), h('b', { text: t('team.photo_add') }), h('small', { text: t('team.photo_add_sub') }));
    }
    const actions = hasPhoto
      ? h(
          'div',
          { class: 'photo-actions' },
          h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: choose }, icon('camera'), t('team.photo_change')),
          !isNew && m.photo_url ? h('button', { class: 'btn btn-ghost btn-sm', type: 'button', onclick: (e) => remove(e.currentTarget) }, t('team.photo_remove')) : null,
        )
      : null;
    clear(photo, visual, actions);
  }

  async function choose() {
    const file = await pickImage();
    if (!file) return;
    if (await tooSmall(file)) {
      toastError({ code: 'image_too_small' });
      return;
    }
    const blob = await prepareImage(file);
    if (isNew) {
      pending = blob;
      renderPhoto();
      return;
    }
    // Show the original under the scanning overlay while the server renders.
    clear(photo, h('div', { class: 'portrait', style: { position: 'relative' } }, h('img', { src: URL.createObjectURL(blob), alt: '' }), processing()));
    try {
      const res = await api('PUT', `/api/manage/staff/${m.id}/photo`, blob);
      m = res.staff.find((x) => x.id === m.id) ?? m;
      onSaved(res.staff);
      renderPhoto({ reveal: true });
      photo.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) {
      renderPhoto();
      toastError(err);
    }
  }

  async function remove(button) {
    await busy(button, async () => {
      const res = await api('DELETE', `/api/manage/staff/${m.id}/photo`);
      m = res.staff.find((x) => x.id === m.id) ?? m;
      onSaved(res.staff);
      renderPhoto();
    });
  }
  renderPhoto();

  // ---- details
  const nameAr = input({ name: 'name_ar', value: m.name_ar, maxlength: 60, dir: 'rtl' });
  const titleAr = input({ name: 'title_ar', value: m.title_ar, maxlength: 60, dir: 'rtl' });
  const nameEn = input({ name: 'name_en', value: m.name_en, maxlength: 60, dir: 'ltr' });
  const titleEn = input({ name: 'title_en', value: m.title_en, maxlength: 60, dir: 'ltr' });
  const offered = chips(store.services.map((s) => ({ id: s.id, label: pick(s, 'name'), emoji: s.icon })), m.service_ids);
  const active = switchRow(t('team.active'), t('team.active_sub'), m.active);
  // An example under the title, gone once there is a title.
  const titleField = field(t('team.role'), titleAr, { hint: t('team.role_ph') });
  titleField.classList.add('example');

  // The English names fold away until wanted (open when there already are some).
  const hasEn = !!(m.name_en || m.title_en);
  const enFold = h('div', { class: `fold ${hasEn ? 'open' : ''}`, id: `en-${Math.random().toString(36).slice(2)}` }, h('div', { class: 'fold-inner en-fields' }, field(t('team.name_en'), nameEn, { optional: true }), field(t('team.role_en'), titleEn, { optional: true })));
  const enToggle = h('button', { class: 'link-btn en-toggle', type: 'button', 'aria-expanded': String(hasEn), 'aria-controls': enFold.id }, icon(hasEn ? 'minus' : 'plus'), t('team.in_english'));
  enToggle.addEventListener('click', () => {
    const open = !enFold.classList.contains('open');
    enFold.classList.toggle('open', open);
    enToggle.setAttribute('aria-expanded', String(open));
    enToggle.querySelector('.icon').replaceWith(icon(open ? 'minus' : 'plus'));
    enFold.inert = !open;
    if (open) setTimeout(() => nameEn.focus({ preventScroll: true }), 50);
  });
  enFold.inert = !hasEn;

  // ---- hours
  const hoursBox = h('div', { style: { marginTop: '12px' } });
  let editor = null;
  const mode = h(
    'div',
    { class: 'segmented', role: 'radiogroup', 'aria-label': t('team.hours') },
    ['salon', 'own'].map((v) => {
      const radio = h('input', { type: 'radio', name: 'hours_mode', value: v, checked: (v === 'own') === m.custom_hours });
      radio.addEventListener('change', renderHours);
      return h('label', null, radio, h('span', { text: t(v === 'salon' ? 'team.hours_salon' : 'team.hours_own') }));
    }),
  );
  const own = () => mode.querySelector('input:checked')?.value === 'own';
  function renderHours() {
    editor = own() ? hoursEditor(m.hours ?? store.hours, { timezone: store.salon.timezone }) : null;
    clear(hoursBox, editor ? h('div', { class: 'card flush rise' }, editor.el) : null);
  }
  renderHours();

  const form = h(
    'form',
    { novalidate: true },
    photo,
    h('div', { class: 'f-row team-names' }, field(t('team.name'), nameAr), titleField),
    enToggle,
    enFold,
    h('span', { class: 'field-label', text: t('team.services') }),
    store.services.length ? offered.el : h('p', { class: 'small muted', text: t('team.no_services') }),
    h('span', { class: 'field-label', text: t('team.hours') }),
    mode,
    hoursBox,
    h('div', { style: { marginTop: '10px' } }, active.el),
    // His own sign-in, once he is on the team.
    isNew ? null : loginRow(),
  );
  form.addEventListener('submit', (e) => e.preventDefault());

  function loginRow() {
    const row = h(
      'button',
      { class: 'disclosure login-entry', type: 'button' },
      h('div', { class: 'tile' }, icon('key')),
      h('div', { class: 'grow' }, h('div', { class: 'title', text: t('team.login') }), h('div', { class: 'sub', text: m.login ? t('team.login_has', { phone: `\u2066${m.login.phone}\u2069` }) : t('team.login_none') })),
      icon('chevron', 'flip-ltr'),
    );
    row.addEventListener('click', () => openLogin(store, app, m, (staff) => {
      onSaved(staff);
      m = staff.find((x) => x.id === m.id) ?? m;
      row.replaceWith(loginRow());
    }));
    return row;
  }

  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const del = isNew ? null : h('button', { class: 'icon-btn danger', type: 'button', 'aria-label': t('delete') }, icon('trash'));
  const panel = sheet({ title: isNew ? t('team.add') : t('team.edit'), body: form, actions: [del, save], tall: true });

  save.addEventListener('click', () => busy(save, async () => {
    const body = {
      name_ar: nameAr.value,
      title_ar: titleAr.value,
      name_en: nameEn.value,
      title_en: titleEn.value,
      active: active.input.checked,
      service_ids: offered.value(),
      custom_hours: own(),
      ...(own() ? { hours: editor.value() } : {}),
    };
    try {
      let res;
      if (isNew) {
        res = await api('POST', '/api/manage/staff', body);
        // They exist now: from here on this sheet edits them, so a retry (or a
        // failed photo) can never create a second copy.
        m = res.staff.find((x) => x.id === res.id) ?? { ...m, ...body, id: res.id };
        isNew = false;
        onSaved(res.staff);
        panel.el.querySelector('.sheet-head h2').textContent = t('team.edit');
      } else {
        res = await api('PATCH', `/api/manage/staff/${m.id}`, body);
      }
      if (pending) {
        const blob = pending;
        pending = null;
        try {
          res = await api('PUT', `/api/manage/staff/${m.id}/photo`, blob);
        } catch (err) {
          // Saved without the photo; the stage offers to add one again.
          renderPhoto();
          throw err;
        }
      }
      panel.close();
      onSaved(res.staff);
      toast(t('saved'));
    } catch (err) {
      if (/_en$/.test(err?.field ?? '') && !enFold.classList.contains('open')) enToggle.click();
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

export function teamPage(store, app) {
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
    const cards = staff.map((m) => tilt(h(
      'button',
      { class: `member ${m.active ? '' : 'paused'}`, type: 'button', onclick: () => openEditor(store, app, m, setStaff) },
      h('div', { class: 'portrait' }, m.photo_url ? h('img', { src: m.photo_url, alt: '' }) : h('div', { class: 'placeholder' }, icon('camera')), h('div', { class: 'shine' })),
      m.active ? null : h('div', { class: 'flag' }, h('span', { class: 'pill', text: t('team.paused') })),
      h('div', { class: 'info' }, h('div', { class: 'name truncate', text: pick(m, 'name') }), h('div', { class: 'role truncate', text: pick(m, 'title') || t('team.services_n', { n: m.service_ids.length }) }), m.login ? h('div', { class: 'login-tag' }, icon('key'), t('team.has_login')) : null),
    )));
    const addTile = h('button', { class: 'add-member', type: 'button', onclick: () => openEditor(store, app, null, setStaff) }, h('div', { class: 'tile' }, icon('plus')), h('span', { text: t('team.add') }));
    clear(
      el,
      h(
        'div',
        { class: 's-head' },
        h('div', { class: 'grow' }, h('h1', { class: 's-title' }, t('team.title'), staff.length ? h('span', { class: 'count num', text: String(staff.length) }) : null), h('p', { class: 's-sub', text: t('team.sub') })),
      ),
      h('div', { class: 'team-grid' }, stagger([...cards, addTile])),
    );
  }

  render();
  return el;
}
