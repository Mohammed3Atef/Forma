import { useTranslation } from 'react-i18next';
import { dayKey, weekStartOf } from '@/lib/utils';

export interface WeekStripDay {
  key: string;
  done: boolean;
}

/**
 * Horizontal week-at-a-glance strip (Sat→Fri, this app's training week — see
 * WEEK_STARTS_ON): today gets the brand gradient fill, days with a logged
 * workout get a subtle success border, everything else stays neutral. Purely
 * a status glance — tapping a cell isn't wired to anything (unlike, say, the
 * history calendar) since Today's own hero already covers "go do something".
 */
export function WeekStrip({ doneDates }: { doneDates: Set<string> }) {
  const { i18n } = useTranslation();
  const start = weekStartOf(new Date());
  const todayKey = dayKey();
  const days: WeekStripDay[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return { key: dayKey(d), done: doneDates.has(dayKey(d)) };
  });

  return (
    <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {days.map((d) => {
        const date = new Date(`${d.key}T00:00:00`);
        const isToday = d.key === todayKey;
        const label = date.toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short' });
        return (
          <div
            key={d.key}
            className={`flex w-11 shrink-0 flex-col items-center gap-0.5 rounded-xl py-2 ${
              isToday ? 'bg-gradient-brand' : d.done ? 'border border-success/40' : 'border border-line bg-surface-card'
            }`}
          >
            <p className={`font-mono text-[9px] uppercase tracking-[0.07em] ${isToday ? 'text-brand-ink/70' : 'text-earth-subtle'}`}>{label}</p>
            <p className={`num text-[15px] ${isToday ? 'text-brand-ink' : d.done ? 'text-success' : 'text-earth-muted'}`}>{date.getDate()}</p>
          </div>
        );
      })}
    </div>
  );
}
