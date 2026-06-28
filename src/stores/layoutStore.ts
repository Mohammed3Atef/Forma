import { create } from 'zustand';

/**
 * Cross-cutting layout flags read by the shell. `fullBleed` lets a data-dense
 * Coach/Admin page (dashboards, analytics, reports, tables, plan builder,
 * messages split) drop the default `max-w-screen-2xl` content cap and use the
 * full viewport width. Pages opt in via the `useFullBleed()` hook.
 */
interface LayoutState {
  fullBleed: boolean;
  setFullBleed: (v: boolean) => void;
}

export const useLayoutStore = create<LayoutState>((set) => ({
  fullBleed: false,
  setFullBleed: (v) => set({ fullBleed: v }),
}));
