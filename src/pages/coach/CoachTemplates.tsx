import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Pagination } from '@/components/ui/Pagination';
import { BulkActionBar } from '@/components/ui/BulkActionBar';
import { RowCheckbox } from '@/components/ui/RowCheckbox';
import { LoadStarterLibraryButton } from '@/pages/coach/LoadStarterLibraryButton';
import { usePagination } from '@/hooks/usePagination';
import { useSelection } from '@/hooks/useSelection';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import {
  assignWorkoutTemplate,
  bulkDeleteWorkoutTemplates,
  deleteWorkoutTemplate,
  duplicateWorkoutTemplate,
  listWorkoutTemplates,
} from '@/services/platform/coachAssetsApi';
import { confirmDialog } from '@/stores/dialogStore';
import type { UserRecord, WorkoutTemplate } from '@/types';

/** Coach workout templates: reusable bodies that SNAPSHOT into client plans on assign. */
export function CoachTemplates() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');
  const isDesktop = useIsDesktop();
  const [assigning, setAssigning] = useState<WorkoutTemplate | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [goalFilter, setGoalFilter] = useState<string>('all');

  const templates = useQuery({ queryKey: ['workoutTemplates', coachId], queryFn: () => listWorkoutTemplates(coachId), enabled: !!coachId });
  const clients = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
  const del = useMutation({ mutationFn: (id: string) => deleteWorkoutTemplate(coachId, id), onSuccess: invalidate });
  const dup = useMutation({ mutationFn: (tpl: WorkoutTemplate) => duplicateWorkoutTemplate(tpl), onSuccess: invalidate });

  const remove = async (tpl: WorkoutTemplate) => {
    if (await confirmDialog({ title: t('common.delete'), message: tpl.name, danger: true })) del.mutate(tpl.id);
  };

  const goals = useMemo(() => ['all', ...Array.from(new Set((templates.data ?? []).map((t2) => t2.goal)))], [templates.data]);
  const filtered = useMemo(
    () => (templates.data ?? []).filter((tpl) => goalFilter === 'all' || tpl.goal === goalFilter),
    [templates.data, goalFilter],
  );
  const selected = filtered.find((tpl) => tpl.id === selectedId) ?? null;

  const sel = useSelection();
  const pg = usePagination(filtered, 24, goalFilter);
  const bulkDel = useMutation({
    mutationFn: (ids: string[]) => bulkDeleteWorkoutTemplates(coachId, ids),
    onSuccess: () => { sel.clear(); invalidate(); },
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
        <LoadingState variant="cards" count={4} />
      ) : (templates.data?.length ?? 0) === 0 ? (
        <EmptyState icon="list" tone="brand" title={t('starter.emptyTitle')} message={t('starter.emptyHint')} action={<LoadStarterLibraryButton />} />
      ) : isDesktop ? (
        /* Desktop grid + preview */
        <>
          <div className="mb-4 flex flex-wrap gap-2">
            {goals.map((g) => (
              <button key={g} type="button" onClick={() => setGoalFilter(g)} className={`chip text-[11px] ${goalFilter === g ? 'chip-on' : ''}`}>
                {g === 'all' ? t('admin.allStatuses') : t(`workoutTemplate.goals.${g}`)}
              </button>
            ))}
          </div>
          <div className="flex gap-5">
            <div className="min-w-0 flex-1">
              <div data-testid="coach-desktop-templates" className="grid gap-3 sm:grid-cols-2">
                {pg.pageItems.map((tpl) => (
                  <div key={tpl.id} className={`relative rounded-xl ${sel.has(tpl.id) ? 'ring-1 ring-brand/60' : ''}`}>
                    <span className="absolute end-2 top-2 z-10"><RowCheckbox checked={sel.has(tpl.id)} onToggle={() => sel.toggle(tpl.id)} label={t('common.bulk.selectRow')} testId="row-select" /></span>
                    <button
                      type="button"
                      data-testid="template-card"
                      onClick={() => setSelectedId(tpl.id)}
                      className={`card-tap w-full text-start ${selectedId === tpl.id ? 'ring-1 ring-brand/60' : ''}`}
                    >
                      <div className="truncate pe-8 font-medium">{tpl.name || t('workoutTemplate.untitled')}</div>
                      <div className="mt-1 font-mono text-[10.5px] uppercase text-earth-subtle">
                        {t(`workoutTemplate.goals.${tpl.goal}`)} · {t(`workoutTemplate.splits.${tpl.splitType}`)} · {t('coachEditor.dayCount', { n: tpl.days.length })}
                      </div>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="w-80 shrink-0">
              <DetailPanel empty={!selected} emptyMessage={t('workoutTemplate.title')}>
                {selected && (
                  <div className="space-y-4">
                    <div>
                      <p className="font-semibold">{selected.name || t('workoutTemplate.untitled')}</p>
                      <p className="font-mono text-[10.5px] uppercase text-earth-subtle">
                        {t(`workoutTemplate.goals.${selected.goal}`)} · {t(`workoutTemplate.splits.${selected.splitType}`)} · {t('coachEditor.dayCount', { n: selected.days.length })}
                      </p>
                    </div>
                    <div className="space-y-1 text-sm">
                      {selected.days.map((d) => (
                        <div key={d.id} className="flex justify-between gap-2 border-b border-line-soft pb-1">
                          <span className="truncate">{d.title}</span>
                          <span className="shrink-0 text-earth-subtle">{d.exerciseIds.length}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button type="button" className="btn-primary w-full" onClick={() => navigate(`/coach/templates/${selected.id}`)}>{t('common.edit')}</button>
                      <button type="button" className="btn-ghost w-full" data-testid="template-assign" onClick={() => setAssigning(selected)}>{t('workoutTemplate.assign')}</button>
                      <div className="flex gap-2">
                        <button type="button" className="btn-ghost flex-1" onClick={() => dup.mutate(selected)}>{t('workoutTemplate.duplicate')}</button>
                        <button type="button" className="btn-ghost flex-1 text-danger" onClick={() => void remove(selected)}>{t('common.delete')}</button>
                      </div>
                    </div>
                  </div>
                )}
              </DetailPanel>
            </div>
          </div>
        </>
      ) : !templates.data?.length ? (
        <div className="card py-10 text-center text-sm text-earth-muted">{t('workoutTemplate.empty')}</div>
      ) : (
        <div className="space-y-2">
          {pg.pageItems.map((tpl) => (
            <div key={tpl.id} className={`card ${sel.has(tpl.id) ? 'ring-1 ring-brand/40' : ''}`} data-testid="template-card">
              <div className="flex items-start gap-3">
                <span className="pt-0.5"><RowCheckbox checked={sel.has(tpl.id)} onToggle={() => sel.toggle(tpl.id)} label={t('common.bulk.selectRow')} testId="row-select" /></span>
                <button type="button" className="min-w-0 flex-1 text-start" onClick={() => navigate(`/coach/templates/${tpl.id}`)}>
                  <div className="truncate font-medium">{tpl.name || t('workoutTemplate.untitled')}</div>
                  <div className="font-mono text-[10.5px] uppercase text-earth-subtle">
                    {t(`workoutTemplate.goals.${tpl.goal}`)} · {t(`workoutTemplate.splits.${tpl.splitType}`)} · {t('coachEditor.dayCount', { n: tpl.days.length })}
                  </div>
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" className="icon-btn h-9 w-9" aria-label={t('workoutTemplate.duplicate')} onClick={() => dup.mutate(tpl)}>
                    <Icon name="plus" size={16} />
                  </button>
                  <button type="button" className="text-danger" aria-label={t('common.delete')} onClick={() => void remove(tpl)}>
                    <Icon name="close" size={18} />
                  </button>
                </div>
              </div>
              <button type="button" className="btn-ghost mt-3 w-full" data-testid="template-assign" onClick={() => setAssigning(tpl)}>
                {t('workoutTemplate.assign')}
              </button>
            </div>
          ))}
        </div>
      )}

      {(templates.data?.length ?? 0) > 0 && (
        <>
          <Pagination page={pg.page} totalPages={pg.totalPages} from={pg.from} to={pg.to} total={pg.total} canPrev={pg.canPrev} canNext={pg.canNext} onPrev={pg.prev} onNext={pg.next} />
          <BulkActionBar count={sel.count} onClear={sel.clear}>
            <button type="button" data-testid="bulk-delete" className="chip text-danger" disabled={bulkDel.isPending} onClick={() => void runBulkDelete()}>{t('common.bulk.delete')}</button>
          </BulkActionBar>
        </>
      )}

      <Sheet open={!!assigning} onClose={() => setAssigning(null)} title={t('workoutTemplate.assign')}>
        {assigning && (
          <AssignTemplate template={assigning} clients={clients.data ?? []} assignedBy={coachId} onDone={() => setAssigning(null)} />
        )}
      </Sheet>
    </>
  );
}

function AssignTemplate({ template, clients, assignedBy, onDone }: { template: WorkoutTemplate; clients: UserRecord[]; assignedBy: string; onDone: () => void }) {
  const { t } = useTranslation();
  const [done, setDone] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: (clientId: string) => assignWorkoutTemplate(template, clientId, assignedBy),
    onSuccess: (_v, clientId) => setDone(clientId),
  });
  if (!clients.length) return <p className="py-4 text-sm text-earth-muted">{t('coach.noClients')}</p>;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-earth-muted">{t('workoutTemplate.assignHint')}</p>
      <div className="card divide-y divide-line-soft">
        {clients.map((c) => (
          <button key={c.id} type="button" disabled={mut.isPending} onClick={() => mut.mutate(c.id)} className="row w-full text-start" data-testid="assign-client">
            <span className="row-av font-serif">{(c.displayName || c.email || '?').charAt(0).toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate">{c.displayName || c.email}</span>
            {done === c.id && <Icon name="check" size={18} className="text-brand" />}
          </button>
        ))}
      </div>
      {done && (
        <button type="button" className="btn-primary w-full" onClick={onDone}>
          {t('common.done')}
        </button>
      )}
    </div>
  );
}
