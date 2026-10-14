// A single-series area chart for counts over days: one 2px line with a faint wash,
// hairline grid, a crosshair that snaps to the nearest day (pointer, touch or arrow
// keys) and a table view as its accessible twin. Time runs left to right in both
// languages, like the dates people read in their banking and calendar apps.
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
 * fmtTick(date) for the axis, fmtDay(date) for the tooltip, fmtValue(n), and
 * labels { summary, table, chart, date, value }.
 */
export function areaChart({ points, fmtTick, fmtDay, fmtValue = String, labels }) {
  const PLOT = 132;
  const AXIS = 24;
  const PAD = { top: 10, left: 30, right: 10 };
  const max = niceMax(Math.max(0, ...points.map((p) => p.n)));

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

  const washId = `chart-wash-${++charts}`;
  let width = 0;
  let drawn = false;
  let active = -1;
  let geometry = null;

  function render() {
    width = plot.clientWidth;
    if (!width) return;
    const innerW = width - PAD.left - PAD.right;
    const x = (i) => PAD.left + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = (n) => PAD.top + PLOT - (n / max) * PLOT;
    geometry = { x, y };

    const root = svg('svg', { width, height: PAD.top + PLOT + AXIS, viewBox: `0 0 ${width} ${PAD.top + PLOT + AXIS}`, 'aria-hidden': 'true' });
    const defs = svg('defs');
    const fade = svg('linearGradient', { id: washId, x1: 0, y1: 0, x2: 0, y2: 1 });
    fade.append(svg('stop', { offset: '0%', class: 'wash-top' }), svg('stop', { offset: '100%', class: 'wash-bottom' }));
    defs.append(fade);
    root.append(defs);

    // Grid and y ticks: 0, the middle, the top. Solid hairlines, out of the way.
    for (const v of [0, max / 2, max]) {
      root.append(svg('line', { class: 'grid', x1: PAD.left, x2: width - PAD.right, y1: y(v), y2: y(v) }));
      const tick = svg('text', { class: 'tick', x: PAD.left - 8, y: y(v) + 4, 'text-anchor': 'end' });
      tick.textContent = fmtValue(v);
      root.append(tick);
    }
    // X ticks: first day, middle, last.
    const marks = [0, Math.floor((points.length - 1) / 2), points.length - 1];
    marks.forEach((i, k) => {
      const tick = svg('text', { class: 'tick', x: x(i), y: PAD.top + PLOT + 17, 'text-anchor': k === 0 ? 'start' : k === 2 ? 'end' : 'middle' });
      tick.textContent = fmtTick(points[i].date);
      root.append(tick);
    });

    const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.n).toFixed(1)}`).join(' ');
    const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
    const animate = !drawn && !reducedMotion();
    root.append(svg('path', { class: `wash ${animate ? 'enter' : ''}`, d: area, fill: `url(#${washId})` }));
    root.append(svg('path', { class: `line ${animate ? 'enter' : ''}`, d: line, pathLength: 1 }));
    // The latest day carries an end dot.
    const last = points.length - 1;
    root.append(svg('circle', { class: `dot end ${animate ? 'enter' : ''}`, cx: x(last), cy: y(points[last].n), r: 4 }));

    const cross = svg('line', { class: 'cross', x1: 0, x2: 0, y1: PAD.top, y2: PAD.top + PLOT, visibility: 'hidden' });
    const hoverDot = svg('circle', { class: 'dot', r: 4, visibility: 'hidden' });
    root.append(cross, hoverDot);
    geometry.cross = cross;
    geometry.hoverDot = hoverDot;

    clear(plot, root, tooltip);
    drawn = true;
    if (active >= 0) show(active);
  }

  function show(i) {
    if (!geometry) return;
    active = i;
    const p = points[i];
    const cx = geometry.x(i);
    const cy = geometry.y(p.n);
    geometry.cross.setAttribute('x1', cx);
    geometry.cross.setAttribute('x2', cx);
    geometry.cross.setAttribute('visibility', 'visible');
    geometry.hoverDot.setAttribute('cx', cx);
    geometry.hoverDot.setAttribute('cy', cy);
    geometry.hoverDot.setAttribute('visibility', 'visible');
    clear(tooltip, h('b', { text: fmtValue(p.n) }), h('span', { text: fmtDay(p.date) }));
    tooltip.hidden = false;
    // Keep the readout inside the card.
    const tipW = tooltip.offsetWidth;
    tooltip.style.left = `${Math.min(Math.max(cx - tipW / 2, 0), width - tipW)}px`;
    tooltip.style.top = `${Math.max(0, cy - 58)}px`;
  }

  function hide() {
    active = -1;
    tooltip.hidden = true;
    geometry?.cross.setAttribute('visibility', 'hidden');
    geometry?.hoverDot.setAttribute('visibility', 'hidden');
  }

  const nearest = (clientX) => {
    const rect = plot.getBoundingClientRect();
    const innerW = width - PAD.left - PAD.right;
    const ratio = (clientX - rect.left - PAD.left) / innerW;
    return Math.min(points.length - 1, Math.max(0, Math.round(ratio * (points.length - 1))));
  };
  plot.addEventListener('pointermove', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerdown', (e) => show(nearest(e.clientX)));
  plot.addEventListener('pointerleave', hide);
  plot.addEventListener('focus', () => show(active >= 0 ? active : points.length - 1));
  plot.addEventListener('blur', hide);
  plot.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const from = active >= 0 ? active : points.length - 1;
    const next = { ArrowLeft: from - 1, ArrowRight: from + 1, Home: 0, End: points.length - 1 }[e.key];
    show(Math.min(points.length - 1, Math.max(0, next)));
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
