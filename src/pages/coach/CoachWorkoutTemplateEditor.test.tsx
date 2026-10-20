import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { WorkoutTemplate } from '@/types';

/** B3.7 / RM-27: a template opens read-first in its editor (no preview page); Edit is explicit. */
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
const h = vi.hoisted(() => ({ getWorkoutTemplate: vi.fn(), duplicateWorkoutTemplate: vi.fn(), deleteWorkoutTemplate: vi.fn(), canWrite: true }));
vi.mock('@/services/platform/coachAssetsApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachAssetsApi')>()),
  getWorkoutTemplate: h.getWorkoutTemplate,
  duplicateWorkoutTemplate: h.duplicateWorkoutTemplate,
  deleteWorkoutTemplate: h.deleteWorkoutTemplate,
}));
vi.mock('@/components/coach/CoachPlanProvider', () => ({ useCoachPlan: () => ({ canWrite: h.canWrite, state: h.canWrite ? 'active' : 'expired', daysLeft: 0, plan: null }) }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));

import { useSession } from '@/services/auth/sessionStore';
import { DialogHost } from '@/components/DialogHost';
import { CoachWorkoutTemplateEditor } from './CoachWorkoutTemplateEditor';

const tpl: WorkoutTemplate = {
  id: 't1',
  coachId: 'coach-1',
  name: 'Push Pull Legs',
  goal: 'hypertrophy',
  splitType: 'ppl',
  days: [
    { id: 'd1', dayIndex: 0, title: 'Push', focus: 'Chest', exerciseIds: ['e1'] },
    { id: 'd2', dayIndex: 1, title: 'Legs', focus: '', exerciseIds: ['e2'], sections: [{ id: 's1', title: 'Warm-up', kind: 'warmup', exerciseIds: ['e2'] }] },
  ],
  exercises: {
    e1: { id: 'e1', name: 'Bench press', targetMuscle: 'Chest', warmupSets: '1', warmupSetCount: 1, workingSets: 4, repRange: '6-8', rir: '2', tempo: '', notes: { en: '', ar: '' }, restSec: 120, videoId: null, videoUrl: 'https://cdn.test/b.mp4' },
    e2: { id: 'e2', name: 'Bike', targetMuscle: '', warmupSets: '0', workingSets: 1, repRange: '10 min', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 0, videoId: null },
  },
  createdAt: 1,
  updatedAt: 2,
};

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.search}</p>;
}
function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/coach/templates/:templateId/edit" element={<><CoachWorkoutTemplateEditor /><Where /></>} />
          <Route path="/coach/templates/:templateId" element={<><CoachWorkoutTemplateEditor /><Where /><DialogHost /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  h.canWrite = true;
  h.getWorkoutTemplate.mockReset().mockResolvedValue(tpl);
  h.duplicateWorkoutTemplate.mockReset();
  h.deleteWorkoutTemplate.mockReset();
  await (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' }).clear();
  useSession.setState({ uid: 'coach-1', account: { id: 'coach-1', role: 'coach', accountStatus: 'active', displayName: 'C', email: 'c@x.test' } as never });
});

describe('template read-first (RM-27)', () => {
  it('shows the whole program — days, sections and each exercise with its programming — with nothing editable', async () => {
    renderAt('/coach/templates/t1');
    const view = await screen.findByTestId('template-preview');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Push Pull Legs');
    const days = within(view).getAllByTestId('template-read-day');
    expect(days).toHaveLength(2);
    expect(days[0]).toHaveTextContent('Bench press');
    expect(days[0]).toHaveTextContent('4 × 6-8');
    expect(days[1]).toHaveTextContent('Warm-up');
    expect(days[1]).toHaveTextContent('Bike');
    expect(view.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(screen.queryByTestId('template-save')).toBeNull();
  });

  it('Edit opens the builder in place (replace), and the builder has the guarded Save', async () => {
    renderAt('/coach/templates/t1');
    fireEvent.click(await screen.findByTestId('template-edit'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach/templates/t1/edit'));
    expect(await screen.findByTestId('template-name')).toHaveValue('Push Pull Legs');
    expect(screen.getByTestId('template-save')).toBeInTheDocument();
  });

  it('unsaved edits from earlier are never hidden: the program says so and Edit continues them', async () => {
    const store = (await import('localforage')).default.createInstance({ name: 'gym-tracker', storeName: 'meta' });
    await store.setItem('workoutTemplateDraft:coach-1:t1', { ...tpl, name: 'PPL (draft)' });
    renderAt('/coach/templates/t1');
    expect(await screen.findByTestId('template-draft-pending')).toBeInTheDocument();
    expect(screen.getByTestId('template-edit')).toHaveTextContent('Continue editing');
  });

  it('a missing template says so; a lapsed Forma plan keeps it readable but not editable', async () => {
    h.getWorkoutTemplate.mockResolvedValueOnce(null);
    const a = renderAt('/coach/templates/gone');
    expect(await screen.findByTestId('template-not-found')).toBeInTheDocument();
    a.unmount();
    h.canWrite = false;
    renderAt('/coach/templates/t1');
    expect(await screen.findByTestId('template-preview')).toBeInTheDocument();
    expect(screen.getByTestId('template-edit')).toBeDisabled();
    expect(screen.getByTestId('template-assign')).toBeDisabled();
  });

  it('Duplicate opens the copy; Delete asks, then returns to Library › Programs', async () => {
    h.duplicateWorkoutTemplate.mockResolvedValueOnce({ ...tpl, id: 't2', name: 'Push Pull Legs (copy)' });
    renderAt('/coach/templates/t1');
    await screen.findByTestId('template-preview');
    fireEvent.click(screen.getByTestId('template-more'));
    fireEvent.click(await screen.findByTestId('template-duplicate'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach/templates/t2'));

    h.deleteWorkoutTemplate.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByTestId('template-more'));
    fireEvent.click(await screen.findByTestId('template-delete'));
    fireEvent.click(await screen.findByTestId('confirm-accept'));
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/coach/library?tab=programs'));
  });
});
