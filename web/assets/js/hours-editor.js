// Weekly hours editor, shared by the salon hours tab and a team member's own hours.
// Value shape matches the API: week[weekday] = [{ open: 'HH:MM', close: 'HH:MM' }].
import { h, icon, switchEl, toast } from './dom.js';
import { DAY_ORDER, dayName, fmtTime, t } from './i18n.js';

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);

function timeSelect(value, label) {
  const sel = h('select', { class: 'input', 'aria-label': label }, TIMES.map((v) => h('option', { value: v, text: fmtTime(v) })));
  // Keep odd stored values (e.g. 10:10) selectable.
  if (!TIMES.includes(value)) sel.append(h('option', { value, text: fmtTime(value) }));
  sel.value = value;
  return sel;
}

export function hoursEditor(initialWeek) {
  const week = initialWeek.map((ranges) => ranges.map((r) => ({ ...r })));
  const rows = new Map();
  const el = h('div', { class: 'days' });

  function renderDay(d) {
    const ranges = week[d];
    const sw = switchEl(ranges.length > 0);
    sw.input.setAttribute('aria-label', dayName(d));
    sw.input.addEventListener('change', () => {
      if (sw.input.checked) {
        // Reopen with the nearest open day's hours, or a common default.
        const template = DAY_ORDER.map((x) => week[x]).find((r) => r.length);
        week[d] = template ? template.map((r) => ({ ...r })) : [{ open: '10:00', close: '22:00' }];
      } else {
        week[d] = [];
      }
      renderDay(d);
    });

    const body = ranges.length
      ? h(
          'div',
          { class: 'ranges' },
          ranges.map((r, i) => {
            const open = timeSelect(r.open, t('hours.title'));
            const close = timeSelect(r.close, t('hours.to'));
            const nextDay = h('span', { class: 'next-day', text: `(${t('hours.next_day')})`, hidden: r.close > r.open });
            const sync = () => {
              r.open = open.value;
              r.close = close.value;
              nextDay.hidden = r.close > r.open;
            };
            open.addEventListener('change', sync);
            close.addEventListener('change', sync);
            const remove = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('delete') }, icon('x'));
            remove.addEventListener('click', () => {
              ranges.splice(i, 1);
              renderDay(d);
            });
            return h('div', { class: 'range' }, open, h('span', { class: 'muted small', text: t('hours.to') }), close, remove, nextDay);
          }),
          h(
            'div',
            { class: 'day-actions' },
            ranges.length < 4
              ? h('button', {
                  class: 'link-btn',
                  type: 'button',
                  onclick: () => {
                    const last = ranges[ranges.length - 1];
                    ranges.push({ open: last && last.close > last.open ? last.close : '16:00', close: '23:00' });
                    renderDay(d);
                  },
                }, icon('plus'), t('hours.add_range'))
              : null,
            h('button', {
              class: 'link-btn',
              type: 'button',
              onclick: () => {
                for (const x of DAY_ORDER) if (x !== d) week[x] = ranges.map((r) => ({ ...r }));
                DAY_ORDER.forEach(renderDay);
                toast(t('hours.copied'));
              },
            }, icon('copy'), t('hours.copy_all')),
          ),
        )
      : null;

    const row = h(
      'div',
      { class: 'day', 'data-day': String(d) },
      h('div', { class: 'day-head' }, h('span', { class: 'name', text: dayName(d) }), ranges.length ? null : h('span', { class: 'closed', text: t('hours.closed') }), sw.el),
      body,
    );
    const old = rows.get(d);
    if (old) old.replaceWith(row);
    else el.append(row);
    rows.set(d, row);
  }

  DAY_ORDER.forEach(renderDay);

  return {
    el,
    value: () => week.map((ranges) => ranges.map((r) => ({ open: r.open, close: r.close }))),
    /** Marks the day an API error points at (field "hours.N"). */
    showError(err) {
      rows.forEach((row) => row.classList.remove('invalid'));
      const m = /\.(\d)$/.exec(err?.field ?? '');
      if (m) rows.get(Number(m[1]))?.classList.add('invalid');
    },
  };
}
