import { addMonths } from '@/lib/subscription';
import { ApiError, apiDelete, apiGet, apiPost } from '@/services/platformApi';
import type { BillingCycle, SignupInvite, Subscription, SubscriptionStatus } from '@/types';

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

/** Human-friendly, unambiguous invite code (no 0/O/1/I/L). Codes are actually minted server-side on create; kept here for any caller that still wants a client-side preview code. */
export function generateInviteCode(len = 8): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  const arr = new Uint32Array(len);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(arr);
    for (let i = 0; i < len; i += 1) out += alphabet[arr[i] % alphabet.length];
  } else {
    for (let i = 0; i < len; i += 1) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

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
  const doc = await apiPost<SignupInviteApiDoc>('/coach-clients/invites', body);
  return fromApiDoc(doc);
}

/** Read one invite by code (public pre-auth lookup; the code is the capability). */
export async function getInvite(code: string): Promise<SignupInvite | null> {
  try {
    const doc = await apiGet<SignupInviteApiDoc>(`/coach-clients/invites/${encodeURIComponent(code.trim().toUpperCase())}`);
    return fromApiDoc(doc);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/** Pending (and not-expired) invites for a coach, newest first. */
export async function listPendingInvites(coachId: string): Promise<SignupInvite[]> {
  const docs = await apiGet<SignupInviteApiDoc[]>(
    `/coach-clients/invites?coachId=${encodeURIComponent(coachId)}&status=pending`,
  );
  return docs.map(fromApiDoc);
}

/** Coach revokes a pending invite (cannot be claimed afterwards). */
export async function revokeInvite(code: string): Promise<void> {
  await apiDelete(`/coach-clients/invites/${encodeURIComponent(code)}`);
}

/** True when an invite is currently claimable. */
export function isClaimable(invite: SignupInvite | null, now = Date.now()): boolean {
  if (!invite) return false;
  if (invite.status !== 'pending') return false;
  if (invite.expiresAt != null && invite.expiresAt <= now) return false;
  return true;
}

/**
 * Claim an invite for the freshly-created client (single-use).
 *
 * SUPERSEDED: claiming is now an atomic, all-or-nothing server operation —
 * `POST /api/invites/claim` (see `AcceptInvite.tsx`) creates the client's
 * account AND flips the invite to `claimed` in one request. There is no
 * standalone "flip this already-created uid's invite to claimed" endpoint
 * anymore, so this can no longer be called on its own. Kept only so any
 * lingering caller still type-checks against the original signature.
 */
export async function claimInvite(_code: string, _uid: string): Promise<void> {
  throw new Error(
    '[inviteApi] claimInvite() is superseded by POST /api/invites/claim, which claims the invite as part of ' +
      'creating the client account. Call the claim flow in AcceptInvite.tsx instead of claimInvite() directly.',
  );
}

/**
 * Best-effort rollback of a claim if a later step of the join fails.
 *
 * SUPERSEDED: the same reasoning as `claimInvite()` above — the server-side
 * claim endpoint already rolls itself back atomically on failure, so there is
 * no standalone unclaim endpoint to call from the frontend.
 */
export async function unclaimInvite(code: string): Promise<void> {
  console.warn(
    `[inviteApi] unclaimInvite(${code}) is a no-op: POST /api/invites/claim now rolls back its own claim ` +
      'on failure server-side, so the frontend never needs to unclaim manually.',
  );
}

/**
 * Build the client Subscription written onto the coachClients relationship when
 * an invite is claimed — derived from the coach's invite settings so no invited
 * client is ever assigned without a subscription state. Defaults to a 14-day trial.
 *
 * Purely client-side math (exact mirror of the server's `buildClaimSubscription`
 * in `api/invites/_data.ts`) — kept for any caller that wants to preview the
 * subscription an invite will produce; `POST /api/invites/claim` computes and
 * persists the authoritative copy itself.
 */
export function buildClaimSubscription(invite: SignupInvite, now = Date.now()): Subscription {
  const status: SubscriptionStatus = invite.subStatus ?? 'trial';
  const DAY = 86_400_000;
  const base: Subscription = {
    startAt: now,
    endAt: now,
    status,
    updatedAt: now,
    ...(invite.subPlanName ? { planName: invite.subPlanName } : {}),
    ...(invite.subPrice != null ? { price: invite.subPrice } : {}),
    ...(invite.subCurrency ? { currency: invite.subCurrency } : {}),
    ...(invite.subBillingCycle ? { billingCycle: invite.subBillingCycle } : {}),
  };
  if (status === 'trial') return { ...base, endAt: now + (invite.subTrialDays ?? 14) * DAY };
  if (status === 'active') {
    if (invite.subDays != null && invite.subDays > 0) return { ...base, endAt: now + invite.subDays * DAY };
    const months = invite.subMonths ?? 1;
    return { ...base, months, endAt: addMonths(now, months) };
  }
  return base; // pending / other: no active term yet — coach configures after claim.
}
