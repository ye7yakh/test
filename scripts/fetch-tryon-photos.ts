// Downloads the AI mirror's menu photos (one model, one photo per cut and per beard,
// listed in scripts/tryon-photos.json) and saves them as small WebP files in
// web/assets/img/tryon/{hair,beard}/<id>.webp, cropped to the head and shoulders.
//
//   npm run tryon-photos
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const manifest = JSON.parse(fs.readFileSync('scripts/tryon-photos.json', 'utf8')) as { hair: Record<string, string>; beard: Record<string, string> };
const OUT = path.resolve('web/assets/img/tryon');

async function save(kind: 'hair' | 'beard', id: string, url: string) {
  // curl, so the download goes through the machine's proxy settings like any other.
  const png = execFileSync('curl', ['-fsSL', '--max-time', '60', url], { maxBuffer: 64 * 1024 * 1024 });
  const file = path.join(OUT, kind, `${id}.webp`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  // 3:4 like the menu cards, 480 pixels wide: sharp on a phone's screen, about 30 KB.
  await sharp(png).resize(480, 640, { fit: 'cover', position: 'top' }).webp({ quality: 80 }).toFile(file);
  console.log(`  ${path.relative(process.cwd(), file)}`);
}

let failed = 0;
for (const kind of ['hair', 'beard'] as const) {
  for (const [id, url] of Object.entries(manifest[kind])) {
    try {
      await save(kind, id, url);
    } catch (err) {
      failed++;
      console.error(`  ${kind}/${id}: ${(err as Error).message.split('\n')[0]}`);
    }
  }
}

// The app shows a photo only when it is listed here; anything else is drawn.
const saved = (['hair', 'beard'] as const).flatMap((kind) => {
  const dir = path.join(OUT, kind);
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.webp')).map((f) => `${kind}/${f.slice(0, -5)}`).sort() : [];
});
fs.writeFileSync('web/assets/js/tryon-photos.js', `// Written by \`npm run tryon-photos\` (scripts/fetch-tryon-photos.ts): the AI mirror's menu
// photos saved in web/assets/img/tryon/, as "hair/<id>" and "beard/<id>". A look that is
// not listed is drawn instead.
export const PHOTOS = new Set(${JSON.stringify(saved, null, 2).replace(/"/g, "'")});
`);
console.log(`\n${saved.length} photos listed in web/assets/js/tryon-photos.js`);
if (failed) {
  console.error(`\n${failed} photo(s) not saved. If the host is blocked, allow d8j0ntlcm91z4.cloudfront.net and run again.`);
  process.exit(1);
}
