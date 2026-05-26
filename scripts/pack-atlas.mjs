/**
 * pack-atlas.mjs
 * Packs all sprite PNGs from public/sprites/ into a single 2048×2048 texture
 * atlas, outputs public/atlas.png + public/atlas.json (Phaser MultiAtlas format).
 *
 * Run: node scripts/pack-atlas.mjs
 */

import sharp from 'sharp';
import { readdir, writeFile } from 'fs/promises';
import { join, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SPRITES_DIR = join(ROOT, 'public', 'sprites');
const OUT_IMAGE = join(ROOT, 'public', 'atlas.png');
const OUT_JSON = join(ROOT, 'public', 'atlas.json');

const ATLAS_W = 2048;
const ATLAS_H = 2048;
const PADDING = 1; // 1px gap between sprites to avoid bleeding

async function main() {
  // 1. Collect all PNG files
  const files = (await readdir(SPRITES_DIR))
    .filter(f => f.endsWith('.png'))
    .sort(); // deterministic order

  console.log(`Found ${files.length} sprites to pack`);

  // 2. Get dimensions of each (all should be 56×56 but verify)
  const sprites = [];
  for (const file of files) {
    const path = join(SPRITES_DIR, file);
    const meta = await sharp(path).metadata();
    sprites.push({ file, path, w: meta.width, h: meta.height });
  }

  // 3. Simple row-based packing (all sprites same size → perfect grid)
  const SPRITE_W = sprites[0].w;
  const SPRITE_H = sprites[0].h;
  const CELL_W = SPRITE_W + PADDING;
  const CELL_H = SPRITE_H + PADDING;
  const cols = Math.floor(ATLAS_W / CELL_W);
  const rows = Math.ceil(sprites.length / cols);
  const actualH = rows * CELL_H;

  if (actualH > ATLAS_H) {
    throw new Error(`Too many sprites: need ${actualH}px height but atlas is ${ATLAS_H}px`);
  }

  console.log(`Grid: ${cols} cols × ${rows} rows = ${cols * rows} cells (${sprites.length} sprites)`);
  console.log(`Sprite size: ${SPRITE_W}×${SPRITE_H}  Atlas size: ${ATLAS_W}×${actualH}`);

  // 4. Build compositing list
  const composites = [];
  const frames = {};

  for (let i = 0; i < sprites.length; i++) {
    const { file, path, w, h } = sprites[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = col * CELL_W;
    const y = row * CELL_H;

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

  // 5. Composite into atlas PNG
  console.log('Compositing atlas...');
  await sharp({
    create: {
      width: ATLAS_W,
      height: actualH,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toFile(OUT_IMAGE);

  console.log(`Written: public/atlas.png (${ATLAS_W}×${actualH})`);

  // 6. Write Phaser atlas JSON (single-page TexturePacker format)
  const json = {
    frames,
    meta: {
      app: 'pack-atlas.mjs',
      image: 'atlas.png',
      format: 'RGBA8888',
      size: { w: ATLAS_W, h: actualH },
      scale: '1',
    },
  };

  await writeFile(OUT_JSON, JSON.stringify(json));
  console.log(`Written: public/atlas.json (${Object.keys(frames).length} frames)`);
  console.log('Done!');
}

main().catch(err => { console.error(err); process.exit(1); });
