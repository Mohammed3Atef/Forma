import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { LoadingState } from '@/components/ui/LoadingState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Slider } from '@/components/Slider';
import { NumericField } from '@/components/ui/NumericField';
import { PosePhotoPicker } from '@/components/PosePhotoPicker';
import { CheckInSummary } from '@/components/CheckInSummary';
import { useUploadConfigured } from '@/services/platform/mediaApi';
import { getCheckIn, type CheckInSubmission } from '@/services/platform/checkInApi';
import { discardOutbox, onOutboxAck, retryOutbox, useOutbox, waitForFirstAttempt } from '@/data/outbox/outbox';
import { isLocalRef, queueCheckInSubmit, stashCheckInPhoto } from '@/data/outbox/handlers';
import { blobStore } from '@/data/blobStore';
import { useSession } from '@/services/auth/sessionStore';
import { useBack } from '@/hooks/useBack';
import { showToast } from '@/stores/toastStore';
import { confirmDialog } from '@/stores/dialogStore';
import { setNavGuard } from '@/stores/navGuardStore';
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

const INITIAL: CheckInSubmission = { adherenceTraining: 80, adherenceNutrition: 80, hungerLevel: 5, energyLevel: 5, sleepQuality: 5, progressPhotos: {} };

/**
 * Answers are saved on the device as they're given (B0 / CL-42, JR-05) so
 * closing the flow, a reload, an OS kill or an update reload never loses them;
 * the flow resumes at the same step. Cleared after a confirmed submit.
 */
const draftKey = (uid: string, id: string) => `forma.checkinDraft.v1.${uid}.${id}`;
function readDraft(uid: string, id: string): { form: CheckInSubmission; step: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(uid, id));
    return raw ? (JSON.parse(raw) as { form: CheckInSubmission; step: number }) : null;
  } catch {
    return null;
  }
}
function writeDraft(uid: string, id: string, draft: { form: CheckInSubmission; step: number } | null): void {
  try {
    if (draft) localStorage.setItem(draftKey(uid, id), JSON.stringify(draft));
    else localStorage.removeItem(draftKey(uid, id));
  } catch {
    /* storage unavailable — answers just won't survive a reload */
  }
}

/**
 * Client weekly check-in — a 4-step wizard (Body → Training → Nutrition →
 * Notes) matching the approved design exactly when a check-in is requested;
 * a read-only summary + coach feedback once submitted/reviewed.
 */
export function CheckIn() {
  const { t, i18n } = useTranslation();
  // Real back when there is in-app history; `/check-ins` when this was opened
  // from a notification deep link / fresh tab (where `navigate(-1)` would
  // either do nothing or leave the site).
  const leave = useBack('/check-ins');
  const qc = useQueryClient();
  const { id = '' } = useParams();
  const uid = useSession((s) => s.uid) ?? '';
  const uploadsEnabled = useUploadConfigured();

  const q = useQuery({ queryKey: ['checkIn', uid, id], queryFn: () => getCheckIn(uid, id), enabled: !!uid && !!id });
  const checkIn = q.data;

  // Resume a saved draft (answers + step) for this check-in on this device.
  const saved = useMemo(() => (uid && id ? readDraft(uid, id) : null), [uid, id]);
  const [step, setStep] = useState(() => Math.min(saved?.step ?? 0, STEPS.length - 1));
  const [form, setForm] = useState<CheckInSubmission>(() => saved?.form ?? INITIAL);
  const dirty = useMemo(() => step > 0 || JSON.stringify(form) !== JSON.stringify(INITIAL), [form, step]);
  const submittingRef = useRef(false);
  const [done, setDone] = useState(false);
  // The submission is a durable outbox op (B1.6 / PWA-12): it survives a reload
  // or a dead connection and is sent by itself; "submitted" only on the
  // server's acknowledgement.
  const outboxOps = useOutbox((s) => s.ops);
  const queued = useMemo(() => outboxOps.find((o) => o.dedupeKey === `checkin:${id}` && o.status !== 'acknowledged') ?? null, [outboxOps, id]);
  const delivered = () => {
    writeDraft(uid, id, null);
    setDone(true);
    void qc.invalidateQueries({ queryKey: ['checkIn', uid, id] });
    void qc.invalidateQueries({ queryKey: ['activeCheckIn', uid] });
    void qc.invalidateQueries({ queryKey: ['checkInsHistory', uid] });
    showToast({ title: t('checkin.submitted'), variant: 'success' });
  };
  const submit = useMutation({
    mutationFn: async (): Promise<'sent' | 'queued'> => {
      const op = await queueCheckInSubmit({ clientId: uid, weekStart: id, form });
      const first = await waitForFirstAttempt(op.operationId, 30_000);
      if (first?.status === 'acknowledged') return 'sent';
      if (first?.status === 'failed_permanent') {
        // The server refused it (not a connection problem): back to the answers, with the error (B0 behaviour).
        await discardOutbox(op.operationId);
        throw new Error(first.lastError?.code ?? 'refused');
      }
      return 'queued'; // offline / retrying — sent automatically
    },
    onSuccess: (outcome) => {
      if (outcome === 'sent') delivered();
      else showToast({ title: t('trust.checkin.queuedToast'), variant: 'info' });
    },
    onSettled: () => {
      submittingRef.current = false;
    },
  });
  // Delivered later (reconnect / retry), possibly after leaving and coming back.
  useEffect(
    () =>
      onOutboxAck((op) => {
        if (op.type === 'checkin.submit' && (op.payload as { weekStart: string }).weekStart === id) delivered();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [id, uid],
  );

  const wizard = !!q.data && q.data.status === 'requested' && !done && !queued;
  // Autosave every answer / step change while the check-in is open.
  useEffect(() => {
    if (wizard && dirty) writeDraft(uid, id, { form, step });
  }, [wizard, dirty, form, step, uid, id]);
  // Leaving mid-check-in asks first (bottom nav, header back, ✕) — answers stay saved either way.
  useEffect(() => {
    if (!wizard || !dirty) return;
    setNavGuard(() =>
      confirmDialog({
        title: t('trust.checkin.leaveTitle'),
        message: t('trust.checkin.leaveBody'),
        confirmLabel: t('trust.checkin.leave'),
        cancelLabel: t('trust.checkin.keepGoing'),
      }),
    );
    return () => setNavGuard(null);
  }, [wizard, dirty, t]);

  const setPhoto = (pose: 'front' | 'side' | 'back', url?: string) =>
    setForm((f) => {
      const prev = f.progressPhotos?.[pose];
      if (isLocalRef(prev) && prev !== url) void blobStore.remove(prev.slice('local:'.length)).catch(() => undefined);
      return { ...f, progressPhotos: { ...f.progressPhotos, [pose]: url } };
    });

  const stepName: Step = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const goNext = () => {
    if (isLast) {
      // One submission per tap burst: the ref closes the gap before React
      // re-renders the disabled button (B0.5 — no duplicate submit).
      if (submittingRef.current || submit.isPending || done) return;
      submittingRef.current = true;
      submit.mutate();
      return;
    }
    setStep((s) => s + 1);
  };
  const goBack = () => {
    if (step === 0) {
      leave();
      return;
    }
    setStep((s) => s - 1);
  };

  if (q.isLoading) {
    return (
      <div className="anim-rise">
        <TopBar title={t('checkin.title')} onBack={leave} />
        <LoadingState variant="list" count={3} />
      </div>
    );
  }
  // A failed read is an error with Retry — never "not found" (B0.16).
  if (q.isError && !checkIn) {
    return (
      <div className="anim-rise">
        <TopBar title={t('checkin.title')} onBack={leave} />
        <ErrorState onRetry={() => void q.refetch()} testId="checkin-load-error" />
      </div>
    );
  }
  if (!checkIn) {
    return (
      <div className="anim-rise">
        <TopBar title={t('checkin.title')} onBack={leave} />
        <p className="py-8 text-center text-sm text-earth-muted">{t('checkin.notFound')}</p>
      </div>
    );
  }

  // Submitted on this device but not delivered yet — say exactly that (never "submitted").
  if (queued && checkIn.status === 'requested' && !done) {
    const sending = queued.status === 'queued' || queued.status === 'sending';
    const line =
      queued.status === 'failed_permanent'
        ? t('trust.checkin.queuedFailed')
        : queued.status === 'failed_retryable'
          ? t('trust.checkin.queuedRetrying')
          : sending
            ? t('messages.sending')
            : t('trust.checkin.queuedWaiting');
    return (
      <div className="anim-rise space-y-4">
        <TopBar title={t('checkin.title')} eyebrow={`${shortDate(checkIn.weekStart, i18n.language)} – ${shortDate(checkIn.weekEnd, i18n.language)}`} onBack={leave} />
        <div className="card space-y-3" data-testid="checkin-queued" data-outbox-status={queued.status} role="status">
          <p className="font-semibold">{t('trust.checkin.queuedTitle')}</p>
          <p className={`text-sm ${queued.status === 'failed_permanent' ? 'text-danger' : 'text-earth-muted'}`}>{line}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" data-testid="checkin-retry" disabled={sending} onClick={() => void retryOutbox(queued.operationId)}>
              {t('trust.outbox.retryNow')}
            </button>
            <button type="button" className="btn-ghost" data-testid="checkin-edit" disabled={queued.status === 'sending'} onClick={() => void discardOutbox(queued.operationId).then(() => setStep(STEPS.length - 1))}>
              {t('trust.checkin.editAnswers')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Already submitted/reviewed — read-only summary, not the wizard.
  if (checkIn.status !== 'requested') {
    return (
      <div className="anim-rise space-y-4">
        <TopBar title={t('checkin.title')} eyebrow={`${shortDate(checkIn.weekStart, i18n.language)} – ${shortDate(checkIn.weekEnd, i18n.language)}`} onBack={leave} />
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

  // --- The 4-step wizard: a full-screen task (B0 / CL-42, JR-05) ---
  // A fixed layer above the bottom nav and any banner, with its own scrolling
  // body and a pinned action bar, so Continue / Submit is always on screen.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface" data-testid="checkin-flow" role="dialog" aria-modal="true" aria-label={t('checkin.title')}>
      <header className="shrink-0 border-b border-line bg-surface px-5 pb-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <button type="button" onClick={goBack} className="icon-btn h-9 w-9" aria-label={t('checkin.back')}>
            <Icon name="chevronLeft" size={18} />
          </button>
          <p className="ui-label">{t('checkin.title')}</p>
          <button type="button" onClick={leave} className="icon-btn h-9 w-9" aria-label={t('common.close')} data-testid="checkin-close">
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

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5" data-testid="checkin-body">
        {stepName === 'body' && (
          <>
            <h1 className="h1">{t('checkin.steps.body')}</h1>
            <p className="">{t('checkin.bodyIntro')}</p>
            <div className="card space-y-4">
              <div>
                <label className="label">{t('checkin.weight')}</label>
                <NumericField stepper value={form.currentWeight ?? null} onChange={(v) => setForm({ ...form, currentWeight: v ?? undefined })} step={0.1} min={0} max={400} suffix={t('common.kg')} ariaLabel={t('checkin.weight')} placeholder="0" />
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
            <p className="">{t('checkin.trainingIntro')}</p>
            <div className="card">
              <label className="label mb-1 block">{t('checkin.trainingAdherence')}</label>
              <Slider value={form.adherenceTraining ?? 0} min={0} max={100} step={5} onChange={(v) => setForm({ ...form, adherenceTraining: v })} format={(v) => `${v}%`} testId="checkin-training" />
            </div>
          </>
        )}

        {stepName === 'nutrition' && (
          <>
            <h1 className="h1">{t('checkin.steps.nutrition')}</h1>
            <p className="">{t('checkin.nutritionIntro')}</p>
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
            <p className="">{t('checkin.notesIntro')}</p>
            <div className="card">
              <label className="label" htmlFor="checkin-notes">{t('checkin.notes')}</label>
              <textarea id="checkin-notes" className="input min-h-20" data-testid="checkin-notes" value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            {uploadsEnabled && (
              <div className="space-y-2">
                <p className="label">{t('checkin.photos')}</p>
                {(['front', 'side', 'back'] as const).map((pose) => (
                  <PosePhotoPicker key={pose} pose={pose} target={{ category: 'checkin', checkInId: id }} url={form.progressPhotos?.[pose]} onChange={(url) => setPhoto(pose, url)} stash={(blob) => stashCheckInPhoto(id, pose, blob)} />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-line bg-surface px-5 pt-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }} data-testid="checkin-actions">
        {submit.isError && (
          <p role="alert" className="mb-3 text-center text-sm text-danger" data-testid="checkin-error">
            {t('trust.checkin.submitFailed')}
          </p>
        )}
        <button type="button" data-testid={isLast ? 'checkin-submit' : 'checkin-next'} className="btn-primary btn-lg w-full disabled:opacity-40" disabled={submit.isPending || done} onClick={goNext}>
          {isLast ? (submit.isPending ? t('auth.working') : (<><Icon name="check" size={16} /> {t('checkin.submit')}</>)) : (<>{t('checkin.continue')} <Icon name="chevron" size={16} /></>)}
        </button>
      </div>
    </div>
  );
}
