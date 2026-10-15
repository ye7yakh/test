// Customer booking: a four-step sheet (service, who, when, details) and the booking's
// own page, which walks the customer through a CliQ deposit when the salon asks for one.
import { api, pickImage, prepareImage } from '../api.js';
import { appIcon, appReady, avatar, busy, clear, confetti, confirmDelete, field, h, icon, input, legalLink, markInvalid, salonIcon, sheet, sparkles, stagger, toast, toastError } from '../dom.js';
import { errorText, fmtDuration, fmtPrice, fmtTime, getLang, lookName, pick, t, westernDigits } from '../i18n.js';
import { addDays, dateOf, dayLabel, dayStrip, fmtDate, fmtRange, monthCaption, periodIcon, slotGrid } from '../slots.js';
import { applyColors, reducedMotion } from '../theme.js';

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

// ---------------------------------------------------------------- small helpers

const finePointer = () => matchMedia('(pointer: fine)').matches;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** Minutes past midnight as "HH:MM" (wrapping past 24:00). */
const clockOf = (min) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const toMin = (hhmm) => {
  const [hh, mm] = hhmm.split(':').map(Number);
  return hh * 60 + mm;
};

/** A slot's own calendar day: times after midnight belong to the next date. */
const slotDay = (slot) => (slot.next_day || slot.min >= 1440 ? addDays(slot.date, 1) : slot.date);

/**
 * A slot's day in words. What is left of last night's opening (listed under yesterday,
 * after midnight) is "tonight"; any other time goes by its own calendar day: today,
 * tomorrow or the weekday.
 */
const slotDayText = (slot, today) => (today && slot.date < today ? t('book.tonight') : dayLabel(slotDay(slot), today));

/** Today's date and the minutes past midnight in a time zone (the browser's when unknown). */
function zonedNow(timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (k) => parts.find((p) => p.type === k)?.value;
    return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: (Number(get('hour')) % 24) * 60 + Number(get('minute')) };
  } catch {
    return null;
  }
}

/** The moment a wall-clock time in a time zone happens, as a Date. */
function zonedToUtc(date, hhmm, timeZone) {
  const [y, mo, d] = date.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, d, hh, mm);
  const offsetAt = (ms) => {
    try {
      const p = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric',
      }).formatToParts(new Date(ms));
      const g = (k) => Number(p.find((x) => x.type === k)?.value);
      return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute')) - Math.floor(ms / 60_000) * 60_000;
    } catch {
      return -new Date(ms).getTimezoneOffset() * 60_000;
    }
  };
  let utc = wall - offsetAt(wall);
  utc = wall - offsetAt(utc);
  return new Date(utc);
}

/** Copies text; falls back to the old selection trick where the clipboard API is missing. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = h('textarea', { class: 'clip-buffer', readonly: true, tabindex: '-1', 'aria-hidden': 'true' });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    area.remove();
    return ok;
  }
}

/** A copy control's moment of feedback: its icon turns into a check for a beat. */
function flashCopied(el, iconBox) {
  el.classList.add('copied');
  clear(iconBox, icon('check'));
  clearTimeout(el._copyTimer);
  el._copyTimer = setTimeout(() => {
    el.classList.remove('copied');
    clear(iconBox, icon('copy'));
  }, 1600);
}

/**
 * The booking as a ticket: when, on top; a perforation; then what, with whom and the
 * deposit. The same ticket is the summary before booking and the booking's own page.
 */
function ticket({ date, start, end, today, label, note, number, service, duration, price, priceFrom, currency, staff, look = null, deposit = 0, isVoid = false }) {
  const weekday = fmtDate(date, { weekday: 'long' });
  const relative = label || (today ? dayLabel(date, today) : weekday);
  return h(
    'section',
    { class: `ticket${isVoid ? ' void' : ''}`, 'aria-label': t('book.summary') },
    h(
      'div',
      { class: 'tk-top' },
      h(
        'div',
        { class: 'tk-when' },
        h('div', { class: 'eyebrow', text: relative === weekday ? weekday : `${relative} · ${weekday}` }),
        h('b', { class: 'num', text: fmtDate(date, { day: 'numeric', month: 'long' }) }),
        h('span', { class: 'tk-time num' }, icon('clock'), fmtRange(start, end)),
        note ? h('span', { class: 'tk-note' }, note) : null,
      ),
      number ? h('div', { class: 'tk-no' }, h('span', { class: 'eyebrow', text: t('bk.number') }), h('span', { class: 'pill num', text: `#${number}` })) : null,
    ),
    h(
      'div',
      { class: 'tk-body' },
      h(
        'div',
        { class: 'tk-row' },
        h('span', { class: 'tk-ic emoji', 'aria-hidden': 'true', text: service.icon || '✂️' }),
        h('div', { class: 'grow' }, h('div', { class: 'tk-n' }, h('bdi', { text: service.name })), h('div', { class: 'tk-s', text: fmtDuration(duration) })),
        h('b', { class: 'tk-price num' }, priceFrom ? h('small', { text: t('pub.from') }) : null, fmtPrice(price, currency)),
      ),
      h(
        'div',
        { class: 'tk-row' },
        staff ? avatar(staff.photo, staff.name) : h('span', { class: 'tk-ic' }, icon('sparkles')),
        staff ? h('span', null, `${t('bk.with')} `, h('bdi', { text: staff.name })) : h('span', { text: t('book.anyone') }),
      ),
      // The cut tried on in the AI mirror: the picture while it is still in this tab.
      look ? h('div', { class: 'tk-row tk-look' }, look.url ? h('img', { class: 'tk-look-img', src: look.url, alt: '' }) : h('span', { class: 'tk-ic' }, icon('wand')), h('div', { class: 'grow' }, h('div', { class: 'tk-s', text: t('tryon.look_label') }), h('bdi', { class: 'tk-n', text: look.name }))) : null,
      deposit > 0 ? h('div', { class: 'tk-row' }, h('span', { class: 'tk-ic' }, icon('lock')), h('span', { text: `${t('bk.deposit')}: ${fmtPrice(deposit, currency)}` })) : null,
    ),
  );
}

// ---------------------------------------------------------------- the booking sheet

/**
 * `look` is a cut tried on in the AI mirror ({ id, name, url }): it rides along with the
 * booking so the salon knows what the customer came for.
 */
export function openBooking(app, data, { serviceId, staffId = null, onClose, look = null } = {}) {
  const { salon, staff, hours } = data;
  const staffById = new Map(staff.map((m) => [m.id, m]));
  // Opened from a team portrait: that person is the "who", so the menu is what they do
  // and the "who" step never shows. (Someone not on the team, or who does nothing on
  // the menu, is ignored: the sheet opens as usual.)
  const doneBy = (id) => data.services.filter((s) => s.staff_ids.includes(id));
  const lockedStaff = staffId != null && staffById.has(staffId) && doneBy(staffId).length ? staffId : null;
  const services = lockedStaff != null ? doneBy(lockedStaff) : data.services;
  if (serviceId != null && !services.some((s) => s.id === serviceId)) serviceId = null;
  // The salon's booking link may name a service (/book?service=3, from "book again").
  if (!serviceId && location.pathname === '/book') {
    const wanted = Number(new URLSearchParams(location.search).get('service'));
    if (services.some((s) => s.id === wanted)) serviceId = wanted;
  }
  // Someone who does just one thing: booking with them is booking that.
  if (!serviceId && lockedStaff != null && services.length === 1) serviceId = services[0].id;
  // Opened for one service of one person (a team portrait): there is no list to go back to.
  const lockedService = !!serviceId && services.length === 1;
  const state = { step: 1, serviceId: serviceId ?? null, staffId: lockedStaff, staffPicked: lockedStaff != null, date: null, today: null, slot: null };
  const saved = me();

  const service = () => services.find((s) => s.id === state.serviceId);
  /** The one person who does this service, if only one does: then "who" is not a question. */
  const soloStaff = () => {
    const ids = service()?.staff_ids ?? [];
    return ids.length === 1 ? ids[0] : null;
  };
  const query = (id) => `service_id=${state.serviceId}${id ? `&staff_id=${id}` : ''}`;

  // Free days per service and person, asked once per sheet: the "who" step's hints
  // and the time step share them. A taken slot clears them.
  const daysCache = new Map();
  const daysFor = (q) => {
    if (!daysCache.has(q)) {
      daysCache.set(q, api('GET', `/api/public/days?${q}`).catch((err) => {
        daysCache.delete(q);
        throw err;
      }));
    }
    return daysCache.get(q);
  };
  const freeCache = new Map();
  /** When someone (or anyone) is next free: { ...slot, date }, null for nothing soon, undefined on error. */
  const firstFree = (id) => {
    const q = query(id);
    if (!freeCache.has(q)) {
      freeCache.set(q, (async () => {
        const res = await daysFor(q);
        state.today ??= res.today;
        const day = res.days.find((d) => d.slots > 0);
        if (!day) return null;
        const av = await api('GET', `/api/public/availability?${q}&date=${day.date}`);
        return av.slots[0] ? { ...av.slots[0], date: day.date } : null;
      })().catch(() => undefined));
    }
    return freeCache.get(q);
  };

  const progress = h('div', { class: 'book-progress', 'aria-hidden': 'true' }, [1, 2, 3, 4].map(() => h('i')));
  const crumbs = h('div', { class: 'book-crumbs' });
  const body = h('div', { class: 'bk-step' });
  const back = h('button', { class: 'btn btn-secondary', type: 'button', text: t('book.back') });
  const next = h('button', { class: 'btn btn-primary', type: 'button' });
  const panel = sheet({ title: t('book.title'), body, actions: [back, next], tall: true, onClose });
  panel.el.classList.add('book-sheet');
  const head = panel.el.querySelector('.sheet-head');
  head.append(h('div', { class: 'book-stepper' }, progress, crumbs));
  const title = head.querySelector('h2');
  title.setAttribute('tabindex', '-1');
  const foot = panel.el.querySelector('.sheet-foot');
  const scroller = panel.el.querySelector('.sheet-body');
  // An edge under the title once the content scrolls beneath it.
  scroller.addEventListener('scroll', () => panel.el.classList.toggle('scrolled', scroller.scrollTop > 4), { passive: true });

  /** Who does it is already settled: the person the sheet was opened for, or the only one who does it. */
  const settledStaff = () => lockedStaff ?? soloStaff();
  const prevStep = () => (state.step === 3 && settledStaff() != null ? 1 : state.step - 1);
  function go(step, { first = false } = {}) {
    // Then they are the "who", and that step is skipped.
    if (step === 2 && settledStaff() != null) {
      state.staffId = settledStaff();
      state.staffPicked = true;
      step = 3;
    }
    const dir = first ? null : step >= state.step ? 'fwd' : 'back';
    state.step = step;
    render(dir);
  }
  back.addEventListener('click', () => go(prevStep()));

  const slotText = (slot) => `${slotDayText(slot, state.today)} · ${fmtTime(slot.time)}`;
  const crumb = (onClick, ...children) => h(
    onClick ? 'button' : 'span',
    { class: 'crumb', type: onClick ? 'button' : null, title: onClick ? t('book.change') : null, onclick: onClick },
    children,
  );
  function renderCrumbs(dir) {
    const s = state.step > 1 ? service() : null;
    const items = [];
    if (look) items.push(crumb(null, look.url ? h('img', { class: 'crumb-look', src: look.url, alt: '' }) : icon('wand'), h('bdi', { text: look.name })));
    if (s) {
      items.push(crumb(
        lockedService ? null : () => go(1),
        h('span', { class: 'e', 'aria-hidden': 'true', text: s.icon || '✂️' }),
        h('bdi', { text: pick(s, 'name') }),
        // The ticket on the last step has the length; the row stays short there.
        state.step < 4 ? h('span', { class: 'faint', text: fmtDuration(s.duration_min) }) : null,
      ));
    }
    // Opened for one person, they are named from the start: the menu below is theirs.
    if (state.staffPicked && (lockedStaff != null || (s && state.step > 2))) {
      const m = state.staffId ? staffById.get(state.staffId) : null;
      items.push(crumb(
        settledStaff() != null ? null : () => go(2),
        m ? avatar(m.photo_url, pick(m, 'name')) : icon('sparkles'),
        m ? h('span', null, `${t('bk.with')} `, h('bdi', { text: pick(m, 'name') })) : h('span', { text: t('book.anyone') }),
      ));
    }
    if (state.step > 3 && state.slot) items.push(crumb(() => go(3), icon('clock'), h('span', { class: 'num', text: slotText(state.slot) })));
    if (dir === 'fwd' && items.length) items[items.length - 1].classList.add('new');
    crumbs.hidden = !items.length;
    clear(crumbs, items);
  }

  function render(dir = null) {
    [...progress.children].forEach((bar, i) => bar.classList.toggle('on', i < state.step));
    back.hidden = state.step === 1 || (lockedService && prevStep() === 1);
    next.hidden = state.step < 3;
    // The first two steps move on with a tap on a card: no empty bar under them.
    if (foot) foot.hidden = back.hidden && next.hidden;
    title.textContent = t(['book.step_service', 'book.step_staff', 'book.step_time', 'book.step_details'][state.step - 1]);
    renderCrumbs(dir);
    body.className = 'bk-step';
    clear(body, [stepService, stepStaff, stepTime, stepDetails][state.step - 1]());
    if (dir && !reducedMotion()) {
      void body.offsetWidth; // restart the slide when the same direction repeats
      body.classList.add(dir);
    }
    scroller.scrollTop = 0;
    panel.el.classList.remove('scrolled');
    // The clicked card or button is gone: focus goes to the new step's title (or, with a
    // keyboard and mouse, straight into the first field of the details form).
    if (dir) (state.step === 4 && finePointer() ? body.querySelector('input') : title)?.focus({ preventScroll: true });
  }

  function pickService(id) {
    if (id !== state.serviceId) {
      state.serviceId = id;
      state.staffId = lockedStaff;
      state.staffPicked = lockedStaff != null;
      state.slot = null;
    }
    go(2);
  }

  function stepService() {
    const multiStaff = lockedStaff == null && staff.length > 1;
    return h('div', { class: 'p-services bk-services' }, stagger(services.map((s) => {
      // Who does it, only when that narrows things down (as on the salon's page).
      const who = multiStaff && s.staff_ids.length < staff.length ? s.staff_ids.map((id) => staffById.get(id)).filter(Boolean) : [];
      const desc = pick(s, 'description');
      return h(
        'button',
        { class: `p-svc${s.id === state.serviceId ? ' on' : ''}`, type: 'button', onclick: () => pickService(s.id) },
        h('div', { class: 'p-svc-e', 'aria-hidden': 'true', text: s.icon || '✂️' }),
        h(
          'div',
          { class: 'grow' },
          h('div', { class: 'n' }, h('bdi', { text: pick(s, 'name') })),
          desc ? h('div', { class: 'd' }, h('bdi', { text: desc })) : null,
          h(
            'div',
            { class: 'm' },
            h('span', { class: 'chip' }, icon('clock'), fmtDuration(s.duration_min)),
            who.length === 1 ? h('span', { class: 'p-svc-who' }, avatar(who[0].photo_url, pick(who[0], 'name')), h('bdi', { text: pick(who[0], 'name') })) : null,
            who.length > 1 ? h('span', { class: 'avatar-stack' }, who.slice(0, 3).map((m) => avatar(m.photo_url, pick(m, 'name')))) : null,
          ),
        ),
        h('div', { class: 'p-svc-p' }, s.price_is_from ? h('small', { text: t('pub.from') }) : null, h('b', { text: fmtPrice(s.price, salon.currency) })),
        h('span', { class: 'bk-go', 'aria-hidden': 'true' }, icon('chevron', 'flip-ltr')),
      );
    })));
  }

  function stepStaff() {
    const offering = service().staff_ids.map((id) => staffById.get(id)).filter(Boolean);
    const pickStaff = (id) => () => {
      if (!state.staffPicked || id !== state.staffId) state.slot = null;
      state.staffId = id;
      state.staffPicked = true;
      go(3);
    };
    const on = (id) => state.staffPicked && state.staffId === id;
    // "Next free" over "Tomorrow 10:00 AM", filled in as each answer arrives: two
    // lines by design, so the time never breaks apart on a narrow card.
    const hint = () => h('div', { class: 'pick-next' }, h('span', { class: 'skel' }), h('span', { class: 'skel' }));
    const fill = (box, free) => {
      if (free === undefined) return box.remove();
      box.classList.toggle('none', !free);
      clear(box, free
        ? [
          h('span', { class: 'lbl' }, h('i', { class: 'dot ok', 'aria-hidden': 'true' }), t('book.earliest_lbl')),
          h('b', { class: 'num' }, h('span', { text: slotDayText(free, state.today) }), h('span', { text: fmtTime(free.time) })),
        ]
        : h('span', { class: 'lbl', text: t('book.none_soon') }));
      return null;
    };
    const anyHint = hint();
    const cards = [h(
      'button',
      { class: `pick-card anyone${on(null) ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on(null)), onclick: pickStaff(null) },
      h('div', { class: 'tile' }, icon('sparkles')),
      h('div', { class: 'nm', text: t('book.anyone') }),
      h('div', { class: 'sub', text: t('book.anyone_sub') }),
      anyHint,
    )];
    const asks = [];
    for (const m of offering) {
      const box = hint();
      cards.push(h(
        'button',
        { class: `pick-card${on(m.id) ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on(m.id)), onclick: pickStaff(m.id) },
        avatar(m.photo_url, pick(m, 'name'), 'lg'),
        h('div', { class: 'nm', text: pick(m, 'name') }),
        pick(m, 'title') ? h('div', { class: 'sub', text: pick(m, 'title') }) : null,
        box,
      ));
      asks.push([m.id, box]);
    }
    if (asks.length <= 6) {
      const answers = asks.map(([id, box]) => firstFree(id).then((free) => {
        fill(box, free);
        return free;
      }));
      // Anyone is free as soon as the first of them is.
      Promise.all(answers).then((list) => {
        if (list.some((x) => x === undefined)) return fill(anyHint, undefined);
        const at = (x) => dateOf(x.date).getTime() / 60_000 + x.min;
        const soonest = list.filter(Boolean).sort((a, b) => at(a) - at(b))[0] ?? null;
        return fill(anyHint, soonest);
      });
    } else {
      cards.forEach((c) => c.querySelector('.pick-next')?.remove());
    }
    return h('div', { class: 'pick-grid' }, stagger(cards));
  }

  function stepTime() {
    const setNext = () => {
      next.disabled = !state.slot;
      clear(next, t('book.next'), state.slot ? h('span', { class: 'btn-sub num', text: slotText(state.slot) }) : null);
    };
    setNext();
    next.onclick = () => {
      if (state.slot) go(4);
    };
    const days = h('div', { class: 'bk-days' }, h('div', { class: 'skel bk-days-skel' }));
    const slotsBox = h('div', { class: 'bk-slots' });
    const wrap = h('div', { class: 'bk-time' }, days, slotsBox);
    // The day strip stays pinned while the times scroll; each group's title pins under it.
    if ('ResizeObserver' in window) new ResizeObserver(() => wrap.style.setProperty('--days-h', `${days.offsetHeight}px`)).observe(days);
    const q = query(state.staffId);
    let seq = 0;
    const loadSlots = async (date) => {
      const mine = ++seq;
      state.date = date;
      clear(slotsBox, h('div', { class: 'slot-grid' }, Array.from({ length: 8 }, () => h('div', { class: 'skel slot-skel' }))));
      try {
        const res = await api('GET', `/api/public/availability?${q}&date=${date}`);
        if (mine !== seq) return;
        clear(slotsBox, slotGrid({
          slots: res.slots,
          selected: state.slot?.date === date ? state.slot.min : null,
          onPick: (s) => {
            state.slot = { ...s, date };
            setNext();
          },
        }));
      } catch (err) {
        if (mine === seq) clear(slotsBox, h('p', { class: 'empty small', text: errorText(err) }));
      }
    };
    // A day without times says why when that is known: the salon is closed that day,
    // or today's hours are over. Otherwise it only says there are no times, since the
    // reason (booked up, someone's day off) is not something the page can tell.
    const ranges = (date) => (hours ? hours[dateOf(date).getUTCDay()] ?? [] : null);
    const closedDay = (date) => ranges(date)?.length === 0;
    const dayOver = (date, today) => {
      const list = ranges(date);
      const now = date === today && list?.length ? zonedNow(salon.timezone) : null;
      if (!now || now.date !== date) return false;
      const lastClose = Math.max(...list.map((r) => {
        const open = toMin(r.open);
        const close = toMin(r.close);
        return close <= open ? close + 1440 : close;
      }));
      return now.minutes + (service()?.duration_min ?? 0) > lastClose;
    };
    const emptyNote = (date, today) => t(closedDay(date) ? 'hours.closed' : dayOver(date, today) ? 'book.day_over' : 'book.no_times_day');
    daysFor(q).then((res) => {
      state.today = res.today;
      // Back here (or after a taken slot): the day the customer was looking at, if it
      // still has times; otherwise the first day that does.
      const open = (d) => d && res.days.some((x) => x.date === d && x.slots > 0);
      const first = [state.slot?.date, state.date].find(open) ?? res.days.find((d) => d.slots > 0)?.date ?? res.today;
      const strip = dayStrip({
        days: res.days.map((d) => ({
          date: d.date,
          disabled: d.slots === 0,
          note: d.slots === 0 ? emptyNote(d.date, res.today) : '',
        })),
        today: res.today,
        selected: first,
        months: 'first',
        onPick: (date) => {
          if (state.slot && state.slot.date !== date) {
            state.slot = null;
            setNext();
          }
          loadSlots(date);
        },
      });
      // What is left of last night's opening comes first, under the day it opened: it
      // reads "Tonight" with a moon, not as yesterday's date, and leaves the month out.
      for (const d of res.days.filter((x) => x.late_night)) {
        const chip = strip.el.querySelector(`[data-date="${d.date}"]`);
        if (!chip) continue;
        chip.classList.add('late');
        chip.setAttribute('aria-label', `${t('book.tonight')} · ${t('book.after_midnight')}`);
        chip.querySelector('.dw').textContent = t('book.tonight');
        clear(chip.querySelector('.dn'), periodIcon('stars'));
        chip.querySelector('.dm')?.remove();
      }
      clear(days, h('div', { class: 'bk-month', text: monthCaption(res.days.filter((d) => !d.late_night).map((d) => d.date)) }), strip.el);
      loadSlots(first);
    }).catch((err) => clear(days, h('p', { class: 'empty small', text: errorText(err) })));
    return wrap;
  }

  function stepDetails() {
    const s = service();
    const m = state.staffId ? staffById.get(state.staffId) : null;
    // A time after midnight is on the next calendar day: show that day, as the
    // booking's own page will (the request still sends the chosen day plus minutes).
    const day = slotDay(state.slot);
    const late = state.slot.min >= 1440;
    const startMin = state.slot.min % 1440;
    const name = input({ name: 'name', value: saved.name ?? '', maxlength: 60, autocomplete: 'name' });
    const phone = input({ name: 'phone', type: 'tel', inputmode: 'tel', value: saved.phone ?? '', autocomplete: 'tel' });
    const deposit = salon.cliq_required
      ? (salon.deposit_kind === 'full' ? Number(s.price) : Math.min(Number(salon.deposit_amount), Number(s.price)))
      : 0;
    const form = h(
      'form',
      { class: 'bk-details', novalidate: true },
      ticket({
        date: day,
        start: clockOf(startMin),
        end: clockOf(startMin + s.duration_min),
        today: state.today,
        label: slotDayText(state.slot, state.today),
        note: late ? [periodIcon('stars'), t('book.late_note', { day: fmtDate(state.slot.date, { weekday: 'long' }) })] : null,
        service: { icon: s.icon, name: pick(s, 'name') },
        duration: s.duration_min,
        price: s.price,
        priceFrom: s.price_is_from,
        currency: salon.currency,
        staff: m ? { photo: m.photo_url, name: pick(m, 'name') } : null,
        look,
      }),
      h('div', { class: 'bk-fields' }, field(t('book.name'), name)),
      h('div', { class: 'phone-input bk-fields' }, h('div', { class: 'cc', text: `+${app.ctx.tenant.calling_code}` }), field(t('book.phone'), phone)),
      deposit > 0 ? h('div', { class: 'notice' }, icon('lock'), h('span', { text: t('book.deposit_note', { amount: fmtPrice(deposit, salon.currency), window: fmtDuration(salon.payment_window_min) }) })) : null,
      // New tabs, so reading them does not lose the booking in progress.
      h('p', { class: 'consent' }, t('legal.by_booking'), ' ', legalLink('terms', { newTab: true }), t('legal.and'), legalLink('privacy', { newTab: true }), t('legal.end')),
    );
    next.disabled = false;
    clear(next, t('book.confirm'), h('span', { class: 'btn-sub num', text: fmtPrice(s.price, salon.currency) }));
    next.onclick = async () => {
      if (!state.slot) return;
      await busy(next, async () => {
        try {
          const res = await api('POST', '/api/public/bookings', {
            service_id: s.id, staff_id: state.staffId, date: state.slot.date, time: state.slot.min, name: name.value, phone: phone.value,
            ...(look ? { look: look.id } : {}),
          });
          rememberMe(name.value.trim(), phone.value.trim());
          remember(salon.id, { token: res.token, date: res.booking.date, start: res.booking.start, service_ar: s.name_ar, service_en: s.name_en });
          panel.close();
          app.go(`/b/${res.token}`);
        } catch (err) {
          if (err.code === 'slot_taken') {
            state.slot = null;
            daysCache.clear();
            freeCache.clear();
            toastError(err);
            go(3);
            return;
          }
          markInvalid(form, err);
          throw err;
        }
      });
      // busy() re-enables the button when it is done; back on the time step after a
      // taken slot there is nothing picked, so it must stay off.
      if (state.step === 3) next.disabled = !state.slot;
    };
    return form;
  }

  go(state.serviceId ? 2 : 1, { first: true });
}

// ---------------------------------------------------------------- the booking's page

const LIVE = new Set(['pending_payment', 'payment_sent']);

function countdown(seconds) {
  const s = Math.max(0, seconds);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/** ok / wait / pulse / off, and bad for a deposit that was turned away or never came. */
function statusKind(status, bad) {
  if (bad) return 'bad';
  return { confirmed: 'ok', completed: 'ok', pending_payment: 'wait', payment_sent: 'pulse', expired: 'off', cancelled: 'off', no_show: 'off' }[status] ?? 'off';
}

function statusIcon(kind) {
  const name = { ok: 'check', wait: 'lock', pulse: 'clock', off: 'x', bad: 'alert' }[kind];
  return h('div', { class: `status-icon ${kind === 'bad' ? 'off bad' : kind}`, 'aria-hidden': 'true' }, icon(name));
}

/** The hold's ring: full when the window opens, empty when it closes. */
function holdRing() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  const r = 28;
  const c = 2 * Math.PI * r;
  const circle = (cls) => {
    const el = document.createElementNS(SVG_NS, 'circle');
    for (const [k, v] of Object.entries({ cx: 32, cy: 32, r, class: cls })) el.setAttribute(k, String(v));
    return el;
  };
  const value = circle('value');
  value.setAttribute('stroke-dasharray', c.toFixed(2));
  svg.append(circle('track'), value);
  return { svg, set: (f) => value.setAttribute('stroke-dashoffset', (c * (1 - Math.max(0, Math.min(1, f)))).toFixed(2)) };
}

/** RFC 5545 lines are at most 75 bytes; longer ones continue on a line starting with a space. */
function foldIcs(line) {
  const enc = new TextEncoder();
  let out = '';
  let len = 0;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (len + n > 75) {
      out += '\r\n ';
      len = 1;
    }
    out += ch;
    len += n;
  }
  return out;
}

export function bookingPage(app, token) {
  const el = h('div', { class: 'booking-page' }, h('div', { class: 'boot' }, h('div', { class: 'spinner' })));
  const salonCtx = app.ctx.salon;
  if (salonCtx) applyColors(salonCtx.color_primary, salonCtx.color_accent);
  // The salon's public details (address, time zone, menu) give directions, "see you in
  // two days" and booking the same service again. The page works without them.
  const infoP = api('GET', '/api/public/salon').catch(() => null);
  let info = null;
  let booking = null;
  let tick = null;
  let poll = null;
  let deadline = 0;
  let offline = null;
  // While the page itself changes the booking (sending, replacing, cancelling), a poll's
  // answer, asked before the change, must not draw over it: it is dropped, and the
  // change's own answer is drawn instead.
  let changing = 0;
  let version = 0;
  // Left for another screen: an answer that arrives later draws nothing and starts no
  // timer, so nothing of this page polls, scrolls or celebrates over the next one.
  let gone = false;
  const hold = () => {
    changing++;
    let open = true;
    return () => {
      if (!open) return;
      open = false;
      changing--;
      version++;
    };
  };
  // The screenshot picked but not sent yet; survives re-renders.
  let proofFile = null;
  let proofPreview = null;
  const setProof = (file) => {
    if (proofPreview) URL.revokeObjectURL(proofPreview);
    proofFile = file;
    proofPreview = file ? URL.createObjectURL(file) : null;
  };
  // Back from the bank app: timers were asleep, so ask the server where things stand.
  const onVisible = () => {
    if (document.visibilityState === 'visible' && booking && LIVE.has(booking.status)) load();
  };
  document.addEventListener('visibilitychange', onVisible);
  app.onUnmount(() => {
    gone = true;
    clearInterval(tick);
    clearInterval(poll);
    setProof(null);
    document.removeEventListener('visibilitychange', onVisible);
  });

  async function load() {
    const asked = version;
    let res;
    try {
      res = await api('GET', `/api/public/bookings/${token}`);
    } catch (err) {
      if (gone) return;
      // A missed poll (a network switch, a 5xx) keeps the screen as it is, with a quiet
      // note; the next poll retries. Only a first load, or a booking that is gone, ends here.
      if (booking && err.status !== 404) {
        if (offline) offline.hidden = false;
        return;
      }
      clearInterval(tick);
      clearInterval(poll);
      clear(el, h(
        'main',
        { class: 'page bk-fail' },
        h('div', { class: 'empty' }, h('div', { class: 'tile' }, icon('alert')), h('p', { text: errorText(err) })),
        h('a', { class: 'btn btn-secondary btn-block', href: '/' }, icon('arrow', 'flip-rtl'), t('bk.back')),
      ));
      appReady();
      return;
    }
    if (gone || asked !== version || changing) return;
    if (offline) offline.hidden = true;
    const first = !booking;
    if (first) info = await infoP;
    if (gone) return;
    const changed = !first && booking.status !== res.booking.status;
    booking = res.booking;
    // Polling only redraws when something happened, so a half-filled form stays put;
    // the hold's clock is set again from the server's own count.
    if (first || changed) render(changed);
    else if (booking.status === 'pending_payment' && booking.expires_in_s != null) deadline = Date.now() + booking.expires_in_s * 1000;
    if (first) appReady();
  }

  /**
   * The evening a small-hours visit belongs to: a time before the close of a night that
   * opened the day before (Thursday 18:00–02:00 for Friday 01:00) is that night's, as
   * the booking sheet said when it was booked. The date and time stay the visit's own.
   */
  function nightBefore(b) {
    const week = info?.hours;
    if (!Array.isArray(week)) return null;
    const eve = addDays(b.date, -1);
    const start = toMin(b.start);
    const late = (week[dateOf(eve).getUTCDay()] ?? []).some((r) => toMin(r.close) <= toMin(r.open) && start < toMin(r.close));
    return late ? eve : null;
  }

  /** "See you in two days" / "today, in 3 hours": the ticket below has the date itself. */
  function confirmedSub(b) {
    const absolute = () => t('bk.confirmed_sub', { day: fmtDate(b.date, { weekday: 'long', day: 'numeric', month: 'long' }), time: fmtTime(b.start) });
    const now = b.upcoming ? zonedNow(info?.salon?.timezone) : null;
    if (!now) return absolute();
    const days = Math.round((dateOf(b.date) - dateOf(now.date)) / 86_400_000);
    const mins = days * 1440 + toMin(b.start) - now.minutes;
    if (mins <= 0) return absolute();
    let when;
    if (days === 0) when = mins < 60 ? t('bk.in_min', { n: mins }) : t('bk.today_in_h', { n: Math.round(mins / 60) });
    else if (days === 1) when = t('bk.tomorrow_at', { time: fmtTime(b.start) });
    else when = t('bk.in_days', { n: days });
    return t('bk.see_you', { when });
  }

  function render(changed = false) {
    if (gone) return;
    const b = booking;
    const s = b.salon;
    clearInterval(tick);
    clearInterval(poll);
    if (LIVE.has(b.status)) poll = setInterval(load, 12_000);

    const rejected = b.status === 'cancelled' && b.payment_rejected;
    const kind = statusKind(b.status, rejected || b.status === 'expired');
    el.dataset.kind = kind;
    const titleKey = rejected ? 'bk.rejected' : `bk.${b.status}`;
    const sub = rejected ? t('bk.rejected_sub') : {
      confirmed: b.upcoming ? confirmedSub(b) : t('bk.past_sub'),
      pending_payment: t('bk.pending_sub'),
      payment_sent: t('bk.payment_sent_sub'),
      expired: t('bk.expired_sub'),
    }[b.status];

    offline = h('p', { class: 'bk-offline', role: 'status', hidden: true }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), t('bk.reconnecting'));
    const hero = h(
      'section',
      { class: `status-hero ${changed ? 'rise' : ''}` },
      statusIcon(kind),
      h('h1', { text: t(titleKey) }),
      sub ? h('p', { text: sub }) : null,
      b.status === 'payment_sent' ? h('span', { class: 'live-pill' }, h('i', { 'aria-hidden': 'true' }), t('bk.live')) : null,
      offline,
    );

    const track = Number(b.deposit) > 0 && ['pending_payment', 'payment_sent', 'confirmed'].includes(b.status) ? trackEl(b.status) : null;
    const actions = b.status === 'confirmed' && b.upcoming ? actionsEl(b) : null;
    const cliq = b.status === 'pending_payment' ? cliqCard(b) : null;
    const proof = b.status === 'payment_sent' && b.proof_url ? proofCard(b) : null;
    const today = info ? zonedNow(info.salon?.timezone)?.date : null;
    const eve = nightBefore(b);
    const details = ticket({
      date: b.date,
      start: b.start,
      end: b.end,
      today,
      // Tonight's small hours, while they are still ahead, read as on the booking sheet.
      label: eve && b.upcoming && b.date === today ? t('book.tonight') : null,
      note: eve ? [periodIcon('stars'), t('book.late_note', { day: fmtDate(eve, { weekday: 'long' }) })] : null,
      number: b.id,
      service: { icon: b.service.icon, name: pick(b.service, 'name') },
      duration: b.duration_min,
      price: b.price,
      currency: s.currency,
      staff: { photo: b.staff.photo_url, name: pick(b.staff, 'name') },
      look: b.look ? { name: lookName(b.look) } : null,
      deposit: Number(b.deposit),
      isVoid: ['expired', 'cancelled', 'no_show'].includes(b.status),
    });

    // Booking again opens the booking sheet straight away, on the same service if the
    // salon still offers it; a confirmed visit whose time has passed offers it too.
    const offered = info?.services?.some((x) => x.id === b.service.id);
    const past = ['expired', 'cancelled', 'completed', 'no_show'].includes(b.status) || (b.status === 'confirmed' && !b.upcoming);
    const again = past
      ? h('a', { class: 'btn btn-primary btn-block', href: offered ? `/book?service=${b.service.id}` : '/book' }, icon('calendar'), t('bk.book_again'))
      : null;
    const wa = waNumber(s.phone);
    const contact = rejected && s.phone
      ? h('a', { class: 'btn btn-secondary btn-block', href: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(t('bk.contact_text', { id: b.id }))}` : `tel:${s.phone}`, target: '_blank', rel: 'noopener' }, icon(wa ? 'chat' : 'phone'), t('bk.contact'))
      : null;
    // Cancelling is there when needed, without the weight of a main action.
    const cancel = LIVE.has(b.status) || (b.status === 'confirmed' && b.upcoming)
      ? h('button', { class: 'link-btn danger-link center-link', type: 'button' }, icon('x'), t('bk.cancel'))
      : null;
    cancel?.addEventListener('click', async () => {
      if (!(await confirmDelete({ title: t('bk.cancel'), message: t('bk.cancel_confirm'), yesText: t('bk.cancel') }))) return;
      busy(cancel, async () => {
        const done = hold();
        try {
          booking = (await api('POST', `/api/public/bookings/${token}/cancel`)).booking;
        } finally {
          done();
        }
        render(true);
      });
    });

    clear(
      el,
      h(
        'header',
        { class: 'booking-top' },
        h('a', { class: 'icon-btn plain', href: '/', 'aria-label': t('bk.back') }, icon('arrow', 'flip-rtl')),
        salonCtx ? salonIcon(salonCtx) : appIcon(s.logo_url),
        h('span', { class: 'grow truncate', text: pick(s, 'name') }),
      ),
      h('main', { class: 'page stack-lg bk-main' }, stagger([hero, track, actions, cliq, proof, details, again, contact, cancel].filter(Boolean))),
    );
    // A new status redraws the page under the customer (often from a button far down):
    // the news is at the top, and focus, whose button is gone, goes to its title.
    if (changed) {
      const heading = hero.querySelector('h1');
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }

    // The confirmation is the moment to celebrate: when it happens with the page open,
    // and the first time the customer opens a confirmed booking on this device.
    if (b.status === 'confirmed') {
      const key = `seen:${token}`;
      const fresh = changed || !safe(() => localStorage.getItem(key), null);
      safe(() => localStorage.setItem(key, '1'));
      if (fresh && b.upcoming) {
        requestAnimationFrame(() => {
          sparkles(hero.querySelector('.status-icon'), 22);
          const css = getComputedStyle(document.documentElement);
          confetti([...['--brand', '--accent', '--primary-lift'].map((v) => css.getPropertyValue(v).trim()).filter(Boolean), '#ffffff']);
        });
      }
    }
  }

  /** Where the booking is: hold → deposit sent → the salon confirms. */
  function trackEl(status) {
    const at = { pending_payment: 1, payment_sent: 2, confirmed: 3 }[status];
    return h('ol', { class: 'bk-track', 'aria-label': t('bk.track') }, ['bk.track_hold', 'bk.track_sent', 'bk.track_ok'].map((key, i) => h(
      'li',
      { class: i < at ? 'done' : i === at ? 'now' : '', 'aria-current': i === at ? 'step' : null },
      h('span', { class: 'node', 'aria-hidden': 'true' }, i < at ? icon('check') : h('i')),
      h('span', { class: 'lbl', text: t(key) }),
    )));
  }

  /** A confirmed visit: into the calendar, the way there, a message to the salon. */
  function actionsEl(b) {
    const s = b.salon;
    const tiles = [h('button', { class: 'bk-act', type: 'button', onclick: () => downloadIcs(b) }, h('span', { class: 'tile' }, icon('calendar')), h('span', { text: t('bk.add_calendar') }))];
    const address = info?.salon?.address;
    if (address) {
      const map = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${pick(s, 'name')} ${address}`)}`;
      tiles.push(h('a', { class: 'bk-act', href: map, target: '_blank', rel: 'noopener' }, h('span', { class: 'tile' }, icon('pin')), h('span', { text: t('bk.directions') })));
    }
    if (s.phone) {
      const wa = waNumber(s.phone);
      const href = wa ? `https://wa.me/${wa}?text=${encodeURIComponent(t('bk.visit_text', { id: b.id }))}` : `tel:${s.phone}`;
      tiles.push(h('a', { class: 'bk-act', href, target: '_blank', rel: 'noopener' }, h('span', { class: 'tile' }, icon(wa ? 'chat' : 'phone')), h('span', { text: t(wa ? 'pub.whatsapp' : 'pub.call') })));
    }
    const nav = h('nav', { class: 'bk-actions', 'aria-label': t('bk.actions') }, tiles);
    nav.style.setProperty('--n', String(tiles.length));
    return nav;
  }

  function downloadIcs(b) {
    const s = b.salon;
    const salonName = pick(s, 'name');
    const address = info?.salon?.address;
    const start = zonedToUtc(b.date, b.start, info?.salon?.timezone);
    const end = new Date(start.getTime() + (b.duration_min || 30) * 60_000);
    const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const esc = (v) => String(v).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, (c) => `\\${c}`);
    const what = `${pick(b.service, 'name')} · ${salonName}`;
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Salonak//Booking//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:booking-${b.id}@${location.hostname}`,
      `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(what)}`,
      address ? `LOCATION:${esc(`${salonName}${getLang() === 'ar' ? '، ' : ', '}${address}`)}` : null,
      `DESCRIPTION:${esc(`${t('bk.with')} ${pick(b.staff, 'name')} · ${t('bk.number')} #${b.id}\n${location.href}`)}`,
      `URL:${location.href}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT1H', `DESCRIPTION:${esc(what)}`, 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ].filter(Boolean);
    const url = URL.createObjectURL(new Blob([`${lines.map(foldIcs).join('\r\n')}\r\n`], { type: 'text/calendar;charset=utf-8' }));
    const a = h('a', { href: url, download: `booking-${b.id}.ics`, hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  function cliqCard(b) {
    const s = b.salon;
    // The clock counts to a deadline, not down by ticks: a phone that slept in the bank
    // app wakes to the right time. Each poll sets the deadline again from the server.
    // The hold may have been cut short to end at the visit's start: the server says how long it was.
    const total = Math.max(60, Number(b.hold_s) || (Number(s.payment_window_min) || 30) * 60);
    deadline = Date.now() + (b.expires_in_s ?? 0) * 1000;
    const left = () => Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    const clock = h('b', { class: 'num', role: 'timer' });
    const ring = holdRing();
    const timer = h('div', { class: 'cliq-clock' }, h('span', { class: 'lbl', text: t('bk.expires_in') }), h('div', { class: 'cliq-ring' }, ring.svg, clock));
    const paint = () => {
      const r = left();
      clock.textContent = countdown(r);
      ring.set(r / total);
      timer.classList.toggle('low', r < 300);
      return r;
    };
    paint();
    let asked = false;
    tick = setInterval(() => {
      const r = paint();
      if (r <= 0 && !asked) {
        asked = true;
        load();
      } else if (r > 0) {
        asked = false;
      }
    }, 1000);

    // The alias is the thing to copy: the whole row is the button.
    const aliasText = h('span', { class: 'ltr', text: s.cliq_alias });
    const aliasIcon = h('span', { class: 'copy-ic', 'aria-hidden': 'true' }, icon('copy'));
    const alias = h('button', { class: 'alias', type: 'button', 'aria-label': `${t('bk.copy_alias')}: ${s.cliq_alias}` }, aliasText, aliasIcon);
    alias.addEventListener('click', async () => {
      if (await copyText(s.cliq_alias)) {
        flashCopied(alias, aliasIcon);
        toast(t('bk.copied'));
      } else {
        getSelection()?.selectAllChildren(aliasText);
        toast(t('bk.copy_manual'), 'error');
      }
    });
    const amountIcon = h('span', { class: 'copy-ic', 'aria-hidden': 'true' }, icon('copy'));
    const amountCopy = h('button', { class: 'amt-copy', type: 'button', 'aria-label': t('bk.copy_amount'), title: t('bk.copy_amount') }, amountIcon);
    amountCopy.addEventListener('click', async () => {
      if (await copyText(String(Number(b.deposit)))) {
        flashCopied(amountCopy, amountIcon);
        toast(t('bk.copied_amount'));
      } else {
        toast(t('bk.copy_manual'), 'error');
      }
    });

    const note = input({ name: 'note', maxlength: 120, value: me().name ?? '' });
    const sent = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, icon('check'), t('bk.sent'));
    const drop = h('button', { class: 'proof-drop', type: 'button', name: 'proof' });
    const step3 = h('li', { text: t('bk.step3') });
    const renderDrop = () => {
      drop.classList.toggle('has', !!proofFile);
      step3.classList.toggle('done', !!proofFile);
      sent.disabled = !proofFile;
      if (proofFile) {
        // The whole receipt, shrunk to fit over a blurred copy of itself: the amount and
        // the recipient stay readable, however tall the screenshot.
        clear(
          drop,
          h('img', { class: 'bg', src: proofPreview, alt: '' }),
          h('img', { class: 'fg', src: proofPreview, alt: t('bk.your_proof') }),
          h('span', { class: 'change' }, icon('camera'), t('bk.change_photo')),
        );
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
    // The screenshot is what counts: once it is in, the booking waits on the salon (the
    // hold's clock stops). The sender's name is a note on top, sent after it; if that
    // one fails, the booking is no worse off, so it does not hold the page up.
    sent.addEventListener('click', () => busy(sent, async () => {
      const done = hold();
      let res;
      try {
        res = await api('PUT', `/api/public/bookings/${token}/proof`, await prepareImage(proofFile, 3000));
      } catch (err) {
        done();
        if (err.code === 'not_pending') load();
        throw err;
      }
      booking = res.booking;
      setProof(null);
      const text = note.value.trim();
      if (text) booking = (await api('POST', `/api/public/bookings/${token}/sent`, { note: text }).catch(() => null))?.booking ?? booking;
      done();
      render(true);
    }));
    const amount = fmtPrice(b.deposit, s.currency);
    return h(
      'section',
      { class: 'card cliq-card' },
      h(
        'div',
        { class: 'cliq-top' },
        h('div', null, h('div', { class: 'eyebrow', text: t('bk.deposit') }), h('div', { class: 'cliq-amount' }, h('span', { class: 'amount num', text: amount }), amountCopy)),
        timer,
      ),
      h(
        'ol',
        { class: 'cliq-steps' },
        h('li', { text: t('bk.step1') }),
        h('li', null, t('bk.step2', { amount }), alias, s.cliq_name ? h('div', { class: 'small muted', text: `${t('bk.beneficiary')}: ${s.cliq_name}` }) : null),
        step3,
      ),
      drop,
      h('div', { class: 'bk-fields' }, field(t('bk.sender'), note, { optional: true })),
      h('div', { class: 'bk-fields' }, sent),
    );
  }

  /** While the salon reviews: the screenshot they are looking at, replaceable if it was the wrong one. */
  function proofCard(b) {
    const replace = h('button', { class: 'link-btn', type: 'button' }, icon('camera'), t('bk.replace'));
    replace.addEventListener('click', async () => {
      const file = await pickImage();
      if (!file) return;
      busy(replace, async () => {
        const done = hold();
        try {
          booking = (await api('PUT', `/api/public/bookings/${token}/proof`, await prepareImage(file, 3000))).booking;
        } catch (err) {
          done();
          // Decided meanwhile, or the visit has begun: show where things stand.
          if (err.code === 'not_pending') load();
          throw err;
        }
        done();
        toast(t('bk.replaced'));
        render(false);
      });
    });
    return h(
      'section',
      { class: 'card proof-card' },
      h('div', { class: 'row between' }, h('div', { class: 'eyebrow', text: t('bk.your_proof') }), replace),
      h('div', { class: 'proof-frame' }, h('img', { class: 'proof-img', src: b.proof_url, alt: t('bk.your_proof') })),
    );
  }

  load();
  return el;
}
