import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CoachTimeline } from '@/components/coach/CoachTimeline';

/**
 * The workspace's `history` tab — reuses the existing `CoachTimeline` (who
 * has coached this client, and since when). The design's own `history` tab
 * shows plan/subscription events instead; those stay reachable from within
 * the workout/nutrition/cardio tabs' own "Versions" action and the
 * subscription tab, so nothing is lost, just organized under the real app's
 * existing IA rather than invented from scratch.
 */
export function CoachClientHistory() {
  const { t } = useTranslation();
  const { clientId = '' } = useParams();
  return (
    <div>
      <p className="ui-label mb-3">{t('timeline.title')}</p>
      <CoachTimeline clientId={clientId} />
    </div>
  );
}
