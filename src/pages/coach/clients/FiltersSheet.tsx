import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Sheet } from '@/components/Sheet';
import { Button } from '@/components/ui/Button';
import type { CheckInState, ClientState, DirectoryQuery, DirectorySort, PlanFilter } from '@/lib/coachDirectory';

const STATES: ClientState[] = ['active', 'trial', 'expiring', 'paused', 'expired', 'pending', 'none'];
const CHECKINS: CheckInState[] = ['review', 'overdue', 'awaiting', 'notRequested', 'done'];
const PLANS: PlanFilter[] = ['noWorkout', 'noNutrition'];
const SORTS: DirectorySort[] = ['needs', 'name', 'lastWorkout', 'daysLeft', 'workouts'];

/**
 * Filter & sort (B3.3): package state, this week's check-in, plans, and the
 * order. Every choice writes the URL (`?state=` `?checkin=` `?plan=` `?sort=`)
 * so Back and deep links keep the view. A filter whose data didn't load is
 * shown disabled rather than silently returning nobody.
 */
export function FiltersSheet({
  open,
  onClose,
  query,
  onChange,
  checkInsKnown,
  activityKnown,
}: {
  open: boolean;
  onClose: () => void;
  query: DirectoryQuery;
  onChange: (patch: Partial<DirectoryQuery>) => void;
  checkInsKnown: boolean;
  activityKnown: boolean;
}) {
  const { t } = useTranslation();
  const chip = <T extends string>(value: T | null | undefined, current: T | null | undefined, label: string, onPick: () => void, testId: string, disabled = false) => (
    <button type="button" className={`chip ${value === current ? 'chip-on' : ''} disabled:opacity-40`} aria-pressed={value === current} disabled={disabled} data-testid={testId} onClick={onPick}>
      {label}
    </button>
  );
  const group = (title: string, children: ReactNode) => (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-[13px] font-semibold text-earth-muted">{title}</legend>
      <div className="flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('coachClients.filters')}
      size="md"
      footer={
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" data-testid="filters-clear" onClick={() => onChange({ state: null, checkin: null, plan: null, sort: 'needs', dir: 'asc' })}>
            {t('coachClients.clear')}
          </Button>
          <Button className="flex-1" data-testid="filters-done" onClick={onClose}>
            {t('common.done')}
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-testid="clients-filters">
        {group(t('coachClients.group.state'), (
          <>
            {chip(null, query.state ?? null, t('coachClients.group.any'), () => onChange({ state: null }), 'filter-state-any')}
            {STATES.map((s) => chip(s, query.state, t(`coachClients.state.${s}`), () => onChange({ state: s }), `filter-state-${s}`))}
          </>
        ))}
        {group(t('coachClients.group.checkin'), (
          <>
            {chip(null, query.checkin ?? null, t('coachClients.group.any'), () => onChange({ checkin: null }), 'filter-checkin-any')}
            {CHECKINS.map((c) => chip(c, query.checkin, t(`coachClients.checkin.${c}`), () => onChange({ checkin: c }), `filter-checkin-${c}`, !checkInsKnown))}
          </>
        ))}
        {group(t('coachClients.group.plan'), (
          <>
            {chip(null, query.plan ?? null, t('coachClients.group.any'), () => onChange({ plan: null }), 'filter-plan-any')}
            {PLANS.map((p) => chip(p, query.plan, t(`coachClients.plan.${p}`), () => onChange({ plan: p }), `filter-plan-${p}`, !activityKnown))}
          </>
        ))}
        {group(t('coachClients.group.sort'), (
          <>
            {SORTS.map((s) => chip(s, query.sort ?? 'needs', t(`coachClients.sort.${s}`), () => onChange({ sort: s, dir: 'asc' }), `sort-${s}`))}
          </>
        ))}
      </div>
    </Sheet>
  );
}
