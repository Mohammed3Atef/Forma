import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Icon } from '@/components/Icon';
import { cloudAvailable } from '@/data/dataSource';
import { useSession } from '@/services/auth/sessionStore';
import { listCheckIns } from '@/services/platform/checkInApi';
import { shortDate } from '@/lib/utils';
import type { CheckInStatus } from '@/types';

const PILL: Record<CheckInStatus, string> = {
  requested: 'border-warn/50 text-warn',
  submitted: 'border-brand/50 text-brand',
  reviewed: 'border-success/50 text-success',
};

/** Client's weekly check-in history (newest first); tap to open the full check-in. */
export function CheckInHistory() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const uid = useSession((s) => s.uid) ?? '';
  const enabled = cloudAvailable() && !!uid && uid !== 'local-user';
  const q = useQuery({ queryKey: ['checkInsHistory', uid], queryFn: () => listCheckIns(uid), enabled });
  const items = q.data ?? [];

  return (
    <div className="anim-rise space-y-3">
      <TopBar title={t('checkin.history')} eyebrow={t('app.name')} onBack={() => navigate('/')} />

      {q.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center text-sm text-earth-muted">{t('checkin.noCheckins')}</p>
      ) : (
        <div className="card divide-y divide-line-soft p-0">
          {items.map((c) => (
            <button key={c.id} type="button" data-testid="checkin-history-row" onClick={() => navigate(`/check-in/${c.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-start">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{shortDate(c.weekStart, i18n.language)} – {shortDate(c.weekEnd, i18n.language)}</span>
                {c.currentWeight != null && <span className="block font-mono text-[12px] text-earth-subtle">{c.currentWeight} {t('common.kg')}</span>}
              </span>
              <span className={`chip ${PILL[c.status]}`}>{t(`checkin.status.${c.status}`)}</span>
              <Icon name="chevron" size={16} className="text-earth-subtle" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
