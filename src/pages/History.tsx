import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useWorkout } from '@/stores/workoutStore';
import { useDay } from '@/stores/dayStore';
import { Icon } from '@/components/Icon';
import { TopBar } from '@/components/TopBar';
import { logVolume, logSetCount, logExerciseCount } from '@/lib/calc';
import { formatDuration, weekdayOffset } from '@/lib/utils';

// Week starts on Saturday: Sat, Sun, Mon, Tue, Wed, Thu, Fri.
const WEEKDAYS = ['S', 'S', 'M', 'T', 'W', 'T', 'F'];

export function History() {
  const { t, i18n } = useTranslation();
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

  const monthSessions = useMemo(
    () => finished.filter((l) => l.date.startsWith(monthPrefix)).sort((a, b) => b.date.localeCompare(a.date)),
    [finished, monthPrefix],
  );
  const monthVolume = monthSessions.reduce((v, l) => v + logVolume(l), 0);

  const daysInMonth = new Date(cursor.y, cursor.m + 1, 0).getDate();
  const leadingBlanks = weekdayOffset(new Date(cursor.y, cursor.m, 1).getDay());
  const cells: (number | null)[] = [...Array(leadingBlanks).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const monthLabel = new Date(cursor.y, cursor.m, 1).toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', {
    month: 'long',
    year: 'numeric',
  });

  const shift = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c.y, c.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const openDay = (date: string) => {
    setDay(date);
    navigate('/workout/session');
  };

  return (
    <div className="anim-rise">
      <TopBar title={t('gt.history')} eyebrow={t('gt.yourLog')} onBack={() => navigate('/progress')} />

      {/* Calendar */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={() => shift(-1)} className="icon-btn h-9 w-9" aria-label="previous month">
            <Icon name="chevronLeft" size={18} />
          </button>
          <span className="font-display text-base font-semibold">{monthLabel}</span>
          <button
            type="button"
            onClick={() => !isCurrentMonth && shift(1)}
            disabled={isCurrentMonth}
            className="icon-btn h-9 w-9 disabled:opacity-30"
            aria-label="next month"
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((d, i) => (
            <div key={i} className="pb-1 text-center font-mono text-[10px] uppercase tracking-[0.04em] text-earth-subtle">
              {d}
            </div>
          ))}
          {cells.map((day, i) => {
            if (day == null) return <div key={i} />;
            const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
            const hasWorkout = workoutDays.has(day);
            const isToday = date === todayKey;
            return (
              <button
                key={i}
                type="button"
                disabled={!hasWorkout}
                onClick={() => hasWorkout && openDay(date)}
                className={`flex aspect-square flex-col items-center justify-center rounded-xl text-sm ${
                  hasWorkout ? 'bg-brand/15 font-medium text-white' : 'text-earth-muted'
                } ${isToday ? 'ring-1.5 ring-brand' : ''}`}
                style={isToday ? { boxShadow: 'inset 0 0 0 1.5px #AE7E56' } : undefined}
              >
                {day}
                {hasWorkout && <span className="mt-0.5 h-1 w-1 rounded-full bg-brand" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Month sessions */}
      <div className="sec-head">
        <h2 className="h2">{t('gt.workoutsN', { n: monthSessions.length })}</h2>
        <span className="font-mono text-[12px] text-brand">{(monthVolume / 1000).toFixed(1)}t</span>
      </div>
      <div>
        {monthSessions.map((l) => {
          const d = new Date(cursor.y, cursor.m, Number(l.date.slice(8, 10)));
          const day = plan?.days.find((x) => x.id === l.dayId);
          return (
            <button key={l.id} type="button" onClick={() => openDay(l.date)} className="row w-full text-start">
              <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl border border-line bg-surface-raised">
                <span className="font-mono text-sm font-medium leading-none">{Number(l.date.slice(8, 10))}</span>
                <span className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.06em] text-earth-subtle">
                  {d.toLocaleDateString(i18n.language === 'ar' ? 'ar-EG' : 'en-US', { weekday: 'short' }).slice(0, 3)}
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[15px] font-medium tracking-[-0.01em]">{day?.title ?? t('workout.session')}</p>
                <p className="font-mono text-[11.5px] text-earth-muted">
                  {logExerciseCount(l)} {t('gt.exercises').toLowerCase()} · {logSetCount(l)} {t('common.sets')} · {formatDuration(l.durationSec)}
                </p>
              </div>
              <span className="font-mono text-[12px] text-brand">{(logVolume(l) / 1000).toFixed(1)}t</span>
            </button>
          );
        })}
        {monthSessions.length === 0 && <p className="py-8 text-center text-sm text-earth-muted">{t('progress.noData')}</p>}
      </div>
    </div>
  );
}
