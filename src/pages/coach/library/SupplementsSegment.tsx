import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button, IconButton } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { SecondLanguageField } from '@/components/ui/SecondLanguageField';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { uid } from '@/lib/utils';
import { applyLocalizedEdit, secondLanguageStale, setLocalized } from '@/lib/localizedText';
import { collatorFor, filterSupplements, localizedName, nextSort, sortSupplements, type SortKey } from '@/lib/libraryModel';
import { bulkDeleteSupplements, deleteSupplement, listSupplements, saveSupplement } from '@/services/platform/coachAssetsApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { LibrarySupplement, LocalizedText } from '@/types';
import { DetailSheet, ListBody, StarterPanel, Toolbar, useBulkDelete, useCanEdit, usePaged, type SegmentProps } from './parts';
import { errorMessage } from '@/lib/errorMessage';

interface SuppForm {
  id: string | null;
  name: string;
  dose: string;
  doseAr: string;
  doseArTouched: boolean;
  doseOrig: LocalizedText | null;
  timing: string;
  timingAr: string;
  timingArTouched: boolean;
  timingOrig: LocalizedText | null;
}
const blank = (): SuppForm => ({ id: null, name: '', dose: '', doseAr: '', doseArTouched: false, doseOrig: null, timing: '', timingAr: '', timingArTouched: false, timingOrig: null });
const formOf = (s: LibrarySupplement): SuppForm => ({
  id: s.id,
  name: s.name,
  dose: s.dose.en,
  doseAr: s.dose.ar ?? '',
  doseArTouched: false,
  doseOrig: s.dose,
  timing: s.timing?.en ?? '',
  timingAr: s.timing?.ar ?? '',
  timingArTouched: false,
  timingOrig: s.timing ?? null,
});
/** One bilingual field from the form: the Arabic is kept unless edited (FD-01 / B3-C04). */
const localized = (en: string, ar: string, touched: boolean, orig: LocalizedText | null): LocalizedText => (touched ? setLocalized(en, ar) : applyLocalizedEdit(orig, en, 'en'));

/** Library › Supplements (B3.7): name, dose and timing in both languages; read-first, then Edit. */
export default function SupplementsSegment({ coachId, query, setQuery, createSignal, onCreateHandled, openId, onOpened }: SegmentProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const desktop = useIsDesktop();
  const { canEdit, reason } = useCanEdit();
  const lang = i18n.language;
  const supps = useQuery({ queryKey: ['supplements', coachId], queryFn: () => listSupplements(coachId), enabled: !!coachId });
  const all = useMemo(() => supps.data ?? [], [supps.data]);
  const collator = useMemo(() => collatorFor(lang), [lang]);
  const [viewing, setViewing] = useState<LibrarySupplement | null>(null);
  const [form, setForm] = useState<SuppForm | null>(null);

  useEffect(() => {
    if (createSignal <= 0) return;
    setForm(blank());
    onCreateHandled();
  }, [createSignal, onCreateHandled]);
  useEffect(() => {
    if (!openId || !supps.data) return;
    const s = supps.data.find((x) => x.id === openId);
    if (s) setViewing(s);
    onOpened();
  }, [openId, supps.data, onOpened]);

  const filtered = useMemo(() => sortSupplements(filterSupplements(all, query.q), query.dir, collator), [all, query.q, query.dir, collator]);
  const { shown, footer } = usePaged(filtered, desktop, JSON.stringify([query.q, query.dir]));
  const sname = (s: LibrarySupplement) => s.name || t('library.untitledSupplement');

  const save = useMutation({
    mutationFn: (s: LibrarySupplement) => saveSupplement(coachId, s),
    onSuccess: () => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: ['supplements', coachId] });
      showToast({ title: t('common.saved'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('coachSupps.newSupp'), message: errorMessage(e, t, 'common.savedFailed') }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteSupplement(coachId, id),
    onSuccess: () => {
      setViewing(null);
      void qc.invalidateQueries({ queryKey: ['supplements', coachId] });
      showToast({ title: t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const remove = async (s: LibrarySupplement) => {
    if (await confirmDialog({ title: t('common.delete'), message: t('common.confirmDeleteName', { name: sname(s) }), danger: true, confirmLabel: t('common.delete') })) del.mutate(s.id);
  };
  const bulk = useBulkDelete((ids) => bulkDeleteSupplements(coachId, ids), () => void qc.invalidateQueries({ queryKey: ['supplements', coachId] }));

  const submit = () => {
    if (!form) return;
    const orig = form.id ? all.find((s) => s.id === form.id) : undefined;
    const timing = localized(form.timing, form.timingAr, form.timingArTouched, form.timingOrig);
    const s: LibrarySupplement = { ...(orig ?? {}), id: form.id ?? uid('supp'), name: form.name.trim(), dose: localized(form.dose, form.doseAr, form.doseArTouched, form.doseOrig) };
    if (timing.en || timing.ar) s.timing = timing;
    else delete s.timing;
    save.mutate(s);
  };

  const menu = (s: LibrarySupplement) => [
    { key: 'edit', label: t('common.edit'), icon: 'edit' as const, disabled: !canEdit, testId: 'row-edit', onSelect: () => setForm(formOf(s)) },
    { key: 'del', label: t('common.delete'), icon: 'trash' as const, danger: true, disabled: !canEdit, testId: 'row-delete', onSelect: () => void remove(s) },
  ];
  const columns: CollectionColumn<LibrarySupplement>[] = [
    { key: 'name', header: t('library.col.supplement'), sortKey: 'name', primary: true, className: 'w-[34%]', cell: (s) => <bdi>{sname(s)}</bdi> },
    { key: 'dose', header: t('field.dose'), className: 'w-[30%]', cell: (s) => <span className="block truncate text-earth-muted"><bdi>{localizedName(s.dose, lang) || '—'}</bdi></span> },
    { key: 'timing', header: t('field.timing'), className: 'w-[26%]', cell: (s) => <span className="block truncate text-earth-muted"><bdi>{localizedName(s.timing, lang) || '—'}</bdi></span> },
  ];

  return (
    <>
      <Toolbar
        hidden={all.length === 0}
        query={query}
        setQuery={setQuery}
        placeholder={t('coachSupps.search')}
        searchTestId="supp-search"
        desktop={desktop}
        sorts={[{ key: 'name' as SortKey, label: t('library.col.supplement') }]}
        selecting={bulk.selecting}
        onSelecting={bulk.setSelecting}
        canSelect={canEdit && all.length > 0}
        count={all.length ? (query.q ? t('library.countOf', { n: filtered.length, total: all.length }) : t('library.count.supplements', { count: all.length })) : null}
      />
      <ListBody q={supps} total={all.length} matched={filtered.length} testId="lib-supps" onClear={() => setQuery({ q: '' })} empty={<StarterPanel createLabel={t('coachSupps.newSupp')} onCreate={() => setForm(blank())} createTestId="supp-new-first" />}>
        {desktop ? (
          <CollectionTable
            testId="coach-desktop-supplements"
            caption={t('library.caption.supplements')}
            columns={columns}
            rows={shown}
            rowKey={(s) => s.id}
            rowName={sname}
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
            testId="lib-list-supplements"
            rowTestId="supp-item"
            rows={shown}
            rowKey={(s) => s.id}
            rowName={sname}
            onOpen={setViewing}
            selecting={bulk.selecting}
            selection={bulk.sel}
            render={(s) => ({ title: <bdi>{sname(s)}</bdi>, meta: <bdi>{[localizedName(s.dose, lang), localizedName(s.timing, lang)].filter(Boolean).join(' · ') || t('coachLib.noMeta')}</bdi> })}
          />
        )}
        {footer}
      </ListBody>
      {bulk.bar}

      <DetailSheet
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing ? sname(viewing) : t('coachEditor.supplement')}
        testId="supp-view"
        secondary={
          viewing ? (
            <>
              <Button variant="secondary" icon="edit" disabled={!canEdit} title={reason} data-testid="supp-view-edit" onClick={() => { setForm(formOf(viewing)); setViewing(null); }}>
                {t('common.edit')}
              </Button>
              <IconButton icon="trash" label={t('library.deleteItem', { name: sname(viewing) })} className="text-danger" disabled={!canEdit || del.isPending} data-testid="supp-delete" onClick={() => void remove(viewing)} />
            </>
          ) : null
        }
      >
        {viewing && (
          <dl className="card">
            {(
              [
                [t('field.dose'), viewing.dose],
                [t('field.timing'), viewing.timing],
              ] as const
            ).map(([label, value]) =>
              value && (value.en || value.ar) ? (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-line-soft py-2 last:border-0">
                  <dt className="text-sm text-earth-subtle">{label}</dt>
                  <dd className="text-end text-sm font-medium">
                    <bdi>{localizedName(value, lang)}</bdi>
                  </dd>
                </div>
              ) : null,
            )}
          </dl>
        )}
      </DetailSheet>

      <Sheet open={!!form} onClose={() => setForm(null)} size="md" title={form?.id ? t('library.editSupplement') : t('coachSupps.newSupp')}>
        {form && (
          <div className="space-y-3" data-testid="supp-form">
            <TextInput label={t('field.name')} data-testid="supp-name" placeholder={t('coachEditor.suppName')} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} dir="auto" />
            <TextInput label={t('field.dose')} data-testid="supp-dose" placeholder={t('coachEditor.suppDose')} value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} dir="auto" />
            <SecondLanguageField lang="ar" testId="supp-dose-ar" value={form.doseAr} onChange={(v) => setForm({ ...form, doseAr: v, doseArTouched: true })} stale={!form.doseArTouched && secondLanguageStale(form.doseOrig, form.dose, 'en')} />
            <TextInput label={t('field.timing')} data-testid="supp-timing" placeholder={t('coachEditor.suppTiming')} value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value })} dir="auto" />
            <SecondLanguageField lang="ar" testId="supp-timing-ar" value={form.timingAr} onChange={(v) => setForm({ ...form, timingAr: v, timingArTouched: true })} stale={!form.timingArTouched && secondLanguageStale(form.timingOrig, form.timing, 'en')} />
            <SubmitButton type="button" data-testid="supp-save" disabled={!form.name.trim()} pending={save.isPending} onClick={submit} fullWidth>
              {t('common.save')}
            </SubmitButton>
          </div>
        )}
      </Sheet>
    </>
  );
}
