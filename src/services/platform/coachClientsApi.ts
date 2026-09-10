import { ApiError, apiGet, apiPatch, apiPost } from '@/services/platformApi';
import type {
  BillingCycle,
  CoachClientRelationship,
  CoachSubscriptionPlan,
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

export async function listRelationshipsForCoach(coachId: string): Promise<CoachClientRelationship[]> {
  const docs = await apiGet<CoachClientApiDoc[]>(
    `/coach-clients?coachId=${encodeURIComponent(coachId)}&status=active`,
  );
  return docs.map(fromApiDoc);
}

/** Every relationship a coach has ever had (active, ended, pending) — for revenue/churn dashboards. */
export async function listAllRelationshipsForCoach(coachId: string): Promise<CoachClientRelationship[]> {
  const docs = await apiGet<CoachClientApiDoc[]>(
    `/coach-clients?coachId=${encodeURIComponent(coachId)}&status=all`,
  );
  return docs.map(fromApiDoc);
}

/**
 * Writes ONLY the relationship doc — used when a coach creates their own
 * client (the client's `assignedCoachId` is set at account creation).
 *
 * NOTE: the migrated `POST /api/coach-clients` (the only assign endpoint the
 * backend exposes) always ALSO sets the client's `assignedCoachId`, unlike the
 * Firestore-era version of this function — there is no "link only" endpoint.
 * This is unused by any current component; kept for signature compatibility.
 */
export async function linkCoachClient(coachId: string, clientId: string, _createdBy: string): Promise<void> {
  await apiPost('/coach-clients', {
    clientId,
    coachId,
    subscription: { status: 'trial' as SubscriptionStatus, trialDays: 14 },
  });
}

/** Assigns a client to a coach (idempotent on the deterministic id). */
export async function assignClientToCoach(coachId: string, clientId: string, _createdBy: string): Promise<void> {
  await apiPost('/coach-clients', {
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
  await apiPatch(`/coach-clients/${encodeURIComponent(relId(coachId, clientId))}`, {
    action: 'end',
    reason: 'unassigned',
  });
}

// ---- subscription (lives on the relationship; coach-owned, client-readable) ----

export async function getRelationship(coachId: string, clientId: string): Promise<CoachClientRelationship | null> {
  try {
    const doc = await apiGet<CoachClientApiDoc>(`/coach-clients/${encodeURIComponent(relId(coachId, clientId))}`);
    return fromApiDoc(doc);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

async function patchSubscription(coachId: string, clientId: string, sub: Record<string, unknown>): Promise<void> {
  await apiPatch(`/coach-clients/${encodeURIComponent(relId(coachId, clientId))}`, { action: 'subscription', sub });
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

/** Map a coach-defined plan (+ the coach's default currency) to an assign input. */
export function planToSubscriptionInput(plan: CoachSubscriptionPlan, currency?: string): ClientSubscriptionInput {
  const money = {
    ...(typeof plan.price === 'number' ? { price: plan.price } : {}),
    ...(currency ? { currency } : {}),
    planName: plan.name,
  };
  if (plan.isTrial) {
    return { status: 'trial', trialDays: plan.unit === 'months' ? plan.duration * 30 : plan.duration, ...money };
  }
  return { status: 'active', ...(plan.unit === 'days' ? { days: plan.duration } : { months: plan.duration }), ...money };
}

/**
 * The client's CURRENT active coach (if any), resolved from `coachClients`.
 */
export async function getClientAssignment(
  clientId: string,
): Promise<{ coachId: string; rel: CoachClientRelationship } | null> {
  const docs = await apiGet<CoachClientApiDoc[]>(`/coach-clients?clientId=${encodeURIComponent(clientId)}`);
  const active = docs.map(fromApiDoc).find((r) => r.status === 'active');
  return active ? { coachId: active.coachId, rel: active } : null;
}

/** Every coaching relationship a client has had (newest first) — the timeline source. */
export async function listClientCoachHistory(clientId: string): Promise<CoachClientRelationship[]> {
  const docs = await apiGet<CoachClientApiDoc[]>(`/coach-clients?clientId=${encodeURIComponent(clientId)}`);
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
  await apiPost('/coach-clients', { clientId, coachId, subscription: sub });
}

/**
 * A coach releases their OWN client: the Forma account and all client-owned data
 * stay intact and the client becomes re-assignable.
 */
export async function releaseClient(coachId: string, clientId: string, _by: string): Promise<void> {
  await apiPatch(`/coach-clients/${encodeURIComponent(relId(coachId, clientId))}`, {
    action: 'end',
    reason: 'released',
  });
}

/**
 * FRESH START — archiving + clearing the previous coach's plan/notes/targets
 * content is now handled automatically, SERVER-SIDE, inside
 * `transferClientWithMode` (`api/coach-clients/_service.ts`) as one atomic
 * step of the transfer itself: when `mode === 'fresh_start'`, the backend
 * copies the client's workout/nutrition/cardio plan docs, coach notes, and
 * coach-set targets into the `archivedClientData` collection (tagged with the
 * previous coach id + an archive timestamp), then deletes the live docs,
 * before reassigning the client. There is nothing left for the frontend to
 * trigger — this is a deliberate permanent no-op, kept only so any existing
 * call site still compiles/behaves unchanged. No call site invokes it today.
 */
export async function archiveAndClearCoachData(_clientId: string, _by: string): Promise<void> {
  // Intentional no-op — see the doc comment above.
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
  await apiPatch(`/coach-clients/${encodeURIComponent(relId(fromCoachId, clientId))}`, {
    action: 'transfer',
    toCoachId,
    mode,
    subscriptionHandling,
    ...(newSub ? { newSubscription: newSub } : {}),
  });
}
