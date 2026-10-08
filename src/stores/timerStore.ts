import { create } from 'zustand';
import { HAPTIC, vibrate } from '@/lib/haptics';
import { readLive, writeLive } from '@/lib/liveState';

/**
 * Global rest-timer. A single timestamp (`endsAt`) drives a countdown so the
 * timer stays accurate across re-renders and tab backgrounding, and it is
 * persisted (B0 / PWA-07) so it also survives a reload or the OS killing the
 * app — `restore()` picks it back up. A 250ms tick updates `remainingSec`.
 */
interface TimerState {
  running: boolean;
  paused: boolean;
  totalSec: number;
  remainingSec: number;
  endsAt: number | null;
  pausedRemaining: number | null;
  intervalId: ReturnType<typeof setInterval> | null;

  startRest: (sec: number, opts?: { totalSec?: number }) => void;
  adjust: (deltaSec: number) => void;
  pause: () => void;
  resume: () => void;
  skip: () => void;
  reset: () => void;
  /** Resume a persisted timer after a reload (an expired one is dropped silently). */
  restore: () => void;
}

const persistRest = (s: Pick<TimerState, 'running' | 'endsAt' | 'totalSec' | 'pausedRemaining'>) =>
  writeLive({ rest: s.running ? { endsAt: s.endsAt, totalSec: s.totalSec, pausedRemaining: s.pausedRemaining } : null });

function playBeep(): void {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start();
    osc.stop(ctx.currentTime + 0.42);
  } catch {
    /* audio not available — vibration still fires */
  }
}

export const useTimer = create<TimerState>((set, get) => ({
  running: false,
  paused: false,
  totalSec: 0,
  remainingSec: 0,
  endsAt: null,
  pausedRemaining: null,
  intervalId: null,

  startRest(sec, opts) {
    const { intervalId } = get();
    if (intervalId) clearInterval(intervalId);
    // On pause→resume, keep the ORIGINAL total so progress rings and the
    // logged duration aren't reset to the remaining time.
    const totalSec = Math.max(opts?.totalSec ?? sec, sec);
    const endsAt = Date.now() + sec * 1000;
    const id = setInterval(() => {
      const s = get();
      if (!s.endsAt) return;
      const remaining = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
      if (remaining <= 0) {
        if (s.intervalId) clearInterval(s.intervalId);
        vibrate(HAPTIC.restDone);
        playBeep();
        set({ running: false, remainingSec: 0, endsAt: null, intervalId: null });
        persistRest(get());
      } else {
        set({ remainingSec: remaining });
      }
    }, 250);
    set({ running: true, paused: false, totalSec, remainingSec: sec, endsAt, intervalId: id, pausedRemaining: null });
    persistRest(get());
  },

  adjust(deltaSec) {
    const s = get();
    if (!s.running) return;
    if (s.paused) {
      const next = Math.max(0, (s.pausedRemaining ?? 0) + deltaSec);
      set({ pausedRemaining: next, remainingSec: next, totalSec: Math.max(s.totalSec, next) });
      persistRest(get());
      return;
    }
    if (!s.endsAt) return;
    const newEndsAt = s.endsAt + deltaSec * 1000;
    const remaining = Math.max(0, Math.round((newEndsAt - Date.now()) / 1000));
    set({ endsAt: newEndsAt, remainingSec: remaining, totalSec: Math.max(s.totalSec, remaining) });
    persistRest(get());
  },

  pause() {
    const s = get();
    if (!s.running || s.paused || !s.endsAt) return;
    const remaining = Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
    if (s.intervalId) clearInterval(s.intervalId);
    set({ paused: true, pausedRemaining: remaining, remainingSec: remaining, endsAt: null, intervalId: null });
    persistRest(get());
  },

  resume() {
    const s = get();
    if (!s.paused || s.pausedRemaining == null) return;
    get().startRest(s.pausedRemaining, { totalSec: s.totalSec });
  },

  skip() {
    const s = get();
    if (s.intervalId) clearInterval(s.intervalId);
    set({ running: false, paused: false, remainingSec: 0, endsAt: null, intervalId: null, pausedRemaining: null });
    persistRest(get());
  },

  reset() {
    const s = get();
    if (s.intervalId) clearInterval(s.intervalId);
    set({ running: false, paused: false, totalSec: 0, remainingSec: 0, endsAt: null, intervalId: null, pausedRemaining: null });
    persistRest(get());
  },

  restore() {
    const saved = readLive().rest;
    if (!saved || get().running) return;
    if (saved.pausedRemaining != null) {
      set({ running: true, paused: true, totalSec: saved.totalSec, pausedRemaining: saved.pausedRemaining, remainingSec: saved.pausedRemaining, endsAt: null, intervalId: null });
      return;
    }
    const remainingMs = (saved.endsAt ?? 0) - Date.now();
    if (remainingMs <= 0) {
      writeLive({ rest: null }); // finished while the app was closed — nothing to resume
      return;
    }
    get().startRest(Math.round(remainingMs / 1000), { totalSec: saved.totalSec });
  },
}));
