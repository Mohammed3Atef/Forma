import { create } from 'zustand';

/** Global full-screen image viewer: any caller opens it with a photo set + start index. */
interface ImageViewerState {
  open: boolean;
  photos: string[];
  index: number;
  show: (photos: string[], index?: number) => void;
  close: () => void;
  setIndex: (i: number) => void;
}

export const useImageViewer = create<ImageViewerState>((set, get) => ({
  open: false,
  photos: [],
  index: 0,
  show: (photos, index = 0) => set({ open: photos.length > 0, photos, index: Math.max(0, Math.min(index, photos.length - 1)) }),
  close: () => set({ open: false, photos: [], index: 0 }),
  setIndex: (i) => {
    const { photos } = get();
    if (photos.length === 0) return;
    set({ index: (i + photos.length) % photos.length });
  },
}));

/** Convenience: open the viewer on a single photo or a set. */
export const viewImages = (photos: string | string[], index = 0) =>
  useImageViewer.getState().show(Array.isArray(photos) ? photos : [photos], index);
