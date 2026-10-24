/**
 * B4.1 — a coach's food photo, prepared on the device before it is sent: decoded (camera
 * orientation applied), scaled down to at most 1600 px plus a square thumbnail of at most 320 px
 * (never enlarged), and
 * re-encoded (WebP, or JPEG where the browser cannot encode WebP). Re-encoding drops every bit of
 * metadata (EXIF GPS position, camera, author) before anything leaves the phone; the server still
 * checks the bytes and strips metadata again — the device is never trusted.
 */
export const FOOD_PHOTO_MAX_INPUT_BYTES = 15 * 1024 * 1024;
const FULL_MAX = 1600;
const THUMB = 320;

export class FoodPhotoError extends Error {
  constructor(public readonly code: 'notImage' | 'tooLarge' | 'tooSmall' | 'unreadable') {
    super(code);
    this.name = 'FoodPhotoError';
  }
}

export interface PreparedFoodPhoto {
  full: Blob;
  thumb: Blob;
  width: number;
  height: number;
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (webp) => {
        // Safari returns PNG when it cannot encode WebP: use JPEG there instead.
        if (webp && webp.type === 'image/webp') return resolve(webp);
        canvas.toBlob((jpg) => (jpg ? resolve(jpg) : reject(new FoodPhotoError('unreadable'))), 'image/jpeg', 0.85);
      },
      'image/webp',
      quality,
    );
  });
}

export async function prepareFoodPhoto(file: Blob): Promise<PreparedFoodPhoto> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) throw new FoodPhotoError('notImage');
  if (file.size > FOOD_PHOTO_MAX_INPUT_BYTES) throw new FoodPhotoError('tooLarge');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new FoodPhotoError('unreadable');
  }
  try {
    if (bitmap.width < 64 || bitmap.height < 64) throw new FoodPhotoError('tooSmall');
    const scale = Math.min(1, FULL_MAX / Math.max(bitmap.width, bitmap.height));
    const full = document.createElement('canvas');
    full.width = Math.round(bitmap.width * scale);
    full.height = Math.round(bitmap.height * scale);
    full.getContext('2d')!.drawImage(bitmap, 0, 0, full.width, full.height);
    const side = Math.min(bitmap.width, bitmap.height);
    const edge = Math.min(THUMB, side);
    const thumb = document.createElement('canvas');
    thumb.width = edge;
    thumb.height = edge;
    thumb.getContext('2d')!.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, edge, edge);
    return { full: await toBlob(full, 0.82), thumb: await toBlob(thumb, 0.75), width: full.width, height: full.height };
  } finally {
    bitmap.close();
  }
}
