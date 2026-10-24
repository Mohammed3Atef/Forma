import { useTranslation } from 'react-i18next';
import { useTimer } from '@/stores/timerStore';
import { Icon } from './Icon';
import { formatDuration } from '@/lib/format';

/**
 * The rest timer (B2.3, CL-19): visible and useful without taking over the
 * screen. The countdown itself is the pause / resume control (with a visible
 * pause glyph, not a hidden gesture); −15 s / +15 s / Skip are 48px targets.
 * Timestamp-driven in the store, so it survives reloads (PWA-07).
 */
export function RestTimerBar() {
  const { t } = useTranslation();
  const { running, paused, remainingSec, totalSec, adjust, pause, resume, skip } = useTimer();
  if (!running && !paused) return null;

  const pct = totalSec > 0 ? Math.min(1, remainingSec / totalSec) : 0;
  const btn =
    'flex h-12 min-w-12 items-center justify-center rounded-ui-control border border-white/[0.12] bg-white/[0.04] px-3 text-[15px] font-semibold tabular-nums text-earth transition-transform active:scale-95 motion-reduce:transform-none';

  return (
    <div className="w-full rounded-ui-surface border border-white/[0.12] bg-surface-raised/95 p-3 shadow-ui-sticky backdrop-blur-md" data-testid="rest-timer">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => (paused ? resume() : pause())}
          className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-ui-control px-2 text-start"
          aria-label={paused ? t('common.resume') : t('workout.pause')}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/15 text-brand-hover">
            <Icon name={paused ? 'play' : 'pause'} size={18} />
          </span>
          <span className="min-w-0">
            <span className="block text-[13px] font-medium text-earth-muted">{paused ? t('session.restPaused') : t('workout.rest')}</span>
            <span className="block font-mono text-[26px] font-semibold leading-none tabular-nums text-white" dir="ltr">
              {formatDuration(remainingSec)}
            </span>
          </span>
        </button>
        <button type="button" onClick={() => adjust(-15)} className={btn} aria-label={t('session.minus15')}>
          <span dir="ltr">−15</span>
        </button>
        <button type="button" onClick={() => adjust(15)} className={btn} aria-label={t('session.plus15')}>
          <span dir="ltr">+15</span>
        </button>
        <button type="button" onClick={skip} className={`${btn} border-brand/40 text-brand-hover`}>
          {t('workout.skip')}
        </button>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
        <span className="block h-full rounded-full bg-gradient-brand transition-[width] duration-200 ease-linear" style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
