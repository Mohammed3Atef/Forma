// Generates simple branded PNG app icons (no external deps) into public/icons.
// A solid brand-green rounded background with a white dumbbell glyph drawn as
// pixels — enough for an installable, good-looking maskable PWA icon.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BRAND = [34, 197, 94]; // #22c55e
const DARK = [15, 23, 42]; // #0f172a
const WHITE = [255, 255, 255];

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i += 1) {
    c ^= buf[i];
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function png(size, { maskable } = {}) {
  const px = (r, g, b, a = 255) => [r, g, b, a];
  const data = Buffer.alloc(size * size * 4);
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * (maskable ? 0.5 : 0.46);
  const corner = size * 0.22;

  const set = (x, y, [r, g, b, a]) => {
    const i = (y * size + x) * 4;
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      // Rounded-square background (maskable fills edge-to-edge).
      let inside = maskable;
      if (!maskable) {
        const dx = Math.max(Math.abs(x - cx) - (radius - corner), 0);
        const dy = Math.max(Math.abs(y - cy) - (radius - corner), 0);
        inside = Math.hypot(dx, dy) <= corner || (Math.abs(x - cx) <= radius && Math.abs(y - cy) <= radius && (Math.abs(x - cx) <= radius - corner || Math.abs(y - cy) <= radius - corner));
      }
      if (!inside) {
        set(x, y, px(0, 0, 0, 0));
        continue;
      }
      set(x, y, px(...BRAND));

      // Dumbbell glyph (white): a central bar with two square plates.
      const u = (x - cx) / size; // -0.5..0.5
      const v = (y - cy) / size;
      const bar = Math.abs(v) < 0.04 && Math.abs(u) < 0.30;
      const plateL = u < -0.22 && u > -0.34 && Math.abs(v) < 0.16;
      const plateR = u > 0.22 && u < 0.34 && Math.abs(v) < 0.16;
      const capL = u < -0.32 && u > -0.40 && Math.abs(v) < 0.10;
      const capR = u > 0.32 && u < 0.40 && Math.abs(v) < 0.10;
      if (bar || plateL || plateR || capL || capR) set(x, y, px(...WHITE));
      // subtle inner shade ring for depth
      else if (!maskable && Math.hypot(x - cx, y - cy) > radius - 2) set(x, y, px(...DARK, 60));
    }
  }

  // Build raw scanlines with filter byte 0.
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (size * 4 + 1)] = 0;
    data.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(outDir, 'icon-192.png'), png(192));
writeFileSync(join(outDir, 'icon-512.png'), png(512));
writeFileSync(join(outDir, 'icon-maskable-512.png'), png(512, { maskable: true }));
writeFileSync(join(outDir, 'apple-touch-icon.png'), png(180));
console.log('Icons written to', outDir);
