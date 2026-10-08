import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useSession } from '@/services/auth/sessionStore';

interface ChecklistItem {
  key: 'profile' | 'firstClient' | 'firstTemplate';
  done: boolean;
  to: string;
}

/**
 * Small coach-onboarding checklist card (NOT a wizard). Shows three items —
 * complete profile / add first client / create first template — until all are
 * done, then hides itself. Done-state is derived from REAL data where possible
 * (client count, template count, profile fields) — nothing writes persisted
 * onboarding flags, so none are read (B0 / RM-69).
 */
export function CoachChecklist({ totalClients, templatesCreated }: { totalClients: number; templatesCreated: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useSession((s) => s.account);


  const profileDone = !!(account?.bio?.trim() || account?.specialty?.trim() || account?.photoUrl);
  const firstClientDone = totalClients > 0;
  // Counted by the dashboard query already loaded (no per-template download — RM-84).
  const firstTemplateDone = templatesCreated > 0;

  const items: ChecklistItem[] = useMemo(
    () => [
      { key: 'profile', done: profileDone, to: '/coach/settings' },
      { key: 'firstClient', done: firstClientDone, to: '/coach/clients?new=1' },
      { key: 'firstTemplate', done: firstTemplateDone, to: '/coach/templates/new' },
    ],
    [profileDone, firstClientDone, firstTemplateDone],
  );

  const remaining = items.filter((i) => !i.done).length;
  if (remaining === 0) return null;

  return (
    <section className="card space-y-3" data-testid="coach-checklist">
      <div className="flex items-center justify-between">
        <h2 className="h2">{t('coachOnboard.title')}</h2>
        <span className="text-[12px] text-earth-subtle" data-testid="coach-checklist-progress">
          {t('coachOnboard.progress', { done: items.length - remaining, total: items.length })}
        </span>
      </div>
      <div className="divide-y divide-line-soft">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`coach-checklist-${item.key}`}
            data-done={item.done ? 'true' : 'false'}
            onClick={() => navigate(item.to)}
            className="row w-full text-start"
            disabled={item.done}
          >
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                item.done ? 'border-success/50 bg-success/10 text-success' : 'border-line-soft text-earth-subtle'
              }`}
            >
              <Icon name={item.done ? 'check' : 'plus'} size={15} />
            </span>
            <span className={`min-w-0 flex-1 text-sm ${item.done ? 'text-earth-subtle line-through' : 'font-medium'}`}>
              {t(`coachOnboard.${item.key}`)}
            </span>
            {!item.done && <Icon name="chevron" size={16} className="text-earth-subtle" />}
          </button>
        ))}
      </div>
    </section>
  );
}
