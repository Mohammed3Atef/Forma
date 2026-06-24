import { collection, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { ensureFirebase } from '@/data/adapters/firebase/firebase';
import { addMonths } from '@/lib/subscription';
import type { BillingCycle, SignupInvite, Subscription, SubscriptionStatus } from '@/types';

/**
 * Client invitations (Phase 1), at `signupInvites/{code}`.
 *
 * Flow: a coach generates a single-use code → shares the link `${origin}/invite/{code}`
 * → the visitor signs up (sets their own password) and CLAIMS the invite, which
 * flips it to `claimed` and auto-assigns them to the coach. The code is the
 * capability: rules let any signed-in user READ a minimal invite payload, but
 * only the owning coach may create/revoke, and only the claiming client may flip
 * it to `claimed` (once, while `pending`, honoring `expiresAt`).
 */

const INVITES = 'signupInvites';
/** Default invite lifetime (14 days). */
const DEFAULT_TTL_MS = 14 * 86_400_000;

/** Human-friendly, unambiguous invite code (no 0/O/1/I/L). */
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
  const { db } = ensureFirebase();
  const now = Date.now();
  const ttl = input.ttlMs === undefined ? DEFAULT_TTL_MS : input.ttlMs;
  // Retry on the (vanishingly unlikely) code collision.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateInviteCode();
    const ref = doc(db, INVITES, code);
    if ((await getDoc(ref)).exists()) continue;
    const invite: SignupInvite = {
      code,
      coachId,
      status: 'pending',
      claimedByUid: null,
      createdAt: now,
      claimedAt: null,
      expiresAt: ttl === null ? null : now + ttl,
      ...(input.coachName?.trim() ? { coachName: input.coachName.trim() } : {}),
      ...(input.email?.trim() ? { email: input.email.trim() } : {}),
      ...(input.displayName?.trim() ? { displayName: input.displayName.trim() } : {}),
      ...(input.phone?.trim() ? { phone: input.phone.trim() } : {}),
      subStatus: input.subStatus ?? 'trial',
      ...(input.subPlanName?.trim() ? { subPlanName: input.subPlanName.trim() } : {}),
      ...(input.subPrice != null ? { subPrice: input.subPrice } : {}),
      ...(input.subCurrency?.trim() ? { subCurrency: input.subCurrency.trim() } : {}),
      ...(input.subBillingCycle ? { subBillingCycle: input.subBillingCycle } : {}),
      ...(input.subMonths != null ? { subMonths: input.subMonths } : {}),
      ...(input.subTrialDays != null ? { subTrialDays: input.subTrialDays } : {}),
    };
    await setDoc(ref, invite);
    return invite;
  }
  throw new Error('Could not allocate a unique invite code');
}

/** Read one invite by code (any signed-in user; the code is the capability). */
export async function getInvite(code: string): Promise<SignupInvite | null> {
  const { db } = ensureFirebase();
  const snap = await getDoc(doc(db, INVITES, code.trim().toUpperCase()));
  return snap.exists() ? (snap.data() as SignupInvite) : null;
}

/** Pending (and not-expired) invites for a coach, newest first. */
export async function listPendingInvites(coachId: string): Promise<SignupInvite[]> {
  const { db } = ensureFirebase();
  const snap = await getDocs(query(collection(db, INVITES), where('coachId', '==', coachId), where('status', '==', 'pending')));
  const now = Date.now();
  return snap.docs
    .map((d) => d.data() as SignupInvite)
    .filter((i) => i.expiresAt == null || i.expiresAt > now)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Coach revokes a pending invite (cannot be claimed afterwards). */
export async function revokeInvite(code: string): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, INVITES, code), { status: 'revoked', updatedAt: Date.now() });
}

/** True when an invite is currently claimable. */
export function isClaimable(invite: SignupInvite | null, now = Date.now()): boolean {
  if (!invite) return false;
  if (invite.status !== 'pending') return false;
  if (invite.expiresAt != null && invite.expiresAt <= now) return false;
  return true;
}

/**
 * Claim an invite for the freshly-created client (single-use). Flips status to
 * `claimed` and stamps `claimedByUid`/`claimedAt`. Rules only permit this when
 * the invite is still `pending` and `claimedByUid == auth.uid`, so concurrent
 * claims are rejected for everyone but the first writer.
 */
export async function claimInvite(code: string, uid: string): Promise<void> {
  const { db } = ensureFirebase();
  await updateDoc(doc(db, INVITES, code), {
    status: 'claimed',
    claimedByUid: uid,
    claimedAt: Date.now(),
  });
}

/** Best-effort rollback of a claim if a later step of the join fails. */
export async function unclaimInvite(code: string): Promise<void> {
  try {
    const { db } = ensureFirebase();
    await updateDoc(doc(db, INVITES, code), {
      status: 'pending',
      claimedByUid: deleteField(),
      claimedAt: null,
    });
  } catch (e) {
    console.warn('[invite] unclaim failed (non-fatal):', e);
  }
}

/**
 * Build the client Subscription written onto the coachClients relationship when
 * an invite is claimed — derived from the coach's invite settings so no invited
 * client is ever assigned without a subscription state. Defaults to a 14-day trial.
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
    const months = invite.subMonths ?? 1;
    return { ...base, months, endAt: addMonths(now, months) };
  }
  return base; // pending / other: no active term yet — coach configures after claim.
}
