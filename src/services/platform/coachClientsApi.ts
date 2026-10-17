import { trpc, TRPCClientError } from '@/services/trpc';
import type {
  BillingCycle,
  CoachClientRelationship,
  Subscription,
  SubscriptionPeriod,
  SubscriptionStatus,
  TransferMode,
  TransferSubHandling,
} from '@/types';

/**
 * Coach<->client relationships — now backed by `/api/coach-clients/*` (Mongo
 * `coachClients` collection) instead of Firestore's `coachClients/{coachId__clientId}`.
 *
 * The Mongo doc's `_id` IS the deterministic `${coachId}__${clientId}` id
 * (same convention as Firestore); `fromApiDoc` below maps that back onto the
 * frontend's `id` field so every exported function here keeps returning the
 * same `CoachClientRelationship` shape.
 *
 * The migrated backend (`api/coach-clients/index.ts` + `[id].ts`) exposes four
 * mutations — assign an unassigned client (`POST`), end a relationship
 * (`PATCH action:'end'`), admin/super-admin reassignment
 * (`PATCH action:'transfer'`), and in-place subscription mutation
 * (`PATCH action:'subscription'`, gated to the owning coach or an admin with
 * `clients.writeAll`) — the seven functions below all go through that last one.
 */

/** Wire shape returned by `/api/coach-clients/*` — `_id` is `${coachId}__${clientId}`. */
interface CoachClientApiDoc {
  _id: string;
  coachId: string;
  clientId: string;
  status: CoachClientRelationship['status'];
  subscription?: Subscription;
  subscriptionHistory?: SubscriptionPeriod[];
  inviteCode?: string;
  endedAt?: number;
  endedBy?: string;
  endReason?: 'released' | 'transferred' | 'unassigned';
  mode?: TransferMode;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

function fromApiDoc(doc: CoachClientApiDoc): CoachClientRelationship {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest };
}

/** Deterministic relationship id so rules can `exists()` it without a query. */
export function relId(coachId: string, clientId: string): string {
  return `${coachId}__${clientId}`;
}

/** Every relationship a coach has ever had (active, ended, pending) — for revenue/churn dashboards. */
export async function listAllRelationshipsForCoach(coachId: string): Promise<CoachClientRelationship[]> {
  const docs = await trpc.coachClients.list.query({ coachId, status: 'all' });
  return docs.map(fromApiDoc);
}

/**
 * B3.3: the coach's ACTIVE relationships without the audit trail, archived
 * terms or invite code (`view: 'summary'`) — what Today and Clients need,
 * small enough to refresh every minute on a large roster.
 */
export async function listActiveRelationshipsSummary(coachId: string): Promise<CoachClientRelationship[]> {
  const docs = await trpc.coachClients.list.query({ coachId, status: 'active', view: 'summary' });
  return docs.map(fromApiDoc);
}

/** Assigns a client to a coach (idempotent on the deterministic id). */
export async function assignClientToCoach(coachId: string, clientId: string, _createdBy: string): Promise<void> {
  await trpc.coachClients.assign.mutate({
    clientId,
    coachId,
    // The Firestore-era version wrote no subscription at all; the migrated
    // endpoint requires one, so this uses the same "no term yet" `pending`
    // state `buildSubscription()` falls back to — the coach sets a real term
    // afterwards via the subscription panel.
    subscription: { status: 'pending' as SubscriptionStatus },
  });
}

/**
 * Moves a client from one coach to another (ends the old link, opens a new one).
 *
 * Unused by any current component (superseded by `transferClientWithMode`,
 * which the admin transfer wizard actually calls). Kept for signature
 * compatibility, implemented as a thin "transfer with no explicit subscription
 * handling" call against the same admin-only endpoint `transferClientWithMode` uses.
 */
export async function transferClient(
  clientId: string,
  fromCoachId: string | undefined,
  toCoachId: string,
  createdBy: string,
): Promise<void> {
  await transferClientWithMode(clientId, fromCoachId, toCoachId, 'keep_plans', 'keep', createdBy);
}

/** Removes a client's coach assignment. */
export async function unassignClient(clientId: string, coachId: string, _createdBy: string): Promise<void> {
  await trpc.coachClients.end.mutate({ id: relId(coachId, clientId), reason: 'unassigned' });
}

// ---- subscription (lives on the relationship; coach-owned, client-readable) ----

export async function getRelationship(coachId: string, clientId: string): Promise<CoachClientRelationship | null> {
  try {
    const doc = await trpc.coachClients.get.query({ id: relId(coachId, clientId) });
    return fromApiDoc(doc);
  } catch (e) {
    if (e instanceof TRPCClientError && e.data?.code === 'NOT_FOUND') return null;
    throw e;
  }
}

async function patchSubscription(coachId: string, clientId: string, sub: Parameters<typeof trpc.coachClients.updateSubscription.mutate>[0]['sub']): Promise<void> {
  await trpc.coachClients.updateSubscription.mutate({ id: relId(coachId, clientId), sub });
}

/** Set (or reset) the subscription term: starts active, ends after `months`/`days`. */
export async function setSubscriptionTerm(
  coachId: string,
  clientId: string,
  startAt: number,
  term: { months?: number; days?: number },
  price?: number,
  currency?: string,
  planName?: string,
): Promise<void> {
  await patchSubscription(coachId, clientId, { op: 'setTerm', startAt, ...term, price, currency, planName });
}

/** Set/update the subscription price in place. */
export async function setSubscriptionPrice(coachId: string, clientId: string, price: number, currency?: string): Promise<void> {
  await patchSubscription(coachId, clientId, { op: 'setPrice', price, currency });
}

/** Freeze the subscription for [from, until). */
export async function freezeSubscription(coachId: string, clientId: string, from: number, until: number, note?: string): Promise<void> {
  await patchSubscription(coachId, clientId, { op: 'freeze', from, until, note });
}

/** Lift a freeze and resume the subscription. */
export async function unfreezeSubscription(coachId: string, clientId: string): Promise<void> {
  await patchSubscription(coachId, clientId, { op: 'unfreeze' });
}

/** End the subscription now. */
export async function endSubscription(coachId: string, clientId: string): Promise<void> {
  await patchSubscription(coachId, clientId, { op: 'end' });
}

/** Cancel the subscription now. */
export async function cancelSubscription(coachId: string, clientId: string): Promise<void> {
  await patchSubscription(coachId, clientId, { op: 'cancel' });
}

/** Extend the term by N days. */
export async function extendSubscription(coachId: string, clientId: string, days: number): Promise<void> {
  await patchSubscription(coachId, clientId, { op: 'extend', days });
}

// ---- existing-client lifecycle (assign / release / transfer / timeline) ------

/**
 * Subscription the coach picks when assigning an existing client (CASE 1) or an
 * admin creates a new term on transfer. Mirrors the invite chooser so a client is
 * NEVER assigned without an explicit subscription state.
 */
export interface ClientSubscriptionInput {
  status: SubscriptionStatus; // 'trial' | 'active' | 'pending' (others valid for transfer)
  months?: number; // active term length in months
  days?: number; // active term length in days (coach plan with unit='days'); takes priority over months
  trialDays?: number; // trial length (default 14)
  price?: number;
  currency?: string;
  planName?: string;
  billingCycle?: BillingCycle;
  startAt?: number; // defaults to now
}

/**
 * The client's CURRENT active coach (if any), resolved from `coachClients`.
 */
export async function getClientAssignment(
  clientId: string,
): Promise<{ coachId: string; rel: CoachClientRelationship } | null> {
  const docs = await trpc.coachClients.list.query({ clientId });
  const active = docs.map(fromApiDoc).find((r) => r.status === 'active');
  return active ? { coachId: active.coachId, rel: active } : null;
}

/** Every coaching relationship a client has had (newest first) — the timeline source. */
export async function listClientCoachHistory(clientId: string): Promise<CoachClientRelationship[]> {
  const docs = await trpc.coachClients.list.query({ clientId });
  return docs.map(fromApiDoc).sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * CASE 1 — a coach assigns an UNASSIGNED existing client to themselves, with a
 * required subscription. Port of the server's `assignExistingClient` (via
 * `POST /api/coach-clients`).
 */
export async function assignExistingClient(
  coachId: string,
  clientId: string,
  _createdBy: string,
  sub: ClientSubscriptionInput,
): Promise<void> {
  await trpc.coachClients.assign.mutate({ clientId, coachId, subscription: sub });
}

/**
 * A coach releases their OWN client: the Forma account and all client-owned data
 * stay intact and the client becomes re-assignable.
 */
export async function releaseClient(coachId: string, clientId: string, _by: string): Promise<void> {
  await trpc.coachClients.end.mutate({ id: relId(coachId, clientId), reason: 'released' });
}

/**
 * Admin/super-admin transfer with an explicit mode + subscription handling.
 * Port of the server's `transferClientWithMode` (via
 * `PATCH /api/coach-clients/:id` with `action: 'transfer'`) — admin-only
 * (`coaches.assign`; `clients.writeAll` additionally required for
 * `mode: 'fresh_start'`), so `fromCoachId` must identify an existing
 * relationship (this is only ever called once a client already has a coach —
 * see `TransferWizard.tsx`).
 */
export async function transferClientWithMode(
  clientId: string,
  fromCoachId: string | undefined,
  toCoachId: string,
  mode: TransferMode,
  subscriptionHandling: TransferSubHandling,
  _by: string,
  newSub?: ClientSubscriptionInput,
): Promise<void> {
  if (!fromCoachId) {
    throw new Error('[coachClientsApi] transferClientWithMode() requires an existing fromCoachId relationship to PATCH.');
  }
  await trpc.coachClients.transfer.mutate({
    id: relId(fromCoachId, clientId),
    toCoachId,
    mode,
    subscriptionHandling,
    ...(newSub ? { newSubscription: newSub } : {}),
  });
}
