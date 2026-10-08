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
