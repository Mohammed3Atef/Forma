import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/data/localScope', () => ({ currentLocalOwner: () => 'client-1' }));
vi.mock('@/data/dataSource', () => ({
  getDataSource: () => ({ cardioLogs: { getAll: async () => [] }, weightLogs: { getAll: async () => [] } }),
  cloudAvailable: () => true,
}));

import { useTimer } from './timerStore';
import { useCardio } from './cardioStore';
import { readLive } from '@/lib/liveState';

/** Simulates a reload / OS kill: every in-memory store is back to its initial state. */
function killApp() {
  const t = useTimer.getState();
  if (t.intervalId) clearInterval(t.intervalId);
  useTimer.setState({ running: false, paused: false, totalSec: 0, remainingSec: 0, endsAt: null, intervalId: null, pausedRemaining: null });
  useCardio.setState({ liveStart: null, liveParams: null });
}

beforeEach(() => {
  localStorage.clear();
  killApp();
});

describe('in-progress activity survives a reload / OS kill (PWA-07)', () => {
  it('a running rest timer resumes with the right remaining time', () => {
    useTimer.getState().startRest(90);
    expect(readLive().rest?.endsAt).toBeGreaterThan(Date.now());
    killApp();
    useTimer.getState().restore();
    const s = useTimer.getState();
    expect(s.running).toBe(true);
    expect(s.remainingSec).toBeGreaterThan(85);
    expect(s.totalSec).toBe(90);
  });

  it('a paused rest timer comes back paused', () => {
    useTimer.getState().startRest(60);
    useTimer.getState().pause();
    killApp();
    useTimer.getState().restore();
    expect(useTimer.getState()).toMatchObject({ running: true, paused: true });
    expect(useTimer.getState().pausedRemaining).toBeGreaterThan(55);
  });

  it('a rest timer that finished while the app was closed is dropped silently', () => {
    useTimer.getState().startRest(30);
    const rest = readLive().rest!;
    localStorage.setItem('forma.live.v1.client-1', JSON.stringify({ rest: { ...rest, endsAt: Date.now() - 1000 } }));
    killApp();
    useTimer.getState().restore();
    expect(useTimer.getState().running).toBe(false);
    expect(readLive().rest).toBeNull();
  });

  it('skipping clears the persisted timer', () => {
    useTimer.getState().startRest(30);
    useTimer.getState().skip();
    expect(readLive().rest).toBeNull();
  });

  it('a live cardio timer keeps its original start after a reload', async () => {
    useCardio.getState().startLive({ speedKmh: 8, inclinePct: 2 });
    const start = useCardio.getState().liveStart!;
    killApp();
    await useCardio.getState().load();
    expect(useCardio.getState().liveStart).toBe(start);
    expect(useCardio.getState().liveParams).toEqual({ speedKmh: 8, inclinePct: 2 });
    useCardio.getState().stopLive();
    killApp();
    await useCardio.getState().load();
    expect(useCardio.getState().liveStart).toBeNull();
  });

  it('a cardio timer forgotten for over 12 hours is not resumed', async () => {
    localStorage.setItem('forma.live.v1.client-1', JSON.stringify({ cardio: { start: Date.now() - 13 * 3600_000, params: null } }));
    await useCardio.getState().load();
    expect(useCardio.getState().liveStart).toBeNull();
  });
});
