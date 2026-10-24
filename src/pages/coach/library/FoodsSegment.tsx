import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { NumericField } from '@/components/ui/NumericField';
import { SegmentedControl } from '@/components/ui/Tabs';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { TagInput } from '@/components/TagInput';
import { LazyFoodImageEditor } from '@/components/food/LazyFood';
import { FoodCardImage, FoodThumb } from '@/components/food/FoodImage';
import { Skeleton } from '@/components/ui/Skeleton';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { uid } from '@/lib/utils';
import { applyLocalizedEdit, secondLanguageStale, setLocalized } from '@/lib/localizedText';
import { collatorFor, filterFoods, localizedName, nextSort, segmentQuery, sortFoods, type SortKey } from '@/lib/libraryModel';
import { bulkDeleteFoods, deleteFood, listFoods, saveFood } from '@/services/platform/coachAssetsApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { FoodImageRef, LibraryFood, LocalizedText } from '@/types';
import { DetailSheet, ListBody, StarterPanel, Toolbar, UseInPlanSheet, useBulkDelete, useCanEdit, usePaged, type SegmentProps } from './parts';
import { errorMessage } from '@/lib/errorMessage';

// Swap groups load when that view is opened.
const SwapGroupsView = lazy(() => import('./SwapGroupsView'));

/**
 * Library › Foods (B3.7): the coach's foods and, inside the same segment, their swap groups (sets
 * of interchangeable foods a client may swap between). Same data, same saves as before; foods open
 * read-first and can be used in a client's nutrition plan.
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

const macroLine = (f: Pick<LibraryFood, 'calories' | 'protein' | 'carbs' | 'fats'>, kcal: string) => `${f.calories} ${kcal} · P ${f.protein} · C ${f.carbs} · F ${f.fats}`;

// ---- foods ----------------------------------------------------------------------------------------

interface FoodForm {
  id: string | null;
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
  formaImage: FoodImageRef | null;
}
const blankFood = (): FoodForm => ({ id: null, name: '', nameOrig: null, nameAr: '', nameArTouched: false, quantity: '', macros: { calories: null, protein: null, carbs: null, fats: null }, category: '', tags: [], image: null, formaImage: null });
const formOf = (f: LibraryFood): FoodForm => ({
  id: f.id,
  name: f.name.en,
  nameOrig: f.name,
  nameAr: f.name.ar ?? '',
  nameArTouched: false,
  quantity: f.quantity ?? '',
  macros: { calories: f.calories, protein: f.protein, carbs: f.carbs, fats: f.fats },
  category: f.category ?? '',
  tags: f.tags ?? [],
  image: f.image ?? null,
  formaImage: f.image?.source === 'forma-catalog' ? f.image : null,
});

function FoodsView({ coachId, query, setQuery, createSignal, onCreateHandled, openId, onOpened }: SegmentProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const { canEdit, reason } = useCanEdit();
  const lang = i18n.language;
  const foods = useQuery({ queryKey: ['foods', coachId], queryFn: () => listFoods(coachId), enabled: !!coachId });
  const all = useMemo(() => foods.data ?? [], [foods.data]);
  const collator = useMemo(() => collatorFor(lang), [lang]);
  const [viewing, setViewing] = useState<LibraryFood | null>(null);
  const [form, setForm] = useState<FoodForm | null>(null);
  const [using, setUsing] = useState<LibraryFood | null>(null);

  useEffect(() => {
    if (createSignal <= 0) return;
    setForm(blankFood());
    onCreateHandled();
  }, [createSignal, onCreateHandled]);
  useEffect(() => {
    if (!openId || !foods.data) return;
    const f = foods.data.find((x) => x.id === openId);
    if (f) setViewing(f);
    onOpened();
  }, [openId, foods.data, onOpened]);

  const filtered = useMemo(() => sortFoods(filterFoods(all, query.q), query.sort, query.dir, collator, lang), [all, query.q, query.sort, query.dir, collator, lang]);
  const { shown, footer } = usePaged(filtered, desktop, JSON.stringify([query.q, query.sort, query.dir]));
  const name = (f: LibraryFood) => localizedName(f.name, lang) || t('coachEditor.untitledFood');

  const save = useMutation({
    mutationFn: (f: LibraryFood) => saveFood(coachId, f),
    onSuccess: () => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['foods', coachId] });
      showToast({ title: t('common.saved'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('coachFoods.newFood'), message: errorMessage(e, t, 'common.savedFailed') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFood(coachId, id),
    onSuccess: () => {
      setViewing(null);
      void qc.invalidateQueries({ queryKey: ['foods', coachId] });
      showToast({ title: t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const remove = async (f: LibraryFood) => {
    if (await confirmDialog({ title: t('common.delete'), message: t('common.confirmDeleteName', { name: name(f) }), danger: true, confirmLabel: t('common.delete') })) del.mutate(f.id);
  };
  const bulk = useBulkDelete((ids) => bulkDeleteFoods(coachId, ids), () => void qc.invalidateQueries({ queryKey: ['foods', coachId] }));

  const submit = () => {
    if (!form) return;
    const orig = form.id ? all.find((f) => f.id === form.id) : undefined;
    const food: LibraryFood = {
      ...(orig ?? {}),
      id: form.id ?? uid('food'),
      // FD-01: never copy the English name over a real Arabic one.
      name: form.nameArTouched ? setLocalized(form.name, form.nameAr) : applyLocalizedEdit(form.nameOrig, form.name, 'en'),
      quantity: form.quantity.trim(),
      calories: Math.max(0, form.macros.calories ?? 0),
      protein: Math.max(0, form.macros.protein ?? 0),
      carbs: Math.max(0, form.macros.carbs ?? 0),
      fats: Math.max(0, form.macros.fats ?? 0),
    };
    if (form.category.trim()) food.category = form.category.trim();
    else delete food.category;
    if (form.tags.length) food.tags = form.tags;
    else delete food.tags;
    if (form.image) food.image = form.image;
    else delete food.image;
    save.mutate(food);
  };

  const menu = (f: LibraryFood) => [
    { key: 'use', label: t('library.use.action'), icon: 'users' as const, disabled: !canEdit, testId: 'row-use', onSelect: () => setUsing(f) },
    { key: 'edit', label: t('common.edit'), icon: 'edit' as const, disabled: !canEdit, testId: 'row-edit', onSelect: () => setForm(formOf(f)) },
    { key: 'del', label: t('common.delete'), icon: 'trash' as const, danger: true, disabled: !canEdit, testId: 'row-delete', onSelect: () => void remove(f) },
  ];
  const num = (v: number) => <span className="font-mono tabular-nums text-earth-muted">{v}</span>;
  const columns: CollectionColumn<LibraryFood>[] = [
    { key: 'name', header: t('library.col.food'), sortKey: 'name', primary: true, className: 'w-[34%]', lead: (f) => <FoodThumb image={f.image} size="xs" />, cell: (f) => <bdi>{name(f)}</bdi> },
    { key: 'serving', header: t('library.col.serving'), className: 'w-[16%]', cell: (f) => <span className="block truncate text-earth-muted"><bdi>{f.quantity || '—'}</bdi></span> },
    { key: 'kcal', header: t('library.col.calories'), sortKey: 'calories', align: 'end', className: 'w-[13%]', cell: (f) => num(f.calories) },
    { key: 'p', header: t('nutrition.protein'), sortKey: 'protein', align: 'end', className: 'w-[13%]', cell: (f) => num(f.protein) },
    { key: 'c', header: t('nutrition.carbs'), align: 'end', className: 'hidden w-[11%] xl:table-cell', cell: (f) => num(f.carbs) },
    { key: 'f', header: t('nutrition.fats'), align: 'end', className: 'hidden w-[11%] xl:table-cell', cell: (f) => num(f.fats) },
  ];

  return (
    <>
      <Toolbar
        hidden={all.length === 0}
        query={query}
        setQuery={setQuery}
        placeholder={t('coachFoods.search')}
        searchTestId="food-search"
        desktop={desktop}
        sorts={[
          { key: 'name' as SortKey, label: t('library.col.food') },
          { key: 'calories' as SortKey, label: t('library.col.calories') },
          { key: 'protein' as SortKey, label: t('nutrition.protein') },
        ]}
        selecting={bulk.selecting}
        onSelecting={bulk.setSelecting}
        canSelect={canEdit && all.length > 0}
        count={all.length ? (query.q ? t('library.countOf', { n: filtered.length, total: all.length }) : t('library.count.foods', { count: all.length })) : null}
      />
      <ListBody q={foods} total={all.length} matched={filtered.length} testId="lib-foods" onClear={() => setQuery({ q: '' })} empty={<StarterPanel createLabel={t('coachFoods.newFood')} onCreate={() => setForm(blankFood())} createTestId="food-new-first" />}>
        {desktop ? (
          <CollectionTable
            testId="coach-desktop-foods"
            caption={t('library.caption.foods')}
            columns={columns}
            rows={shown}
            rowKey={(f) => f.id}
            rowName={name}
            onOpen={setViewing}
            sort={query.sort}
            dir={query.dir}
            onSort={(k) => setQuery(nextSort(query, k as SortKey))}
            selecting={bulk.selecting}
            selection={bulk.sel}
            menu={menu}
          />
        ) : (
          <CollectionList
            testId="lib-list-foods"
            rowTestId="food-item"
            rows={shown}
            rowKey={(f) => f.id}
            rowName={name}
            onOpen={setViewing}
            selecting={bulk.selecting}
            selection={bulk.sel}
            render={(f) => ({
              lead: <FoodThumb image={f.image} size="sm" />,
              title: <bdi>{name(f)}</bdi>,
              meta: (
                <>
                  {f.quantity ? (
                    <>
                      <bdi>{f.quantity}</bdi> ·{' '}
                    </>
                  ) : null}
                  <bdi dir="ltr">{macroLine(f, t('common.kcal'))}</bdi>
                </>
              ),
            })}
          />
        )}
        {footer}
      </ListBody>
      {bulk.bar}

      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? name(viewing) : t('coachFoods.food')}
        testId="food-view"
        primary={
          viewing ? (
            <Button icon="users" fullWidth disabled={!canEdit} title={reason} data-testid="food-use" onClick={() => { setUsing(viewing); setViewing(null); }}>
              {t('library.use.action')}
            </Button>
          ) : null
        }
        secondary={
          viewing ? (
            <>
              <Button variant="secondary" icon="edit" disabled={!canEdit} title={reason} data-testid="food-view-edit" onClick={() => { setForm(formOf(viewing)); setViewing(null); }}>
                {t('common.edit')}
              </Button>
              <IconButton icon="trash" label={t('library.deleteItem', { name: name(viewing) })} className="text-danger" disabled={!canEdit || del.isPending} data-testid="food-delete" onClick={() => void remove(viewing)} />
            </>
          ) : null
        }
      >
        {viewing && <FoodDetail food={viewing} />}
      </DetailSheet>

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.id ? t('library.editFood') : t('coachFoods.newFood')}>
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
      <UseInPlanSheet coachId={coachId} item={using ? { kind: 'food', id: using.id, name: name(using) } : null} onClose={() => setUsing(null)} />
    </>
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
