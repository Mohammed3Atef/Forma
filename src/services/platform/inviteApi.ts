import { trpc, TRPCClientError } from '@/services/trpc';
import type { BillingCycle, PublicInvite, SignupInvite, SubscriptionStatus } from '@/types';

/**
 * Client invitations — now backed by `/api/invites/*` (Mongo `signupInvites`
 * collection) instead of Firestore's `signupInvites/{code}`. Same flow as
 * before: a coach generates a single-use code -> shares the link
 * `${origin}/invite/{code}` -> the visitor claims it (`AcceptInvite.tsx`, via
 * `POST /api/invites/claim`), which flips it to `claimed` and auto-assigns
 * them to the coach. The code is still the capability: `GET /api/invites/:code`
 * is public, but only the owning coach (or an admin) may create/revoke.
 *
 * The Mongo doc's `_id` IS the code (mirrors the Firestore doc-id convention);
 * `fromApiDoc` below maps that back onto the frontend's `code` field so every
 * exported function here keeps returning the same `SignupInvite` shape.
 */

/** Wire shape returned by `/api/invites/*` — `_id` is the code. */
interface SignupInviteApiDoc {
  _id: string;
  coachId: string;
  coachName?: string;
  email?: string;
  displayName?: string;
  phone?: string;
  subStatus?: SubscriptionStatus;
  subPlanName?: string;
  subPrice?: number;
  subCurrency?: string;
  subBillingCycle?: BillingCycle;
  subMonths?: number;
  subDays?: number;
  subTrialDays?: number;
  status: SignupInvite['status'];
  claimedByUid?: string | null;
  createdAt: number;
  claimedAt?: number | null;
  expiresAt?: number | null;
  /** Only present on `GET /api/invites/:code` — computed server-side `isClaimable()`. */
  claimable?: boolean;
}

function fromApiDoc(doc: SignupInviteApiDoc): SignupInvite {
  const { _id, claimable: _claimable, ...rest } = doc;
  return { code: _id, ...rest };
}

/** Default invite lifetime (14 days) — mirrors the backend's `DEFAULT_TTL_MS`. */
const DEFAULT_TTL_MS = 14 * 86_400_000;

export interface CreateInviteInput {
  /** Coach display name, denormalised onto the invite for the pre-auth claim screen. */
  coachName?: string;
  email?: string;
  displayName?: string;
  phone?: string;
  // Client subscription chosen by the coach (applied on claim). Defaults to trial.
  subStatus?: SubscriptionStatus;
  subPlanName?: string;
  subPrice?: number;
  subCurrency?: string;
  subBillingCycle?: BillingCycle;
  subMonths?: number;
  subDays?: number; // active term in days (coach plan with unit='days')
  subTrialDays?: number;
  /** Override the default TTL; pass null for a non-expiring invite. */
  ttlMs?: number | null;
}

/** Build the shareable invite link for a code (uses the current origin). */
export function inviteLink(code: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${origin}/invite/${code}`;
}

/** Coach generates a new pending invite. Returns the created record. */
export async function createInvite(coachId: string, input: CreateInviteInput = {}): Promise<SignupInvite> {
  const body = {
    // Only honored server-side for an admin (`coaches.assign`) caller — a coach
    // always creates their own invites regardless of this field.
    coachId,
    ...(input.email?.trim() ? { email: input.email.trim() } : {}),
    ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
    ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
    subStatus: input.subStatus ?? 'trial',
    ...(input.subPlanName?.trim() ? { subPlanName: input.subPlanName.trim() } : {}),
    ...(input.subPrice != null ? { subPrice: input.subPrice } : {}),
    ...(input.subCurrency?.trim() ? { subCurrency: input.subCurrency.trim() } : {}),
    ...(input.subBillingCycle ? { subBillingCycle: input.subBillingCycle } : {}),
    ...(input.subMonths != null ? { subMonths: input.subMonths } : {}),
    ...(input.subDays != null ? { subDays: input.subDays } : {}),
    ...(input.subTrialDays != null ? { subTrialDays: input.subTrialDays } : {}),
    ttlMs: input.ttlMs === undefined ? DEFAULT_TTL_MS : input.ttlMs,
  };
  const doc = await trpc.invites.create.mutate(body);
  return fromApiDoc(doc);
}

/**
 * Read one invite by code (public pre-auth lookup; the code is the capability).
 * B3.0.1 / B3-S03: only the claim-screen fields come back — see `PublicInvite`.
 */
export async function getInvite(code: string): Promise<PublicInvite | null> {
  try {
    const doc = await trpc.invites.getByCode.query({ code: code.trim().toUpperCase() });
    return {
      code: doc._id,
      status: doc.status,
      claimable: doc.claimable,
      expiresAt: doc.expiresAt,
      ...(doc.coachName ? { coachName: doc.coachName } : {}),
      ...(doc.displayName ? { displayName: doc.displayName } : {}),
      hasEmail: doc.hasEmail,
      ...(doc.emailHint ? { emailHint: doc.emailHint } : {}),
    };
  } catch (e) {
    if (e instanceof TRPCClientError && e.data?.code === 'NOT_FOUND') return null;
    throw e;
  }
}

/** Pending (and not-expired) invites for a coach, newest first. */
export async function listPendingInvites(coachId: string): Promise<SignupInvite[]> {
  const docs = await trpc.invites.list.query({ coachId, status: 'pending' });
  return docs.map(fromApiDoc);
}

/** Coach revokes a pending invite (cannot be claimed afterwards). */
export async function revokeInvite(code: string): Promise<void> {
  await trpc.invites.revoke.mutate({ code });
}

/** True when an invite is currently claimable. */
export function isClaimable(invite: Pick<SignupInvite, 'status' | 'expiresAt'> | null, now = Date.now()): boolean {
  if (!invite) return false;
  if (invite.status !== 'pending') return false;
  if (invite.expiresAt != null && invite.expiresAt <= now) return false;
  return true;
}

