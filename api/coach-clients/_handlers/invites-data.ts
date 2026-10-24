import crypto from 'node:crypto';
import type { Collection } from 'mongodb';
import { getDb } from '../../_lib/mongodb.js';
import { buildTerm } from '../_terms.js';
import type { SubscriptionDoc, SubscriptionStatus } from '../_types.js';
import type { SignupInviteDoc } from './invites-types.js';

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
 * when an invite is claimed. The term starts on the claim day. B3.8: fixed-day
 * calendar terms (1 month = 30 days) in the zone the coach created the invite in
 * (`subZone`; Egypt when absent) — see `buildTerm`. A pending invite term has no
 * dates; the coach sets them after the claim.
 */
export function buildClaimSubscription(invite: SignupInviteDoc, now = Date.now()): SubscriptionDoc {
  const status: SubscriptionStatus = invite.subStatus ?? 'trial';
  return buildTerm(
    {
      status,
      zone: invite.subZone,
      ...(invite.subMonths != null ? { months: invite.subMonths } : {}),
      ...(invite.subDays != null ? { days: invite.subDays } : {}),
      ...(invite.subTrialDays != null ? { trialDays: invite.subTrialDays } : {}),
      ...(invite.subPrice != null ? { price: invite.subPrice } : {}),
      ...(invite.subPlanName ? { planName: invite.subPlanName } : {}),
      ...(invite.subBillingCycle ? { billingCycle: invite.subBillingCycle } : {}),
    },
    now,
  );
}
