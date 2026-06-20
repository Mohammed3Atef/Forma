import { create } from 'zustand';

/** Global in-app video popup: any caller opens it with a video URL (YouTube or
 * a direct file). Avoids window.open, which kicks a standalone PWA out to an
 * external browser. */
interface VideoPopupState {
  url: string | null;
  show: (url: string) => void;
  close: () => void;
}

export const useVideoPopup = create<VideoPopupState>((set) => ({
  url: null,
  show: (url) => set({ url }),
  close: () => set({ url: null }),
}));

/** Convenience: open the player on a single video URL. */
export const playVideo = (url: string) => useVideoPopup.getState().show(url);
