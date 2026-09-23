// Salon colours at runtime (the first paint already has them from index.html),
// and the switch between the owner's studio and the light public theme.

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Black or white, whichever reads better on the given background. Same rule as the server. */
export function onColor(hex) {
  const L = luminance(hex);
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? '#111111' : '#ffffff';
}

export function applyColors(primary, accent) {
  const root = document.documentElement.style;
  root.setProperty('--primary', primary);
  root.setProperty('--on-primary', onColor(primary));
  root.setProperty('--accent', accent);
  root.setProperty('--on-accent', onColor(accent));
  syncThemeColor();
}

export function setTheme(mode) {
  document.documentElement.dataset.theme = mode;
  syncThemeColor();
}

function syncThemeColor() {
  const studio = document.documentElement.dataset.theme === 'studio';
  const primary = document.documentElement.style.getPropertyValue('--primary') || getComputedStyle(document.documentElement).getPropertyValue('--primary');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', studio ? '#0a0918' : primary.trim());
}

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
