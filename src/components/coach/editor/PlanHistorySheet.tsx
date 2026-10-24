import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import { TextInput } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Pill';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingState } from '@/components/ui/LoadingState';
import { listVersions, restoreVersion } from '@/services/platform/planVersionsApi';
import { confirmDialog } from '@/stores/dialogStore';
import { formatDate } from '@/lib/format';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { OfflineState, useQueryScreen } from '@/components/ui/ScreenState';
import type { CardioPlan, MealPlan, PlanVersion, PlanVersionKind, WorkoutPlan } from '@/types';

type AnyPlan = WorkoutPlan | MealPlan | CardioPlan;

/** A short, kind-specific summary line of a plan snapshot. */
export function summarizePlan(kind: PlanVersionKind, plan: AnyPlan | null | undefined, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!plan) return t('planVersions.noPlan');
  if (kind === 'workout') {
    const p = plan as WorkoutPlan;
    return `${t('coachEditor.dayCount', { n: p.days?.length ?? 0 })} · ${t('coachEditor.exerciseCount', { n: Object.keys(p.exercises ?? {}).length })}`;
  }
  if (kind === 'nutrition') {
    const p = plan as MealPlan;
    return `${p.targets?.calories ?? 0} kcal · P${p.targets?.protein ?? 0} · ${t('planVersions.mealCount', { n: p.meals?.length ?? 0 })}`;
  }
  const p = plan as CardioPlan;
  return t('planVersions.sessionCount', { n: p.sessions?.length ?? 0 });
}

/**
 * History as a sheet inside the editor (B3.5, blueprint §6.4; RM-39): every save is a version, the
 * coach can add a note to the next one, and restore an earlier one. Restore is only reachable from
 * the editor (behind the plan gate, B3-C02); it replaces the client's plan on the server, so the
 * editor then reloads the latest plan (B3-S10) — after saying so when there are unsaved edits.
 */
export function PlanHistorySheet({
  open,
  onClose,
  clientId,
  kind,
  dirty,
  saving,
  canSave,
  onSaveVersion,
  onRestored,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  kind: PlanVersionKind;
  dirty: boolean;
  saving: boolean;
  canSave: boolean;
  /** The editor's own guarded save, with a note. */
  onSaveVersion: (reason: string) => Promise<unknown>;
  /** Called after a restore — the editor reloads the restored plan. */
  onRestored: () => Promise<void> | void;
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  // B3.9 (C2): the editor is behind the plan gate; saving or restoring a version still needs the connection.
  const online = useOnlineStatus();
  const versions = useQuery({ queryKey: ['planVersions', clientId, kind], queryFn: () => listVersions(clientId, kind), enabled: open && !!clientId });
  // B3.9 (CO-18): a read paused offline is offline — never "no versions".
  const versionsScreen = useQueryScreen(versions);

  const restore = useMutation({
    mutationFn: (v: PlanVersion) => restoreVersion(clientId, v),
    onSuccess: async () => {
      void qc.invalidateQueries({ queryKey: ['planVersions', clientId] });
      await onRestored();
      onClose();
    },
  });

  const doRestore = async (v: PlanVersion) => {
    const ok = await confirmDialog({
      title: t('planVersions.restore'),
      message: dirty ? t('planVersions.confirmRestoreDirty', { n: v.versionNumber }) : t('planVersions.confirmRestore', { n: v.versionNumber }),
      danger: dirty,
    });
    if (ok) restore.mutate(v);
  };

  const saveWithNote = async () => {
    try {
      await onSaveVersion(reason.trim());
      setReason('');
      onClose();
    } catch {
      /* the editor shows the conflict / failure */
    }
  };

  return (
    <Sheet open={open} onClose={onClose} size="lg" title={t('planVersions.title')}>
      <div className="space-y-4" data-testid="plan-history-sheet">
        <div className="space-y-2 rounded-ui-control border border-line-soft p-3">
          <p className="text-[13px] text-earth-muted">{t('trust.planEditor.saveHint')}</p>
          <TextInput label={t('planVersions.noteLabel')} data-testid="version-reason" placeholder={t('planVersions.reasonPlaceholder')} value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button data-testid="version-save-confirm" variant="tonal" fullWidth pending={saving} disabled={!canSave || !reason.trim()} offline={!online} onClick={() => void saveWithNote()}>
            {t('planVersions.saveWithNote')}
          </Button>
        </div>

        {versionsScreen.status === 'offline' ? (
          <OfflineState onRetry={versionsScreen.retry} testId="plan-history-offline" />
        ) : versionsScreen.status === 'loading' ? (
          <LoadingState variant="list" count={3} />
        ) : versionsScreen.status === 'error' ? (
          <ErrorState onRetry={() => void versions.refetch()} testId="plan-history-error" />
        ) : versions.data?.length ? (
          <ul className="divide-y divide-line-soft rounded-ui-control border border-line-soft">
            {versions.data.map((v) => (
              <li key={v.id} className="flex items-start gap-3 px-3 py-3" data-testid="version-row" data-version={v.versionNumber} data-active={v.active}>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {t('planVersions.version')} {v.versionNumber}
                    </span>
                    {v.active && (
                      <Pill testId="version-active" tone="ok">
                        {t('planVersions.active')}
                      </Pill>
                    )}
                  </div>
                  <div className="mt-0.5 text-[12.5px] text-earth-muted">{summarizePlan(kind, v.snapshot as AnyPlan, t)}</div>
                  {v.reason && (
                    <div className="mt-0.5 text-[12.5px] text-earth-subtle">
                      <bdi>“{v.reason}”</bdi>
                    </div>
                  )}
                  <div className="mt-0.5 text-[12px] text-earth-subtle">{formatDate(v.createdAt, i18n.language, 'medium')}</div>
                </div>
                {!v.active && (
                  <Button size="sm" variant="ghost" data-testid={`version-restore-${v.versionNumber}`} disabled={restore.isPending} offline={!online} onClick={() => void doRestore(v)}>
                    {t('planVersions.restore')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-6 text-center text-sm text-earth-muted">{t('planVersions.noVersions')}</p>
        )}
        {restore.isError && (
          <p className="text-sm text-danger" role="alert" data-testid="plan-history-restore-failed">
            {t('planVersions.restoreFailed')}
          </p>
        )}
      </div>
    </Sheet>
  );
}
