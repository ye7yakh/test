// Ready-made choices that make setup fast: colour palettes and starter menus.

// [id, primary, accent]
export const PALETTES = [
  ['classic', '#1f2a37', '#c8a15a'],
  ['gold', '#131313', '#d4af37'],
  ['copper', '#1d2433', '#e0975c'],
  ['emerald', '#0e3b36', '#d9b45a'],
  ['burgundy', '#4a1525', '#e8b4a0'],
  ['coral', '#16213e', '#ff7a59'],
  ['sage', '#2f3a2f', '#b5c99a'],
  ['rose', '#3b2030', '#f4a6c0'],
  ['lavender', '#2a2540', '#b8a4ff'],
  ['white', '#ffffff', '#1f2a37'],
  ['sand', '#efe6d8', '#8a5a44'],
];

export const SALON_TYPES = [
  { id: 'barber', emoji: '💈' },
  { id: 'ladies', emoji: '💇‍♀️' },
  { id: 'spa', emoji: '💆‍♀️' },
];

// The most-booked services per salon type; prices are the owner's to set.
export const SERVICE_TEMPLATES = {
  barber: [
    { icon: '✂️', ar: 'قص شعر', en: 'Haircut', min: 30 },
    { icon: '🧔', ar: 'حلاقة ذقن', en: 'Beard trim', min: 20 },
    { icon: '💈', ar: 'قص شعر مع ذقن', en: 'Haircut & beard', min: 45 },
    { icon: '👦', ar: 'حلاقة أطفال', en: 'Kids haircut', min: 20 },
    { icon: '🪒', ar: 'حلاقة بالموس', en: 'Hot towel shave', min: 30 },
    { icon: '🎨', ar: 'صبغة شعر', en: 'Hair colour', min: 45, from: true },
    { icon: '🧖', ar: 'تنظيف بشرة', en: 'Facial', min: 30 },
    { icon: '🔥', ar: 'إزالة الشعر بالشمع', en: 'Waxing', min: 15 },
  ],
  ladies: [
    { icon: '💇‍♀️', ar: 'قص شعر', en: 'Haircut', min: 45 },
    { icon: '✨', ar: 'استشوار', en: 'Blow-dry', min: 45 },
    { icon: '🎨', ar: 'صبغة شعر', en: 'Hair colour', min: 120, from: true },
    { icon: '🌿', ar: 'بروتين وكيراتين', en: 'Keratin treatment', min: 180, from: true },
    { icon: '👰', ar: 'تسريحة مناسبات', en: 'Event styling', min: 60, from: true },
    { icon: '💄', ar: 'مكياج', en: 'Makeup', min: 60 },
    { icon: '💅', ar: 'مانيكير', en: 'Manicure', min: 45 },
    { icon: '🦶', ar: 'باديكير', en: 'Pedicure', min: 60 },
  ],
  spa: [
    { icon: '💆', ar: 'مساج استرخاء', en: 'Relaxing massage', min: 60 },
    { icon: '🧖', ar: 'حمام مغربي', en: 'Moroccan bath', min: 60 },
    { icon: '🧴', ar: 'تنظيف بشرة عميق', en: 'Deep facial', min: 60 },
    { icon: '🔥', ar: 'إزالة الشعر بالشمع', en: 'Waxing', min: 30, from: true },
    { icon: '💅', ar: 'مانيكير', en: 'Manicure', min: 45 },
    { icon: '🦶', ar: 'باديكير', en: 'Pedicure', min: 60 },
  ],
};

// Weekly hours presets: week[weekday] = ranges. Friday (5) often opens after prayer.
const every = (ranges, friday = ranges) => [0, 1, 2, 3, 4, 5, 6].map((d) => (d === 5 ? friday : ranges).map((r) => ({ ...r })));
export const HOURS_PRESETS = [
  { id: 'full', week: () => every([{ open: '10:00', close: '22:00' }]) },
  { id: 'split', week: () => every([{ open: '09:00', close: '13:00' }, { open: '16:00', close: '23:00' }], [{ open: '16:00', close: '23:00' }]) },
  { id: 'night', week: () => every([{ open: '14:00', close: '02:00' }]) },
  { id: 'friday', week: () => every([{ open: '10:00', close: '22:00' }], [{ open: '13:30', close: '22:00' }]) },
];
