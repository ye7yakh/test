// Copies web/ to dist/web/ and minifies every script with terser. The server
// serves dist/web in production (see WEB_DIR in src/config.ts).
import fs from 'node:fs/promises';
import path from 'node:path';
import { minify } from 'terser';

const SRC = 'web';
const OUT = path.join('dist', 'web');

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

await fs.rm(OUT, { recursive: true, force: true });
await fs.cp(SRC, OUT, { recursive: true });

let before = 0;
let after = 0;
for await (const file of walk(OUT)) {
  if (!file.endsWith('.js')) continue;
  const code = await fs.readFile(file, 'utf8');
  const result = await minify(code, { module: true, compress: { passes: 2 }, mangle: true, format: { comments: false } });
  await fs.writeFile(file, result.code);
  before += code.length;
  after += result.code.length;
}
console.log(`web: ${(before / 1024).toFixed(0)} KB of scripts minified to ${(after / 1024).toFixed(0)} KB`);
