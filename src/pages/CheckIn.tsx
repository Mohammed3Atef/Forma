import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { TopBar } from '@/components/TopBar';
import { Slider } from '@/components/Slider';
import { NumberStepper } from '@/components/NumberStepper';
import { PosePhotoPicker } from '@/components/PosePhotoPicker';
import { CheckInSummary } from '@/components/CheckInSummary';
import { isBunnyConfigured } from '@/services/platform/bunnyUploadApi';
import { getCheckIn, submitCheckIn, type CheckInSubmission } from '@/services/platform/checkInApi';
import { useSession } from '@/services/auth/sessionStore';
import { shortDate } from '@/lib/utils';

/** Client weekly check-in: a quick form when 'requested', a read-only summary + coach feedback otherwise. */
export function CheckIn() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const uid = useSession((s) => s.uid) ?? '';

  const q = useQuery({ queryKey: ['checkIn', uid, id], queryFn: () => getCheckIn(uid, id), enabled: !!uid && !!id });
  const checkIn = q.data;

  const [form, setForm] = useState<CheckInSubmission>({ adherenceTraining: 80, adherenceNutrition: 80, hungerLevel: 5, energyLevel: 5, sleepQuality: 5, progressPhotos: {} });
  const submit = useMutation({
    mutationFn: () => submitCheckIn(uid, id, form),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['checkIn', uid, id] });
      void qc.invalidateQueries({ queryKey: ['activeCheckIn', uid] });
      void qc.invalidateQueries({ queryKey: ['checkInsHistory', uid] });
    },
  });

  const setPhoto = (pose: 'front' | 'side' | 'back', url?: string) =>
    setForm((f) => ({ ...f, progressPhotos: { ...f.progressPhotos, [pose]: url } }));

  return (
    <div className="anim-rise space-y-4">
      <TopBar title={t('checkin.title')} eyebrow={checkIn ? `${shortDate(checkIn.weekStart, i18n.language)} – ${shortDate(checkIn.weekEnd, i18n.language)}` : ''} onBack={() => navigate(-1)} />

      {q.isLoading ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('auth.working')}</p>
      ) : !checkIn ? (
        <p className="py-8 text-center text-sm text-earth-muted">{t('checkin.notFound')}</p>
      ) : checkIn.status === 'requested' ? (
        <>
          <div className="card space-y-4">
            <div>
              <label className="label">{t('checkin.weight')}</label>
              <NumberStepper value={form.currentWeight ?? null} onChange={(v) => setForm({ ...form, currentWeight: v ?? undefined })} step={0.1} min={0} max={400} suffix={t('common.kg')} ariaLabel={t('checkin.weight')} />
            </div>
            <div>
              <label className="label mb-1 block">{t('checkin.trainingAdherence')}</label>
              <Slider value={form.adherenceTraining ?? 0} min={0} max={100} step={5} onChange={(v) => setForm({ ...form, adherenceTraining: v })} format={(v) => `${v}%`} testId="checkin-training" />
            </div>
            <div>
              <label className="label mb-1 block">{t('checkin.nutritionAdherence')}</label>
              <Slider value={form.adherenceNutrition ?? 0} min={0} max={100} step={5} onChange={(v) => setForm({ ...form, adherenceNutrition: v })} format={(v) => `${v}%`} testId="checkin-nutrition" />
            </div>
            <div>
              <label className="label mb-1 block">{t('checkin.hunger')}</label>
              <Slider value={form.hungerLevel ?? 5} min={1} max={10} onChange={(v) => setForm({ ...form, hungerLevel: v })} testId="checkin-hunger" />
            </div>
            <div>
              <label className="label mb-1 block">{t('checkin.energy')}</label>
              <Slider value={form.energyLevel ?? 5} min={1} max={10} onChange={(v) => setForm({ ...form, energyLevel: v })} testId="checkin-energy" />
            </div>
            <div>
              <label className="label mb-1 block">{t('checkin.sleep')}</label>
              <Slider value={form.sleepQuality ?? 5} min={1} max={10} onChange={(v) => setForm({ ...form, sleepQuality: v })} testId="checkin-sleep" />
            </div>
            <div>
              <label className="label">{t('checkin.notes')}</label>
              <textarea className="input min-h-20" data-testid="checkin-notes" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>

          {/* Optional progress photos */}
          {isBunnyConfigured() && (
            <div className="space-y-2">
              <p className="label">{t('checkin.photos')}</p>
              {(['front', 'side', 'back'] as const).map((pose) => (
                <PosePhotoPicker key={pose} pose={pose} folder={`Forma/${uid}/checkin/${id}`} url={form.progressPhotos?.[pose]} onChange={(url) => setPhoto(pose, url)} />
              ))}
            </div>
          )}

          <button type="button" data-testid="checkin-submit" className="btn-primary btn-lg w-full disabled:opacity-40" disabled={submit.isPending} onClick={() => submit.mutate()}>
            {t('checkin.submit')}
          </button>
        </>
      ) : (
        <>
          <span className="chip border-success/50 text-success">{t(`checkin.status.${checkIn.status}`)}</span>
          {checkIn.status === 'reviewed' && checkIn.coachFeedback && (
            <div className="card border border-brand/30">
              <p className="label">{t('checkin.coachFeedback')}</p>
              <p className="whitespace-pre-wrap text-sm">{checkIn.coachFeedback}</p>
            </div>
          )}
          <div className="card">
            <CheckInSummary checkIn={checkIn} />
          </div>
        </>
      )}
    </div>
  );
}
