import { create } from 'zustand';
import type { CardioLog, CardioType, WeightLog } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { uid } from '@/lib/utils';
import { notifyHabitChange } from './habitStore';
import { useDay } from './dayStore';
import { recordDeletion } from '@/data/sync/tombstones';
import { LIVE_MAX_AGE_MS, readLive, writeLive } from '@/lib/liveState';

interface CardioState {
  cardioLogs: CardioLog[];
  weightLogs: WeightLog[];
  loaded: boolean;
  /** Live cardio timer start (epoch ms) — persisted (B0 / PWA-07) so a reload / OS kill doesn't lose it. */
  liveStart: number | null;
  /** Speed/incline entered before starting — drives live distance/kcal estimates. */
  liveParams: { speedKmh: number; inclinePct: number } | null;
  startLive: (params?: { speedKmh: number; inclinePct: number }) => void;
  stopLive: () => void;
  load: () => Promise<void>;
  addCardio: (input: {
    type: CardioType;
    durationSec: number;
    distanceKm?: number | null;
    caloriesBurned?: number | null;
    steps?: number | null;
    date?: string;
  }) => Promise<void>;
  removeCardio: (id: string) => Promise<void>;
  logWeight: (weightKg: number, date?: string) => Promise<void>;
  stepsFor: (date: string) => number;
  cardioSecFor: (date: string) => number;
  latestWeight: () => number | null;
}

export const useCardio = create<CardioState>((set, get) => ({
  cardioLogs: [],
  weightLogs: [],
  loaded: false,
  liveStart: null,
  liveParams: null,

  startLive(params) {
    const start = Date.now();
    writeLive({ cardio: { start, params: params ?? null } });
    set({ liveStart: start, liveParams: params ?? null });
  },

  stopLive() {
    writeLive({ cardio: null });
    set({ liveStart: null, liveParams: null });
  },

  async load() {
    const ds = getDataSource();
    const [cardioLogs, weightLogs] = await Promise.all([
      ds.cardioLogs.getAll(),
      ds.weightLogs.getAll(),
    ]);
    // Resume a live timer that was running when the app was reloaded / killed.
    const live = readLive().cardio;
    const resumable = live && Date.now() - live.start < LIVE_MAX_AGE_MS ? live : null;
    if (live && !resumable) writeLive({ cardio: null });
    set({
      liveStart: resumable?.start ?? null,
      liveParams: resumable?.params ?? null,
      cardioLogs: cardioLogs.sort((a, b) => b.date.localeCompare(a.date)),
      weightLogs: weightLogs.sort((a, b) => a.date.localeCompare(b.date)),
      loaded: true,
    });
  },

  async addCardio(input) {
    const date = input.date ?? useDay.getState().selected;
    const log: CardioLog = {
      id: uid('cardio'),
      date,
      type: input.type,
      durationSec: input.durationSec,
      distanceKm: input.distanceKm ?? null,
      caloriesBurned: input.caloriesBurned ?? null,
      steps: input.steps ?? null,
      updatedAt: Date.now(),
      dirty: true,
    };
    await getDataSource().cardioLogs.put(log);
    set({ cardioLogs: [log, ...get().cardioLogs] });
    notifyHabitChange();
  },

  async removeCardio(id) {
    await getDataSource().cardioLogs.remove(id);
    await recordDeletion('cardioLogs', id);
    set({ cardioLogs: get().cardioLogs.filter((c) => c.id !== id) });
    notifyHabitChange();
  },

  async logWeight(weightKg, date = useDay.getState().selected) {
    // Keep the server revision this day is based on (B0 / PWA-06) — a fresh
    // object would look like a brand-new record and conflict with itself.
    const prevRev = get().weightLogs.find((w) => w.id === date)?._rev ?? (await getDataSource().weightLogs.get(date))?._rev;
    const log: WeightLog = { id: date, date, weightKg, updatedAt: Date.now(), dirty: true, ...(prevRev != null ? { _rev: prevRev } : {}) };
    await getDataSource().weightLogs.put(log);
    const others = get().weightLogs.filter((w) => w.id !== date);
    set({ weightLogs: [...others, log].sort((a, b) => a.date.localeCompare(b.date)) });
  },

  stepsFor(date) {
    return get()
      .cardioLogs.filter((c) => c.date === date)
      .reduce((a, c) => a + (c.steps ?? 0), 0);
  },

  cardioSecFor(date) {
    return get()
      .cardioLogs.filter((c) => c.date === date)
      .reduce((a, c) => a + c.durationSec, 0);
  },

  latestWeight() {
    const w = get().weightLogs;
    return w.length ? w[w.length - 1].weightKg : null;
  },
}));
