import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useCoachClientHeader } from '@/hooks/useCoachClientHeader';

/**
 * Compact, collapsible "who am I programming for" strip for the plan editors —
 * so a coach doesn't have to leave the editor to remember the client's goal,
 * injuries, or food restrictions. Reuses `useCoachClientHeader`'s query keys
 * (cache-shared with the workspace header), and only ever shows REAL fields
 * from the client's own assessment/profile — nothing inferred or invented.
 */
export function ClientContextPanel({ clientId }: { clientId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { name, goal, assessment, currentWeightKg, isLoading } = useCoachClientHeader(clientId);

  if (isLoading) return null;

  const injuryText = !assessment || assessment.health.noInjuries || assessment.health.injuries.length === 0
    ? t('assessment.injuries.none')
    : assessment.health.injuries.map((i) => t(`assessment.injuries.${i}`)).join(', ');
  const hasInjuries = !!assessment && !assessment.health.noInjuries && assessment.health.injuries.length > 0;
  const allergies = assessment?.nutrition.allergies ?? [];
  const mustHave = assessment?.nutrition.mustHaveFoods ?? [];

  return (
    <div className="rounded-xl border border-line-soft" data-testid="client-context-panel">
      <button type="button" className="flex w-full items-center justify-between px-3 py-2.5" onClick={() => setOpen((v) => !v)} data-testid="client-context-toggle">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium">
          <Icon name="user" size={16} className="shrink-0 text-earth-muted" />
          <span className="truncate">{t('coachEditor.clientContext')}{name ? ` · ${name}` : ''}</span>
          {hasInjuries && <span className="chip border-danger/40 text-danger">{t('assessment.injuriesQ')}</span>}
        </span>
        <Icon name={open ? 'chevronDown' : 'chevron'} size={16} className="shrink-0 text-earth-subtle" />
      </button>
      {open && (
        <div className="grid grid-cols-2 gap-3 border-t border-line-soft px-3 py-3 text-[13px]">
          {goal && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-earth-subtle">{t('settings.goal')}</p>
              <p>{t(`settings.goals.${goal}`)}</p>
            </div>
          )}
          {currentWeightKg != null && (
            <div>
              <p className="text-[11px] uppercase tracking-wide text-earth-subtle">{t('coachEditor.currentWeight')}</p>
              <p>{currentWeightKg} {t('common.kg')}</p>
            </div>
          )}
          <div className={hasInjuries ? 'text-danger' : ''}>
            <p className="text-[11px] uppercase tracking-wide text-earth-subtle">{t('assessment.injuriesQ')}</p>
            <p>{injuryText}</p>
            {assessment?.health.injuryDetails && <p className="text-[12px] text-earth-subtle">{assessment.health.injuryDetails}</p>}
          </div>
          <div className={allergies.length ? 'text-danger' : ''}>
            <p className="text-[11px] uppercase tracking-wide text-earth-subtle">{t('assessment.allergies')}</p>
            <p>{allergies.length ? allergies.join(', ') : t('assessment.injuries.none')}</p>
          </div>
          {mustHave.length > 0 && (
            <div className="col-span-2">
              <p className="text-[11px] uppercase tracking-wide text-earth-subtle">{t('assessment.mustHave')}</p>
              <p>{mustHave.join(', ')}</p>
            </div>
          )}
          {!assessment && <p className="col-span-2 text-earth-subtle">{t('coachEditor.noAssessmentYet')}</p>}
        </div>
      )}
    </div>
  );
}
