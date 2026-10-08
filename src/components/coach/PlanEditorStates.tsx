import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/ui/EmptyState';
import { LoadingState } from '@/components/ui/LoadingState';
import { Icon } from '@/components/Icon';
import type { PlanEditorStatus } from '@/hooks/usePlanEditor';
import type { PlanVersionKind } from '@/types';

/**
 * Everything a plan editor shows before a real plan is loaded (B0 / CO-01).
 * Load failures and offline get an explicit error with Retry — never an
 * editable empty plan; "no plan yet" is a separate state with a deliberate
 * Create action.
 */
export function PlanEditorGate({
  status,
  kind,
  onRetry,
  onCreate,
}: {
  status: Exclude<PlanEditorStatus, 'ready'>;
  kind: PlanVersionKind;
  onRetry: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  if (status === 'loading') return <LoadingState variant="list" count={4} label={t('trust.planEditor.loading')} />;
  if (status === 'empty') {
    return (
      <EmptyState
        testId="plan-editor-empty"
        icon="list"
        title={t(`trust.planEditor.emptyTitle.${kind}`)}
        message={t('trust.planEditor.emptyBody')}
        action={
          <button type="button" className="btn-primary" data-testid="plan-editor-create" onClick={onCreate}>
            <Icon name="plus" size={16} /> {t('trust.planEditor.create')}
          </button>
        }
      />
    );
  }
  const offline = status === 'offline';
  return (
    <div className="card flex flex-col items-center gap-3 py-10 text-center" role="alert" data-testid={offline ? 'plan-editor-offline' : 'plan-editor-error'}>
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-danger/30 bg-danger/10 text-danger">
        <Icon name="info" size={26} />
      </span>
      <div>
        <p className="font-display text-base font-semibold">{t(offline ? 'trust.planEditor.offlineTitle' : 'trust.planEditor.errorTitle')}</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-earth-muted">{t(offline ? 'trust.planEditor.offlineBody' : 'trust.planEditor.errorBody')}</p>
      </div>
      <button type="button" className="btn-ghost" data-testid="plan-editor-retry" onClick={onRetry}>
        {t('trust.planEditor.retry')}
      </button>
    </div>
  );
}

/** Shown when a save was rejected because the plan changed elsewhere since it was loaded. */
export function PlanConflictBanner({ onLoadLatest, onKeepMine, pending }: { onLoadLatest: () => void; onKeepMine: () => void; pending: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 rounded-xl border border-warn/40 bg-warn/10 p-3" role="alert" data-testid="plan-editor-conflict">
      <p className="text-sm font-semibold text-warn">{t('trust.planEditor.conflictTitle')}</p>
      <p className="mt-1 text-[13px] text-earth-muted">{t('trust.planEditor.conflictBody')}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" data-testid="plan-editor-load-latest" disabled={pending} onClick={onLoadLatest}>
          {t('trust.planEditor.loadLatest')}
        </button>
        <button type="button" className="btn-tonal" data-testid="plan-editor-keep-mine" disabled={pending} onClick={onKeepMine}>
          {t('trust.planEditor.keepMine')}
        </button>
      </div>
      <p className="mt-2 text-[12px] text-earth-subtle">{t('trust.planEditor.keepMineConfirm')}</p>
    </div>
  );
}
