import { useTranslation } from 'react-i18next';
import { useDay } from '@/stores/dayStore';
import { IconButton } from '@/components/ui/Button';
import { today } from '@/lib/utils';
import { formatDate } from '@/lib/format';

/**
 * Local day switcher for the date-scoped screens (B2, doc 16 P5 / CL-04):
 * Nutrition, Cardio, Measurements. Today is the default tense; on any other
 * day the screen says so in words — what is being viewed AND that changes are
 * saved to that day — with one tap back to today. Leaving through a tab or
 * after 30 minutes away also returns to today (B0, dayStore).
 */
export function DaySwitcher({ className = '' }: { className?: string }) {
  const { t, i18n } = useTranslation();
  const selected = useDay((s) => s.selected);
  const shift = useDay((s) => s.shift);
  const setDay = useDay((s) => s.setDay);
  const reset = useDay((s) => s.reset);
  const isToday = selected === today();
  const label = isToday ? t('common.today') : formatDate(selected, i18n.language, 'weekdayShort');

  return (
    <div className={`mb-5 ${className}`} data-testid="day-switcher">
      <div className="flex items-center gap-1 rounded-ui-pill border border-white/[0.08] bg-surface-card p-1">
        <IconButton icon="chevronLeft" label={t('day.previous')} onClick={() => shift(-1)} className="border-transparent" />
        <label className="relative flex min-h-ui-hit flex-1 cursor-pointer items-center justify-center rounded-ui-pill text-[15px] font-semibold">
          <span data-testid="day-switcher-label">{label}</span>
          <input
            type="date"
            value={selected}
            max={today()}
            onChange={(e) => e.target.value && setDay(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            aria-label={t('day.pick')}
          />
        </label>
        <IconButton icon="chevron" label={t('day.next')} onClick={() => !isToday && shift(1)} disabled={isToday} className="border-transparent disabled:opacity-30" />
      </div>
      {!isToday && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-ui-control bg-warn/[0.1] px-3 py-2" role="status" data-testid="day-switcher-notice">
          <p className="text-[13px] leading-snug text-earth">{t('day.viewingPast', { date: label })}</p>
          <button type="button" onClick={reset} className="hit-44 shrink-0 text-[14px] font-semibold text-brand-hover" data-testid="day-switcher-today">
            {t('day.backToToday')}
          </button>
        </div>
      )}
    </div>
  );
}
