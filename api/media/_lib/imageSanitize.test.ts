import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ImageRejected, sanitizeFoodImage, sniffImage } from './imageSanitize.js';

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
