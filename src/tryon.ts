// The AI mirror: a customer takes a photo, an AI model reads his hair (how long it is,
// its texture and thickness, the hairline, the face shape), and the mirror offers only
// the men's cuts that hair can give, best suited first. He picks one (and a colour) and
// an AI image model redraws only the hair, so he sees the cut before he books. Photos
// and results are never stored: they pass through memory to the provider and straight
// back to the customer's phone.
import sharp from 'sharp';
import { config } from './config.js';
import { HttpError, readBody, type Ctx } from './http.js';
import { sniffImage } from './media.js';
import type { Salon } from './tenancy.js';

/** The hair on top of the head, shortest first: a cut can only take it shorter. */
export const LENGTHS = ['bald', 'buzz', 'short', 'medium', 'long', 'very_long'] as const;
export const TEXTURES = ['straight', 'wavy', 'curly', 'coily'] as const;
export const DENSITIES = ['thick', 'normal', 'thin'] as const;
export const HAIRLINES = ['full', 'receding'] as const;
export const FACES = ['oval', 'round', 'square', 'long', 'heart', 'diamond'] as const;
/** The beard he has now, shortest first: like hair, it can only be trimmed shorter. */
export const BEARD_LENGTHS = ['none', 'stubble', 'short', 'full'] as const;
/** Whether it grows evenly over the cheeks and jaw, or in patches. */
export const COVERAGES = ['even', 'patchy'] as const;
type Length = (typeof LENGTHS)[number];
type BeardLength = (typeof BEARD_LENGTHS)[number];
type Texture = (typeof TEXTURES)[number];
type Face = (typeof FACES)[number];

/** What the AI saw in the customer's photo. */
export interface Hair {
  length: Length;
  texture: Texture;
  density: (typeof DENSITIES)[number];
  hairline: (typeof HAIRLINES)[number];
  face: Face;
  beard: BeardLength;
  coverage: (typeof COVERAGES)[number];
}

interface Style {
  id: string;
  name_ar: string;
  name_en: string;
  /** What the image model is asked to draw. */
  prompt: string;
  /** The least hair on top this cut can be cut from. */
  needs: Length;
  /** Only for these textures (any when absent). */
  textures?: readonly Texture[];
  /** Built on volume on top: last for thin hair or a receding hairline. */
  volume?: boolean;
  /** The face shapes it flatters. */
  faces: readonly Face[];
}

interface Beard {
  id: string;
  name_ar: string;
  name_en: string;
  /** What the image model is asked to draw. */
  prompt: string;
  /** The least beard it can be trimmed from. */
  needs: BeardLength;
  /** Needs a beard that grows evenly (a patchy one cannot hold its shape). */
  even?: boolean;
  /** The face shapes it flatters. */
  faces: readonly Face[];
}

interface Shade {
  id: string;
  name_ar: string;
  name_en: string;
  hex: string;
  prompt: string;
}

// Men's cuts, from the shortest hair they need to the longest. Lengths are of the hair
// on top: short 1-5 cm, medium 5-10, long 10-15, very long over 15.
const NOT_COILY = ['straight', 'wavy', 'curly'] as const;
export const STYLES: readonly Style[] = [
  { id: 'shaved', name_ar: 'حلاقة على الصفر', name_en: 'Clean shave', needs: 'bald', faces: ['oval', 'square', 'diamond'],
    prompt: 'a clean, smoothly shaved head with no hair on top or at the sides (keep any beard as it is)' },
  { id: 'buzz', name_ar: 'بز كت', name_en: 'Buzz cut', needs: 'buzz', faces: ['oval', 'square', 'diamond'],
    prompt: 'an even buzz cut, about 6 mm long all over the head' },
  { id: 'crew_cut', name_ar: 'كرو كت', name_en: 'Crew cut', needs: 'short', faces: ['oval', 'square', 'diamond', 'heart'],
    prompt: 'a classic crew cut: short tapered sides and back, slightly longer hair on top brushed forward and up at the front' },
  { id: 'skin_fade', name_ar: 'سكن فيد', name_en: 'Skin fade', needs: 'short', faces: ['oval', 'round', 'square', 'diamond'],
    prompt: 'a modern skin fade: the sides and back fade cleanly down to the skin, with short textured hair on top' },
  { id: 'low_taper', name_ar: 'تيبر منخفض', name_en: 'Low taper', needs: 'short', faces: ['oval', 'long', 'heart', 'square'],
    prompt: 'a low taper fade at the temples and the neckline, with the natural hair on top kept short and neatly styled' },
  { id: 'crop', name_ar: 'كروب', name_en: 'Textured crop', needs: 'short', textures: NOT_COILY, faces: ['oval', 'long', 'square', 'heart', 'diamond'],
    prompt: 'a textured French crop: a short straight fringe, messy texture on top and faded sides' },
  { id: 'curls_fade', name_ar: 'كيرلي مع فيد', name_en: 'Curls and fade', needs: 'short', textures: ['curly', 'coily'], faces: ['oval', 'round', 'square', 'long', 'heart', 'diamond'],
    prompt: 'natural defined curls on top with a mid fade on the sides and back' },
  { id: 'side_part', name_ar: 'فرق جانبي', name_en: 'Side part', needs: 'medium', faces: ['oval', 'round', 'square', 'heart', 'diamond'],
    prompt: 'a classic gentleman side part, neatly combed with a soft taper on the sides' },
  { id: 'quiff', name_ar: 'كويف', name_en: 'Textured quiff', needs: 'medium', textures: NOT_COILY, volume: true, faces: ['round', 'oval', 'square', 'diamond'],
    prompt: 'a textured quiff: the front swept up and slightly back with natural movement, short tapered sides' },
  { id: 'pompadour', name_ar: 'بومبادور', name_en: 'Pompadour', needs: 'long', textures: NOT_COILY, volume: true, faces: ['round', 'oval', 'square'],
    prompt: 'a pompadour: volume swept up and back from the forehead, with short faded sides' },
  { id: 'undercut', name_ar: 'أندركت', name_en: 'Undercut', needs: 'long', textures: NOT_COILY, volume: true, faces: ['oval', 'round', 'heart', 'diamond'],
    prompt: 'an undercut: the sides cut very short, the longer hair on top slicked back' },
  { id: 'slick_back', name_ar: 'سليك باك', name_en: 'Slick back', needs: 'long', textures: ['straight', 'wavy'], volume: true, faces: ['oval', 'square', 'diamond', 'heart'],
    prompt: 'a long slicked-back style: the hair on top combed straight back with a soft shine, the sides tapered' },
  { id: 'flow', name_ar: 'فلو طويل', name_en: 'Long flow', needs: 'very_long', textures: NOT_COILY, faces: ['oval', 'long', 'heart', 'square'],
    prompt: 'a medium-long men\'s flow: the hair pushed back from the face and falling naturally to just above the collar' },
];

// Beards, from none to the fullest. Lengths: stubble under 3 mm, short 3 mm to 2 cm,
// full over 2 cm.
export const BEARDS: readonly Beard[] = [
  { id: 'clean', name_ar: 'بدون ذقن', name_en: 'Clean shaven', needs: 'none', faces: ['oval', 'square', 'diamond', 'heart'],
    prompt: 'completely clean-shaven, no beard and no moustache, smooth freshly shaved skin' },
  { id: 'stubble', name_ar: 'ذقن خفيفة', name_en: 'Stubble', needs: 'stubble', faces: ['oval', 'round', 'square', 'long', 'heart', 'diamond'],
    prompt: 'an even light designer stubble about 2 mm long over the jaw, chin and upper lip' },
  { id: 'short_beard', name_ar: 'لحية قصيرة', name_en: 'Short beard', needs: 'short', faces: ['oval', 'round', 'square', 'long', 'diamond'],
    prompt: 'a short, neatly trimmed full beard about 5 mm long with a clean neckline and cheek line' },
  { id: 'boxed', name_ar: 'لحية مربّعة', name_en: 'Boxed beard', needs: 'short', even: true, faces: ['round', 'oval', 'heart', 'diamond'],
    prompt: 'a boxed beard about 1.5 cm long, sharply lined up on the cheeks and the neck, with a matching trimmed moustache' },
  { id: 'goatee', name_ar: 'سكسوكة', name_en: 'Goatee', needs: 'short', faces: ['round', 'square', 'oval'],
    prompt: 'a neat goatee: a short trimmed beard on the chin connected to the moustache, the cheeks and jaw sides shaved clean' },
  { id: 'moustache', name_ar: 'شنب فقط', name_en: 'Moustache', needs: 'short', faces: ['oval', 'long', 'heart'],
    prompt: 'a full, neatly trimmed moustache, with the cheeks, jaw and chin shaved clean' },
  { id: 'full_beard', name_ar: 'لحية كاملة', name_en: 'Full beard', needs: 'full', even: true, faces: ['oval', 'square', 'heart', 'diamond', 'round'],
    prompt: 'a full, thick, groomed beard about 4 cm long with a full moustache, neatly shaped at the cheeks and neck' },
];

export const SHADES: readonly Shade[] = [
  { id: 'black', name_ar: 'أسود', name_en: 'Jet black', hex: '#15110f', prompt: 'deep jet black' },
  { id: 'brown', name_ar: 'بني غامق', name_en: 'Dark brown', hex: '#3b2418', prompt: 'rich dark chocolate brown' },
  { id: 'silver', name_ar: 'فضي', name_en: 'Silver', hex: '#b9bcc2', prompt: 'a modern silver grey' },
  { id: 'platinum', name_ar: 'أشقر بلاتيني', name_en: 'Platinum', hex: '#e4dccb', prompt: 'an icy platinum blonde' },
];

const styleById = new Map(STYLES.map((s) => [s.id, s]));
const shadeById = new Map(SHADES.map((s) => [s.id, s]));
const beardById = new Map(BEARDS.map((b) => [b.id, b]));

// ---------------------------------------------------------------- availability

type Provider = 'gemini' | 'openai' | 'mock';

/** The image model in use, or null when the AI mirror is off for the whole platform. */
export function tryonProvider(): Provider | null {
  const p = config.tryon.provider;
  if (p === 'mock') return 'mock';
  if ((p === 'gemini' || p === 'openai') && config.tryon.apiKey) return p;
  return null;
}

/** Whether this salon's customers see the mirror. */
export function salonTryon(s: Pick<Salon, 'tryon'>): boolean {
  return s.tryon === 'on' && tryonProvider() !== null;
}

/** The catalogue (names and colours); which cuts and beards a customer sees comes from his photo. */
export function catalogue() {
  return {
    styles: STYLES.map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en })),
    beards: BEARDS.map(({ id, name_ar, name_en }) => ({ id, name_ar, name_en })),
    shades: SHADES.map(({ id, name_ar, name_en, hex }) => ({ id, name_ar, name_en, hex })),
  };
}

/**
 * The beards his can become, best suited first: at most its own length (a trimmer only
 * takes it shorter), shapes that need an even beard only when it grows evenly, then
 * the face shapes each flatters.
 */
export function fitBeards(hair: Hair) {
  const have = BEARD_LENGTHS.indexOf(hair.beard);
  const fits = BEARDS.filter((b) => have >= BEARD_LENGTHS.indexOf(b.needs) && (!b.even || hair.coverage === 'even'));
  const score = (b: Beard) =>
    (b.faces.includes(hair.face) ? 3 : 0)
    // Closest to what he wears now first; a clean shave last for a man who keeps a beard.
    - 0.5 * (have - BEARD_LENGTHS.indexOf(b.needs))
    + (b.id === 'clean' && have >= BEARD_LENGTHS.indexOf('short') ? -1 : 0);
  const ranked = fits.map((b, i) => ({ b, i, v: score(b) })).sort((a, z) => z.v - a.v || a.i - z.i).map((x) => x.b.id);
  return { beards: ranked, beard_picks: ranked.slice(0, 2), beards_hidden: BEARDS.length - fits.length };
}

/**
 * The cuts this hair can give, best suited first. A cut needs at least its length on
 * top (scissors only take hair shorter) and, for some, a texture; the rest is order:
 * the face shapes a cut flatters, and volume cuts last on thin hair or a receding
 * hairline. The AI only describes the hair; these rules decide.
 */
export function fitStyles(hair: Hair) {
  const have = LENGTHS.indexOf(hair.length);
  const sparse = hair.density === 'thin' || hair.hairline === 'receding';
  const curly = hair.texture === 'curly' || hair.texture === 'coily';
  const fits = STYLES.filter((s) => have >= LENGTHS.indexOf(s.needs) && (!s.textures || s.textures.includes(hair.texture)));
  const score = (s: Style) =>
    (s.faces.includes(hair.face) ? 3 : 0)
    + (s.volume && sparse ? -4 : 0)
    + (sparse && LENGTHS.indexOf(s.needs) <= LENGTHS.indexOf('short') ? 1 : 0)
    + (curly && s.textures && !s.textures.includes('straight') ? 2 : 0) // made for his curls
    // A clean shave is the barber's answer to a bald or thinning top, a big step otherwise.
    + (s.id === 'shaved' ? (sparse || have <= LENGTHS.indexOf('buzz') ? 3 : -3) : 0)
    // A cut close to the hair he has now is a smaller step; a big change still shows.
    - 0.5 * (have - LENGTHS.indexOf(s.needs));
  const ranked = fits.map((s, i) => ({ s, i, v: score(s) })).sort((a, b) => b.v - a.v || a.i - b.i).map((x) => x.s.id);
  return { styles: ranked, picks: ranked.slice(0, 3), hidden: STYLES.length - fits.length };
}

/**
 * A look checked against the catalogue: "cut[:colour[:beard]]", with "keep" for the
 * hair he has and an empty colour for his own ("skin_fade", "quiff:brown",
 * "keep::full_beard", "crop::stubble"). Null if not given.
 */
export function parseLook(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'invalid', 'look');
  const [styleId = '', shadeId = '', beardId = '', ...extra] = value.split(':');
  const style = styleId === 'keep' ? null : styleById.get(styleId);
  const shade = shadeId ? shadeById.get(shadeId) : null;
  const beard = beardId ? beardById.get(beardId) : null;
  // Something has to change, and every part named must be in the catalogue.
  if (style === undefined || shade === undefined || beard === undefined || extra.length || (!style && !shade && !beard)) {
    throw new HttpError(400, 'invalid', 'look');
  }
  return [style?.id ?? 'keep', shade?.id ?? '', beard?.id ?? ''].join(':').replace(/:+$/, '');
}

/** A stored look in words, for the owner's schedule and the customer's ticket. */
export function describeLook(look: string | null) {
  if (!look) return null;
  const [styleId = '', shadeId = '', beardId = ''] = look.split(':');
  const style = styleById.get(styleId) ?? null;
  const beard = beardById.get(beardId) ?? null;
  const shade = shadeId ? shadeById.get(shadeId) ?? null : null;
  if (!style && !beard && !shade) return null;
  const parts = [style, beard].filter((x): x is Style | Beard => !!x);
  return {
    id: look,
    // The photo that shows it best: the cut, or the beard when the hair is kept.
    style: style?.id ?? null,
    beard: beard ? { id: beard.id, name_ar: beard.name_ar, name_en: beard.name_en } : null,
    name_ar: parts.map((x) => x.name_ar).join(' · '),
    name_en: parts.map((x) => x.name_en).join(' · '),
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

// Reading the hair costs far less than a picture, but it is still capped: per address,
// per salon and for the whole platform each day, with a few at once.
const readsPerAddress = new Map<string, number[]>();
let reading = 0;
const MAX_READING = 12;

setInterval(() => {
  const now = Date.now();
  for (const [ip, list] of readsPerAddress) if (!list.some((t) => now - t < 24 * 3600_000)) readsPerAddress.delete(ip);
}, 10 * 60_000).unref();

function countRead(ip: string, salonId: number): void {
  const now = Date.now();
  const list = (readsPerAddress.get(ip) ?? []).filter((t) => now - t < 24 * 3600_000);
  if (list.filter((t) => now - t < RECENT_MS).length >= config.tryon.readsPerAddress10m || list.length >= config.tryon.readsPerAddressDaily) {
    throw new HttpError(429, 'too_many_attempts');
  }
  const today = new Date().toISOString().slice(0, 10);
  const salonKey = `reads:salon:${salonId}:${today}`;
  const allKey = `reads:all:${today}`;
  if ((perDay.get(salonKey) ?? 0) >= config.tryon.readsSalonDaily || (perDay.get(allKey) ?? 0) >= config.tryon.readsDaily) {
    throw new HttpError(429, 'tryon_daily_limit');
  }
  list.push(now);
  readsPerAddress.set(ip, list);
  perDay.set(salonKey, (perDay.get(salonKey) ?? 0) + 1);
  perDay.set(allKey, (perDay.get(allKey) ?? 0) + 1);
}

// ---------------------------------------------------------------- the picture

const INPUT = { limitInputPixels: 50_000_000, failOn: 'error' as const };

/** The customer's photo, upright, at most `side` pixels, re-encoded with no metadata (no location, no camera). */
async function intakePhoto(buf: Buffer, side = 1024): Promise<Buffer> {
  if (!sniffImage(buf)) throw new HttpError(415, 'unsupported_image');
  try {
    const meta = await sharp(buf, INPUT).metadata();
    if (!meta.width || !meta.height) throw new Error('no size');
    if (Math.min(meta.width, meta.height) < 256) throw new HttpError(422, 'image_too_small');
    return await sharp(buf, INPUT).rotate().resize({ width: side, height: side, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(415, 'unsupported_image');
  }
}

function promptFor(style: Style | null, beard: Beard | null, shade: Shade | null): string {
  return [
    'Edit this photo of a man.',
    style ? `Change his hairstyle to ${style.prompt}.` : 'Keep his hairstyle exactly as it is.',
    beard ? `Change his facial hair to ${beard.prompt}.` : 'Keep his beard and moustache exactly as they are.',
    shade ? `Colour the hair${beard && beard.id !== 'clean' ? ' and the beard' : ''} ${shade.prompt}.` : 'Keep his natural hair colour.',
    'Keep everything else exactly as it is: the face and its features, the identity, expression, skin tone, glasses, clothing, background, lighting, camera angle and framing.',
    'Make it photorealistic, with a natural hairline, real hair and beard texture, like a professional barbershop result. Do not add text, logos or other people.',
  ].join(' ');
}

// ---------------------------------------------------------------- reading the hair

const READ_PROMPT = [
  'You are an experienced barber looking at a customer\'s photo before a haircut. Describe the hair and beard he has NOW, as they are in the photo.',
  'person: true only if one person\'s head is clearly visible from the front or close to it (a bald or shaved head counts).',
  'length: judge ONLY the hair on the top of the head, ignoring the sides and back however long they are.',
  'bald (no hair on top, or shaved to the skin); buzz (under 1 cm); short (1 to 5 cm, the top cannot be combed down onto the forehead);',
  'medium (5 to 10 cm, combed forward it would reach the middle of the forehead); long (10 to 15 cm, combed forward it would reach the eyebrows);',
  'very_long (over 15 cm, combed forward it would cover the eyes).',
  'texture: straight, wavy, curly or coily. density: thick, normal or thin (scalp visible through the hair on top). hairline: full, or receding (temples or crown clearly thinning).',
  'face, the shape of the face: oval, round, square, long, heart or diamond.',
  'beard, his facial hair now: none (clean-shaven), stubble (under 3 mm), short (3 mm to 2 cm), full (over 2 cm). coverage: even, or patchy (gaps on the cheeks or jaw); even if he has no beard.',
  'If unsure between two lengths, choose the shorter one. Reply with the JSON only.',
].join(' ');

const READ_FIELDS = { length: LENGTHS, texture: TEXTURES, density: DENSITIES, hairline: HAIRLINES, face: FACES, beard: BEARD_LENGTHS, coverage: COVERAGES } as const;

/** The model's answer, checked field by field: anything off the lists is a failed read. */
function hairFrom(raw: unknown): Hair {
  const r = (raw ?? {}) as Record<string, unknown>;
  if (r.person !== true) throw new HttpError(422, 'hair_unclear');
  for (const [k, allowed] of Object.entries(READ_FIELDS)) {
    if (!(allowed as readonly unknown[]).includes(r[k])) throw new HttpError(502, 'read_failed');
  }
  return { length: r.length, texture: r.texture, density: r.density, hairline: r.hairline, face: r.face, beard: r.beard, coverage: r.coverage } as Hair;
}

async function readViaGemini(photo: Buffer, signal: AbortSignal): Promise<unknown> {
  const model = config.tryon.visionModel || 'gemini-2.5-flash';
  const enumOf = (values: readonly string[]) => ({ type: 'STRING', enum: [...values] });
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': config.tryon.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: 'image/jpeg', data: photo.toString('base64') } }, { text: READ_PROMPT }] }],
      generationConfig: {
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: {
          type: 'OBJECT',
          properties: { person: { type: 'BOOLEAN' }, ...Object.fromEntries(Object.entries(READ_FIELDS).map(([k, v]) => [k, enumOf(v)])) },
          required: ['person', ...Object.keys(READ_FIELDS)],
        },
      },
    }),
    signal,
  });
  if (!res.ok) throw providerError(res.status, await res.text().catch(() => ''), true);
  const json = (await res.json()) as { promptFeedback?: { blockReason?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] };
  // Blocked by the model's own safety rules: as far as the customer can tell, the photo did not work.
  if (json.promptFeedback?.blockReason) throw new HttpError(422, 'hair_unclear');
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new HttpError(422, 'hair_unclear');
  return JSON.parse(text);
}

async function readViaOpenAI(photo: Buffer, signal: AbortSignal): Promise<unknown> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.tryon.apiKey}` },
    body: JSON.stringify({
      model: config.tryon.visionModel || 'gpt-4.1-mini',
      messages: [{ role: 'user', content: [
        { type: 'text', text: READ_PROMPT },
        { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${photo.toString('base64')}`, detail: 'high' } },
      ] }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'hair',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            properties: { person: { type: 'boolean' }, ...Object.fromEntries(Object.entries(READ_FIELDS).map(([k, v]) => [k, { type: 'string', enum: [...v] }])) },
            required: ['person', ...Object.keys(READ_FIELDS)],
          },
        },
      },
    }),
    signal,
  });
  if (!res.ok) throw providerError(res.status, await res.text().catch(() => ''), true);
  const json = (await res.json()) as { choices?: { message?: { content?: string; refusal?: string } }[] };
  const text = json.choices?.[0]?.message?.content;
  if (!text || json.choices?.[0]?.message?.refusal) throw new HttpError(422, 'hair_unclear');
  return JSON.parse(text);
}

/** The stand-in reads every photo as medium (5-10 cm), wavy hair on an oval face, with a short, even beard. */
async function readViaMock(): Promise<unknown> {
  await new Promise((r) => setTimeout(r, config.isProd ? 0 : 700));
  return { person: true, length: 'medium', texture: 'wavy', density: 'normal', hairline: 'full', face: 'oval', beard: 'short', coverage: 'even' };
}

/** Reads the hair and beard in the customer's photo and answers with the cuts and beards they can give. Nothing is kept. */
export async function readHair(ctx: Ctx, salon: Salon) {
  const provider = tryonProvider();
  if (!salonTryon(salon) || !provider) throw new HttpError(404, 'not_found');
  const type = (ctx.req.headers['content-type'] ?? '').split(';')[0]!.trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new HttpError(415, 'unsupported_image');
  const photo = await intakePhoto(await readBody(ctx.req, config.maxUploadBytes), 768);
  if (reading >= MAX_READING) throw new HttpError(503, 'tryon_busy');
  countRead(ctx.ip, salon.id);

  reading++;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30_000);
  const release = abortOnClose(ctx, abort);
  try {
    const raw = provider === 'gemini' ? await readViaGemini(photo, abort.signal) : provider === 'openai' ? await readViaOpenAI(photo, abort.signal) : await readViaMock();
    const hair = hairFrom(raw);
    return { hair, ...fitStyles(hair), ...fitBeards(hair) };
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as Error).name === 'AbortError') throw new HttpError(504, 'read_failed');
    console.error('tryon read', (err as Error).message);
    throw new HttpError(502, 'read_failed');
  } finally {
    clearTimeout(timer);
    release();
    reading--;
  }
}

// ---------------------------------------------------------------- drawing the cut

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
async function viaMock(photo: Buffer, shade: Shade | null): Promise<Buffer> {
  const { width = 1024, height = 1024 } = await sharp(photo).metadata();
  const tint = shade?.hex ?? '#2b1d14';
  const hair = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${tint}" stop-opacity=".78"/><stop offset=".42" stop-color="${tint}" stop-opacity=".5"/><stop offset=".6" stop-color="${tint}" stop-opacity="0"/></linearGradient></defs>
    <ellipse cx="${width / 2}" cy="${height * 0.2}" rx="${width * 0.36}" ry="${height * 0.28}" fill="url(#g)"/>
  </svg>`);
  await new Promise((r) => setTimeout(r, config.isProd ? 0 : 900));
  return sharp(photo).composite([{ input: hair, blend: 'multiply' }]).jpeg({ quality: 88 }).toBuffer();
}

/**
 * A provider's error as the customer should see it. A 400 on a drawing is usually the
 * model turning the photo down; on a reading it is our request (a key, a model name),
 * so it is a failed read, never "try another photo".
 */
function providerError(status: number, body: string, read = false): HttpError {
  // Never pass the provider's message on: it can echo request details. Log a short slice.
  console.error(`tryon provider${read ? ' (read)' : ''} ${status}: ${body.slice(0, 300)}`);
  if (status === 429 || status === 503) return new HttpError(503, 'tryon_busy');
  if (read) return new HttpError(502, 'read_failed');
  if (status === 400) return new HttpError(422, 'tryon_refused');
  return new HttpError(502, 'tryon_failed');
}

/** Stops the provider call when the customer goes away (cancel, a new photo, a closed tab). */
function abortOnClose(ctx: Ctx, abort: AbortController): () => void {
  const onClose = () => {
    if (!ctx.res.writableFinished) abort.abort();
  };
  ctx.res.once('close', onClose);
  return () => ctx.res.off('close', onClose);
}

/** The customer's photo with the chosen cut, as a JPEG. Nothing is kept. */
export async function tryOn(ctx: Ctx, salon: Salon): Promise<Buffer> {
  const provider = tryonProvider();
  if (!salonTryon(salon) || !provider) throw new HttpError(404, 'not_found');
  // The cut (or "keep" for his own hair), a beard, a colour: at least one of them changes.
  const q = ctx.url.searchParams;
  const styleParam = q.get('style') ?? 'keep';
  const style = styleParam === 'keep' ? null : styleById.get(styleParam);
  if (style === undefined) throw new HttpError(400, 'invalid', 'style');
  const beardParam = q.get('beard');
  const beard = beardParam ? beardById.get(beardParam) : null;
  if (beard === undefined) throw new HttpError(400, 'invalid', 'beard');
  const shadeParam = q.get('shade');
  const shade = shadeParam ? shadeById.get(shadeParam) : null;
  if (shade === undefined) throw new HttpError(400, 'invalid', 'shade');
  if (!style && !beard && !shade) throw new HttpError(400, 'invalid', 'style');

  const type = (ctx.req.headers['content-type'] ?? '').split(';')[0]!.trim();
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) throw new HttpError(415, 'unsupported_image');
  const photo = await intakePhoto(await readBody(ctx.req, config.maxUploadBytes));
  // A busy mirror turns the try away before it is counted.
  if (inFlight >= MAX_IN_FLIGHT) throw new HttpError(503, 'tryon_busy');
  countTry(ctx.ip, salon.id);

  inFlight++;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 90_000);
  const release = abortOnClose(ctx, abort);
  try {
    const prompt = promptFor(style, beard, shade);
    const raw =
      provider === 'gemini' ? await viaGemini(photo, prompt, abort.signal)
      : provider === 'openai' ? await viaOpenAI(photo, prompt, abort.signal)
      : await viaMock(photo, shade);
    // Re-encoded here too: what reaches the phone is always a plain, metadata-free JPEG.
    return await sharp(raw, INPUT).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 88 }).toBuffer();
  } catch (err) {
    if (err instanceof HttpError) throw err;
    if ((err as Error).name === 'AbortError') throw new HttpError(504, 'tryon_failed');
    console.error('tryon', err);
    throw new HttpError(502, 'tryon_failed');
  } finally {
    clearTimeout(timer);
    release();
    inFlight--;
  }
}
