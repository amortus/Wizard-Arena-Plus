/**
 * pack-atlas.mjs
 * Packs sprites into two texture atlases:
 *   atlas.png       — standard sprites (≤56px): wizards, monsters, proj, gems, tiles
 *   atlas_large.png — large sprites (>56px): rat (68px), dragon (80px)
 *
 * 10px gap between all sprites prevents GPU sub-pixel UV bleeding when
 * camera.setRoundPixels(false) causes fractional UV offsets.
 *
 * Run: node scripts/pack-atlas.mjs
 */

import sharp from 'sharp';
import { readdir, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT       = join(__dirname, '..');
const SPRITES_DIR = join(ROOT, 'public', 'sprites');
const ATLAS_W    = 2048;
const PADDING    = 10; // minimum gap between sprites

async function packUniform(sprites, cellW, cellH, outImage, outJson) {
  if (sprites.length === 0) { console.log(`  ${basename(outImage)}: nothing to pack`); return; }

  const cols   = Math.floor(ATLAS_W / cellW);
  const rows   = Math.ceil(sprites.length / cols);
  const actualH = rows * cellH;

  if (actualH > 8192) throw new Error(`Atlas too tall: ${actualH}px (${sprites.length} sprites in ${cols} cols)`);

  console.log(`  ${basename(outImage)}: ${cols}×${rows} grid · cell ${cellW}×${cellH} · ${sprites.length} sprites · ${ATLAS_W}×${actualH}px`);

  const composites = [];
  const frames     = {};

  for (let i = 0; i < sprites.length; i++) {
    const { file, path, w, h } = sprites[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = col * cellW;
    const y   = row * cellH;
    composites.push({ input: path, left: x, top: y });
    const key = basename(file, '.png');
    frames[key] = {
      frame: { x, y, w, h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w, h },
      sourceSize: { w, h },
    };
  }

  await sharp({
    create: { width: ATLAS_W, height: actualH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toFile(outImage);

  await writeFile(outJson, JSON.stringify({
    frames,
    meta: {
      app: 'pack-atlas.mjs',
      image: basename(outImage),
      format: 'RGBA8888',
      size: { w: ATLAS_W, h: actualH },
      scale: '1',
    },
  }));
  console.log(`  Written: ${basename(outJson)} (${Object.keys(frames).length} frames)`);
}

async function main() {
  const files = (await readdir(SPRITES_DIR)).filter(f => f.endsWith('.png')).sort();
  console.log(`Found ${files.length} sprites in public/sprites/`);

  const all = [];
  for (const file of files) {
    const path = join(SPRITES_DIR, file);
    const meta = await sharp(path).metadata();
    all.push({ file, path, w: meta.width, h: meta.height });
  }

  // Log size distribution for diagnostics
  const dist = {};
  for (const s of all) {
    const k = `${s.w}×${s.h}`;
    dist[k] = (dist[k] ?? 0) + 1;
  }
  console.log('Size distribution:', Object.entries(dist).sort().map(([k, n]) => `${k}: ${n}`).join('  '));

  // Split by size:
  //   standard (≤56px) → atlas.png      cell = 56+10 = 66×66
  //   large    (>56px) → atlas_large.png  cell = maxDim+10 × maxDim+10
  const standard = all.filter(s => s.w <= 56 && s.h <= 56).sort((a, b) => a.file.localeCompare(b.file));
  const large    = all.filter(s => s.w  > 56 || s.h  > 56).sort((a, b) => a.file.localeCompare(b.file));

  console.log(`Standard (≤56px): ${standard.length} sprites`);
  console.log(`Large    (>56px): ${large.length} sprites`);

  const maxLarge = large.length > 0 ? Math.max(...large.map(s => Math.max(s.w, s.h))) : 0;

  await packUniform(
    standard,
    56 + PADDING, 56 + PADDING,
    join(ROOT, 'public', 'atlas.png'),
    join(ROOT, 'public', 'atlas.json'),
  );

  await packUniform(
    large,
    maxLarge + PADDING, maxLarge + PADDING,
    join(ROOT, 'public', 'atlas_large.png'),
    join(ROOT, 'public', 'atlas_large.json'),
  );

  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
