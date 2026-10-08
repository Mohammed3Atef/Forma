import { create } from 'zustand';
import { mediaRef, type MediaRef } from '@/lib/mediaRef';

/**
 * The one full-screen media viewer (B1.11): any caller opens it with a set of
 * media refs + a start index. Replaces the separate image viewer and video
 * popup stores (same open/close/Esc/scroll-lock chrome, twice).
 */
interface MediaViewerState {
  items: MediaRef[];
  index: number;
  show: (items: MediaRef[], index?: number) => void;
  close: () => void;
  setIndex: (i: number) => void;
}

export const useMediaViewer = create<MediaViewerState>((set, get) => ({
  items: [],
  index: 0,
  show: (items, index = 0) => set({ items, index: Math.max(0, Math.min(index, items.length - 1)) }),
  close: () => set({ items: [], index: 0 }),
  setIndex: (i) => {
    const { items } = get();
    if (items.length === 0) return;
    set({ index: (i + items.length) % items.length });
  },
}));

/** Open the viewer on a single photo or a set (URLs or `local:` refs). */
export const viewImages = (photos: string | string[], index = 0) =>
  useMediaViewer.getState().show((Array.isArray(photos) ? photos : [photos]).map((p) => mediaRef(p, 'image')), index);

/** Play one video (YouTube or a direct file) in-app — never window.open, which kicks a standalone PWA out to the browser. */
export const playVideo = (url: string) => useMediaViewer.getState().show([mediaRef(url, 'video')]);

/** Open any media refs (e.g. a message attachment of any kind). */
export const viewMedia = (items: MediaRef | MediaRef[], index = 0) => useMediaViewer.getState().show(Array.isArray(items) ? items : [items], index);
