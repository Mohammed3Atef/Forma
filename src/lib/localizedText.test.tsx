import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { applyLocalizedEdit, langOf, localizedEqual, secondLanguageStale, setLocalized } from './localizedText';

vi.mock('@/services/platform/mediaApi', () => ({ useUploadConfigured: () => false, uploadFile: vi.fn(), UploadError: class extends Error {} }));

import { ExerciseForm } from '@/components/workout/ExerciseForm';
import { SYNCED_EXERCISE_FIELDS } from '@/lib/workoutPresets';
import type { Exercise } from '@/types';

describe('bilingual edits never destroy the other language (B1.8 / EX-06, FD-01)', () => {
  const chicken = { en: 'Chicken breast', ar: 'صدر دجاج' };

  it('a coach editing the English keeps a real Arabic translation', () => {
    expect(applyLocalizedEdit(chicken, 'Chicken breast (grilled)', 'en')).toEqual({ en: 'Chicken breast (grilled)', ar: 'صدر دجاج' });
  });
  it('a client editing in Arabic keeps the coach’s English (the reverse direction)', () => {
    expect(applyLocalizedEdit(chicken, 'صدر دجاج مشوي', 'ar')).toEqual({ en: 'Chicken breast', ar: 'صدر دجاج مشوي' });
  });
  it('an empty or copied other language follows the edit (no stale copy left behind)', () => {
    expect(applyLocalizedEdit({ en: 'Oats', ar: 'Oats' }, 'Rolled oats', 'en')).toEqual({ en: 'Rolled oats', ar: 'Rolled oats' });
    expect(applyLocalizedEdit({ en: 'Oats', ar: '' }, 'Rolled oats', 'en')).toEqual({ en: 'Rolled oats', ar: 'Rolled oats' });
    expect(applyLocalizedEdit(undefined, ' New food ', 'en')).toEqual({ en: 'New food', ar: 'New food' });
  });
  it('flags a kept translation as possibly stale once the main text changed', () => {
    expect(secondLanguageStale(chicken, 'Chicken breast', 'en')).toBe(false);
    expect(secondLanguageStale(chicken, 'Salmon', 'en')).toBe(true);
    expect(secondLanguageStale({ en: 'Oats', ar: 'Oats' }, 'Rolled oats', 'en')).toBe(false); // a copy just follows
  });
  it('helpers', () => {
    expect(langOf('ar-eg')).toBe('ar');
    expect(langOf('en')).toBe('en');
    expect(setLocalized(' a ', ' ب ')).toEqual({ en: 'a', ar: 'ب' });
    expect(localizedEqual({ en: 'a ', ar: 'ب' }, { en: 'a', ar: 'ب ' })).toBe(true);
  });
});

describe('ExerciseForm (EX-06)', () => {
  const ex: Exercise = {
    id: 'ex1',
    name: 'Bench press',
    targetMuscle: 'chest',
    warmupSets: '1',
    warmupSetCount: 1,
    workingSets: 3,
    repRange: '8-10',
    restSec: 90,
    notes: { en: 'Keep your shoulder blades back', ar: 'ثبّت لوحي الكتف للخلف' },
    libraryExerciseId: 'lib1',
    librarySyncEnabled: true,
  } as Exercise;
  const touchedSynced = (a: Exercise, b: Exercise) => SYNCED_EXERCISE_FIELDS.filter((f) => JSON.stringify(a[f]) !== JSON.stringify(b[f]));

  it('changing only programming leaves every library field exactly as it was (no silent detach)', () => {
    const onSave = vi.fn();
    render(<ExerciseForm initial={ex} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('ex-working-sets'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    const saved = onSave.mock.calls[0][0] as Exercise;
    expect(saved.workingSets).toBe(4);
    expect(saved.notes).toBe(ex.notes); // the same object, untouched
    expect(saved.videoUrl).toBeUndefined(); // an absent link is not turned into null
    expect(touchedSynced(ex, saved)).toEqual([]);
  });

  it('editing the English notes keeps the Arabic, and shows it as possibly out of date', () => {
    const onSave = vi.fn();
    render(<ExerciseForm initial={ex} onSave={onSave} />);
    fireEvent.change(screen.getByTestId('ex-notes'), { target: { value: 'Retract the shoulder blades' } });
    expect(screen.getByTestId('ex-notes-ar-input')).toHaveValue('ثبّت لوحي الكتف للخلف');
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect((onSave.mock.calls[0][0] as Exercise).notes).toEqual({ en: 'Retract the shoulder blades', ar: 'ثبّت لوحي الكتف للخلف' });
  });

  it('the Arabic can be edited explicitly', () => {
    const onSave = vi.fn();
    render(<ExerciseForm initial={ex} onSave={onSave} />);
    fireEvent.click(screen.getByRole('button', { name: /arabic version/i }));
    fireEvent.change(screen.getByTestId('ex-notes-ar-input'), { target: { value: 'اسحب لوحي الكتف' } });
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    expect((onSave.mock.calls[0][0] as Exercise).notes).toEqual({ en: 'Keep your shoulder blades back', ar: 'اسحب لوحي الكتف' });
  });
});
