import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AssignTemplateSheet } from '@/components/coach/AssignTemplate';
import { CollectionList, CollectionTable, type CollectionColumn } from '@/components/library/LibraryCollection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { collatorFor, filterPrograms, goalOptions, nextSort, sortPrograms, type SortKey } from '@/lib/libraryModel';
import { formatDate } from '@/lib/format';
import { bulkDeleteWorkoutTemplates, deleteWorkoutTemplate, duplicateWorkoutTemplate, listWorkoutTemplates } from '@/services/platform/coachAssetsApi';
import { alertDialog, confirmDialog } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import type { WorkoutTemplate } from '@/types';
import { ListBody, SelectFilter, StarterPanel, Toolbar, useBulkDelete, useCanEdit, usePaged, type SegmentProps } from './parts';
import { errorMessage } from '@/lib/errorMessage';

/** The template's own page (read-first; Edit is explicit — RM-27). */
export const programPath = (id: string) => `/coach/templates/${encodeURIComponent(id)}`;

/**
 * Library › Programs (B3.7, RM-27 / CO-39): the coach's workout templates as a list — no separate
 * Templates destination, no corner checkboxes. A program opens in the template editor read-first;
 * from there (or the row menu) it is used in a client's plan, edited, duplicated or deleted.
 * Nutrition templates stay out of B3 (O-9).
 */
export default function ProgramsSegment({ coachId, query, setQuery, createSignal, onCreateHandled }: SegmentProps) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const desktop = useIsDesktop();
  const { canEdit } = useCanEdit();
  const lang = i18n.language;
  const programs = useQuery({ queryKey: ['workoutTemplates', coachId], queryFn: () => listWorkoutTemplates(coachId), enabled: !!coachId });
  const all = useMemo(() => programs.data ?? [], [programs.data]);
  const collator = useMemo(() => collatorFor(lang), [lang]);
  const goalLabel = (g: string) => t(`workoutTemplate.goals.${g}`, { defaultValue: g });
  const [assigning, setAssigning] = useState<WorkoutTemplate | null>(null);

  useEffect(() => {
    if (createSignal <= 0) return;
    onCreateHandled();
    navigate('/coach/templates/new');
  }, [createSignal, onCreateHandled, navigate]);

  const filtered = useMemo(
    () => sortPrograms(filterPrograms(all, query, goalLabel), query.sort, query.dir, collator, goalLabel),
    [all, query.q, query.goal, query.sort, query.dir, collator, lang], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const { shown, footer } = usePaged(filtered, desktop, JSON.stringify([query.q, query.goal, query.sort, query.dir]));
  const pname = (p: WorkoutTemplate) => p.name || t('workoutTemplate.untitled');
  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
    void qc.invalidateQueries({ queryKey: ['coachTemplatesCount', coachId] });
  };

  const dup = useMutation({
    mutationFn: (p: WorkoutTemplate) => duplicateWorkoutTemplate(p),
    onSuccess: () => {
      invalidate();
      showToast({ title: t('library.duplicated'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('workoutTemplate.duplicate'), message: errorMessage(e, t) }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteWorkoutTemplate(coachId, id),
    onSuccess: () => {
      invalidate();
      showToast({ title: t('common.removed'), variant: 'success' });
    },
    onError: (e) => void alertDialog({ title: t('common.delete'), message: errorMessage(e, t) }),
  });
  const remove = async (p: WorkoutTemplate) => {
    if (await confirmDialog({ title: t('common.delete'), message: t('common.confirmDeleteName', { name: pname(p) }), danger: true, confirmLabel: t('common.delete') })) del.mutate(p.id);
  };
  const bulk = useBulkDelete((ids) => bulkDeleteWorkoutTemplates(coachId, ids), invalidate);

  const menu = (p: WorkoutTemplate) => [
    { key: 'use', label: t('library.use.action'), icon: 'users' as const, disabled: !canEdit, testId: 'row-use', onSelect: () => setAssigning(p) },
    { key: 'edit', label: t('common.edit'), icon: 'edit' as const, disabled: !canEdit, testId: 'row-edit', onSelect: () => navigate(`${programPath(p.id)}/edit`) },
    { key: 'dup', label: t('workoutTemplate.duplicate'), icon: 'copy' as const, disabled: !canEdit || dup.isPending, testId: 'row-duplicate', onSelect: () => dup.mutate(p) },
    { key: 'del', label: t('common.delete'), icon: 'trash' as const, danger: true, disabled: !canEdit, testId: 'row-delete', onSelect: () => void remove(p) },
  ];
  const facts = (p: WorkoutTemplate) => [goalLabel(p.goal), t(`workoutTemplate.splits.${p.splitType}`, { defaultValue: p.splitType }), t('coachEditor.dayCount', { n: p.days.length })].join(' · ');
  const columns: CollectionColumn<WorkoutTemplate>[] = [
    { key: 'name', header: t('library.col.program'), sortKey: 'name', primary: true, className: 'w-[36%] xl:w-[32%]', cell: (p) => <bdi>{pname(p)}</bdi> },
    { key: 'goal', header: t('workoutTemplate.goal'), sortKey: 'goal', className: 'w-[19%] xl:w-[16%]', cell: (p) => <span className="block truncate text-earth-muted">{goalLabel(p.goal)}</span> },
    { key: 'split', header: t('workoutTemplate.split'), className: 'w-[17%] xl:w-[15%]', cell: (p) => <span className="block truncate text-earth-muted">{t(`workoutTemplate.splits.${p.splitType}`, { defaultValue: p.splitType })}</span> },
    { key: 'days', header: t('library.col.days'), sortKey: 'days', align: 'end', className: 'w-[11%] xl:w-[9%]', cell: (p) => <span className="font-mono tabular-nums text-earth-muted">{p.days.length}</span> },
    { key: 'updated', header: t('library.col.updated'), sortKey: 'updated', className: 'hidden w-[16%] xl:table-cell', cell: (p) => <span className="block truncate text-earth-muted">{p.updatedAt ? formatDate(p.updatedAt, lang) : '—'}</span> },
  ];
  const goals = goalOptions(all);

  return (
    <>
      <Toolbar
        hidden={all.length === 0}
        query={query}
        setQuery={setQuery}
        placeholder={t('library.searchPrograms')}
        searchTestId="template-search"
        desktop={desktop}
        sorts={[
          { key: 'name' as SortKey, label: t('library.col.program') },
          { key: 'goal' as SortKey, label: t('workoutTemplate.goal') },
          { key: 'days' as SortKey, label: t('library.col.days') },
          { key: 'updated' as SortKey, label: t('library.col.updated') },
        ]}
        selecting={bulk.selecting}
        onSelecting={bulk.setSelecting}
        canSelect={canEdit && all.length > 0}
        activeFilters={query.goal ? 1 : 0}
        onClearFilters={() => setQuery({ goal: '' })}
        count={all.length ? (query.q || query.goal ? t('library.countOf', { n: filtered.length, total: all.length }) : t('library.count.programs', { count: all.length })) : null}
        filters={
          goals.length > 1 ? (
            <SelectFilter value={query.goal} onChange={(goal) => setQuery({ goal })} label={t('workoutTemplate.goal')} anyLabel={t('library.anyGoal')} options={goals.map((g) => ({ value: g, label: goalLabel(g) }))} testId="lib-filter-goal" />
          ) : null
        }
      />
      <ListBody
        q={programs}
        total={all.length}
        matched={filtered.length}
        testId="lib-programs"
        onClear={() => setQuery({ q: '', goal: '' })}
        empty={<StarterPanel createLabel={t('library.newProgram')} onCreate={() => navigate('/coach/templates/new')} createTestId="template-new-first" />}
      >
        {desktop ? (
          <CollectionTable
            testId="coach-desktop-templates"
            caption={t('library.caption.programs')}
            columns={columns}
            rows={shown}
            rowKey={(p) => p.id}
            rowName={pname}
            onOpen={(p) => navigate(programPath(p.id))}
            sort={query.sort}
            dir={query.dir}
            onSort={(k) => setQuery(nextSort(query, k as SortKey))}
            selecting={bulk.selecting}
            selection={bulk.sel}
            menu={menu}
          />
        ) : (
          <CollectionList
            testId="lib-list-programs"
            rowTestId="template-card"
            rows={shown}
            rowKey={(p) => p.id}
            rowName={pname}
            onOpen={(p) => navigate(programPath(p.id))}
            selecting={bulk.selecting}
            selection={bulk.sel}
            render={(p) => ({ title: <bdi>{pname(p)}</bdi>, meta: facts(p) })}
          />
        )}
        {footer}
      </ListBody>
      {bulk.bar}
      <AssignTemplateSheet template={assigning} coachId={coachId} onClose={() => setAssigning(null)} />
    </>
  );
}
