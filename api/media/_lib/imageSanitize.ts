/**
 * B4.1 — food images: what a file REALLY is, and the same picture without its metadata.
 *
 * The browser's declared type and the file name are never trusted: the format is read from the
 * bytes (JPEG / PNG / WebP only), the dimensions from the image header, and everything that can
 * carry private data is cut out before the file is stored — EXIF (camera, GPS position, time), XMP,
 * comments and text chunks — without decoding or re-encoding the picture (no native image library
 * on the server). Anything else — SVG, HTML, GIF, animated WebP, truncated or malformed files — is
 * refused.
 */
export type SanitizedMime = 'image/jpeg' | 'image/png' | 'image/webp';

export class ImageRejected extends Error {
  constructor(
    public readonly code: 'badType' | 'badImage' | 'badDimensions',
    message: string,
  ) {
    super(message);
    this.name = 'ImageRejected';
  }
}

export interface SanitizedImage {
  buffer: Buffer;
  mime: SanitizedMime;
  width: number;
  height: number;
  /** Metadata blocks removed (e.g. "EXIF", "XMP", "tEXt") — for logs and tests. */
  removed: string[];
}

export const FOOD_IMAGE_LIMITS = { minSide: 64, maxSide: 8192, maxPixels: 40_000_000 } as const;

/** The real format of a file, from its first bytes. */
export function sniffImage(buf: Buffer): SanitizedMime | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

// ---- JPEG: keep the picture segments; drop APP1 (EXIF / XMP), APP3–APP15 and COM. APP0 (JFIF) and
// APP2 ICC profiles stay (they affect colours, carry nothing personal).
const SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
function jpeg(buf: Buffer): Omit<SanitizedImage, 'mime'> {
  const out: Buffer[] = [buf.subarray(0, 2)];
  const removed: string[] = [];
  let width = 0;
  let height = 0;
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new ImageRejected('badImage', 'Malformed JPEG');
    const marker = buf[i + 1];
    if (marker === 0xff) {
      i += 1; // fill byte
      continue;
    }
    if (marker === 0xd9) {
      out.push(buf.subarray(i, i + 2));
      break;
    }
    if (i + 4 > buf.length) throw new ImageRejected('badImage', 'Truncated JPEG');
    const len = buf.readUInt16BE(i + 2);
    if (len < 2 || i + 2 + len > buf.length) throw new ImageRejected('badImage', 'Truncated JPEG');
    const seg = buf.subarray(i, i + 2 + len);
    if (SOF.has(marker)) {
      height = buf.readUInt16BE(i + 5);
      width = buf.readUInt16BE(i + 7);
    }
    if (marker === 0xda) {
      // Start of scan: the compressed picture runs to the end — copied as is.
      out.push(buf.subarray(i));
      break;
    }
    const isIcc = marker === 0xe2 && seg.toString('latin1', 4, 15) === 'ICC_PROFILE';
    if (marker === 0xe1) removed.push(seg.toString('latin1', 4, 8) === 'Exif' ? 'EXIF' : 'XMP');
    else if ((marker >= 0xe3 && marker <= 0xef) || (marker === 0xe2 && !isIcc)) removed.push(`APP${marker - 0xe0}`);
    else if (marker === 0xfe) removed.push('COM');
    else out.push(seg);
    i += 2 + len;
  }
  if (!width || !height) throw new ImageRejected('badImage', 'JPEG without a frame header');
  return { buffer: Buffer.concat(out), width, height, removed };
}

// ---- PNG: keep the picture and colour chunks; drop text, EXIF, time and anything unknown-ancillary.
const PNG_KEEP = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'cHRM', 'sRGB', 'iCCP', 'sBIT', 'bKGD', 'pHYs']);
function png(buf: Buffer): Omit<SanitizedImage, 'mime'> {
  const out: Buffer[] = [buf.subarray(0, 8)];
  const removed: string[] = [];
  let width = 0;
  let height = 0;
  let i = 8;
  let ended = false;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (end > buf.length) throw new ImageRejected('badImage', 'Truncated PNG');
    if (type === 'IHDR') {
      width = buf.readUInt32BE(i + 8);
      height = buf.readUInt32BE(i + 12);
    }
    if (type === 'acTL') throw new ImageRejected('badType', 'Animated PNG is not supported');
    if (PNG_KEEP.has(type)) out.push(buf.subarray(i, end));
    else removed.push(type);
    i = end;
    if (type === 'IEND') {
      ended = true;
      break;
    }
  }
  if (!ended || !width || !height) throw new ImageRejected('badImage', 'Malformed PNG');
  return { buffer: Buffer.concat(out), width, height, removed };
}

// ---- WebP (RIFF): drop the EXIF and XMP chunks and clear their flags; refuse animation.
function webp(buf: Buffer): Omit<SanitizedImage, 'mime'> {
  const removed: string[] = [];
  const chunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let vp8x: Buffer | null = null;
  let i = 12;
  while (i + 8 <= buf.length) {
    const fourcc = buf.toString('latin1', i, i + 4);
    const size = buf.readUInt32LE(i + 4);
    const padded = size + (size & 1);
    const end = i + 8 + padded;
    if (i + 8 + size > buf.length) throw new ImageRejected('badImage', 'Truncated WebP');
    const chunk = Buffer.from(buf.subarray(i, Math.min(end, buf.length)));
    if (fourcc === 'ANIM' || fourcc === 'ANMF') throw new ImageRejected('badType', 'Animated WebP is not supported');
    if (fourcc === 'VP8X') {
      width = 1 + chunk.readUIntLE(12, 3);
      height = 1 + chunk.readUIntLE(15, 3);
      vp8x = chunk;
    } else if (fourcc === 'VP8 ' && !width) {
      // Frame header: 3-byte tag, start code 9d 01 2a, then 14-bit width and height.
      if (chunk.readUIntBE(11, 3) !== 0x9d012a) throw new ImageRejected('badImage', 'Malformed WebP');
      width = chunk.readUInt16LE(14) & 0x3fff;
      height = chunk.readUInt16LE(16) & 0x3fff;
    } else if (fourcc === 'VP8L' && !width) {
      if (chunk[8] !== 0x2f) throw new ImageRejected('badImage', 'Malformed WebP');
      const bits = chunk.readUInt32LE(9);
      width = 1 + (bits & 0x3fff);
      height = 1 + ((bits >> 14) & 0x3fff);
    }
    if (fourcc === 'EXIF' || fourcc === 'XMP ') removed.push(fourcc.trim());
    else chunks.push(chunk);
    i = end;
  }
  if (vp8x) vp8x[8] &= ~(0x08 | 0x04 | 0x02); // EXIF, XMP and animation flags off
  if (!width || !height) throw new ImageRejected('badImage', 'Malformed WebP');
  const body = Buffer.concat(chunks);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(4 + body.length, 4);
  header.write('WEBP', 8, 'latin1');
  return { buffer: Buffer.concat([header, body]), width, height, removed };
}

/**
 * The stored file for a food image: the real format (never the declared one), sane dimensions, no
 * metadata. `declaredMime` must agree with the bytes — a renamed file is refused, not "fixed".
 */
export function sanitizeFoodImage(buf: Buffer, declaredMime: string): SanitizedImage {
  const mime = sniffImage(buf);
  if (!mime) throw new ImageRejected('badType', 'Only JPEG, PNG or WebP photos can be used');
  const declared = declaredMime.toLowerCase().split(';')[0].trim().replace('image/jpg', 'image/jpeg');
  if (declared !== mime) throw new ImageRejected('badType', 'The file is not the type it claims to be');
  const parsed = mime === 'image/jpeg' ? jpeg(buf) : mime === 'image/png' ? png(buf) : webp(buf);
  const { width, height } = parsed;
  const { minSide, maxSide, maxPixels } = FOOD_IMAGE_LIMITS;
  if (width < minSide || height < minSide || width > maxSide || height > maxSide || width * height > maxPixels) {
    throw new ImageRejected('badDimensions', `Photos must be between ${minSide} and ${maxSide} pixels on each side`);
  }
  return { ...parsed, mime };
}

// ---- GIF (B4.2, exercise demonstrations only): keep the image data, the graphic-control blocks
// (frame timing) and the NETSCAPE / ANIMEXTS loop block; drop comments and every other
// application block (where XMP lives). The picture itself is never decoded or re-encoded.
const GIF_KEEP_APP = new Set(['NETSCAPE2.0', 'ANIMEXTS1.0']);
function gif(buf: Buffer): Omit<SanitizedImage, 'mime'> & { frames: number } {
  const sig = buf.toString('latin1', 0, 6);
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new ImageRejected('badType', 'Not a GIF');
  if (buf.length < 13) throw new ImageRejected('badImage', 'Truncated GIF');
  const width = buf.readUInt16LE(6);
  const height = buf.readUInt16LE(8);
  const packed = buf[10];
  let i = 13 + (packed & 0x80 ? 3 * (1 << ((packed & 0x07) + 1)) : 0);
  const out: Buffer[] = [buf.subarray(0, i)];
  const removed: string[] = [];
  let frames = 0;
  const subBlocks = (start: number): number => {
    let p = start;
    for (;;) {
      if (p >= buf.length) throw new ImageRejected('badImage', 'Truncated GIF');
      const n = buf[p];
      p += 1 + n;
      if (n === 0) return p;
    }
  };
  for (;;) {
    if (i >= buf.length) throw new ImageRejected('badImage', 'Truncated GIF');
    const b = buf[i];
    if (b === 0x3b) {
      out.push(buf.subarray(i, i + 1));
      break;
    }
    if (b === 0x2c) {
      // image descriptor (10) + optional local colour table + LZW minimum code size + data sub-blocks
      if (i + 10 > buf.length) throw new ImageRejected('badImage', 'Truncated GIF');
      const p = buf[i + 9];
      const start = i;
      i += 10 + (p & 0x80 ? 3 * (1 << ((p & 0x07) + 1)) : 0) + 1;
      i = subBlocks(i);
      out.push(buf.subarray(start, i));
      frames += 1;
      continue;
    }
    if (b === 0x21) {
      const label = buf[i + 1];
      const start = i;
      const end = subBlocks(i + 2);
      const appId = label === 0xff ? buf.toString('latin1', i + 3, i + 14) : '';
      if (label === 0xfe) removed.push('comment');
      else if (label === 0xff && !GIF_KEEP_APP.has(appId)) removed.push(`app:${appId.trim()}`);
      else out.push(buf.subarray(start, end));
      i = end;
      continue;
    }
    throw new ImageRejected('badImage', 'Malformed GIF');
  }
  if (!frames) throw new ImageRejected('badImage', 'A GIF with no picture');
  return { buffer: Buffer.concat(out), width, height, removed, frames };
}

export type DemoImageMime = SanitizedMime | 'image/gif';

/**
 * B4.2 — an exercise demonstration picture a coach uploads: a still (JPEG / PNG / WebP, cleaned as
 * a food photo) or an animated GIF (cleaned above). Same size limits; the type comes from the bytes.
 */
export function sanitizeDemoImage(buf: Buffer, declaredMime: string): Omit<SanitizedImage, 'mime'> & { mime: DemoImageMime } {
  const isGif = buf.length >= 6 && /^GIF8[79]a$/.test(buf.toString('latin1', 0, 6));
  if (!isGif) {
    try {
      return sanitizeFoodImage(buf, declaredMime);
    } catch (e) {
      if (e instanceof ImageRejected && e.code === 'badType' && !sniffImage(buf)) throw new ImageRejected('badType', 'Only JPEG, PNG, WebP or GIF pictures can be used');
      throw e;
    }
  }
  const declared = declaredMime.toLowerCase().split(';')[0].trim();
  if (declared !== 'image/gif') throw new ImageRejected('badType', 'The file is not the type it claims to be');
  const parsed = gif(buf);
  const { minSide, maxSide, maxPixels } = FOOD_IMAGE_LIMITS;
  if (parsed.width < minSide || parsed.height < minSide || parsed.width > maxSide || parsed.height > maxSide || parsed.width * parsed.height > maxPixels) {
    throw new ImageRejected('badDimensions', `Pictures must be between ${minSide} and ${maxSide} pixels on each side`);
  }
  return { buffer: parsed.buffer, mime: 'image/gif', width: parsed.width, height: parsed.height, removed: parsed.removed };
}
