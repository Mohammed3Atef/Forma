import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Icon } from '@/components/Icon';
import { Button, IconButton } from '@/components/ui/Button';
import { SearchField, TextAreaField, TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { uid } from '@/lib/utils';
import { collatorFor, filterGroups, localizedName, nextSort, normalizeSearch, sortFoods, sortGroups, type SortKey } from '@/lib/libraryModel';
import { bulkDeleteFoodGroups, deleteFoodGroup, listFoodGroups, listFoods, saveFoodGroup } from '@/services/platform/coachAssetsApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { FoodGroup } from '@/types';
import { DetailSheet, ListBody, StarterPanel, Toolbar, useBulkDelete, useCanEdit, usePaged, type SegmentProps } from './parts';

/**
 * Library › Foods › Swap groups (B3.7): sets of interchangeable foods a client may swap between —
 * the same data and saves as before, inside Foods; read-first, then Edit; the form picks foods
 * from a searchable checklist.
 */
interface GroupForm {
  id: string | null;
  name: string;
  notes: string;
  foodIds: string[];
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
    setForm({ id: null, name: '', notes: '', foodIds: [] });
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
    onError: (e) => void alertDialog({ title: t('coachFoods.newGroup'), message: e instanceof Error ? e.message : t('common.savedFailed') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFoodGroup(coachId, id),
    onSuccess: () => {
      setViewing(null);
      void qc.invalidateQueries({ queryKey: ['foodGroups', coachId] });
      showToast({ title: t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: e instanceof Error ? e.message : t('common.errorGeneric') }),
  });
  const remove = async (g: FoodGroup) => {
    if (await confirmDialog({ title: t('common.delete'), message: t('common.confirmDeleteName', { name: gname(g) }), danger: true, confirmLabel: t('common.delete') })) del.mutate(g.id);
  };
  const bulk = useBulkDelete((ids) => bulkDeleteFoodGroups(coachId, ids), () => void qc.invalidateQueries({ queryKey: ['foodGroups', coachId] }));
  const edit = (g: FoodGroup) => setForm({ id: g.id, name: g.name, notes: g.notes ?? '', foodIds: g.foods.map((f) => f.id) });

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
      <ListBody q={groups} total={all.length} matched={filtered.length} testId="lib-groups" onClear={() => setQuery({ q: '' })} empty={<StarterPanel createLabel={t('coachFoods.newGroup')} onCreate={() => setForm({ id: null, name: '', notes: '', foodIds: [] })} createTestId="group-new-first" />}>
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

/** The swap-group form: name, notes, and the foods in it — a searchable checklist (not a wall of chips). */
function GroupFormBody({ coachId, form, orig, setForm, pending, onSave }: { coachId: string; form: GroupForm; orig: FoodGroup | null; setForm: (f: GroupForm) => void; pending: boolean; onSave: (g: FoodGroup) => void }) {
  const { t, i18n } = useTranslation();
  const foods = useQuery({ queryKey: ['foods', coachId], queryFn: () => listFoods(coachId), enabled: !!coachId });
  const [search, setSearch] = useState('');
  const collator = useMemo(() => collatorFor(i18n.language), [i18n.language]);
  const list = useMemo(() => {
    const q = normalizeSearch(search);
    const sorted = sortFoods(foods.data ?? [], 'name', 'asc', collator, i18n.language);
    // Picked foods first, so what is in the group is always visible.
    const picked = sorted.filter((f) => form.foodIds.includes(f.id));
    const rest = sorted.filter((f) => !form.foodIds.includes(f.id) && (!q || normalizeSearch(`${f.name.en} ${f.name.ar ?? ''}`).includes(q)));
    return [...picked, ...rest];
  }, [foods.data, search, form.foodIds, collator, i18n.language]);
  const submit = () => {
    const picked = (foods.data ?? []).filter((f) => form.foodIds.includes(f.id));
    const now = Date.now();
    onSave({ id: form.id ?? uid('fgrp'), coachId, name: form.name.trim(), foods: picked, ...(form.notes.trim() ? { notes: form.notes.trim() } : {}), createdAt: orig?.createdAt ?? now, updatedAt: now });
  };
  return (
    <div className="space-y-3" data-testid="group-form">
      <TextInput label={t('field.name')} data-testid="grp-name" placeholder={t('coachFoods.groupName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" />
      <TextAreaField label={t('field.notes')} className="min-h-16" placeholder={t('coachFoods.groupNotes')} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} dir="auto" />
      <div>
        <div className="label mb-1.5 flex items-center justify-between">
          <span>{t('coachFoods.pickFoods')}</span>
          <span className="text-earth-subtle" data-testid="grp-picked-count">
            {t('library.pickedCount', { n: form.foodIds.length })}
          </span>
        </div>
        {(foods.data?.length ?? 0) === 0 ? (
          <p className="text-[12.5px] text-earth-subtle">{t('coachFoods.addFoodsFirst')}</p>
        ) : (
          <>
            <SearchField fieldClassName="mb-2" aria-label={t('coachFoods.search')} placeholder={t('coachFoods.search')} value={search} onChange={(e) => setSearch(e.target.value)} />
            <ul className="max-h-64 divide-y divide-white/[0.06] overflow-y-auto rounded-ui-surface border border-white/[0.07]" data-testid="grp-foods">
              {list.map((f) => {
                const on = form.foodIds.includes(f.id);
                return (
                  <li key={f.id}>
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      data-testid={`grp-food-${f.id}`}
                      className={`flex min-h-ui-hit w-full items-center gap-3 px-3 text-start text-[14px] ${on ? 'bg-brand/10' : ''}`}
                      onClick={() => setForm({ ...form, foodIds: on ? form.foodIds.filter((x) => x !== f.id) : [...form.foodIds, f.id] })}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[6px] border ${on ? 'border-brand bg-brand text-white' : 'border-line'}`}>{on ? <Icon name="check" size={13} /> : null}</span>
                      <bdi className="min-w-0 flex-1 truncate">{localizedName(f.name, i18n.language)}</bdi>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
      <SubmitButton type="button" data-testid="grp-save" disabled={!form.name.trim() || form.foodIds.length === 0} pending={pending} onClick={submit} fullWidth>
        {t('common.save')}
      </SubmitButton>
    </div>
  );
}
