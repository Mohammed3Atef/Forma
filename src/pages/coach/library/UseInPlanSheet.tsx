import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { ClientPickList } from '@/components/coach/ClientPickList';
import { useInPlanPath } from '@/lib/handoffParams';

/**
 * "Use in a client plan" for one exercise or food: choose the client, then their training (or
 * nutrition) editor opens with the item added as an unsaved change — nothing is saved here.
 */
export default function UseInPlanSheet({ item, onClose, coachId }: { item: { kind: 'exercise' | 'food'; id: string; name: string } | null; onClose: () => void; coachId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <Sheet open={!!item} onClose={onClose} size="md" title={item ? t('library.use.title', { name: item.name }) : ''}>
      {item ? (
        <div className="space-y-3" data-testid="use-in-plan">
          <p className="text-[13.5px] text-earth-muted">{t(item.kind === 'exercise' ? 'library.use.hintExercise' : 'library.use.hintFood')}</p>
          <ClientPickList coachId={coachId} onPick={(c) => navigate(useInPlanPath(item.kind, c.id, item.id))} testId="use-client" />
        </div>
      ) : null}
    </Sheet>
  );
}
