import { useTranslation } from 'react-i18next';
import { useTimer } from '@/stores/timerStore';
import { Icon } from './Icon';
import { formatDuration } from '@/lib/utils';

/**
 * Floating rest-timer card (MyRocky style): timer icon + REST label + big
 * countdown on the left, −15 / +15 / Skip on the right, copper progress bar below.
 */
export function RestTimerBar() {
  const { t } = useTranslation();
  const { running, paused, remainingSec, totalSec, adjust, pause, resume, skip } = useTimer();
  if (!running && !paused) return null;

  const pct = totalSec > 0 ? remainingSec / totalSec : 0;
  const btn =
    'flex h-9 items-center justify-center rounded-full border border-line bg-surface-card px-3 font-mono text-xs uppercase tracking-[0.04em] text-earth transition-transform active:scale-90';

  return (
    <div className="w-full max-w-md rounded-[18px] border border-line bg-surface-raised p-4 shadow-deep">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => (paused ? resume() : pause())}
          className="flex items-center gap-2.5 text-start"
          aria-label={paused ? t('common.resume') : t('workout.pause')}
        >
          <span className="text-brand">
            <Icon name="timer" size={20} />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-earth-muted">{t('workout.rest')}</span>
          <span className="font-mono text-2xl font-medium tabular-nums text-white">
            {formatDuration(remainingSec)}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => adjust(-15)} className={btn}>
            −15
          </button>
          <button type="button" onClick={() => adjust(15)} className={btn}>
            +15
          </button>
          <button
            type="button"
            onClick={skip}
            className="flex h-9 items-center justify-center rounded-full border border-brand/40 px-3 font-mono text-xs uppercase tracking-[0.04em] text-brand transition-transform active:scale-90"
          >
            {t('workout.skip')}
          </button>
        </div>
      </div>
      <div className="prog mt-3">
        <span style={{ width: `${pct * 100}%` }} />
      </div>
    </div>
  );
}
