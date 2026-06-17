import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { addDays, today } from '@/lib/utils';

/** Compact previous/next day stepper for the coach read-only views (can't go past today). */
export function CoachDayNav({ date, onChange }: { date: string; onChange: (next: string) => void }) {
  const { t, i18n } = useTranslation();
  const todayKey = today();
  const label = (() => {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(i18n.language, { weekday: 'short', month: 'short', day: 'numeric' });
  })();
  return (
    <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-surface-card px-2 py-2">
      <button type="button" className="icon-btn h-10 w-10" aria-label={t('activity.prevDay')} onClick={() => onChange(addDays(date, -1))}>
        <Icon name="chevronLeft" size={20} className={i18n.dir() === 'rtl' ? 'rotate-180' : ''} />
      </button>
      <div className="text-center">
        <div className="font-mono text-[11px] uppercase tracking-[0.08em] text-brand">{date === todayKey ? t('common.today') : label}</div>
        {date !== todayKey && <div className="text-[11px] text-earth-subtle">{label}</div>}
      </div>
      <button
        type="button"
        className="icon-btn h-10 w-10 disabled:opacity-30"
        aria-label={t('activity.nextDay')}
        disabled={date >= todayKey}
        onClick={() => onChange(addDays(date, 1))}
      >
        <Icon name="chevron" size={20} className={i18n.dir() === 'rtl' ? 'rotate-180' : ''} />
      </button>
    </div>
  );
}
