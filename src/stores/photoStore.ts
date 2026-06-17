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

export const usePhotos = create<PhotoState>((set, get) => ({
  photos: [],
  loaded: false,

  async load() {
    const photos = await getDataSource().progressPhotos.getAll();
    set({ photos: photos.sort((a, b) => b.date.localeCompare(a.date)), loaded: true });
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

    // Best-effort CDN upload so the coach / a second device can see the image.
    // Failures are swallowed — the local blob still works and metadata syncs.
    const owner = useSession.getState().uid;
    if (isBunnyConfigured() && owner && owner !== 'local-user') {
      try {
        const blob = await downscaleImage(file);
        const { url } = await uploadImageToBunny(blob, { folder: `Forma/${owner}` });
        const updated: ProgressPhoto = { ...photo, cdnUrl: url, updatedAt: Date.now(), dirty: true };
        await getDataSource().progressPhotos.put(updated);
        set({ photos: get().photos.map((p) => (p.id === id ? updated : p)) });
      } catch {
        /* offline / upload failed — keep local copy */
      }
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
