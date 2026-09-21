import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Desktop-only preference: collapse the Coach/Admin left sidebar to an
 * icon-only rail. Purely a local UI preference — `localStorage` via
 * zustand's `persist` is enough, no backend storage needed. Never read below
 * the `lg` breakpoint (1024px); the tablet tier (`md`–`lg`) already renders
 * icon-only unconditionally and is unaffected by this preference.
 */
interface SidebarState {
  collapsed: boolean;
  toggle: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      collapsed: false,
      toggle: () => set((s) => ({ collapsed: !s.collapsed })),
    }),
    { name: 'forma.sidebarCollapsed' },
  ),
);
