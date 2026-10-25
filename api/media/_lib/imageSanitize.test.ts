import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImageRejected, sanitizeDemoImage, sanitizeFoodImage, sniffImage } from './imageSanitize.js';

/**
 * B4.1 — a food photo is stored as what its bytes say it is (never the declared type or the file
 * name), within sane dimensions, and without the metadata that can carry private data (EXIF GPS
 * position, camera, author; XMP; text chunks). Fixtures: `__fixtures__/*` — tiny real images made
 * with sharp carrying a GPS position / an author / a "Location" text (decode-checked when made).
 */
const fx = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));
const rejected = (fn: () => unknown) => {
  try {
    fn();
    return null;
  } catch (e) {
    return e instanceof ImageRejected ? e.code : String(e);
  }
};

describe('food image sanitizer', () => {
  it('JPEG: the EXIF block (GPS position, author) is cut out; dimensions read from the frame header', () => {
    const src = fx('exif.jpg');
    expect(src.includes(Buffer.from('Private Person'))).toBe(true);
    const out = sanitizeFoodImage(src, 'image/jpeg');
    expect(out).toMatchObject({ mime: 'image/jpeg', width: 96, height: 72, removed: ['EXIF'] });
    for (const secret of ['Exif', 'Private Person', 'Forma test fixture']) expect(out.buffer.includes(Buffer.from(secret)), secret).toBe(false);
    expect(sniffImage(out.buffer)).toBe('image/jpeg');
  });

  it('WebP: the EXIF chunk is cut out, its flag cleared and the RIFF size rewritten', () => {
    const out = sanitizeFoodImage(fx('exif.webp'), 'image/webp');
    expect(out).toMatchObject({ mime: 'image/webp', width: 96, height: 72, removed: ['EXIF'] });
    expect(out.buffer.includes(Buffer.from('Private Person'))).toBe(false);
    expect(out.buffer.readUInt32LE(4)).toBe(out.buffer.length - 8);
    expect(out.buffer[20] & 0x08).toBe(0); // VP8X EXIF flag
  });

  it('PNG: text chunks go (a "Location" note), picture chunks stay', () => {
    const out = sanitizeFoodImage(fx('text.png'), 'image/png');
    expect(out).toMatchObject({ mime: 'image/png', width: 96, height: 72, removed: ['tEXt'] });
    expect(out.buffer.includes(Buffer.from('Home of a private person'))).toBe(false);
    expect(out.buffer.includes(Buffer.from('IEND'))).toBe(true);
  });

  it('the bytes decide the type: renamed files, SVG, HTML, GIF are refused', () => {
    expect(rejected(() => sanitizeFoodImage(fx('exif.jpg'), 'image/png'))).toBe('badType'); // a JPEG claiming PNG
    expect(rejected(() => sanitizeFoodImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/png'))).toBe('badType');
    expect(rejected(() => sanitizeFoodImage(Buffer.from('<!doctype html><script>alert(1)</script>'), 'image/jpeg'))).toBe('badType');
    expect(rejected(() => sanitizeFoodImage(Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1'), 'image/gif'))).toBe('badType');
  });

  it('dimensions are checked: too small is refused; truncated files are refused', () => {
    expect(rejected(() => sanitizeFoodImage(fx('small.png'), 'image/png'))).toBe('badDimensions');
    const jpg = fx('exif.jpg');
    expect(rejected(() => sanitizeFoodImage(jpg.subarray(0, 40), 'image/jpeg'))).toBe('badImage');
    const pngTrunc = fx('text.png').subarray(0, 60);
    expect(rejected(() => sanitizeFoodImage(pngTrunc, 'image/png'))).toBe('badImage');
  });

  it('animated WebP is refused', () => {
    const still = fx('exif.webp');
    const anim = Buffer.concat([Buffer.from('ANIM', 'latin1'), Buffer.from([6, 0, 0, 0]), Buffer.alloc(6)]);
    const body = Buffer.concat([still.subarray(12), anim]);
    const header = Buffer.alloc(12);
    header.write('RIFF', 0, 'latin1');
    header.writeUInt32LE(4 + body.length, 4);
    header.write('WEBP', 8, 'latin1');
    expect(rejected(() => sanitizeFoodImage(Buffer.concat([header, body]), 'image/webp'))).toBe('badType');
  });
});

/** A tiny, structurally real GIF: 64 × 64, a loop block, a comment and an XMP block, `frames` images. */
function gifWith(frames = 2): Buffer {
  const b = (...x: (number | string)[]) => Buffer.concat(x.map((v) => (typeof v === 'string' ? Buffer.from(v, 'latin1') : Buffer.from([v]))));
  const frame = Buffer.concat([b(0x21, 0xf9, 4, 0, 10, 0, 0, 0), b(0x2c, 0, 0, 0, 0, 64, 0, 64, 0, 0), b(2, 2, 0x4c, 0x01, 0)]);
  return Buffer.concat([
    b('GIF89a', 64, 0, 64, 0, 0x80, 0, 0),
    b(0, 0, 0, 255, 255, 255),
    b(0x21, 0xff, 11, 'NETSCAPE2.0', 3, 1, 0, 0, 0),
    b(0x21, 0xfe, 9, 'my secret', 0),
    b(0x21, 0xff, 11, 'XMP DataXMP', 5, 'GPS42', 0),
    ...Array.from({ length: frames }, () => frame),
    b(0x3b),
  ]);
}

describe('exercise demonstration pictures (B4.2)', () => {
  it('GIF: frames and the loop block stay; comments and other application blocks (XMP) go', () => {
    const src = gifWith(3);
    const out = sanitizeDemoImage(src, 'image/gif');
    expect(out).toMatchObject({ mime: 'image/gif', width: 64, height: 64 });
    expect(out.removed).toEqual(['comment', 'app:XMP DataXMP']);
    expect(out.buffer.includes(Buffer.from('my secret'))).toBe(false);
    expect(out.buffer.includes(Buffer.from('GPS42'))).toBe(false);
    expect(out.buffer.includes(Buffer.from('NETSCAPE2.0'))).toBe(true);
    expect(out.buffer.length).toBeLessThan(src.length);
    expect(out.buffer[out.buffer.length - 1]).toBe(0x3b);
  });

  it('a still is cleaned exactly like a food photo; a renamed file, a truncated GIF and a tiny GIF are refused', () => {
    const jpg = sanitizeDemoImage(fx('exif.jpg'), 'image/jpeg');
    expect(jpg.mime).toBe('image/jpeg');
    expect(jpg.buffer.includes(Buffer.from('Exif'))).toBe(false);
    expect(rejected(() => sanitizeDemoImage(gifWith(), 'image/png'))).toBe('badType');
    expect(rejected(() => sanitizeDemoImage(gifWith().subarray(0, 40), 'image/gif'))).toBe('badImage');
    const tiny = gifWith();
    tiny.writeUInt16LE(16, 6);
    expect(rejected(() => sanitizeDemoImage(tiny, 'image/gif'))).toBe('badDimensions');
    expect(rejected(() => sanitizeDemoImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'))).toBe('badType');
  });
});
