import { useState } from 'react';
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { SearchField, SelectField } from '@/components/ui/Field';
import { ErrorState } from '@/components/ui/ErrorState';
import { OfflineState, useQueryScreen } from '@/components/ui/ScreenState';
import { FoodThumb } from '@/components/food/FoodImage';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTaxonomyLabel } from '@/hooks/useCatalog';
import { isEstimate } from '@/lib/catalogText';
import { FavoriteButton, LibraryBadge, ScopeSwitch } from './LibraryRowParts';
import { listLibraryFoods, LIBRARY_KEY, type LibraryFoodRow, type LibraryScope } from '@/services/platform/libraryApi';
import type { CatalogTaxonomy } from '@/services/platform/catalogApi';

const PAGE = 30;

export interface FoodFilters {
  q: string;
  scope: LibraryScope;
  category: string;
}
export const EMPTY_FOOD_FILTERS: FoodFilters = { q: '', scope: 'all', category: '' };
export const foodRowKey = (r: LibraryFoodRow) => `${r.kind}:${r.id}`;
/** A food row's name in the reader's language. */
export function foodRowName(r: LibraryFoodRow, ar: boolean): string {
  const n = r.kind === 'shared' ? r.card.name : r.food.name;
  return (ar ? n.ar?.trim() || n.en : n.en?.trim() || n.ar) ?? '';
}

/**
 * B4.3 — the ONE food list a coach searches (Library › Foods and the plan editor's food sheet): all
 * of Forma's foods with their pictures and the coach's own foods, paged by the server, in English and
 * Arabic. All · Favourites · Mine. A shared food is used as it is (no "save to my library" first).
 */
export function LibraryFoodBrowser({
  taxonomy,
  onOpen,
  filters: controlled,
  onFilters,
  emptyMine,
  compact = false,
  selected,
  testId = 'library-foods',
}: {
  taxonomy: CatalogTaxonomy;
  onOpen: (row: LibraryFoodRow) => void;
  filters?: FoodFilters;
  onFilters?: (f: FoodFilters) => void;
  emptyMine?: React.ReactNode;
  /** Inside a sheet: a scrolling box instead of the page's list. */
  compact?: boolean;
  /** Picking several (a swap group): the ids already picked — rows show it, and a tap toggles. */
  selected?: ReadonlySet<string>;
  testId?: string;
}) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const lang = i18n.language.startsWith('ar') ? 'ar' : 'en';
  const [own, setOwn] = useState<FoodFilters>(EMPTY_FOOD_FILTERS);
  const f = controlled ?? own;
  const set = (patch: Partial<FoodFilters>) => (onFilters ? onFilters({ ...f, ...patch }) : setOwn({ ...f, ...patch }));
  const dq = useDebouncedValue(f.q.trim(), 250);
  const input = { q: dq, scope: f.scope, lang, limit: PAGE, ...(f.category ? { category: f.category } : {}) } as Parameters<typeof listLibraryFoods>[0];
  const res = useInfiniteQuery({
    queryKey: [...LIBRARY_KEY, 'foods', input],
    queryFn: ({ pageParam }) => listLibraryFoods({ ...input, offset: pageParam }),
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
  const filtering = !!(f.q.trim() || f.category);
  const categories = Object.keys(taxonomy.foodCategories)
    .map((id) => ({ id, text: label(taxonomy, 'foodCategories', id) }))
    .sort((a, b) => a.text.localeCompare(b.text, lang));

  return (
    <div className="space-y-3" data-testid={testId} data-scope={f.scope}>
      <ScopeSwitch value={f.scope} onChange={(scope) => set({ scope })} mineLabel={t('library.scope.myFoods')} testId={`${testId}-scope`} />
      {/* The search keeps most of the row: a long category name must not squeeze its placeholder. */}
      <div className="grid gap-2 sm:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <SearchField label={t('library.searchFoods')} placeholder={t('library.searchFoods')} value={f.q} onChange={(e) => set({ q: e.target.value })} data-testid={`${testId}-search`} />
        <SelectField label={t('catalog.foods.category')} srOnlyLabel value={f.category} onChange={(e) => set({ category: e.target.value })} data-testid={`${testId}-category`}>
          <option value="">{t('catalog.foods.anyCategory')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.text}
            </option>
          ))}
        </SelectField>
      </div>
      {res.data && (
        <p className="text-[12.5px] text-earth-subtle" data-testid={`${testId}-count`}>
          {t('library.count.foods', { count: total })}
        </p>
      )}

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
              <p>{t('library.empty.myFoods')}</p>
              {emptyMine}
            </div>
          ) : (
            <p>{t('coachLib.noResults')}</p>
          )}
        </div>
      ) : (
        <div className={compact ? 'max-h-[22rem] overflow-y-auto rounded-ui-control border border-line' : ''}>
          <ul className={`divide-y divide-line-soft bg-surface-card ${compact ? '' : 'overflow-hidden rounded-ui-surface border border-line-soft'}`} aria-busy={res.isFetching}>
            {items.map((r) => (
              <FoodRow key={foodRowKey(r)} row={r} taxonomy={taxonomy} selected={selected ? selected.has(r.id) : undefined} onOpen={() => onOpen(r)} />
            ))}
          </ul>
          {total > items.length && (
            <div className="space-y-1.5 py-3 text-center">
              <p className="text-[12px] text-earth-subtle" data-testid={`${testId}-more`}>
                {t('coachEditor.pickerTruncated', { shown: items.length, total })}
              </p>
              {/* Never on the previous search's rows while the new search loads (they are a placeholder). */}
              <Button variant="secondary" pending={res.isFetchingNextPage} disabled={!res.hasNextPage || res.isPlaceholderData} onClick={() => void res.fetchNextPage()} data-testid={`${testId}-show-more`}>
                {t('catalog.showMore')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const macroText = (kcal: number, p: number, c: number, f: number) => `${Math.round(kcal)} kcal · P${Math.round(p)} C${Math.round(c)} F${Math.round(f)}`;

function FoodRow({ row, taxonomy, selected, onOpen }: { row: LibraryFoodRow; taxonomy: CatalogTaxonomy; selected?: boolean; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const ar = i18n.language.startsWith('ar');
  const name = foodRowName(row, ar) || t('coachEditor.untitledFood');
  const image = row.kind === 'shared' ? row.card.image : row.image;
  const meta =
    row.kind === 'shared' ? (
      <>
        {label(taxonomy, 'foodStates', row.card.state)} · <bdi dir="ltr">{macroText(row.card.per100g.kcal, row.card.per100g.protein, row.card.per100g.carbs, row.card.per100g.fat)}</bdi> {t('catalog.foods.per100')}
      </>
    ) : (
      <>
        <bdi>{row.food.quantity}</bdi> · <bdi dir="ltr">{macroText(row.food.calories, row.food.protein, row.food.carbs, row.food.fats)}</bdi>
      </>
    );
  return (
    <li className={`flex items-center gap-1 ps-3 ${selected ? 'bg-brand/10' : ''}`} data-testid="library-food-row" data-id={row.id} data-kind={row.kind}>
      <button type="button" className="flex min-h-[3.75rem] min-w-0 flex-1 items-center gap-3 py-2 text-start" aria-pressed={selected} onClick={onOpen} data-testid="library-row-main">
        <FoodThumb image={image} size="md" />
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 font-medium leading-snug">
            <bdi>{name}</bdi>
          </span>
          <span className="block truncate text-[12px] text-earth-subtle">{meta}</span>
        </span>
        {row.kind === 'own' ? <LibraryBadge kind={row.customized ? 'customized' : 'mine'} /> : isEstimate(row.card) ? <span className="pill shrink-0 text-[11px]">{t('catalog.foods.estimate')}</span> : null}
        {selected === undefined ? (
          <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
        ) : (
          <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-brand bg-brand text-brand-ink' : 'border-line'}`} aria-hidden="true">
            {selected && <Icon name="check" size={14} />}
          </span>
        )}
      </button>
      <FavoriteButton kind="food" id={row.kind === 'own' ? (row.catalogId ?? row.id) : row.id} on={row.favorite} name={name} />
    </li>
  );
}
