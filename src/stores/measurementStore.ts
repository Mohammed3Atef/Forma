import { create } from 'zustand';
import type { MeasurementLog } from '@/types';
import { getDataSource } from '@/data/dataSource';

interface MeasurementState {
  logs: MeasurementLog[];
  loaded: boolean;
  load: () => Promise<void>;
  /** Upsert the measurements for a given day (id == date). */
  save: (date: string, values: Record<string, number>) => Promise<void>;
  forDate: (date: string) => MeasurementLog | null;
}

export const useMeasurements = create<MeasurementState>((set, get) => ({
  logs: [],
  loaded: false,

  async load() {
    const logs = await getDataSource().measurementLogs.getAll();
    set({ logs: logs.sort((a, b) => a.date.localeCompare(b.date)), loaded: true });
  },

  async save(date, values) {
    // Drop empty fields so a measurement isn't stored as 0.
    const clean: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) {
      if (typeof v === 'number' && !Number.isNaN(v) && v > 0) clean[k] = v;
    }
    // Merge over the existing entry so keys not in `values` (e.g. custom parts) survive.
    const existing = get().logs.find((l) => l.id === date);
    const log: MeasurementLog = {
      id: date,
      date,
      values: { ...existing?.values, ...clean },
      updatedAt: Date.now(),
      dirty: true,
    };
    await getDataSource().measurementLogs.put(log);
    const others = get().logs.filter((l) => l.id !== date);
    set({ logs: [...others, log].sort((a, b) => a.date.localeCompare(b.date)) });
  },

  forDate(date) {
    return get().logs.find((l) => l.id === date) ?? null;
  },
}));
