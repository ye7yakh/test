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

export function applyColors(primary, accent) {
  const root = document.documentElement.style;
  root.setProperty('--primary', primary);
  root.setProperty('--on-primary', onColor(primary));
  root.setProperty('--accent', accent);
  root.setProperty('--on-accent', onColor(accent));
  const lift = accentForDark(accent);
  root.setProperty('--night', nightBase(primary));
  root.setProperty('--accent-lift', lift);
  root.setProperty('--on-accent-lift', onColor(lift));
  syncThemeColor();
}

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  syncThemeColor();
}

function syncThemeColor() {
  const studio = document.documentElement.dataset.theme === 'studio';
  const night = document.documentElement.style.getPropertyValue('--night') || getComputedStyle(document.documentElement).getPropertyValue('--night');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', studio ? '#0a0918' : night.trim() || '#0a0918');
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
