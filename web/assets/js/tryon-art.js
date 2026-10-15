// Little drawn heads for the AI mirror's menu of men's cuts: one shape per cut, the hair
// in the colour being tried. Paths only (no images, no fonts), so they stay crisp at any
// size and recolour instantly when the customer taps a shade.
const NS = 'http://www.w3.org/2000/svg';

const SKIN = '#e3b994';
const SKIN_SHADE = '#cf9f78';

// Hair drawn behind the head (longer cuts), then in front of it (tops, fringes).
// 64 × 64 box; the face is centred at (32, 30).
const ART = {
  shaved: { sides: 0.12, shine: true },
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
  crew_cut: {
    front: ['M20.6 26.4c-.4-9.8 4.6-15.4 11.4-15.6 4.2-.1 7.6 1.4 9.6 4.2 1.4 2 2 4.4 1.8 7.6-.2 1.4-.6 2.6-1.2 3.6-2.2-3.6-5.6-5.4-10.2-5.4-4.8 0-8.6 2-11.4 5.6z', 'M26 13.8l1.2 3.2M30.6 12.6l.8 3.6M35.2 13l.2 3.4'],
    sides: 0.3,
  },
  quiff: {
    front: ['M20.6 26c-1-11 4.6-17.2 12-17.6 3.6-.2 6.6 1 8.6 2.8l2.4-2.6c.6 3.2.2 6-1 8.2 1.4 2.4 1.6 5 1.2 8.4-2.2-3.6-5.6-5.6-11-5.6-5.6 0-9.6 2.4-12.2 6.4z', 'M29.6 11c3.4-.6 7 .2 9.6 2.4'],
    sides: 0.25,
  },
  slick_back: {
    back: ['M20 28c-.4 6.6.8 10.8 3.6 13.2h16.8c2.8-2.4 4-6.6 3.6-13.2z'],
    front: ['M20.4 26.6c-.6-10.6 4.8-16.6 11.6-16.6 7.2 0 12.4 6 11.6 16.6-1-2.8-2.4-5-4.4-6.4-2.4-.8-4.6-1.2-7.2-1.2s-5 .4-7.2 1.2c-2 1.4-3.4 3.6-4.4 6.4z', 'M26 19.4c1-3.8 3.4-6.6 6.6-7.8M31 18.8c.6-3.6 2.4-6 5-7.2M36.2 19.4c.4-2.8 1.4-4.8 3-6'],
  },
  flow: {
    back: ['M18.4 30c-.6-12.4 5.6-19.8 13.6-19.8s14.2 7.4 13.6 19.8l.6 11.6c-1.2 2.4-3.4 3.6-6 3.8l-1.4-9.4H25.2l-1.4 9.4c-2.6-.2-4.8-1.4-6-3.8z'],
    front: ['M20.4 27.4c-.2-10.4 5-16.2 11.6-16.2 6.8 0 11.8 5.8 11.6 16.2-1.6-4.2-4-7-7.4-8-1.4-1-2.8-1.6-4.2-1.6s-2.8.6-4.2 1.6c-3.4 1-5.8 3.8-7.4 8z', 'M27 13.4c2.6-1 6-1 9 .4'],
  },
  curls_fade: {
    curls: [[24, 16, 3.6], [28.6, 12.8, 3.8], [33.6, 12, 3.8], [38.4, 14, 3.6], [41.4, 18.6, 3.2], [22, 20.6, 3.2], [26.6, 18.4, 3.4], [31.6, 16.6, 3.6], [36.4, 17.6, 3.4]],
    sides: 0.35,
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
  // A shaved head: the light on the bare scalp.
  if (art.shine) svg.append(el('ellipse', { cx: 28.4, cy: 19.6, rx: 4.6, ry: 2.2, fill: '#ffffff', opacity: 0.35, transform: 'rotate(-18 28.4 19.6)' }));
  (art.front ?? []).forEach((d, i) => {
    // The first path is the hair's shape; the rest are its lines (fringe, combing).
    svg.append(i === 0
      ? el('path', { d, fill: hair, opacity: art.soft ? 0.72 : 1 })
      : el('path', { d, fill: 'none', stroke: hair, 'stroke-width': 1.4, 'stroke-linecap': 'round', opacity: 0.9 }));
  });
  if (art.part) svg.append(el('path', { d: 'M26.6 11.8l-.8 9.4', stroke: '#ffffff', 'stroke-width': 0.9, 'stroke-linecap': 'round', opacity: 0.55 }));
  return svg;
}
