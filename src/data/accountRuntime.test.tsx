import { describe, expect, it, vi } from 'vitest';

// Everything the runtime opens is stubbed — this test is about what it LEAVES behind.
vi.mock('./localScope', () => ({ openAccountScope: async () => {}, closeAccountScope: () => {}, currentLocalOwner: () => null }));
vi.mock('./bootstrap', () => ({ bootstrapData: async () => {} }));
const { loader } = vi.hoisted(() => ({
  loader: () => ({ getState: () => ({ load: async () => {}, refresh: async () => {}, start: () => {}, stop: () => {}, restore: () => {} }), setState: () => {} }),
}));
vi.mock('@/stores/settingsStore', () => ({ useSettings: loader() }));
vi.mock('@/stores/workoutStore', () => ({ useWorkout: loader(), flushWorkoutWrites: async () => {} }));
vi.mock('@/stores/nutritionStore', () => ({ useNutrition: loader() }));
vi.mock('@/stores/cardioStore', () => ({ useCardio: loader() }));
vi.mock('@/stores/habitStore', () => ({ useHabits: loader() }));
vi.mock('@/stores/measurementStore', () => ({ useMeasurements: loader() }));
vi.mock('@/services/reminders/reminderStore', () => ({ useReminders: loader() }));
vi.mock('@/stores/timerStore', () => ({ useTimer: { getState: () => ({ intervalId: null, restore: () => {} }), setState: () => {} } }));
vi.mock('@/services/auth/cloudStore', () => ({ useCloud: { getState: () => ({ start: () => {}, stop: async () => {} }) } }));
vi.mock('@/stores/photoStore', async () => ({
  usePhotos: (await import('zustand')).create<{ photos: { id: string; cdnUrl?: string }[]; loaded: boolean }>(() => ({ photos: [], loaded: false })),
}));

import { syncLocalRuntime } from './accountRuntime';
import { usePhotos } from '@/stores/photoStore';

describe('account switch leaves nothing of the previous account in memory (PWA-14)', () => {
  it("B never inherits A's loaded progress photos", async () => {
    await syncLocalRuntime('client-a', 'client');
    usePhotos.setState({ photos: [{ id: 'p1', date: '2026-10-01', pose: 'front', localKey: 'photo:p1', updatedAt: 1, dirty: false, cdnUrl: 'https://cdn.example/a.jpg' }], loaded: true });

    await syncLocalRuntime('client-b', 'client');

    expect(usePhotos.getState().photos).toEqual([]);
    expect(usePhotos.getState().loaded).toBe(false); // the photos screen reloads from B's own database
  });
});
