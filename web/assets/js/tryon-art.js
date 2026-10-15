// Little drawn heads for the AI mirror's haircut menu: one shape per cut, the hair in
// the colour being tried. Paths only (no images, no fonts), so they stay crisp at any
// size and recolour instantly when the customer taps a shade.
const NS = 'http://www.w3.org/2000/svg';

const SKIN = '#e3b994';
const SKIN_SHADE = '#cf9f78';

// Hair drawn behind the head (long styles), then in front of it (tops, fringes).
// 64 × 64 box; the face is centred at (32, 30).
const ART = {
  skin_fade: {
    front: ['M20.6 25.2c-.3-9.4 4.7-14.7 11.4-14.7s11.7 5.3 11.4 14.7c-2.4-3.4-6-5.2-11.4-5.2s-9 1.8-11.4 5.2z'],
    sides: 0.22,
  },
  low_taper: {
    front: ['M20.4 26c-.8-10.4 4.9-16.4 11.8-16.4 7.5 0 12.7 5.9 11.4 16.4-1.8-4.1-5.4-6.7-11.6-6.7-5.8 0-9.4 2.4-11.6 6.7z', 'M25 14.5c3-1.6 8-2 12.5-.4'],
    sides: 0.45,
  },
  buzz: {
    front: ['M20.7 27.2c-.2-10.2 5.1-15.7 11.3-15.7s11.5 5.5 11.3 15.7c-2-5.1-5.8-7.8-11.3-7.8s-9.3 2.7-11.3 7.8z'],
    sides: 0.5,
    soft: true,
  },
  crop: {
    front: ['M20.3 26.4c-.6-10 4.6-15.6 11.7-15.6s12.3 5.6 11.7 15.6c-.8-1.8-1.6-3.4-2.4-4.4H22.7c-.8 1-1.6 2.6-2.4 4.4z', 'M24 18.4l2 3.4M28.4 18l1.4 3.8M33 18l.8 3.8M37.4 18.2l-.4 3.6'],
    sides: 0.25,
  },
  pompadour: {
    front: ['M20.6 26c-1.4-12.6 5.4-19.6 13.6-19.2 8.2.4 11.8 6.6 9.4 18.6-1.8-3.6-4.8-5.4-10-5.4-6.4 0-10.6 2.2-13 6z'],
    sides: 0.22,
  },
  side_part: {
    front: ['M20.4 26.2c-.6-10.2 5-15.8 11.6-15.8 7 0 12.2 5.6 11.6 15.8-1.4-3.6-3.6-6-7.4-7-3.2 1.6-7.8 2.4-12.6 2.2-1.4 1.2-2.4 2.8-3.2 4.8z', 'M26.6 11.6l-.8 9.8'],
    sides: 0.4,
    part: true,
  },
  undercut: {
    front: ['M21.6 23.4c-.4-8.8 4.6-14.2 11-14.6 6.8-.4 11.4 4 11.2 12.2-.4 1.2-1.4 1.8-2.6 1.4-2.2-2.8-5.6-4-9.6-4-4.4 0-7.6 1.4-10 5z'],
    sides: 0.16,
  },
  curls_fade: {
    curls: [[24, 16, 3.6], [28.6, 12.8, 3.8], [33.6, 12, 3.8], [38.4, 14, 3.6], [41.4, 18.6, 3.2], [22, 20.6, 3.2], [26.6, 18.4, 3.4], [31.6, 16.6, 3.6], [36.4, 17.6, 3.4]],
    sides: 0.35,
  },
  long_layers: {
    back: ['M16.6 31c-.4-13.8 6.8-21.6 15.4-21.6S47.8 17.2 47.4 31l.6 20.4c-1.6 3-4.6 4.4-8 4.6l-2-17.6H26l-2 17.6c-3.4-.2-6.4-1.6-8-4.6z'],
    front: ['M20.2 27.4c0-10.4 5.2-16.4 11.8-16.4s11.8 6 11.8 16.4c-2.6-5.4-6.6-8-11.8-8s-9.2 2.6-11.8 8z'],
  },
  bob: {
    back: ['M17.6 30c-.2-12.6 6.4-20 14.4-20s14.6 7.4 14.4 20l.2 11.2c-.8 3-3.2 4.6-6.2 4.6l-1.6-9.6H25.2l-1.6 9.6c-3 0-5.4-1.6-6.2-4.6z'],
    front: ['M20.4 26.8c-.4-10 5-15.6 11.6-15.6 7 0 12 5.6 11.6 15.6-2-4.6-6-7.4-11.6-7.4s-9.6 2.8-11.6 7.4z'],
  },
  lob: {
    back: ['M17.2 30.4c-.4-13 6.6-20.6 14.8-20.6s15.2 7.6 14.8 20.6l.6 15.8c-1.2 3.4-4 5-7.2 5l-1.8-13.6H25.6l-1.8 13.6c-3.2 0-6-1.6-7.2-5z'],
    front: ['M20.4 26.8c-.2-10 5-15.6 11.6-15.6s11.8 5.6 11.6 15.6c-2.4-4.8-6.2-7.4-11.6-7.4s-9.2 2.6-11.6 7.4z'],
  },
  curtain_bangs: {
    back: ['M16.8 31c-.4-13.8 6.8-21.6 15.2-21.6s15.6 7.8 15.2 21.6l.8 20c-1.6 3-4.6 4.6-8 4.8l-2-18H25.8l-2 18c-3.4-.2-6.4-1.8-8-4.8z'],
    front: ['M20.2 28.4c-.6-11 5-17.2 11.8-17.2s12.4 6.2 11.8 17.2c-.6-3.6-2.8-6.6-6.4-7.8-2.2 1.6-3.8 2.4-5.4 2.4s-3.2-.8-5.4-2.4c-3.6 1.2-5.8 4.2-6.4 7.8z'],
  },
  pixie: {
    front: ['M19.6 29.6c-1.6-12.4 4.4-19.4 12.6-19.4 7.8 0 13.2 6.4 12 16.4-1.8-3.6-4.2-6-7.2-6.8-1.6 2.6-5.4 4.6-10.6 4.8-2.8 1-5 2.8-6.8 5z', 'M21 24.8c-1 2-1.4 4-1.4 6.2'],
    sides: 0.4,
  },
  waves: {
    back: ['M16.4 30.6c-.4-13.6 7-21.4 15.6-21.4s16 7.8 15.6 21.4c1.6 3.4-.8 6.4.8 9.8 1.6 3.4-.8 6.6.8 10.2-2 3.2-5.4 4.6-9 4.6l-2.4-18H26.2l-2.4 18c-3.6 0-7-1.4-9-4.6 1.6-3.6-.8-6.8.8-10.2 1.6-3.4-.8-6.4.8-9.8z'],
    front: ['M20.2 27.6c0-10.6 5.2-16.6 11.8-16.6s11.8 6 11.8 16.6c-2.6-5.4-6.6-8.2-11.8-8.2s-9.2 2.8-11.8 8.2z'],
  },
  sleek: {
    back: ['M18 29.8c-.2-12.8 6.2-20.4 14-20.4s14.2 7.6 14 20.4l.4 26c-2 .4-3.8.4-5.4.2l-1.4-19.2H24.4L23 56c-1.6.2-3.4.2-5.4-.2z'],
    front: ['M20.6 27.4c-.2-10.6 4.8-16.6 11.4-16.6s11.6 6 11.4 16.6c-1.6-4.8-4.4-7.8-7.6-8.6-1.4-1.4-2.6-2.2-3.8-2.2s-2.4.8-3.8 2.2c-3.2.8-6 3.8-7.6 8.6z', 'M32 11v6'],
    part: true,
  },
  shag: {
    back: ['M16.6 31c-.6-13.6 6.6-21.4 15.4-21.4s16 7.8 15.4 21.4l1.4 6-2 2 1.2 6.4-2.6 1.6.6 5.2c-2.4 1.6-5 2-7.4 1.8l-1.8-16H26.2l-1.8 16c-2.4.2-5-.2-7.4-1.8l.6-5.2-2.6-1.6 1.2-6.4-2-2z'],
    front: ['M20 28.8c-.6-11.4 4.8-17.6 12-17.6s12.6 6.2 12 17.6l-2.2-3.2-1.6 2-1.8-4.4-2.4 2.6-1.6-4.2-2.4 3.2-2.4-3.2-1.6 4.2-2.4-2.6-1.8 4.4-1.6-2z'],
  },
};

const DEFAULT_HAIR = '#2b1d16';

function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * The drawn head for a cut. `hair` is the colour being tried (or the default dark
 * brown); `body` colours the shoulders (the salon's accent reads well).
 */
export function styleArt(id, { hair = DEFAULT_HAIR, body = 'currentColor' } = {}) {
  const art = ART[id] ?? ART.skin_fade;
  const svg = el('svg', { viewBox: '0 0 64 64', 'aria-hidden': 'true', class: 'style-art' });
  for (const d of art.back ?? []) svg.append(el('path', { d, fill: hair }));
  svg.append(el('path', { d: 'M10 64c1.6-11.4 10-17.6 22-17.6S52.4 52.6 54 64z', fill: body, opacity: 0.9 }));
  svg.append(el('rect', { x: 27, y: 36, width: 10, height: 13, rx: 4.6, fill: SKIN_SHADE }));
  svg.append(el('ellipse', { cx: 21.2, cy: 30.6, rx: 2.2, ry: 3.2, fill: SKIN_SHADE }));
  svg.append(el('ellipse', { cx: 42.8, cy: 30.6, rx: 2.2, ry: 3.2, fill: SKIN_SHADE }));
  svg.append(el('ellipse', { cx: 32, cy: 29.4, rx: 11, ry: 13.4, fill: SKIN }));
  // Faded or short sides: the hair as a light shadow down the side of the head.
  if (art.sides) {
    svg.append(el('path', { d: 'M21 25c-.6 3.4-.2 6.6 1.2 9.6M43 25c.6 3.4.2 6.6-1.2 9.6', stroke: hair, 'stroke-width': 2.4, 'stroke-linecap': 'round', fill: 'none', opacity: art.sides }));
  }
  for (const [cx, cy, r] of art.curls ?? []) svg.append(el('circle', { cx, cy, r, fill: hair }));
  (art.front ?? []).forEach((d, i) => {
    // The first path is the hair's shape; the rest are its lines (fringe, combing).
    svg.append(i === 0
      ? el('path', { d, fill: hair, opacity: art.soft ? 0.72 : 1 })
      : el('path', { d, fill: 'none', stroke: hair, 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.9 }));
  });
  if (art.part) svg.append(el('path', { d: art === ART.sleek ? 'M32 11.2v6.4' : 'M26.6 11.8l-.8 9.4', stroke: '#ffffff', 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.55 }));
  return svg;
}
