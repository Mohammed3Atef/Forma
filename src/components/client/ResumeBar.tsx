import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from '@/components/Icon';
import { useWorkout } from '@/stores/workoutStore';
import { useTimer } from '@/stores/timerStore';
import { useElapsed } from '@/hooks/useElapsed';
import { formatDuration } from '@/lib/format';
import { isClientTaskFlow } from '@/config/clientNav';

/** True while a started, unfinished session exists (the bar's condition). */
export function useWorkoutInProgress(): boolean {
  return useWorkout((s) => !!(s.active && s.active.startedAt && !s.active.finished));
}

/**
 * "Workout in progress · 23:14 · Resume" (B2 / NAV-C03, doc 05 rule 9): a
 * running session is always one tap away and never depends on browser
 * history. While a rest timer runs it shows the countdown instead. Hidden on
 * the session itself, on task flows and on the chat (the composer owns the
 * bottom of that screen).
 */
export function ResumeBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const inProgress = useWorkoutInProgress();
  const startedAt = useWorkout((s) => (s.active && !s.active.finished ? s.active.startedAt ?? null : null));
  const elapsed = useElapsed(inProgress ? startedAt : null);
  const rest = useTimer((s) => ((s.running || s.paused) ? s.remainingSec : null));
  if (!inProgress || isClientTaskFlow(pathname) || pathname === '/messages') return null;
  const resting = rest != null;
  return (
    <div className="pointer-events-none fixed inset-x-3 z-ui-nav bottom-[calc(var(--shell-bottom-clearance)+0.5rem)] lg:inset-x-auto lg:bottom-6 lg:end-8 lg:start-[calc(15rem+2rem)]">
      <button
        type="button"
        data-testid="resume-bar"
        onClick={() => navigate('/workout/session')}
        className="pointer-events-auto mx-auto flex min-h-14 w-full max-w-xl items-center gap-3 rounded-ui-surface border border-white/[0.1] bg-surface-raised/95 px-4 text-start shadow-ui-sticky backdrop-blur-md"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-brand text-brand-ink">
          <Icon name={resting ? 'timer' : 'dumbbell'} size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-semibold">{resting ? t('client.resume.resting') : t('client.resume.inProgress')}</span>
          <span className="t-numeric block text-[13px] text-earth-muted" dir="ltr">
            {formatDuration(resting ? rest : elapsed)}
          </span>
        </span>
        <span className="shrink-0 text-[14px] font-semibold text-brand-hover">{t('client.resume.cta')}</span>
      </button>
    </div>
  );
}
