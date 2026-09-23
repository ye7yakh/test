// Weekly hours as seven 24-hour tracks. Tap a day to edit its ranges. Shared by
// the salon hours page and a team member's own hours.
// Value shape matches the API: week[weekday] = [{ open: 'HH:MM', close: 'HH:MM' }].
import { h, icon, switchEl, toast } from './dom.js';
import { DAY_ORDER, dayName, fmtHour, fmtTime, t } from './i18n.js';
import { nowIn, toMin } from './time.js';

const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, '0')}:${String((i % 4) * 15).padStart(2, '0')}`);
const pct = (min) => `${(min / 1440) * 100}%`;
const copy = (week) => week.map((ranges) => ranges.map((r) => ({ open: r.open, close: r.close })));

function timeSelect(value, label) {
  const sel = h('select', { 'aria-label': label }, TIMES.map((v) => h('option', { value: v, text: fmtTime(v) })));
  // Keep odd stored values (e.g. 10:10) selectable.
  if (!TIMES.includes(value)) sel.append(h('option', { value, text: fmtTime(value) }));
  sel.value = value;
  return sel;
}

export function hoursEditor(initialWeek, { timezone, onChange } = {}) {
  let week = copy(initialWeek);
  let expanded = null;
  let invalidDay = null;
  const now = timezone ? nowIn(timezone) : null;
  const rows = new Map();
  const el = h('div', { class: 'week' });

  el.append(h(
    'div',
    { class: 'scale-line', 'aria-hidden': 'true' },
    h('div', { class: 'info' }),
    h('div', { class: 'marks' }, [0, 12, 24].map((hr) => h('span', { class: 'num', text: fmtHour(hr) }))),
  ));

  const changed = () => {
    DAY_ORDER.forEach(renderDay);
    onChange?.();
  };

  function segments(d) {
    const segs = [];
    for (const r of week[d]) {
      const open = toMin(r.open);
      let close = toMin(r.close);
      if (close <= open) close += 1440;
      segs.push([open, Math.min(close, 1440)]);
    }
    // Last night's range that ran past midnight.
    for (const r of week[(d + 6) % 7]) {
      const open = toMin(r.open);
      const close = toMin(r.close);
      if (close <= open && close > 0) segs.push([0, close]);
    }
    return segs;
  }

  function track(d) {
    return h(
      'div',
      { class: 'track' },
      segments(d).map(([a, b]) => h('div', { class: 'seg', style: { insetInlineStart: pct(a), width: pct(b - a) } })),
      now && now.weekday === d ? h('div', { class: 'now', style: { insetInlineStart: pct(now.minutes) } }) : null,
    );
  }

  function dayEditor(d) {
    const ranges = week[d];
    const sw = switchEl(ranges.length > 0, dayName(d));
    sw.input.addEventListener('change', () => {
      if (sw.input.checked) {
        const template = DAY_ORDER.map((x) => week[x]).find((r) => r.length);
        week[d] = template ? template.map((r) => ({ ...r })) : [{ open: '10:00', close: '22:00' }];
      } else {
        week[d] = [];
      }
      changed();
    });
    return h(
      'div',
      { class: 'day-editor' },
      h('label', { class: 'switch-row', style: { minHeight: '44px' } }, h('div', { class: 'grow', text: ranges.length ? t('hours.open') : t('hours.closed') }), sw.el),
      ranges.map((r, i) => {
        const open = timeSelect(r.open, `${dayName(d)} ${i + 1}`);
        const close = timeSelect(r.close, `${t('hours.to')} ${i + 1}`);
        const overnight = r.close <= r.open;
        const sync = () => {
          r.open = open.value;
          r.close = close.value;
          changed();
        };
        open.addEventListener('change', sync);
        close.addEventListener('change', sync);
        return h(
          'div',
          { class: `range ${overnight ? 'has-next' : ''}`, style: { marginTop: '10px' } },
          h('div', { class: 'time-pill' }, open),
          h('span', { class: 'to', text: t('hours.to') }),
          h('div', { class: 'time-pill' }, close, overnight ? h('span', { class: 'next', text: t('hours.next_day') }) : null),
          h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': t('delete'), onclick: () => { ranges.splice(i, 1); changed(); } }, icon('x')),
        );
      }),
      ranges.length
        ? h(
            'div',
            { class: 'day-tools' },
            ranges.length < 4
              ? h('button', {
                  class: 'link-btn', type: 'button',
                  onclick: () => {
                    const last = ranges[ranges.length - 1];
                    ranges.push({ open: last && last.close > last.open ? last.close : '16:00', close: '23:00' });
                    changed();
                  },
                }, icon('plus'), t('hours.add_range'))
              : h('span'),
            h('button', {
              class: 'link-btn', type: 'button',
              onclick: () => {
                for (const x of DAY_ORDER) if (x !== d) week[x] = ranges.map((r) => ({ ...r }));
                changed();
                toast(t('hours.copied'));
              },
            }, icon('copy'), t('hours.copy_all')),
          )
        : null,
    );
  }

  function renderDay(d) {
    const ranges = week[d];
    const line = h(
      'div',
      { class: 'day-line' },
      h(
        'div',
        { class: 'info' },
        h('div', { class: `dname ${now && now.weekday === d ? 'today' : ''}`, text: dayName(d) }),
        h('div', { class: `summary num ${ranges.length ? '' : 'closed'}` }, ranges.length ? ranges.map((r) => h('div', { text: `${fmtTime(r.open)} – ${fmtTime(r.close)}` })) : t('hours.closed')),
      ),
      track(d),
    );
    const row = h(
      'div',
      {
        class: `day-row ${expanded === d ? 'open-editor' : ''} ${invalidDay === d ? 'invalid' : ''}`,
        'data-day': String(d),
      },
      line,
      expanded === d ? dayEditor(d) : null,
    );
    line.setAttribute('role', 'button');
    line.setAttribute('tabindex', '0');
    line.setAttribute('aria-expanded', String(expanded === d));
    const toggle = () => {
      const before = expanded;
      expanded = expanded === d ? null : d;
      if (before !== null && before !== d) renderDay(before);
      renderDay(d);
    };
    line.addEventListener('click', toggle);
    line.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
    const old = rows.get(d);
    if (old) old.replaceWith(row);
    else el.append(row);
    rows.set(d, row);
  }

  DAY_ORDER.forEach(renderDay);

  return {
    el,
    value: () => copy(week),
    setWeek(next) {
      week = copy(next);
      invalidDay = null;
      DAY_ORDER.forEach(renderDay);
    },
    /** Opens and marks the day an API error points at (field "hours.N"). */
    showError(err) {
      const m = /hours\.(\d)$/.exec(err?.field ?? '');
      invalidDay = m ? Number(m[1]) : null;
      if (invalidDay !== null) expanded = invalidDay;
      DAY_ORDER.forEach(renderDay);
      if (invalidDay !== null) rows.get(invalidDay)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    },
  };
}
