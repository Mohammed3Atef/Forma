import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Sheet } from '@/components/Sheet';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { AssignTemplate } from '@/components/coach/AssignTemplate';
import { useCoachPlan } from '@/components/coach/CoachPlanProvider';
import { useSession } from '@/services/auth/sessionStore';
import { listMyClients } from '@/services/platform/coachApi';
import { deleteWorkoutTemplate, duplicateWorkoutTemplate, getWorkoutTemplate } from '@/services/platform/coachAssetsApi';
import { confirmDialog } from '@/stores/dialogStore';

/**
 * Read-only template preview. Clicking a template card lands here (NOT the
 * editor); Edit enters the editor. Actions: Edit / Assign / Duplicate / Delete.
 */
export function CoachTemplatePreview() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { templateId = '' } = useParams();
  const coachId = useSession((s) => s.account?.id ?? '');
  const { canWrite } = useCoachPlan(); // false when the coach's own plan has lapsed
  const [assigning, setAssigning] = useState(false);

  const clientsQ = useQuery({ queryKey: ['myClients', coachId], queryFn: () => listMyClients(coachId), enabled: !!coachId });
  const q = useQuery({ queryKey: ['workoutTemplate', coachId, templateId], queryFn: () => getWorkoutTemplate(coachId, templateId), enabled: !!coachId && !!templateId });
  const tpl = q.data;

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['workoutTemplates', coachId] });
  const dup = useMutation({ mutationFn: () => duplicateWorkoutTemplate(tpl!), onSuccess: () => { invalidate(); navigate('/coach/templates'); } });
  const del = useMutation({ mutationFn: () => deleteWorkoutTemplate(coachId, templateId), onSuccess: () => { invalidate(); navigate('/coach/templates'); } });
  const remove = async () => {
    if (await confirmDialog({ title: t('common.delete'), message: tpl?.name ?? '', danger: true })) del.mutate();
  };

  return (
    <>
      <TopBar testId="coach-template-preview" title={t('workoutTemplate.title')} eyebrow={t('platform.coachPortal')} onBack={() => navigate('/coach/templates')} />
      {q.isLoading ? (
        <LoadingState variant="cards" count={3} />
      ) : !tpl ? (
        <EmptyState icon="list" title={t('workoutTemplate.empty')} />
      ) : (
        <div className="space-y-5" data-testid="template-preview">
          <div>
            <h2 className="h1">{tpl.name || t('workoutTemplate.untitled')}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span className="chip text-[11px]">{t(`workoutTemplate.goals.${tpl.goal}`)}</span>
              <span className="chip text-[11px]">{t(`workoutTemplate.splits.${tpl.splitType}`)}</span>
              <span className="chip text-[11px]">{t('coachEditor.dayCount', { n: tpl.days.length })}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" data-testid="template-edit" disabled={!canWrite} onClick={() => navigate(`/coach/templates/${templateId}/edit`)}>{t('common.edit')}</button>
            <button type="button" className="btn-ghost" data-testid="template-assign" disabled={!canWrite} onClick={() => setAssigning(true)}>{t('workoutTemplate.assign')}</button>
            <button type="button" className="btn-ghost" data-testid="template-duplicate" disabled={!canWrite || dup.isPending} onClick={() => dup.mutate()}>{t('workoutTemplate.duplicate')}</button>
            <button type="button" className="btn-danger" data-testid="template-delete" disabled={!canWrite || del.isPending} onClick={() => void remove()}>{t('common.delete')}</button>
          </div>

          <div className="space-y-3" data-testid="template-preview-days">
            {tpl.days.map((d) => (
              <div key={d.id} className="card">
                <p className="font-medium">{d.title}</p>
                {d.focus ? <p className="mt-0.5 text-[12px] text-earth-subtle">{d.focus}</p> : null}
                <p className="mt-1 font-mono text-[10.5px] uppercase text-earth-subtle">
                  {d.sections?.length ? `${t('coachEditor.sectionCount', { n: d.sections.length, defaultValue: `${d.sections.length} sections` })} · ` : ''}
                  {t('coachEditor.exerciseCount', { n: d.exerciseIds.length, defaultValue: `${d.exerciseIds.length} exercises` })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      <Sheet open={assigning} onClose={() => setAssigning(false)} size="md" title={t('workoutTemplate.assign')}>
        {tpl && <AssignTemplate template={tpl} clients={clientsQ.data ?? []} assignedBy={coachId} onDone={() => setAssigning(false)} />}
      </Sheet>
    </>
  );
}
