import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout } from '@/stores/workoutStore';
import { useDay } from '@/stores/dayStore';
import { IconButton } from '@/components/ui/Button';
import { ListGroup, ListRow, Section } from '@/components/ui/ListRow';
import { logSetCount, logExerciseCount } from '@/lib/calc';
import { weekdayInitials, weekdayOffset } from '@/lib/utils';
import { formatDate, formatDuration, formatNumber } from '@/lib/format';

/*
 * TRAIN › HISTORY (B2.3): a month calendar (finished days marked — not
 * tonnage intensity, RM-45) and the month's sessions. Opening a session shows
 * it read-only; the app-wide day returns to today on the next tab tap or after
 * 30 minutes (B0), and Today always shows today.
 */
export function History() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const plan = useWorkout((s) => s.plan);
  const logs = useWorkout((s) => s.logs);
  const setDay = useDay((s) => s.setDay);

  const now = new Date();
  const [cursor, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const finished = useMemo(() => logs.filter((l) => l.finished), [logs]);
  const monthPrefix = `${cursor.y}-${String(cursor.m + 1).padStart(2, '0')}`;
  const isCurrentMonth = cursor.y === now.getFullYear() && cursor.m === now.getMonth();
  const todayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const workoutDays = useMemo(() => {
    const m = new Map<number, (typeof finished)[number]>();
    finished.forEach((l) => {
      if (l.date.startsWith(monthPrefix)) m.set(Number(l.date.slice(8, 10)), l);
    });
    return m;
  }, [finished, monthPrefix]);
  const monthSessions = useMemo(() => finished.filter((l) => l.date.startsWith(monthPrefix)).sort((a, b) => b.date.localeCompare(a.date)), [finished, monthPrefix]);

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const leadingBlanks = weekdayOffset(new Date(cursor.y, cursor.m, 1).getDay());
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = formatDate(new Date(cursor.y, cursor.m, 1), lang, 'monthYear');
  const shift = (delta: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const openDay = (date: string) => {
    setDay(date);
    navigate('/workout/session');
  };

  return (
    <div className="space-y-7" data-testid="client-history">
      <section className="rounded-ui-surface border border-white/[0.07] bg-surface-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <IconButton icon="chevronLeft" label={t('common.previousMonth')} onClick={() => shift(-1)} className="border-transparent" />
          <span className="text-[16px] font-semibold">{monthLabel}</span>
          <IconButton icon="chevron" label={t('common.nextMonth')} onClick={() => shift(1)} disabled={isCurrentMonth} className="border-transparent disabled:opacity-30" />
        </div>
        <div className="grid grid-cols-7 gap-1">
          {weekdayInitials(lang).map((d, i) => (
            <div key={i} className="pb-1 text-center text-[12px] font-medium text-earth-subtle">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />;
            const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
            const log = workoutDays.get(day);
            const isToday = date === todayKey;
            return (
              <button
                key={i}
                type="button"
                disabled={!log}
                onClick={() => log && openDay(date)}
                aria-label={log ? `${formatDate(date, lang, 'weekdayDayMonth')} · ${plan?.days.find((x) => x.id === log.dayId)?.title ?? t('workout.session')}` : String(day)}
                className={`relative flex aspect-square min-h-10 flex-col items-center justify-center rounded-ui-control text-[14px] tabular-nums ${
                  log ? 'bg-success/[0.16] font-semibold text-earth' : 'text-earth-muted'
                } ${isToday ? 'ring-1 ring-inset ring-brand/70' : ''}`}
              >
                {formatNumber(day, lang)}
                {log && <span className="mt-0.5 h-1 w-1 rounded-full bg-success" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
      </section>

      <Section title={t('history.count', { count: monthSessions.length })}>
        {monthSessions.length === 0 ? (
          <p className="text-[15px] text-earth-muted">{t('history.empty')}</p>
        ) : (
          <ListGroup>
            {monthSessions.map((l) => {
              const day = plan?.days.find((x) => x.id === l.dayId);
              return (
                <ListRow
                  key={l.id}
                  onClick={() => openDay(l.date)}
                  leading={
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-ui-control bg-white/[0.06]">
                      <span className="font-mono text-[15px] font-semibold leading-none">{formatNumber(Number(l.date.slice(8, 10)), lang)}</span>
                      <span className="mt-0.5 text-[11px] text-earth-muted">{formatDate(l.date, lang, 'weekdayAbbrev')}</span>
                    </span>
                  }
                  title={day?.title ?? t('workout.session')}
                  meta={`${t('today.exercises', { count: logExerciseCount(l) })} · ${t('today.sets', { count: logSetCount(l) })} · ${formatDuration(l.durationSec)}`}
                  chevron
                />
              );
            })}
          </ListGroup>
        )}
      </Section>
    </div>
  );
}
