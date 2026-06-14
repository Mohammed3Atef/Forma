import { create } from 'zustand';
import type { VideoAsset } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { detectKind } from '@/services/video/VideoStore';
import { videoStore as store } from '@/services/video/CacheVideoStore';

interface VideoState {
  assets: VideoAsset[];
  progress: Record<string, number>;
  loaded: boolean;
  load: () => Promise<void>;
  byExercise: (exerciseId: string) => VideoAsset | null;
  setUrl: (id: string, url: string) => Promise<void>;
  download: (id: string) => Promise<void>;
  downloadAll: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  downloadingAll: boolean;
  playableUrl: (asset: VideoAsset) => Promise<string | null>;
}

export const useVideos = create<VideoState>((set, get) => ({
  assets: [],
  progress: {},
  loaded: false,
  downloadingAll: false,

  async load() {
    const assets = await getDataSource().videoAssets.getAll();
    set({ assets, loaded: true });
  },

  byExercise(exerciseId) {
    return get().assets.find((a) => a.exerciseId === exerciseId) ?? null;
  },

  async setUrl(id, url) {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset) return;
    const kind = detectKind(url);
    const next: VideoAsset = {
      ...asset,
      sourceUrl: url,
      kind,
      status: 'not-downloaded',
      userEdited: true, // protects the pasted link from seed-version upgrades
      updatedAt: Date.now(),
    };
    await getDataSource().videoAssets.put(next);
    set({ assets: get().assets.map((a) => (a.id === id ? next : a)) });
  },

  async download(id) {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset || asset.status === 'downloading') return; // already in flight
    const downloading: VideoAsset = { ...asset, status: 'downloading' };
    set({
      assets: get().assets.map((a) => (a.id === id ? downloading : a)),
      progress: { ...get().progress, [id]: 0 },
    });
    const result = await store.download(asset, (pct) =>
      set({ progress: { ...get().progress, [id]: pct } }),
    );
    await getDataSource().videoAssets.put(result);
    // Drop the finished progress entry so the map doesn't grow forever.
    const progress = { ...get().progress };
    delete progress[id];
    set({ assets: get().assets.map((a) => (a.id === id ? result : a)), progress });
  },

  async downloadAll() {
    if (get().downloadingAll) return;
    set({ downloadingAll: true });
    try {
      const targets = get().assets.filter((a) => a.kind === 'file' && a.status !== 'downloaded');
      for (const a of targets) {
        await get().download(a.id);
      }
    } finally {
      set({ downloadingAll: false });
    }
  },

  async remove(id) {
    const asset = get().assets.find((a) => a.id === id);
    if (!asset) return;
    const result = await store.remove(asset);
    await getDataSource().videoAssets.put(result);
    set({ assets: get().assets.map((a) => (a.id === id ? result : a)) });
  },

  playableUrl(asset) {
    return store.getPlayableUrl(asset);
  },
}));
