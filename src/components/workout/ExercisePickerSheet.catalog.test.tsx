import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Exercise } from '@/types';

/**
 * B4 / B4.3 — the plan editor's exercise picker: ONE list (Forma's exercises and the coach's own,
 * All · Favourites · My exercises); previews with instructions + media credits; picked Forma
 * exercises copied in full (with their catalog link), the coach's own library-linked — added together
 * in one action. A failed fetch keeps the selection and says so.
 */
vi.mock('@/services/platform/coachAssetsApi', () => ({ saveExercise: async () => ({ status: 'success', affectedTemplates: 0 }), getExercise: vi.fn() }));
vi.mock('@/services/platform/mediaApi', () => ({ useUploadConfigured: () => false, uploadFile: vi.fn(), uploadExercisePicture: vi.fn(), UploadError: class extends Error {} }));
vi.mock('@/hooks/useDebouncedValue', () => ({ useDebouncedValue: <T,>(v: T) => v }));

const L = (en: string, ar = en) => ({ en, ar });
const card = { id: 'fx_barbell_bench_press', origin: 'forma', rev: 1, name: L('Barbell bench press', 'ضغط البار على البنش المستوي'), bodyPart: 'chest', primaryMuscles: ['chest'], equipment: ['barbell', 'bench'], pattern: 'horizontal-push', difficulty: 'intermediate', media: 'video', videoCount: 0, demoCount: 0, variantOf: null, thumb: { url: 'https://wger.de/a.png', author: 'Everkinetic', license: 'CC-BY-SA-3.0' } };
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
};
const mine: Exercise = { id: 'ex_1', name: 'My cable fly', targetMuscle: 'Chest', warmupSets: '', workingSets: 3, repRange: '10', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 60, videoId: null };
const ROWS = [
  { kind: 'shared', id: card.id, favorite: false, card },
  { kind: 'own', id: mine.id, favorite: false, customized: false, catalogId: null, exercise: mine, muscles: ['chest'], equipment: ['cable'] },
];
const getCatalogExercises = vi.fn(async (_ids: string[]) => [full]);
const listLibraryExercises = vi.fn(async (q: { scope?: string }) => {
  const items = ROWS.filter((r) => q.scope !== 'mine' || r.kind === 'own');
  return { total: items.length, items };
});
vi.mock('@/services/platform/catalogApi', () => ({
  catalogMetaQuery: () => ({
    queryKey: ['catalog', 'meta'],
    queryFn: async () => ({ taxonomy: { muscles: { chest: L('Chest', 'الصدر'), triceps: L('Triceps') }, equipment: { barbell: L('Barbell'), bench: L('Bench') }, bodyParts: { chest: L('Chest') }, patterns: {}, difficulty: { intermediate: L('Intermediate', 'متوسط') }, foodCategories: {}, foodStates: {} }, licenses: {} }),
  }),
  getCatalogExercise: async () => full,
  getCatalogExercises: (ids: string[]) => getCatalogExercises(ids as never),
}));
vi.mock('@/services/platform/libraryApi', () => ({
  LIBRARY_KEY: ['library'],
  listLibraryExercises: (q: never) => listLibraryExercises(q),
  setLibraryFavorite: vi.fn(),
}));

import { ExercisePickerSheet } from './ExercisePickerSheet';

function renderPicker(onPickMany = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={qc}>
      <ExercisePickerSheet open onClose={() => undefined} coachId="coach-1" onPickMany={onPickMany} />
    </QueryClientProvider>,
  );
  return onPickMany;
}
const rowOf = async (id: string) => (await screen.findAllByTestId('library-exercise-row')).find((r) => r.dataset.id === id)!;

beforeEach(() => {
  getCatalogExercises.mockReset();
  getCatalogExercises.mockImplementation(async (_ids: string[]) => [full]);
  listLibraryExercises.mockClear();
});

describe('exercise picker × the one library (B4.3)', () => {
  it('one list of Forma and own exercises; preview shows instructions and credits; the copy keeps its catalog link and media credits', async () => {
    const onPick = renderPicker();
    expect(await screen.findByTestId('picker-library-scope-all')).toHaveAttribute('aria-checked', 'true');
    const row = await rowOf(card.id);
    expect(await rowOf(mine.id)).toBeInTheDocument();
    fireEvent.click(within(row).getByTestId('library-row-preview'));
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
    expect(added.libraryExerciseId).toBeUndefined(); // a snapshot — nothing was saved to the coach's library first
    expect(getCatalogExercises).toHaveBeenCalledWith(['fx_barbell_bench_press']);
  });

  it('a Forma and an own exercise picked together go in together, in the order picked; the own one library-linked', async () => {
    const onPick = renderPicker();
    fireEvent.click(within(await rowOf(mine.id)).getByTestId('library-row-main'));
    fireEvent.click(within(await rowOf(card.id)).getByTestId('library-row-main'));
    expect(screen.getByTestId('picker-selected-count')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('picker-add-selected'));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const added = onPick.mock.calls[0][0] as Exercise[];
    expect(added.map((e) => e.name)).toEqual(['My cable fly', 'Barbell bench press']);
    expect(added[0]).toMatchObject({ libraryExerciseId: 'ex_1', librarySyncEnabled: true });
    expect(added[0].id).not.toBe('ex_1');
  });

  it('a failed fetch of the picked exercises keeps the selection and says so', async () => {
    getCatalogExercises.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const onPick = renderPicker();
    fireEvent.click(within(await rowOf(card.id)).getByTestId('library-row-main'));
    expect(screen.getByTestId('picker-selected-count')).toHaveTextContent('1');
    fireEvent.click(screen.getByTestId('picker-add-selected'));
    expect(await screen.findByTestId('picker-add-failed')).toBeInTheDocument();
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('picker-add-selected'));
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
  });

  it('"My exercises" lists only the coach’s own', async () => {
    renderPicker();
    fireEvent.click(await screen.findByTestId('picker-library-scope-mine'));
    await waitFor(() => expect(listLibraryExercises).toHaveBeenLastCalledWith(expect.objectContaining({ scope: 'mine' })));
    await waitFor(() => expect(screen.getAllByTestId('library-exercise-row')).toHaveLength(1));
    expect(screen.getByText('My cable fly')).toBeInTheDocument();
  });
});
