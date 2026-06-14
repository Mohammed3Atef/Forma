import { useTranslation } from 'react-i18next';
import { useDay } from '@/stores/dayStore';
import { Icon } from './Icon';
import { shortDate, today } from '@/lib/utils';

/**
 * Date navigator shown on the day-scoped pages. Prev/next arrows, a tappable
 * date label that opens the native date picker, and a "Today" shortcut. The
 * selected day drives all logging across the app.
 */
export function DayNav() {
  const { t, i18n } = useTranslation();
  const selected = useDay((s) => s.selected);
  const shift = useDay((s) => s.shift);
  const setDay = useDay((s) => s.setDay);
  const reset = useDay((s) => s.reset);

  const isToday = selected === today();
  // In RTL the visual arrows are flipped, so swap which arrow moves back/forward.
  const rtl = i18n.dir() === 'rtl';

  return (
    <div className="mb-3 mt-1 flex items-center justify-between gap-2 rounded-full border border-line bg-surface-card px-2 py-1.5">
      <button type="button" onClick={() => shift(-1)} className="icon-btn h-9 w-9" aria-label="previous day">
        <Icon name="chevron" size={18} className={rtl ? '' : 'rotate-180'} />
      </button>

      <label className="relative flex flex-1 cursor-pointer flex-col items-center">
        <span className="font-mono text-sm font-medium uppercase leading-tight tracking-[0.04em]">
          {isToday ? t('common.today') : shortDate(selected, i18n.language)}
        </span>
        <input
          type="date"
          value={selected}
          max={today()}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
          aria-label="pick date"
        />
      </label>

      {!isToday && (
        <button type="button" onClick={reset} className="rounded-full border border-brand/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.04em] text-brand">
          {t('common.today')}
        </button>
      )}
      <button
        type="button"
        onClick={() => !isToday && shift(1)}
        disabled={isToday}
        className="icon-btn h-9 w-9 disabled:opacity-30"
        aria-label="next day"
      >
        <Icon name="chevron" size={18} className={rtl ? 'rotate-180' : ''} />
      </button>
    </div>
  );
}
