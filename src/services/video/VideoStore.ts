import type { VideoAsset, VideoKind } from '@/types';

/**
 * Storage-agnostic contract for offline video. Swap the implementation
 * (Cache API today, Firebase Storage later) without touching the UI.
 */
export interface IVideoStore {
  /** Download and persist the asset's video for offline playback. */
  download(asset: VideoAsset, onProgress?: (pct: number) => void): Promise<VideoAsset>;
  /** Resolve a playable URL: local object URL if downloaded, else the source URL. */
  getPlayableUrl(asset: VideoAsset): Promise<string | null>;
  /** Remove the locally stored copy. */
  remove(asset: VideoAsset): Promise<VideoAsset>;
}

/** Detect how a URL can be handled. */
export function detectKind(url: string | null): VideoKind {
  if (!url) return 'unknown';
  const u = url.toLowerCase();
  if (u.includes('youtube.com') || u.includes('youtu.be')) return 'youtube';
  if (/\.(mp4|webm|mov|m4v|ogg)(\?|$)/.test(u)) return 'file';
  return 'unknown';
}

/** YouTube watch/share/shorts URL -> embeddable URL (for online playback). */
export function youtubeEmbed(url: string): string | null {
  const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/|live\/)([\w-]{11})/);
  return m ? `https://www.youtube.com/embed/${m[1]}` : null;
}
