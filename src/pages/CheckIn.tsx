import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { Slider } from '@/components/Slider';
import { NumberStepper } from '@/components/NumberStepper';
import { PosePhotoPicker } from '@/components/PosePhotoPicker';
import { CheckInSummary } from '@/components/CheckInSummary';
import { isBunnyConfigured } from '@/services/platform/bunnyUploadApi';
import { getCheckIn, submitCheckIn, type CheckInSubmission } from '@/services/platform/checkInApi';
import { useSession } from '@/services/auth/sessionStore';
import { showToast } from '@/stores/toastStore';
import { shortDate } from '@/lib/utils';
import { Pill, type PillTone } from '@/components/ui/Pill';
import type { CheckInStatus } from '@/types';

const TONE: Record<CheckInStatus, PillTone> = {
  requested: 'warn',
  submitted: 'brand',
  reviewed: 'ok',
};

const STEPS = ['body', 'training', 'nutrition', 'notes'] as const;
type Step = (typeof STEPS)[number];

/**
 * Client weekly check-in — a 4-step wizard (Body → Training → Nutrition →
 * Notes) matching the approved design exactly when a check-in is requested;
 * a read-only summary + coach feedback once submitted/reviewed.
 */
export function CheckIn() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const uid = useSession((s) => s.uid) ?? '';

  const q = useQuery({ queryKey: ['checkIn', uid, id], queryFn: () => getCheckIn(uid, id), enabled: !!uid && !!id });
  const checkIn = q.data;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<CheckInSubmission>({ adherenceTraining: 80, adherenceNutrition: 80, hungerLevel: 5, energyLevel: 5, sleepQuality: 5, progressPhotos: {} });
  const submit = useMutation({
    mutationFn: () => submitCheckIn(uid, id, form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checkIn', uid, id] });
      void qc.invalidateQueries({ queryKey: ['activeCheckIn', uid] });
      void qc.invalidateQueries({ queryKey: ['checkInsHistory', uid] });
      showToast({ title: t('checkin.submitted'), variant: 'success' });
    },
  });

  const setPhoto = (pose: 'front' | 'side' | 'back', url?: string) =>
    setForm((f) => ({ ...f, progressPhotos: { ...f.progressPhotos, [pose]: url } }));

  const stepName: Step = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const goNext = () => {
    if (isLast) {
      submit.mutate();
      return;
    }
    setStep((s) => s + 1);
  };
  const goBack = () => {
    if (step === 0) {
      navigate(-1);
      return;
    }
    setStep((s) => s - 1);
  };

  if (q.isLoading) {
    return (
      <div className="anim-rise">
        <TopBar title={t('checkin.title')} onBack={() => navigate(-1)} />
        <LoadingState variant="list" count={3} />
      </div>
    );
  }
  if (!checkIn) {
    return (
      <div className="anim-rise">
        <TopBar title={t('checkin.title')} onBack={() => navigate(-1)} />
        <p className="py-8 text-center text-sm text-earth-muted">{t('checkin.notFound')}</p>
      </div>
    );
  }

  // Already submitted/reviewed — read-only summary, not the wizard.
  if (checkIn.status !== 'requested') {
    return (
      <div className="anim-rise space-y-4">
        <TopBar title={t('checkin.title')} eyebrow={`${shortDate(checkIn.weekStart, i18n.language)} – ${shortDate(checkIn.weekEnd, i18n.language)}`} onBack={() => navigate(-1)} />
        <Pill tone={TONE[checkIn.status]}>{t(`checkin.status.${checkIn.status}`)}</Pill>
        {checkIn.status === 'reviewed' && checkIn.coachFeedback && (
          <div className="card border border-brand/30">
            <p className="label">{t('checkin.coachFeedback')}</p>
            <p className="whitespace-pre-wrap text-sm">{checkIn.coachFeedback}</p>
          </div>
        )}
        <div className="card">
          <CheckInSummary checkIn={checkIn} />
        </div>
      </div>
    );
  }

  // --- The 4-step wizard ---
  return (
    <div className="-mx-5 flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-surface px-5 py-3">
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" onClick={goBack} className="icon-btn h-9 w-9" aria-label={t('checkin.back')}>
            <Icon name="chevronLeft" size={18} className="rtl:rotate-180" />
          </button>
          <p className="ui-label">{t('checkin.title')}</p>
          <button type="button" onClick={() => navigate(-1)} className="icon-btn h-9 w-9" aria-label={t('common.close')}>
            <Icon name="close" size={16} />
          </button>
        </div>
        <div className="prog mb-2">
          <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
        <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.06em] text-earth-muted">
          <span>{t('checkin.stepOf', { n: step + 1, total: STEPS.length, name: t(`checkin.steps.${stepName}`) })}</span>
          <span>{t('checkin.minLeft', { n: STEPS.length - step })}</span>
        </div>
      </header>

      <div className="flex-1 space-y-4 px-5 py-5 pb-28">
        {stepName === 'body' && (
          <>
            <h1 className="h1">{t('checkin.steps.body')}</h1>
            <p className="bd">{t('checkin.bodyIntro')}</p>
            <div className="card space-y-4">
              <div>
                <label className="label">{t('checkin.weight')}</label>
                <NumberStepper value={form.currentWeight ?? null} onChange={(v) => setForm({ ...form, currentWeight: v ?? undefined })} step={0.1} min={0} max={400} suffix={t('common.kg')} ariaLabel={t('checkin.weight')} />
              </div>
              <div>
                <label className="label mb-1 block">{t('checkin.energy')}</label>
                <Slider value={form.energyLevel ?? 5} min={1} max={10} onChange={(v) => setForm({ ...form, energyLevel: v })} testId="checkin-energy" />
              </div>
              <div>
                <label className="label mb-1 block">{t('checkin.sleep')}</label>
                <Slider value={form.sleepQuality ?? 5} min={1} max={10} onChange={(v) => setForm({ ...form, sleepQuality: v })} testId="checkin-sleep" />
              </div>
            </div>
          </>
        )}

        {stepName === 'training' && (
          <>
            <h1 className="h1">{t('checkin.steps.training')}</h1>
            <p className="bd">{t('checkin.trainingIntro')}</p>
            <div className="card">
              <label className="label mb-1 block">{t('checkin.trainingAdherence')}</label>
              <Slider value={form.adherenceTraining ?? 0} min={0} max={100} step={5} onChange={(v) => setForm({ ...form, adherenceTraining: v })} format={(v) => `${v}%`} testId="checkin-training" />
            </div>
          </>
        )}

        {stepName === 'nutrition' && (
          <>
            <h1 className="h1">{t('checkin.steps.nutrition')}</h1>
            <p className="bd">{t('checkin.nutritionIntro')}</p>
            <div className="card space-y-4">
              <div>
                <label className="label mb-1 block">{t('checkin.nutritionAdherence')}</label>
                <Slider value={form.adherenceNutrition ?? 0} min={0} max={100} step={5} onChange={(v) => setForm({ ...form, adherenceNutrition: v })} format={(v) => `${v}%`} testId="checkin-nutrition" />
              </div>
              <div>
                <label className="label mb-1 block">{t('checkin.hunger')}</label>
                <Slider value={form.hungerLevel ?? 5} min={1} max={10} onChange={(v) => setForm({ ...form, hungerLevel: v })} testId="checkin-hunger" />
              </div>
            </div>
          </>
        )}

        {stepName === 'notes' && (
          <>
            <h1 className="h1">{t('checkin.steps.notes')}</h1>
            <p className="bd">{t('checkin.notesIntro')}</p>
            <div className="card">
              <label className="label">{t('checkin.notes')}</label>
              <textarea className="input min-h-20" data-testid="checkin-notes" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {isBunnyConfigured() && (
              <div className="space-y-2">
                <p className="label">{t('checkin.photos')}</p>
                {(['front', 'side', 'back'] as const).map((pose) => (
                  <PosePhotoPicker key={pose} pose={pose} folder={`Forma/${uid}/checkin/${id}`} url={form.progressPhotos?.[pose]} onChange={(url) => setPhoto(pose, url)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="sticky bottom-0 border-t border-line bg-surface px-5 py-4">
        {submit.isError && (
          <p role="alert" className="mb-3 text-center text-sm text-danger" data-testid="checkin-error">
            {t('common.errorGeneric')}
          </p>
        )}
        <button type="button" data-testid={isLast ? 'checkin-submit' : 'checkin-next'} className="btn-primary btn-lg w-full disabled:opacity-40" disabled={submit.isPending} onClick={goNext}>
          {isLast ? (submit.isPending ? t('auth.working') : (<><Icon name="check" size={16} /> {t('checkin.submit')}</>)) : (<>{t('checkin.continue')} <Icon name="chevron" size={16} className="rtl:rotate-180" /></>)}
        </button>
      </div>
    </div>
  );
}
