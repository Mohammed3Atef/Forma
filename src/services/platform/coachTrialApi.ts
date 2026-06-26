import { getCoachPlan, markTrialNotified, trialDaysLeft } from './coachPlanApi';
import { notify } from './notificationsApi';
import type { CoachPlan } from '@/types';

/**
 * Trial-expiry reminders at 7 / 3 / 1 days left (Phase 1).
 *
 * Runs on coach app foreground (reusing the existing visibilitychange /
 * refreshAccount pattern) — no cron needed. For each threshold crossed it raises
 * ONE coach notification and sets the matching `trialNotified` flag so it never
 * fires twice. The flag write is the only mutation a coach may make to their own
 * `coachPlans` doc besides the usage counter.
 *
 * Returns the most-urgent reminder threshold just fired (for an optional toast),
 * or null when nothing fired.
 */
const THRESHOLDS: { days: number; key: 'd7' | 'd5' | 'd3' | 'd1' }[] = [
  { days: 7, key: 'd7' },
  { days: 5, key: 'd5' },
  { days: 3, key: 'd3' },
  { days: 1, key: 'd1' },
];

export async function checkTrialExpiry(coachId: string, plan?: CoachPlan | null): Promise<'d7' | 'd5' | 'd3' | 'd1' | null> {
  try {
    const p = plan ?? (await getCoachPlan(coachId));
    // Reminders fire for the trial AND paid terms (any active plan with an end date).
    if (!p || p.status !== 'active') return null;
    const left = trialDaysLeft(p);
    if (left == null) return null;

    // Fire the most-urgent threshold that has been reached and not yet sent.
    // (If a coach skips a window — e.g. doesn't open the app for days — the
    // earliest-still-unsent reminder still fires once on next foreground.)
    let fired: 'd7' | 'd5' | 'd3' | 'd1' | null = null;
    for (const th of THRESHOLDS) {
      const already = p.trialNotified?.[th.key] === true;
      if (left <= th.days && !already) {
        await markTrialNotified(coachId, th.key);
        await notify({
          clientId: coachId, // coach's own clientData notifications inbox
          forRole: 'coach',
          type: 'trial_expiring',
          route: '/coach/dashboard',
          createdBy: coachId,
          body: String(Math.max(0, left)),
        });
        fired = th.key;
      }
    }
    return fired;
  } catch (e) {
    console.warn('[coachTrial] expiry check failed (non-fatal):', e);
    return null;
  }
}
