import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/services/auth/sessionStore';
import { seedStarterLibrary } from '@/services/platform/starterLibraryApi';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';

const KEYS = ['exerciseLibrary', 'foods', 'foodGroups', 'supplements', 'workoutTemplates', 'coachDashboard', 'coachTemplatesCount'];

/**
 * "Add the starter library": copies the starter set (exercises, foods, swap groups, supplements,
 * workout programs) into this coach's library in one server call. Idempotent — stable ids, so
 * running it again only fills in what is missing and never duplicates. The coach confirms first
 * and gets the result (with any category that failed) in a dialog. The per-coach copy stays until
 * B4 decides the shared catalog (EX-07).
 */
export function useStarterLibrary() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');
  const mut = useMutation({
    mutationFn: () => seedStarterLibrary(coachId),
    onSuccess: (res) => {
      for (const k of KEYS) void qc.invalidateQueries({ queryKey: [k, coachId] });
      void alertDialog({
        title: t('starter.loadedTitle'),
        message: res.errors.length
          ? t('starter.loadedWithErrors', { categories: res.errors.map((e) => e.category).join(', ') })
          : t('starter.loaded', { exercises: res.exercises, foods: res.foods, groups: res.groups, supplements: res.supplements, templates: res.templates }),
      });
    },
    onError: () => void alertDialog({ title: t('starter.load'), message: t('common.errorGeneric') }),
  });
  const run = async () => {
    if (!coachId || mut.isPending) return;
    if (await confirmDialog({ title: t('starter.load'), message: t('starter.confirm'), confirmLabel: t('starter.confirmCta') })) mut.mutate();
  };
  return { run, pending: mut.isPending };
}
