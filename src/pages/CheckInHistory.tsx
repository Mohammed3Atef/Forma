import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { LoadingState } from '@/components/ui/LoadingState';
import { EmptyState } from '@/components/ui/EmptyState';
import { Pill, type PillTone } from '@/components/ui/Pill';
import { useBack } from '@/hooks/useBack';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { listCheckIns } from '@/services/platform/checkInApi';
import { shortDate } from '@/lib/utils';
import type { CheckInStatus } from '@/types';

const TONE: Record<CheckInStatus, PillTone> = {
  requested: 'warn',
  submitted: 'brand',
  reviewed: 'ok',
};

/** Client's weekly check-in history (newest first); tap to open the full check-in. */
export function CheckInHistory() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const goBack = useBack('/');
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user';
  const q = useQuery({ queryKey: ['checkInsHistory', uid], queryFn: () => listCheckIns(uid), enabled });
  const items = q.data ?? [];

  return (
    <div className="anim-rise space-y-3">
      <TopBar title={t('checkin.history')} eyebrow={t('app.name')} onBack={goBack} />

      {q.isLoading ? (
        <LoadingState variant="list" count={3} />
      ) : items.length === 0 ? (
        <EmptyState icon="calendar" title={t('checkin.noCheckins')} />
      ) : (
        <div className="card divide-y divide-line-soft p-0">
          {items.map((c) => (
            <button key={c.id} type="button" data-testid="checkin-history-row" onClick={() => navigate(`/check-in/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-start">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{shortDate(c.weekStart, i18n.language)} – {shortDate(c.weekEnd, i18n.language)}</span>
                {c.currentWeight != null && <span className="block font-mono text-[12px] text-earth-subtle">{c.currentWeight} {t('common.kg')}</span>}
              </span>
              <Pill tone={TONE[c.status]}>{t(`checkin.status.${c.status}`)}</Pill>
              <Icon name="chevron" size={16} className="text-earth-subtle" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
