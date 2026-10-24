import { describe, expect, it } from 'vitest';
import {
  collatorFor,
  equipmentOptions,
  filterExercises,
  filterFoods,
  filterGroups,
  filterPrograms,
  filterSupplements,
  goalOptions,
  libraryParams,
  localizedName,
  muscleOptions,
  nextSort,
  normalizeSearch,
  parseLibraryQuery,
  segmentQuery,
  sortExercises,
  sortFoods,
  sortPrograms,
} from './libraryModel';
import type { Exercise, FoodGroup, LibraryFood, LibrarySupplement, WorkoutTemplate } from '@/types';

const ex = (id: string, p: Partial<Exercise> = {}): Exercise =>
  ({ id, name: id, targetMuscle: '', warmupSets: '0', workingSets: 3, repRange: '8-12', rir: '', tempo: '', notes: { en: '', ar: '' }, restSec: 90, videoId: null, ...p }) as Exercise;
const label = (m: string) => ({ chest: 'الصدر', quads: 'الفخذ الأمامي' })[m.toLowerCase()] ?? m;
const en = collatorFor('en');

describe('Library URL (B3.7)', () => {
  it('opens Programs by default; the old ?tab=groups is Foods › Swap groups', () => {
    expect(parseLibraryQuery(new URLSearchParams('')).segment).toBe('programs');
    expect(parseLibraryQuery(new URLSearchParams('tab=nonsense')).segment).toBe('programs');
    const legacy = parseLibraryQuery(new URLSearchParams('tab=groups'));
    expect([legacy.segment, legacy.view]).toEqual(['foods', 'groups']);
    expect(libraryParams(legacy).toString()).toBe('tab=foods&view=groups');
  });

  it('keeps search, filters and sort; drops what does not belong to the segment; unknown sorts fall back', () => {
    const q = parseLibraryQuery(new URLSearchParams('tab=exercises&q=press&muscle=Chest&equipment=Barbell&video=1&sort=demo&dir=desc&goal=strength'));
    expect(q).toMatchObject({ segment: 'exercises', q: 'press', muscle: 'Chest', equipment: 'Barbell', video: true, goal: '', sort: 'demo', dir: 'desc' });
    expect(libraryParams(q).toString()).toBe('tab=exercises&q=press&muscle=Chest&equipment=Barbell&video=1&sort=demo&dir=desc');
    expect(parseLibraryQuery(new URLSearchParams('tab=foods&sort=demo')).sort).toBe('name');
    expect(parseLibraryQuery(new URLSearchParams('tab=programs&muscle=Chest')).muscle).toBe('');
  });

  it('a "most first" sort starts descending and only a different direction is written to the URL', () => {
    const q = parseLibraryQuery(new URLSearchParams('tab=programs&sort=updated'));
    expect(q.dir).toBe('desc');
    expect(libraryParams(q).toString()).toBe('tab=programs&sort=updated');
    expect(nextSort(q, 'updated')).toEqual({ sort: 'updated', dir: 'asc' });
    expect(nextSort(q, 'name')).toEqual({ sort: 'name', dir: 'asc' });
    expect(segmentQuery('foods', 'groups')).toMatchObject({ segment: 'foods', view: 'groups', q: '', sort: 'name' });
  });
});

describe('search', () => {
  it('ignores case and Arabic diacritics / letter variants', () => {
    expect(normalizeSearch('  ShouFAN ')).toBe('shoufan');
    expect(normalizeSearch('شُوفَان')).toBe(normalizeSearch('شوفان'));
    expect(normalizeSearch('أرز')).toBe(normalizeSearch('ارز'));
    expect(normalizeSearch('سلطة')).toBe(normalizeSearch('سلطه'));
  });

  it('exercises: name, muscle (also its translated label), equipment, tags; filters combine', () => {
    const list = [
      ex('a', { name: 'Incline dumbbell press', targetMuscle: 'Chest', equipment: 'Dumbbell', videoUrl: 'https://youtu.be/dQw4w9WgXcQ' }),
      ex('b', { name: 'Bench press', targetMuscle: 'Chest', equipment: 'Barbell', tags: ['strength'] }),
      ex('c', { name: 'Front squat', targetMuscle: 'Quads', equipment: 'Barbell', videoUrl: 'https://drive.google.com/x' }),
    ];
    const run = (q: Partial<Parameters<typeof filterExercises>[1]>) => filterExercises(list, { q: '', muscle: '', equipment: '', video: false, ...q }, label).map((e) => e.id);
    expect(run({ q: 'dumbbell incline' })).toEqual([]); // one phrase, in order (synonyms are B4 search quality)
    expect(run({ q: 'press' })).toEqual(['a', 'b']);
    expect(run({ q: 'الصدر' })).toEqual(['a', 'b']);
    expect(run({ q: 'STRENGTH' })).toEqual(['b']);
    expect(run({ equipment: 'Barbell' })).toEqual(['b', 'c']);
    expect(run({ muscle: 'Chest', equipment: 'Barbell' })).toEqual(['b']);
    expect(run({ video: true })).toEqual(['a']); // a Drive link is not a playable video
  });

  it('foods search both languages; groups search their foods; supplements their dose', () => {
    const foods = [{ id: 'f1', name: { en: 'Oats', ar: 'شوفان' }, quantity: '80 g', calories: 300, protein: 10, carbs: 54, fats: 6 }] as LibraryFood[];
    expect(filterFoods(foods, 'شوفان')).toHaveLength(1);
    expect(filterFoods(foods, 'oat')).toHaveLength(1);
    const groups = [{ id: 'g1', coachId: 'c', name: 'Carbs', foods, createdAt: 0, updatedAt: 0 }] as FoodGroup[];
    expect(filterGroups(groups, 'oats')).toHaveLength(1);
    const supps = [{ id: 's1', name: 'Creatine', dose: { en: '5 g', ar: '٥ جم' } }] as LibrarySupplement[];
    expect(filterSupplements(supps, '٥')).toHaveLength(1);
  });

  it('programs: by name or goal label, and by goal', () => {
    const p = (id: string, goal: WorkoutTemplate['goal'], name = id) => ({ id, coachId: 'c', name, goal, splitType: 'ppl', days: [], exercises: {}, createdAt: 0, updatedAt: 0 }) as WorkoutTemplate;
    const list = [p('a', 'strength', 'Big three'), p('b', 'fat_loss', 'Lean')];
    const goal = (g: string) => ({ strength: 'Strength', fat_loss: 'Fat loss' })[g] ?? g;
    expect(filterPrograms(list, { q: 'fat', goal: '' }, goal).map((x) => x.id)).toEqual(['b']);
    expect(filterPrograms(list, { q: '', goal: 'strength' }, goal).map((x) => x.id)).toEqual(['a']);
    expect(goalOptions(list)).toEqual(['fat_loss', 'strength']);
  });
});

describe('sorting', () => {
  it('names sort naturally; demo puts videos, then images, then none; ties fall back to the name', () => {
    const list = [
      ex('n10', { name: 'Row 10' }),
      ex('n2', { name: 'Row 2', images: ['https://img.test/r.png'] }),
      ex('v', { name: 'Zercher squat', videoUrl: 'https://cdn.test/z.mp4' }),
    ];
    expect(sortExercises(list, 'name', 'asc', en, label).map((e) => e.id)).toEqual(['n2', 'n10', 'v']);
    expect(sortExercises(list, 'demo', 'asc', en, label).map((e) => e.id)).toEqual(['v', 'n2', 'n10']);
    expect(sortExercises(list, 'name', 'desc', en, label).map((e) => e.id)).toEqual(['v', 'n10', 'n2']);
  });

  it('foods by calories, programs by last update', () => {
    const f = (id: string, calories: number) => ({ id, name: { en: id, ar: '' }, quantity: '', calories, protein: 0, carbs: 0, fats: 0 }) as LibraryFood;
    expect(sortFoods([f('a', 100), f('b', 300)], 'calories', 'desc', en, 'en').map((x) => x.id)).toEqual(['b', 'a']);
    const p = (id: string, updatedAt: number) => ({ id, name: id, goal: 'custom', days: [], updatedAt }) as unknown as WorkoutTemplate;
    expect(sortPrograms([p('old', 1), p('new', 5)], 'updated', 'desc', en, (g) => g).map((x) => x.id)).toEqual(['new', 'old']);
  });
});

describe('options and names', () => {
  it('muscle options are the stored values with translated labels; equipment is de-duplicated', () => {
    const list = [ex('a', { targetMuscle: 'Chest', equipment: 'Barbell' }), ex('b', { targetMuscle: 'Chest ', equipment: ' Barbell' }), ex('c', { targetMuscle: 'Quads' })];
    expect(muscleOptions(list, label, collatorFor('ar'))).toEqual([
      { value: 'Chest', label: 'الصدر' },
      { value: 'Quads', label: 'الفخذ الأمامي' },
    ]);
    expect(equipmentOptions(list, en)).toEqual(['Barbell']);
  });

  it('a name shows in the reader’s language, falling back to the other', () => {
    expect(localizedName({ en: 'Oats', ar: 'شوفان' }, 'ar-eg')).toBe('شوفان');
    expect(localizedName({ en: 'Oats', ar: '' }, 'ar')).toBe('Oats');
    expect(localizedName({ en: '', ar: 'شوفان' }, 'en')).toBe('شوفان');
  });
});
