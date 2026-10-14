// A single-series column chart for counts over days: one rounded column per day in
// the studio's violet-to-blue light, ghost ticks for the empty days (so a quiet month
// reads as quiet, not as a broken line), hairline grid, a readout that snaps to the
// nearest day (pointer, touch or arrow keys) and a table view as its accessible twin.
// Time runs left to right in both languages, like the dates people read in their
// banking and calendar apps.
import { clear, h } from './dom.js';
import { reducedMotion } from './theme.js';

const NS = 'http://www.w3.org/2000/svg';
let charts = 0;
const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
};

/** 0, a clean middle and a clean top: 4 → 4, 7 → 8, 13 → 20, 260 → 300. */
function niceMax(max) {
  if (max <= 4) return 4;
  const step = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * step >= max) return m * step;
  return 10 * step;
}

/**
 * points: [{ date: 'YYYY-MM-DD', n }]. Text comes from the caller's formatters:
 * fmtTick(date) for the axis, fmtDay(date) for the readout, fmtValue(n), and
 * labels { summary, table, chart, date, value }.
 */
export function barChart({ points, fmtTick, fmtDay, fmtValue = String, labels }) {
  const AXIS = 26;
  const PAD = { top: 14, left: 30, right: 4 };
  const max = niceMax(Math.max(0, ...points.map((p) => p.n)));
  const last = points.length - 1;

  const tooltip = h('div', { class: 'chart-tip', role: 'status', hidden: true });
  const plot = h('div', { class: 'chart-plot', tabindex: '0', role: 'img', 'aria-label': labels.summary, dir: 'ltr' });
  const table = h(
    'table',
    { class: 'chart-table', hidden: true },
    h('thead', null, h('tr', null, h('th', { scope: 'col', text: labels.date }), h('th', { scope: 'col', text: labels.value }))),
    h('tbody', null, [...points].reverse().map((p) => h('tr', null, h('td', { text: fmtDay(p.date) }), h('td', { class: 'num', text: fmtValue(p.n) })))),
  );
  const toggle = h('button', { class: 'link-btn chart-toggle', type: 'button', text: labels.table, 'aria-pressed': 'false' });
  toggle.addEventListener('click', () => {
    const showTable = table.hidden;
    table.hidden = !showTable;
    plot.hidden = showTable;
    toggle.textContent = showTable ? labels.chart : labels.table;
    toggle.setAttribute('aria-pressed', String(showTable));
  });

  const gradId = `chart-grad-${++charts}`;
  let width = 0;
  let drawn = false;
  let active = -1;
  let geometry = null;

  function render() {
    width = plot.clientWidth;
    if (!width) return;
    // Taller on a wide card, so a month never reads as a flat band.
    const PLOT = Math.round(Math.min(220, Math.max(132, width * 0.2)));
    const innerW = width - PAD.left - PAD.right;
    const step = innerW / points.length;
    const barW = Math.max(3, Math.min(26, step * 0.6));
    const base = PAD.top + PLOT;
    const x = (i) => PAD.left + step * (i + 0.5);
    const y = (n) => base - (n / max) * PLOT;
    geometry = { x, y, step, base, PLOT };

    const root = svg('svg', { width, height: base + AXIS, viewBox: `0 0 ${width} ${base + AXIS}`, 'aria-hidden': 'true' });
    const defs = svg('defs');
    // One light for the whole plot: short days stay blue, the busiest reach violet.
    const grad = svg('linearGradient', { id: gradId, gradientUnits: 'userSpaceOnUse', x1: 0, y1: PAD.top, x2: 0, y2: base });
    grad.append(svg('stop', { offset: '0%', class: 'g-top' }), svg('stop', { offset: '100%', class: 'g-bottom' }));
    defs.append(grad);
    root.append(defs);

    // Grid and y ticks: 0, the middle, the top. Solid hairlines, out of the way.
    for (const v of [0, max / 2, max]) {
      root.append(svg('line', { class: `grid ${v === 0 ? 'base' : ''}`, x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v) }));
      const tick = svg('text', { class: 'tick', x: PAD.left - 8, y: y(v) + 4, 'text-anchor': 'end' });
      tick.textContent = fmtValue(v);
      root.append(tick);
    }
    // X ticks: first day, middle, last.
    const marks = [0, Math.floor(last / 2), last];
    marks.forEach((i, k) => {
      const tick = svg('text', { class: 'tick', x: k === 0 ? x(i) - barW / 2 : k === 2 ? x(i) + barW / 2 : x(i), y: base + 18, 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle' });
      tick.textContent = fmtTick(points[i].date);
      root.append(tick);
    });

    // The hovered day's lane, behind its column.
    const lane = svg('rect', { class: 'lane', x: 0, y: PAD.top, width: step, height: PLOT, rx: Math.min(8, step / 3), visibility: 'hidden' });
    const cross = svg('line', { class: 'cross', x1: 0, x2: 0, y1: PAD.top, y2: base, visibility: 'hidden' });
    root.append(lane, cross);

    const animate = !drawn && !reducedMotion();
    const bars = points.map((p, i) => {
      const empty = p.n === 0;
      // Empty days: a 2px ghost tick on the floor, so the rhythm of the month stays visible.
      const hgt = empty ? 2 : Math.max(3, base - y(p.n));
      const bar = svg('rect', {
        class: `bar${empty ? ' zero' : ''}${i === last ? ' last' : ''}${animate ? ' enter' : ''}`,
        x: (x(i) - barW / 2).toFixed(1),
        y: (base - hgt).toFixed(1),
        width: barW.toFixed(1),
        height: hgt.toFixed(1),
        rx: empty ? 1 : Math.min(3, barW / 2),
        ...(empty ? {} : { fill: `url(#${gradId})` }),
      });
      if (animate) bar.style.setProperty('--i', String(i));
      root.append(bar);
      return bar;
    });
    geometry.bars = bars;
    geometry.lane = lane;
    geometry.cross = cross;

    clear(plot, root, tooltip);
    drawn = true;
    if (active >= 0) show(active);
  }

  function show(i) {
    if (!geometry) return;
    if (active >= 0 && geometry.bars[active]) geometry.bars[active].classList.remove('on');
    active = i;
    const p = points[i];
    const cx = geometry.x(i);
    const top = p.n ? geometry.y(p.n) : geometry.base - 2;
    geometry.bars[i].classList.add('on');
    plot.classList.add('hovering');
    geometry.lane.setAttribute('x', String(cx - geometry.step / 2));
    geometry.lane.setAttribute('visibility', 'visible');
    geometry.cross.setAttribute('x1', String(cx));
    geometry.cross.setAttribute('x2', String(cx));
    geometry.cross.setAttribute('y2', String(top - 6));
    geometry.cross.setAttribute('visibility', p.n ? 'hidden' : 'visible');
    clear(tooltip, h('b', { text: fmtValue(p.n) }), h('span', { text: fmtDay(p.date) }));
    tooltip.hidden = false;
    // Keep the readout inside the card, above the column.
    const tipW = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(Math.max(cx - tipW / 2, 0), width - tipW)}px`;
    tooltip.style.top = `${Math.max(0, top - 60)}px`;
  }

  function hide() {
    if (active >= 0) geometry?.bars[active]?.classList.remove('on');
    active = -1;
    tooltip.hidden = true;
    plot.classList.remove('hovering');
    geometry?.lane.setAttribute('visibility', 'hidden');
    geometry?.cross.setAttribute('visibility', 'hidden');
  }

  const nearest = (clientX) => {
    const rect = plot.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - PAD.left) / (geometry?.step || 1));
    return Math.min(last, Math.max(0, i));
  };
  plot.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerleave', hide);
  plot.addEventListener('focus', () => show(active >= 0 ? active : last));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const from = active >= 0 ? active : last;
    const next = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: last }[e.key];
    show(Math.min(last, Math.max(0, next)));
  });

  // Follows the card's width; lets go once the chart is gone from the page.
  const resize = new ResizeObserver(() => {
    if (!plot.isConnected && drawn) {
      resize.disconnect();
      return;
    }
    if (plot.clientWidth && plot.clientWidth !== width) render();
  });
  resize.observe(plot);

  return h('div', { class: 'chart' }, plot, table, h('div', { class: 'chart-foot' }, toggle));
}

/** The earlier name, kept for callers that still use it. */
export const areaChart = barChart;
