import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useCoachContent } from '@/hooks/useCoachContent';

/**
 * Compact "from your coach" card shown on Home when the client has coach
 * content. Renders nothing in local-only mode or when there's nothing to show.
 */
export function CoachCard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { hasContent, notes } = useCoachContent();
  if (!hasContent) return null;
  const latest = notes[0];
  return (
    <button type="button" onClick={() => navigate('/coach-notes')} className="card-tap flex w-full items-center gap-4 text-start">
      <span className="row-av bg-brand/15 text-brand">
        <Icon name="info" size={20} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="eyebrow mb-1 block">{t('clientCoach.fromCoach')}</span>
        <span className="block truncate text-sm text-earth-muted">{latest ? latest.body : t('clientCoach.viewAll')}</span>
      </span>
      <Icon name="chevron" size={18} />
    </button>
  );
}
