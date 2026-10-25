import { describe, expect, it } from 'vitest';
import { collatorFor, filterGroups, filterPrograms, filterSupplements, goalOptions, libraryParams, localizedName, nextSort, normalizeSearch, parseLibraryQuery, segmentQuery, sortPrograms } from './libraryModel';
import type { FoodGroup, LibraryFood, LibrarySupplement, WorkoutTemplate } from '@/types';

const en = collatorFor('en');

describe('Library URL (B3.7)', () => {
  it('opens Programs by default; the old ?tab=groups is Foods › Swap groups', () => {
    expect(parseLibraryQuery(new URLSearchParams('')).segment).toBe('programs');
    expect(parseLibraryQuery(new URLSearchParams('tab=nonsense')).segment).toBe('programs');
    const legacy = parseLibraryQuery(new URLSearchParams('tab=groups'));
    expect([legacy.segment, legacy.view]).toEqual(['foods', 'groups']);
    expect(libraryParams(legacy).toString()).toBe('tab=foods&view=groups');
  });

  it('keeps search, scope and filters; drops what does not belong to the segment; unknown sorts fall back', () => {
    const q = parseLibraryQuery(new URLSearchParams('tab=exercises&q=press&scope=favorites&muscle=chest&equipment=barbell&demo=1&sort=demo&goal=strength&category=grains'));
    expect(q).toMatchObject({ segment: 'exercises', q: 'press', scope: 'favorites', muscle: 'chest', equipment: 'barbell', demo: true, goal: '', category: '', sort: 'name', dir: 'asc' });
    expect(libraryParams(q).toString()).toBe('tab=exercises&q=press&scope=favorites&muscle=chest&equipment=barbell&demo=1');
    const foods = parseLibraryQuery(new URLSearchParams('tab=foods&scope=mine&category=grains&sort=calories&muscle=chest'));
    expect(foods).toMatchObject({ scope: 'mine', category: 'grains', sort: 'name', muscle: '' });
    expect(libraryParams(foods).toString()).toBe('tab=foods&scope=mine&category=grains');
    // Swap groups, programs and supplements have no scope; an unknown scope is "all".
    expect(parseLibraryQuery(new URLSearchParams('tab=foods&view=groups&scope=mine&category=grains'))).toMatchObject({ scope: 'all', category: '' });
    expect(parseLibraryQuery(new URLSearchParams('tab=exercises&scope=everything')).scope).toBe('all');
    expect(parseLibraryQuery(new URLSearchParams('tab=programs&muscle=Chest&scope=mine'))).toMatchObject({ muscle: '', scope: 'all' });
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

  it('groups search their foods; supplements their dose (exercises and foods are searched on the server — library.test.ts)', () => {
    const foods = [{ id: 'f1', name: { en: 'Oats', ar: 'شوفان' }, quantity: '80 g', calories: 300, protein: 10, carbs: 54, fats: 6 }] as LibraryFood[];
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
  it('programs by name (naturally) and by last update', () => {
    const p = (id: string, updatedAt: number) => ({ id, name: id, goal: 'custom', days: [], updatedAt }) as unknown as WorkoutTemplate;
    expect(sortPrograms([p('old', 1), p('new', 5)], 'updated', 'desc', en, (g) => g).map((x) => x.id)).toEqual(['new', 'old']);
    expect(sortPrograms([p('Row 10', 1), p('Row 2', 1)], 'name', 'asc', en, (g) => g).map((x) => x.id)).toEqual(['Row 2', 'Row 10']);
  });
});

describe('options and names', () => {
  it('a name shows in the reader’s language, falling back to the other', () => {
    expect(localizedName({ en: 'Oats', ar: 'شوفان' }, 'ar-eg')).toBe('شوفان');
    expect(localizedName({ en: 'Oats', ar: '' }, 'ar')).toBe('Oats');
    expect(localizedName({ en: '', ar: 'شوفان' }, 'en')).toBe('شوفان');
  });
});
