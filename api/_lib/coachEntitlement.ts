import { TRPCError } from '@trpc/server';
import { CommercialReason } from './commercialReason.js';
import { getDb } from './mongodb.js';

/**
 * B3.8 (owner decision 4, "P2", 2026-10-21) — a coach whose Forma plan has lapsed (expired) or was
 * suspended by an admin is READ-ONLY, enforced here on the server for every coach write; the app's
 * disabled states only mirror it.
 *
 * Authoritative state: the `coachPlans` document read at the moment of each write (never a cached
 * or client-sent flag), folded the same way everywhere (`coachPlanState`): `suspended`, or an
 * `endsAt` in the past / a status other than `active` → expired. Admin and client callers are
 * never affected.
 *
 * B3.8 final (owner decision B38F-R3, 2026-10-22): a coach with NO plan document is read-only too
 * (`none` → `NO_SUBSCRIPTION`) — default-deny, so a missing document can never bypass the rule.
 * Every creation path writes the trial in the same transaction as the account; the recovery and
 * activation paths (`coachPlans.createTrial`, `coachPlanRequests.submitSubscription`) stay allowed.
 */
export type CoachWriteState = 'ok' | 'expired' | 'suspended' | 'none';

interface PlanLike {
  status?: string;
  endsAt?: number | null;
}

export function writeStateOf(plan: PlanLike | null | undefined, now = Date.now()): CoachWriteState {
  if (!plan) return 'none';
  if (plan.status === 'suspended') return 'suspended';
  if (plan.endsAt != null && now >= plan.endsAt) return 'expired';
  if (plan.status !== 'active') return 'expired';
  return 'ok';
}

export async function coachWriteState(coachId: string, now = Date.now()): Promise<CoachWriteState> {
  const plan = await (await getDb()).collection<PlanLike & { _id: string }>('coachPlans').findOne({ _id: coachId }, { projection: { status: 1, endsAt: 1 } });
  return writeStateOf(plan, now);
}

export const LAPSED_MESSAGES: Record<Exclude<CoachWriteState, 'ok'>, string> = {
  expired: 'Your Forma subscription has ended. Renew it to keep coaching; you can still read everything.',
  suspended: 'Your Forma subscription is suspended. Contact the Forma team; you can still read everything.',
  none: 'You have no Forma plan yet. Start your trial or subscribe to start coaching; you can still read everything.',
};

const LAPSED_REASONS = { expired: 'SUBSCRIPTION_EXPIRED', suspended: 'SUBSCRIPTION_SUSPENDED', none: 'NO_SUBSCRIPTION' } as const;

export function lapsedError(state: Exclude<CoachWriteState, 'ok'>): TRPCError {
  // PRECONDITION_FAILED, never CONFLICT / FORBIDDEN: those mean "plan conflict" and "not your
  // client" to the app, and the refusal must read as "renew Forma".
  return new TRPCError({ code: 'PRECONDITION_FAILED', message: LAPSED_MESSAGES[state], cause: new CommercialReason(LAPSED_REASONS[state]) });
}

/** Refuse a write by a coach whose Forma plan is lapsed, suspended or missing. No-op for anyone else. */
export async function assertCoachCanWrite(user: { id: string; role: string; accountStatus?: string } | null | undefined): Promise<void> {
  if (!user || user.role !== 'coach') return;
  const state = await coachWriteState(user.id);
  if (state !== 'ok') throw lapsedError(state);
}

/**
 * The coach mutations a lapsed or suspended coach may STILL make — everything else a coach can
 * call is refused by default, including any procedure added later (default-deny):
 *  - account & sign-in: every `auth.*` (profile, password, sign-out, token refresh…);
 *  - Forma recovery: request / cancel a Forma subscription request, the idempotent trial bootstrap;
 *  - passive reads that write a marker: messages / notifications marked read, usage telemetry;
 *  - protecting the client: releasing a client, resolving a transfer request about a client who is
 *    leaving (reject, cancel, or accept — the RECEIVING coach's plan is still checked), withdrawing
 *    an open invite;
 *  - help & support: the contact form.
 * Pinned by `b38CoachP2.test.ts`.
 */
export const LAPSED_COACH_ALLOWED: ReadonlySet<string> = new Set([
  'auth.changePassword',
  'auth.confirmPasswordReset',
  'auth.googleSignIn',
  'auth.login',
  'auth.logout',
  'auth.refresh',
  'auth.requestPasswordReset',
  'auth.signup',
  'auth.updateProfile',
  'coachPlanRequests.submitSubscription',
  'coachPlanRequests.cancel',
  'coachPlans.createTrial',
  'messages.markRead',
  'notifications.markRead',
  'usage.bump',
  'usage.recordActiveDay',
  'coachClients.end',
  'transfers.resolve',
  'invites.revoke',
  'contact.submit',
]);

/**
 * Gated INSIDE the procedure instead, after its idempotent replay: a message already delivered
 * before the plan lapsed is acknowledged to the device that retries it, never reported as refused.
 */
export const GATED_IN_HANDLER: ReadonlySet<string> = new Set(['messages.send']);
