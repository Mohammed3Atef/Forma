import crypto from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from '../_lib/mongodb';
import { addMonths } from '../coach-clients/_data';
import type { SubscriptionDoc, SubscriptionStatus } from '../coach-clients/_types';
import type { SignupInviteDoc } from './_types';

const SUB_DAY = 86_400_000;
/** Default invite lifetime (14 days) — mirrors `inviteApi.ts`'s `DEFAULT_TTL_MS`. */
export const DEFAULT_TTL_MS = 14 * SUB_DAY;
/** Human-friendly, unambiguous invite code alphabet (no 0/O/1/I/L). */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export async function invitesCol(): Promise<Collection<SignupInviteDoc>> {
  return (await getDb()).collection<SignupInviteDoc>('signupInvites');
}

/** Port of `generateInviteCode()` — uses `crypto.randomInt` for uniform selection. */
export function generateInviteCode(len = 8): string {
  let out = '';
  for (let i = 0; i < len; i += 1) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

/** Normalizes a user-supplied code the same way `getInvite()` did (`trim().toUpperCase()`). */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

/** True when an invite is currently claimable — port of `isClaimable()`. */
export function isClaimable(invite: SignupInviteDoc | null, now = Date.now()): boolean {
  if (!invite) return false;
  if (invite.status !== 'pending') return false;
  if (invite.expiresAt != null && invite.expiresAt <= now) return false;
  return true;
}

/**
 * Build the client `Subscription` written onto the `coachClients` relationship
 * when an invite is claimed — exact port of `buildClaimSubscription()`. Note it
 * deliberately does NOT set `frozenFrom`/`frozenUntil` (unlike
 * `buildSubscription()` in coach-clients/_data.ts) — that asymmetry exists in
 * the source-of-truth Firestore code and is preserved here on purpose.
 */
export function buildClaimSubscription(invite: SignupInviteDoc, now = Date.now()): SubscriptionDoc {
  const status: SubscriptionStatus = invite.subStatus ?? 'trial';
  const base: SubscriptionDoc = {
    startAt: now,
    endAt: now,
    status,
    updatedAt: now,
    ...(invite.subPlanName ? { planName: invite.subPlanName } : {}),
    ...(invite.subPrice != null ? { price: invite.subPrice } : {}),
    ...(invite.subCurrency ? { currency: invite.subCurrency } : {}),
    ...(invite.subBillingCycle ? { billingCycle: invite.subBillingCycle } : {}),
  };
  if (status === 'trial') return { ...base, endAt: now + (invite.subTrialDays ?? 14) * SUB_DAY };
  if (status === 'active') {
    if (invite.subDays != null && invite.subDays > 0) return { ...base, endAt: now + invite.subDays * SUB_DAY };
    const months = invite.subMonths ?? 1;
    return { ...base, months, endAt: addMonths(now, months) };
  }
  return base; // pending / other: no active term yet — coach configures after claim.
}
