import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { CardioType } from '@/types';
import { useCardio } from '@/stores/cardioStore';
import { useSettings } from '@/stores/settingsStore';
import { useElapsed } from '@/hooks/useElapsed';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useSubscription } from '@/hooks/useSubscription';
import { useDay } from '@/stores/dayStore';
import { DaySwitcher } from '@/components/client/DaySwitcher';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { EntityNotes } from '@/components/EntityNotes';
import { confirmDelete } from '@/stores/dialogStore';
import { showToast } from '@/stores/toastStore';
import { Button } from '@/components/ui/Button';
import { ActionMenu } from '@/components/ui/ActionMenu';
import { NumericField } from '@/components/ui/NumericField';
import { IconTile, ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { cardioCalories, cardioDistanceKm } from '@/lib/calc';
import { parseDecimal } from '@/lib/utils';
import { useSession } from '@/services/auth/sessionStore';
import { fetchMyCardioPlan } from '@/services/platform/clientCoachApi';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';

const TYPES: CardioType[] = ['walking', 'treadmill', 'running', 'cycling', 'other'];
/** Types where a constant speed/incline makes distance & calories computable. */
const SPEED_TYPES: CardioType[] = ['walking', 'treadmill', 'running'];

/*
 * TRAIN › CARDIO (B2.3, doc 16 open decision #5 → Train): the coach's cardio
 * plan, a live timer (speed/incline for computed distance & calories), a log
 * for what was done, and the history. Logs go to the day shown above (the
 * local day switcher) — today unless the client picked another day.
 * A log needs something real in it (no "Saved" for an empty entry, CL-30);
 * delete lives in each row's menu (VS-08).
 */
export function Cardio() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const cardioLogs = useCardio((s) => s.cardioLogs);
  const addCardio = useCardio((s) => s.addCardio);
  const removeCardio = useCardio((s) => s.removeCardio);
  const stepsFor = useCardio((s) => s.stepsFor);
  const cardioSecFor = useCardio((s) => s.cardioSecFor);
  const targets = useSettings((s) => s.settings?.targets);
  const { readOnly } = useSubscription();

  // Live timer start lives in the store so navigating away doesn't lose it.
  const running = useCardio((s) => s.liveStart);
  const liveParams = useCardio((s) => s.liveParams);
  const startLive = useCardio((s) => s.startLive);
  const stopLive = useCardio((s) => s.stopLive);
  const latestWeight = useCardio((s) => s.latestWeight);
  const profileWeight = useSettings((s) => s.profile?.weightKg);
  const [type, setType] = useState<CardioType>('walking');
  const [logOpen, setLogOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState({ speed: '5', incline: '0' });
  const [form, setForm] = useState<{ minutes: number | null; steps: number | null; distance: number | null; calories: number | null }>({ minutes: null, steps: null, distance: null, calories: null });
  const [formError, setFormError] = useState<string | null>(null);

  const elapsed = useElapsed(running);
  useWakeLock(running != null);
  const weightForCalc = latestWeight() || profileWeight || 70;

  const onStart = () => {
    if (readOnly) return;
    if (SPEED_TYPES.includes(type)) setSetupOpen(true);
    else startLive();
  };
  const startWithParams = () => {
    const speedKmh = parseDecimal(setup.speed);
    const inclinePct = parseDecimal(setup.incline);
    setSetupOpen(false);
    startLive(speedKmh > 0 ? { speedKmh, inclinePct } : undefined);
  };
  // Stopping hands the elapsed minutes (+ computed distance/calories) to the editable log.
  const stopAndSave = () => {
    if (running == null) return;
    const secs = Math.max(60, Math.round((Date.now() - running) / 1000));
    const p = liveParams;
    stopLive();
    setForm({
      minutes: Math.max(1, Math.round(secs / 60)),
      steps: null,
      distance: p ? cardioDistanceKm(p.speedKmh, secs) : null,
      calories: p ? cardioCalories(p.speedKmh, p.inclinePct, weightForCalc, secs) : null,
    });
    setFormError(null);
    setLogOpen(true);
  };

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const saveManual = async () => {
    // Something real must be logged — never a 0-minute entry announced as "Saved".
    if (!(form.minutes && form.minutes > 0) && !(form.steps && form.steps > 0) && !(form.distance && form.distance > 0)) {
      setFormError(t('cardio.needSomething'));
      return;
    }
    setSaving(true);
    setSaveError(false);
    try {
      await addCardio({
        type,
        durationSec: (form.minutes ?? 0) * 60,
        steps: form.steps && form.steps > 0 ? form.steps : null,
        distanceKm: form.distance && form.distance > 0 ? form.distance : null,
        caloriesBurned: form.calories && form.calories > 0 ? form.calories : null,
      });
      setForm({ minutes: null, steps: null, distance: null, calories: null });
      setLogOpen(false);
      showToast({ title: t('common.saved'), variant: 'success' });
    } catch {
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const uid = useSession((s) => s.uid);
  const cardioPlan = useQuery({ queryKey: ['myCardioPlan', uid], queryFn: () => fetchMyCardioPlan(uid!), enabled: !!uid });

  const selected = useDay((s) => s.selected);
  const daySteps = stepsFor(selected);
  const dayMin = Math.round(cardioSecFor(selected) / 60);
  const stepsTarget = targets?.steps ?? 0;
  const cardioTarget = targets?.cardioMinutes ?? 0;

  const typeLabel = (ty: string) => t(`cardio.types.${ty}`, { defaultValue: t('cardio.types.other') });
  const typePicker = (
    <div role="radiogroup" aria-label={t('cardio.type')} className="grid grid-cols-3 gap-2">
      {TYPES.map((ty) => (
        <button
          key={ty}
          type="button"
          role="radio"
          aria-checked={type === ty}
          onClick={() => setType(ty)}
          className={`min-h-ui-hit rounded-ui-control border px-2 text-[14px] font-medium transition-colors ${
            type === ty ? 'border-brand/60 bg-brand/[0.13] text-earth' : 'border-white/[0.1] text-earth-muted hover:text-earth'
          }`}
        >
          {typeLabel(ty)}
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-7" data-testid="client-cardio">
      <DaySwitcher className="!mb-0" />
      {/* The day's activity vs the coach's targets */}
      {(stepsTarget > 0 || cardioTarget > 0) && (
        <section className="grid grid-cols-2 gap-3" data-testid="cardio-goals">
          {stepsTarget > 0 && (
            <Goal label={t('cardio.steps')} value={formatNumber(daySteps, lang)} target={formatNumber(stepsTarget, lang)} pct={daySteps / stepsTarget} />
          )}
          {cardioTarget > 0 && (
            <Goal label={t('cardio.minutes')} value={formatNumber(dayMin, lang)} target={`${formatNumber(cardioTarget, lang)} ${t('common.min')}`} pct={dayMin / cardioTarget} />
          )}
        </section>
      )}

      {/* Live timer */}
      <section className="relative overflow-hidden rounded-[20px] border border-white/[0.1] bg-gradient-surface-hi p-5" data-testid="cardio-live">
        {running == null && typePicker}
        <p className="mt-5 text-center font-mono text-[44px] font-semibold leading-none tabular-nums" dir="ltr">
          {formatDuration(elapsed)}
        </p>
        {running != null && liveParams && (
          <p className="mt-2 text-center text-[14px] text-earth-muted" dir="ltr">
            {formatNumber(cardioDistanceKm(liveParams.speedKmh, elapsed), lang, { maxFractionDigits: 2 })} km · ~{formatNumber(cardioCalories(liveParams.speedKmh, liveParams.inclinePct, weightForCalc, elapsed), lang)} {t('cardio.kcal')}
          </p>
        )}
        {readOnly ? (
          <p className="mt-5 rounded-ui-control bg-white/[0.05] px-3 py-2.5 text-[14px] text-earth-muted" role="status">
            {t('today.readOnly')}
          </p>
        ) : running == null ? (
          <Button size="lg" icon="play" className="mt-5 w-full" onClick={onStart}>
            {t('common.start')}
          </Button>
        ) : (
          <Button size="lg" icon="check" className="mt-5 w-full" onClick={stopAndSave}>
            {t('common.finish')}
          </Button>
        )}
      </section>

      <Button
        variant="secondary"
        size="lg"
        icon="plus"
        className="w-full"
        disabled={readOnly}
        onClick={() => {
          setFormError(null);
          setLogOpen(true);
        }}
      >
        {t('cardio.logActivity')}
      </Button>

      {cardioPlan.data && cardioPlan.data.sessions.length > 0 && (
        <Section title={t('clientCoach.cardioPlan')}>
          <ListGroup>
            {cardioPlan.data.sessions.map((s) => (
              <div key={s.id}>
                <ListRow
                  leading={<IconTile icon="activity" tone="info" />}
                  title={typeLabel(s.type)}
                  meta={[`${formatNumber(s.durationMin, lang)} ${t('common.min')}`, s.frequency].filter(Boolean).join(' · ')}
                />
                <div className="px-4 pb-3 ps-[4.25rem] empty:hidden">
                  {s.notes ? <p className="border-s-2 border-brand/50 ps-2.5 text-[14px] leading-snug text-earth">{s.notes}</p> : null}
                  <EntityNotes screen="cardio" entityType="cardio_session" entityId={s.id} />
                </div>
              </div>
            ))}
          </ListGroup>
        </Section>
      )}

      <Section title={t('cardio.history')} testId="cardio-history">
        {cardioLogs.length === 0 ? (
          <p className="text-[15px] text-earth-muted">{t('cardio.noLogsYet')}</p>
        ) : (
          <ListGroup>
            {cardioLogs.slice(0, 30).map((c) => {
              const bits = [
                c.durationSec > 0 ? `${formatNumber(Math.round(c.durationSec / 60), lang)} ${t('common.min')}` : null,
                c.steps ? `${formatNumber(c.steps, lang)} ${t('cardio.steps')}` : null,
                c.distanceKm ? `${formatNumber(c.distanceKm, lang, { maxFractionDigits: 2 })} km` : null,
              ].filter(Boolean);
              return (
                <div key={c.id} data-testid="cardio-entry">
                  <ListRow
                    leading={<IconTile icon="activity" tone="info" />}
                    title={typeLabel(c.type)}
                    meta={[formatDate(c.date, lang, 'weekdayShort'), ...bits].join(' · ')}
                    trailing={
                      <ActionMenu
                        size="sm"
                        label={t('cardio.entryOptions', { type: typeLabel(c.type) })}
                        items={[{ key: 'delete', label: t('common.delete'), icon: 'trash', danger: true, onSelect: async () => { if (await confirmDelete()) void removeCardio(c.id); } }]}
                      />
                    }
                  />
                </div>
              );
            })}
          </ListGroup>
        )}
      </Section>

      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title={t('cardio.logActivity')}>
        <div className="space-y-4">
          {typePicker}
          <div className="grid grid-cols-2 gap-3">
            <NumericField id="cardio-steps" label={t('cardio.steps')} integer placeholder="10000" value={form.steps} onChange={(n) => setForm({ ...form, steps: n })} />
            <NumericField id="cardio-minutes" label={`${t('cardio.duration')} (${t('common.min')})`} placeholder="40" value={form.minutes} onChange={(n) => setForm({ ...form, minutes: n })} />
            <NumericField id="cardio-distance" label={`${t('cardio.distance')} (km)`} placeholder="0" value={form.distance} onChange={(n) => setForm({ ...form, distance: n })} />
            <NumericField id="cardio-calories" label={t('cardio.calories')} integer placeholder="0" value={form.calories} onChange={(n) => setForm({ ...form, calories: n })} />
          </div>
          {formError && (
            <p role="alert" className="text-[14px] text-warn" data-testid="cardio-form-error">
              {formError}
            </p>
          )}
          {saveError && (
            <p role="alert" className="text-[14px] text-danger">
              {t('common.savedFailed')}
            </p>
          )}
          <Button size="lg" pending={saving} onClick={() => void saveManual()} className="w-full">
            {t('common.save')}
          </Button>
        </div>
      </Sheet>

      <Sheet open={setupOpen} onClose={() => setSetupOpen(false)} title={t('cardio.setup')}>
        <div className="space-y-4">
          <p className="text-[15px] text-earth-muted">{t('cardio.setupHint')}</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[14px] font-medium" htmlFor="cardio-speed">
                {t('cardio.speed')}
              </label>
              <input id="cardio-speed" className="input" inputMode="decimal" dir="ltr" placeholder="5.0" value={setup.speed} onChange={(e) => setSetup({ ...setup, speed: e.target.value })} onFocus={(e) => e.currentTarget.select()} />
            </div>
            <div>
              <label className="mb-1.5 block text-[14px] font-medium" htmlFor="cardio-incline">
                {t('cardio.incline')}
              </label>
              <input id="cardio-incline" className="input" inputMode="decimal" dir="ltr" placeholder="0" value={setup.incline} onChange={(e) => setSetup({ ...setup, incline: e.target.value })} onFocus={(e) => e.currentTarget.select()} />
            </div>
          </div>
          <Button size="lg" icon="play" className="w-full" onClick={startWithParams}>
            {t('common.start')}
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

function Goal({ label, value, target, pct }: { label: string; value: string; target: string; pct: number }) {
  const done = pct >= 1;
  return (
    <div className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
      <p className="flex items-center justify-between text-[13px] text-earth-muted">
        {label}
        {done && <Icon name="check" size={16} className="text-success" />}
      </p>
      <p className="mt-1 text-[24px] font-semibold tabular-nums leading-none">
        {value}
        <span className="text-[14px] font-normal text-earth-muted"> / {target}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <span className={`block h-full rounded-full ${done ? 'bg-success' : 'bg-info'}`} style={{ width: `${Math.min(100, pct * 100)}%` }} />
      </div>
    </div>
  );
}
