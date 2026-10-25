import { lazy, Suspense, useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SegmentedControl } from '@/components/ui/Tabs';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { LoadingState } from '@/components/ui/LoadingState';
import { TagInput } from '@/components/TagInput';
import { LazyFoodImageEditor } from '@/components/food/LazyFood';
import { FoodCardImage } from '@/components/food/FoodImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { LibraryFoodBrowser, type FoodFilters } from '@/components/library/LibraryFoodBrowser';
import { useCatalogMeta, useTaxonomyLabel } from '@/hooks/useCatalog';
import { uid } from '@/lib/utils';
import { applyLocalizedEdit, secondLanguageStale, setLocalized } from '@/lib/localizedText';
import { localizedName, segmentQuery } from '@/lib/libraryModel';
import { PROVENANCE_KEYS } from '@/lib/catalogText';
import { catalogFoodCard, isCatalogFoodId } from '@/lib/foodUse';
import { deleteFood, getFood, saveFood } from '@/services/platform/coachAssetsApi';
import { getCatalogFood, type CatalogTaxonomy } from '@/services/platform/catalogApi';
import { LIBRARY_KEY, type LibraryFoodRow } from '@/services/platform/libraryApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { FoodImageRef, LibraryFood, LocalizedText } from '@/types';
import { DetailSheet, UseInPlanSheet, useCanEdit, type SegmentProps } from './parts';
import { errorMessage } from '@/lib/errorMessage';

// Swap groups load when that view is opened.
const SwapGroupsView = lazy(() => import('./SwapGroupsView'));

/** A Forma food as the library list sends it. */
type LibraryFoodCard = Extract<LibraryFoodRow, { kind: 'shared' }>['card'];

/**
 * Library › Foods (B3.7; B4.3): ONE list — all of Forma's foods, with their pictures, and the coach's
 * own — All · Favourites · My foods, searched in English and Arabic, by category. A Forma food opens
 * read-first (picture and credit, values per 100 g with their source, household servings) and goes
 * straight into a client's plan; "Customise" makes the coach's own version (name, serving, numbers,
 * picture) and "Reset to Forma's version" removes it again — Forma's catalog itself never changes.
 * Swap groups (sets of interchangeable foods a client may swap between) live in the same segment.
 */
export default function FoodsSegment(props: SegmentProps) {
  const { t } = useTranslation();
  const { query, setQuery } = props;
  return (
    <>
      <SegmentedControl
        className="seg-quiet mb-3 max-w-xs" /* a view switch, not the screen's action: neutral "on" (B2 rule) */
        label={t('library.foodsView')}
        testIdPrefix="lib-foods-view"
        value={query.view}
        options={[
          { value: 'foods', label: t('library.views.foods') },
          { value: 'groups', label: t('library.views.groups') },
        ]}
        onChange={(view) => setQuery({ ...segmentQuery('foods', view) })}
      />
      {query.view === 'groups' ? (
        <Suspense fallback={<Skeleton className="h-64 w-full rounded-ui-surface" />}>
          <SwapGroupsView {...props} />
        </Suspense>
      ) : (
        <FoodsView {...props} />
      )}
    </>
  );
}

// ---- foods ----------------------------------------------------------------------------------------

interface FoodForm {
  /** The stored food (or the customised Forma food) the form edits; null for a new one. */
  base: LibraryFood | null;
  isNew: boolean;
  title: string;
  name: string;
  /** FD-01: the stored name, so an edit never copies English over a real Arabic name. */
  nameOrig: LocalizedText | null;
  nameAr: string;
  nameArTouched: boolean;
  quantity: string;
  macros: Record<'calories' | 'protein' | 'carbs' | 'fats', number | null>;
  category: string;
  tags: string[];
  /** B4.1: the food's picture — the coach's own upload or the Forma picture it came with. */
  image: FoodImageRef | null;
  /** Forma's picture of this food, which "Restore Forma's picture" brings back. */
  formaImage: FoodImageRef | null;
}
const blankFood = (): FoodForm => ({ base: null, isNew: true, title: '', name: '', nameOrig: null, nameAr: '', nameArTouched: false, quantity: '', macros: { calories: null, protein: null, carbs: null, fats: null }, category: '', tags: [], image: null, formaImage: null });
const formOf = (f: LibraryFood, forma: FoodImageRef | null): Omit<FoodForm, 'isNew' | 'title'> => ({
  base: f,
  name: f.name.en,
  nameOrig: f.name,
  nameAr: f.name.ar ?? '',
  nameArTouched: false,
  quantity: f.quantity ?? '',
  macros: { calories: f.calories, protein: f.protein, carbs: f.carbs, fats: f.fats },
  category: f.category ?? '',
  tags: f.tags ?? [],
  image: f.image ?? null,
  formaImage: forma,
});

function FoodsView({ coachId, query, setQuery, createSignal, onCreateHandled, openId, onOpened }: SegmentProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { canEdit, reason } = useCanEdit();
  const catalog = useCatalogMeta();
  const lang = i18n.language;
  const [shared, setShared] = useState<LibraryFoodCard | null>(null);
  const [viewing, setViewing] = useState<LibraryFood | null>(null);
  const [form, setForm] = useState<FoodForm | null>(null);
  const [using, setUsing] = useState<{ id: string; name: string } | null>(null);
  const name = (f: LibraryFood) => localizedName(f.name, lang) || t('coachEditor.untitledFood');

  const filters: FoodFilters = { q: query.q, scope: query.scope, category: query.category };
  const onFilters = (f: FoodFilters) => setQuery({ q: f.q, scope: f.scope, category: f.category });

  useEffect(() => {
    if (createSignal <= 0) return;
    setForm(blankFood());
    onCreateHandled();
  }, [createSignal, onCreateHandled]);
  // ⌘K / a link to one food: a Forma food by its catalog id, an own one fetched.
  useEffect(() => {
    if (!openId) return;
    if (isCatalogFoodId(openId)) void getCatalogFood(openId).then((f) => setShared(catalogFoodCard(f)), () => undefined);
    else void getFood(coachId, openId).then(setViewing, () => undefined);
    onOpened();
  }, [openId, coachId, onOpened]);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: LIBRARY_KEY });
  };
  const save = useMutation({
    mutationFn: (f: LibraryFood) => saveFood(coachId, f),
    onSuccess: () => {
      setForm(null);
      invalidate();
      showToast({ title: t('common.saved'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: form?.title ?? t('coachFoods.newFood'), message: errorMessage(e, t, 'common.savedFailed') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFood(coachId, id),
    onSuccess: (_v, id) => {
      setViewing(null);
      invalidate();
      showToast({ title: id.startsWith('cat-') ? t('library.resetDone') : t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const remove = async (f: LibraryFood) => {
    const reset = !!f.catalogId;
    const ok = await confirmDialog(
      reset
        ? { title: t('library.reset'), message: t('library.resetConfirm', { name: name(f) }), confirmLabel: t('library.reset') }
        : { title: t('common.delete'), message: t('common.confirmDeleteName', { name: name(f) }), danger: true, confirmLabel: t('common.delete') },
    );
    if (ok) del.mutate(f.id);
  };

  /** "Customise": the coach's version of a Forma food, from its first serving — saved only on Save. */
  const customize = async (card: LibraryFoodCard) => {
    const { foodPickFromCatalog } = await import('@/lib/catalogCopy'); // loads with the first customisation
    const portion = card.portions[0];
    const p = foodPickFromCatalog(card, portion?.id ?? 'g', portion ? 1 : 100);
    const base: LibraryFood = { id: `cat-${card.id}`, name: p.name, quantity: p.quantity, ...p.macros, ...p.provenance, ...(p.image ? { image: p.image } : {}) };
    setShared(null);
    setForm({ ...formOf(base, p.image), isNew: true, title: t('library.customizeTitle', { name: localizedName(card.name, lang) }) });
  };
  /** Edit an own food; a customised one can restore Forma's picture. */
  const edit = async (f: LibraryFood) => {
    setViewing(null);
    let forma: FoodImageRef | null = f.image?.source === 'forma-catalog' ? f.image : null;
    if (!forma && f.catalogId) {
      const [card, { foodImageFromCatalog }] = await Promise.all([getCatalogFood(f.catalogId).catch(() => null), import('@/lib/catalogCopy')]);
      forma = card ? foodImageFromCatalog(card.id, card.image) : null;
    }
    setForm({ ...formOf(f, forma), isNew: false, title: t('library.editFood') });
  };

  const submit = () => {
    if (!form) return;
    const base = form.base;
    const macros = { calories: Math.max(0, form.macros.calories ?? 0), protein: Math.max(0, form.macros.protein ?? 0), carbs: Math.max(0, form.macros.carbs ?? 0), fats: Math.max(0, form.macros.fats ?? 0) };
    const food: LibraryFood = {
      ...(base ?? {}),
      id: base?.id ?? uid('food'),
      // FD-01: never copy the English name over a real Arabic one.
      name: form.nameArTouched ? setLocalized(form.name, form.nameAr) : applyLocalizedEdit(form.nameOrig, form.name, 'en'),
      quantity: form.quantity.trim(),
      ...macros,
    };
    // Typed numbers make the values the coach's own: the source claim goes (the catalog link stays — it is what "Reset" undoes).
    const typed = base && (food.quantity !== (base.quantity ?? '').trim() || (['calories', 'protein', 'carbs', 'fats'] as const).some((k) => macros[k] !== base[k]));
    if (typed) for (const k of PROVENANCE_KEYS) if (k !== 'catalogId' && k !== 'catalogRev') delete food[k];
    if (form.category.trim()) food.category = form.category.trim();
    else delete food.category;
    if (form.tags.length) food.tags = form.tags;
    else delete food.tags;
    if (form.image) food.image = form.image;
    else delete food.image;
    save.mutate(food);
  };

  if (!catalog.taxonomy) return <LoadingState count={4} />;
  const taxonomy = catalog.taxonomy;
  return (
    <>
      <LibraryFoodBrowser
        taxonomy={taxonomy}
        filters={filters}
        onFilters={onFilters}
        onOpen={(r) => (r.kind === 'shared' ? setShared(r.card) : setViewing(r.food as unknown as LibraryFood))}
        emptyMine={
          <Button icon="plus" disabled={!canEdit} title={reason} onClick={() => setForm(blankFood())} data-testid="food-new-first">
            {t('coachFoods.newFood')}
          </Button>
        }
        testId="lib-foods"
      />

      {/* A Forma food: read-first, then use it or make it your own. */}
      <DetailSheet
        open={!!shared}
        onClose={() => setShared(null)}
        title={shared ? localizedName(shared.name, lang) : t('coachFoods.food')}
        testId="food-shared-view"
        primary={
          shared ? (
            <Button icon="users" fullWidth disabled={!canEdit} title={reason} data-testid="food-use" onClick={() => { setUsing({ id: shared.id, name: localizedName(shared.name, lang) }); setShared(null); }}>
              {t('library.use.action')}
            </Button>
          ) : null
        }
        secondary={
          shared ? (
            <Button variant="secondary" icon="edit" disabled={!canEdit} title={reason} data-testid="food-customize" onClick={() => void customize(shared)}>
              {t('library.customize')}
            </Button>
          ) : null
        }
      >
        {shared && <SharedFoodDetail card={shared} taxonomy={taxonomy} />}
      </DetailSheet>

      {/* The coach's own food (or their version of a Forma one). */}
      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? name(viewing) : t('coachFoods.food')}
        testId="food-view"
        primary={
          viewing ? (
            <Button icon="users" fullWidth disabled={!canEdit} title={reason} data-testid="food-use" onClick={() => { setUsing({ id: viewing.id, name: name(viewing) }); setViewing(null); }}>
              {t('library.use.action')}
            </Button>
          ) : null
        }
        secondary={
          viewing ? (
            <>
              <Button variant="secondary" icon="edit" disabled={!canEdit} title={reason} data-testid="food-view-edit" onClick={() => void edit(viewing)}>
                {t('common.edit')}
              </Button>
              {viewing.catalogId ? (
                <Button variant="ghost" icon="rotate" disabled={!canEdit || del.isPending} title={reason} data-testid="food-reset" onClick={() => void remove(viewing)}>
                  {t('library.reset')}
                </Button>
              ) : (
                <IconButton icon="trash" label={t('library.deleteItem', { name: name(viewing) })} className="text-danger" disabled={!canEdit || del.isPending} data-testid="food-delete" onClick={() => void remove(viewing)} />
              )}
            </>
          ) : null
        }
      >
        {viewing && <FoodDetail food={viewing} />}
      </DetailSheet>

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.title ?? t('coachFoods.newFood')}>
        {form && (
          <div className="space-y-3" data-testid="food-lib-form">
            <TextInput label={t('field.name')} data-testid="lf-name" placeholder={t('coachEditor.foodName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" />
            <SecondLanguageField lang="ar" testId="lf-name-ar" value={form.nameAr} onChange={(v) => setForm({ ...form, nameAr: v, nameArTouched: true })} stale={!form.nameArTouched && secondLanguageStale(form.nameOrig, form.name, 'en')} />
            {/* An upload finishes later: the update is functional, so typing meanwhile is kept. */}
            <LazyFoodImageEditor value={form.image} formaImage={form.formaImage} name={{ en: form.name, ar: form.nameAr }} testId="lf-image" onChange={(image) => setForm((cur) => (cur ? { ...cur, image } : cur))} />
            <TextInput label={t('library.col.serving')} data-testid="lf-quantity" placeholder={t('coachFoods.serving')} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} dir="auto" />
            <div className="grid grid-cols-2 gap-3">
              {(['calories', 'protein', 'carbs', 'fats'] as const).map((k) => (
                <NumericField
                  key={k}
                  label={k === 'calories' ? t('coachEditor.caloriesKcal') : t('coachEditor.macroGrams', { name: t(`nutrition.${k}`) })}
                  testId={`lf-${k}`}
                  min={0}
                  max={k === 'calories' ? 10000 : 1000}
                  value={form.macros[k]}
                  onChange={(v) => setForm({ ...form, macros: { ...form.macros, [k]: v } })}
                />
              ))}
            </div>
            <TextInput label={t('field.category')} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} dir="auto" />
            <div>
              <div className="label mb-1.5">{t('coachLib.tags')}</div>
              <TagInput values={form.tags} onChange={(v) => setForm({ ...form, tags: v })} placeholder={t('coachLib.tagsPlaceholder')} />
            </div>
            <SubmitButton type="button" data-testid="lf-save" disabled={!form.name.trim() && !form.nameAr.trim()} pending={save.isPending} onClick={submit} fullWidth>
              {t('common.save')}
            </SubmitButton>
          </div>
        )}
      </Sheet>
      <UseInPlanSheet coachId={coachId} item={using ? { kind: 'food', ...using } : null} onClose={() => setUsing(null)} />
    </>
  );
}

const macroCell = (label: string, value: number, unit: string) => (
  <div className="rounded-ui-control border border-line-soft bg-surface-raised px-3 py-2.5 text-center">
    <div className="font-mono text-[18px] font-semibold tabular-nums">{value}</div>
    <div className="text-[12px] uppercase tracking-wide text-earth-subtle">
      {label} {unit ? `(${unit})` : ''}
    </div>
  </div>
);

/** A Forma food: its picture and credit, values per 100 g with their source, and its household servings. */
function SharedFoodDetail({ card, taxonomy }: { card: LibraryFoodCard; taxonomy: CatalogTaxonomy }) {
  const { t, i18n } = useTranslation();
  const label = useTaxonomyLabel();
  const ar = i18n.language.startsWith('ar');
  const other = ar ? card.name.en : card.name.ar;
  const note = card.matchNote ?? card.recipeNote;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return (
    <div className="space-y-4">
      <FoodCardImage image={card.image} credit={card.image ? t('foodImage.credit', { author: card.image.author, license: card.image.license }) : null} compact testId="food-shared-image" />
      {other?.trim() ? (
        <p className="text-[13.5px] text-earth-muted">
          <bdi>{other}</bdi>
        </p>
      ) : null}
      <p className="text-[12.5px] text-earth-subtle">
        {label(taxonomy, 'foodCategories', card.category)} · {label(taxonomy, 'foodStates', card.state)} · {t('catalog.foods.per100')}
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="food-shared-per100">
        {macroCell(t('nutrition.calories'), Math.round(card.per100g.kcal), t('common.kcal'))}
        {macroCell(t('nutrition.protein'), r1(card.per100g.protein), 'g')}
        {macroCell(t('nutrition.carbs'), r1(card.per100g.carbs), 'g')}
        {macroCell(t('nutrition.fats'), r1(card.per100g.fat), 'g')}
      </div>
      {card.portions.length > 0 && (
        <div>
          <p className="label mb-1.5">{t('catalog.foods.serving')}</p>
          <ul className="flex flex-wrap gap-1.5">
            {card.portions.map((p) => (
              <li key={p.id} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-earth-muted">
                <bdi>{ar ? p.label.ar : p.label.en}</bdi> <bdi dir="ltr">({p.grams} g)</bdi>
              </li>
            ))}
          </ul>
        </div>
      )}
      {note && (
        <p className="rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[12.5px] leading-relaxed">
          <span className="font-semibold">{t('catalog.foods.estimate')}:</span> {ar ? note.ar : note.en}
        </p>
      )}
      <p className="text-[12px] text-earth-subtle">{t(card.verification === 'recipe-estimate' ? 'catalog.foods.sourceRecipe' : 'catalog.foods.source')}</p>
    </div>
  );
}

function FoodDetail({ food }: { food: LibraryFood }) {
  const { t, i18n } = useTranslation();
  const ar = i18n.language.startsWith('ar');
  const other = ar ? food.name.en : food.name.ar;
  const cell = (label: string, value: number, unit: string) => (
    <div className="rounded-ui-control border border-line-soft bg-surface-raised px-3 py-2.5 text-center">
      <div className="font-mono text-[18px] font-semibold tabular-nums">{value}</div>
      <div className="text-[12px] uppercase tracking-wide text-earth-subtle">
        {label} {unit ? `(${unit})` : ''}
      </div>
    </div>
  );
  const credit = food.image?.source === 'forma-catalog' && food.image.author ? t('foodImage.credit', { author: food.image.author, license: food.image.license ?? '' }) : null;
  return (
    <div className="space-y-4">
      <FoodCardImage image={food.image} credit={credit} compact testId="food-view-image" />
      {other?.trim() && other.trim() !== localizedName(food.name, i18n.language) ? (
        <p className="text-[13.5px] text-earth-muted" data-testid="food-view-other-name">
          <bdi>{other}</bdi>
        </p>
      ) : null}
      <p className="text-[13.5px]">
        <span className="text-earth-subtle">{t('library.col.serving')}: </span>
        <bdi className="font-medium">{food.quantity || '—'}</bdi>
      </p>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {cell(t('nutrition.calories'), food.calories, t('common.kcal'))}
        {cell(t('nutrition.protein'), food.protein, 'g')}
        {cell(t('nutrition.carbs'), food.carbs, 'g')}
        {cell(t('nutrition.fats'), food.fats, 'g')}
      </div>
      {food.category || food.tags?.length ? (
        <div className="flex flex-wrap gap-1.5">
          {[food.category, ...(food.tags ?? [])].filter(Boolean).map((tg) => (
            <span key={tg} className="rounded-full border border-line px-2.5 py-1 text-[12px] text-earth-muted">
              <bdi>{tg}</bdi>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
