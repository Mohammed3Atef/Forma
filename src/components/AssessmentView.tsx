import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { viewImages } from '@/stores/imageViewerStore';
import type { ClientAssessment } from '@/types';

/** Calendar-accurate age in whole years from an ISO `YYYY-MM-DD` date of birth. */
function ageFromDob(dob: string): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age >= 0 && age < 150 ? age : null;
}

/** Read-only render of a client's onboarding assessment (coach + admin). */
export function AssessmentView({ assessment }: { assessment: ClientAssessment | null }) {
  const { t } = useTranslation();
  if (!assessment) {
    return <div className="card py-8 text-center text-sm text-earth-muted" data-testid="assessment-empty">{t('assessment.notCompleted')}</div>;
  }
  const a = assessment;

  // Coach insight flags — computed at runtime, never stored.
  const badges: { key: string; danger?: boolean }[] = [];
  if (a.health.hasMedicalConditions) badges.push({ key: 'medical', danger: true });
  if (!a.health.noInjuries || a.health.injuries.length > 0) badges.push({ key: 'injury', danger: true });
  if (a.lifestyle.sleepHours < 6) badges.push({ key: 'lowSleep' });
  if (a.motivation.commitmentLevel < 5) badges.push({ key: 'lowCommitment' });
  if (a.lifestyle.activityLevel === 'sedentary') badges.push({ key: 'lowActivity' });

  const Row = ({ label, value }: { label: string; value: ReactNode }) => (
    <div className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
      <span className="min-w-0 flex-1 text-[13px] text-earth-muted">{label}</span>
      <span className="min-w-0 shrink-0 break-words text-end text-sm font-medium">{value || '—'}</span>
    </div>
  );
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h2 className="h2 mb-2">{title}</h2>
      <div className="card divide-y divide-line-soft">{children}</div>
    </section>
  );

  return (
    <div className="space-y-5" data-testid="assessment-view">
      {badges.length > 0 && (
        <div className="flex flex-wrap gap-2" data-testid="assessment-badges">
          {badges.map((b) => (
            <span key={b.key} className={`chip ${b.danger ? 'border-danger/50 text-danger' : 'border-warn/50 text-warn'}`}>
              {t(`assessment.badges.${b.key}`)}
            </span>
          ))}
        </div>
      )}

      <Section title={t('assessment.steps.0')}>
        <Row label={t('assessment.fullName')} value={a.basic.fullName} />
        <Row
          label={t('assessment.dob')}
          value={
            <span>
              <span dir="ltr">{a.basic.dateOfBirth}</span>
              {ageFromDob(a.basic.dateOfBirth) != null && (
                <span className="mt-0.5 block text-[12px] text-earth-subtle">{t('assessment.ageYears', { n: ageFromDob(a.basic.dateOfBirth) })}</span>
              )}
            </span>
          }
        />
        <Row label={t('assessment.gender')} value={t(`assessment.genders.${a.basic.gender}`)} />
        <Row label={t('settings.height')} value={`${a.basic.heightCm} cm`} />
        <Row label={t('settings.weight')} value={`${a.basic.weightKg} ${t('common.kg')}`} />
      </Section>
      <Section title={t('assessment.steps.1')}>
        <Row label={t('assessment.primaryGoal')} value={t(`assessment.goalOptions.${a.goals.primaryGoal}`)} />
        {(a.goals.goalPriorities?.length ?? 0) > 0 && (
          <Row label={t('assessment.goalPriorities')} value={a.goals.goalPriorities!.map((g, i) => `${i + 1}. ${t(`assessment.goalOptions.${g}`)}`).join('  ·  ')} />
        )}
        {a.goals.targetWeightKg != null && <Row label={t('assessment.targetWeight')} value={`${a.goals.targetWeightKg} ${t('common.kg')}`} />}
        {a.goals.deadlineMonths != null && <Row label={t('assessment.deadlineMonths')} value={`${a.goals.deadlineMonths}`} />}
      </Section>
      <Section title={t('assessment.steps.2')}>
        <Row label={t('assessment.occupation')} value={t(`assessment.occupations.${a.lifestyle.occupation}`)} />
        <Row label={t('assessment.sleepHours')} value={`${a.lifestyle.sleepHours} h`} />
        <Row label={t('assessment.activity')} value={t(`assessment.activities.${a.lifestyle.activityLevel}`)} />
        <Row label={t('assessment.trainingDays')} value={`${a.lifestyle.trainingDaysPerWeek}`} />
      </Section>
      <Section title={t('assessment.steps.3')}>
        <Row label={t('assessment.trainingLevel')} value={t(`assessment.levels.${a.training.level}`)} />
        <Row label={t('assessment.trainingLocation')} value={t(`assessment.locations.${a.training.location}`)} />
      </Section>
      <Section title={t('assessment.steps.4')}>
        <Row
          label={t('assessment.injuriesQ')}
          value={a.health.noInjuries ? t('assessment.injuries.none') : a.health.injuries.map((i) => t(`assessment.injuries.${i}`)).join(', ')}
        />
        {a.health.injuryDetails && <Row label={t('assessment.injuryDetails')} value={a.health.injuryDetails} />}
        <Row label={t('assessment.medicalQ')} value={a.health.hasMedicalConditions ? t('common.yes') : t('common.no')} />
        {a.health.medicalDetails && <Row label={t('assessment.medicalDetails')} value={a.health.medicalDetails} />}
      </Section>
      <Section title={t('assessment.steps.5')}>
        <Row label={t('assessment.likes')} value={a.nutrition.likes.join(', ')} />
        <Row label={t('assessment.dislikes')} value={a.nutrition.dislikes.join(', ')} />
        <Row label={t('assessment.allergies')} value={a.nutrition.allergies.join(', ')} />
        <Row label={t('assessment.mustHave')} value={(a.nutrition.mustHaveFoods ?? []).join(', ')} />
        <Row label={t('assessment.budget')} value={t(`assessment.budgets.${a.nutrition.budget}`)} />
        <Row label={t('assessment.mealsPerDay')} value={`${a.nutrition.mealsPerDay}`} />
      </Section>
      <Section title={t('assessment.steps.6')}>
        <Row label={t('assessment.challengeQ')} value={t(`assessment.challenges.${a.motivation.biggestChallenge}`)} />
        <Row label={t('assessment.commitmentQ')} value={`${a.motivation.commitmentLevel}/10`} />
      </Section>

      {(['front', 'side', 'back'] as const).some((p) => a.progressPhotos?.[p]) && (
        <section>
          <h2 className="h2 mb-2">{t('assessment.steps.7')}</h2>
          <div className="grid grid-cols-3 gap-2">
            {(() => {
              const urls = (['front', 'side', 'back'] as const).map((p) => a.progressPhotos?.[p]).filter((u): u is string => !!u);
              return (['front', 'side', 'back'] as const).map((pose) => {
                const url = a.progressPhotos?.[pose];
                if (!url) return null;
                return (
                  <button key={pose} type="button" className="block" onClick={() => viewImages(urls, urls.indexOf(url))}>
                    <img src={url} alt={pose} className="aspect-[3/4] w-full rounded-xl object-cover" />
                    <span className="mt-1 block text-center text-[11px] text-earth-subtle">{t(`progress.${pose}`)}</span>
                  </button>
                );
              });
            })()}
          </div>
        </section>
      )}
    </div>
  );
}
