// The salon's brand kit as the two installable apps use it: the customers' app on
// the salon's link and the owner's app on /admin. Icons, launch screens, the picture
// a shared link shows and the colours around them all come from the salon's settings.
import { dayBase, nightBase, onColor } from './colors.js';
import type { Salon } from './tenancy.js';

export const STUDIO_BG = '#0a0918';

/** What sits behind the logo on the app icon. */
export function iconBackground(s: Salon): string {
  const art = !!(s.icon_media_id || s.logo_media_id);
  switch (s.icon_bg) {
    case 'white':
      return '#ffffff';
    case 'primary':
      return s.color_primary;
    case 'night':
      return nightBase(s.color_primary);
    default:
      return art ? '#ffffff' : s.color_primary;
  }
}

/** Changes whenever the icon would look different, so cached copies are replaced. */
export const iconVersion = (s: Salon) => `${s.icon_media_id ?? s.logo_media_id ?? 'mark'}-${s.icon_bg}-${s.color_primary.slice(1)}`;

/** The customers' page background (night or day). */
export const pageColor = (s: Salon) => (s.page_theme === 'day' ? dayBase(s.color_primary) : nightBase(s.color_primary));

/**
 * What the customers' app opens on: its hero. At night that is the page itself; by
 * day the light page rises over a hero in the salon's main colour (or its cover
 * photo), so the bars and the launch screen take the main colour.
 */
export const heroColor = (s: Salon) => (s.page_theme === 'day' ? s.color_primary : nightBase(s.color_primary));

/**
 * A dark top that is always under the iPhone status bar, so its white text stays
 * readable once the page scrolls: the night, or a dark main colour by day (the page
 * keeps a band of it under the bar, see app.css). Never a cover photo: by day the
 * light bar and pages slide under the status bar once the customer scrolls.
 */
export const heroIsDark = (s: Salon) => s.page_theme !== 'day' || onColor(s.color_primary) === '#ffffff';

/** The owner's dashboard background: the platform's studio, or the salon's night. */
export const studioColor = (s: Salon) => (s.studio_theme === 'brand' ? nightBase(s.color_primary) : STUDIO_BG);

/** Changes whenever the shared-link picture would: the cover, or the icon on its page colour. */
export const shareVersion = (s: Salon) => `${s.cover_media_id ?? iconVersion(s)}-${pageColor(s).slice(1)}-${s.color_accent.slice(1)}`;

/** Changes whenever a launch screen would: the icon, or the colour the app opens on. */
export const splashVersion = (s: Salon, owner: boolean) => `${iconVersion(s)}-${(owner ? studioColor(s) : heroColor(s)).slice(1)}`;

// iPhone and iPad screens (points, pixel ratio). iOS shows the matching launch image
// while an installed web app opens; without one it shows a blank screen.
const SCREENS: [number, number, number][] = [
  [440, 956, 3], [430, 932, 3], [402, 874, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3],
  [375, 812, 3], [414, 896, 3], [414, 896, 2], [414, 736, 3], [375, 667, 2], [320, 568, 2],
  [1024, 1366, 2], [834, 1194, 2], [820, 1180, 2], [834, 1112, 2], [810, 1080, 2], [768, 1024, 2], [744, 1133, 2],
];

export const SPLASH_SIZES = new Set(SCREENS.map(([w, h, r]) => `${w * r}x${h * r}`));

export function startupImageLinks(s: Salon, owner: boolean): string {
  const v = splashVersion(s, owner);
  const prefix = owner ? 'owner-' : '';
  return SCREENS.map(([w, h, r]) => `<link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="/splash/${prefix}${w * r}x${h * r}.png?v=${v}">`).join('\n');
}
