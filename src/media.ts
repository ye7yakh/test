// Image intake and the "unified look" for team photos.
//
// Every upload is checked by its bytes (JPEG/PNG/WebP magic numbers, then a real
// decode), auto-rotated, stripped of metadata and re-encoded, so what we store and
// serve is always an image we produced. Team photos are then rendered in the
// salon's chosen style: the same 4:5 crop centred on the person (libvips'
// attention strategy favours skin tones and detail), levels normalised so dark and
// bright shots match, one colour treatment and a soft vignette. The original is
// kept, so changing the style re-renders every photo.
import sharp, { type Metadata } from 'sharp';
import { config } from './config.js';
import { HttpError, readBody, type Ctx } from './http.js';
import { one, query, type Db } from './db.js';
import type { PhotoStyle } from './tenancy.js';

sharp.cache(false);

export type ImageType = 'image/jpeg' | 'image/png' | 'image/webp';

export interface StoredImage {
  bytes: Buffer;
  contentType: ImageType;
  width: number;
  height: number;
}

const INPUT = { limitInputPixels: 40_000_000, failOn: 'error' } as const;

export function sniffImage(buf: Buffer): ImageType | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** Uploads are sent as the raw file body (fetch(url, { body: file })), not multipart. */
export async function readImageUpload(ctx: Ctx): Promise<Buffer> {
  const type = (ctx.req.headers['content-type'] ?? '').split(';')[0]!.trim();
  if (!['image/jpeg', 'image/png', 'image/webp', 'application/octet-stream'].includes(type)) {
    throw new HttpError(415, 'unsupported_image');
  }
  return readBody(ctx.req, config.maxUploadBytes);
}

const FORMAT_OF: Record<ImageType, string> = { 'image/jpeg': 'jpeg', 'image/png': 'png', 'image/webp': 'webp' };

/** Validates an upload and re-encodes it as WebP (max 2000px, EXIF orientation applied, metadata dropped). */
export async function intakeImage(buf: Buffer, minSide = 200): Promise<StoredImage> {
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, 'unsupported_image');
  let meta: Metadata;
  try {
    meta = await sharp(buf, INPUT).metadata();
  } catch {
    throw new HttpError(415, 'unsupported_image');
  }
  if (meta.format !== FORMAT_OF[type] || !meta.width || !meta.height) throw new HttpError(415, 'unsupported_image');
  if (Math.min(meta.width, meta.height) < minSide) throw new HttpError(422, 'image_too_small');
  try {
    const { data, info } = await sharp(buf, INPUT)
      .rotate()
      .resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, contentType: 'image/webp', width: info.width, height: info.height };
  } catch {
    throw new HttpError(415, 'unsupported_image');
  }
}

/**
 * A payment screenshot. Phone screenshots are tall and full of small print, so they
 * keep more height than photos do and are not cropped; still validated and
 * re-encoded like every other upload.
 */
export async function intakeProof(buf: Buffer): Promise<StoredImage> {
  const type = sniffImage(buf);
  if (!type) throw new HttpError(415, 'unsupported_image');
  let meta: Metadata;
  try {
    meta = await sharp(buf, INPUT).metadata();
  } catch {
    throw new HttpError(415, 'unsupported_image');
  }
  if (meta.format !== FORMAT_OF[type] || !meta.width || !meta.height) throw new HttpError(415, 'unsupported_image');
  if (Math.min(meta.width, meta.height) < 200) throw new HttpError(422, 'image_too_small');
  try {
    const { data, info } = await sharp(buf, INPUT)
      .rotate()
      .resize({ width: 1400, height: 3000, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
    return { bytes: data, contentType: 'image/webp', width: info.width, height: info.height };
  } catch {
    throw new HttpError(415, 'unsupported_image');
  }
}

// ---------------------------------------------------------------- team portraits

export const PORTRAIT = { width: 800, height: 1000 };
export const PHOTO_STYLES: readonly PhotoStyle[] = ['natural', 'warm', 'mono', 'brand'];

function hexToRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** The accent colour pulled halfway to grey, so the brand tint reads as a duotone rather than a filter. */
function softTint(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const y = 0.299 * r + 0.587 * g + 0.114 * b;
  const mix = (c: number) => Math.round(c * 0.55 + y * 0.45);
  return { r: mix(r), g: mix(g), b: mix(b) };
}

const VIGNETTE = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${PORTRAIT.width}" height="${PORTRAIT.height}">
    <defs><radialGradient id="v" cx="50%" cy="42%" r="78%">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.35"/>
    </radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#v)"/>
  </svg>`,
);

export async function renderPortrait(original: Buffer, style: PhotoStyle, accent: string): Promise<StoredImage> {
  // libvips runs one pipeline's operations in a fixed order, so steps whose order
  // matters (grey before tint, grading before the vignette) are separate passes.
  let img = sharp(original, INPUT)
    .resize(PORTRAIT.width, PORTRAIT.height, { fit: 'cover', position: sharp.strategy.attention })
    .normalise({ lower: 1, upper: 99 });
  if (style === 'natural') img = img.modulate({ saturation: 1.05 });
  if (style === 'warm') {
    img = img
      .recomb([
        [1.06, 0.03, 0],
        [0, 1.0, 0.01],
        [0, 0.02, 0.88],
      ])
      .modulate({ saturation: 1.08, brightness: 1.02 });
  }
  if (style === 'mono' || style === 'brand') img = img.grayscale().linear(1.08, -8);
  let graded = await img.toColourspace('srgb').png().toBuffer();

  if (style === 'brand') graded = await sharp(graded).tint(softTint(accent)).png().toBuffer();

  const { data, info } = await sharp(graded)
    .composite([{ input: VIGNETTE }])
    .webp({ quality: 84 })
    .toBuffer({ resolveWithObject: true });
  return { bytes: data, contentType: 'image/webp', width: info.width, height: info.height };
}

// ---------------------------------------------------------------- app icons

// Default icon: a pair of scissors on the salon colour. Paths only, no fonts needed.
function defaultIconSvg(size: number, bg: string): Buffer {
  const { r, g, b } = hexToRgb(bg);
  const fg = 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#111111' : '#ffffff';
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
      <rect width="512" height="512" fill="${bg}"/>
      <g fill="none" stroke="${fg}" stroke-width="24" stroke-linecap="round">
        <circle cx="190" cy="340" r="48"/><circle cx="322" cy="340" r="48"/>
        <path d="M222 304 L338 150"/><path d="M290 304 L174 150"/>
      </g>
    </svg>`,
  );
}

/**
 * PNG app icon. `padding` is the share of the canvas kept clear around a logo:
 * maskable icons need a larger safe zone because launchers crop them.
 */
/**
 * The app icon. A dedicated icon fills the square; a logo sits inside it on the
 * chosen background with room around it (more for maskable icons, which launchers
 * crop to circles and squircles). With neither, the scissors mark on the background.
 */
export async function renderIcon(size: number, opts: { bg: string; art: Buffer | null; fill: boolean; padding: number }): Promise<Buffer> {
  const { bg, art, fill, padding } = opts;
  if (!art) return sharp(defaultIconSvg(size, bg)).png().toBuffer();
  if (fill) {
    // Full bleed, except the maskable size keeps a margin for round masks.
    const inner = Math.round(size * (padding >= 0.2 ? 0.76 : 1));
    const mark = await sharp(art).resize(inner, inner, { fit: 'cover', position: sharp.strategy.attention }).png().toBuffer();
    return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
      .composite([{ input: mark, gravity: 'centre' }])
      .flatten({ background: bg })
      .png()
      .toBuffer();
  }
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(art)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg } })
    .composite([{ input: mark, gravity: 'centre' }])
    .flatten({ background: bg })
    .png()
    .toBuffer();
}

/**
 * The owner's app wears a small dashboard badge, so the two apps on a phone are
 * told apart at a glance. Placed inside the area every launcher mask keeps.
 */
export async function addOwnerBadge(icon: Buffer, size: number, maskable: boolean): Promise<Buffer> {
  const d = Math.round(size * (maskable ? 0.27 : 0.36));
  const centre = size * (maskable ? 0.665 : 0.735);
  const ring = Math.max(2, Math.round(d * 0.07));
  const badge = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${d}" height="${d}" viewBox="0 0 100 100">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset=".55" stop-color="#6366f1"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
      <circle cx="50" cy="50" r="${50 - (ring / d) * 50}" fill="url(#g)" stroke="#ffffff" stroke-width="${(ring / d) * 100}"/>
      <g stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none">
        <path d="M33 30v40M50 30v40M67 30v40"/>
      </g>
      <g fill="#ffffff"><circle cx="33" cy="58" r="8"/><circle cx="50" cy="40" r="8"/><circle cx="67" cy="54" r="8"/></g>
    </svg>`,
  );
  const left = Math.round(centre - d / 2);
  return sharp(icon).composite([{ input: badge, left, top: left }]).png().toBuffer();
}

/**
 * The platform's own mark: the studio's violet-to-blue with the sparkles glyph the
 * dashboard wears. Paths only, no fonts needed.
 */
export function platformMarkSvg(size: number, padding = 0): Buffer {
  const scale = (1 - padding * 2) * (512 / 24) * 0.56;
  const offset = (512 - 24 * scale) / 2;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a855f7"/><stop offset=".52" stop-color="#6366f1"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs>
      <rect width="512" height="512" fill="url(#g)"/>
      <g transform="translate(${offset} ${offset}) scale(${scale})" stroke="#ffffff" stroke-width="1.7" stroke-linejoin="round">
        <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" fill="none"/>
        <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8zM5 2.5l.6 1.6 1.6.6-1.6.6L5 6.9l-.6-1.6-1.6-.6 1.6-.6z" fill="#ffffff" stroke-width="1"/>
      </g>
    </svg>`,
  );
}

export const renderPlatformIcon = (size: number, padding = 0) => sharp(platformMarkSvg(size, padding)).png().toBuffer();

const roundedMask = (side: number) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${side}" height="${side}"><rect width="${side}" height="${side}" rx="${Math.round(side * 0.225)}" ry="${Math.round(side * 0.225)}"/></svg>`);

export const SHARE_SIZE = { width: 1200, height: 630 };

/**
 * The picture a shared link shows (WhatsApp, Instagram, Facebook). A salon with a
 * cover photo shows that photo; otherwise its icon, rounded, on its page colour lit
 * by two soft glows. The icon sits dead centre, so square crops still show it.
 */
export async function renderShareCard(opts: { bg: string; glows: [string, string]; icon: Buffer; cover: Buffer | null }): Promise<Buffer> {
  const { width, height } = SHARE_SIZE;
  if (opts.cover) {
    return sharp(opts.cover)
      .resize(width, height, { fit: 'cover', position: sharp.strategy.attention })
      .flatten({ background: opts.bg })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer();
  }
  const [a, b] = opts.glows;
  const backdrop = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
      <defs>
        <radialGradient id="a" cx="80%" cy="0%" r="75%"><stop offset="0" stop-color="${a}" stop-opacity=".5"/><stop offset="1" stop-color="${a}" stop-opacity="0"/></radialGradient>
        <radialGradient id="b" cx="10%" cy="100%" r="65%"><stop offset="0" stop-color="${b}" stop-opacity=".38"/><stop offset="1" stop-color="${b}" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="${opts.bg}"/>
      <rect width="100%" height="100%" fill="url(#a)"/>
      <rect width="100%" height="100%" fill="url(#b)"/>
    </svg>`,
  );
  const side = 300;
  const mark = await sharp(opts.icon).resize(side, side).composite([{ input: roundedMask(side), blend: 'dest-in' }]).png().toBuffer();
  return sharp(backdrop)
    .composite([{ input: mark, left: (width - side) / 2, top: (height - side) / 2 }])
    .flatten({ background: opts.bg })
    .jpeg({ quality: 88, mozjpeg: true })
    .toBuffer();
}

/** A launch screen: the app's background with its icon, rounded, a little above centre. */
export async function renderSplash(width: number, height: number, bg: string, icon: Buffer): Promise<Buffer> {
  const side = Math.round(Math.min(width, height) * 0.27);
  const mark = await sharp(icon).resize(side, side).composite([{ input: roundedMask(side), blend: 'dest-in' }]).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: bg } })
    .composite([{ input: mark, left: Math.round((width - side) / 2), top: Math.round(height * 0.44 - side / 2) }])
    .flatten({ background: bg })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

// ---------------------------------------------------------------- storage

export async function saveMedia(db: Db, salonId: number, img: StoredImage): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into media (salon_id, content_type, width, height, bytes) values ($1, $2, $3, $4, $5) returning id`,
    [salonId, img.contentType, img.width, img.height, img.bytes],
    db,
  );
  return row!.id;
}

export async function loadMediaBytes(db: Db, salonId: number, id: string): Promise<Buffer | null> {
  const row = await one<{ bytes: Buffer }>('select bytes from media where salon_id = $1 and id = $2', [salonId, id], db);
  return row?.bytes ?? null;
}

export async function deleteMedia(db: Db, salonId: number, ids: (string | null | undefined)[]): Promise<void> {
  const list = ids.filter((id): id is string => !!id);
  if (list.length) await query('delete from media where salon_id = $1 and id = any($2::uuid[])', [salonId, list], db);
}

export const mediaUrl = (id: string | null) => (id ? `/media/${id}` : null);
