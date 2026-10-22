import type { PillTone } from '@/components/ui/Pill';
import type { AssessmentStatus, CheckInStatus, ClientTransferRequest } from '@/types';
import type { ClientState } from '@/lib/coachDirectory';

/**
 * One status vocabulary (B3.9, VS-10): the tone of every status, one map per domain, so the same
 * state never reads green on one screen and orange on another. `Pill` / `StatusChip` take these.
 *  - ok = running / done · warn = needs attention soon · bad = stopped or refused · mute = nothing yet
 *  - info = informational — a TRIAL is info, not brand (VS-05: the brand orange is kept for the one
 *    action per view)
 *  - brand = waiting on the coach (a submitted check-in or assessment)
 */

/** A client's package with their coach (and the admin's view of it). */
export const SUBSCRIPTION_TONE: Record<string, PillTone> = {
  none: 'mute',
  trial: 'info',
  active: 'ok',
  pending: 'warn',
  frozen: 'warn',
  expired: 'bad',
  cancelled: 'bad',
  ended: 'bad',
};

/** An account's own status (the person, not the package). */
export const ACCOUNT_TONE: Record<string, PillTone> = {
  active: 'ok',
  pending: 'warn',
  suspended: 'bad',
  disabled: 'bad',
};

/** The coach directory's one package state per client. */
export const CLIENT_STATE_TONE: Record<ClientState, PillTone> = {
  active: 'ok',
  trial: 'info',
  expiring: 'warn',
  paused: 'warn',
  expired: 'bad',
  pending: 'warn',
  none: 'mute',
};

/** A coach's own Forma plan (admin screens). */
export const COACH_PLAN_TONE: Record<string, PillTone> = {
  trial: 'info',
  active: 'ok',
  expired: 'bad',
  suspended: 'bad',
  none: 'mute',
};

export const CHECKIN_TONE: Record<CheckInStatus, PillTone> = {
  requested: 'warn',
  submitted: 'brand',
  reviewed: 'ok',
};

export const ASSESSMENT_TONE: Record<AssessmentStatus, PillTone> = {
  not_started: 'mute',
  in_progress: 'warn',
  submitted: 'brand',
  reviewed: 'ok',
  updated_after_review: 'warn',
};

export const TRANSFER_TONE: Record<ClientTransferRequest['status'], PillTone> = {
  pending: 'warn',
  accepted: 'ok',
  rejected: 'bad',
  cancelled: 'mute',
};

/** The same tone as plain text (a value in a field, not a pill) — AA-safe on the card surface. */
export const TONE_TEXT: Record<PillTone, string> = {
  ok: 'text-success',
  warn: 'text-warn',
  bad: 'text-danger-text',
  info: 'text-info',
  brand: 'text-brand',
  mute: 'text-earth-subtle',
};
