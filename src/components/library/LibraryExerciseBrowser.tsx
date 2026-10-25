import { useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { SearchField, SelectField } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, useQueryScreen } from '@/components/ui/ScreenState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTaxonomyLabel } from '@/hooks/useCatalog';
import { exerciseDemo } from '@/lib/libraryMedia';
import { ExerciseThumb } from './ExerciseThumb';
import { FavoriteButton, ScopeSwitch, LibraryBadge } from './LibraryRowParts';
import { listLibraryExercises, LIBRARY_KEY, type LibraryExerciseRow, type LibraryScope } from '@/services/platform/libraryApi';
import type { CatalogTaxonomy } from '@/services/platform/catalogApi';

const PAGE = 30;

export interface ExerciseFilters {
  q: string;
  scope: LibraryScope;
  muscle: string;
  equipment: string;
  demo: boolean;
}
export const EMPTY_EXERCISE_FILTERS: ExerciseFilters = { q: '', scope: 'all', muscle: '', equipment: '', demo: false };
export const exerciseRowKey = (r: LibraryExerciseRow) => `${r.kind}:${r.id}`;

/**
 * B4.3 — the ONE exercise list a coach searches (Library and every plan picker): Forma's shared
 * catalog and the coach's own exercises together, paged by the server (30 at a time, "Show more"),
 * in English, Arabic and Egyptian gym words. Scopes: All · Favourites · Mine. Rows show a light
 * still (never a GIF), where the exercise comes from, and a favourite star. No import step: a shared
 * exercise is used as it is.
 *
 * `mode="pick"`: rows toggle a selection (the plan picker); `mode="browse"`: rows open the item.
 * Filters are controlled when `filters` / `onFilters` are given (the Library keeps them in the URL).
 */
export function LibraryExerciseBrowser({
  taxonomy,
  mode = 'browse',
  selected,
  onToggle,
  onOpen,
  filters: controlled,
  onFilters,
  emptyMine,
  testId = 'library-exercises',
}: {
  taxonomy: CatalogTaxonomy;
  mode?: 'browse' | 'pick';
  selected?: ReadonlySet<string>;
  onToggle?: (row: LibraryExerciseRow) => void;
  onOpen: (row: LibraryExerciseRow) => void;
  filters?: ExerciseFilters;
  onFilters?: (f: ExerciseFilters) => void;
  /** What "Mine" shows when the coach has no exercises yet (e.g. a "New exercise" button). */
  emptyMine?: React.ReactNode;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const lang = i18n.language.startsWith('ar') ? 'ar' : 'en';
  const [own, setOwn] = useState<ExerciseFilters>(EMPTY_EXERCISE_FILTERS);
  const f = controlled ?? own;
  const set = (patch: Partial<ExerciseFilters>) => (onFilters ? onFilters({ ...f, ...patch }) : setOwn({ ...f, ...patch }));
  const dq = useDebouncedValue(f.q.trim(), 250);
  const input = { q: dq, scope: f.scope, lang, limit: PAGE, ...(f.muscle ? { muscle: f.muscle } : {}), ...(f.equipment ? { equipment: f.equipment } : {}), ...(f.demo ? { demo: true } : {}) } as Parameters<typeof listLibraryExercises>[0];
  const res = useInfiniteQuery({
    queryKey: [...LIBRARY_KEY, 'exercises', input],
    queryFn: ({ pageParam }) => listLibraryExercises({ ...input, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length ? loaded : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
  const items = res.data?.pages.flatMap((p) => p.items) ?? [];
  const total = res.data?.pages[0]?.total ?? 0;
  const screen = useQueryScreen(res, (d) => d.pages[0]?.items.length === 0);
  const status = res.isPlaceholderData && res.fetchStatus === 'paused' ? 'offline' : screen.status;
  const opts = (table: 'muscles' | 'equipment') =>
    Object.keys(taxonomy[table])
      .map((id) => ({ id, text: label(taxonomy, table, id) }))
      .sort((a, b) => a.text.localeCompare(b.text, lang));
  const filtering = !!(f.q.trim() || f.muscle || f.equipment || f.demo);

  return (
    <div className="space-y-3" data-testid={testId} data-scope={f.scope}>
      <ScopeSwitch value={f.scope} onChange={(scope) => set({ scope })} mineLabel={t('library.scope.myExercises')} testId={`${testId}-scope`} />
      <SearchField label={t('library.searchExercises')} placeholder={t('library.searchExercises')} value={f.q} onChange={(e) => set({ q: e.target.value })} data-testid={`${testId}-search`} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField label={t('field.muscle')} srOnlyLabel value={f.muscle} onChange={(e) => set({ muscle: e.target.value })} data-testid={`${testId}-muscle`}>
          <option value="">{t('coachEditor.anyMuscle')}</option>
          {opts('muscles').map((o) => (
            <option key={o.id} value={o.id}>
              {o.text}
            </option>
          ))}
        </SelectField>
        <SelectField label={t('field.equipment')} srOnlyLabel value={f.equipment} onChange={(e) => set({ equipment: e.target.value })} data-testid={`${testId}-equipment`}>
          <option value="">{t('coachEditor.anyEquipment')}</option>
          {opts('equipment').map((o) => (
            <option key={o.id} value={o.id}>
              {o.text}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex min-h-ui-hit items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.demo} onChange={(e) => set({ demo: e.target.checked })} data-testid={`${testId}-demo`} />
          {t('library.withDemo')}
        </label>
        {res.data && (
          <span className="text-[12.5px] text-earth-subtle" data-testid={`${testId}-count`}>
            {t('library.count.exercises', { count: total })}
          </span>
        )}
      </div>

      {status === 'loading' ? (
        <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : status === 'offline' ? (
        <OfflineState message={t('library.offline')} onRetry={screen.retry} testId={`${testId}-offline`} />
      ) : status === 'error' ? (
        <ErrorState message={t('library.loadFailed')} onRetry={screen.retry} testId={`${testId}-error`} />
      ) : status === 'empty' ? (
        <div className="py-6 text-center text-sm text-earth-muted" data-testid={`${testId}-empty`}>
          {filtering ? (
            <p>{t('coachLib.noResults')}</p>
          ) : f.scope === 'favorites' ? (
            <p>{t('library.empty.favorites')}</p>
          ) : f.scope === 'mine' ? (
            <div className="space-y-3">
              <p>{t('library.empty.myExercises')}</p>
              {emptyMine}
            </div>
          ) : (
            <p>{t('coachLib.noResults')}</p>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line-soft overflow-hidden rounded-ui-surface border border-line-soft bg-surface-card" aria-busy={res.isFetching}>
            {items.map((r) => (
              <ExerciseRow key={exerciseRowKey(r)} row={r} taxonomy={taxonomy} mode={mode} selected={selected?.has(exerciseRowKey(r)) ?? false} onToggle={() => onToggle?.(r)} onOpen={() => onOpen(r)} />
            ))}
          </ul>
          {total > items.length && (
            <div className="space-y-1.5 text-center">
              <p className="text-[12px] text-earth-subtle" data-testid={`${testId}-more`}>
                {t('coachEditor.pickerTruncated', { shown: items.length, total })}
              </p>
              {/* Never on the previous search's rows while the new search loads (they are a placeholder). */}
              <Button variant="secondary" pending={res.isFetchingNextPage} disabled={!res.hasNextPage || res.isPlaceholderData} onClick={() => void res.fetchNextPage()} data-testid={`${testId}-show-more`}>
                {t('catalog.showMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExerciseRow({ row, taxonomy, mode, selected, onToggle, onOpen }: { row: LibraryExerciseRow; taxonomy: CatalogTaxonomy; mode: 'browse' | 'pick'; selected: boolean; onToggle: () => void; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const ar = i18n.language.startsWith('ar');
  const shared = row.kind === 'shared';
  const name = shared ? (ar ? row.card.name.ar || row.card.name.en : row.card.name.en) : row.exercise.names && ar ? row.exercise.names.ar || row.exercise.name : row.exercise.name || t('coachEditor.untitledExercise');
  const muscles = shared ? row.card.primaryMuscles : row.muscles;
  const equipment = shared ? row.card.equipment : row.equipment;
  const meta = shared || muscles.length
    ? [muscles[0] ? label(taxonomy, 'muscles', muscles[0]) : '', equipment.map((q) => label(taxonomy, 'equipment', q)).join(ar ? '، ' : ', ')].filter(Boolean).join(' · ')
    : [row.exercise.targetMuscle, row.exercise.equipment].filter(Boolean).join(' · ');
  // The coach's own link counts as a video only when Forma can play it (a Drive link is not — B3.7 honesty).
  const media = shared ? row.card.media : exerciseDemo(row.exercise as Parameters<typeof exerciseDemo>[0]).kind;
  const thumb = shared ? (row.card.thumb ? { thumbUrl: row.card.thumb.url, imageUrl: null } : { thumbUrl: null, imageUrl: null }) : row.exercise;
  const main = (
    <>
      <ExerciseThumb ex={thumb} size="md" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-medium leading-snug">
          <bdi>{name}</bdi>
        </span>
        <span className="block truncate text-[12px] text-earth-subtle">
          <bdi>{meta || t('coachLib.noMeta')}</bdi>
        </span>
      </span>
      {!shared && <LibraryBadge kind={row.customized ? 'customized' : 'mine'} />}
      <span className="flex w-4 shrink-0 items-center justify-center text-earth-subtle" data-testid={`library-media-${media}`} title={t(media === 'video' ? 'library.demo.video' : media === 'animation' ? 'library.demo.animation' : media === 'image' ? 'library.demo.image' : 'library.demo.none')}>
        {media !== 'none' && <Icon name={media === 'video' ? 'video' : media === 'animation' ? 'play' : 'image'} size={16} />}
      </span>
    </>
  );
  return (
    <li className={`flex items-center gap-1 ps-3 ${selected ? 'bg-brand/10' : ''}`} data-testid="library-exercise-row" data-id={row.id} data-kind={row.kind}>
      <button type="button" className="flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 py-2 text-start" aria-pressed={mode === 'pick' ? selected : undefined} onClick={mode === 'pick' ? onToggle : onOpen} data-testid="library-row-main">
        {main}
        {mode === 'pick' && (
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`} aria-hidden="true">
            {selected && <Icon name="check" size={14} />}
          </span>
        )}
      </button>
      <FavoriteButton kind="exercise" id={row.kind === 'own' ? (row.catalogId ?? row.id) : row.id} on={row.favorite} name={name} />
      {mode === 'pick' && shared ? (
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center text-earth-subtle" onClick={onOpen} aria-label={t('catalog.previewNamed', { name })} data-testid="library-row-preview">
          <Icon name="eye" size={18} />
        </button>
      ) : (
        <span className="w-2 shrink-0" aria-hidden="true" />
      )}
    </li>
  );
}
