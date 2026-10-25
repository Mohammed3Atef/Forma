import type { FoodGroup, LibrarySupplement, LocalizedText, WorkoutTemplate } from '@/types';

/**
 * The coach Library's rules (B3.7, blueprint §6.6): one screen, four segments — Programs ·
 * Exercises · Foods (swap groups inside) · Supplements — with search, filters and sorting kept in
 * the URL so a reload, Back from a template or a deep link restores the same view. Everything
 * here is pure: the screen renders what these functions return.
 *
 * B4.3: Exercises and Foods are the ONE shared library (Forma's catalog + the coach's own items),
 * searched, filtered and ranked on the server (`library.ts`) — All · Favourites · Mine (`scope`).
 * Their muscle / equipment / category filters are catalog ids; they have no client-side sort.
 */

export type LibrarySegment = 'programs' | 'exercises' | 'foods' | 'supplements';
export const LIBRARY_SEGMENTS: LibrarySegment[] = ['programs', 'exercises', 'foods', 'supplements'];
export type FoodsView = 'foods' | 'groups';
export type SortDir = 'asc' | 'desc';

export type LibraryScope = 'all' | 'favorites' | 'mine';
const SCOPES: LibraryScope[] = ['all', 'favorites', 'mine'];

export const SORTS = {
  programs: ['name', 'goal', 'days', 'updated'],
  exercises: ['name'],
  foods: ['name'],
  groups: ['name', 'count'],
  supplements: ['name'],
} as const;
export type ProgramSort = (typeof SORTS.programs)[number];
export type GroupSort = (typeof SORTS.groups)[number];
export type SortKey = ProgramSort | GroupSort;

/** The sort a list starts with; a key whose natural order is "most first" starts descending. */
export const DEFAULT_DIR: Partial<Record<SortKey, SortDir>> = { updated: 'desc', count: 'desc' };

export interface LibraryQuery {
  segment: LibrarySegment;
  /** Foods only: the foods list or the swap groups. */
  view: FoodsView;
  q: string;
  /** Exercises / Foods: all of the library, the coach's favourites, or only their own items. */
  scope: LibraryScope;
  /** Exercises: catalog muscle / equipment ids. */
  muscle: string;
  equipment: string;
  /** Exercises: only those with a demonstration (video, animation or picture). */
  demo: boolean;
  /** Foods: a catalog food category id. */
  category: string;
  /** Programs: one goal. */
  goal: string;
  sort: SortKey;
  dir: SortDir;
}

/** The sort keys of the list a query shows. */
export function sortsOf(segment: LibrarySegment, view: FoodsView): readonly SortKey[] {
  if (segment === 'foods') return view === 'groups' ? SORTS.groups : SORTS.foods;
  return SORTS[segment];
}

/**
 * Reads the Library's URL. `tab` is the segment (Programs when absent); the old `?tab=groups`
 * (swap groups had their own tab before B3.7) is Foods › Swap groups. Unknown values fall back.
 */
export function parseLibraryQuery(params: URLSearchParams): LibraryQuery {
  const tab = params.get('tab') ?? '';
  const legacyGroups = tab === 'groups';
  const segment: LibrarySegment = legacyGroups ? 'foods' : (LIBRARY_SEGMENTS as string[]).includes(tab) ? (tab as LibrarySegment) : 'programs';
  const view: FoodsView = segment === 'foods' && (legacyGroups || params.get('view') === 'groups') ? 'groups' : 'foods';
  const allowed = sortsOf(segment, view);
  const rawSort = params.get('sort') ?? '';
  const sort = ((allowed as readonly string[]).includes(rawSort) ? rawSort : 'name') as SortKey;
  const rawDir = params.get('dir');
  const dir: SortDir = rawDir === 'asc' || rawDir === 'desc' ? rawDir : DEFAULT_DIR[sort] ?? 'asc';
  const shared = segment === 'exercises' || (segment === 'foods' && view === 'foods');
  const rawScope = params.get('scope') ?? '';
  return {
    segment,
    view,
    q: params.get('q') ?? '',
    scope: shared && (SCOPES as string[]).includes(rawScope) ? (rawScope as LibraryScope) : 'all',
    muscle: segment === 'exercises' ? params.get('muscle') ?? '' : '',
    equipment: segment === 'exercises' ? params.get('equipment') ?? '' : '',
    demo: segment === 'exercises' && params.get('demo') === '1',
    category: segment === 'foods' && view === 'foods' ? params.get('category') ?? '' : '',
    goal: segment === 'programs' ? params.get('goal') ?? '' : '',
    sort,
    dir,
  };
}

/**
 * The URL for a query: only what differs from the defaults, so `/coach/library?tab=exercises`
 * stays short. Keys the Library does not own (e.g. `new`, `open`) are left to the caller.
 */
export function libraryParams(q: LibraryQuery): URLSearchParams {
  const p = new URLSearchParams();
  p.set('tab', q.segment);
  if (q.segment === 'foods' && q.view === 'groups') p.set('view', 'groups');
  if (q.q) p.set('q', q.q);
  if (q.scope !== 'all') p.set('scope', q.scope);
  if (q.muscle) p.set('muscle', q.muscle);
  if (q.equipment) p.set('equipment', q.equipment);
  if (q.demo) p.set('demo', '1');
  if (q.category) p.set('category', q.category);
  if (q.goal) p.set('goal', q.goal);
  if (q.sort !== 'name') p.set('sort', q.sort);
  if (q.dir !== (DEFAULT_DIR[q.sort] ?? 'asc')) p.set('dir', q.dir);
  return p;
}

/** A fresh view of a segment: search, filters and sort reset (they belong to the list that set them). */
export function segmentQuery(segment: LibrarySegment, view: FoodsView = 'foods'): LibraryQuery {
  return { segment, view: segment === 'foods' ? view : 'foods', q: '', scope: 'all', muscle: '', equipment: '', demo: false, category: '', goal: '', sort: 'name', dir: 'asc' };
}

/** Clicking a column: the same key flips the direction; a new key starts in its natural order. */
export function nextSort(q: LibraryQuery, key: SortKey): Pick<LibraryQuery, 'sort' | 'dir'> {
  if (q.sort === key) return { sort: key, dir: q.dir === 'asc' ? 'desc' : 'asc' };
  return { sort: key, dir: DEFAULT_DIR[key] ?? 'asc' };
}

// ---- search ------------------------------------------------------------------------------------

/**
 * Search text: case-insensitive, and Arabic spelled loosely (diacritics ignored; أ إ آ ا, ى ي and
 * ة ه match each other) — so "شوفان" finds "شُوفان".
 */
export function normalizeSearch(s: string): string {
  return s
    .toLocaleLowerCase()
    .replace(/[ً-ْٰـ]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .trim();
}
const hit = (needle: string, ...hay: (string | undefined | null)[]) => !needle || hay.some((h) => !!h && normalizeSearch(h).includes(needle));
const loc = (l: LocalizedText | undefined | null) => [l?.en, l?.ar];

/** One collator per language: names sort the way a reader of that language expects. */
export function collatorFor(lang: string): Intl.Collator {
  return new Intl.Collator(lang.startsWith('ar') ? 'ar' : 'en', { sensitivity: 'base', numeric: true });
}

/** A name in the UI's language, falling back to the other one. */
export function localizedName(l: LocalizedText | undefined | null, lang: string): string {
  const ar = lang.startsWith('ar');
  return (ar ? l?.ar?.trim() || l?.en : l?.en?.trim() || l?.ar) ?? '';
}

function sortList<T>(list: T[], dir: SortDir, cmp: (a: T, b: T) => number, byName: (a: T, b: T) => number): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...list].sort((a, b) => sign * cmp(a, b) || byName(a, b));
}

// ---- swap groups, supplements, programs ---------------------------------------------------------

export function filterGroups(list: FoodGroup[], q: string): FoodGroup[] {
  const needle = normalizeSearch(q);
  return list.filter((g) => hit(needle, g.name, g.notes, ...g.foods.flatMap((f) => loc(f.name))));
}

export function sortGroups(list: FoodGroup[], sort: SortKey, dir: SortDir, collator: Intl.Collator): FoodGroup[] {
  const byName = (a: FoodGroup, b: FoodGroup) => collator.compare(a.name, b.name);
  return sortList(list, dir, sort === 'count' ? (a, b) => a.foods.length - b.foods.length : byName, byName);
}

export function filterSupplements(list: LibrarySupplement[], q: string): LibrarySupplement[] {
  const needle = normalizeSearch(q);
  return list.filter((s) => hit(needle, s.name, ...loc(s.dose), ...loc(s.timing)));
}

export function sortSupplements(list: LibrarySupplement[], dir: SortDir, collator: Intl.Collator): LibrarySupplement[] {
  const byName = (a: LibrarySupplement, b: LibrarySupplement) => collator.compare(a.name, b.name);
  return sortList(list, dir, byName, byName);
}

export function filterPrograms(list: WorkoutTemplate[], q: Pick<LibraryQuery, 'q' | 'goal'>, goalLabel: (goal: string) => string): WorkoutTemplate[] {
  const needle = normalizeSearch(q.q);
  return list.filter((p) => (!q.goal || p.goal === q.goal) && hit(needle, p.name, goalLabel(p.goal)));
}

export function sortPrograms(list: WorkoutTemplate[], sort: SortKey, dir: SortDir, collator: Intl.Collator, goalLabel: (goal: string) => string): WorkoutTemplate[] {
  const byName = (a: WorkoutTemplate, b: WorkoutTemplate) => collator.compare(a.name, b.name);
  const cmp =
    sort === 'goal'
      ? (a: WorkoutTemplate, b: WorkoutTemplate) => collator.compare(goalLabel(a.goal), goalLabel(b.goal))
      : sort === 'days'
        ? (a: WorkoutTemplate, b: WorkoutTemplate) => a.days.length - b.days.length
        : sort === 'updated'
          ? (a: WorkoutTemplate, b: WorkoutTemplate) => (a.updatedAt || a.createdAt || 0) - (b.updatedAt || b.createdAt || 0)
          : byName;
  return sortList(list, dir, cmp, byName);
}

/** Goals present in the coach's programs, in the editor's order. */
export function goalOptions(list: WorkoutTemplate[]): string[] {
  const order = ['hypertrophy', 'fat_loss', 'strength', 'beginner', 'advanced', 'custom'];
  const present = new Set(list.map((p) => p.goal));
  return [...order.filter((g) => present.has(g as WorkoutTemplate['goal'])), ...[...present].filter((g) => !order.includes(g))];
}
