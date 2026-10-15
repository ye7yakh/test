// The AI mirror: a customer takes a photo, picks a haircut (and a colour) from the
// catalogue, and an AI image model redraws only the hair, so they can see the cut on
// themselves before they book. Photos and results are never stored: they pass through
// memory to the image provider and straight back to the customer's phone.
import sharp from 'sharp';
import { config } from './config.js';
import { HttpError, readBody, type Ctx } from './http.js';
import { sniffImage } from './media.js';
import type { Salon } from './tenancy.js';

export type Audience = 'men' | 'women';
export type TryonSetting = 'off' | 'men' | 'women' | 'all';

interface Style {
  id: string;
  audience: Audience;
  name_ar: string;
  name_en: string;
  /** What the model is asked to draw. */
  prompt: string;
}

interface Shade {
  id: string;
  name_ar: string;
  name_en: string;
  hex: string;
  prompt: string;
  /** Offered to men too (the rest are for women's styles only). */
  men: boolean;
}

export const STYLES: readonly Style[] = [
  { id: 'skin_fade', audience: 'men', name_ar: 'سكن فيد', name_en: 'Skin fade', prompt: 'a modern skin fade: the sides and back fade cleanly down to the skin, with short textured hair on top' },
  { id: 'low_taper', audience: 'men', name_ar: 'تيبر منخفض', name_en: 'Low taper', prompt: 'a low taper fade at the temples and the neckline, with medium-length hair on top combed neatly back' },
  { id: 'buzz', audience: 'men', name_ar: 'بز كت', name_en: 'Buzz cut', prompt: 'an even buzz cut, about 6 mm long all over the head' },
  { id: 'crop', audience: 'men', name_ar: 'كروب', name_en: 'Textured crop', prompt: 'a textured French crop: a short straight fringe, messy texture on top and faded sides' },
  { id: 'pompadour', audience: 'men', name_ar: 'بومبادور', name_en: 'Pompadour', prompt: 'a pompadour: volume swept up and back from the forehead, with short faded sides' },
  { id: 'side_part', audience: 'men', name_ar: 'فرق جانبي', name_en: 'Side part', prompt: 'a classic gentleman side part, neatly combed with a soft taper on the sides' },
  { id: 'undercut', audience: 'men', name_ar: 'أندركت', name_en: 'Undercut', prompt: 'an undercut: the sides cut very short, the longer hair on top slicked back' },
  { id: 'curls_fade', audience: 'men', name_ar: 'كيرلي مع فيد', name_en: 'Curls and fade', prompt: 'natural defined curls on top with a mid fade on the sides and back' },
  { id: 'long_layers', audience: 'women', name_ar: 'طبقات طويلة', name_en: 'Long layers', prompt: 'long hair with soft face-framing layers and a smooth, bouncy blow-dry' },
  { id: 'bob', audience: 'women', name_ar: 'بوب', name_en: 'Classic bob', prompt: 'a chin-length classic bob with a sleek, polished finish' },
  { id: 'lob', audience: 'women', name_ar: 'لوب', name_en: 'Long bob', prompt: 'a shoulder-length long bob with soft, loose waves' },
  { id: 'curtain_bangs', audience: 'women', name_ar: 'غرّة ستارة', name_en: 'Curtain bangs', prompt: 'curtain bangs parted in the middle, framing the face, with long layered hair' },
  { id: 'pixie', audience: 'women', name_ar: 'بيكسي', name_en: 'Pixie', prompt: 'a short, textured pixie cut with soft pieces around the face' },
  { id: 'waves', audience: 'women', name_ar: 'تمويج ناعم', name_en: 'Soft waves', prompt: 'long hair styled in soft, glossy Hollywood waves' },
  { id: 'sleek', audience: 'women', name_ar: 'سترايت لامع', name_en: 'Sleek straight', prompt: 'long, sleek, straight hair with a glossy finish' },
  { id: 'shag', audience: 'women', name_ar: 'شاغ', name_en: 'Shag', prompt: 'a modern layered shag with textured ends and wispy bangs' },
];

export const SHADES: readonly Shade[] = [
  { id: 'black', name_ar: 'أسود', name_en: 'Jet black', hex: '#15110f', prompt: 'deep jet black', men: true },
  { id: 'brown', name_ar: 'بني غامق', name_en: 'Dark brown', hex: '#3b2418', prompt: 'rich dark chocolate brown', men: true },
  { id: 'honey', name_ar: 'بالياج عسلي', name_en: 'Honey balayage', hex: '#b9803f', prompt: 'a warm honey caramel balayage, darker at the roots', men: false },
  { id: 'ash', name_ar: 'أشقر رمادي', name_en: 'Ash blonde', hex: '#c8bba3', prompt: 'a cool ash blonde', men: false },
  { id: 'copper', name_ar: 'نحاسي', name_en: 'Copper', hex: '#a24a22', prompt: 'a vivid copper red', men: false },
  { id: 'burgundy', name_ar: 'عنابي', name_en: 'Burgundy', hex: '#5e1a2a', prompt: 'a deep burgundy wine red', men: false },
  { id: 'silver', name_ar: 'فضي', name_en: 'Silver', hex: '#b9bcc2', prompt: 'a modern silver grey', men: true },
];

const styleById = new Map(STYLES.map((s) => [s.id, s]));
const shadeById = new Map(SHADES.map((s) => [s.id, s]));

// ---------------------------------------------------------------- availability

type Provider = 'gemini' | 'openai' | 'mock';

/** The image model in use, or null when the AI mirror is off for the whole platform. */
export function tryonProvider(): Provider | null {
  const p = config.tryon.provider;
  if (p === 'mock') return 'mock';
  if ((p === 'gemini' || p === 'openai') && config.tryon.apiKey) return p;
  return null;
}

/** Which styles a salon offers in its mirror, or null when customers do not see it. */
export function salonTryon(s: Pick<Salon, 'tryon'>): Exclude<TryonSetting, 'off'> | null {
  return s.tryon !== 'off' && tryonProvider() ? s.tryon : null;
}

const offered = (setting: Exclude<TryonSetting, 'off'>, s: Style) => setting === 'all' || s.audience === setting;

/** The catalogue as customers of this salon see it. */
export function catalogue(setting: Exclude<TryonSetting, 'off'>) {
  return {
    audience: setting,
    styles: STYLES.filter((s) => offered(setting, s)).map(({ id, audience, name_ar, name_en }) => ({ id, audience, name_ar, name_en })),
    shades: SHADES.map(({ id, name_ar, name_en, hex, men }) => ({ id, name_ar, name_en, hex, men })),
  };
}

/** A look ("bob" or "bob:honey") checked against the catalogue; null if not given. */
export function parseLook(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'invalid', 'look');
  const [styleId, shadeId, extra] = value.split(':');
  const style = styleById.get(styleId ?? '');
  const shade = shadeId === undefined ? null : shadeById.get(shadeId);
  if (!style || shade === undefined || extra !== undefined || (shade && !shade.men && style.audience === 'men')) {
    throw new HttpError(400, 'invalid', 'look');
  }
  return shade ? `${style.id}:${shade.id}` : style.id;
}

/** A stored look in words, for the owner's schedule and the customer's ticket. */
export function describeLook(look: string | null) {
  if (!look) return null;
  const [styleId, shadeId] = look.split(':');
  const style = styleById.get(styleId ?? '');
  if (!style) return null;
  const shade = shadeId ? shadeById.get(shadeId) : null;
  return {
    id: look,
    style: style.id,
    name_ar: style.name_ar,
    name_en: style.name_en,
    shade: shade ? { id: shade.id, name_ar: shade.name_ar, name_en: shade.name_en, hex: shade.hex } : null,
  };
}

// ---------------------------------------------------------------- limits

// Every picture costs the platform a few cents, so tries are capped per address, per
// salon and for the whole platform each day. Counters live in this process.
const RECENT_MS = 10 * 60_000;
const perAddress = new Map<string, number[]>();
const perDay = new Map<string, number>();
let inFlight = 0;
const MAX_IN_FLIGHT = 6;

setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of perAddress) if (!list.some((t) => now - t < 24 * 3600_000)) perAddress.delete(ip);
  const today = new Date().toISOString().slice(0, 10);
  for (const key of perDay.keys()) if (!key.endsWith(today)) perDay.delete(key);
}, 10 * 60_000).unref();

function countTry(ip: string, salonId: number): void {
  const now = Date.now();
  const list = (perAddress.get(ip) ?? []).filter((t) => now - t < 24 * 3600_000);
  if (list.filter((t) => now - t < RECENT_MS).length >= config.tryon.perAddress10m || list.length >= config.tryon.perAddressDaily) {
    throw new HttpError(429, 'too_many_attempts');
  }
  const today = new Date().toISOString().slice(0, 10);
  const salonKey = `salon:${salonId}:${today}`;
  const allKey = `all:${today}`;
  if ((perDay.get(salonKey) ?? 0) >= config.tryon.salonDaily || (perDay.get(allKey) ?? 0) >= config.tryon.platformDaily) {
    throw new HttpError(429, 'tryon_daily_limit');
  }
  list.push(now);
  perAddress.set(ip, list);
  perDay.set(salonKey, (perDay.get(salonKey) ?? 0) + 1);
  perDay.set(allKey, (perDay.get(allKey) ?? 0) + 1);
}

// ---------------------------------------------------------------- the picture

const INPUT = { limitInputPixels: 50_000_000, failOn: 'error' as const };

/** The customer's photo, upright, at most 1024px, re-encoded with no metadata (no location, no camera). */
async function intakePhoto(buf: Buffer): Promise<Buffer> {
  if (!sniffImage(buf)) throw new HttpError(415, 'unsupported_image');
  try {
    const meta = await sharp(buf, INPUT).metadata();
    if (!meta.width || !meta.height) throw new Error('no size');
    if (Math.min(meta.width, meta.height) < 256) throw new HttpError(422, 'image_too_small');
    return await sharp(buf, INPUT).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(415, 'unsupported_image');
  }
}

function promptFor(style: Style, shade: Shade | null): string {
  return [
    `Edit this photo of a person. Change ONLY their hairstyle to ${style.prompt}.`,
    shade ? `Colour the hair ${shade.prompt}.` : 'Keep their natural hair colour.',
    'Keep everything else exactly as it is: the face and its features, the identity, expression, skin tone, any beard or moustache, glasses, clothing, background, lighting, camera angle and framing.',
    'Make it photorealistic, with a natural hairline and real hair texture, like a professional salon result. Do not add text, logos or other people.',
  ].join(' ');
}

async function viaGemini(photo: Buffer, prompt: string, signal: AbortSignal): Promise<Buffer> {
  const model = config.tryon.model || 'gemini-2.5-flash-image';
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.tryon.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: photo.toString('base64') } }, { text: prompt }] }],
      generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
    }),
    signal,
  });
  if (!res.ok) throw providerError(res.status, await res.text().catch(() => ''));
  const json = (await res.json()) as { candidates?: { content?: { parts?: Record<string, any>[] } }[] };
  const part = json.candidates?.[0]?.content?.parts?.find((p) => (p.inlineData ?? p.inline_data)?.data);
  // No picture back: the model declined (its safety rules) or could not find a person.
  if (!part) throw new HttpError(422, 'tryon_refused');
  return Buffer.from((part.inlineData ?? part.inline_data).data, 'base64');
}

async function viaOpenAI(photo: Buffer, prompt: string, signal: AbortSignal): Promise<Buffer> {
  const form = new FormData();
  form.set('model', config.tryon.model || 'gpt-image-2');
  form.set('image', new Blob([new Uint8Array(photo)], { type: 'image/jpeg' }), 'photo.jpg');
  form.set('prompt', prompt);
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.tryon.apiKey}` },
    body: form,
    signal,
  });
  if (!res.ok) throw providerError(res.status, await res.text().catch(() => ''));
  const json = (await res.json()) as { data?: { b64_json?: string }[] };
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new HttpError(422, 'tryon_refused');
  return Buffer.from(b64, 'base64');
}

/**
 * A stand-in for development and the automated checks: the photo comes back with its
 * top lit in the colour (or the style's own tint), after a pause like a real model's.
 */
async function viaMock(photo: Buffer, style: Style, shade: Shade | null): Promise<Buffer> {
  const { width = 1024, height = 1024 } = await sharp(photo).metadata();
  const tint = shade?.hex ?? (style.audience === 'men' ? '#2b1d14' : '#7a4a2a');
  const hair = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}" stop-opacity=".78"/><stop offset=".42" stop-color="${tint}" stop-opacity=".5"/><stop offset=".6" stop-color="${tint}" stop-opacity="0"/></linearGradient></defs>
    <ellipse cx="${width / 2}" cy="${height * 0.2}" rx="${width * 0.36}" ry="${height * 0.28}" fill="url(#g)"/>
  </svg>`);
  await new Promise((r) => setTimeout(r, config.isProd ? 0 : 900));
  return sharp(photo).composite([{ input: hair, blend: 'multiply' }]).jpeg({ quality: 88 }).toBuffer();
}

function providerError(status: number, body: string): HttpError {
  // Never pass the provider's message on: it can echo request details. Log a short slice.
  console.error(`tryon provider ${status}: ${body.slice(0, 300)}`);
  if (status === 429 || status === 503) return new HttpError(503, 'tryon_busy');
  if (status === 400) return new HttpError(422, 'tryon_refused');
  return new HttpError(502, 'tryon_failed');
}

/** The customer's photo with the chosen cut, as a JPEG. Nothing is kept. */
export async function tryOn(ctx: Ctx, salon: Salon): Promise<Buffer> {
  const setting = salonTryon(salon);
  const provider = tryonProvider();
  if (!setting || !provider) throw new HttpError(404, 'not_found');
  const style = styleById.get(ctx.url.searchParams.get('style') ?? '');
  if (!style || !offered(setting, style)) throw new HttpError(400, 'invalid', 'style');
  const shadeParam = ctx.url.searchParams.get('shade');
  const shade = shadeParam ? shadeById.get(shadeParam) : null;
  if (shade === undefined || (shade && !shade.men && style.audience === 'men')) throw new HttpError(400, 'invalid', 'shade');

  const type = (ctx.req.headers['content-type'] ?? '').split(';')[0]!.trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new HttpError(415, 'unsupported_image');
  const photo = await intakePhoto(await readBody(ctx.req, config.maxUploadBytes));
  // A busy mirror turns the try away before it is counted.
  if (inFlight >= MAX_IN_FLIGHT) throw new HttpError(503, 'tryon_busy');
  countTry(ctx.ip, salon.id);

  inFlight++;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90_000);
  try {
    const prompt = promptFor(style, shade);
    const raw =
      provider === 'gemini' ? await viaGemini(photo, prompt, abort.signal)
      : provider === 'openai' ? await viaOpenAI(photo, prompt, abort.signal)
      : await viaMock(photo, style, shade);
    // Re-encoded here too: what reaches the phone is always a plain, metadata-free JPEG.
    return await sharp(raw, INPUT).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as Error).name === 'AbortError') throw new HttpError(504, 'tryon_failed');
    console.error('tryon', err);
    throw new HttpError(502, 'tryon_failed');
  } finally {
    clearTimeout(timer);
    inFlight--;
  }
}
