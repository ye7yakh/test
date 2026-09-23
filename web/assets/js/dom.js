// Tiny DOM toolkit. User content only ever goes in via textContent, never innerHTML,
// and styles go through the CSSOM so the strict CSP needs no 'unsafe-inline'.
import { errorText, t } from './i18n.js';
import { reducedMotion } from './theme.js';

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') el.className = value;
      else if (key === 'text') el.textContent = value;
      else if (key === 'style') {
        for (const [prop, v] of Object.entries(value)) {
          if (prop.startsWith('--')) el.style.setProperty(prop, v);
          else el.style[prop] = v;
        }
      } else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
      else if (key in el && typeof value !== 'string') el[key] = value;
      else el.setAttribute(key, value === true ? '' : value);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(el, child);
    else el.append(child instanceof Node ? child : String(child));
  }
}

export function clear(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

/** Staggered entrance for a list of elements. */
export function stagger(nodes, start = 0) {
  nodes.forEach((node, i) => {
    if (!node) return;
    node.classList.add('rise');
    node.style.setProperty('--i', String(start + i));
  });
  return nodes;
}

// ---------------------------------------------------------------- icons (24px, stroke)

const ICONS = {
  home: [['path', { d: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z' }]],
  palette: [
    ['path', { d: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.9 1.8-1.9 0-.5-.2-.9-.5-1.3-.3-.3-.5-.8-.5-1.3 0-1 .8-1.9 1.9-1.9H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z' }],
    ['circle', { cx: 7.5, cy: 11.5, r: 1.3 }], ['circle', { cx: 10.5, cy: 7.5, r: 1.3 }], ['circle', { cx: 15.5, cy: 8, r: 1.3 }],
  ],
  scissors: [
    ['circle', { cx: 6, cy: 6, r: 3 }], ['circle', { cx: 6, cy: 18, r: 3 }],
    ['path', { d: 'M20 4 8.1 15.9M14.5 14.5 20 20M8.1 8.1 12 12' }],
  ],
  users: [
    ['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: 9, cy: 7, r: 4 }],
    ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8' }],
  ],
  clock: [['circle', { cx: 12, cy: 12, r: 9.5 }], ['path', { d: 'M12 7v5l3.5 2' }]],
  gear: [
    ['circle', { cx: 12, cy: 12, r: 3 }],
    ['path', { d: 'M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' }],
  ],
  eye: [['path', { d: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z' }], ['circle', { cx: 12, cy: 12, r: 3 }]],
  eyeOff: [['path', { d: 'M17.9 17.9A10 10 0 0 1 12 19c-6.4 0-10-7-10-7a18 18 0 0 1 5.1-5.9M9.9 5.2A9 9 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-2.2 3.2M14.1 14.2a3 3 0 1 1-4.2-4.2M2 2l20 20' }]],
  sparkles: [
    ['path', { d: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z' }],
    ['path', { d: 'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 2.5l.6 1.6 1.6.6-1.6.6L5 6.9l-.6-1.6-1.6-.6 1.6-.6z' }],
  ],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  minus: [['path', { d: 'M5 12h14' }]],
  x: [['path', { d: 'M18 6 6 18M6 6l12 12' }]],
  check: [['path', { d: 'M20 6 9 17l-5-5' }]],
  checkCircle: [['circle', { cx: 12, cy: 12, r: 9.5 }], ['path', { d: 'm8 12.5 2.8 2.8L16.5 9.5' }]],
  alert: [['circle', { cx: 12, cy: 12, r: 9.5 }], ['path', { d: 'M12 7.5v5M12 16.2v.3' }]],
  trash: [['path', { d: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6' }]],
  camera: [
    ['path', { d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' }],
    ['circle', { cx: 12, cy: 13, r: 4 }],
  ],
  image: [['rect', { x: 3, y: 3, width: 18, height: 18, rx: 3 }], ['circle', { cx: 9, cy: 9, r: 2 }], ['path', { d: 'm21 15-4.5-4.5L6 21' }]],
  up: [['path', { d: 'm18 15-6-6-6 6' }]],
  down: [['path', { d: 'm6 9 6 6 6-6' }]],
  chevron: [['path', { d: 'm15 18-6-6 6-6' }]],
  arrow: [['path', { d: 'M19 12H5M11 6l-6 6 6 6' }]],
  globe: [
    ['circle', { cx: 12, cy: 12, r: 9.5 }],
    ['path', { d: 'M2.5 12h19M12 2.5a14.5 14.5 0 0 1 4 9.5 14.5 14.5 0 0 1-4 9.5 14.5 14.5 0 0 1-4-9.5 14.5 14.5 0 0 1 4-9.5z' }],
  ],
  logout: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' }]],
  external: [['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3' }]],
  share: [['path', { d: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13' }]],
  copy: [['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2.5 }], ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }]],
  link: [['path', { d: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7' }]],
  sort: [['path', { d: 'M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3' }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  store: [['path', { d: 'M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6' }]],
  phone: [['path', { d: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z' }]],
  pin: [['path', { d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' }], ['circle', { cx: 12, cy: 10, r: 3 }]],
  lock: [['rect', { x: 4, y: 11, width: 16, height: 10, rx: 2.5 }], ['path', { d: 'M8 11V7a4 4 0 0 1 8 0v4' }]],
  wand: [['path', { d: 'M15 4V2M15 16v-2M8 9h2M20 9h2M17.8 11.8 19 13M17.8 6.2 19 5M3 21l9-9M12.2 6.2 11 5' }]],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) {
    svg.setAttribute(k, v);
  }
  svg.setAttribute('class', `icon ${cls}`.trim());
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}

/** The default app mark (scissors), drawn like the server's icon so previews match. */
export function scissorsMark() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 512 512');
  svg.setAttribute('aria-hidden', 'true');
  const g = document.createElementNS(SVG_NS, 'g');
  for (const [k, v] of Object.entries({ fill: 'none', stroke: 'currentColor', 'stroke-width': '24', 'stroke-linecap': 'round' })) g.setAttribute(k, v);
  for (const [tag, attrs] of [
    ['circle', { cx: 190, cy: 340, r: 48 }], ['circle', { cx: 322, cy: 340, r: 48 }],
    ['path', { d: 'M222 304 L338 150' }], ['path', { d: 'M290 304 L174 150' }],
  ]) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    g.append(el);
  }
  svg.append(g);
  return svg;
}

// ---------------------------------------------------------------- feedback

let toastTimer;
export function toast(message, kind = '') {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${kind}`, role: 'status' }, icon(kind === 'error' ? 'alert' : 'checkCircle'), h('span', { text: message }));
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 300);
  }, kind === 'error' ? 4200 : 2200);
}

export const toastError = (err) => toast(errorText(err), 'error');

/** Runs an async action with the button showing a spinner; errors become a toast. */
export async function busy(button, fn) {
  if (button.classList.contains('busy')) return undefined;
  button.classList.add('busy');
  button.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toastError(err);
    return undefined;
  } finally {
    button.classList.remove('busy');
    button.disabled = false;
  }
}

// ---------------------------------------------------------------- sheet (modal)

const finePointer = () => matchMedia('(pointer: fine)').matches;

/**
 * Opens a bottom sheet (a centred dialog on wide screens). Escape, the close
 * button, a tap on the backdrop or a swipe down on the handle close it.
 */
export function sheet({ title, body, actions = [], onClose, tall = false }) {
  const previous = document.activeElement;
  const closeBtn = h('button', { class: 'icon-btn plain', type: 'button', 'aria-label': t('close') }, icon('x'));
  const head = h('div', { class: 'sheet-head' }, h('h2', { text: title }), closeBtn);
  const handle = h('div', { class: 'sheet-handle' });
  const panel = h(
    'div',
    { class: `sheet${tall ? ' tall' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    handle,
    head,
    h('div', { class: 'sheet-body' }, body),
    actions.filter(Boolean).length ? h('div', { class: 'sheet-foot' }, actions.filter(Boolean)) : null,
  );
  const backdrop = h('div', { class: 'sheet-backdrop' }, panel);
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    panel.classList.add('closing');
    backdrop.classList.add('closing');
    setTimeout(() => {
      backdrop.remove();
      if (!document.querySelector('.sheet-backdrop')) document.body.style.overflow = '';
    }, reducedMotion() ? 0 : 260);
    previous?.focus?.({ preventScroll: true });
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && backdrop === [...document.querySelectorAll('.sheet-backdrop')].pop()) close();
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  // Swipe down on the handle or title to dismiss.
  let startY = null;
  for (const zone of [handle, head]) {
    zone.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button')) return;
      startY = e.clientY;
      zone.setPointerCapture(e.pointerId);
      panel.style.transition = 'none';
    });
    zone.addEventListener('pointermove', (e) => {
      if (startY === null) return;
      panel.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`;
    });
    const end = (e) => {
      if (startY === null) return;
      const dy = e.clientY - startY;
      startY = null;
      panel.style.transition = '';
      panel.style.transform = '';
      if (dy > 110) close();
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(backdrop);
  // Only desktop gets auto-focus: on phones it would throw the keyboard over the sheet.
  if (finePointer()) panel.querySelector('.sheet-body input, .sheet-body textarea')?.focus({ preventScroll: true });
  return { close, el: panel };
}

export function confirmDelete() {
  return new Promise((resolve) => {
    let answered = false;
    const yes = h('button', { class: 'btn btn-danger', type: 'button', text: t('confirm.yes') });
    const no = h('button', { class: 'btn btn-secondary', type: 'button', text: t('cancel') });
    const s = sheet({
      title: t('confirm.title'),
      body: h('p', { class: 'muted', text: t('confirm.delete') }),
      actions: [no, yes],
      onClose: () => answered || resolve(false),
    });
    yes.style.flex = '1';
    yes.addEventListener('click', () => {
      answered = true;
      s.close();
      resolve(true);
    });
    no.addEventListener('click', () => s.close());
  });
}

// ---------------------------------------------------------------- form bits

/** A floating-label field. The control gets a blank placeholder so CSS can tell when it is empty. */
export function field(label, control, { hint, optional, suffix } = {}) {
  const isSelect = control.tagName === 'SELECT';
  if (!isSelect && !control.getAttribute('placeholder')) control.setAttribute('placeholder', ' ');
  return h(
    'label',
    { class: 'f' },
    control,
    h('span', { class: 'label' }, label, optional ? h('span', { class: 'optional', text: ` · ${t('optional')}` }) : null),
    isSelect ? icon('down', 'chev') : null,
    suffix ? h('span', { class: 'suffix', text: suffix }) : null,
    hint ? h('span', { class: 'hint', text: hint }) : null,
  );
}

export function input(attrs) {
  return h('input', { type: 'text', ...attrs });
}

export function switchEl(checked, label) {
  const box = h('input', { type: 'checkbox', checked, role: 'switch', 'aria-label': label });
  const el = h('label', { class: 'switch' }, box, h('span', { class: 'track' }));
  return { el, input: box };
}

/** A settings-style row: title, optional hint, switch at the end. */
export function switchRow(title, sub, checked) {
  const sw = switchEl(checked, title);
  const el = h('label', { class: 'switch-row' }, h('div', { class: 'grow' }, h('div', { text: title }), sub ? h('div', { text: sub }) : null), sw.el);
  return { el, input: sw.input };
}

/** Toggle chips. items: { id, label, img?, emoji? }. */
export function chips(items, selected) {
  const set = new Set(selected);
  const boxes = [];
  const el = h(
    'div',
    { class: 'chips' },
    items.map((item) => {
      const box = h('input', { type: 'checkbox', value: String(item.id), checked: set.has(item.id) });
      boxes.push(box);
      return h(
        'label',
        { class: 'chip' },
        box,
        h(
          'span',
          null,
          item.img !== undefined ? avatar(item.img, item.label) : null,
          item.emoji ? h('span', { class: 'emoji', text: item.emoji }) : null,
          item.label,
        ),
      );
    }),
  );
  return { el, value: () => boxes.filter((b) => b.checked).map((b) => Number(b.value)) };
}

/** Highlights the field an API error points at, if it is in this form, and brings it into view. */
export function markInvalid(form, err) {
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  const name = err?.field?.split('.').pop();
  if (!name) return;
  const control = form.querySelector(`[name="${CSS.escape(name)}"]`);
  const target = control?.closest('.f, .price-field') ?? control;
  if (!target) return;
  target.classList.add('invalid');
  target.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' });
}

export function initials(name) {
  return (name || '?').trim().charAt(0);
}

export function avatar(url, name, cls = '') {
  return url
    ? h('img', { class: `avatar ${cls}`, src: url, alt: '', loading: 'lazy' })
    : h('span', { class: `avatar ${cls}`, text: initials(name) });
}

/** The salon's app icon: its logo on white, or the scissors mark on the main colour. */
export function appIcon(logoUrl, cls = '') {
  return logoUrl
    ? h('div', { class: `app-icon logo ${cls}` }, h('img', { src: logoUrl, alt: '' }))
    : h('div', { class: `app-icon ${cls}` }, scissorsMark());
}

/** Counts a number up from zero, e.g. on stat cards. `format` turns the value into text. */
export function countUp(el, to, { duration = 900, format = (v) => String(v) } = {}) {
  if (reducedMotion() || to === 0) {
    el.textContent = format(to);
    return el;
  }
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - (1 - p) ** 3;
    el.textContent = format(Math.round(to * eased));
    if (p < 1) requestAnimationFrame(tick);
  };
  el.textContent = format(0);
  requestAnimationFrame(tick);
  return el;
}

// ---------------------------------------------------------------- progress ring

export function ring(value, { big, small, size = 92 } = {}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const circle = (cls) => {
    const el = document.createElementNS(SVG_NS, 'circle');
    for (const [k, v] of Object.entries({ cx: 50, cy: 50, r, class: cls })) el.setAttribute(k, String(v));
    return el;
  };
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  const track = circle('track');
  const bar = circle('value');
  bar.setAttribute('stroke-dasharray', String(c));
  bar.setAttribute('stroke-dashoffset', String(c));
  svg.append(track, bar);
  const value100 = Math.round(value * 100);
  const label = h('b');
  if (big === undefined) countUp(label, value100, { duration: 1200, format: (v) => `${v}%` });
  else label.textContent = big;
  const el = h('div', { class: 'ring', style: { '--size': `${size}px` }, role: 'img', 'aria-label': big ?? `${value100}%` }, svg, h('div', { class: 'label' }, h('div', null, label, small ? h('span', { text: small }) : null)));
  // Animate from empty once it is on screen.
  requestAnimationFrame(() => requestAnimationFrame(() => bar.setAttribute('stroke-dashoffset', String(c * (1 - Math.max(0.001, value))))));
  return el;
}

// ---------------------------------------------------------------- unsaved-changes bar

export function savebar({ onSave, onDiscard }) {
  const save = h('button', { class: 'btn btn-primary btn-sm', type: 'button', text: t('save') });
  const discard = h('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: t('discard') });
  const el = h('div', { class: 'savebar', role: 'region', 'aria-label': t('unsaved') }, h('div', { class: 'grow', text: t('unsaved') }), discard, save);
  save.addEventListener('click', () => busy(save, onSave));
  discard.addEventListener('click', onDiscard);
  return {
    toggle(show) {
      if (show && !el.isConnected) document.body.append(el);
      if (!show) el.remove();
    },
    remove: () => el.remove(),
  };
}

// ---------------------------------------------------------------- celebration

export function confetti(colors) {
  if (reducedMotion()) return;
  const canvas = h('canvas', { class: 'confetti' });
  document.body.append(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = (canvas.width = innerWidth * dpr);
  const H = (canvas.height = innerHeight * dpr);
  const ctx = canvas.getContext('2d');
  const parts = Array.from({ length: 140 }, () => ({
    x: W / 2 + (Math.random() - 0.5) * W * 0.3,
    y: H * 0.35,
    vx: (Math.random() - 0.5) * 22 * dpr,
    vy: (-Math.random() * 18 - 8) * dpr,
    w: (6 + Math.random() * 6) * dpr,
    h: (3 + Math.random() * 4) * dpr,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));
  const start = performance.now();
  const frame = (now) => {
    const elapsed = now - start;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += 0.55 * dpr;
      p.vx *= 0.985;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - elapsed / 2600);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (elapsed < 2600) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
