import type { VideoAsset } from '@/types';
import { blobStore } from '@/data/blobStore';
import { detectKind, type IVideoStore } from './VideoStore';

/**
 * Default video store: downloads direct video files (.mp4/.webm/…) into
 * IndexedDB via the blob store, and serves them as object URLs for offline
 * playback. Non-file sources (YouTube/unknown) can't be saved offline and keep
 * their online link with a graceful fallback in the UI.
 */
export class CacheVideoStore implements IVideoStore {
  async download(asset: VideoAsset, onProgress?: (pct: number) => void): Promise<VideoAsset> {
    if (!asset.sourceUrl) {
      return { ...asset, status: 'link-pending', updatedAt: Date.now() };
    }
    const kind = detectKind(asset.sourceUrl);
    if (kind !== 'file') {
      // Can't download — keep the online link, mark as not-downloaded.
      return { ...asset, kind, status: 'not-downloaded', updatedAt: Date.now() };
    }

    try {
      const res = await fetch(asset.sourceUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // Stream with progress when Content-Length is known.
      const total = Number(res.headers.get('Content-Length') ?? 0);
      let blob: Blob;
      if (res.body && total > 0 && onProgress) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            onProgress(Math.round((received / total) * 100));
          }
        }
        blob = new Blob(chunks as BlobPart[]);
      } else {
        blob = await res.blob();
      }

      const localKey = `video:${asset.id}`;
      await blobStore.put(localKey, blob);
      return {
        ...asset,
        kind: 'file',
        status: 'downloaded',
        localKey,
        sizeBytes: blob.size,
        updatedAt: Date.now(),
      };
    } catch {
      return { ...asset, kind, status: 'failed', updatedAt: Date.now() };
    }
  }

  async getPlayableUrl(asset: VideoAsset): Promise<string | null> {
    if (asset.status === 'downloaded' && asset.localKey) {
      const url = await blobStore.objectUrl(asset.localKey);
      if (url) return url;
    }
    return asset.sourceUrl;
  }

  async remove(asset: VideoAsset): Promise<VideoAsset> {
    if (asset.localKey) await blobStore.remove(asset.localKey);
    return {
      ...asset,
      status: asset.sourceUrl ? 'not-downloaded' : 'link-pending',
      localKey: undefined,
      sizeBytes: undefined,
      updatedAt: Date.now(),
    };
  }
}

export const videoStore: IVideoStore = new CacheVideoStore();
