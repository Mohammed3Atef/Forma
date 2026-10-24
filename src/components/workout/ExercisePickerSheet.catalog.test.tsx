import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Exercise } from '@/types';

/**
 * B4 — the plan editor's exercise picker with the Forma catalog on: "Forma library" first (server
 * search), previews with instructions + media credits, picked catalog exercises copied in full (with
 * their catalog link) together with the coach's own; a failed fetch keeps the selection and says so.
 */
const libList = vi.hoisted(() => ({ items: [] as Exercise[] }));
const metaState = vi.hoisted(() => ({ enabled: true }));
vi.mock('@/services/platform/coachAssetsApi', () => ({ listExercises: async () => libList.items, saveExercise: async () => ({ status: 'success', affectedTemplates: 0 }) }));

const L = (en: string, ar = en) => ({ en, ar });
const card = { id: 'fx_barbell_bench_press', rev: 1, name: L('Barbell bench press', 'ضغط البار على البنش المستوي'), bodyPart: 'chest', primaryMuscles: ['chest'], equipment: ['barbell', 'bench'], pattern: 'horizontal-push', difficulty: 'intermediate', media: 'video', thumb: { url: 'https://wger.de/a.png', author: 'Everkinetic', license: 'CC-BY-SA-3.0' } };
const full = {
  ...card,
  status: 'published',
  aliases: { en: [], ar: [], eg: ['بنش'] },
  secondaryMuscles: ['triceps'],
  mechanics: 'compound',
  laterality: 'bilateral',
  instructions: { en: { setup: ['Lie on the bench.'], steps: ['Lower the bar.', 'Press it up.'], cues: ['Feet down.'], mistakes: ['Bouncing.'], safety: [] }, ar: { setup: ['استلقِ.'], steps: ['أنزل البار.', 'ادفعه.'], cues: ['القدمان على الأرض.'], mistakes: ['الارتداد.'], safety: [] } },
  media: [{ id: 'img_wger_68', kind: 'image', url: 'https://wger.de/a.png', format: 'png', license: 'CC-BY-SA-3.0', author: 'Everkinetic', sourcePage: 'https://wger.de/en/exercise/73/view/', source: { provider: 'wger', id: '68' }, verified: 'visual' }],
  sources: [],
  content: { license: 'FORMA-PROPRIETARY', author: 'Forma', review: 'draft', translation: 'draft' },
  legacyIds: [],
};
const getCatalogExercises = vi.fn(async (_ids: string[]) => [full]);
vi.mock('@/services/platform/catalogApi', () => ({
  catalogMetaQuery: () => ({
    queryKey: ['catalog', 'meta'],
    queryFn: async () => (!metaState.enabled ? { enabled: false } : { enabled: true, taxonomy: { muscles: { chest: L('Chest', 'الصدر'), triceps: L('Triceps') }, equipment: { barbell: L('Barbell'), bench: L('Bench') }, bodyParts: { chest: L('Chest') }, patterns: {}, difficulty: { intermediate: L('Intermediate', 'متوسط') }, foodCategories: {}, foodStates: {} }, licenses: {} }),
  }),
  searchCatalogExercises: async () => ({ total: 1, items: [card], version: 'v' }),
  getCatalogExercise: async () => full,
  getCatalogExercises: (ids: string[]) => getCatalogExercises(ids as never),
}));

import { ExercisePickerSheet } from './ExercisePickerSheet';

let lastQc: QueryClient;
function renderPicker(onPickMany = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  lastQc = qc;
  render(
    <QueryClientProvider client={qc}>
      <ExercisePickerSheet open onClose={() => undefined} coachId="coach-1" onPickMany={onPickMany} />
    </QueryClientProvider>,
  );
  return onPickMany;
}

beforeEach(() => {
  libList.items = [];
  metaState.enabled = true;
  getCatalogExercises.mockReset();
  getCatalogExercises.mockImplementation(async (_ids: string[]) => [full]);
});

describe('exercise picker × Forma library (B4)', () => {
  it('Forma library first; preview shows instructions and credits; the copy keeps its catalog link and media credits', async () => {
    const onPick = renderPicker();
    expect(await screen.findByTestId('picker-source-forma')).toHaveAttribute('aria-pressed', 'true');
    const row = await screen.findByTestId('catalog-exercise-row');
    fireEvent.click(within(row).getByTestId('catalog-exercise-preview'));
    const view = await screen.findByTestId('catalog-exercise-view');
    expect(within(view).getByTestId('exercise-instructions')).toHaveTextContent('Press it up.');
    expect(within(view).getByTestId('media-credits')).toHaveTextContent('Everkinetic');
    fireEvent.click(screen.getByTestId('catalog-preview-select'));
    expect(screen.getByTestId('catalog-preview-select')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByTestId('picker-add-selected'));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const [added] = onPick.mock.calls[0][0] as Exercise[];
    expect(added).toMatchObject({ name: 'Barbell bench press', names: { ar: 'ضغط البار على البنش المستوي' }, catalogId: 'fx_barbell_bench_press', imageUrl: 'https://wger.de/a.png', targetMuscle: 'Chest' });
    expect(added.mediaCredits?.[0]).toMatchObject({ author: 'Everkinetic', license: 'CC-BY-SA-3.0' });
    expect(added.instructions?.en.steps).toEqual(['Lower the bar.', 'Press it up.']);
    expect(getCatalogExercises).toHaveBeenCalledWith(['fx_barbell_bench_press']);
  });

  it('a failed fetch of the picked exercises keeps the selection and says so', async () => {
    getCatalogExercises.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const onPick = renderPicker();
    fireEvent.click(await screen.findByTestId('catalog-exercise-row').then((r) => within(r).getAllByRole('button')[0]));
    expect(screen.getByTestId('picker-selected-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('picker-add-selected'));
    expect(await screen.findByTestId('picker-add-failed')).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('picker-add-selected'));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
  });

  it('catalog switched off (the production default): no Forma source, the coach’s own library as before', async () => {
    metaState.enabled = false;
    libList.items = [{ id: 'ex_1', name: 'My cable fly', targetMuscle: 'Chest', warmupSets: '', workingSets: 3, repRange: '10', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 60, videoId: null }];
    renderPicker();
    expect(await screen.findByText('My cable fly')).toBeInTheDocument();
    await waitFor(() => expect(lastQc.isFetching()).toBe(0)); // the catalog switch has answered
    expect(screen.queryByTestId('picker-source-forma')).toBeNull();
    expect(screen.queryByTestId('catalog-exercise-row')).toBeNull();
  });

  it('"My library" still lists the coach’s own exercises', async () => {
    libList.items = [{ id: 'ex_1', name: 'My cable fly', targetMuscle: 'Chest', warmupSets: '', workingSets: 3, repRange: '10', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 60, videoId: null }];
    renderPicker();
    fireEvent.click(await screen.findByTestId('picker-source-mine'));
    expect(await screen.findByText('My cable fly')).toBeInTheDocument();
  });
});
