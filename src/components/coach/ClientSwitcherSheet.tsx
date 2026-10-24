import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Avatar } from '@/components/Avatar';
import { Icon } from '@/components/Icon';
import { SearchField } from '@/components/ui/Field';
import { Pill } from '@/components/ui/Pill';
import { useSession } from '@/services/auth/sessionStore';
import { useCoachSources } from '@/hooks/useCoachSources';
import { buildDirectory, sortRows } from '@/lib/coachDirectory';
import { today as todayKey, weekRange } from '@/lib/utils';
import { useRowReason } from '@/pages/coach/clients/parts';

/**
 * Fast client switcher (B3.4) — search, and the same grounded "Needs you" as Today and Clients:
 * a client is marked only when Today has an item for them, and the row says why (CO-06: the old
 * flag also fired for "0 workouts this week", so frozen, brand-new and nutrition-only clients
 * were all marked). Reuses the shared roster sources, so opening it is usually a cache hit.
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
  const { sources } = useCoachSources(open ? coachId : '');
  const reasonOf = useRowReason();
  const now = Date.now();
  const day = todayKey();
  const dir = useMemo(() => buildDirectory(sources, { coachId, now, todayKey: day, weekStart: weekRange(day).weekStart }), [sources, coachId, day]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    // Who needs the coach first (Today's order), then everyone else by name.
    return sortRows(term ? dir.rows.filter((r) => r.search.includes(term)) : dir.rows, 'needs');
  }, [dir.rows, q]);

  return (
    <Sheet open={open} onClose={onClose} size="md" title={t('workspace.switchClient')}>
      <div className="space-y-3">
        <SearchField label={t('coachClients.search')} srOnlyLabel placeholder={t('coachClients.search')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
        {!dir.rosterReady ? (
          dir.rosterError ? (
            <p className="py-6 text-center text-sm text-danger" role="alert">{t('coach.clientsLoadFailed')}</p>
          ) : (
            <p className="py-6 text-center text-sm text-earth-muted">{t('auth.working')}</p>
          )
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-earth-muted">{t('search.noResults')}</p>
        ) : (
          <div className="card max-h-[55vh] divide-y divide-line-soft overflow-y-auto p-0">
            {rows.map((r) => {
              const isCurrent = r.id === currentClientId;
              const reason = reasonOf(r, now);
              return (
                <button
                  key={r.id}
                  type="button"
                  data-testid="switcher-client-row"
                  data-client-id={r.id}
                  disabled={isCurrent}
                  className={`row w-full text-start ${isCurrent ? 'bg-brand/10' : ''}`}
                  onClick={() => onSelect(r.id)}
                >
                  <Avatar name={r.name} photoUrl={r.photoUrl} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{r.name}</span>
                    <span className={`block truncate text-[12px] ${reason.needs ? 'text-earth' : 'text-earth-subtle'}`}>{reason.text}</span>
                  </span>
                  {isCurrent ? (
                    <Pill tone="brand">{t('workspace.current')}</Pill>
                  ) : reason.needs ? (
                    <Pill tone="warn" testId="switcher-needs">{t('coachClients.task.needs')}</Pill>
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
