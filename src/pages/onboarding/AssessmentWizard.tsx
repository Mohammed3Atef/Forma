import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import localforage from 'localforage';
import { Icon } from '@/components/Icon';
import { Slider } from '@/components/Slider';
import { TagInput } from '@/components/TagInput';
import { saveAssessmentProgress, submitAssessment } from '@/services/platform/clientCoachApi';
import type {
  ActivityLevel,
  AssessmentChallenge,
  AssessmentGoal,
  ClientAssessment,
  FoodBudget,
  Gender,
  Goal,
  InjuryArea,
  OccupationType,
  TrainingLevel,
  TrainingLocation,
  UserProfile,
} from '@/types';

const draftStore = localforage.createInstance({ name: 'gym-tracker', storeName: 'meta' });
const STEP_COUNT = 8;

/** The object-valued sections of the assessment (excludes scalar meta fields). */
type SectionKey = 'basic' | 'goals' | 'lifestyle' | 'training' | 'health' | 'nutrition' | 'motivation' | 'progressPhotos';

const GENDERS: Gender[] = ['male', 'female'];
const GOALS: AssessmentGoal[] = ['fat_loss', 'muscle_gain', 'recomp', 'strength', 'general_fitness', 'endurance'];
const OCCUPATIONS: OccupationType[] = ['desk', 'moderate', 'physical'];
const ACTIVITIES: ActivityLevel[] = ['sedentary', 'light', 'active', 'very_active'];
const LEVELS: TrainingLevel[] = ['beginner', 'intermediate', 'advanced'];
const LOCATIONS: TrainingLocation[] = ['commercial_gym', 'home_gym', 'both'];
const INJURIES: InjuryArea[] = ['shoulder', 'elbow', 'wrist', 'back', 'knee', 'ankle'];
const BUDGETS: FoodBudget[] = ['low', 'medium', 'high'];
const CHALLENGES: AssessmentChallenge[] = ['consistency', 'time', 'hunger', 'eating_out', 'travel', 'motivation', 'other'];

/** Map the richer assessment goal onto the tracker's profile goal. */
const GOAL_TO_PROFILE: Record<AssessmentGoal, Goal> = {
  fat_loss: 'fat_loss',
  muscle_gain: 'muscle_gain',
  recomp: 'recomp',
  strength: 'strength',
  general_fitness: 'maintenance',
  endurance: 'maintenance',
};

function emptyAssessment(name: string): ClientAssessment {
  return {
    basic: { fullName: name, dateOfBirth: '', age: 0, gender: 'male', heightCm: 0, weightKg: 0 },
    goals: { primaryGoal: 'fat_loss', goalPriorities: [] },
    lifestyle: { occupation: 'desk', sleepHours: 8, activityLevel: 'sedentary', trainingDaysPerWeek: 3 },
    training: { level: 'beginner', location: 'commercial_gym' },
    health: { injuries: [], noInjuries: false, hasMedicalConditions: false },
    nutrition: { likes: [], dislikes: [], allergies: [], mustHaveFoods: [], budget: 'medium', mealsPerDay: 3 },
    motivation: { biggestChallenge: 'consistency', commitmentLevel: 7 },
    progressPhotos: {},
    completionPercentage: 0,
    completed: false,
    completedAt: null,
    updatedAt: 0,
  };
}

function ageFromDob(dob: string): number {
  if (!dob) return 0;
  const ms = Date.now() - new Date(dob).getTime();
  return ms > 0 ? Math.floor(ms / (365.25 * 86_400_000)) : 0;
}

/** Which steps are valid given the draft (only basic + health can be invalid). */
function stepValid(step: number, a: ClientAssessment): boolean {
  switch (step) {
    case 0:
      return (
        a.basic.fullName.trim().length > 0 &&
        a.basic.dateOfBirth.length > 0 &&
        a.basic.heightCm > 0 &&
        a.basic.weightKg > 0
      );
    case 4: {
      const injuryAnswered = a.health.noInjuries || a.health.injuries.length > 0;
      const injuryOk = a.health.injuries.length === 0 || !!a.health.injuryDetails?.trim();
      const medicalOk = !a.health.hasMedicalConditions || !!a.health.medicalDetails?.trim();
      return injuryAnswered && injuryOk && medicalOk;
    }
    default:
      return true;
  }
}

export function AssessmentWizard({ uid, displayName }: { uid: string; displayName: string }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const draftKey = `assessmentDraft:${uid}`;

  const [a, setA] = useState<ClientAssessment>(() => emptyAssessment(displayName));
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [savedTick, setSavedTick] = useState(false);

  // Load any saved draft so an interrupted assessment resumes where it left off.
  useEffect(() => {
    let cancelled = false;
    void draftStore.getItem<{ a: ClientAssessment; step: number }>(draftKey).then((saved) => {
      if (cancelled) return;
      if (saved?.a) {
        setA(saved.a);
        setStep(Math.min(saved.step ?? 0, STEP_COUNT - 1));
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  // Persist progress locally on every change (after the initial hydrate).
  useEffect(() => {
    if (!hydrated || submitted) return;
    void draftStore.setItem(draftKey, { a, step });
  }, [a, step, hydrated, submitted, draftKey]);

  const patch = <K extends SectionKey>(key: K, value: Partial<ClientAssessment[K]>) =>
    setA((prev) => ({ ...prev, [key]: { ...prev[key], ...value } }));

  const firstInvalidStep = (): number => {
    for (let i = 0; i < STEP_COUNT; i += 1) if (!stepValid(i, a)) return i;
    return -1;
  };

  // Persist a draft to Firestore (status `in_progress`) so the coach sees the
  // client has started and progress survives across devices.
  const saveProgress = async () => {
    setSavingDraft(true);
    try {
      await saveAssessmentProgress(uid, a);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSavingDraft(false);
    }
  };

  const submit = async () => {
    const bad = firstInvalidStep();
    if (bad >= 0) {
      setStep(bad);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const age = ageFromDob(a.basic.dateOfBirth);
      const finalAssessment: ClientAssessment = {
        ...a,
        basic: { ...a.basic, age },
        completionPercentage: 100,
      };
      const profile: UserProfile = {
        id: uid,
        name: a.basic.fullName.trim(),
        age,
        weightKg: a.basic.weightKg,
        heightCm: a.basic.heightCm,
        goal: GOAL_TO_PROFILE[a.goals.primaryGoal],
        activityLevel: a.lifestyle.activityLevel,
        locale: i18n.language === 'ar' ? 'ar' : 'en',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await submitAssessment(uid, finalAssessment, profile);
      await draftStore.removeItem(draftKey);
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-black px-8 text-center" data-testid="assessment-done">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-black">
          <Icon name="check" size={32} />
        </span>
        <h1 className="h1">{t('assessment.doneTitle')}</h1>
        <p className="max-w-sm text-sm text-earth-muted">{t('assessment.doneBody')}</p>
        <button
          type="button"
          data-testid="assessment-go-dashboard"
          className="btn-primary btn-lg w-full max-w-xs"
          onClick={() => void qc.invalidateQueries({ queryKey: ['assessment', uid] })}
        >
          {t('assessment.goToDashboard')}
        </button>
      </div>
    );
  }

  const isLast = step === STEP_COUNT - 1;
  const canAdvance = stepValid(step, a);
  const pct = Math.round(((step + 1) / STEP_COUNT) * 100);

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-surface" data-testid="assessment-wizard">
      <div
        className="mx-auto flex h-full w-full max-w-[430px] flex-col px-4"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))', paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl2 border border-line bg-surface-card">
          {/* Header — brand, progress, step title + helper */}
          <header className="border-b border-line-soft px-5 pb-3 pt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="eyebrow">{t('app.name')}</span>
              <span className="font-mono text-[11px] text-earth-subtle">{t('assessment.stepOf', { x: step + 1, y: STEP_COUNT })}</span>
            </div>
            <div className="prog">
              <span style={{ width: `${pct}%` }} />
            </div>
            <h1 className="h2 mt-3">{t(`assessment.steps.${step}`)}</h1>
            <div className="mt-1 flex items-center justify-between gap-3">
              <p className="text-[13px] text-earth-muted">{t(`assessment.help.${step}`)}</p>
              <button
                type="button"
                data-testid="assessment-save-progress"
                onClick={() => void saveProgress()}
                disabled={savingDraft}
                className="shrink-0 text-[12px] font-medium text-brand disabled:opacity-40"
              >
                {savedTick ? t('assessment.progressSaved') : t('assessment.saveProgress')}
              </button>
            </div>
          </header>

          {/* Body — scrolls inside the card */}
          <main className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">{renderStep(step, a, patch, t)}</main>

          {/* Footer — Back / Next-or-Submit, never covers inputs */}
          <footer className="border-t border-line-soft px-5 py-3">
            {error && <p className="mb-2 text-center text-sm text-danger">{error}</p>}
            <div className="flex gap-3">
              {step > 0 && (
                <button type="button" className="btn-ghost flex-1" data-testid="assessment-back" onClick={() => setStep((s) => s - 1)}>
                  {t('common.previous')}
                </button>
              )}
              {isLast ? (
                <button type="button" className="btn-primary flex-[2] disabled:opacity-40" data-testid="assessment-submit" disabled={submitting} onClick={() => void submit()}>
                  {submitting ? t('auth.working') : t('assessment.submit')}
                </button>
              ) : (
                <button type="button" className="btn-primary flex-[2] disabled:opacity-40" data-testid="assessment-next" disabled={!canAdvance} onClick={() => setStep((s) => s + 1)}>
                  {t('assessment.next')}
                </button>
              )}
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

type Patch = <K extends SectionKey>(key: K, value: Partial<ClientAssessment[K]>) => void;
type TFn = (key: string, opts?: Record<string, unknown>) => string;

function Chips<T extends string>({ options, value, onPick, tkey, t, multi, testId }: { options: T[]; value: T | T[]; onPick: (v: T) => void; tkey: string; t: TFn; multi?: boolean; testId?: string }) {
  const isOn = (o: T) => (multi ? (value as T[]).includes(o) : value === o);
  return (
    <div className="flex flex-wrap gap-2" data-testid={testId}>
      {options.map((o) => (
        <button key={o} type="button" data-testid={`opt-${o}`} onClick={() => onPick(o)} className={`chip ${isOn(o) ? 'chip-on' : ''}`}>
          {t(`${tkey}.${o}`)}
        </button>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      {children}
    </div>
  );
}

function renderStep(step: number, a: ClientAssessment, patch: Patch, t: TFn): React.ReactNode {
  switch (step) {
    case 0:
      return (
        <div className="space-y-4">
          <Field label={t('assessment.fullName')}>
            <input className="input" data-testid="a-fullname" value={a.basic.fullName} onChange={(e) => patch('basic', { fullName: e.target.value })} />
          </Field>
          <Field label={t('assessment.dob')}>
            <input type="date" className="input" data-testid="a-dob" value={a.basic.dateOfBirth} onChange={(e) => patch('basic', { dateOfBirth: e.target.value })} />
          </Field>
          <Field label={t('assessment.gender')}>
            <Chips options={GENDERS} value={a.basic.gender} onPick={(v) => patch('basic', { gender: v })} tkey="assessment.genders" t={t} testId="a-gender" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t('settings.height')} (cm)`}>
              <input className="input" inputMode="numeric" data-testid="a-height" value={a.basic.heightCm || ''} onChange={(e) => patch('basic', { heightCm: Number(e.target.value) || 0 })} />
            </Field>
            <Field label={`${t('settings.weight')} (${t('common.kg')})`}>
              <input className="input" inputMode="decimal" data-testid="a-weight" value={a.basic.weightKg || ''} onChange={(e) => patch('basic', { weightKg: Number(e.target.value) || 0 })} />
            </Field>
          </div>
        </div>
      );
    case 1:
      return (
        <div className="space-y-4">
          <Field label={t('assessment.primaryGoal')}>
            <Chips options={GOALS} value={a.goals.primaryGoal} onPick={(v) => patch('goals', { primaryGoal: v })} tkey="assessment.goalOptions" t={t} testId="a-goal" />
          </Field>
          <Field label={t('assessment.goalPriorities')}>
            <p className="mb-2 text-[12px] text-earth-subtle">{t('assessment.goalPrioritiesHint')}</p>
            <div className="flex flex-wrap gap-2" data-testid="a-goal-priorities">
              {GOALS.map((g) => {
                const idx = (a.goals.goalPriorities ?? []).indexOf(g);
                const on = idx >= 0;
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => {
                      const cur = a.goals.goalPriorities ?? [];
                      patch('goals', { goalPriorities: on ? cur.filter((x) => x !== g) : [...cur, g] });
                    }}
                    className={`chip ${on ? 'chip-on' : ''}`}
                  >
                    {on && <span className="me-1 font-semibold">{idx + 1}.</span>}
                    {t(`assessment.goalOptions.${g}`)}
                  </button>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`${t('assessment.targetWeight')} (${t('common.kg')})`}>
              <input className="input" inputMode="decimal" value={a.goals.targetWeightKg ?? ''} onChange={(e) => patch('goals', { targetWeightKg: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
            <Field label={t('assessment.deadlineMonths')}>
              <input className="input" inputMode="numeric" value={a.goals.deadlineMonths ?? ''} onChange={(e) => patch('goals', { deadlineMonths: e.target.value ? Number(e.target.value) : undefined })} />
            </Field>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="space-y-4">
          <Field label={t('assessment.occupation')}>
            <Chips options={OCCUPATIONS} value={a.lifestyle.occupation} onPick={(v) => patch('lifestyle', { occupation: v })} tkey="assessment.occupations" t={t} />
          </Field>
          <Field label={t('assessment.sleepHours')}>
            <Slider value={a.lifestyle.sleepHours} min={4} max={12} onChange={(v) => patch('lifestyle', { sleepHours: v })} format={(v) => `${v} h`} testId="a-sleep" />
          </Field>
          <Field label={t('assessment.activity')}>
            <Chips options={ACTIVITIES} value={a.lifestyle.activityLevel} onPick={(v) => patch('lifestyle', { activityLevel: v })} tkey="assessment.activities" t={t} />
          </Field>
          <Field label={t('assessment.trainingDays')}>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button key={n} type="button" onClick={() => patch('lifestyle', { trainingDaysPerWeek: n })} className={`chip ${a.lifestyle.trainingDaysPerWeek === n ? 'chip-on' : ''}`}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
        </div>
      );
    case 3:
      return (
        <div className="space-y-4">
          <Field label={t('assessment.trainingLevel')}>
            <Chips options={LEVELS} value={a.training.level} onPick={(v) => patch('training', { level: v })} tkey="assessment.levels" t={t} testId="a-level" />
          </Field>
          <Field label={t('assessment.trainingLocation')}>
            <Chips options={LOCATIONS} value={a.training.location} onPick={(v) => patch('training', { location: v })} tkey="assessment.locations" t={t} />
          </Field>
        </div>
      );
    case 4:
      return (
        <div className="space-y-4">
          <Field label={t('assessment.injuriesQ')}>
            <div className="flex flex-wrap gap-2">
              {INJURIES.map((inj) => (
                <button
                  key={inj}
                  type="button"
                  onClick={() => {
                    const has = a.health.injuries.includes(inj);
                    patch('health', { injuries: has ? a.health.injuries.filter((x) => x !== inj) : [...a.health.injuries, inj], noInjuries: false });
                  }}
                  className={`chip ${a.health.injuries.includes(inj) ? 'chip-on' : ''}`}
                >
                  {t(`assessment.injuries.${inj}`)}
                </button>
              ))}
              <button type="button" data-testid="a-no-injuries" onClick={() => patch('health', { injuries: [], noInjuries: true })} className={`chip ${a.health.noInjuries ? 'chip-on' : ''}`}>
                {t('assessment.injuries.none')}
              </button>
            </div>
          </Field>
          {a.health.injuries.length > 0 && (
            <Field label={t('assessment.injuryDetails')}>
              <textarea className="input min-h-20" value={a.health.injuryDetails ?? ''} onChange={(e) => patch('health', { injuryDetails: e.target.value })} />
            </Field>
          )}
          <Field label={t('assessment.medicalQ')}>
            <div className="flex gap-2">
              <button type="button" onClick={() => patch('health', { hasMedicalConditions: false, medicalDetails: undefined })} className={`chip ${!a.health.hasMedicalConditions ? 'chip-on' : ''}`}>
                {t('common.no')}
              </button>
              <button type="button" data-testid="a-medical-yes" onClick={() => patch('health', { hasMedicalConditions: true })} className={`chip ${a.health.hasMedicalConditions ? 'chip-on' : ''}`}>
                {t('common.yes')}
              </button>
            </div>
          </Field>
          {a.health.hasMedicalConditions && (
            <Field label={t('assessment.medicalDetails')}>
              <textarea className="input min-h-20" value={a.health.medicalDetails ?? ''} onChange={(e) => patch('health', { medicalDetails: e.target.value })} />
            </Field>
          )}
        </div>
      );
    case 5:
      return (
        <div className="space-y-4">
          <Field label={t('assessment.likes')}>
            <TagInput values={a.nutrition.likes} onChange={(v) => patch('nutrition', { likes: v })} placeholder={t('assessment.tagPlaceholder')} testId="a-likes" />
          </Field>
          <Field label={t('assessment.dislikes')}>
            <TagInput values={a.nutrition.dislikes} onChange={(v) => patch('nutrition', { dislikes: v })} placeholder={t('assessment.tagPlaceholder')} />
          </Field>
          <Field label={t('assessment.allergies')}>
            <TagInput values={a.nutrition.allergies} onChange={(v) => patch('nutrition', { allergies: v })} placeholder={t('assessment.tagPlaceholder')} />
          </Field>
          <Field label={t('assessment.mustHave')}>
            <TagInput values={a.nutrition.mustHaveFoods} onChange={(v) => patch('nutrition', { mustHaveFoods: v })} placeholder={t('assessment.tagPlaceholder')} testId="a-musthave" />
          </Field>
          <Field label={t('assessment.budget')}>
            <Chips options={BUDGETS} value={a.nutrition.budget} onPick={(v) => patch('nutrition', { budget: v })} tkey="assessment.budgets" t={t} />
          </Field>
          <Field label={t('assessment.mealsPerDay')}>
            <div className="flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6].map((n) => (
                <button key={n} type="button" onClick={() => patch('nutrition', { mealsPerDay: n })} className={`chip ${a.nutrition.mealsPerDay === n ? 'chip-on' : ''}`}>
                  {n}
                </button>
              ))}
            </div>
          </Field>
        </div>
      );
    case 6:
      return (
        <div className="space-y-4">
          <Field label={t('assessment.challengeQ')}>
            <Chips options={CHALLENGES} value={a.motivation.biggestChallenge} onPick={(v) => patch('motivation', { biggestChallenge: v })} tkey="assessment.challenges" t={t} />
          </Field>
          <Field label={t('assessment.commitmentQ')}>
            <Slider value={a.motivation.commitmentLevel} min={1} max={10} onChange={(v) => patch('motivation', { commitmentLevel: v })} testId="a-commitment" />
          </Field>
        </div>
      );
    case 7:
    default:
      return (
        <div className="space-y-3">
          <p className="text-sm text-earth-muted">{t('assessment.photosHint')}</p>
          {(['front', 'side', 'back'] as const).map((pose) => (
            <div key={pose} className="card flex items-center justify-between opacity-60">
              <span className="font-medium">{t(`progress.${pose}`)}</span>
              <span className="font-mono text-[11px] text-earth-subtle">{t('assessment.photosSoon')}</span>
            </div>
          ))}
        </div>
      );
  }
}
