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
export async function renderIcon(size: number, primary: string, logo: Buffer | null, padding: number): Promise<Buffer> {
  if (!logo) return sharp(defaultIconSvg(size, primary)).png().toBuffer();
  const inner = Math.round(size * (1 - padding * 2));
  const mark = await sharp(logo)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: '#ffffff' } })
    .composite([{ input: mark, gravity: 'centre' }])
    .flatten({ background: '#ffffff' })
    .png()
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
