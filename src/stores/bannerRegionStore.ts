import { useEffect } from 'react';
import { create } from 'zustand';

/**
 * One banner region per shell (B1.4 / VS-11). Shell-level notices register a
 * priority while they have something to say; the region shows only the most
 * important one, and a "+N more" control expands the rest — so notices never
 * stack above content, yet none becomes unreachable. The offline strip and
 * the update pill are global overlays, not region banners (B0).
 */
export const BANNER_PRIORITY = {
  /** Local and server copies of a record disagree — the user must decide (B0 / PWA-06). */
  syncConflict: 100,
  /** Coach access lapsed (trial ended / expired / suspended). */
  coachPlanLapsed: 90,
  /** Client subscription is read-only. */
  subscription: 90,
  coachOverCapacity: 70,
  coachPlanEnding: 60,
  /** A reminder is due (the in-app fallback for OS notifications). */
  reminder: 50,
  coachPlanRequest: 40,
  /** Admin-authored announcements. */
  announcement: 10,
} as const;

interface Slot {
  id: string;
  priority: number;
  seq: number;
}

interface RegionState {
  slots: Slot[];
  expanded: boolean;
  toggle: () => void;
}

export const useBannerRegion = create<RegionState>((set) => ({
  slots: [],
  expanded: false,
  toggle: () => set((s) => ({ expanded: !s.expanded })),
}));

let seq = 0;
function setSlot(id: string, priority: number, active: boolean): void {
  useBannerRegion.setState((s) => {
    const others = s.slots.filter((x) => x.id !== id);
    const slots = active ? [...others, { id, priority, seq: s.slots.find((x) => x.id === id)?.seq ?? ++seq }] : others;
    return { slots, expanded: slots.length > 1 ? s.expanded : false };
  });
}

/** The slot shown when collapsed: highest priority, earliest registered on a tie. */
export function topSlot(slots: Slot[]): Slot | undefined {
  return [...slots].sort((a, b) => b.priority - a.priority || a.seq - b.seq)[0];
}

/**
 * Register a notice in the shell's region. Returns whether to render it now:
 * only the top notice while collapsed, every active one once expanded.
 */
export function useBannerSlot(id: string, priority: number, active: boolean): boolean {
  useEffect(() => {
    setSlot(id, priority, active);
  }, [id, priority, active]);
  useEffect(() => () => setSlot(id, priority, false), [id, priority]);
  return useBannerRegion((s) => active && s.slots.some((x) => x.id === id) && (s.expanded || topSlot(s.slots)?.id === id));
}
