import { create } from 'zustand';

/** Open/close state for the global command palette (⌘K / Ctrl+K). */
interface CommandState {
  open: boolean;
  show: () => void;
  hide: () => void;
  toggle: () => void;
}

export const useCommandStore = create<CommandState>((set) => ({
  open: false,
  show: () => set({ open: true }),
  hide: () => set({ open: false }),
  toggle: () => set((s) => ({ open: !s.open })),
}));
