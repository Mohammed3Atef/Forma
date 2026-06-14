import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CardioType } from '@/types';
import { useCardio } from '@/stores/cardioStore';
import { useSettings } from '@/stores/settingsStore';
import { useElapsed } from '@/hooks/useElapsed';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useDay } from '@/stores/dayStore';
import { Icon } from '@/components/Icon';
import { Sheet } from '@/components/Sheet';
import { TopBar } from '@/components/TopBar';
import { cardioCalories, cardioDistanceKm } from '@/lib/calc';
import { formatDuration, parseDecimal, shortDate } from '@/lib/utils';

const TYPES: CardioType[] = ['walking', 'treadmill', 'running', 'cycling', 'other'];
/** Types where a constant speed/incline makes distance & calories computable. */
const SPEED_TYPES: CardioType[] = ['walking', 'treadmill', 'running'];

export function Cardio() {
  const { t, i18n } = useTranslation();
  const cardioLogs = useCardio((s) => s.cardioLogs);
  const addCardio = useCardio((s) => s.addCardio);
  const removeCardio = useCardio((s) => s.removeCardio);
  const stepsFor = useCardio((s) => s.stepsFor);
  const cardioSecFor = useCardio((s) => s.cardioSecFor);
  const targets = useSettings((s) => s.settings?.targets);

  // Live timer start lives in the store so navigating away doesn't lose it.
  const running = useCardio((s) => s.liveStart);
  const liveParams = useCardio((s) => s.liveParams);
  const startLive = useCardio((s) => s.startLive);
  const stopLive = useCardio((s) => s.stopLive);
  const latestWeight = useCardio((s) => s.latestWeight);
  const profileWeight = useSettings((s) => s.profile?.weightKg);
  const [type, setType] = useState<CardioType>('treadmill');
  const [logOpen, setLogOpen] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setup, setSetup] = useState({ speed: '5', incline: '0' });
  const [form, setForm] = useState({ minutes: '', steps: '', distance: '', calories: '' });

  const elapsed = useElapsed(running);
  useWakeLock(running != null);

  // Bodyweight for the calorie estimate: latest logged > profile > 70 kg fallback.
  const weightForCalc = latestWeight() || profileWeight || 70;

  // Speed-based types ask for speed/incline first so distance & calories can be
  // computed automatically; other types just start the timer.
  const onStart = () => {
    if (SPEED_TYPES.includes(type)) setSetupOpen(true);
    else startLive();
  };
  const startWithParams = () => {
    // parseDecimal accepts "5.5", "5,5" and Arabic-Indic digits alike.
    const speedKmh = parseDecimal(setup.speed);
    const inclinePct = parseDecimal(setup.incline);
    setSetupOpen(false);
    startLive(speedKmh > 0 ? { speedKmh, inclinePct } : undefined);
  };

  // Stopping the live timer hands the elapsed minutes — plus the computed
  // distance/calories when speed was set — to the editable log popup.
  const stopAndSave = () => {
    if (running == null) return;
    const secs = Math.max(60, Math.round((Date.now() - running) / 1000));
    const mins = Math.max(1, Math.round(secs / 60));
    const p = liveParams;
    stopLive();
    setForm({
      minutes: String(mins),
      steps: '',
      distance: p ? String(cardioDistanceKm(p.speedKmh, secs)) : '',
      calories: p ? String(cardioCalories(p.speedKmh, p.inclinePct, weightForCalc, secs)) : '',
    });
    setLogOpen(true);
  };

  // One entry capturing what you actually did, e.g. "10k steps in 40 min".
  const saveManual = async () => {
    await addCardio({
      type,
      durationSec: parseDecimal(form.minutes) * 60,
      steps: form.steps ? parseDecimal(form.steps) || null : null,
      distanceKm: form.distance ? parseDecimal(form.distance) || null : null,
      caloriesBurned: form.calories ? parseDecimal(form.calories) || null : null,
    });
    setForm({ minutes: '', steps: '', distance: '', calories: '' });
    setLogOpen(false);
  };

  const selected = useDay((s) => s.selected);
  const todaySteps = stepsFor(selected);
  const todayCardioMin = Math.round(cardioSecFor(selected) / 60);
  const activityMet =
    todaySteps >= (targets?.steps ?? Infinity) || todayCardioMin >= (targets?.cardioMinutes ?? Infinity);

  return (
    <div className="anim-rise space-y-4">
      <TopBar title={t('cardio.title')} eyebrow={t('nav.cardio')} />

      {/* Combined daily activity goal — done when EITHER target is met. */}
      <div className={`card ${activityMet ? 'ring-1 ring-brand/40' : ''}`}>
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon name="activity" size={22} className="text-brand" />
            <div>
              <p className="font-semibold">{t('cardio.goal')}</p>
              <p className="text-xs text-slate-400">{t('cardio.goalHint')}</p>
            </div>
          </div>
          {activityMet && (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand text-slate-950">
              <Icon name="check" size={16} />
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xl font-bold">
              {todaySteps.toLocaleString()}
              <span className="text-sm font-normal text-slate-400"> / {targets?.steps.toLocaleString()}</span>
            </p>
            <p className="mb-1 text-xs text-slate-400">{t('cardio.steps')}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (todaySteps / (targets?.steps || 1)) * 100)}%` }} />
            </div>
          </div>
          <div>
            <p className="text-xl font-bold">
              {todayCardioMin}
              <span className="text-sm font-normal text-slate-400"> / {targets?.cardioMinutes} {t('common.min')}</span>
            </p>
            <p className="mb-1 text-xs text-slate-400">{t('cardio.minutes')}</p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, (todayCardioMin / (targets?.cardioMinutes || 1)) * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Live cardio timer */}
      <div className="card text-center">
        <div className="mb-3 flex flex-wrap justify-center gap-1.5">
          {TYPES.map((ty) => (
            <button
              key={ty}
              type="button"
              onClick={() => setType(ty)}
              className={`chip ${type === ty ? 'chip-on' : ''}`}
            >
              {t(`cardio.types.${ty}`)}
            </button>
          ))}
        </div>
        <p className="font-mono text-4xl font-bold tabular-nums text-brand-light">{formatDuration(elapsed)}</p>
        {running != null && liveParams && (
          <p className="mt-1.5 font-mono text-[12.5px] text-slate-400" dir="ltr">
            {cardioDistanceKm(liveParams.speedKmh, elapsed).toFixed(2)} km · ~
            {cardioCalories(liveParams.speedKmh, liveParams.inclinePct, weightForCalc, elapsed)} {t('cardio.kcal')}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          {running == null ? (
            <button type="button" onClick={onStart} className="btn-primary btn-lg flex-1">
              <Icon name="play" size={20} /> {t('common.start')}
            </button>
          ) : (
            <button type="button" onClick={() => void stopAndSave()} className="btn-danger btn-lg flex-1">
              <Icon name="check" size={20} /> {t('common.finish')}
            </button>
          )}
        </div>
      </div>

      <button type="button" onClick={() => setLogOpen(true)} className="btn-ghost btn-lg w-full">
        <Icon name="plus" size={18} /> {t('cardio.logActivity')}
      </button>

      {/* History */}
      <div>
        <h2 className="mb-2 font-bold">{t('cardio.history')}</h2>
        <ul className="space-y-2">
          {cardioLogs.slice(0, 30).map((c) => (
            <li key={c.id} className="card flex items-center justify-between py-3">
              <div>
                <p className="font-medium">{t(`cardio.types.${c.type}`)}</p>
                <p className="text-xs text-slate-400">{shortDate(c.date, i18n.language)}</p>
              </div>
              <div className="flex items-center gap-3 text-sm text-slate-300">
                {c.durationSec > 0 && <span>{Math.round(c.durationSec / 60)}{t('common.min')}</span>}
                {c.steps != null && <span>{c.steps.toLocaleString()} {t('cardio.steps')}</span>}
                {c.distanceKm != null && <span>{c.distanceKm} km</span>}
                <button type="button" onClick={() => void removeCardio(c.id)} className="text-danger">
                  <Icon name="close" size={16} />
                </button>
              </div>
            </li>
          ))}
          {cardioLogs.length === 0 && <li className="text-sm text-slate-500">{t('progress.noData')}</li>}
        </ul>
      </div>

      <Sheet open={logOpen} onClose={() => setLogOpen(false)} title={t('cardio.logActivity')}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {TYPES.map((ty) => (
              <button key={ty} type="button" onClick={() => setType(ty)} className={`rounded-full px-3 py-1.5 text-sm ${type === ty ? 'bg-brand text-slate-950' : 'bg-surface-raised text-slate-300'}`}>
                {t(`cardio.types.${ty}`)}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">{t('cardio.steps')}</label>
              <input className="input" inputMode="numeric" placeholder="10000" value={form.steps} onChange={(e) => setForm({ ...form, steps: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('cardio.duration')} ({t('common.min')})</label>
              <input className="input" inputMode="numeric" placeholder="40" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('cardio.distance')} (km)</label>
              <input className="input" inputMode="decimal" placeholder="0" value={form.distance} onChange={(e) => setForm({ ...form, distance: e.target.value })} />
            </div>
            <div>
              <label className="label">{t('cardio.calories')}</label>
              <input className="input" inputMode="numeric" placeholder="0" value={form.calories} onChange={(e) => setForm({ ...form, calories: e.target.value })} />
            </div>
          </div>
          <button type="button" onClick={() => void saveManual()} className="btn-primary btn-lg w-full">{t('common.save')}</button>
        </div>
      </Sheet>

      {/* Pre-start setup: speed + incline drive automatic distance/calories. */}
      <Sheet open={setupOpen} onClose={() => setSetupOpen(false)} title={t('cardio.setup')}>
        <div className="space-y-3">
          <p className="text-sm text-slate-400">{t('cardio.setupHint')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label" htmlFor="cardio-speed">{t('cardio.speed')}</label>
              <input
                id="cardio-speed"
                className="input"
                inputMode="decimal"
                placeholder="5.0"
                value={setup.speed}
                onChange={(e) => setSetup({ ...setup, speed: e.target.value })}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
            <div>
              <label className="label" htmlFor="cardio-incline">{t('cardio.incline')}</label>
              <input
                id="cardio-incline"
                className="input"
                inputMode="decimal"
                placeholder="0"
                value={setup.incline}
                onChange={(e) => setSetup({ ...setup, incline: e.target.value })}
                onFocus={(e) => e.currentTarget.select()}
              />
            </div>
          </div>
          <button type="button" onClick={startWithParams} className="btn-primary btn-lg w-full">
            <Icon name="play" size={18} /> {t('common.start')}
          </button>
        </div>
      </Sheet>
    </div>
  );
}
