import { create } from 'zustand';

/**
 * Outcome of the last attempt to mirror coach-assigned content (plans,
 * targets, profile) into the client's local store (`loadCoachAssignedContent`).
 * That sync deliberately degrades to the last local copy on failure — but a
 * client on a FRESH device has no local copy, and the screens then said
 * "Waiting for your coach to assign your plan" even though a plan exists.
 * This lets them tell "really nothing yet" apart from "couldn't load".
 */
interface CoachContentState {
  status: 'idle' | 'ok' | 'failed';
  /** Re-runs the same refresh ClientGate runs on mount/focus (registered by it). */
  retry: (() => void) | null;
  setStatus: (s: 'ok' | 'failed') => void;
  setRetry: (fn: (() => void) | null) => void;
}

export const useCoachContentSync = create<CoachContentState>((set) => ({
  status: 'idle',
  retry: null,
  setStatus: (status) => set({ status }),
  setRetry: (retry) => set({ retry }),
}));
