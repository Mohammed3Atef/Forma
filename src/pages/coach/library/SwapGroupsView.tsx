import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Button, IconButton } from '@/components/ui/Button';
import { TextAreaField, TextInput } from '@/components/ui/Field';
import { LoadingState } from '@/components/ui/LoadingState';
import { FoodThumb } from '@/components/food/FoodImage';
import { LibraryFoodBrowser } from '@/components/library/LibraryFoodBrowser';
import { useCatalogMeta } from '@/hooks/useCatalog';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { uid } from '@/lib/utils';
import { collatorFor, filterGroups, localizedName, nextSort, sortGroups, type SortKey } from '@/lib/libraryModel';
import { bulkDeleteFoodGroups, deleteFoodGroup, listFoodGroups, saveFoodGroup } from '@/services/platform/coachAssetsApi';
import type { LibraryFoodRow } from '@/services/platform/libraryApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { FoodGroup, LibraryFood } from '@/types';
import { DetailSheet, FirstItemPanel, ListBody, Toolbar, useBulkDelete, useCanEdit, usePaged, type SegmentProps } from './parts';
import { errorMessage } from '@/lib/errorMessage';

/**
 * Library › Foods › Swap groups (B3.7): sets of interchangeable foods a client may swap between —
 * the same data and saves as before, inside Foods; read-first, then Edit. B4.3: the form picks foods
 * from the ONE food list (Forma's foods and the coach's own); a group keeps a copy of each food.
 */
interface GroupForm {
  id: string | null;
  name: string;
  notes: string;
  foods: LibraryFood[];
}

export default function SwapGroupsView({ coachId, query, setQuery, createSignal, onCreateHandled }: SegmentProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const { canEdit, reason } = useCanEdit();
  const lang = i18n.language;
  const groups = useQuery({ queryKey: ['foodGroups', coachId], queryFn: () => listFoodGroups(coachId), enabled: !!coachId });
  const all = useMemo(() => groups.data ?? [], [groups.data]);
  const collator = useMemo(() => collatorFor(lang), [lang]);
  const [viewing, setViewing] = useState<FoodGroup | null>(null);
  const [form, setForm] = useState<GroupForm | null>(null);

  useEffect(() => {
    if (createSignal <= 0) return;
    setForm({ id: null, name: '', notes: '', foods: [] });
    onCreateHandled();
  }, [createSignal, onCreateHandled]);

  const filtered = useMemo(() => sortGroups(filterGroups(all, query.q), query.sort, query.dir, collator), [all, query.q, query.sort, query.dir, collator]);
  const { shown, footer } = usePaged(filtered, desktop, JSON.stringify([query.q, query.sort, query.dir]));
  const gname = (g: FoodGroup) => g.name || t('coachFoods.untitledGroup');

  const save = useMutation({
    mutationFn: (g: FoodGroup) => saveFoodGroup(g),
    onSuccess: () => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['foodGroups', coachId] });
      showToast({ title: t('common.saved'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('coachFoods.newGroup'), message: errorMessage(e, t, 'common.savedFailed') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFoodGroup(coachId, id),
    onSuccess: () => {
      setViewing(null);
      void qc.invalidateQueries({ queryKey: ['foodGroups', coachId] });
      showToast({ title: t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const remove = async (g: FoodGroup) => {
    if (await confirmDialog({ title: t('common.delete'), message: t('common.confirmDeleteName', { name: gname(g) }), danger: true, confirmLabel: t('common.delete') })) del.mutate(g.id);
  };
  const bulk = useBulkDelete((ids) => bulkDeleteFoodGroups(coachId, ids), () => void qc.invalidateQueries({ queryKey: ['foodGroups', coachId] }));
  const edit = (g: FoodGroup) => setForm({ id: g.id, name: g.name, notes: g.notes ?? '', foods: g.foods });

  const menu = (g: FoodGroup) => [
    { key: 'edit', label: t('common.edit'), icon: 'edit' as const, disabled: !canEdit, testId: 'row-edit', onSelect: () => edit(g) },
    { key: 'del', label: t('common.delete'), icon: 'trash' as const, danger: true, disabled: !canEdit, testId: 'row-delete', onSelect: () => void remove(g) },
  ];
  const columns: CollectionColumn<FoodGroup>[] = [
    { key: 'name', header: t('library.col.group'), sortKey: 'name', primary: true, className: 'w-[34%]', cell: (g) => <bdi>{gname(g)}</bdi> },
    { key: 'count', header: t('library.col.foods'), sortKey: 'count', align: 'end', className: 'w-[14%]', cell: (g) => <span className="font-mono tabular-nums text-earth-muted">{g.foods.length}</span> },
    { key: 'list', header: t('library.col.includes'), className: 'w-[40%]', cell: (g) => <span className="block truncate text-earth-muted"><bdi>{g.foods.map((f) => localizedName(f.name, lang)).join(', ') || '—'}</bdi></span> },
  ];

  return (
    <>
      <p className="mb-3 text-[13px] text-earth-muted">{t('coachFoods.groupsHint')}</p>
      <Toolbar
        hidden={all.length === 0}
        query={query}
        setQuery={setQuery}
        placeholder={t('library.searchGroups')}
        searchTestId="group-search"
        desktop={desktop}
        sorts={[
          { key: 'name' as SortKey, label: t('library.col.group') },
          { key: 'count' as SortKey, label: t('library.col.foods') },
        ]}
        selecting={bulk.selecting}
        onSelecting={bulk.setSelecting}
        canSelect={canEdit && all.length > 0}
        count={all.length ? (query.q ? t('library.countOf', { n: filtered.length, total: all.length }) : t('library.count.groups', { count: all.length })) : null}
      />
      <ListBody q={groups} total={all.length} matched={filtered.length} testId="lib-groups" onClear={() => setQuery({ q: '' })} empty={<FirstItemPanel kind="groups" createLabel={t('coachFoods.newGroup')} onCreate={() => setForm({ id: null, name: '', notes: '', foods: [] })} createTestId="group-new-first" />}>
        {desktop ? (
          <CollectionTable
            testId="coach-desktop-groups"
            caption={t('library.caption.groups')}
            columns={columns}
            rows={shown}
            rowKey={(g) => g.id}
            rowName={gname}
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
            testId="lib-list-groups"
            rowTestId="group-item"
            rows={shown}
            rowKey={(g) => g.id}
            rowName={gname}
            onOpen={setViewing}
            selecting={bulk.selecting}
            selection={bulk.sel}
            render={(g) => ({ title: <bdi>{gname(g)}</bdi>, meta: t('coachFoods.foodCount', { n: g.foods.length }) })}
          />
        )}
        {footer}
      </ListBody>
      {bulk.bar}

      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? gname(viewing) : t('coachFoods.group')}
        testId="group-view"
        secondary={
          viewing ? (
            <>
              <Button variant="secondary" icon="edit" disabled={!canEdit} title={reason} data-testid="group-view-edit" onClick={() => { edit(viewing); setViewing(null); }}>
                {t('common.edit')}
              </Button>
              <IconButton icon="trash" label={t('library.deleteItem', { name: gname(viewing) })} className="text-danger" disabled={!canEdit || del.isPending} data-testid="group-delete" onClick={() => void remove(viewing)} />
            </>
          ) : null
        }
      >
        {viewing && (
          <div className="space-y-3">
            {viewing.notes ? (
              <p className="whitespace-pre-line text-[13.5px] text-earth-muted" dir="auto">
                {viewing.notes}
              </p>
            ) : null}
            <ul className="divide-y divide-white/[0.06] rounded-ui-surface border border-white/[0.07]">
              {viewing.foods.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-[14px]">
                  <bdi className="min-w-0 truncate font-medium">{localizedName(f.name, lang)}</bdi>
                  <bdi dir="ltr" className="shrink-0 text-[12.5px] text-earth-subtle">
                    {f.calories} {t('common.kcal')}
                  </bdi>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DetailSheet>

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.id ? t('library.editGroup') : t('coachFoods.newGroup')}>
        {form && <GroupFormBody coachId={coachId} form={form} orig={all.find((g) => g.id === form.id) ?? null} setForm={setForm} pending={save.isPending} onSave={(g) => save.mutate(g)} />}
      </Sheet>
    </>
  );
}

/** The swap-group form: name, notes, and the foods in it — picked from the one food list. */
function GroupFormBody({ coachId, form, orig, setForm, pending, onSave }: { coachId: string; form: GroupForm; orig: FoodGroup | null; setForm: (f: GroupForm) => void; pending: boolean; onSave: (g: FoodGroup) => void }) {
  const { t, i18n } = useTranslation();
  const catalog = useCatalogMeta();
  const picked = new Set(form.foods.map((f) => f.id));
  const remove = (id: string) => setForm({ ...form, foods: form.foods.filter((f) => f.id !== id) });
  /** A group keeps a copy of each food: the coach's own as it is, a Forma food at its first serving. */
  const toggle = async (r: LibraryFoodRow) => {
    if (picked.has(r.id)) return remove(r.id);
    if (r.kind === 'own') return setForm({ ...form, foods: [...form.foods, { ...(r.food as unknown as LibraryFood), id: r.id }] });
    const { foodPickFromCatalog } = await import('@/lib/catalogCopy'); // loads with the first Forma food
    const portion = r.card.portions[0];
    const p = foodPickFromCatalog(r.card, portion?.id ?? 'g', portion ? 1 : 100);
    setForm({ ...form, foods: [...form.foods, { id: r.id, name: p.name, quantity: p.quantity, ...p.macros, ...p.provenance, ...(p.image ? { image: p.image } : {}) }] });
  };
  const submit = () => {
    const now = Date.now();
    onSave({ id: form.id ?? uid('fgrp'), coachId, name: form.name.trim(), foods: form.foods, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}), createdAt: orig?.createdAt ?? now, updatedAt: now });
  };
  return (
    <div className="space-y-3" data-testid="group-form">
      <TextInput label={t('field.name')} data-testid="grp-name" placeholder={t('coachFoods.groupName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" />
      <TextAreaField label={t('field.notes')} className="min-h-16" placeholder={t('coachFoods.groupNotes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="auto" />
      <div>
        <div className="label mb-1.5 flex items-center justify-between">
          <span>{t('coachFoods.pickFoods')}</span>
          <span className="text-earth-subtle" data-testid="grp-picked-count">
            {t('library.pickedCount', { n: form.foods.length })}
          </span>
        </div>
        {/* What is in the group is always visible, above the list it is picked from. */}
        {form.foods.length > 0 && (
          <ul className="mb-3 divide-y divide-line-soft rounded-ui-surface border border-line-soft" data-testid="grp-foods">
            {form.foods.map((f) => (
              <li key={f.id} className="flex items-center gap-3 ps-3">
                <FoodThumb image={f.image} size="xs" />
                <bdi className="min-w-0 flex-1 truncate text-[14px]">{localizedName(f.name, i18n.language)}</bdi>
                <button type="button" className="flex h-11 w-11 shrink-0 items-center justify-center text-earth-subtle hover:text-danger" aria-label={t('library.removeFromGroup', { name: localizedName(f.name, i18n.language) })} data-testid={`grp-remove-${f.id}`} onClick={() => remove(f.id)}>
                  <Icon name="close" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {catalog.taxonomy ? <LibraryFoodBrowser taxonomy={catalog.taxonomy} compact selected={picked} onOpen={(r) => void toggle(r)} testId="grp-library" /> : <LoadingState count={2} />}
      </div>
      <SubmitButton type="button" data-testid="grp-save" disabled={!form.name.trim() || form.foods.length === 0} pending={pending} onClick={submit} fullWidth>
        {t('common.save')}
      </SubmitButton>
    </div>
  );
}
