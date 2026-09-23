// Bookings: the owner's day. Deposits waiting for a check come first, then the day's
// visits in order with a line at the current time. From here the owner confirms CliQ
// transfers, marks visits, adds bookings taken by phone and sets how booking works.
import { api } from '../api.js';
import { avatar, busy, clear, confirmDelete, field, h, icon, input, markInvalid, sheet, stagger, switchRow, toast } from '../dom.js';
import { currencySymbol, errorText, fmtDuration, fmtPrice, fmtTime, pick, t, westernDigits } from '../i18n.js';
import { addDays, dayLabel, dayStrip, fmtDate, slotGrid } from '../slots.js';
import { nowIn, toMin } from '../time.js';
import { waNumber } from './booking.js';

const HOLDING = new Set(['pending_payment', 'payment_sent', 'confirmed']);
const COUNTED = new Set([...HOLDING, 'completed', 'no_show']);
const AWAITING = new Set(['pending_payment', 'payment_sent']);
const PAST_DAYS = 7;
const AHEAD_DAYS = 30;
const WINDOWS = [15, 30, 60, 120];

// The day the owner was looking at, kept while they visit other tabs.
let viewDate = null;
// Our own changes echo back over the live stream; they need no announcement.
let quietUntil = 0;
const quiet = () => {
  quietUntil = Date.now() + 2500;
};

const mmss = (seconds) => {
  const s = Math.max(0, seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const statusPill = (status) => h('span', { class: `pill status-${status}`, text: t(`status.${status}`) });
const sum = (list) => Math.round(list.reduce((a, b) => a + Number(b.price), 0) * 1000) / 1000;

async function setStatus(b, status) {
  quiet();
  return (await api('PATCH', `/api/manage/bookings/${b.id}`, { status })).booking;
}

// ---------------------------------------------------------------- one booking

function waLink(store, b) {
  const text = t('sched.wa_text', { name: b.customer.name, salon: pick(store.salon, 'name'), day: fmtDate(b.date), time: fmtTime(b.start) });
  return `https://wa.me/${waNumber(b.customer.phone)}?text=${encodeURIComponent(text)}`;
}

/** What the owner can do next, as [label, status, style, confirm?]. */
function actionsFor(b) {
  switch (b.status) {
    case 'pending_payment':
    case 'payment_sent':
      return [['sched.reject', 'cancelled', 'btn-secondary', 'sched.reject_confirm'], ['sched.received', 'confirmed', 'btn-primary']];
    case 'confirmed':
      return [['sched.no_show', 'no_show', 'btn-secondary'], ['sched.arrived', 'completed', 'btn-primary']];
    case 'completed':
    case 'no_show':
      return [['sched.undo', 'confirmed', 'btn-secondary']];
    default:
      return [];
  }
}

async function runAction(button, b, [label, status, , confirmKey], onChange) {
  if (confirmKey && !(await confirmDelete({ title: t(label), message: t(confirmKey), yesText: t(label) }))) return false;
  const updated = await busy(button, () => setStatus(b, status));
  if (!updated) return false;
  toast(status === 'confirmed' && AWAITING.has(b.status) ? t('sched.confirmed') : t('sched.updated'));
  onChange(updated);
  return true;
}

function openDetail(store, b, onChange) {
  const cur = store.salon.currency;
  const kv = (ic, ...content) => h('div', { class: 'kv' }, typeof ic === 'string' ? icon(ic) : ic, ...content);
  const body = h(
    'div',
    { class: 'bk-detail details' },
    h(
      'div',
      { class: 'bk-head' },
      h('div', { class: 'tile emoji-tile', text: b.service.icon || '✂️' }),
      h('div', { class: 'grow' }, h('div', { class: 'name', text: pick(b.service, 'name') }), h('div', { class: 'small muted num', text: `${fmtTime(b.start)} – ${fmtTime(b.end)} · ${fmtDuration(b.duration_min)}` })),
      statusPill(b.status),
    ),
    kv('calendar', h('span', { text: `${dayLabel(b.date, store.today ?? b.date)} · ${fmtDate(b.date, { day: 'numeric', month: 'long' })}` })),
    kv(avatar(b.staff.photo_url, pick(b.staff, 'name')), h('span', { text: `${t('bk.with')} ${pick(b.staff, 'name')}` })),
    h(
      'div',
      { class: 'customer-box' },
      h('div', { class: 'grow' }, h('div', { class: 'eyebrow', text: t('sched.customer') }), h('div', { class: 'name', text: b.customer.name }), h('div', { class: 'small muted ltr num', text: b.customer.phone })),
      h('a', { class: 'icon-btn', href: `tel:${b.customer.phone}`, 'aria-label': t('sched.call'), title: t('sched.call') }, icon('phone')),
      h('a', { class: 'icon-btn wa', href: waLink(store, b), target: '_blank', rel: 'noopener', 'aria-label': t('sched.whatsapp'), title: t('sched.whatsapp') }, icon('chat')),
    ),
    h(
      'div',
      { class: 'money' },
      h('div', null, h('span', { text: t('sched.price') }), h('b', { class: 'num', text: fmtPrice(b.price, cur) })),
      Number(b.deposit) > 0 ? h('div', null, h('span', { text: t('sched.deposit_paid') }), h('b', { class: 'num', text: fmtPrice(b.deposit, cur) })) : null,
    ),
    b.payment_note ? kv('chat', h('span', null, h('span', { class: 'muted', text: `${t('sched.note')}: ` }), b.payment_note)) : null,
    b.status === 'pending_payment' && b.expires_in_s ? kv('clock', h('span', { class: 'muted num', text: t('sched.not_sent', { time: mmss(b.expires_in_s) }) })) : null,
    h('div', { class: 'kv faint small' }, h('span', { text: t(b.source === 'owner' ? 'sched.source_owner' : 'sched.source_online') })),
  );

  const buttons = actionsFor(b).map((a) => h('button', { class: `btn ${a[2]}`, type: 'button', text: t(a[0]) }));
  // Cancelling a confirmed visit is rarer, so it sits under the main actions.
  const cancel = b.status === 'confirmed' ? h('button', { class: 'link-btn danger-link', type: 'button' }, icon('x'), t('sched.cancel')) : null;
  if (cancel) body.append(h('div', { class: 'center', style: { marginTop: '14px' } }, cancel));

  const panel = sheet({ title: t('sched.number', { id: b.id }), body, actions: buttons });
  const done = (updated) => {
    panel.close();
    onChange(updated);
  };
  actionsFor(b).forEach((a, i) => buttons[i].addEventListener('click', () => runAction(buttons[i], b, a, done)));
  cancel?.addEventListener('click', () => runAction(cancel, b, ['sched.cancel', 'cancelled', '', 'sched.cancel_confirm'], done));
}

// ---------------------------------------------------------------- deposits to check

/** seen: ids already on screen. Only newcomers animate in, so live refreshes do not flicker. */
function attentionSection(store, list, onChange, seen) {
  if (!list.length) return null;
  const cur = store.salon.currency;
  const sent = list.filter((b) => b.status === 'payment_sent').length;
  const rows = list.map((b) => {
    const acts = actionsFor(b).map((a) => {
      const btn = h('button', { class: `btn btn-sm ${a[2]}`, type: 'button', text: t(a[0]) });
      btn.addEventListener('click', () => runAction(btn, b, a, onChange));
      return btn;
    });
    return h(
      'div',
      { class: `att-row ${b.status === 'payment_sent' ? 'sent' : ''}` },
      h(
        'button',
        { class: 'att-main', type: 'button', onclick: () => openDetail(store, b, onChange) },
        avatar(null, b.customer.name),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'name truncate', text: b.customer.name }),
          h('div', { class: 'meta truncate', text: `${pick(b.service, 'name')} · ${dayLabel(b.date, store.today)} ${fmtTime(b.start)}` }),
        ),
        h('div', { class: 'amt' }, h('b', { class: 'num', text: fmtPrice(b.deposit, cur) }), statusPill(b.status)),
      ),
      b.payment_note ? h('div', { class: 'att-note' }, icon('chat'), h('span', { text: b.payment_note })) : null,
      b.status === 'pending_payment' ? h('div', { class: 'att-note faint num' }, icon('clock'), h('span', { text: t('sched.not_sent', { time: mmss(b.expires_in_s ?? 0) }) })) : null,
      h('div', { class: 'att-acts' }, acts),
    );
  });
  stagger(rows.filter((_, i) => !seen.has(list[i].id)));
  for (const b of list) seen.add(b.id);
  return h(
    'section',
    { class: 'section attention' },
    h('div', { class: 'section-head' }, h('div', null, h('h2', null, t('sched.attention'), sent ? h('span', { class: 'count hot num', text: String(sent) }) : null), h('p', { text: t('sched.attention_sub') }))),
    h('div', { class: 'card flush' }, rows),
  );
}

// ---------------------------------------------------------------- the day

function agenda(store, bookings, { isToday, onOpen, seen }) {
  const now = nowIn(store.salon.timezone).minutes;
  const rows = [];
  let nowPlaced = !isToday;
  const nowLine = () => h('div', { class: 'now-line', 'aria-hidden': 'true' }, h('span', { class: 't num', text: t('sched.now') }), h('span', { class: 'l' }));
  bookings.forEach((b, i) => {
    const fresh = !seen.has(b.id);
    seen.add(b.id);
    if (!nowPlaced && toMin(b.start) >= now) {
      rows.push(nowLine());
      nowPlaced = true;
    }
    rows.push(h(
      'button',
      { class: `appt s-${b.status} ${fresh ? 'enter' : ''}`, type: 'button', style: { '--i': String(Math.min(i, 10)) }, onclick: () => onOpen(b) },
      h('div', { class: 'when num' }, h('b', { text: fmtTime(b.start) }), h('span', { text: fmtTime(b.end) })),
      h(
        'div',
        { class: 'body' },
        h('div', { class: 'tile emoji-tile', text: b.service.icon || '✂️' }),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'top' }, h('span', { class: 'nm truncate', text: b.customer.name }), b.status === 'confirmed' ? null : statusPill(b.status)),
          h(
            'div',
            { class: 'meta' },
            h('span', { class: 'truncate', text: pick(b.service, 'name') }),
            h('span', { class: 'sep', text: '·' }),
            h('span', { class: 'who' }, avatar(b.staff.photo_url, pick(b.staff, 'name')), pick(b.staff, 'name')),
          ),
        ),
        icon('chevron', 'flip-ltr faint'),
      ),
    ));
  });
  if (!nowPlaced && bookings.length) rows.push(nowLine());
  return h('div', { class: 'agenda' }, rows);
}

// ---------------------------------------------------------------- a booking taken by the salon

function openNewBooking(store, app, { date, today }, onDone) {
  const services = store.services.filter((s) => s.active);
  const staff = store.staff.filter((m) => m.active);
  const state = { serviceId: services[0]?.id, staffId: null, date: date < today ? today : date, slot: null };

  const serviceRow = h('div', { class: 'scroller' });
  const staffRow = h('div', { class: 'scroller' });
  const slotsBox = h('div', { class: 'slots-box' });
  const name = input({ name: 'name', maxlength: 60, autocomplete: 'off' });
  const phone = input({ name: 'phone', type: 'tel', inputmode: 'tel', autocomplete: 'off' });
  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('sched.save'), disabled: true });

  const strip = dayStrip({
    days: Array.from({ length: AHEAD_DAYS + 1 }, (_, i) => ({ date: addDays(today, i) })),
    today,
    selected: state.date,
    onPick: (d) => {
      state.date = d;
      loadSlots();
    },
  });

  const service = () => services.find((s) => s.id === state.serviceId);
  function renderServices() {
    clear(serviceRow, services.map((s) => h(
      'button',
      { class: `chip-btn ${s.id === state.serviceId ? 'on' : ''}`, type: 'button', onclick: () => { state.serviceId = s.id; renderServices(); renderStaff(); loadSlots(); } },
      h('span', { class: 'emoji', text: s.icon || '✂️' }),
      pick(s, 'name'),
    )));
  }
  function renderStaff() {
    const offering = staff.filter((m) => service()?.staff_ids.includes(m.id));
    if (state.staffId && !offering.some((m) => m.id === state.staffId)) state.staffId = null;
    const chip = (id, label, img) => h(
      'button',
      { class: `chip-btn ${state.staffId === id ? 'on' : ''}`, type: 'button', onclick: () => { state.staffId = id; renderStaff(); loadSlots(); } },
      img === undefined ? icon('sparkles') : avatar(img, label),
      label,
    );
    clear(staffRow, chip(null, t('book.anyone')), offering.map((m) => chip(m.id, pick(m, 'name'), m.photo_url)));
  }

  let seq = 0;
  async function loadSlots() {
    const mine = ++seq;
    state.slot = null;
    save.disabled = true;
    clear(slotsBox, h('div', { class: 'slot-grid' }, Array.from({ length: 8 }, () => h('div', { class: 'skel', style: { height: '46px', borderRadius: '14px' } }))));
    try {
      const q = `service_id=${state.serviceId}${state.staffId ? `&staff_id=${state.staffId}` : ''}&date=${state.date}`;
      const res = await api('GET', `/api/manage/availability?${q}`);
      if (mine !== seq) return;
      clear(slotsBox, slotGrid({
        slots: res.slots,
        selected: null,
        onPick: (s) => {
          state.slot = s;
          save.disabled = false;
        },
      }));
    } catch (err) {
      if (mine === seq) clear(slotsBox, h('p', { class: 'empty small', text: errorText(err) }));
    }
  }

  const form = h(
    'form',
    { class: 'new-booking', novalidate: true, onsubmit: (e) => e.preventDefault() },
    h('div', { class: 'eyebrow', text: t('sched.pick_service') }), serviceRow,
    h('div', { class: 'eyebrow', text: t('sched.pick_staff') }), staffRow,
    h('div', { class: 'eyebrow', text: t('sched.pick_time') }), strip.el, slotsBox,
    h('div', { class: 'eyebrow', text: t('sched.customer') }),
    field(t('sched.customer_name'), name),
    h('div', { class: 'phone-input', style: { marginTop: '12px' } }, h('div', { class: 'cc', text: `+${app.ctx.tenant.calling_code}` }), field(t('sched.customer_phone'), phone)),
  );
  renderServices();
  renderStaff();
  loadSlots();

  const panel = sheet({ title: t('sched.add'), body: form, actions: [save], tall: true });
  save.addEventListener('click', () => busy(save, async () => {
    try {
      quiet();
      const res = await api('POST', '/api/manage/bookings', {
        service_id: state.serviceId, staff_id: state.staffId, date: state.date, time: state.slot.min, name: name.value, phone: phone.value,
      });
      panel.close();
      toast(t('sched.booked'));
      onDone(res.booking);
    } catch (err) {
      if (err.code === 'slot_taken') loadSlots();
      markInvalid(form, err);
      throw err;
    }
  }));
}

// ---------------------------------------------------------------- how booking works

function amountInput(value) {
  const el = h('input', { name: 'deposit_amount', inputmode: 'decimal', autocomplete: 'off', value, dir: 'ltr' });
  el.addEventListener('input', () => {
    el.value = westernDigits(el.value).replace(/[^\d.]/g, '');
  });
  return el;
}

export function openBookingSettings(store, onSaved) {
  const s = store.salon;
  const online = switchRow(t('bs.online'), t('bs.online_sub'), s.booking_enabled);
  const cliq = switchRow(t('bs.cliq'), t('bs.cliq_sub'), s.cliq_required);
  const alias = input({ name: 'cliq_alias', value: s.cliq_alias ?? '', maxlength: 60, dir: 'ltr', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const holder = input({ name: 'cliq_name', value: s.cliq_name ?? '', maxlength: 80 });
  const amount = amountInput(s.deposit_amount ? String(Number(s.deposit_amount)) : '');
  let kind = s.deposit_kind;
  let windowMin = s.payment_window_min;

  const kindSwitch = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': t('bs.deposit') }, ['fixed', 'full'].map((k) => {
    const radio = h('input', { type: 'radio', name: 'deposit_kind', value: k, checked: k === kind });
    radio.addEventListener('change', () => {
      kind = k;
      sync();
    });
    return h('label', null, radio, h('span', { text: t(`bs.${k}`) }));
  }));
  const amountField = field(t('bs.amount'), amount, { suffix: currencySymbol(s.currency) });
  const windowRow = h('div', { class: 'scroller' });
  const renderWindows = () => clear(windowRow, WINDOWS.map((m) => h('button', {
    class: `chip-btn num ${m === windowMin ? 'on' : ''}`, type: 'button', text: t('bs.minutes', { n: m }),
    onclick: () => { windowMin = m; renderWindows(); sync(); },
  })));
  renderWindows();

  const example = h('div', { class: 'notice' });
  const instant = h('div', { class: 'notice calm' }, icon('checkCircle'), h('span', { text: t('bs.instant') }));
  const cliqGroup = h(
    'div',
    { class: 'fold' },
    h(
      'div',
      { class: 'fold-inner stack' },
      field(t('bs.alias'), alias, { hint: t('bs.alias_hint') }),
      field(t('bs.name'), holder, { hint: t('bs.name_hint'), optional: true }),
      h('div', { class: 'eyebrow', text: t('bs.deposit') }),
      kindSwitch,
      amountField,
      h('div', { class: 'eyebrow', text: t('bs.window') }),
      windowRow,
      h('div', null, h('div', { class: 'eyebrow', text: t('bs.example') }), example),
    ),
  );

  function sync() {
    const on = cliq.input.checked;
    cliqGroup.classList.toggle('open', on);
    cliqGroup.inert = !on;
    instant.hidden = on || !online.input.checked;
    amountField.hidden = kind !== 'fixed';
    const shown = kind === 'full' ? t('bs.full_note') : t('book.deposit_note', { amount: fmtPrice(amount.value || '0', s.currency), min: windowMin });
    clear(example, icon('lock'), h('span', { text: shown }));
  }
  cliq.input.addEventListener('change', sync);
  online.input.addEventListener('change', sync);
  amount.addEventListener('input', sync);
  sync();

  const form = h('form', { class: 'stack', novalidate: true, onsubmit: (e) => e.preventDefault() }, h('div', { class: 'card flush' }, online.el, cliq.el), cliqGroup, instant);
  const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('save') });
  const panel = sheet({ title: t('bs.title'), body: form, actions: [save], tall: true });
  save.addEventListener('click', () => busy(save, async () => {
    const body = {
      booking_enabled: online.input.checked,
      cliq_required: cliq.input.checked,
      cliq_alias: alias.value.trim(),
      cliq_name: holder.value.trim(),
      deposit_kind: kind,
      payment_window_min: windowMin,
    };
    if (kind === 'fixed' || amount.value) body.deposit_amount = amount.value;
    try {
      const res = await api('PATCH', '/api/manage/salon', body);
      store.set({ salon: res.salon });
      panel.close();
      toast(t('bs.saved'));
      onSaved?.();
    } catch (err) {
      markInvalid(form, err);
      throw err;
    }
  }));
}

// ---------------------------------------------------------------- page

export function bookingsPage(store, app) {
  const el = h('div', { class: 'sched' });
  const state = { today: null, date: viewDate, staffId: null, day: [], counts: {}, attention: [], loaded: false };
  const known = new Set();
  // What is already on screen, per list: only new rows animate in.
  const seenDay = new Set();
  const seenAttention = new Set();

  const settingsBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('sched.settings'), title: t('sched.settings'), onclick: () => openBookingSettings(store, render) }, icon('sliders'));
  const addBtn = h('button', { class: 'icon-btn primary-icon', type: 'button', 'aria-label': t('sched.add'), title: t('sched.add'), onclick: () => openNewBooking(store, app, state, onCreated) }, icon('plus'));
  const head = h('div', { class: 's-head' }, h('div', { class: 'grow' }, h('h1', { class: 's-title', text: t('sched.title') }), h('p', { class: 's-sub', text: t('sched.sub') })), settingsBtn, addBtn);

  const stripBox = h('div', { class: 'sched-strip' }, h('div', { class: 'skel', style: { height: '78px', borderRadius: '18px' } }));
  const attentionBox = h('div');
  const offBox = h('div');
  const dayBox = h('div', null, h('div', { class: 'skel', style: { height: '72px', borderRadius: '18px', marginTop: '18px' } }), h('div', { class: 'skel', style: { height: '72px', borderRadius: '18px', marginTop: '10px' } }));
  el.append(head, offBox, attentionBox, stripBox, dayBox);

  function onCreated(b) {
    state.date = b.date;
    viewDate = b.date;
    load();
    store.refreshBadges();
  }
  const onChange = () => {
    load();
    store.refreshBadges();
  };
  const open = (b) => openDetail({ ...store, today: state.today }, b, onChange);

  async function load() {
    try {
      const [overview, day] = await Promise.all([
        api('GET', `/api/manage/bookings/overview?days=${PAST_DAYS + AHEAD_DAYS + 1}`),
        api('GET', `/api/manage/bookings${state.date ? `?date=${state.date}` : ''}`),
      ]);
      state.today = overview.today;
      state.counts = overview.counts;
      state.attention = overview.attention;
      state.date = day.date;
      state.day = day.bookings;
      for (const b of [...day.bookings, ...overview.attention]) known.add(b.id);
      state.loaded = true;
      render();
    } catch (err) {
      clear(dayBox, h('p', { class: 'empty', text: errorText(err) }));
    }
  }

  async function loadDay(date) {
    state.date = date;
    viewDate = date;
    try {
      const day = await api('GET', `/api/manage/bookings?date=${date}`);
      if (state.date !== date) return;
      state.day = day.bookings;
      for (const b of day.bookings) known.add(b.id);
      seenDay.clear();
      renderDay();
    } catch (err) {
      clear(dayBox, h('p', { class: 'empty', text: errorText(err) }));
    }
  }

  function renderStrip() {
    const from = addDays(state.today, -PAST_DAYS);
    const days = Array.from({ length: PAST_DAYS + AHEAD_DAYS + 1 }, (_, i) => {
      const date = addDays(from, i);
      return { date, badge: state.counts[date] || 0 };
    });
    // Keep a date picked far outside the strip reachable.
    if (!days.some((d) => d.date === state.date)) days.push({ date: state.date, badge: state.counts[state.date] || 0 });
    clear(stripBox, dayStrip({ days, today: state.today, selected: state.date, onPick: loadDay }).el);
  }

  function renderDay() {
    const cur = store.salon.currency;
    const staffOnDay = new Map();
    for (const b of state.day) staffOnDay.set(b.staff.id, b.staff);
    const team = store.staff.filter((m) => m.active || staffOnDay.has(m.id));
    if (state.staffId && !team.some((m) => m.id === state.staffId)) state.staffId = null;
    const shown = state.day.filter((b) => !state.staffId || b.staff.id === state.staffId);
    const live = shown.filter((b) => COUNTED.has(b.status));
    const revenue = sum(live.filter((b) => b.status !== 'no_show'));

    const filter = team.length > 1
      ? h('div', { class: 'scroller staff-filter' }, [
          h('button', { class: `chip-btn ${state.staffId ? '' : 'on'}`, type: 'button', text: t('sched.all'), onclick: () => { state.staffId = null; renderDay(); } }),
          ...team.map((m) => h(
            'button',
            { class: `chip-btn ${state.staffId === m.id ? 'on' : ''}`, type: 'button', onclick: () => { state.staffId = m.id; renderDay(); } },
            avatar(m.photo_url, pick(m, 'name')),
            pick(m, 'name'),
          )),
        ])
      : null;

    const summary = h(
      'div',
      { class: 'sched-summary' },
      h('div', null, h('div', { class: 'day-title', text: `${dayLabel(state.date, state.today)} · ${fmtDate(state.date, { day: 'numeric', month: 'long' })}` }), h('div', { class: 'small muted num', text: live.length ? `${t('sched.count', { n: live.length })} · ${t('sched.revenue', { amount: fmtPrice(revenue, cur) })}` : t('sched.count', { n: 0 }) })),
    );

    const list = shown.length
      ? agenda(store, shown, { isToday: state.date === state.today, onOpen: open, seen: seenDay })
      : h(
          'div',
          { class: 'card empty-day' },
          h('div', { class: 'tile' }, icon('calendar')),
          h('p', { class: 'muted', text: t('sched.empty') }),
          state.date >= state.today ? h('button', { class: 'btn btn-secondary btn-sm', type: 'button', onclick: () => openNewBooking(store, app, state, onCreated) }, icon('plus'), t('sched.add')) : null,
        );
    if (!shown.length && !seenDay.has('empty')) {
      list.classList.add('rise');
      seenDay.add('empty');
    }
    clear(dayBox, summary, filter, list);
  }

  function render() {
    if (!state.loaded) return;
    clear(offBox, store.salon.booking_enabled ? null : h(
      'div',
      { class: 'notice off-note' },
      icon('eyeOff'),
      h('span', { class: 'grow', text: t('sched.off') }),
      h('button', { class: 'btn btn-secondary btn-sm', type: 'button', text: t('sched.turn_on'), onclick: () => openBookingSettings(store, render) }),
    ));
    clear(attentionBox, attentionSection({ ...store, today: state.today }, state.attention, onChange, seenAttention));
    renderStrip();
    renderDay();
  }

  // Live: a new booking or a deposit sent shows up without a refresh.
  let reloadTimer = null;
  store.onBooking((e) => {
    if (Date.now() > quietUntil) {
      if (e.status === 'payment_sent') toast(t('sched.payment_arrived'));
      else if (!known.has(e.id) && HOLDING.has(e.status)) toast(t('sched.new_plain'));
    }
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(load, 250);
  });
  // The now line moves, and deposit holds run out.
  const tick = setInterval(() => state.loaded && load(), 60_000);
  app.onUnmount(() => {
    clearInterval(tick);
    clearTimeout(reloadTimer);
  });

  load();
  return el;
}
