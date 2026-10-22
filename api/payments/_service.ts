import crypto from 'node:crypto';
import type { ClientSession } from 'mongodb';
import { TRPCError } from '@trpc/server';
import { withDbTransaction } from '../_lib/mongodb.js';
import { CommercialReason } from '../_lib/commercialReason.js';
import { coachClientsCol, relId } from '../coach-clients/_data.js';
import type { CoachClientDoc } from '../coach-clients/_types.js';
import { clientPaymentsCol, paymentTermLocksCol } from './_data.js';
import { balanceOf, termsOfRelationship } from './_ledger.js';
import type { ClientPaymentDoc, PaymentMethod } from './_types.js';

/**
 * B3.8 (owner decision 1) — recording, reversing and correcting manually recorded client
 * payments. Every write is one transaction; every write is idempotent on its `requestId`.
 * See `_types.ts` for the rules.
 */

export interface PaymentActor {
  id: string;
  role: 'coach' | 'admin';
}

export interface PaymentEntry {
  clientId: string;
  /** A term id of this relationship, `'current'` for the current term, or null for none. */
  termId: string | null;
  amountMinor: number;
  method: PaymentMethod;
  paidAt: number;
  reference?: string;
  note?: string;
}

const EARLIEST_PAYMENT = Date.UTC(2020, 0, 1);
/** A payment cannot be dated in the future (a little clock skew is tolerated). */
const FUTURE_SLACK_MS = 10 * 60_000;

function refuse(code: 'NOT_FOUND' | 'CONFLICT' | 'BAD_REQUEST', reason: string, message: string): TRPCError {
  return new TRPCError({ code, message, cause: new CommercialReason(reason) });
}
const isDuplicateKey = (e: unknown) => !!e && typeof e === 'object' && (e as { code?: number }).code === 11000;
const keyOf = (e: unknown) => JSON.stringify((e as { keyPattern?: unknown }).keyPattern ?? {});

function checkDate(paidAt: number, now: number) {
  if (!Number.isFinite(paidAt) || paidAt < EARLIEST_PAYMENT || paidAt > now + FUTURE_SLACK_MS) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'A payment date must be today or earlier' });
  }
}

/**
 * Resolve the term a payment is for, inside the transaction. `'current'` on a term written before
 * B3.8 gives it its id now (compare-and-set, so a concurrent term change wins and this one retries).
 */
async function resolveTerm(rel: CoachClientDoc, termId: string | null, now: number, session: ClientSession): Promise<{ termId: string; priceMinor: number } | null> {
  if (termId === null) return null;
  if (termId === 'current') {
    const cur = rel.subscription;
    if (!cur || cur.status === 'pending') throw refuse('NOT_FOUND', 'TERM_NOT_FOUND', 'This client has no package to pay for');
    if (!cur.termId) {
      const id = crypto.randomUUID();
      const col = await coachClientsCol();
      const done = await col.updateOne({ _id: rel._id, 'subscription.updatedAt': cur.updatedAt, 'subscription.termId': null }, { $set: { 'subscription.termId': id, 'subscription.updatedAt': now } }, { session });
      if (done.matchedCount === 0) throw new TRPCError({ code: 'CONFLICT', message: 'The package changed meanwhile. Reload and try again', cause: new CommercialReason('SUBSCRIPTION_CHANGED') });
      return { termId: id, priceMinor: termsOfRelationship({ subscription: { ...cur, termId: id } })[0]?.priceMinor ?? 0 };
    }
    termId = cur.termId;
  }
  const term = termsOfRelationship(rel).find((t) => t.termId === termId);
  if (!term) throw refuse('NOT_FOUND', 'TERM_NOT_FOUND', "That package is not one of this client's packages");
  return { termId: term.termId, priceMinor: term.priceMinor };
}

/** Insert a payment after checking it fits in what its term still owes. Inside a transaction. */
async function insertPayment(actor: PaymentActor, rel: CoachClientDoc, entry: PaymentEntry, extra: Partial<ClientPaymentDoc>, requestId: string, now: number, session: ClientSession): Promise<ClientPaymentDoc> {
  const payments = await clientPaymentsCol();
  const term = await resolveTerm(rel, entry.termId, now, session);
  if (term) {
    // Serialise every payment on this term: two racing payments write the same lock document, so
    // one transaction aborts and retries — and then sees the other's payment in the balance.
    const locks = await paymentTermLocksCol();
    await locks.updateOne({ _id: `${rel._id}:${term.termId}` }, { $inc: { seq: 1 }, $set: { updatedAt: now } }, { upsert: true, session });
    const live = await payments.find({ relationshipId: rel._id, termId: term.termId, kind: 'payment', reversedById: { $exists: false } }, { session, projection: { amountMinor: 1 } }).toArray();
    const paid = live.reduce((n, p) => n + p.amountMinor, 0);
    const { outstandingMinor } = balanceOf(term.priceMinor, paid);
    if (entry.amountMinor > outstandingMinor) {
      throw refuse('CONFLICT', 'PAYMENT_EXCEEDS_BALANCE', outstandingMinor === 0 ? 'Nothing is left to pay on this package' : 'This is more than what is left to pay on this package');
    }
  }
  const doc: ClientPaymentDoc = {
    _id: crypto.randomUUID(),
    kind: 'payment',
    coachId: rel.coachId,
    clientId: rel.clientId,
    relationshipId: rel._id,
    termId: term?.termId ?? null,
    amountMinor: entry.amountMinor,
    currency: 'EGP',
    method: entry.method,
    paidAt: entry.paidAt,
    ...(entry.reference ? { reference: entry.reference } : {}),
    ...(entry.note ? { note: entry.note } : {}),
    ...extra,
    requestId,
    createdBy: actor.id,
    createdByRole: actor.role,
    createdAt: now,
  };
  await payments.insertOne(doc, { session });
  return doc;
}

/** Void a payment with a reversal record (at most once). Inside a transaction. */
async function insertReversal(actor: PaymentActor, coachId: string, paymentId: string, reason: string, requestId: string, now: number, session: ClientSession): Promise<{ original: ClientPaymentDoc; reversal: ClientPaymentDoc }> {
  const payments = await clientPaymentsCol();
  const original = await payments.findOne({ _id: paymentId, coachId }, { session });
  if (!original || original.kind !== 'payment') throw refuse('NOT_FOUND', 'PAYMENT_NOT_FOUND', 'Payment not found');
  if (original.reversedById) throw refuse('CONFLICT', 'PAYMENT_ALREADY_REVERSED', 'This payment was already reversed');
  const reversal: ClientPaymentDoc = {
    _id: crypto.randomUUID(),
    kind: 'reversal',
    coachId,
    clientId: original.clientId,
    relationshipId: original.relationshipId,
    termId: original.termId,
    amountMinor: original.amountMinor,
    currency: 'EGP',
    method: original.method,
    paidAt: now,
    reversesId: original._id,
    reason,
    requestId,
    createdBy: actor.id,
    createdByRole: actor.role,
    createdAt: now,
  };
  await payments.insertOne(reversal, { session });
  const marked = await payments.updateOne({ _id: original._id, reversedById: { $exists: false } }, { $set: { reversedById: reversal._id, reversedAt: now } }, { session });
  if (marked.matchedCount === 0) throw refuse('CONFLICT', 'PAYMENT_ALREADY_REVERSED', 'This payment was already reversed');
  return { original, reversal };
}

async function ownRelationship(coachId: string, clientId: string, session?: ClientSession): Promise<CoachClientDoc> {
  const rels = await coachClientsCol();
  const rel = await rels.findOne({ _id: relId(coachId, clientId) }, { session });
  if (!rel || rel.coachId !== coachId) throw new TRPCError({ code: 'NOT_FOUND', message: 'Client not found' });
  return rel;
}

/** The record an already-applied request produced (idempotent replay), or null. */
async function replayed(coachId: string, requestId: string): Promise<ClientPaymentDoc | null> {
  return (await clientPaymentsCol()).findOne({ coachId, requestId });
}

/** Run a ledger write; a lost race on the same request id returns the winner's record. */
async function idempotent(coachId: string, requestId: string, write: () => Promise<ClientPaymentDoc>): Promise<ClientPaymentDoc> {
  const prior = await replayed(coachId, requestId);
  if (prior) return prior;
  try {
    return await write();
  } catch (e) {
    if (isDuplicateKey(e)) {
      if (keyOf(e).includes('requestId')) {
        const winner = await replayed(coachId, requestId);
        if (winner) return winner;
      }
      if (keyOf(e).includes('reversesId')) throw refuse('CONFLICT', 'PAYMENT_ALREADY_REVERSED', 'This payment was already reversed');
    }
    throw e;
  }
}

/** Record a payment the coach says they received. */
export async function recordPayment(actor: PaymentActor, entry: PaymentEntry, requestId: string): Promise<ClientPaymentDoc> {
  const now = Date.now();
  checkDate(entry.paidAt, now);
  await clientPaymentsCol(); // indexes before the transaction
  return idempotent(actor.id, requestId, () =>
    withDbTransaction(async (session) => {
      const rel = await ownRelationship(actor.id, entry.clientId, session);
      return insertPayment(actor, rel, entry, {}, requestId, now, session);
    }),
  );
}

/** Void a payment entered by mistake. Returns the reversal record. */
export async function reversePayment(actor: PaymentActor, paymentId: string, reason: string, requestId: string): Promise<ClientPaymentDoc> {
  const now = Date.now();
  await clientPaymentsCol();
  return idempotent(actor.id, requestId, () =>
    withDbTransaction(async (session) => (await insertReversal(actor, actor.id, paymentId, reason, requestId, now, session)).reversal),
  );
}

/**
 * Correct a payment: reverse it and record the right one, atomically. The new payment is checked
 * against its term's balance WITHOUT the payment it replaces. Returns the new payment.
 */
export async function correctPayment(actor: PaymentActor, paymentId: string, entry: Omit<PaymentEntry, 'clientId'>, reason: string, requestId: string): Promise<ClientPaymentDoc> {
  const now = Date.now();
  checkDate(entry.paidAt, now);
  await clientPaymentsCol();
  return idempotent(actor.id, requestId, () =>
    withDbTransaction(async (session) => {
      const { original } = await insertReversal(actor, actor.id, paymentId, reason, `${requestId}:reversal`, now, session);
      const rel = await ownRelationship(actor.id, original.clientId, session);
      return insertPayment(actor, rel, { ...entry, clientId: original.clientId }, { correctsId: original._id }, requestId, now, session);
    }),
  );
}

/** A coach's payment records (payments and reversals), newest first. */
export async function listPayments(coachId: string, clientId?: string): Promise<ClientPaymentDoc[]> {
  const col = await clientPaymentsCol();
  return col.find({ coachId, ...(clientId ? { clientId } : {}) }).sort({ paidAt: -1, createdAt: -1 }).limit(5000).toArray();
}
