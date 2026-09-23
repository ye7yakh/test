// Day strip and time-slot grid, shared by the customer's booking flow and the
// owner's schedule. Dates are the salon's local 'YYYY-MM-DD'.
import { clear, h } from './dom.js';
import { fmtTime, getLang, t } from './i18n.js';

const LOCALE = () => (getLang() === 'ar' ? 'ar-u-nu-latn' : 'en-u-nu-latn');

export function dateOf(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function addDays(date, n) {
  const dt = dateOf(date);
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

/** "السبت 27 سبتمبر" / "Saturday 27 September" */
export function fmtDate(date, opts = { weekday: 'long', day: 'numeric', month: 'long' }) {
  return new Intl.DateTimeFormat(LOCALE(), { ...opts, timeZone: 'UTC' }).format(dateOf(date));
}

/** Today / Tomorrow / the weekday, relative to the salon's today. */
export function dayLabel(date, today) {
  if (date === today) return t('book.today');
  if (date === addDays(today, 1)) return t('book.tomorrow');
  return fmtDate(date, { weekday: 'long' });
}

/**
 * Horizontal strip of days. days: [{ date, disabled?, badge? }].
 * Returns { el, select(date) }.
 */
export function dayStrip({ days, today, selected, onPick }) {
  const chips = days.map((d) => {
    const chip = h(
      'button',
      { class: 'day-chip', type: 'button', disabled: !!d.disabled, 'data-date': d.date, onclick: () => pickDate(d.date) },
      h('span', { class: 'dw', text: dayLabel(d.date, today) }),
      h('span', { class: 'dn num', text: fmtDate(d.date, { day: 'numeric' }) }),
      h('span', { class: 'dm', text: fmtDate(d.date, { month: 'short' }) }),
      d.badge ? h('span', { class: 'badge num', text: String(d.badge) }) : null,
    );
    return chip;
  });
  const el = h('div', { class: 'scroller day-strip', role: 'listbox' }, chips);
  function mark(date) {
    chips.forEach((c) => {
      const on = c.dataset.date === date;
      c.classList.toggle('on', on);
      c.setAttribute('aria-selected', String(on));
    });
  }
  function pickDate(date) {
    mark(date);
    onPick(date);
  }
  mark(selected);
  // Centre the chosen day once the strip is laid out. Only the strip scrolls, never
  // the page (it may be re-rendered while the owner is further down).
  requestAnimationFrame(() => {
    const chip = chips.find((c) => c.dataset.date === selected);
    if (chip) el.scrollLeft = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
  });
  return { el, select: mark };
}

/** Free times grouped into morning / evening / after midnight. slots: [{ min, time, next_day }]. */
export function slotGrid({ slots, selected, onPick }) {
  const el = h('div', { class: 'slot-groups' });
  const groups = [
    ['book.morning', (s) => s.min < 720],
    ['book.evening', (s) => s.min >= 720 && s.min < 1440],
    ['book.after_midnight', (s) => s.min >= 1440],
  ];
  let current = selected;
  const buttons = [];
  for (const [label, test] of groups) {
    const list = slots.filter(test);
    if (!list.length) continue;
    el.append(h(
      'div',
      { class: 'slot-group' },
      h('div', { class: 'eyebrow', text: t(label) }),
      h('div', { class: 'slot-grid' }, list.map((s, i) => {
        const b = h('button', {
          class: `slot num ${s.min === current ? 'on' : ''}`, type: 'button', text: fmtTime(s.time),
          style: { '--i': String(Math.min(i, 12)) },
          onclick: () => {
            current = s.min;
            buttons.forEach((x) => x.classList.toggle('on', x === b));
            onPick(s);
          },
        });
        buttons.push(b);
        return b;
      })),
    ));
  }
  if (!slots.length) clear(el, h('p', { class: 'empty small', text: t('book.no_slots') }));
  return el;
}
