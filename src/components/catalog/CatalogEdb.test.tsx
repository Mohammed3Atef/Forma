import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

vi.mock('@/services/platform/mediaApi', () => ({ useUploadConfigured: () => false, uploadFile: vi.fn(), uploadExercisePicture: vi.fn(), UploadError: class extends Error {} }));

import { CatalogExerciseView } from './CatalogExercisePreview';
import { ExerciseInstructions, MediaCredits } from '@/components/library/ExerciseInstructions';
import { ExerciseForm } from '@/components/workout/ExerciseForm';
import { exerciseFromCatalog } from '@/lib/catalogCopy';
import i18n from '@/i18n';
import type { CatalogExercise, CatalogTaxonomy } from '@/services/platform/catalogApi';
import type { Exercise } from '@/types';

/**
 * B4.2 — ExerciseDB items in the app: the GIF is the demonstration (loaded when the exercise is
 * opened, with a still fallback when the link is broken), AscendAPI is credited, English-only steps
 * are shown labelled to an Arabic reader, and a coach's copy can swap and restore its picture.
 */
const taxonomy = {
  muscles: { lats: { en: 'Lats', ar: 'العضلة الظهرية العريضة' }, biceps: { en: 'Biceps', ar: 'البايسبس' } },
  equipment: { bodyweight: { en: 'Bodyweight', ar: 'وزن الجسم' }, 'pull-up-bar': { en: 'Pull-up bar', ar: 'عقلة' } },
  bodyParts: { back: { en: 'Back', ar: 'الظهر' } },
  difficulty: {},
} as unknown as CatalogTaxonomy;
const GIF = 'https://static.exercisedb.dev/media/X1.gif';
const edb = {
  id: 'edb_X1',
  origin: 'exercisedb',
  rev: 1,
  name: { en: 'Reverse-grip pull-up', ar: 'السحب على العقلة بقبضة معكوسة' },
  aliases: { en: [], ar: [], eg: ['عقلة عكسي'] },
  bodyPart: 'back',
  primaryMuscles: ['lats'],
  secondaryMuscles: ['biceps'],
  equipment: ['bodyweight', 'pull-up-bar'],
  pattern: null,
  mechanics: null,
  difficulty: null,
  laterality: null,
  instructions: { en: { setup: [], steps: ['Hang from the bar.', 'Pull up.'], cues: [], mistakes: [], safety: [] }, ar: null },
  media: [{ id: 'gif_x1_abcdef', kind: 'image', format: 'gif', mime: 'image/gif', url: GIF, hosting: 'source', role: 'primary', width: 180, height: 180, license: 'EXERCISEDB', author: 'ExerciseDB (AscendAPI)', sourcePage: 'https://ascendapi.com', source: { provider: 'exercisedb', id: 'X1' }, posterUrl: '/catalog/edb/X1.webp', thumbUrl: '/catalog/edb/X1.webp' }],
  variantOf: null,
  sourceIds: ['X1'],
  credit: { provider: 'exercisedb', author: 'ExerciseDB (AscendAPI)', url: 'https://ascendapi.com' },
  translation: 'draft',
} as unknown as CatalogExercise;

describe('an ExerciseDB exercise in the preview', () => {
  it('shows the GIF as the demonstration, credits AscendAPI, and never claims Forma wrote the steps', () => {
    render(<CatalogExerciseView e={edb} taxonomy={taxonomy} />);
    expect(screen.getByTestId('catalog-gif').querySelector('img')).toHaveAttribute('src', GIF);
    expect(screen.getByTestId('credit-exercisedb')).toHaveTextContent('AscendAPI');
    expect(screen.getByTestId('catalog-text-credit')).toHaveTextContent('ExerciseDB');
    expect(screen.queryByText(/difficulty/i)).toBeNull();
  });

  it('a broken GIF falls back to its still, said honestly', () => {
    render(<CatalogExerciseView e={edb} taxonomy={taxonomy} />);
    fireEvent.error(screen.getByTestId('catalog-gif').querySelector('img')!);
    expect(screen.getByTestId('catalog-gif').querySelector('img')).toHaveAttribute('src', '/catalog/edb/X1.webp');
    expect(screen.getByTestId('catalog-gif-unavailable')).toBeInTheDocument();
  });

  it('an Arabic reader sees the English steps, labelled and left-to-right', async () => {
    await i18n.changeLanguage('ar');
    try {
      render(<ExerciseInstructions instructions={edb.instructions} />);
      expect(screen.getByTestId('instructions-english-only')).toBeInTheDocument();
      expect(screen.getByText('Hang from the bar.').closest('ol')).toHaveAttribute('dir', 'ltr');
    } finally {
      await i18n.changeLanguage('en');
    }
  });

  it('one credit line for ExerciseDB media', () => {
    render(<MediaCredits credits={[{ url: GIF, kind: 'image', author: 'ExerciseDB (AscendAPI)', license: 'EXERCISEDB', sourcePage: 'https://ascendapi.com' }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'ascendapi.com' })).toHaveAttribute('href', 'https://ascendapi.com');
  });
});

describe('a copy of an ExerciseDB exercise', () => {
  const copy = exerciseFromCatalog(edb, { ...taxonomy, muscles: { ...(taxonomy as unknown as { muscles: object }).muscles }, equipment: (taxonomy as unknown as { equipment: object }).equipment } as unknown as CatalogTaxonomy);

  it('the GIF is the exercise picture, lists get the light still, and the original is kept to restore', () => {
    expect(copy).toMatchObject({ imageUrl: GIF, images: [GIF], thumbUrl: '/catalog/edb/X1.webp', catalogId: 'edb_X1', names: { ar: 'السحب على العقلة بقبضة معكوسة' } });
    expect(copy.instructions?.ar).toBeNull();
    expect(copy.sourceMedia).toMatchObject({ imageUrl: GIF, thumbUrl: '/catalog/edb/X1.webp', mediaCredits: [{ license: 'EXERCISEDB' }] });
  });

  it('a coach removes the picture (its credit goes with it), then restores the original (credit back)', () => {
    const onSave = vi.fn();
    const { unmount } = render(<ExerciseForm initial={copy} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('ex-image-remove'));
    fireEvent.click(screen.getByTestId('ex-save'));
    const removed = onSave.mock.calls[0][0] as Exercise;
    // Removed = absent (never null: library sync copies these fields into templates).
    expect(removed.imageUrl ?? null).toBeNull();
    expect(removed.images ?? []).toEqual([]);
    expect(removed.thumbUrl ?? null).toBeNull();
    expect(removed.mediaCredits ?? []).toEqual([]);
    expect(Object.entries(removed).filter(([k, v]) => v === null && ['imageUrl', 'images', 'thumbUrl', 'mediaCredits', 'videoPosterUrl'].includes(k))).toEqual([]);
    unmount();
    render(<ExerciseForm initial={removed} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('ex-media-restore'));
    fireEvent.click(screen.getByTestId('ex-save'));
    expect(onSave.mock.calls[1][0]).toMatchObject({ imageUrl: GIF, images: [GIF], thumbUrl: '/catalog/edb/X1.webp', mediaCredits: [{ license: 'EXERCISEDB' }] });
  });

  it('a coach writes their own steps in English and Arabic; an untouched form changes nothing', () => {
    const onSave = vi.fn();
    render(<ExerciseForm initial={copy} onSave={onSave} />);
    fireEvent.click(screen.getByTestId('ex-save'));
    const untouched = onSave.mock.calls[0][0] as Exercise;
    expect(untouched.instructions).toBe(copy.instructions);
    expect(untouched.imageUrl).toBe(GIF);
    fireEvent.change(screen.getByTestId('ex-steps-ar'), { target: { value: 'تعلّق بالعقلة.\nاسحب جسمك لأعلى.' } });
    fireEvent.click(screen.getByTestId('ex-save'));
    expect((onSave.mock.calls[1][0] as Exercise).instructions).toMatchObject({ en: { steps: ['Hang from the bar.', 'Pull up.'] }, ar: { steps: ['تعلّق بالعقلة.', 'اسحب جسمك لأعلى.'] } });
  });

  it('a video-only edit never touches the picture fields (no nulls written — e2e 22)', () => {
    const onSave = vi.fn();
    const plain = { ...copy, imageUrl: undefined, images: undefined, thumbUrl: undefined, mediaCredits: undefined, sourceMedia: undefined } as Exercise;
    render(<ExerciseForm initial={plain} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('ex-video'), { target: { value: 'https://cdn.example.com/curl.mp4' } });
    fireEvent.click(screen.getByTestId('ex-save'));
    const saved = onSave.mock.calls[0][0] as Exercise;
    expect(saved.videoUrl).toBe('https://cdn.example.com/curl.mp4');
    for (const k of ['imageUrl', 'images', 'thumbUrl', 'mediaCredits'] as const) expect(saved[k], k).toBeUndefined();
  });

  it('a picture link must be https', () => {
    render(<ExerciseForm initial={copy} onSave={vi.fn()} />);
    fireEvent.change(screen.getByTestId('ex-image-url'), { target: { value: 'javascript:alert(1)' } });
    expect(screen.getByTestId('ex-image-invalid')).toBeInTheDocument();
    expect(screen.getByTestId('ex-save')).toBeDisabled();
  });
});
