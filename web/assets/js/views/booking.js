// Customer booking: a four-step sheet (service, who, when, details) and the booking's
// own page, which walks the customer through a CliQ deposit when the salon asks for one.
import { api, pickImage, prepareImage } from '../api.js';
import { appIcon, appReady, avatar, busy, clear, confirmDelete, field, h, icon, input, markInvalid, sheet, sparkles, stagger, toast, toastError } from '../dom.js';
import { errorText, fmtDuration, fmtPrice, fmtTime, pick, t, westernDigits } from '../i18n.js';
import { dayLabel, dayStrip, fmtDate, slotGrid } from '../slots.js';
import { applyColors } from '../theme.js';

// ---------------------------------------------------------------- this device's bookings

const safe = (fn, fallback) => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};
const listKey = (salonId) => `bookings:${salonId}`;
export const myBookings = (salonId) => safe(() => JSON.parse(localStorage.getItem(listKey(salonId)) || '[]'), []);
function remember(salonId, item) {
  const list = [item, ...myBookings(salonId).filter((b) => b.token !== item.token)].slice(0, 10);
  safe(() => localStorage.setItem(listKey(salonId), JSON.stringify(list)));
}
const me = () => safe(() => JSON.parse(localStorage.getItem('me') || '{}'), {});
const rememberMe = (name, phone) => safe(() => localStorage.setItem('me', JSON.stringify({ name, phone })));

/** International digits for a wa.me link; local Jordanian numbers get 962. */
export function waNumber(phone) {
  let d = westernDigits(phone || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = `962${d.slice(1)}`;
  return d;
}

// ---------------------------------------------------------------- the booking sheet

export function openBooking(app, data, { serviceId, onClose } = {}) {
  const { salon, services, staff } = data;
  const staffById = new Map(staff.map((m) => [m.id, m]));
  const state = { step: serviceId ? 2 : 1, serviceId, staffId: null, date: null, today: null, slot: null };
  const saved = me();

  const progress = h('div', { class: 'book-progress', 'aria-hidden': 'true' }, [1, 2, 3, 4].map(() => h('i')));
  const body = h('div');
  const back = h('button', { class: 'btn btn-secondary', type: 'button', text: t('book.back') });
  const next = h('button', { class: 'btn btn-primary', type: 'button' });
  const panel = sheet({ title: t('book.title'), body: h('div', null, progress, body), actions: [back, next], tall: true, onClose });
  const title = panel.el.querySelector('.sheet-head h2');

  const service = () => services.find((s) => s.id === state.serviceId);
  const go = (step) => {
    state.step = step;
    render();
  };
  back.addEventListener('click', () => go(state.step - 1));

  function render() {
    [...progress.children].forEach((bar, i) => bar.classList.toggle('on', i < state.step));
    back.hidden = state.step === 1 || (state.step === 2 && serviceId && services.length === 1);
    next.hidden = state.step < 3;
    title.textContent = t(['book.step_service', 'book.step_staff', 'book.step_time', 'book.step_details'][state.step - 1]);
    clear(body);
    const view = [stepService, stepStaff, stepTime, stepDetails][state.step - 1]();
    body.append(view);
    panel.el.querySelector('.sheet-body').scrollTop = 0;
  }

  function stepService() {
    return h('div', { class: 'card flush' }, stagger(services.map((s) => h(
      'button',
      { class: 'svc', type: 'button', onclick: () => { state.serviceId = s.id; state.slot = null; go(2); } },
      h('div', { class: 'tile emoji-tile', text: s.icon || '✂️' }),
      h('div', { class: 'grow' }, h('div', { class: 'name', text: pick(s, 'name') }), h('div', { class: 'meta', text: fmtDuration(s.duration_min) })),
      h('div', { class: 'price num' }, s.price_is_from ? h('small', { text: t('pub.from') }) : null, fmtPrice(s.price, salon.currency)),
    ))));
  }

  function stepStaff() {
    const offering = service().staff_ids.map((id) => staffById.get(id)).filter(Boolean);
    const pickStaff = (id) => () => {
      state.staffId = id;
      state.slot = null;
      go(3);
    };
    return h(
      'div',
      { class: 'pick-grid' },
      stagger([
        h('button', { class: 'pick-card anyone', type: 'button', onclick: pickStaff(null) }, h('div', { class: 'tile' }, icon('sparkles')), h('div', { class: 'nm', text: t('book.anyone') }), h('div', { class: 'sub', text: t('book.anyone_sub') })),
        ...offering.map((m) => h(
          'button',
          { class: 'pick-card', type: 'button', onclick: pickStaff(m.id) },
          avatar(m.photo_url, pick(m, 'name'), 'lg'),
          h('div', { class: 'nm', text: pick(m, 'name') }),
          pick(m, 'title') ? h('div', { class: 'sub', text: pick(m, 'title') }) : null,
        )),
      ]),
    );
  }

  function stepTime() {
    next.textContent = t('book.next');
    next.disabled = !state.slot;
    next.onclick = () => go(4);
    const strip = h('div', null, h('div', { class: 'skel', style: { height: '78px', borderRadius: '18px' } }));
    const slotsBox = h('div', { style: { marginTop: '18px' } });
    const q = `service_id=${state.serviceId}${state.staffId ? `&staff_id=${state.staffId}` : ''}`;
    const loadSlots = async (date) => {
      state.date = date;
      clear(slotsBox, h('div', { class: 'slot-grid' }, Array.from({ length: 8 }, () => h('div', { class: 'skel', style: { height: '46px', borderRadius: '14px' } }))));
      try {
        const res = await api('GET', `/api/public/availability?${q}&date=${date}`);
        if (state.date !== date) return;
        clear(slotsBox, slotGrid({
          slots: res.slots,
          selected: state.slot?.date === date ? state.slot.min : null,
          onPick: (s) => {
            state.slot = { ...s, date };
            next.disabled = false;
          },
        }));
      } catch (err) {
        clear(slotsBox, h('p', { class: 'empty small', text: errorText(err) }));
      }
    };
    api('GET', `/api/public/days?${q}`).then((res) => {
      state.today = res.today;
      const first = state.slot?.date ?? res.days.find((d) => d.slots > 0)?.date ?? res.today;
      clear(strip, dayStrip({
        days: res.days.map((d) => ({ date: d.date, disabled: d.slots === 0 })),
        today: res.today,
        selected: first,
        onPick: (date) => {
          if (state.slot && state.slot.date !== date) {
            state.slot = null;
            next.disabled = true;
          }
          loadSlots(date);
        },
      }).el);
      loadSlots(first);
    }).catch((err) => clear(strip, h('p', { class: 'empty small', text: errorText(err) })));
    return h('div', null, strip, slotsBox);
  }

  function stepDetails() {
    const s = service();
    const who = state.staffId ? pick(staffById.get(state.staffId), 'name') : t('book.anyone');
    const name = input({ name: 'name', value: saved.name ?? '', maxlength: 60, autocomplete: 'name' });
    const phone = input({ name: 'phone', type: 'tel', inputmode: 'tel', value: saved.phone ?? '', autocomplete: 'tel' });
    const deposit = salon.cliq_required
      ? (salon.deposit_kind === 'full' ? Number(s.price) : Math.min(Number(salon.deposit_amount), Number(s.price)))
      : 0;
    const form = h(
      'form',
      { novalidate: true },
      h(
        'div',
        { class: 'card summary' },
        h('div', { class: 'row' }, h('div', { class: 'tile emoji-tile', text: s.icon || '✂️' }), h('div', { class: 'grow' }, h('div', { class: 'name', text: pick(s, 'name') }), h('div', { class: 'small muted', text: `${t('bk.with')} ${who} · ${fmtDuration(s.duration_min)}` })), h('b', { class: 'num', text: fmtPrice(s.price, salon.currency) })),
        h('div', { class: 'when' }, icon('clock'), h('span', { text: `${dayLabel(state.slot.date, state.today)} · ${fmtDate(state.slot.date, { day: 'numeric', month: 'long' })} · ${fmtTime(state.slot.time)}` })),
      ),
      h('div', { style: { marginTop: '16px' } }, field(t('book.name'), name)),
      h('div', { class: 'phone-input', style: { marginTop: '12px' } }, h('div', { class: 'cc', text: `+${app.ctx.tenant.calling_code}` }), field(t('book.phone'), phone)),
      deposit > 0 ? h('div', { class: 'notice' }, icon('lock'), h('span', { text: t('book.deposit_note', { amount: fmtPrice(deposit, salon.currency), min: salon.payment_window_min }) })) : null,
    );
    next.textContent = t('book.confirm');
    next.disabled = false;
    next.onclick = () => busy(next, async () => {
      try {
        const res = await api('POST', '/api/public/bookings', {
          service_id: s.id, staff_id: state.staffId, date: state.slot.date, time: state.slot.min, name: name.value, phone: phone.value,
        });
        rememberMe(name.value.trim(), phone.value.trim());
        remember(salon.id, { token: res.token, date: res.booking.date, start: res.booking.start, service_ar: s.name_ar, service_en: s.name_en });
        panel.close();
        app.go(`/b/${res.token}`);
      } catch (err) {
        if (err.code === 'slot_taken') {
          state.slot = null;
          toastError(err);
          go(3);
          return;
        }
        markInvalid(form, err);
        throw err;
      }
    });
    return form;
  }

  render();
}

// ---------------------------------------------------------------- the booking's page

const LIVE = new Set(['pending_payment', 'payment_sent']);

function countdown(seconds) {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function statusIcon(status) {
  const kind = { confirmed: 'ok', completed: 'ok', pending_payment: 'wait', payment_sent: 'pulse', expired: 'off', cancelled: 'off', no_show: 'off' }[status];
  const name = { ok: 'check', wait: 'lock', pulse: 'clock', off: 'x' }[kind];
  return h('div', { class: `status-icon ${kind}` }, icon(name));
}

export function bookingPage(app, token) {
  const el = h('div', { class: 'booking-page' }, h('div', { class: 'boot' }, h('div', { class: 'spinner' })));
  const salonCtx = app.ctx.salon;
  if (salonCtx) applyColors(salonCtx.color_primary, salonCtx.color_accent);
  let booking = null;
  let tick = null;
  let poll = null;
  let remaining = 0;
  // The screenshot picked but not sent yet; survives re-renders.
  let proofFile = null;
  let proofPreview = null;
  const setProof = (file) => {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    proofFile = file;
    proofPreview = file ? URL.createObjectURL(file) : null;
  };
  app.onUnmount(() => {
    clearInterval(tick);
    clearInterval(poll);
    setProof(null);
  });

  async function load() {
    try {
      const res = await api('GET', `/api/public/bookings/${token}`);
      const first = !booking;
      const changed = !first && booking.status !== res.booking.status;
      booking = res.booking;
      // Polling only redraws when something happened, so a half-filled form stays put.
      if (first || changed) render(changed);
      if (first) appReady();
    } catch (err) {
      clear(el, h('div', { class: 'page' }, h('p', { class: 'empty', text: errorText(err) }), h('a', { class: 'btn btn-secondary btn-block', href: '/', text: t('bk.back') })));
      appReady();
    }
  }

  function render(changed = false) {
    const b = booking;
    const s = b.salon;
    clearInterval(tick);
    clearInterval(poll);
    if (LIVE.has(b.status)) poll = setInterval(load, 12_000);

    const rejected = b.status === 'cancelled' && b.payment_rejected;
    const titleKey = rejected ? 'bk.rejected' : `bk.${b.status}`;
    const sub = rejected ? t('bk.rejected_sub') : {
      confirmed: t('bk.confirmed_sub', { day: `${fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long' })}`, time: fmtTime(b.start) }),
      pending_payment: t('bk.pending_sub'),
      payment_sent: t('bk.payment_sent_sub'),
      expired: t('bk.expired_sub'),
    }[b.status];

    const hero = h(
      'section',
      { class: `status-hero ${changed ? 'rise' : ''}` },
      statusIcon(b.status),
      h('h1', { text: t(titleKey) }),
      sub ? h('p', { text: sub }) : null,
    );

    const cliq = b.status === 'pending_payment' ? cliqCard(b) : null;
    const proof = b.status === 'payment_sent' && b.proof_url ? proofCard(b) : null;
    const wa = waNumber(s.phone);
    const contact = rejected && s.phone
      ? h('a', { class: 'btn btn-secondary btn-block', href: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(t('bk.contact_text', { id: b.id }))}` : `tel:${s.phone}`, target: '_blank', rel: 'noopener' }, icon(wa ? 'chat' : 'phone'), t('bk.contact'))
      : null;
    const details = h(
      'section',
      { class: 'card details' },
      h('div', { class: 'row' }, h('div', { class: 'tile emoji-tile', text: b.service.icon || '✂️' }), h('div', { class: 'grow' }, h('div', { class: 'name', text: pick(b.service, 'name') }), h('div', { class: 'small muted', text: `${fmtTime(b.start)} – ${fmtTime(b.end)}` })), h('b', { class: 'num', text: fmtPrice(b.price, s.currency) })),
      h('div', { class: 'kv' }, icon('clock'), h('span', { text: `${fmtDate(b.date)} · ${fmtTime(b.start)}` })),
      h('div', { class: 'kv' }, avatar(b.staff.photo_url, pick(b.staff, 'name')), h('span', { text: `${t('bk.with')} ${pick(b.staff, 'name')}` })),
      Number(b.deposit) > 0 ? h('div', { class: 'kv' }, icon('lock'), h('span', { text: `${t('bk.deposit')}: ${fmtPrice(b.deposit, s.currency)}` })) : null,
      h('div', { class: 'kv faint small' }, h('span', { text: `${t('bk.number')} #${b.id}` })),
    );

    const cancel = LIVE.has(b.status) || (b.status === 'confirmed' && b.upcoming)
      ? h('button', { class: 'btn btn-ghost btn-block', type: 'button', text: t('bk.cancel') })
      : null;
    cancel?.addEventListener('click', async () => {
      if (!(await confirmDelete({ title: t('bk.cancel'), message: t('bk.cancel_confirm'), yesText: t('bk.cancel') }))) return;
      busy(cancel, async () => {
        booking = (await api('POST', `/api/public/bookings/${token}/cancel`)).booking;
        render(true);
      });
    });
    const again = ['expired', 'cancelled', 'completed', 'no_show'].includes(b.status)
      ? h('a', { class: 'btn btn-primary btn-block', href: '/', text: t('bk.book_again') })
      : null;

    clear(
      el,
      h('header', { class: 'booking-top' }, h('a', { class: 'icon-btn plain', href: '/', 'aria-label': t('bk.back') }, icon('arrow', 'flip-rtl')), appIcon(s.logo_url), h('span', { class: 'grow truncate', text: pick(s, 'name') })),
      h('main', { class: 'page stack-lg' }, stagger([hero, cliq, proof, details, contact, again, cancel].filter(Boolean))),
    );
    if (changed && ['confirmed'].includes(b.status)) requestAnimationFrame(() => sparkles(hero.querySelector('.status-icon')));
  }

  function cliqCard(b) {
    const s = b.salon;
    remaining = b.expires_in_s;
    const clock = h('b', { class: 'num', text: countdown(remaining) });
    tick = setInterval(() => {
      remaining -= 1;
      clock.textContent = countdown(remaining);
      if (remaining <= 0) {
        clearInterval(tick);
        load();
      }
    }, 1000);
    const copy = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('copy') }, icon('copy'));
    copy.addEventListener('click', async () => {
      await navigator.clipboard?.writeText(s.cliq_alias).catch(() => {});
      toast(t('bk.copied'));
    });
    const note = input({ name: 'note', maxlength: 120, value: me().name ?? '' });
    const sent = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, icon('check'), t('bk.sent'));
    const drop = h('button', { class: 'proof-drop', type: 'button', name: 'proof' });
    const renderDrop = () => {
      drop.classList.toggle('has', !!proofFile);
      sent.disabled = !proofFile;
      if (proofFile) {
        clear(drop, h('img', { src: proofPreview, alt: t('bk.your_proof') }), h('span', { class: 'change' }, icon('camera'), t('bk.change_photo')));
      } else {
        clear(drop, h('div', { class: 'tile' }, icon('image')), h('div', { class: 'grow' }, h('b', { text: t('bk.upload') }), h('span', { text: t('bk.upload_sub') })), icon('plus', 'faint'));
      }
    };
    drop.addEventListener('click', async () => {
      const file = await pickImage();
      if (!file) return;
      setProof(file);
      renderDrop();
    });
    renderDrop();
    sent.addEventListener('click', () => busy(sent, async () => {
      try {
        await api('PUT', `/api/public/bookings/${token}/proof`, await prepareImage(proofFile, 3000));
        booking = (await api('POST', `/api/public/bookings/${token}/sent`, { note: note.value })).booking;
        setProof(null);
        render(true);
      } catch (err) {
        if (err.code === 'not_pending') load();
        throw err;
      }
    }));
    const amount = fmtPrice(b.deposit, s.currency);
    return h(
      'section',
      { class: 'card cliq-card' },
      h('div', { class: 'row between' }, h('div', null, h('div', { class: 'eyebrow', text: t('bk.deposit') }), h('div', { class: 'amount num', text: amount })), h('div', { class: 'timer' }, h('span', { class: 'small muted', text: t('bk.expires_in') }), clock)),
      h('ol', { class: 'cliq-steps' },
        h('li', { text: t('bk.step1') }),
        h('li', null, t('bk.step2', { amount }), h('div', { class: 'alias' }, h('span', { class: 'ltr', text: s.cliq_alias }), copy), s.cliq_name ? h('div', { class: 'small muted', text: `${t('bk.beneficiary')}: ${s.cliq_name}` }) : null),
        h('li', { text: t('bk.step3') }),
      ),
      drop,
      h('div', { style: { marginTop: '12px' } }, field(t('bk.sender'), note, { optional: true })),
      h('div', { style: { marginTop: '12px' } }, sent),
    );
  }

  /** While the salon reviews: the screenshot they are looking at, replaceable if it was the wrong one. */
  function proofCard(b) {
    const replace = h('button', { class: 'link-btn', type: 'button' }, icon('camera'), t('bk.replace'));
    replace.addEventListener('click', async () => {
      const file = await pickImage();
      if (!file) return;
      busy(replace, async () => {
        booking = (await api('PUT', `/api/public/bookings/${token}/proof`, await prepareImage(file, 3000))).booking;
        toast(t('bk.replaced'));
        render(false);
      });
    });
    return h(
      'section',
      { class: 'card proof-card' },
      h('div', { class: 'row between' }, h('div', { class: 'eyebrow', text: t('bk.your_proof') }), replace),
      h('img', { class: 'proof-img', src: b.proof_url, alt: t('bk.your_proof') }),
    );
  }

  load();
  return el;
}

/** "Your bookings" on the salon page: upcoming ones made on this device. */
export function myBookingsCard(salon) {
  const list = myBookings(salon.id);
  if (!list.length) return null;
  const box = h('div', { class: 'card flush' });
  const section = h('section', { hidden: true }, h('div', { class: 'p-head' }, h('h2', { text: t('book.mine') })), box);
  Promise.all(list.slice(0, 5).map((item) => api('GET', `/api/public/bookings/${item.token}`).then((r) => ({ ...item, booking: r.booking })).catch(() => null)))
    .then((rows) => {
      const live = rows.filter((r) => r && (r.booking.upcoming || LIVE.has(r.booking.status)) && !['cancelled', 'expired'].includes(r.booking.status));
      if (!live.length) return;
      clear(box, h('ul', { class: 'list' }, live.map((r) => h(
        'li',
        null,
        h(
          'a',
          { class: 'svc', href: `/b/${r.token}` },
          h('div', { class: 'tile emoji-tile', text: r.booking.service.icon || '✂️' }),
          h('div', { class: 'grow' }, h('div', { class: 'name', text: pick(r.booking.service, 'name') }), h('div', { class: 'meta', text: `${fmtDate(r.booking.date, { weekday: 'long', day: 'numeric', month: 'short' })} · ${fmtTime(r.booking.start)}` })),
          h('span', { class: `pill status-${r.booking.status}`, text: r.booking.status === 'payment_sent' ? t('bk.payment_sent') : t(`status.${r.booking.status}`) }),
        ),
      ))));
      section.hidden = false;
    });
  return section;
}
