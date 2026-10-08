import { create } from 'zustand';
import type { PhotoPose, ProgressPhoto } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { blobStore } from '@/data/blobStore';
import { recordDeletion } from '@/data/sync/tombstones';
import { today, uid } from '@/lib/utils';
import { discardOutbox, onOutboxAck, useOutbox, waitForFirstAttempt } from '@/data/outbox/outbox';
import { queueProgressPhotoUpload } from '@/data/outbox/handlers';

interface PhotoState {
  photos: ProgressPhoto[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Resolves `uploaded: true` only once the server acknowledged the upload (B0 — never a false "uploaded"). */
  add: (pose: PhotoPose, file: Blob, opts?: { date?: string; weightKg?: number; note?: string }) => Promise<{ uploaded: boolean }>;
  remove: (id: string) => Promise<void>;
  url: (photo: ProgressPhoto) => Promise<string | null>;
}

/**
 * The upload to the coach-visible store goes through the durable outbox
 * (B1.6 / CL-34): the bytes stay on this device, the upload retries on its own
 * (reconnect, foreground, backoff) and the photo's `cdnUrl` is set only from
 * the server's answer. Before B1 a failed upload was retried only at the next
 * app launch.
 */
const uploadOpFor = (photoId: string) => useOutbox.getState().ops.find((o) => o.dedupeKey === `photo:${photoId}` && o.status !== 'acknowledged');

export const usePhotos = create<PhotoState>((set, get) => ({
  photos: [],
  loaded: false,

  async load() {
    const photos = await getDataSource().progressPhotos.getAll();
    set({ photos: photos.sort((a, b) => b.date.localeCompare(a.date)), loaded: true });
    // A photo saved before the outbox existed (or whose op was lost) gets an upload op.
    for (const photo of photos) {
      if (photo.cdnUrl || uploadOpFor(photo.id)) continue;
      if (!(await blobStore.has(photo.localKey))) continue; // synced from another device — nothing to upload here
      void queueProgressPhotoUpload(photo.id).catch(() => undefined);
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

    // "Uploaded" only on the server's acknowledgement (B0 honesty rule); otherwise
    // it stays queued on this device and the outbox keeps trying.
    try {
      const op = await queueProgressPhotoUpload(id);
      const settled = await waitForFirstAttempt(op.operationId, 30_000);
      return { uploaded: settled?.status === 'acknowledged' };
    } catch {
      return { uploaded: false };
    }
  },

  async remove(id) {
    const pendingUpload = uploadOpFor(id);
    if (pendingUpload) await discardOutbox(pendingUpload.operationId);
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

// When the outbox delivers a photo, show its server URL (the record itself was
// updated by the upload handler and syncs to the coach).
onOutboxAck((op) => {
  if (op.type !== 'progressPhoto.upload') return;
  const photoId = (op.payload as { photoId: string }).photoId;
  void getDataSource()
    .progressPhotos.get(photoId)
    .then((fresh) => {
      if (fresh) usePhotos.setState({ photos: usePhotos.getState().photos.map((p) => (p.id === photoId ? fresh : p)) });
    })
    .catch(() => undefined);
});
