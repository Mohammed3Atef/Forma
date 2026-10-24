import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CardioPlan } from '@/types';

vi.mock('localforage', () => {
  const stores = new Map<string, Map<string, unknown>>();
  const make = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name)!;
    return {
      getItem: async (k: string) => (m.has(k) ? structuredClone(m.get(k)) : null),
      setItem: async (k: string, v: unknown) => void m.set(k, structuredClone(v)),
      removeItem: async (k: string) => void m.delete(k),
      keys: async () => [...m.keys()],
      clear: async () => m.clear(),
    };
  };
  return { default: { createInstance: (o: { name: string; storeName: string }) => make(`${o.name}/${o.storeName}`) } };
});
const getClientCardioPlan = vi.fn();
const saveClientCardioPlan = vi.fn();
vi.mock('@/services/platform/planApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/planApi')>()),
  getClientCardioPlan: (id: string) => getClientCardioPlan(id),
  saveClientCardioPlan: (id: string, p: CardioPlan, o: unknown) => saveClientCardioPlan(id, p, o),
}));
const getClientTargets = vi.fn();
const updateClientTargets = vi.fn();
vi.mock('@/services/platform/coachTargetsApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachTargetsApi')>()),
  getClientTargets: (id: string) => getClientTargets(id),
  updateClientTargets: (id: string, patch: unknown, expected: unknown) => updateClientTargets(id, patch, expected),
}));
vi.mock('@/components/coach/ClientContextPanel', () => ({ ClientContextPanel: () => null }));
vi.mock('@/stores/dialogStore', () => ({ confirmDelete: async () => true, confirmDialog: async () => true }));

import localforage from 'localforage';
import { CoachCardioEditor } from './CoachCardioEditor';

const plan = { id: 'cp1', name: 'Base', sessions: [{ id: 's1', type: 'walking', durationMin: 30, frequency: 'Daily', notes: 'After dinner', ...({ zone: 2 } as object) }, { id: 's2', type: 'cycling', durationMin: 20, frequency: '2x/week', notes: '' }], updatedAt: 1000 } as CardioPlan;
const store = () => localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
const conflictError = () => Object.assign(new Error('TARGETS_CONFLICT'), { name: 'TRPCClientError', data: { code: 'CONFLICT', httpStatus: 409, reason: 'TARGETS_CONFLICT' } });

function renderEditor() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/coach/client/c1/cardio']}>
        <Routes>
          <Route path="/coach/client/:clientId/cardio" element={<CoachCardioEditor />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  for (const f of [getClientCardioPlan, saveClientCardioPlan, getClientTargets, updateClientTargets]) f.mockReset();
  getClientCardioPlan.mockResolvedValue(plan);
  getClientTargets.mockResolvedValue({ steps: 8000, waterMl: 3000, updatedAt: 1 });
  await store().clear();
});

describe('cardio editor (B3.5)', () => {
  it('daily steps / cardio minutes: only the changed fields are sent, with the values they were edited from; no new plan version', async () => {
    renderEditor();
    expect(await screen.findByTestId('cardio-target-steps')).toHaveValue('8000');
    expect(screen.getByTestId('cardio-clean')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('cardio-target-steps'), { target: { value: '10000' } });
    fireEvent.change(screen.getByTestId('cardio-target-minutes'), { target: { value: '25' } });
    expect(screen.getByTestId('cardio-unsaved')).toBeInTheDocument();
    updateClientTargets.mockResolvedValueOnce({ steps: 10000, cardioMin: 25, waterMl: 3000, updatedAt: 2 });
    fireEvent.click(screen.getByTestId('cardio-save'));
    await waitFor(() => expect(updateClientTargets).toHaveBeenCalledWith('c1', { steps: 10000, cardioMin: 25 }, { steps: 8000, cardioMin: null }));
    expect(saveClientCardioPlan).not.toHaveBeenCalled();
    expect(await screen.findByTestId('cardio-clean')).toBeInTheDocument();
    expect(await store().getItem('targetsDraft::c1')).toBeNull();
  });

  it('sessions reorder; editing one keeps its other fields; a failed targets read never blocks the plan', async () => {
    getClientTargets.mockRejectedValue(new Error('network'));
    renderEditor();
    expect(await screen.findByTestId('cardio-targets-error')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Move Cycling · 20 min up/ }));
    fireEvent.click(screen.getByText('Walking · 30 min'));
    fireEvent.change(await screen.findByTestId('sess-frequency'), { target: { value: '5x/week' } });
    fireEvent.click(screen.getByTestId('sess-save'));
    saveClientCardioPlan.mockResolvedValueOnce({ ...plan, updatedAt: 2000 });
    fireEvent.click(screen.getByTestId('cardio-save'));
    await waitFor(() => expect(saveClientCardioPlan).toHaveBeenCalledTimes(1));
    const sent = saveClientCardioPlan.mock.calls[0][1] as CardioPlan;
    expect(sent.sessions.map((s) => s.id)).toEqual(['s2', 's1']);
    expect(sent.sessions[1]).toEqual({ ...plan.sessions[0], frequency: '5x/week' });
    expect(updateClientTargets).not.toHaveBeenCalled();
  });
});

describe('daily targets — conflicts and drafts (owner review B35-R2 / B35-R3)', () => {
  it('a conflict shows mine vs the saved values and keeps the draft; Keep mine retries from the saved values', async () => {
    renderEditor();
    fireEvent.change(await screen.findByTestId('cardio-target-steps'), { target: { value: '10000' } });
    updateClientTargets.mockRejectedValueOnce(conflictError());
    getClientTargets.mockResolvedValue({ steps: 12000, cardioMin: 30, waterMl: 3000, updatedAt: 3 }); // saved elsewhere meanwhile
    fireEvent.click(screen.getByTestId('cardio-save'));
    expect(await screen.findByTestId('cardio-targets-conflict')).toBeInTheDocument();
    expect(screen.getByTestId('cardio-targets-mine-steps')).toHaveTextContent('10000');
    expect(screen.getByTestId('cardio-targets-theirs-steps')).toHaveTextContent('12000');
    expect(screen.getByTestId('cardio-conflict')).toBeInTheDocument(); // the bar says so
    expect(await store().getItem('targetsDraft::c1')).toMatchObject({ values: { steps: 10000 }, base: { steps: 8000 } }); // never cleared on a conflict
    updateClientTargets.mockResolvedValueOnce({ steps: 10000, cardioMin: 30, waterMl: 3000, updatedAt: 4 });
    fireEvent.click(screen.getByTestId('cardio-targets-keep-mine'));
    await waitFor(() => expect(updateClientTargets).toHaveBeenLastCalledWith('c1', { steps: 10000, cardioMin: null }, { steps: 12000, cardioMin: 30 }));
    expect(await screen.findByTestId('cardio-clean')).toBeInTheDocument();
    expect(await store().getItem('targetsDraft::c1')).toBeNull();
  });

  it('"Use the saved ones" takes the server values and drops my target draft', async () => {
    renderEditor();
    fireEvent.change(await screen.findByTestId('cardio-target-steps'), { target: { value: '10000' } });
    updateClientTargets.mockRejectedValueOnce(conflictError());
    getClientTargets.mockResolvedValue({ steps: 12000, waterMl: 3000, updatedAt: 3 });
    fireEvent.click(screen.getByTestId('cardio-save'));
    fireEvent.click(await screen.findByTestId('cardio-targets-use-theirs'));
    await waitFor(() => expect(screen.getByTestId('cardio-target-steps')).toHaveValue('12000'));
    expect(screen.getByTestId('cardio-clean')).toBeInTheDocument();
    expect(await store().getItem('targetsDraft::c1')).toBeNull();
  });

  it('a failed (not conflicting) save keeps the target draft', async () => {
    renderEditor();
    fireEvent.change(await screen.findByTestId('cardio-target-minutes'), { target: { value: '15' } });
    updateClientTargets.mockRejectedValueOnce(Object.assign(new Error('boom'), { name: 'TRPCClientError', data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 500 } }));
    fireEvent.click(screen.getByTestId('cardio-save'));
    expect(await screen.findByTestId('cardio-targets-failed')).toBeInTheDocument();
    expect(await store().getItem('targetsDraft::c1')).toMatchObject({ values: { cardioMin: 15 } });
  });

  it('leaving and coming back restores the target edits; when the server changed since, it says so and saving is checked against the old values', async () => {
    const first = renderEditor();
    fireEvent.change(await screen.findByTestId('cardio-target-steps'), { target: { value: '9500' } });
    await waitFor(async () => expect(await store().getItem('targetsDraft::c1')).toMatchObject({ values: { steps: 9500 } }));
    first.unmount();

    // Same server: restored, announced, not stale.
    renderEditor();
    expect(await screen.findByTestId('plan-editor-draft-restored')).toBeInTheDocument();
    expect(screen.getByTestId('cardio-target-steps')).toHaveValue('9500');
    expect(screen.getByTestId('plan-editor-draft-restored').querySelector('[data-stale]')).toBeNull();
  });

  it('a draft made before the server changed is restored as stale: nothing is overwritten automatically; Save conflicts, Discard returns to the saved values', async () => {
    await store().setItem('targetsDraft::c1', { v: 1, values: { steps: 9500, cardioMin: null }, base: { steps: 8000, cardioMin: null }, savedAt: 1 });
    getClientTargets.mockResolvedValue({ steps: 11000, waterMl: 3000, updatedAt: 5 }); // changed elsewhere since the draft
    renderEditor();
    expect(await screen.findByTestId('plan-editor-draft-restored')).toBeInTheDocument();
    expect(screen.getByTestId('plan-editor-draft-restored').querySelector('[data-stale]')).not.toBeNull();
    expect(screen.getByTestId('cardio-target-steps')).toHaveValue('9500');
    updateClientTargets.mockRejectedValueOnce(conflictError());
    fireEvent.click(screen.getByTestId('cardio-save'));
    await waitFor(() => expect(updateClientTargets).toHaveBeenCalledWith('c1', { steps: 9500 }, { steps: 8000 }));
    expect(await screen.findByTestId('cardio-targets-conflict')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('plan-editor-discard-draft'));
    await waitFor(() => expect(screen.getByTestId('cardio-target-steps')).toHaveValue('11000'));
    expect(await store().getItem('targetsDraft::c1')).toBeNull();
  });

  it('drafts are per client and per coach: another client never sees this draft', async () => {
    await store().setItem('targetsDraft::other-client', { v: 1, values: { steps: 1, cardioMin: null }, base: { steps: 8000, cardioMin: null }, savedAt: 1 });
    await store().setItem('targetsDraft:another-coach:c1', { v: 1, values: { steps: 2, cardioMin: null }, base: { steps: 8000, cardioMin: null }, savedAt: 1 });
    renderEditor();
    expect(await screen.findByTestId('cardio-target-steps')).toHaveValue('8000');
    expect(screen.queryByTestId('plan-editor-draft-restored')).toBeNull();
  });
});
