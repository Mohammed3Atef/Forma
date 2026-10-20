import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Exercise, WorkoutTemplate } from '@/types';

/**
 * B3.7 Library: segments and URL, the first-run panel, honest demo states, explicit Select mode,
 * the persistent template-sync notice with Retry (TS-04), ⌘K create intents (DT-08) and the
 * "Use in a client plan" hand-off.
 */
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

const h = vi.hoisted(() => ({
  desktop: true,
  exercises: [] as unknown[],
  templates: [] as unknown[],
  listExercises: vi.fn(),
  saveExercise: vi.fn(),
  getExercise: vi.fn(),
  bulkDeleteExercises: vi.fn(),
  listMyClients: vi.fn(),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsDesktop: () => h.desktop, useIsTabletUp: () => h.desktop, useMediaQuery: () => h.desktop }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('@/components/coach/CoachPlanProvider', () => ({ useCoachPlan: () => ({ canWrite: true, state: 'active', daysLeft: 20, plan: null }) }));
vi.mock('@/services/platform/coachApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/coachApi')>()), listMyClients: h.listMyClients }));
vi.mock('@/services/platform/coachAssetsApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachAssetsApi')>()),
  listExercises: h.listExercises,
  saveExercise: h.saveExercise,
  getExercise: h.getExercise,
  bulkDeleteExercises: h.bulkDeleteExercises,
  listWorkoutTemplates: async () => h.templates,
  listFoods: async () => [],
  listFoodGroups: async () => [],
  listSupplements: async () => [],
}));

import { useSession } from '@/services/auth/sessionStore';
import { DialogHost } from '@/components/DialogHost';
import { CoachLibrary } from './CoachLibrary';

const COACH = 'coach-1';
const ex = (id: string, p: Partial<Exercise> = {}): Exercise =>
  ({ id, name: id, targetMuscle: 'Chest', warmupSets: '0', workingSets: 3, repRange: '8-12', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 90, videoId: null, ...p }) as Exercise;

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
          <Route path="/coach/library" element={<><CoachLibrary /><Where /><DialogHost /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const where = () => screen.getByTestId('where').textContent;

beforeEach(() => {
  h.desktop = true;
  h.templates = [];
  h.exercises = [
    ex('e-video', { name: 'Bench press', videoUrl: 'https://youtu.be/dQw4w9WgXcQ', equipment: 'Barbell' }),
    ex('e-image', { name: 'Cable fly', images: ['https://img.test/fly.png'], equipment: 'Cable' }),
    ex('e-none', { name: 'Dip', equipment: 'Bodyweight' }),
    ex('e-drive', { name: 'Push-up', videoUrl: 'https://drive.google.com/file/d/x/view', sourceProvider: 'wger' }),
  ];
  h.listExercises.mockReset().mockImplementation(async () => h.exercises);
  h.saveExercise.mockReset();
  h.getExercise.mockReset();
  h.bulkDeleteExercises.mockReset().mockResolvedValue({ ok: 1, failed: 0 });
  h.listMyClients.mockReset().mockResolvedValue([{ id: 'c1', displayName: 'Aya Hassan', email: 'aya@x.test', role: 'client' }]);
  useSession.setState({ uid: COACH, account: { id: COACH, role: 'coach', accountStatus: 'active', displayName: 'Amira', email: 'amira@x.test' } as never });
});

describe('Library — segments and first run', () => {
  it('opens on Programs; an empty library explains the starter library honestly and offers it up front', async () => {
    renderAt('/coach/library');
    const panel = await screen.findByTestId('lib-starter');
    expect(screen.getByTestId('lib-tab-programs')).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getByText(/Most starter exercises don't have a demo video yet/)).toBeInTheDocument();
    expect(within(panel).getByTestId('load-starter-library')).toBeEnabled();
    expect(screen.queryByText(/many with video/i)).toBeNull(); // EX-23
  });

  it('the old ?tab=groups opens Foods › Swap groups and the URL says so', async () => {
    renderAt('/coach/library?tab=groups');
    await waitFor(() => expect(where()).toBe('/coach/library?tab=foods&view=groups'));
    expect(screen.getByTestId('lib-tab-foods')).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByTestId('lib-foods-view-groups')).toHaveAttribute('aria-checked', 'true');
  });

  it('segment tabs: one tab stop, arrow keys move and switch (VS-14)', async () => {
    renderAt('/coach/library?tab=exercises');
    const tab = screen.getByTestId('lib-tab-exercises');
    expect(tab).toHaveAttribute('tabindex', '0');
    expect(screen.getByTestId('lib-tab-foods')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    await waitFor(() => expect(where()).toBe('/coach/library?tab=foods'));
    fireEvent.keyDown(screen.getByTestId('lib-tab-foods'), { key: 'Home' });
    await waitFor(() => expect(where()).toBe('/coach/library?tab=programs'));
  });

  it('a program row opens the template read-first', async () => {
    h.templates = [{ id: 't1', coachId: COACH, name: 'PPL', goal: 'hypertrophy', splitType: 'ppl', days: [], exercises: {}, createdAt: 1, updatedAt: 2 } as WorkoutTemplate];
    renderAt('/coach/library?tab=programs');
    fireEvent.click(await screen.findByRole('button', { name: 'PPL' }));
    expect(where()).toBe('/coach/templates/t1');
  });
});

describe('Library › Exercises', () => {
  it('each row says honestly what demo it has; "Has video" keeps only playable videos (in the URL)', async () => {
    renderAt('/coach/library?tab=exercises');
    const table = await screen.findByTestId('coach-desktop-library');
    expect(within(table).getAllByTestId('demo-video')).toHaveLength(1);
    expect(within(table).getAllByTestId('demo-image')).toHaveLength(1);
    expect(within(table).getAllByTestId('demo-none')).toHaveLength(2); // nothing, and a Drive link that can't play
    expect(within(table).getAllByText('No demo yet')).toHaveLength(2);
    expect(screen.getByTestId('attribution')).toHaveTextContent('wger.de · CC BY-SA');
    fireEvent.click(screen.getByTestId('lib-filter-video'));
    await waitFor(() => expect(within(screen.getByTestId('coach-desktop-library')).getAllByTestId('data-row')).toHaveLength(1));
    expect(where()).toContain('video=1');
    expect(screen.getByTestId('lib-count')).toHaveTextContent('1 of 4');
  });

  it('headers are real column names and sort with aria-sort', async () => {
    renderAt('/coach/library?tab=exercises');
    const table = await screen.findByTestId('coach-desktop-library');
    const headers = within(table).getAllByRole('columnheader').map((th) => th.textContent?.trim());
    expect(headers).toEqual(expect.arrayContaining(['Exercise', 'Muscle', 'Equipment', 'Demo']));
    expect(headers.join(' ')).not.toMatch(/e\.g\./);
    fireEvent.click(screen.getByTestId('sort-demo'));
    await waitFor(() => expect(where()).toContain('sort=demo'));
    expect(screen.getByTestId('sort-demo').closest('th')).toHaveAttribute('aria-sort', 'ascending');
    expect(within(screen.getByTestId('coach-desktop-library')).getAllByTestId('data-row')[0]).toHaveTextContent('Bench press');
  });

  it('bulk actions exist only in Select mode', async () => {
    renderAt('/coach/library?tab=exercises');
    await screen.findByTestId('coach-desktop-library');
    expect(screen.queryAllByTestId('row-select')).toHaveLength(0);
    expect(screen.queryByTestId('bulk-delete')).toBeNull();
    fireEvent.click(screen.getByTestId('lib-select'));
    expect(screen.getAllByTestId('row-select')).toHaveLength(4);
    fireEvent.click(screen.getAllByTestId('row-select')[2]);
    fireEvent.click(screen.getByTestId('bulk-delete'));
    fireEvent.click(await screen.findByTestId('confirm-accept'));
    await waitFor(() => expect(h.bulkDeleteExercises).toHaveBeenCalledWith(COACH, ['e-none']));
  });

  it('TS-04: a template sync that failed stays on screen until Retry succeeds — Retry re-saves the copy that is on the server now', async () => {
    const view = renderAt('/coach/library?tab=exercises');
    fireEvent.click(await screen.findByRole('button', { name: 'Dip' }));
    fireEvent.click(await screen.findByTestId('exercise-view-edit'));
    fireEvent.change(await screen.findByTestId('ex-name'), { target: { value: 'Ring dip' } });
    h.saveExercise.mockResolvedValueOnce({ status: 'failed', affectedTemplates: 0, error: 'boom' });
    fireEvent.click(screen.getByTestId('ex-save'));
    const notice = await screen.findByTestId('lib-sync-issue');
    expect(notice).toHaveTextContent('“Ring dip” was saved, but its templates weren\'t updated');
    expect(h.saveExercise.mock.calls[0][1]).toMatchObject({ id: 'e-none', name: 'Ring dip' });

    // Still there after leaving and coming back.
    view.unmount();
    renderAt('/coach/library?tab=programs');
    expect(await screen.findByTestId('lib-sync-issue')).toBeInTheDocument();

    const serverCopy = ex('e-none', { name: 'Ring dip (edited elsewhere)' });
    h.getExercise.mockResolvedValueOnce(serverCopy);
    h.saveExercise.mockResolvedValueOnce({ status: 'success', affectedTemplates: 2 });
    fireEvent.click(screen.getByTestId('lib-sync-retry'));
    await waitFor(() => expect(screen.queryByTestId('lib-sync-issue')).toBeNull());
    expect(h.getExercise).toHaveBeenCalledWith(COACH, 'e-none');
    expect(h.saveExercise.mock.calls[1][1]).toBe(serverCopy);
  });

  it('⌘K "New exercise" (?new=1) opens the creation form once and the URL forgets it (DT-08)', async () => {
    renderAt('/coach/library?tab=exercises&new=1');
    expect(await screen.findByTestId('exercise-form')).toBeInTheDocument();
    await waitFor(() => expect(where()).toBe('/coach/library?tab=exercises'));
    expect(screen.getByTestId('ex-name')).toHaveValue('');
  });

  it('?open=<id> (⌘K search) opens that exercise read-first', async () => {
    renderAt('/coach/library?tab=exercises&open=e-image');
    expect(await screen.findByTestId('exercise-view')).toBeInTheDocument();
    expect(screen.getByTestId('demo-image-view')).toHaveAttribute('src', 'https://img.test/fly.png');
    await waitFor(() => expect(where()).toBe('/coach/library?tab=exercises'));
  });

  it('"Use in a client plan" hands the exercise to that client\'s training editor — nothing is saved here', async () => {
    renderAt('/coach/library?tab=exercises');
    fireEvent.click(await screen.findByRole('button', { name: 'Bench press' }));
    fireEvent.click(await screen.findByTestId('exercise-use'));
    fireEvent.click(await screen.findByTestId('use-client-client'));
    expect(where()).toBe('/coach/client/c1/workout?addExercise=e-video');
    expect(h.saveExercise).not.toHaveBeenCalled();
  });

  it('phones: a list with the same honest badges; Show more pages through long libraries', async () => {
    h.desktop = false;
    h.exercises = Array.from({ length: 70 }, (_, i) => ex(`e${i}`, { name: `Exercise ${String(i).padStart(2, '0')}` }));
    renderAt('/coach/library?tab=exercises');
    const list = await screen.findByTestId('lib-list-exercises');
    expect(within(list).getAllByTestId('lib-item')).toHaveLength(30);
    fireEvent.click(screen.getByTestId('lib-show-more'));
    expect(within(screen.getByTestId('lib-list-exercises')).getAllByTestId('lib-item')).toHaveLength(60);
    expect(screen.getByTestId('lib-show-more')).toHaveTextContent('Show more (10)');
  });
});
