#!/usr/bin/env node
/**
 * Generates AVIF and WebP variants of the card PNGs in public/img/.
 *
 * Run: `node scripts/optimize-card-images.mjs`
 *
 * Outputs {Rank}{Suit}.avif and {Rank}{Suit}.webp next to the source PNGs
 * at the same 160x224 dimensions. Tuned so encoded files are smaller than
 * the PNGs while staying visually indistinguishable from the source.
 *
 * PNGs are kept as a <picture> fallback for browsers without AVIF/WebP.
 */
import { readdir, stat } from "node:fs/promises";
import { join, dirname, resolve, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IMG_DIR = resolve(__dirname, "..", "public", "img");

// Quality settings chosen empirically for this deck. AVIF at 55 / WebP at 78
// keeps the playing card artwork crisp (faces, pips) while landing well
// under the PNG source size.
const AVIF_QUALITY = 55;
const WEBP_QUALITY = 78;

function isCardPng(name) {
  return /^(A|K|Q|J|10|9)[CDHS]\.png$/.test(name);
}

async function humanSize(path) {
  const { size } = await stat(path);
  if (size > 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${size} B`;
}

async function encodeOne(pngPath) {
  const base = basename(pngPath, extname(pngPath));
  const dir = dirname(pngPath);
  const avifPath = join(dir, `${base}.avif`);
  const webpPath = join(dir, `${base}.webp`);

  const pipeline = sharp(pngPath);

  await pipeline
    .clone()
    .avif({ quality: AVIF_QUALITY, effort: 6 })
    .toFile(avifPath);

  await pipeline
    .clone()
    .webp({ quality: WEBP_QUALITY, effort: 6 })
    .toFile(webpPath);

  return { base, pngPath, avifPath, webpPath };
}

async function main() {
  const entries = await readdir(IMG_DIR);
  const pngs = entries.filter(isCardPng).sort();

  if (pngs.length === 0) {
    console.error(`No card PNGs found in ${IMG_DIR}`);
    process.exit(1);
  }

  console.log(`Encoding ${pngs.length} cards (AVIF q=${AVIF_QUALITY}, WebP q=${WEBP_QUALITY})`);

  let totalPng = 0;
  let totalAvif = 0;
  let totalWebp = 0;

  for (const name of pngs) {
    const pngPath = join(IMG_DIR, name);
    const { avifPath, webpPath } = await encodeOne(pngPath);
    const [pngBytes, avifBytes, webpBytes] = await Promise.all([
      stat(pngPath).then((s) => s.size),
      stat(avifPath).then((s) => s.size),
      stat(webpPath).then((s) => s.size),
    ]);
    totalPng += pngBytes;
    totalAvif += avifBytes;
    totalWebp += webpBytes;
    console.log(
      `  ${name.padEnd(8)} PNG ${(pngBytes / 1024).toFixed(1)}KB  ` +
        `WebP ${(webpBytes / 1024).toFixed(1)}KB  ` +
        `AVIF ${(avifBytes / 1024).toFixed(1)}KB`,
    );
  }

  const toKB = (n) => (n / 1024).toFixed(1);
  console.log("---");
  console.log(`Total PNG:  ${toKB(totalPng)} KB`);
  console.log(`Total WebP: ${toKB(totalWebp)} KB  (${((1 - totalWebp / totalPng) * 100).toFixed(1)}% smaller)`);
  console.log(`Total AVIF: ${toKB(totalAvif)} KB  (${((1 - totalAvif / totalPng) * 100).toFixed(1)}% smaller)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
