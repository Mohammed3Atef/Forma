import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { WorkoutPlan } from '@/types';

// In-memory localforage (drafts) — jsdom has no IndexedDB.
vi.mock('localforage', () => {
  const stores = new Map<string, Map<string, unknown>>();
  const make = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      getItem: async (k: string) => (m.has(k) ? m.get(k) : null),
      setItem: async (k: string, v: unknown) => void m.set(k, v),
      removeItem: async (k: string) => void m.delete(k),
      keys: async () => [...m.keys()],
      clear: async () => m.clear(),
    };
  };
  return { default: { createInstance: (o: { name: string; storeName: string }) => make(`${o.name}/${o.storeName}`) } };
});

const getClientWorkoutPlan = vi.fn();
const saveClientWorkoutPlan = vi.fn();
vi.mock('@/services/platform/planApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/planApi')>()),
  getClientWorkoutPlan: (id: string) => getClientWorkoutPlan(id),
  saveClientWorkoutPlan: (id: string, p: WorkoutPlan, o: unknown) => saveClientWorkoutPlan(id, p, o),
}));
vi.mock('@/components/coach/ClientContextPanel', () => ({ ClientContextPanel: () => null }));

import { CoachWorkoutEditor } from './CoachWorkoutEditor';

const serverPlan: WorkoutPlan = { id: 'wp1', name: '4-Day Upper/Lower', days: [], exercises: {}, updatedAt: 1000 };

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/coach/client/c1/workout']}>
        <Routes>
          <Route path="/coach/client/:clientId/workout" element={<CoachWorkoutEditor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  getClientWorkoutPlan.mockReset();
  saveClientWorkoutPlan.mockReset();
});

describe('Coach workout editor — load safety (CO-01)', () => {
  it('a failed load shows an error with Retry and never an editable empty plan', async () => {
    getClientWorkoutPlan.mockRejectedValueOnce(new Error('network'));
    renderEditor();
    expect(await screen.findByTestId('plan-editor-error')).toBeInTheDocument();
    expect(screen.queryByTestId('workout-plan-name')).toBeNull();
    expect(screen.queryByTestId('workout-save')).toBeNull();

    getClientWorkoutPlan.mockResolvedValueOnce(serverPlan);
    fireEvent.click(screen.getByTestId('plan-editor-retry'));
    expect(await screen.findByDisplayValue('4-Day Upper/Lower')).toBeInTheDocument();

    saveClientWorkoutPlan.mockResolvedValueOnce({ ...serverPlan, updatedAt: 2000 });
    fireEvent.change(screen.getByTestId('workout-plan-name'), { target: { value: 'Block 2' } });
    fireEvent.click(screen.getByTestId('workout-save'));
    await waitFor(() => expect(saveClientWorkoutPlan).toHaveBeenCalledTimes(1));
    expect(saveClientWorkoutPlan.mock.calls[0][2]).toMatchObject({ baseUpdatedAt: 1000 });
  });

  it('"no plan yet" is its own state; creating is deliberate and saves as a create', async () => {
    getClientWorkoutPlan.mockResolvedValueOnce(null);
    renderEditor();
    expect(await screen.findByTestId('plan-editor-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('workout-save')).toBeNull();
    fireEvent.click(screen.getByTestId('plan-editor-create'));
    const save = await screen.findByTestId('workout-save');
    expect(save).toBeDisabled(); // a plan needs a name first
    fireEvent.change(screen.getByTestId('workout-plan-name'), { target: { value: 'New plan' } });
    saveClientWorkoutPlan.mockResolvedValueOnce({ ...serverPlan, name: 'New plan', updatedAt: 3000 });
    fireEvent.click(screen.getByTestId('workout-save'));
    await waitFor(() => expect(saveClientWorkoutPlan).toHaveBeenCalledTimes(1));
    expect(saveClientWorkoutPlan.mock.calls[0][2]).toMatchObject({ baseUpdatedAt: null });
  });

  it('a stale save shows the conflict state and keeps the edits', async () => {
    getClientWorkoutPlan.mockResolvedValueOnce(serverPlan);
    renderEditor();
    const name = await screen.findByTestId('workout-plan-name');
    fireEvent.change(name, { target: { value: 'My edit' } });
    saveClientWorkoutPlan.mockRejectedValueOnce(Object.assign(new Error('PLAN_CONFLICT: changed'), { data: { code: 'CONFLICT' } }));
    fireEvent.click(screen.getByTestId('workout-save'));
    expect(await screen.findByTestId('plan-editor-conflict')).toBeInTheDocument();
    expect(screen.getByDisplayValue('My edit')).toBeInTheDocument();
    // No raw server text is shown.
    expect(screen.queryByText(/PLAN_CONFLICT/)).toBeNull();
  });
});
describe('B3.5 — older plans, every field, drafts, offline', () => {
  const ex = { id: 'e1', name: 'Squat', targetMuscle: 'Quads', warmupSets: '2', warmupSetCount: 2, workingSets: 3, repRange: '5', rir: '2', tempo: '3-1-1', notes: { en: 'Brace', ar: 'شد البطن' }, restSec: 180, videoId: null, libraryExerciseId: 'lib1', librarySyncEnabled: true, images: ['i.png'] };
  // An older plan: a flat day (no `sections`) — what seeded / imported plans look like.
  const legacy: WorkoutPlan = { id: 'wp1', name: 'Strength', days: [{ id: 'd1', dayIndex: 0, title: 'Lower', focus: 'Legs', exerciseIds: ['e1'] }], exercises: { e1: ex }, updatedAt: 1000 };
  beforeEach(async () => {
    // Drafts live in one in-memory store for the whole file — start each test without one.
    await (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
  });

  it('B34-R1: an older plan opens with nothing unsaved, and a name-only save writes the day in its own shape', async () => {
    getClientWorkoutPlan.mockResolvedValue(legacy);
    renderEditor();
    expect(await screen.findByTestId('workout-clean')).toBeInTheDocument();
    expect(screen.queryByTestId('workout-unsaved')).toBeNull();
    const { hasNavGuard } = await import('@/stores/navGuardStore');
    expect(hasNavGuard()).toBe(false);
    fireEvent.change(screen.getByTestId('workout-plan-name'), { target: { value: 'Strength 2' } });
    expect(screen.getByTestId('workout-unsaved')).toBeInTheDocument();
    saveClientWorkoutPlan.mockResolvedValueOnce({ ...legacy, name: 'Strength 2', updatedAt: 2000 });
    fireEvent.click(screen.getByTestId('workout-save'));
    await waitFor(() => expect(saveClientWorkoutPlan).toHaveBeenCalledTimes(1));
    const sent = saveClientWorkoutPlan.mock.calls[0][1] as WorkoutPlan;
    expect(sent.days).toEqual(legacy.days); // no sections invented, no ids rewritten
    expect(sent.exercises).toEqual(legacy.exercises);
    expect(await screen.findByTestId('workout-saved')).toBeInTheDocument();
  });

  it('RIR and tempo are editable; applying keeps every other field (library link, images, the Arabic notes)', async () => {
    getClientWorkoutPlan.mockResolvedValue(legacy);
    renderEditor();
    fireEvent.click(await screen.findByTestId('builder-day-card'));
    fireEvent.click(await screen.findByText('Squat'));
    fireEvent.change(await screen.findByTestId('ex-rir'), { target: { value: '1' } });
    fireEvent.change(screen.getByTestId('ex-tempo'), { target: { value: '2-0-2' } });
    fireEvent.click(screen.getByTestId('ex-save'));
    saveClientWorkoutPlan.mockResolvedValueOnce({ ...legacy, updatedAt: 2000 });
    fireEvent.click(screen.getByTestId('workout-save'));
    await waitFor(() => expect(saveClientWorkoutPlan).toHaveBeenCalledTimes(1));
    const sent = saveClientWorkoutPlan.mock.calls[0][1] as WorkoutPlan;
    expect(sent.exercises.e1).toEqual({ ...ex, rir: '1', tempo: '2-0-2' });
    expect(sent.days[0]).toEqual(legacy.days[0]);
  });

  it('phones: the one Back steps from a day up to the plan before leaving', async () => {
    getClientWorkoutPlan.mockResolvedValue(legacy);
    renderEditor();
    fireEvent.click(await screen.findByTestId('builder-day-card'));
    expect(await screen.findByTestId('builder-day')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('coach-workout-editor').querySelector('button')!);
    expect(await screen.findByTestId('builder-plan')).toBeInTheDocument();
    expect(screen.queryByTestId('builder-day')).toBeNull();
  });

  it('a restored draft is announced and can be discarded (back to the saved plan)', async () => {
    const localforage = (await import('localforage')).default;
    await localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' }).setItem('workoutDraft::c1', { ...legacy, name: 'Draft name' });
    getClientWorkoutPlan.mockResolvedValue(legacy);
    renderEditor();
    expect(await screen.findByTestId('plan-editor-draft-restored')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Draft name')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('plan-editor-discard-draft'));
    expect(await screen.findByDisplayValue('Strength')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-editor-draft-restored')).toBeNull();
    expect(screen.getByTestId('workout-clean')).toBeInTheDocument();
  });

  it('offline: Save is disabled and the bar says the changes are kept on this device', async () => {
    getClientWorkoutPlan.mockResolvedValue(legacy);
    renderEditor();
    fireEvent.change(await screen.findByTestId('workout-plan-name'), { target: { value: 'Offline edit' } });
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    window.dispatchEvent(new Event('offline'));
    try {
      expect(await screen.findByTestId('workout-offline')).toBeInTheDocument();
      expect(screen.getByTestId('workout-save')).toBeDisabled();
      expect(screen.getByTestId('plan-editor-offline-notice')).toBeInTheDocument();
    } finally {
      onLine.mockRestore();
      window.dispatchEvent(new Event('online'));
    }
  });
});
describe('owner review — drafts made before the plan changed elsewhere (B35-R3)', () => {
  const server: WorkoutPlan = { id: 'wp1', name: 'Now on the server', days: [], exercises: {}, updatedAt: 2000 };
  const store = async () => (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' });
  beforeEach(async () => {
    await (await store()).clear();
  });

  it('is restored on its own base revision and announced as stale; Save is refused by the server (conflict) and the draft stays', async () => {
    await (await store()).setItem('workoutDraft::c1', { v: 2, plan: { ...server, name: 'My offline edit', updatedAt: 1000 }, base: 1000, savedAt: 1 });
    getClientWorkoutPlan.mockResolvedValue(server);
    renderEditor();
    expect(await screen.findByDisplayValue('My offline edit')).toBeInTheDocument();
    expect(screen.getByTestId('plan-editor-draft-restored').querySelector('[data-stale]')).not.toBeNull();
    saveClientWorkoutPlan.mockRejectedValueOnce(Object.assign(new Error('PLAN_CONFLICT: changed'), { data: { code: 'CONFLICT' } }));
    fireEvent.click(screen.getByTestId('workout-save'));
    expect(await screen.findByTestId('plan-editor-conflict')).toBeInTheDocument();
    expect(saveClientWorkoutPlan.mock.calls[0][2]).toMatchObject({ baseUpdatedAt: 1000 }); // never the newer revision
    expect(await (await store()).getItem('workoutDraft::c1')).toMatchObject({ plan: { name: 'My offline edit' }, base: 1000 });
  });

  it('an older bare-plan draft (before B3.5) is still read — never deleted — and its base is its own updatedAt', async () => {
    await (await store()).setItem('workoutDraft::c1', { ...server, name: 'Old-format draft', updatedAt: 1000 });
    getClientWorkoutPlan.mockResolvedValue(server);
    renderEditor();
    expect(await screen.findByDisplayValue('Old-format draft')).toBeInTheDocument();
    expect(screen.getByTestId('plan-editor-draft-restored').querySelector('[data-stale]')).not.toBeNull();
    saveClientWorkoutPlan.mockRejectedValueOnce(Object.assign(new Error('PLAN_CONFLICT: changed'), { data: { code: 'CONFLICT' } }));
    fireEvent.click(screen.getByTestId('workout-save'));
    await waitFor(() => expect(saveClientWorkoutPlan.mock.calls[0][2]).toMatchObject({ baseUpdatedAt: 1000 }));
  });

  it('Discard returns to the plan that is on the server now, and the next save is based on it', async () => {
    await (await store()).setItem('workoutDraft::c1', { v: 2, plan: { ...server, name: 'My offline edit', updatedAt: 1000 }, base: 1000, savedAt: 1 });
    getClientWorkoutPlan.mockResolvedValue(server);
    renderEditor();
    fireEvent.click(await screen.findByTestId('plan-editor-discard-draft'));
    expect(await screen.findByDisplayValue('Now on the server')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('workout-plan-name'), { target: { value: 'Fresh edit' } });
    saveClientWorkoutPlan.mockResolvedValueOnce({ ...server, name: 'Fresh edit', updatedAt: 3000 });
    fireEvent.click(screen.getByTestId('workout-save'));
    await waitFor(() => expect(saveClientWorkoutPlan.mock.calls[0][2]).toMatchObject({ baseUpdatedAt: 2000 }));
  });

  it("another client's or another coach's draft is never shown here", async () => {
    await (await store()).setItem('workoutDraft::other-client', { v: 2, plan: { ...server, name: 'Other client' }, base: 2000, savedAt: 1 });
    await (await store()).setItem('workoutDraft:coach-b:c1', { v: 2, plan: { ...server, name: 'Other coach' }, base: 2000, savedAt: 1 });
    getClientWorkoutPlan.mockResolvedValue(server);
    renderEditor();
    expect(await screen.findByDisplayValue('Now on the server')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-editor-draft-restored')).toBeNull();
  });
});

