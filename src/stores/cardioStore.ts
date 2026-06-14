import { create } from 'zustand';
import type { CardioLog, CardioType, WeightLog } from '@/types';
import { getDataSource } from '@/data/dataSource';
import { uid } from '@/lib/utils';
import { notifyHabitChange } from './habitStore';
import { useDay } from './dayStore';
import { recordDeletion } from '@/data/sync/tombstones';

interface CardioState {
  cardioLogs: CardioLog[];
  weightLogs: WeightLog[];
  loaded: boolean;
  /** Live cardio timer start (epoch ms) — in memory so navigation doesn't lose it. */
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
  addSteps: (steps: number, date?: string) => Promise<void>;
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
    set({ liveStart: Date.now(), liveParams: params ?? null });
  },

  stopLive() {
    set({ liveStart: null, liveParams: null });
  },

  async load() {
    const ds = getDataSource();
    const [cardioLogs, weightLogs] = await Promise.all([
      ds.cardioLogs.getAll(),
      ds.weightLogs.getAll(),
    ]);
    set({
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

  async addSteps(steps, date = useDay.getState().selected) {
    // Steps are stored as a cardio log entry of type 'walking' with no duration.
    const log: CardioLog = {
      id: uid('steps'),
      date,
      type: 'walking',
      durationSec: 0,
      distanceKm: null,
      caloriesBurned: null,
      steps,
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
    const log: WeightLog = { id: date, date, weightKg, updatedAt: Date.now(), dirty: true };
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
