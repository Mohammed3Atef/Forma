import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Pagination } from '@/components/ui/Pagination';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { RowCheckbox } from '@/components/ui/RowCheckbox';
import { LoadStarterLibraryButton } from '@/pages/coach/LoadStarterLibraryButton';
import { usePagination } from '@/hooks/usePagination';
import { useSelection } from '@/hooks/useSelection';
import { useFullBleed } from '@/hooks/useFullBleed';
import { useSession } from '@/services/auth/sessionStore';
import { bulkDeleteWorkoutTemplates, listWorkoutTemplates } from '@/services/platform/coachAssetsApi';
import { confirmDialog } from '@/stores/dialogStore';

/** Coach workout templates: a grid of cards; clicking one opens its read-only preview. */
export function CoachTemplates() {
  useFullBleed();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');
  const [goalFilter, setGoalFilter] = useState<string>('all');

  const templates = useQuery({ queryKey: ['workoutTemplates', coachId], queryFn: () => listWorkoutTemplates(coachId), enabled: !!coachId });

  const goals = useMemo(() => ['all', ...Array.from(new Set((templates.data ?? []).map((t2) => t2.goal)))], [templates.data]);
  const filtered = useMemo(
    () => (templates.data ?? []).filter((tpl) => goalFilter === 'all' || tpl.goal === goalFilter),
    [templates.data, goalFilter],
  );

  const sel = useSelection();
  const pg = usePagination(filtered, 24, goalFilter);
  const bulkDel = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteWorkoutTemplates(coachId, ids),
    onSuccess: () => { sel.clear(); void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] }); },
  });
  const runBulkDelete = async () => {
    if (sel.count === 0) return;
    if (await confirmDialog({ title: t('common.delete'), message: t('common.bulk.confirmDelete', { n: sel.count }), danger: true })) bulkDel.mutate(sel.ids);
  };

  return (
    <>
      <TopBar
        testId="coach-templates"
        title={t('workoutTemplate.title')}
        eyebrow={t('platform.coachPortal')}
        right={
          <button type="button" className="icon-btn h-[42px] w-[42px]" aria-label={t('workoutTemplate.new')} data-testid="template-new" onClick={() => navigate('/coach/templates/new')}>
            <Icon name="plus" size={20} />
          </button>
        }
      />

      {templates.isLoading ? (
        <LoadingState variant="cards" count={6} />
      ) : (templates.data?.length ?? 0) === 0 ? (
        <EmptyState icon="list" tone="brand" title={t('starter.emptyTitle')} message={t('starter.emptyHint')} action={<LoadStarterLibraryButton />} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {goals.map((g) => (
              <button key={g} type="button" onClick={() => setGoalFilter(g)} className={`chip text-[11px] ${goalFilter === g ? 'chip-on' : ''}`}>
                {g === 'all' ? t('admin.allStatuses') : t(`workoutTemplate.goals.${g}`)}
              </button>
            ))}
          </div>

          <div data-testid="coach-desktop-templates" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pg.pageItems.map((tpl) => (
              <div key={tpl.id} className={`relative rounded-xl ${sel.has(tpl.id) ? 'ring-2 ring-brand' : ''}`} data-testid="template-card">
                <span className="absolute end-2 top-2 z-10"><RowCheckbox checked={sel.has(tpl.id)} onToggle={() => sel.toggle(tpl.id)} label={t('common.bulk.selectRow')} testId="row-select" /></span>
                <button type="button" className="card-tap w-full text-start" onClick={() => navigate(`/coach/templates/${tpl.id}`)}>
                  <div className="truncate pe-8 font-medium">{tpl.name || t('workoutTemplate.untitled')}</div>
                  <div className="mt-1 font-mono text-[10.5px] uppercase text-earth-subtle">
                    {t(`workoutTemplate.goals.${tpl.goal}`)} · {t(`workoutTemplate.splits.${tpl.splitType}`)} · {t('coachEditor.dayCount', { n: tpl.days.length })}
                  </div>
                </button>
              </div>
            ))}
          </div>

          <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
          <BulkActionBar count={sel.count} onClear={sel.clear}>
            <button type="button" data-testid="bulk-delete" className="chip text-danger" disabled={bulkDel.isPending} onClick={() => void runBulkDelete()}>{t('common.bulk.delete')}</button>
          </BulkActionBar>
        </>
      )}
    </>
  );
}
