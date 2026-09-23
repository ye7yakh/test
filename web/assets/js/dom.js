// Tiny DOM toolkit. User content only ever goes in via textContent, never innerHTML,
// and styles go through the CSSOM so the strict CSP needs no 'unsafe-inline'.
import { errorText, t } from './i18n.js';

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

// Stroke icons (24px grid). Each entry: [tag, attrs].
const ICONS = {
  store: [['path', { d: 'M3 10l9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' }]],
  scissors: [
    ['circle', { cx: 6, cy: 6, r: 3 }],
    ['circle', { cx: 6, cy: 18, r: 3 }],
    ['path', { d: 'M20 4L8.12 15.88M14.47 14.48L20 20M8.12 8.12L12 12' }],
  ],
  users: [
    ['path', { d: 'M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 9, cy: 7, r: 4 }],
    ['path', { d: 'M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75' }],
  ],
  clock: [['circle', { cx: 12, cy: 12, r: 10 }], ['path', { d: 'M12 6v6l4 2' }]],
  plus: [['path', { d: 'M12 5v14M5 12h14' }]],
  x: [['path', { d: 'M18 6L6 18M6 6l12 12' }]],
  trash: [['path', { d: 'M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6' }]],
  camera: [
    ['path', { d: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z' }],
    ['circle', { cx: 12, cy: 13, r: 4 }],
  ],
  up: [['path', { d: 'M18 15l-6-6-6 6' }]],
  down: [['path', { d: 'M6 9l6 6 6-6' }]],
  globe: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' }],
  ],
  logout: [['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9' }]],
  external: [['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3' }]],
  phone: [
    ['path', { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.12.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.58 2.81.7A2 2 0 0 1 22 16.92z' }],
  ],
  pin: [['path', { d: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z' }], ['circle', { cx: 12, cy: 10, r: 3 }]],
  copy: [
    ['rect', { x: 9, y: 9, width: 13, height: 13, rx: 2 }],
    ['path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' }],
  ],
  sort: [['path', { d: 'M7 4v16M4 7l3-3 3 3M17 20V4M14 17l3 3 3-3' }]],
  user: [['path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }], ['circle', { cx: 12, cy: 7, r: 4 }]],
  chevron: [['path', { d: 'M15 18l-6-6 6-6' }]],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

export function icon(name, cls = '') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', `icon ${cls}`.trim());
  for (const [tag, attrs] of ICONS[name] ?? []) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
    svg.append(el);
  }
  return svg;
}

// ---------------------------------------------------------------- feedback

let toastTimer;
export function toast(message, kind = '') {
  document.querySelector('.toast')?.remove();
  const el = h('div', { class: `toast ${kind}`, role: 'status', text: message });
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), kind === 'error' ? 4500 : 2200);
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

/**
 * Opens a bottom sheet. `body` is an element; `actions` are footer buttons.
 * Returns { close, el }. Escape and backdrop taps close it.
 */
export function sheet({ title, body, actions = [], onClose }) {
  const previous = document.activeElement;
  const closeBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('close') }, icon('x'));
  const panel = h(
    'div',
    { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' }, h('h2', { text: title }), closeBtn),
    h('div', { class: 'sheet-body' }, body),
    actions.length ? h('div', { class: 'sheet-foot' }, actions) : null,
  );
  const backdrop = h('div', { class: 'sheet-backdrop' }, panel);
  const close = () => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    document.body.style.overflow = '';
    previous?.focus?.();
    onClose?.();
  };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
  };
  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.style.overflow = 'hidden';
  document.body.append(backdrop);
  panel.querySelector('input, select, textarea')?.focus({ preventScroll: true });
  return { close, el: panel };
}

export function confirmDelete() {
  return new Promise((resolve) => {
    let answered = false;
    const yes = h('button', { class: 'btn btn-danger', type: 'button', text: t('confirm.yes') });
    const no = h('button', { class: 'btn btn-ghost', type: 'button', text: t('cancel') });
    const s = sheet({
      title: t('delete'),
      body: h('p', { text: t('confirm.delete') }),
      actions: [no, yes],
      onClose: () => answered || resolve(false),
    });
    yes.addEventListener('click', () => {
      answered = true;
      s.close();
      resolve(true);
    });
    no.addEventListener('click', () => s.close());
  });
}

// ---------------------------------------------------------------- form bits

export function field(label, control, { hint, optional } = {}) {
  return h(
    'label',
    { class: 'field' },
    h('span', { class: 'label' }, label, optional ? h('span', { class: 'muted small', text: ` (${t('optional')})` }) : null),
    control,
    hint ? h('span', { class: 'hint', text: hint }) : null,
  );
}

export function input(attrs) {
  return h('input', { class: 'input', type: 'text', ...attrs });
}

export function switchEl(checked, label) {
  const box = h('input', { type: 'checkbox', checked, role: 'switch' });
  const el = h('label', { class: 'switch' }, box, h('span', { class: 'track' }), label ? h('span', { text: label }) : null);
  return { el, input: box };
}

export function chips(items, selected) {
  const set = new Set(selected);
  const boxes = [];
  const el = h(
    'div',
    { class: 'chips' },
    items.map((item) => {
      const box = h('input', { type: 'checkbox', value: String(item.id), checked: set.has(item.id) });
      boxes.push(box);
      return h('label', { class: 'chip' }, box, h('span', { text: item.label }));
    }),
  );
  return { el, value: () => boxes.filter((b) => b.checked).map((b) => Number(b.value)) };
}

/** Highlights the input named by an API error's field, if it is in this form. */
export function markInvalid(form, err) {
  form.querySelectorAll('.invalid').forEach((el) => el.classList.remove('invalid'));
  if (!err?.field) return;
  form.querySelector(`[name="${CSS.escape(err.field)}"]`)?.classList.add('invalid');
}

export function initials(name) {
  return (name || '?').trim().charAt(0);
}

export function avatar(url, name, cls = '') {
  return url
    ? h('img', { class: `avatar ${cls}`, src: url, alt: '', loading: 'lazy' })
    : h('span', { class: `avatar ${cls}`, text: initials(name) });
}
