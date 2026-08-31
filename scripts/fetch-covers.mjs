// Build-time cover fetcher. The author-geo content schema requires each
// book/series/author to reference a LOCAL cover image (`cover: image()`),
// but committing ~35 multi-megabyte JPEGs into the repo is exactly the step
// that every text-only AI->GitHub path chokes on. So instead the images are
// declared as source URLs in scripts/cover-manifest.json and downloaded here,
// at the START of the build, before `astro build` loads the content
// collections. Cloudflare's build command runs this first:
//
//     node scripts/fetch-covers.mjs && npm run build
//
// Net effect: the repo stays 100% text (pushable by any connector), and the
// covers materialize on disk just in time for Astro's image pipeline to
// optimize them. Re-run is idempotent; an already-present, correctly-sized
// file is skipped so local `npm run build` doesn't re-download every time.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('..', import.meta.url));
const manifest = JSON.parse(
  fs.readFileSync(path.join(root, 'scripts', 'cover-manifest.json'), 'utf8'),
);

const UA = 'Mozilla/5.0 (compatible; author-geo cover fetch)';

async function one(dest, { url, max }) {
  const outPath = path.join(root, dest);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 1024) {
    console.log(`skip  ${dest} (present)`);
    return;
  }
  const [maxW, maxH] = (max || '1600x1600').split('x').map(Number);
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(buf)
    .resize(maxW, maxH, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 88, mozjpeg: true })
    .toFile(outPath);
  const { width, height } = await sharp(outPath).metadata();
  console.log(`ok    ${dest} (${width}x${height})`);
}

const entries = Object.entries(manifest);
let failed = 0;
// Small concurrency so a full cold fetch of ~38 images stays well within a
// CI build's time budget without hammering the source hosts.
const CONC = 6;
for (let i = 0; i < entries.length; i += CONC) {
  const batch = entries.slice(i, i + CONC);
  const results = await Promise.allSettled(batch.map(([d, m]) => one(d, m)));
  for (const [j, r] of results.entries()) {
    if (r.status === 'rejected') {
      failed++;
      console.error(`FAIL  ${batch[j][0]}: ${r.reason?.message || r.reason}`);
    }
  }
}
if (failed) {
  console.error(`\n${failed} cover(s) failed to fetch — build cannot proceed.`);
  process.exit(1);
}
console.log(`\nAll ${entries.length} covers ready.`);
