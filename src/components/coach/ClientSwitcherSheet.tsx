import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { SearchField } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Pill';
import { useSession } from '@/services/auth/sessionStore';
import { getCoachDashboard } from '@/services/platform/coachDashboardApi';

/**
 * Fast client switcher — search + attention/status context, so a coach can
 * jump straight from client A to client B without a round trip through
 * /coach/clients. Reuses the same `coachDashboard` query key the dashboard
 * and reports already fetch with, so opening this is usually a cache hit.
 */
export function ClientSwitcherSheet({
  open,
  onClose,
  currentClientId,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  currentClientId: string;
  onSelect: (clientId: string) => void;
}) {
  const { t } = useTranslation();
  const coachId = useSession((s) => s.account?.id) ?? '';
  const [q, setQ] = useState('');
  const dash = useQuery({ queryKey: ['coachDashboard', coachId], queryFn: () => getCoachDashboard(coachId), enabled: open && !!coachId });

  const rows = useMemo(() => {
    const query = q.trim().toLowerCase();
    const all = dash.data?.clients ?? [];
    const filtered = query
      ? all.filter((r) => (r.client.displayName || r.client.email || '').toLowerCase().includes(query))
      : all;
    // Needs-attention clients surface first — the coach is more likely to be switching to one of them.
    return [...filtered].sort((a, b) => Number(b.needsAttention) - Number(a.needsAttention));
  }, [dash.data, q]);

  return (
    <Sheet open={open} onClose={onClose} size="md" title={t('workspace.switchClient')}>
      <div className="space-y-3">
        <SearchField label={t('coach.searchClients')} srOnlyLabel placeholder={t('coach.searchClients')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {dash.isLoading ? (
          <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-earth-muted">{t('search.noResults')}</p>
        ) : (
          <div className="card max-h-[55vh] divide-y divide-line-soft overflow-y-auto p-0">
            {rows.map((r) => {
              const isCurrent = r.client.id === currentClientId;
              return (
                <button
                  key={r.client.id}
                  type="button"
                  data-testid="switcher-client-row"
                  disabled={isCurrent}
                  className={`row w-full text-start ${isCurrent ? 'bg-brand/10' : ''}`}
                  onClick={() => onSelect(r.client.id)}
                >
                  <Avatar name={r.client.displayName || r.client.email} photoUrl={r.client.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.client.displayName || r.client.email}</span>
                    <span className="block truncate text-[12px] text-earth-subtle">
                      {r.lastActivity ? t('coachDash.lastActive', { date: r.lastActivity }) : t('coachDash.noActivity')}
                    </span>
                  </span>
                  {isCurrent ? (
                    <Pill tone="brand">{t('workspace.current')}</Pill>
                  ) : r.needsAttention ? (
                    <Pill tone="bad">{t('coachDash.needsAttention')}</Pill>
                  ) : r.toReview ? (
                    <Pill tone="warn">{t('coachDash.review')}</Pill>
                  ) : null}
                  <Icon name="chevron" size={16} className="shrink-0 text-earth-subtle" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Sheet>
  );
}
