import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Banner } from '@/components/ui/Banner';
import { Button } from '@/components/ui/Button';
import { withSyncResult } from '@/data/librarySyncIssues';
import { getExercise, saveExercise } from '@/services/platform/coachAssetsApi';
import { useCanEdit, useSyncIssues } from './parts';

/**
 * A failed Library → template sync stays on screen (not a 5-second toast) until it is retried
 * successfully or dismissed. Retry re-saves the exercise as it is NOW on the server, which re-runs
 * the (idempotent) sync — it never re-sends an older copy.
 */
export default function SyncIssuesNotice({ coachId }: { coachId: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { issues, set } = useSyncIssues(coachId);
  const { canEdit } = useCanEdit();
  const retry = useMutation({
    mutationFn: async () => {
      let left = issues;
      for (const issue of issues) {
        try {
          const ex = await getExercise(coachId, issue.exerciseId);
          const res = await saveExercise(coachId, ex);
          left = withSyncResult(left, issue.exerciseId, ex.name, res.status === 'failed');
        } catch (e) {
          // Deleted since: nothing left to sync for it.
          if ((e as { data?: { code?: string } } | null)?.data?.code === 'NOT_FOUND') left = withSyncResult(left, issue.exerciseId, issue.name, false);
        }
      }
      return left;
    },
    onSuccess: async (left) => {
      await set(left);
      for (const k of ['workoutTemplates', 'workoutTemplate', 'exerciseLibrary']) void qc.invalidateQueries({ queryKey: [k, coachId] });
    },
  });
  if (!issues.length) return null;
  const title = issues.length === 1 ? t('library.sync.one', { name: issues[0].name }) : t('library.sync.many', { n: issues.length });
  return (
    <Banner
      tone="warning"
      icon="alert"
      alert
      className="mb-3"
      testId="lib-sync-issue"
      title={title}
      onDismiss={() => void set([])}
      action={
        <Button size="sm" variant="secondary" pending={retry.isPending} disabled={!canEdit} onClick={() => retry.mutate()} data-testid="lib-sync-retry">
          {t('common.retry')}
        </Button>
      }
    >
      {retry.isSuccess && retry.data.length ? t('library.sync.stillFailing') : t('library.sync.body')}
    </Banner>
  );
}
