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

/** "10:30" and "ص" apart, so the period can be set smaller than the clock. */
export function timeParts(hhmm) {
  const [h24, m] = hhmm.split(':').map(Number);
  const parts = new Intl.DateTimeFormat(LOCALE(), { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'UTC' })
    .formatToParts(Date.UTC(2000, 0, 1, h24 % 24, m));
  return {
    clock: parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim(),
    period: parts.find((p) => p.type === 'dayPeriod')?.value ?? '',
  };
}

/** "10:30 – 11:15 ص", or both periods when the visit crosses noon or midnight. */
export function fmtRange(start, end) {
  const a = timeParts(start);
  const b = timeParts(end);
  if (a.period !== b.period) return `${fmtTime(start)} – ${fmtTime(end)}`;
  return `${a.clock} – ${b.clock}${b.period ? ` ${b.period}` : ''}`;
}

/** "أكتوبر 2026", or "أكتوبر – نوفمبر 2026" when the dates run into the next month. */
export function monthCaption(dates) {
  if (!dates.length) return '';
  const first = dates[0];
  const last = dates[dates.length - 1];
  const same = first.slice(0, 7) === last.slice(0, 7);
  if (same) return fmtDate(first, { month: 'long', year: 'numeric' });
  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  return `${fmtDate(first, sameYear ? { month: 'long' } : { month: 'long', year: 'numeric' })} – ${fmtDate(last, { month: 'long', year: 'numeric' })}`;
}

/**
 * Horizontal strip of days. days: [{ date, disabled?, badge?, note? }].
 * months: 'all' prints the month under every day; 'first' only on the 1st of a
 * month (a caption above the strip names the month). A day's note (e.g. "closed")
 * takes the month's place. Returns { el, select(date) }.
 */
export function dayStrip({ days, today, selected, onPick, months = 'all' }) {
  const chips = days.map((d) => {
    const monthText = months === 'all' || d.date.endsWith('-01') ? fmtDate(d.date, { month: 'short' }) : '';
    const sub = d.note || monthText;
    const chip = h(
      'button',
      {
        class: `day-chip${d.note ? ' noted' : ''}`, type: 'button', disabled: !!d.disabled, 'data-date': d.date,
        'aria-current': d.date === today ? 'date' : null,
        'aria-label': [`${dayLabel(d.date, today)} ${fmtDate(d.date, { day: 'numeric', month: 'long' })}`, d.note].filter(Boolean).join(' · '),
        onclick: () => pickDate(d.date),
      },
      h('span', { class: 'dw', text: dayLabel(d.date, today) }),
      h('span', { class: 'dn num', text: fmtDate(d.date, { day: 'numeric' }) }),
      sub ? h('span', { class: 'dm', text: sub }) : null,
      d.badge ? h('span', { class: 'badge num', text: String(d.badge) }) : null,
    );
    return chip;
  });
  // Plain toggle buttons, as the time slots are: each is a Tab stop and says whether
  // it is the chosen day (a listbox would promise arrow keys it does not have).
  const el = h('div', { class: 'scroller day-strip' }, chips);
  function mark(date) {
    chips.forEach((c) => {
      const on = c.dataset.date === date;
      c.classList.toggle('on', on);
      c.setAttribute('aria-pressed', String(on));
    });
  }
  function pickDate(date) {
    mark(date);
    onPick(date);
  }
  mark(selected);
  // A mouse wheel scrolls the strip sideways (its scrollbar is hidden), but only while
  // there is more strip to scroll that way, so the page still scrolls past it.
  el.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth + 1) return;
    const before = el.scrollLeft;
    el.scrollLeft += (getComputedStyle(el).direction === 'rtl' ? -1 : 1) * e.deltaY;
    if (el.scrollLeft !== before) e.preventDefault();
  }, { passive: false });
  // Centre the chosen day once the strip is laid out. Only the strip scrolls, never
  // the page (it may be re-rendered while the owner is further down).
  requestAnimationFrame(() => {
    const chip = chips.find((c) => c.dataset.date === selected);
    if (chip && el.scrollWidth > el.clientWidth) el.scrollLeft = chip.offsetLeft - (el.clientWidth - chip.offsetWidth) / 2;
  });
  return { el, select: mark };
}

// ---------------------------------------------------------------- time of day

const SVG_NS = 'http://www.w3.org/2000/svg';
const PERIOD_ICONS = {
  sun: ['M12 8.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6z', 'M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4'],
  sunset: ['M7.5 17a4.5 4.5 0 0 1 9 0', 'M12 3v6M9 6.5 12 9.5l3-3', 'M3 17h2M19 17h2M5.3 11.3l1.4 1.4M17.3 12.7l1.4-1.4M3 21h18'],
  moon: ['M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z'],
  stars: ['M19 13.5A7.5 7.5 0 1 1 9.5 4a6 6 0 0 0 9.5 9.5z', 'M17 3v4M15 5h4M20.5 8.5v2M19.5 9.5h2'],
};

/** The little sun / sunset / moon (or moon and stars) beside a group of times. */
export function periodIcon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', class: 'icon' })) {
    svg.setAttribute(k, v);
  }
  for (const d of PERIOD_ICONS[name]) {
    const path = document.createElementNS(SVG_NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

const GROUPS = [
  ['book.morning', 'sun', (s) => s.min < 720],
  ['book.afternoon', 'sunset', (s) => s.min >= 720 && s.min < 1020],
  ['book.evening', 'moon', (s) => s.min >= 1020 && s.min < 1440],
  ['book.after_midnight', 'stars', (s) => s.min >= 1440],
];

/**
 * Free times grouped into morning / afternoon / evening / after midnight, each
 * with its count. slots: [{ min, time, next_day }].
 */
export function slotGrid({ slots, selected, onPick }) {
  const el = h('div', { class: 'slot-groups' });
  let current = selected;
  const buttons = [];
  for (const [label, art, test] of GROUPS) {
    const list = slots.filter(test);
    if (!list.length) continue;
    const id = `slot-h-${label.split('.')[1]}-${Math.random().toString(36).slice(2, 7)}`;
    el.append(h(
      'div',
      { class: 'slot-group', role: 'group', 'aria-labelledby': id },
      h('div', { class: 'eyebrow slot-head', id }, periodIcon(art), h('span', { text: t(label) }), h('span', { class: 'slot-count num', text: String(list.length) })),
      h('div', { class: 'slot-grid' }, list.map((s, i) => {
        const { clock, period } = timeParts(s.time);
        const b = h(
          'button',
          {
            class: `slot num ${s.min === current ? 'on' : ''}`, type: 'button', 'aria-pressed': String(s.min === current),
            style: { '--i': String(Math.min(i, 12)) },
            onclick: () => {
              current = s.min;
              buttons.forEach((x) => {
                x.classList.toggle('on', x === b);
                x.setAttribute('aria-pressed', String(x === b));
              });
              onPick(s);
            },
          },
          h('b', { text: clock }),
          period ? h('small', { text: period }) : null,
        );
        buttons.push(b);
        return b;
      })),
    ));
  }
  if (!slots.length) clear(el, h('p', { class: 'empty small', text: t('book.no_slots') }));
  return el;
}
