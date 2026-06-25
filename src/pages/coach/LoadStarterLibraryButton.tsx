import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';
import { seedStarterLibrary } from '@/services/platform/starterLibraryApi';
import { confirmDialog, alertDialog } from '@/stores/dialogStore';

const KEYS = ['exerciseLibrary', 'foods', 'foodGroups', 'supplements', 'workoutTemplates', 'coachDashboard'];

/**
 * Seeds the comprehensive starter library for a new coach. Idempotent (seed-*
 * ids overwrite). Surfaced from empty states + the onboarding checklist.
 */
export function LoadStarterLibraryButton({ className = '', variant = 'primary' }: { className?: string; variant?: 'primary' | 'ghost' }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const coachId = useSession((s) => s.account?.id ?? '');

  const mut = useMutation({
    mutationFn: () => seedStarterLibrary(coachId),
    onSuccess: (res) => {
      for (const k of KEYS) void qc.invalidateQueries({ queryKey: [k, coachId] });
      void alertDialog({
        title: t('starter.loadedTitle'),
        message: t('starter.loaded', { exercises: res.exercises, foods: res.foods, groups: res.groups, templates: res.templates }),
      });
    },
    onError: () => void alertDialog({ title: t('starter.load'), message: t('common.errorGeneric') }),
  });

  const run = async () => {
    if (!coachId || mut.isPending) return;
    if (await confirmDialog({ title: t('starter.load'), message: t('starter.confirm') })) mut.mutate();
  };

  return (
    <button
      type="button"
      data-testid="load-starter-library"
      disabled={mut.isPending || !coachId}
      onClick={() => void run()}
      className={`${variant === 'ghost' ? 'btn-ghost' : 'btn-primary'} disabled:opacity-50 ${className}`}
    >
      <Icon name="download" size={16} />
      {mut.isPending ? t('starter.loading') : t('starter.load')}
    </button>
  );
}
