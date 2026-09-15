import { create } from 'zustand';
import type { PhotoPose, ProgressPhoto } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { blobStore } from '@/data/blobStore';
import { recordDeletion } from '@/data/sync/tombstones';
import { today, uid } from '@/lib/utils';
import { downscaleImage } from '@/lib/image';
import { isBunnyConfigured, uploadImageToBunny } from '@/services/platform/bunnyUploadApi';
import { useSession } from '@/services/auth/sessionStore';

interface PhotoState {
  photos: ProgressPhoto[];
  loaded: boolean;
  load: () => Promise<void>;
  add: (pose: PhotoPose, file: Blob, opts?: { date?: string; weightKg?: number; note?: string }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  url: (photo: ProgressPhoto) => Promise<string | null>;
}

/**
 * Best-effort CDN upload so the coach / a second device can see the image.
 * Failures are swallowed by the caller — the local blob still works and
 * metadata syncs regardless. Shared by `add()` (fresh upload) and `load()`
 * (retries any photo a PRIOR session never got this far for — e.g. the app
 * was closed/backgrounded mid-upload — so a photo can't silently stay
 * local-only forever; see the retry pass in `load()` below).
 */
async function tryUploadToCdn(photo: ProgressPhoto, file: Blob): Promise<ProgressPhoto> {
  const owner = useSession.getState().uid;
  if (!isBunnyConfigured() || !owner || owner === 'local-user') return photo;
  const blob = await downscaleImage(file);
  const { url } = await uploadImageToBunny(blob, { folder: `Forma/${owner}` });
  const updated: ProgressPhoto = { ...photo, cdnUrl: url, updatedAt: Date.now(), dirty: true };
  await getDataSource().progressPhotos.put(updated);
  return updated;
}

export const usePhotos = create<PhotoState>((set, get) => ({
  photos: [],
  loaded: false,

  async load() {
    const photos = await getDataSource().progressPhotos.getAll();
    set({ photos: photos.sort((a, b) => b.date.localeCompare(a.date)), loaded: true });

    // Retry any photo a previous session never finished uploading to the CDN
    // (e.g. the app closed/lost connectivity mid-upload) — otherwise a photo
    // missing its cdnUrl would stay local-only-visible forever with no
    // indication anything was wrong.
    for (const photo of photos) {
      if (photo.cdnUrl) continue;
      void (async () => {
        try {
          const blob = await blobStore.get(photo.localKey);
          if (!blob) return;
          const updated = await tryUploadToCdn(photo, blob);
          if (updated.cdnUrl) set({ photos: get().photos.map((p) => (p.id === photo.id ? updated : p)) });
        } catch {
          /* still offline / still failing — next load() retries again */
        }
      })();
    }
  },

  async add(pose, file, opts) {
    const id = uid('photo');
    const localKey = `photo:${id}`;
    await blobStore.put(localKey, file);
    const photo: ProgressPhoto = {
      id,
      date: opts?.date ?? today(),
      pose,
      localKey,
      updatedAt: Date.now(),
      dirty: true,
    };
    // Only set optional fields when present (never store `undefined`).
    if (opts?.weightKg != null) photo.weightKg = opts.weightKg;
    if (opts?.note) photo.note = opts.note;
    await getDataSource().progressPhotos.put(photo);
    set({ photos: [photo, ...get().photos] });

    try {
      const updated = await tryUploadToCdn(photo, file);
      if (updated.cdnUrl) set({ photos: get().photos.map((p) => (p.id === id ? updated : p)) });
    } catch {
      /* offline / upload failed — keep local copy; load()'s retry pass will pick it up next launch */
    }
  },

  async remove(id) {
    const photo = get().photos.find((p) => p.id === id);
    if (photo) await blobStore.remove(photo.localKey);
    await getDataSource().progressPhotos.remove(id);
    await recordDeletion('progressPhotos', id);
    set({ photos: get().photos.filter((p) => p.id !== id) });
  },

  // Local blob first (instant + offline); fall back to the CDN URL for records
  // synced from another device or shown to the coach.
  async url(photo) {
    return (await blobStore.objectUrl(photo.localKey)) ?? photo.cdnUrl ?? null;
  },
}));
