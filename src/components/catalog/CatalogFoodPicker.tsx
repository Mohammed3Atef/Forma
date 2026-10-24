import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { Button } from '@/components/ui/Button';
import { SearchField, SelectField } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { ErrorState } from '@/components/ui/ErrorState';
import { FoodCardImage, FoodThumb } from '@/components/food/FoodImage';
import { OfflineState, useQueryScreen } from '@/components/ui/ScreenState';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useTaxonomyLabel } from '@/hooks/useCatalog';
import { foodPickFromCatalog, isEstimate, reserve, type FoodPick } from '@/lib/catalogCopy';
import { searchCatalogFoods, type CatalogFoodCard, type CatalogTaxonomy } from '@/services/platform/catalogApi';
import type { FoodProvenance } from '@/types';

const MIN_QUERY = 2;

/**
 * B4 — find a food in the curated Forma catalog and choose a serving. Values per 100 g come from
 * the named USDA record (or a labelled recipe / nearest-match estimate); the serving is a household
 * portion with a food-specific gram weight, or plain grams. The macros shown are computed, never
 * typed, and `onPick` hands back the numbers WITH where they came from.
 */
export function CatalogFoodPicker({ taxonomy, onPick, testId = 'catalog-foods' }: { taxonomy: CatalogTaxonomy; onPick: (p: FoodPick) => void; testId?: string }) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const ar = i18n.language.startsWith('ar');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [chosen, setChosen] = useState<CatalogFoodCard | null>(null);
  const dq = useDebouncedValue(q.trim(), 250);
  const active = dq.length >= MIN_QUERY || !!category;
  const input = { q: dq, limit: 20, ...(category ? { category } : {}) } as Parameters<typeof searchCatalogFoods>[0];
  const res = useQuery({ queryKey: ['catalog', 'foods', input], queryFn: () => searchCatalogFoods(input), enabled: active, placeholderData: keepPreviousData, staleTime: 10 * 60_000 });
  const screen = useQueryScreen(res, (d) => d.items.length === 0);
  // A new search typed offline must not show the previous search's results as if they were its own.
  const status = res.isPlaceholderData && res.fetchStatus === 'paused' ? 'offline' : screen.status;
  const name = (c: CatalogFoodCard) => (ar ? c.name.ar : c.name.en);

  if (chosen) return <ServingChooser card={chosen} taxonomy={taxonomy} onBack={() => setChosen(null)} onPick={onPick} testId={testId} />;

  return (
    <div className="space-y-2" data-testid={testId}>
      {/* The search keeps most of the row: a long category name must not squeeze its placeholder. */}
      <div className="grid grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-2">
        <SearchField aria-label={t('catalog.foods.search')} placeholder={t('catalog.foods.search')} value={q} onChange={(e) => setQ(e.target.value)} data-testid={`${testId}-search`} />
        <SelectField label={t('catalog.foods.category')} srOnlyLabel value={category} onChange={(e) => setCategory(e.target.value)} data-testid={`${testId}-category`}>
          <option value="">{t('catalog.foods.anyCategory')}</option>
          {Object.keys(taxonomy.foodCategories).map((id) => (
            <option key={id} value={id}>
              {label(taxonomy, 'foodCategories', id)}
            </option>
          ))}
        </SelectField>
      </div>
      {!active ? (
        <p className="text-[12.5px] text-earth-subtle">{t('catalog.foods.minQuery')}</p>
      ) : status === 'loading' ? (
        <p className="py-3 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : status === 'offline' ? (
        <OfflineState message={t('catalog.foods.offline')} onRetry={screen.retry} testId={`${testId}-offline`} />
      ) : status === 'error' ? (
        <ErrorState message={t('catalog.foods.loadFailed')} onRetry={screen.retry} testId={`${testId}-error`} />
      ) : status === 'empty' ? (
        <p className="py-3 text-center text-sm text-earth-muted" data-testid={`${testId}-empty`}>
          {t('catalog.foods.noResults')}
        </p>
      ) : (
        <div className="max-h-64 divide-y divide-line-soft overflow-y-auto rounded-ui-control border border-line" aria-busy={res.isFetching}>
          {res.data!.items.map((c) => (
            <button key={c.id} type="button" className="row min-h-ui-hit w-full gap-2.5 text-start" data-testid="catalog-food-row" data-id={c.id} onClick={() => setChosen(c)}>
              <FoodThumb image={c.image} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  <bdi>{name(c)}</bdi>
                </span>
                <span className="block truncate text-[12px] text-earth-subtle">
                  {label(taxonomy, 'foodStates', c.state)} · <bdi dir="ltr">{Math.round(c.per100g.kcal)} kcal</bdi> {t('catalog.foods.per100')}
                </span>
              </span>
              {isEstimate(c) && <span className="pill shrink-0">{t('catalog.foods.estimate')}</span>}
              <Icon name="chevron" size={16} mirror className="shrink-0 text-earth-subtle" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ServingChooser({ card, taxonomy, onBack, onPick, testId }: { card: CatalogFoodCard; taxonomy: CatalogTaxonomy; onBack: () => void; onPick: (p: FoodPick) => void; testId: string }) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const ar = i18n.language.startsWith('ar');
  const [portionId, setPortionId] = useState(card.portions[0]?.id ?? 'g');
  const [amount, setAmount] = useState<number | null>(card.portions.length ? 1 : 100);
  const pick = useMemo(() => (amount && amount > 0 ? foodPickFromCatalog(card, portionId, amount) : null), [card, portionId, amount]);
  const note = card.matchNote ?? card.recipeNote;
  return (
    <div className="space-y-3 rounded-ui-control border border-line p-3" data-testid={`${testId}-serving`} data-id={card.id}>
      <div className="flex items-start gap-2">
        <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-earth-muted" onClick={onBack} aria-label={t('common.back')}>
          <Icon name="chevronLeft" size={18} mirror />
        </button>
        <div className="min-w-0 flex-1 pt-2">
          <p className="font-medium">
            <bdi>{ar ? card.name.ar : card.name.en}</bdi>
          </p>
          <p className="text-[12px] text-earth-subtle">
            {label(taxonomy, 'foodStates', card.state)} · {label(taxonomy, 'foodCategories', card.category)}
          </p>
        </div>
      </div>
      <FoodCardImage image={card.image} credit={card.image ? t('foodImage.credit', { author: card.image.author, license: card.image.license }) : null} compact testId={`${testId}-image`} />
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t('catalog.foods.serving')}
          value={portionId}
          data-testid={`${testId}-portion`}
          onChange={(e) => {
            setPortionId(e.target.value);
            setAmount(e.target.value === 'g' ? 100 : 1);
          }}
        >
          {card.portions.map((p) => (
            <option key={p.id} value={p.id}>
              {(ar ? p.label.ar : p.label.en) + ` (${p.grams} ${ar ? 'جم' : 'g'})`}
            </option>
          ))}
          <option value="g">{t('catalog.foods.grams')}</option>
        </SelectField>
        <NumericField label={portionId === 'g' ? t('catalog.foods.grams') : t('catalog.foods.amount')} value={amount} onChange={setAmount} min={0} max={portionId === 'g' ? 5000 : 50} testId={`${testId}-amount`} />
      </div>
      {pick && (
        <p className="font-mono text-[13px]" dir="ltr" data-testid={`${testId}-macros`}>
          {pick.provenance.portion!.grams} g · {pick.macros.calories} kcal · P{pick.macros.protein} C{pick.macros.carbs} F{pick.macros.fats}
        </p>
      )}
      {note && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px] leading-relaxed" data-testid={`${testId}-note`}>
          <span className="font-semibold">{t('catalog.foods.estimate')}:</span> {ar ? note.ar : note.en}
        </p>
      )}
      <p className="text-[12px] text-earth-subtle" data-testid={`${testId}-source`}>
        {t(card.verification === 'recipe-estimate' ? 'catalog.foods.sourceRecipe' : 'catalog.foods.source')}
      </p>
      <Button fullWidth disabled={!pick} onClick={() => pick && onPick(pick)} data-testid={`${testId}-use`}>
        {t('catalog.foods.use')}
      </Button>
    </div>
  );
}

/**
 * B4 — change the serving of a food row that came from the catalog (same food, new amount or
 * grams): the values are recomputed from its stored per-100 g numbers, never typed.
 */
export function ServingEditor({ provenance, onChange, testId = 'serving-editor' }: { provenance: FoodProvenance; onChange: (r: NonNullable<ReturnType<typeof reserve>>) => void; testId?: string }) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const p = provenance.portion;
  const unit = p && p.id !== 'g' ? { id: p.id, grams: Math.round((p.grams / p.amount) * 10) / 10, label: p.label } : null;
  const [mode, setMode] = useState<'unit' | 'g'>(unit ? 'unit' : 'g');
  const amount = mode === 'unit' ? (p?.amount ?? 1) : (p?.grams ?? 100);
  const apply = (m: 'unit' | 'g', v: number | null) => {
    if (!v || v <= 0) return;
    const r = reserve(provenance, m === 'unit' ? unit : null, v);
    if (r) onChange(r);
  };
  return (
    <div className="grid grid-cols-2 gap-2" data-testid={testId}>
      <SelectField
        label={t('catalog.foods.serving')}
        value={mode}
        onChange={(e) => {
          const m = e.target.value as 'unit' | 'g';
          setMode(m);
          apply(m, m === 'unit' ? 1 : (p?.grams ?? 100));
        }}
      >
        {unit && <option value="unit">{(ar ? unit.label?.ar : unit.label?.en) ?? unit.id}{` (${unit.grams} ${ar ? 'جم' : 'g'})`}</option>}
        <option value="g">{t('catalog.foods.grams')}</option>
      </SelectField>
      <NumericField label={mode === 'g' ? t('catalog.foods.grams') : t('catalog.foods.amount')} value={amount} onChange={(v) => apply(mode, v)} min={0} max={mode === 'g' ? 5000 : 50} testId={`${testId}-amount`} />
    </div>
  );
}
