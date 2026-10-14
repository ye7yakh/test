// Salon colours at runtime (the first paint already has them from index.html),
// and the switch between the owner's studio and the salon's own night theme.

// The same colour maths as src/colors.ts: the server paints the first frame, this
// keeps live previews (unsaved palette picks) identical.
const rgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (c) => `#${c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('')}`;

function luminance(hex) {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Black or white, whichever reads better on the given background. Same rule as the server. */
export function onColor(hex) {
  const L = luminance(hex);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111111' : '#ffffff';
}

/** The salon's page at night: its main colour, deep in near-black. */
export const nightBase = (primary) => toHex(rgb(primary).map((v, i) => v * 0.2 + [6, 6, 10][i] * 0.8));

function toHsl([r, g, b]) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  return [h / 6, s, l];
}

function fromHsl(h, s, l) {
  if (s === 0) return toHex([l * 255, l * 255, l * 255]);
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t) => {
    const x = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return toHex([ch(h + 1 / 3) * 255, ch(h) * 255, ch(h - 1 / 3) * 255]);
}

/** The accent, lightened only as far as it takes to read on the night page. */
export function accentForDark(accent, against = '#16161f') {
  const [h, s, l0] = toHsl(rgb(accent));
  let out = accent;
  for (let l = l0; contrast(out, against) < 4.5 && l < 0.96; ) {
    l = Math.min(0.96, l + 0.03);
    out = fromHsl(h, s, l);
  }
  return out;
}

/** The accent, darkened only as far as it takes to read on the day page (white cards). */
export function accentForLight(accent, against = '#ffffff') {
  const [h, s, l0] = toHsl(rgb(accent));
  let out = accent;
  for (let l = l0; contrast(out, against) < 4.5 && l > 0.04; ) {
    l = Math.max(0.04, l - 0.03);
    out = fromHsl(h, s, l);
  }
  return out;
}

/** The salon's page by day: a warm off-white with a breath of its main colour. */
export const dayBase = (primary) => toHex(rgb(primary).map((v, i) => v * 0.06 + [247, 246, 243][i] * 0.94));

/** Every colour the themes derive from the salon's pair (same as brandVars on the server). */
export function brandVars(primary, accent) {
  const lift = accentForDark(accent);
  const ink = accentForLight(accent);
  return {
    '--primary': primary,
    '--on-primary': onColor(primary),
    '--accent': accent,
    '--on-accent': onColor(accent),
    '--night': nightBase(primary),
    '--day': dayBase(primary),
    '--accent-lift': lift,
    '--on-accent-lift': onColor(lift),
    '--accent-ink': ink,
    '--on-accent-ink': onColor(ink),
    '--primary-lift': accentForDark(primary),
  };
}

export function applyColors(primary, accent) {
  const root = document.documentElement.style;
  for (const [k, v] of Object.entries(brandVars(primary, accent))) root.setProperty(k, v);
  syncThemeColor();
}

/**
 * The salon's two looks: its customer page at night or by day, and the owner's
 * dashboard in the studio's violet and blue or in the salon's own colours.
 */
export function applyLooks({ page_theme, studio_theme }) {
  const root = document.documentElement;
  if (page_theme) root.dataset.page = page_theme;
  if (studio_theme) root.dataset.studio = studio_theme;
  syncThemeColor();
}

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  syncThemeColor();
}

function syncThemeColor() {
  const root = document.documentElement;
  const css = (name) => (root.style.getPropertyValue(name) || getComputedStyle(root).getPropertyValue(name)).trim();
  let color = '#0a0918';
  if (root.dataset.theme === 'studio') {
    if (root.dataset.studio === 'brand' && !root.dataset.platform) color = css('--night') || color;
  } else {
    color = (root.dataset.page === 'day' ? css('--day') : css('--night')) || color;
  }
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
