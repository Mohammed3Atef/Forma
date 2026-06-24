import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { DetailPanel } from '@/components/ui/DetailPanel';
import { useIsDesktop } from '@/hooks/useMediaQuery';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import {
  assignWorkoutTemplate,
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
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
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
                {filtered.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    data-testid="template-card"
                    onClick={() => setSelectedId(tpl.id)}
                    className={`card-tap text-start ${selectedId === tpl.id ? 'ring-1 ring-brand/60' : ''}`}
                  >
                    <div className="truncate font-medium">{tpl.name || t('workoutTemplate.untitled')}</div>
                    <div className="mt-1 font-mono text-[10.5px] uppercase text-earth-subtle">
                      {t(`workoutTemplate.goals.${tpl.goal}`)} · {t(`workoutTemplate.splits.${tpl.splitType}`)} · {t('coachEditor.dayCount', { n: tpl.days.length })}
                    </div>
                  </button>
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
          {filtered.map((tpl) => (
            <div key={tpl.id} className="card" data-testid="template-card">
              <div className="flex items-start justify-between gap-3">
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
