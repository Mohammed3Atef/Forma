import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { Exercise, WorkoutTemplate } from '@/types';

/**
 * B3.7 Library: segments and URL, first run, the persistent template-sync notice with Retry (TS-04),
 * ⌘K create / open intents (DT-08) and the "Use in a client plan" hand-off.
 * B4.3: Exercises is ONE list — Forma's shared exercises and the coach's own (All · Favourites ·
 * Mine), searched and filtered on the server; nothing to import; Customise / Reset to Forma's version.
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
  rows: [] as unknown[],
  total: 0,
  templates: [] as unknown[],
  listLibraryExercises: vi.fn(),
  setLibraryFavorite: vi.fn(),
  getCatalogExercise: vi.fn(),
  saveExercise: vi.fn(),
  getExercise: vi.fn(),
  deleteExercise: vi.fn(),
  listMyClients: vi.fn(),
}));
vi.mock('@/hooks/useMediaQuery', () => ({ useIsDesktop: () => h.desktop, useIsTabletUp: () => h.desktop, useMediaQuery: () => h.desktop }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => true }));
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: <T,>(v: T) => v }));
vi.mock('@/services/platform/mediaApi', () => ({ useUploadConfigured: () => false, uploadFile: vi.fn(), uploadExercisePicture: vi.fn(), UploadError: class extends Error {} }));
vi.mock('@/components/coach/CoachPlanProvider', () => ({ useCoachPlan: () => ({ canWrite: true, state: 'active', daysLeft: 20, plan: null }), useWriteGate: () => ({ canWrite: true, planBlocked: false, online: true, reason: undefined }) }));
vi.mock('@/services/platform/coachApi', async (orig) => ({ ...(await orig<typeof import('@/services/platform/coachApi')>()), listMyClients: h.listMyClients }));
vi.mock('@/services/platform/coachAssetsApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/coachAssetsApi')>()),
  saveExercise: h.saveExercise,
  getExercise: h.getExercise,
  deleteExercise: h.deleteExercise,
  listWorkoutTemplates: async () => h.templates,
  listFoods: async () => [],
  listFoodGroups: async () => [],
  listSupplements: async () => [],
}));
const TAXONOMY = {
  muscles: { chest: { en: 'Chest', ar: 'الصدر' }, lats: { en: 'Lats', ar: 'الظهر' } },
  equipment: { barbell: { en: 'Barbell', ar: 'بار' }, bodyweight: { en: 'Bodyweight', ar: 'وزن الجسم' } },
  bodyParts: { chest: { en: 'Chest', ar: 'الصدر' } },
  difficulty: {},
  foodCategories: {},
  foodStates: {},
};
vi.mock('@/services/platform/catalogApi', async (orig) => ({
  ...(await orig<typeof import('@/services/platform/catalogApi')>()),
  catalogMetaQuery: () => ({ queryKey: ['catalog', 'meta'], queryFn: async () => ({ taxonomy: TAXONOMY, licenses: {} }), staleTime: Infinity }),
  getCatalogExercise: h.getCatalogExercise,
}));
vi.mock('@/services/platform/libraryApi', () => ({
  LIBRARY_KEY: ['library'],
  listLibraryExercises: h.listLibraryExercises,
  listLibraryFoods: async () => ({ total: 0, items: [] }),
  setLibraryFavorite: h.setLibraryFavorite,
}));

import { useSession } from '@/services/auth/sessionStore';
import { DialogHost } from '@/components/DialogHost';
import { CoachLibrary } from './CoachLibrary';

const COACH = 'coach-1';
const ex = (id: string, p: Partial<Exercise> = {}): Exercise =>
  ({ id, name: id, targetMuscle: 'Chest', warmupSets: '0', workingSets: 3, repRange: '8-12', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 90, videoId: null, ...p }) as Exercise;
const shared = (id: string, en: string, media: 'video' | 'animation' | 'image' | 'none' = 'none', favorite = false) => ({
  kind: 'shared',
  id,
  favorite,
  card: { id, origin: 'forma', rev: 1, name: { en, ar: `${en} (ar)` }, bodyPart: 'chest', primaryMuscles: ['chest'], equipment: ['barbell'], pattern: null, difficulty: null, media, videoCount: 0, demoCount: media === 'none' ? 0 : 1, variantOf: null, thumb: null },
});
const own = (e: Exercise, catalogId: string | null = null) => ({ kind: 'own', id: e.id, favorite: false, customized: !!catalogId, catalogId, exercise: { ...e, ...(catalogId ? { catalogId } : {}) }, muscles: ['chest'], equipment: [] });
const BENCH_FULL = {
  id: 'fx_bench',
  origin: 'forma',
  rev: 3,
  name: { en: 'Barbell bench press', ar: 'ضغط البار' },
  aliases: { en: [], ar: [], eg: ['بنش'] },
  bodyPart: 'chest',
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: ['barbell'],
  pattern: null,
  mechanics: null,
  difficulty: null,
  laterality: null,
  instructions: { en: { setup: [], steps: ['Lower the bar.', 'Press.'], cues: [], mistakes: [], safety: [] }, ar: null },
  media: [],
  variantOf: null,
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
          <Route path="/coach/library" element={<><CoachLibrary /><Where /><DialogHost /></>} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
const where = () => screen.getByTestId('where').textContent;
const lastQuery = () => h.listLibraryExercises.mock.calls.at(-1)![0];

beforeEach(() => {
  h.desktop = true;
  h.templates = [];
  h.rows = [shared('fx_bench', 'Barbell bench press', 'video'), shared('edb_fly', 'Cable fly', 'animation'), shared('fx_dip', 'Dip'), own(ex('e-none', { name: 'Ring dip' }))];
  h.total = 1343;
  h.listLibraryExercises.mockReset().mockImplementation(async (q: { scope?: string; offset?: number; limit?: number }) => {
    const rows = (h.rows as { kind: string; favorite: boolean }[]).filter((r) => (q.scope === 'mine' ? r.kind === 'own' : q.scope === 'favorites' ? r.favorite : true));
    const offset = q.offset ?? 0;
    return { total: q.scope && q.scope !== 'all' ? rows.length : h.total, items: rows.slice(offset, offset + (q.limit ?? 30)) };
  });
  h.setLibraryFavorite.mockReset().mockResolvedValue({ favorite: true });
  h.getCatalogExercise.mockReset().mockResolvedValue(BENCH_FULL);
  h.saveExercise.mockReset().mockResolvedValue({ status: 'success', affectedTemplates: 0 });
  h.getExercise.mockReset();
  h.deleteExercise.mockReset().mockResolvedValue(undefined);
  h.listMyClients.mockReset().mockResolvedValue([{ id: 'c1', displayName: 'Aya Hassan', email: 'aya@x.test', role: 'client' }]);
  useSession.setState({ uid: COACH, account: { id: COACH, role: 'coach', accountStatus: 'active', displayName: 'Amira', email: 'amira@x.test' } as never });
});

describe('Library — segments and first run', () => {
  it('opens on Programs; an empty list offers to create the first one — there is no starter library to import (B4.3)', async () => {
    renderAt('/coach/library');
    const panel = await screen.findByTestId('lib-first');
    expect(screen.getByTestId('lib-tab-programs')).toHaveAttribute('aria-selected', 'true');
    expect(within(panel).getByText('No programs yet')).toBeInTheDocument();
    expect(within(panel).getByTestId('template-new-first')).toBeEnabled();
    expect(screen.queryByTestId('load-starter-library')).toBeNull();
    expect(screen.queryByTestId('lib-load-starter')).toBeNull();
    expect(screen.queryByText(/starter/i)).toBeNull();
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

describe('Library › Exercises — one shared library', () => {
  it('a coach with nothing of their own sees Forma’s exercises at once (no import), with honest demo marks and the full count', async () => {
    h.rows = h.rows.filter((r) => (r as { kind: string }).kind === 'shared');
    renderAt('/coach/library?tab=exercises');
    const list = await screen.findByTestId('lib-exercises');
    await waitFor(() => expect(within(list).getAllByTestId('library-exercise-row')).toHaveLength(3));
    expect(screen.getByTestId('lib-exercises-count')).toHaveTextContent('1343 exercises');
    expect(within(list).getAllByTestId('library-media-video')).toHaveLength(1);
    expect(within(list).getAllByTestId('library-media-animation')).toHaveLength(1);
    expect(within(list).getAllByTestId('library-media-none')).toHaveLength(1);
    expect(lastQuery()).toMatchObject({ q: '', scope: 'all', lang: 'en', limit: 30 });
  });

  it('All · Favourites · My exercises, search and filters live in the URL and go to the server', async () => {
    renderAt('/coach/library?tab=exercises');
    await screen.findAllByTestId('library-exercise-row');
    fireEvent.click(screen.getByTestId('lib-exercises-scope-mine'));
    await waitFor(() => expect(where()).toContain('scope=mine'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ scope: 'mine' }));
    expect(await screen.findByText('Ring dip')).toBeInTheDocument();
    expect(screen.getByTestId('library-badge-mine')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('lib-exercises-scope-all'));
    fireEvent.change(screen.getByTestId('lib-exercises-search'), { target: { value: 'بنش' } });
    fireEvent.change(screen.getByTestId('lib-exercises-muscle'), { target: { value: 'chest' } });
    fireEvent.click(screen.getByTestId('lib-exercises-demo'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ q: 'بنش', scope: 'all', muscle: 'chest', demo: true }));
    expect(where()).toContain('muscle=chest');
    expect(where()).toContain('demo=1');
  });

  it('the star keeps a favourite (a light reference — nothing is copied)', async () => {
    renderAt('/coach/library?tab=exercises');
    const rows = await screen.findAllByTestId('library-exercise-row');
    const star = within(rows[0]).getByTestId('library-favorite');
    expect(star).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(star);
    await waitFor(() => expect(h.setLibraryFavorite).toHaveBeenCalledWith('exercise', 'fx_bench', true));
    expect(star).toHaveAttribute('aria-pressed', 'true');
    expect(h.saveExercise).not.toHaveBeenCalled();
  });

  it('a Forma exercise opens read-first and goes straight into a client’s plan — nothing is saved here', async () => {
    renderAt('/coach/library?tab=exercises');
    fireEvent.click(within((await screen.findAllByTestId('library-exercise-row'))[0]).getByTestId('library-row-main'));
    expect(await screen.findByText('Lower the bar.')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('exercise-use'));
    fireEvent.click(await screen.findByTestId('use-client-client'));
    expect(where()).toBe('/coach/client/c1/workout?addExercise=fx_bench');
    expect(h.saveExercise).not.toHaveBeenCalled();
  });

  it('Customise makes the coach’s own version (cat-<id>, linked to the catalog item); Reset removes it', async () => {
    renderAt('/coach/library?tab=exercises');
    fireEvent.click(within((await screen.findAllByTestId('library-exercise-row'))[0]).getByTestId('library-row-main'));
    fireEvent.click(await screen.findByTestId('catalog-customize'));
    const name = await screen.findByTestId('ex-name');
    expect(name).toHaveValue('Barbell bench press');
    fireEvent.change(name, { target: { value: 'Paused bench' } });
    fireEvent.click(screen.getByTestId('ex-save'));
    await waitFor(() => expect(h.saveExercise).toHaveBeenCalled());
    expect(h.saveExercise.mock.calls[0][1]).toMatchObject({ id: 'cat-fx_bench', catalogId: 'fx_bench', name: 'Paused bench' });

    h.rows = [own(ex('cat-fx_bench', { name: 'Paused bench' }), 'fx_bench')];
    fireEvent.click(screen.getByTestId('lib-exercises-scope-mine'));
    fireEvent.click(within(await screen.findByTestId('library-badge-customized').then((b) => b.closest('li')!)).getByTestId('library-row-main'));
    expect(await screen.findByTestId('exercise-customized-note')).toBeInTheDocument();
    expect(screen.queryByTestId('exercise-delete')).toBeNull();
    fireEvent.click(screen.getByTestId('exercise-reset'));
    fireEvent.click(await screen.findByTestId('confirm-accept'));
    await waitFor(() => expect(h.deleteExercise).toHaveBeenCalledWith(COACH, 'cat-fx_bench'));
  });

  it('TS-04: a template sync that failed stays on screen until Retry succeeds — Retry re-saves the copy that is on the server now', async () => {
    const view = renderAt('/coach/library?tab=exercises');
    const mine = (await screen.findAllByTestId('library-exercise-row')).find((r) => r.dataset.kind === 'own')!;
    fireEvent.click(within(mine).getByTestId('library-row-main'));
    fireEvent.click(await screen.findByTestId('exercise-view-edit'));
    fireEvent.change(await screen.findByTestId('ex-name'), { target: { value: 'Ring dip 2' } });
    h.saveExercise.mockResolvedValueOnce({ status: 'failed', affectedTemplates: 0, error: 'boom' });
    fireEvent.click(screen.getByTestId('ex-save'));
    const notice = await screen.findByTestId('lib-sync-issue');
    expect(notice).toHaveTextContent('“Ring dip 2” was saved, but its templates weren\'t updated');
    expect(h.saveExercise.mock.calls[0][1]).toMatchObject({ id: 'e-none', name: 'Ring dip 2' });

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

  it('?open=<id> (⌘K search) opens the coach’s exercise read-first, or a Forma one by its catalog id', async () => {
    h.getExercise.mockResolvedValueOnce(ex('e-image', { name: 'Cable fly', images: ['https://img.test/fly.png'] }));
    const view = renderAt('/coach/library?tab=exercises&open=e-image');
    expect(await screen.findByTestId('exercise-view')).toBeInTheDocument();
    expect(screen.getByTestId('demo-image-view')).toHaveAttribute('src', 'https://img.test/fly.png');
    await waitFor(() => expect(where()).toBe('/coach/library?tab=exercises'));
    view.unmount();
    renderAt('/coach/library?tab=exercises&open=fx_bench');
    expect(await screen.findByText('Lower the bar.')).toBeInTheDocument();
    expect(h.getCatalogExercise).toHaveBeenCalledWith('fx_bench');
  });

  it('Show more asks the server for the next page', async () => {
    h.desktop = false;
    h.rows = Array.from({ length: 70 }, (_, i) => shared(`fx_e${i}`, `Exercise ${String(i).padStart(2, '0')}`));
    h.total = 70;
    renderAt('/coach/library?tab=exercises');
    await waitFor(() => expect(screen.getAllByTestId('library-exercise-row')).toHaveLength(30));
    fireEvent.click(screen.getByTestId('lib-exercises-show-more'));
    await waitFor(() => expect(screen.getAllByTestId('library-exercise-row')).toHaveLength(60));
    expect(lastQuery()).toMatchObject({ offset: 30 });
  });
});
